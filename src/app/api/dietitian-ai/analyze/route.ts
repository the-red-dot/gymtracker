// src/app/api/dietitian-ai/analyze/route.ts

import { callGeminiWithFallback } from '@/lib/ai-client';

export const runtime = 'nodejs';
export const maxDuration = 60; // אפשור זמן ריצה ארוך יותר ב-Vercel

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API Key' }), { status: 401 });

    const isCustomKey = !!customKey;

    // קבלת הנתונים המורחבים מהקליינט
    const { 
      userProfile, 
      logs, // כאן יגיעו הלוגים הרלוונטיים (היום או השבוע האחרון)
      preferences, 
      weightHistory, 
      mode, // 'daily' | 'weekly'
      targets, // יעדים כלליים (ברירת מחדל)
      dbStatus, // נתוני ה-REAL-TIME מהטבלה user_nutrition_targets (כולל current_*)
      medicalInfo // מידע רפואי/תרופות
    } = await req.json();

    const genderTerm = userProfile?.gender === 'female' ? 'female' : 'male';
    const hebrewGender = userProfile?.gender === 'female' ? 'נקבה' : 'זכר';
    
    // שליפת שעת שינה וחישוב שעה נוכחית (IL timezone)
    const sleepTime = preferences?.schedule_info?.sleep || '23:00';
    const currentTime = new Date().toLocaleTimeString('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });

    // חישוב מדויק של גיל מתוך תאריך הלידה
    let ageStr = 'לא ידוע';
    const bDateStr = userProfile?.birth_date || userProfile?.birth_data; // תמיכה בשני השמות למקרה של טעות הקלדה ב-DB
    if (bDateStr) {
        const birthDate = new Date(bDateStr);
        if (!isNaN(birthDate.getTime())) {
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }
            ageStr = age.toString();
        }
    }

    const analysisType = mode === 'weekly' ? 'סיכום שבועי ומגמות' : 'סקירה יומית ומשוב מיידי';

    // בניית תצוגת סטטוס מדויקת (אם קיימת)
    let statusDisplay = '';
    if (dbStatus) {
        statusDisplay = `
        **REAL-TIME DASHBOARD STATUS (Most Accurate):**
        - Daily Target Calories: ${dbStatus.target_calories} (Current Eaten: ${dbStatus.current_calories})
        - Protein Target: ${dbStatus.target_protein_g}g (Current: ${dbStatus.current_protein_g}g)
        - Carbs Target: ${dbStatus.target_carbs_g}g (Current: ${dbStatus.current_carbs_g}g)
        - Fat Target: ${dbStatus.target_fat_g}g (Current: ${dbStatus.current_fat_g}g)
        - Planned Deficit: ${dbStatus.deficit_pct}%
        - TDEE: ${dbStatus.tdee}

        *CRITICAL NOTE ON TDEE*: The user's TDEE may be adaptively calibrated based on their actual 30-day historical food intake and body weight measurements. Treat this TDEE as a highly accurate, personalized hard factual datum, NOT just a generic theoretical estimate.
        `;
    } else {
        statusDisplay = `**Estimated Targets (No real-time dashboard data):** ${JSON.stringify(targets)}`;
    }

    // סידור לוגים בצורה שתאפשר ל-AI לצטט
    const logsStr = logs?.length 
      ? logs.map((l: any) => `[${l.date} ${l.time || ''}] ${l.item} (${l.cals}kcal, ${l.prot}g prot)`).join('\n') 
      : "אין נתונים מתועדים לטווח זמן זה ביומן האכילה.";

    // סידור היסטוריית משקל לניתוח מגמה
    const weightStr = weightHistory?.length 
      ? weightHistory.map((w: any) => `[${new Date(w.measured_at).toLocaleDateString()}] ${w.weight_kg}kg`).join('\n')
      : "אין נתוני שקילה.";

    // בניית הפרומפט בהתאם למצב (יומי/שבועי)
    let specificInstructions = '';
    
    if (mode === 'daily') {
      specificInstructions = `
        **Daily Review Focus (TIME AWARENESS IS CRITICAL):**
        **Current Time:** ${currentTime}
        **User Sleeps at:** ${sleepTime}
        
        1. **Contextual Analysis:** You MUST account for the time of day.
           - If it is ${currentTime} and the user sleeps at ${sleepTime}, realize the day is NOT over.
           - **DO NOT PANIC** about low calories/protein if there are many hours left until sleep.
           - Instead of saying "You are in a huge deficit!", say "You have X hours left and Y calories remaining to hit your goal."
           - Only warn about severe deficits if it is very late (close to sleep time).

        2. **Compare ACTUAL vs TARGETS:** Use the "REAL-TIME DASHBOARD STATUS" section above.
        3. **Identify immediate gaps:** based on what is reasonable to consume in the *remaining time*.
        4. **Suggest ONE specific immediate fix:** for the rest of today (if time permits) or for tomorrow.
        5. Keep it short and motivating.
      `;
    } else { // weekly
      specificInstructions = `
        **Weekly Review Focus:**
        1. **Pattern Recognition:** Analyze the Food Logs (last 7 days). Identify repeated foods or habits. Are they aligned with the "REAL-TIME DASHBOARD STATUS" goals (Macros/Calories)?
        2. **Weight vs. Deficit:** Check the "Weight History". Compare the trend to the 'Planned Deficit' in the Dashboard data. 
            - IF weight dropped & deficit matches -> Praise.
            - IF weight stalled but deficit was hit -> Explain water retention/plateau.
            - IF weight up & deficit missed -> Gently explain the correlation using the food logs as evidence.
        3. **Vitamins & Micronutrients Deep Dive:** Thoroughly analyze the food logs for vitamins and minerals. Explicitly state which vitamins/minerals they are consuming adequately (based on their food choices) and which ones are likely missing or deficient.
        4. **Age & Gender Context:** Tailor your insights specifically for a ${ageStr}-year-old ${genderTerm}. Explain how their age and gender affect their nutritional needs (e.g., iron, calcium, metabolism changes) and evaluate if their current diet supports this.
        5. **Medication/Supplements:** Consider this info: "${medicalInfo || 'None'}". If relevant, explain interaction with their diet.
      `;
    }

    const prompt = `
      You are an expert clinical dietitian AI. You are reviewing a client's data.
      **Mode:** ${analysisType}
      
      **Client Profile:**
      - Gender: ${genderTerm} (Address user as ${hebrewGender}).
      - Age: ${ageStr}
      - Activity: ${userProfile?.activityLevel || 'Unknown'}
      - Medical/Meds: ${medicalInfo || 'None'}
      
      ${statusDisplay}
      
      **Data Source - Weight History (Analyze the trend):**
      ${weightStr}
      
      **Data Source - Food Logs (Focus of this review):**
      ${logsStr}
      
      **User Preferences:**
      ${JSON.stringify(preferences)}

      **Your Instructions:**
      ${specificInstructions}

      **MANDATORY REQUIREMENTS:**
      1. **Cite Evidence:** You MUST quote specific items/dates from 'Food Logs' when giving feedback. Example: "ביום שלישי אכלת X...".
      2. **Be Concise:** Do not write long generic intros. Go straight to the point.
      3. **Simple Language:** Explain complex things simply.
      4. **Data Accuracy:** When referring to targets or deficits, ONLY use the values from "REAL-TIME DASHBOARD STATUS".
      
      **Output Structure (Hebrew HTML only):**
      
      ${mode === 'daily' ? `
        <h3>📅 סקירה יומית (${new Date().toLocaleDateString('he-IL')}) - שעה ${currentTime}</h3>
        <p>[Analysis of today's performance vs targets, CONSIDERING THE TIME LEFT]</p>
        
        <h3>🍽️ פידבק על הארוחות</h3>
        <p>[Specific comments on what was eaten, citing specific foods]</p>
        
        <h3>💡 המלצה להמשך היום / למחר</h3>
        <p>[One actionable tip based on remaining time]</p>
      ` : `
        <h3>📊 סיכום שבוע ומגמות</h3>
        <p>[Analysis of the last 7 days consistency and adherence to targets]</p>
        
        <h3>⚖️ ניתוח משקל וגרעון</h3>
        <p>[Deep dive into weight changes vs what they actually ate. Did the deficit work?]</p>
        
        <h3>🧬 צריכת ויטמינים ומינרלים</h3>
        <p>[Detailed explanation of which vitamins are well-consumed and what is missing based on the food logs]</p>
        
        <h3>👤 התאמה אישית (${hebrewGender}, גיל ${ageStr})</h3>
        <p>[Specific insights, risks, and recommendations tailored to the user's age and gender]</p>
        
        <h3>🏆 סיכום והמשך</h3>
        <p>[Actionable plan for next week, including supplement/medication advice if relevant]</p>
      `}
    `;

    return await callGeminiWithFallback(apiKey, prompt, false, isCustomKey);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}