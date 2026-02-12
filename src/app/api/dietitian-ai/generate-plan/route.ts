import { callGeminiWithFallback } from '@/lib/ai-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API Key' }), { status: 401 });

    const { userProfile, preferences, favorites, logs, targets, currentDayName } = await req.json();

    const wakeTime = preferences?.schedule_info?.wake_up || '07:00';
    const sleepTime = preferences?.schedule_info?.sleep || '23:00';
    const cookingStyle = preferences?.cooking_preference === 'quick' ? 'Quick & Easy (max 15 min)' : 'Chef/Invested';
    
    // שליפת הסקירה השבועית מתוך ההעדפות
    const weeklyReviewHtml = preferences?.last_weekly_analysis_html || 'No recent weekly review available.';
    
    // עיבוד ההיסטוריה לזיהוי דפוסים (למשל: "אוכל בבוקר בדרך כלל ביצים")
    // לוקחים מדגם מייצג מהלוגים
    const habitsStr = logs?.slice(0, 40).map((l: any) => `${l.item}`).join(', ') || "No history available";

    // המרת מועדפים לטקסט
    const favStr = favorites?.map((f: any) => f.meal_name).join(', ') || "None";

    const prompt = `
      You are an expert clinical dietitian building a highly personalized, REALISTIC, and NUTRITIONALLY ACCURATE weekly meal plan.
      
      **Context:**
      - **Current Day:** ${currentDayName} (Start the plan from THIS day).
      - **User's Eating Habits (Last Month):** ${habitsStr}. 
        *Analyze this!* If the user consistently eats specific foods (e.g., cottage cheese/eggs for breakfast), KEEP THEM in the plan unless they contradict the goals. Do not disrupt their routine unnecessarily.
      
      - **Dietitian's Latest Weekly Review (CRITICAL):**
        ${weeklyReviewHtml}
        *INSTRUCTIONS:* Read this review. Identify any mentioned deficiencies (e.g., lack of greens, missing vitamins, iron, etc.) or recommendations. You MUST incorporate specific foods into this meal plan to address these exact deficiencies.
      
      - **Nutritional Targets (Daily):**
        - Calories: ~${targets.calories} kcal
        - Protein: ~${targets.protein} g
        - Carbs: ~${targets.carbs} g
        - Fat: ~${targets.fat} g
      
      - **Constraints:**
        - Wake Up: ${wakeTime} | Sleep: ${sleepTime}.
        - Diet Type: ${JSON.stringify(preferences?.dietary_preferences || [])}
        - Cooking Style: ${cookingStyle}
        - Favorites: ${favStr}
        - Goals: ${JSON.stringify(userProfile?.goals)}

      **Task:**
      Create a 3-day meal plan starting from ${currentDayName}.
      
      **Strategy & STRICT RULES:**
      1. **Base:** Use the user's existing habits (from logs) as the skeleton.
      2. **Optimize & Heal:** Add/Swap items to meet the Macros gaps AND to address the specific vitamin/mineral deficiencies highlighted in the "Weekly Review" above.
      3. **Timing:** Schedule meals realistically between ${wakeTime} and ${sleepTime}.
      4. **MACRO ACCURACY (SUPER CRITICAL):** Calculate macronutrients exactly like a clinical dietitian using standard food databases. Do NOT inflate numbers to magically meet targets. Example: 2 slices of white bread + 2 eggs + 1 slice of cheese is roughly 25g protein, NOT 35g-40g. If the meal falls short of the target, you MUST explicitly add a high-protein ingredient to the meal description (e.g., 'added 150g greek yogurt', 'added 100g chicken breast') to justify the numbers.
      
      **Output Format (JSON):**
      {
        "days": [
          {
            "day_title": "יום רביעי" (Dynamic based on start day),
            "daily_totals": { "calories": 1800, "protein": 140, "carbs": 150, "fat": 60 },
            "daily_reasoning": "Hebrew explanation: 'Saw you usually eat X, added Y to boost protein and included Z (like Spinach) to address the iron deficiency mentioned in your weekly review...'",
            "meals": [
              { "type": "בוקר", "time": "HH:MM", "name": "...", "calories": 400, "protein": 25, "desc": "Must include specific quantities that physically add up to the macros. e.g., 2 eggs, 1 slice cheese, 150g greek yogurt." },
              ...
            ]
          }
        ],
        "summary": "Short Hebrew summary explaining the overall strategy, how it hits targets, and how it fixes the issues found in the weekly review."
      }
    `;

    return await callGeminiWithFallback(apiKey, prompt, true);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}