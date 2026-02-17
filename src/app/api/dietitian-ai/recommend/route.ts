// gym-tracker-app\src\app\api\dietitian-ai\recommend\route.ts

import { callGeminiWithFallback } from '@/lib/ai-client';
import { getDietitianContext } from '@/lib/aiDaily';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API Key' }), { status: 401 });

    const isCustomKey = !!customKey;

    const { userProfile, preferences, currentContext: clientContext, favorites, history, userId } = await req.json();

    // --- שליפת נתונים מה-DB (עוקף RLS בעזרת Service Key) ---
    let dbContext = null;
    if (userId) {
      try {
        dbContext = await getDietitianContext(userId);
      } catch (e) {
        console.error("Error fetching dietitian context:", e);
      }
    }

    // מיזוג נתונים: עדיפות ל-DB > קליינט > 0
    const eatenCals = dbContext?.today?.calories ?? clientContext?.eatenCalories ?? 0;
    const eatenProt = dbContext?.today?.protein ?? clientContext?.eatenProtein ?? 0;
    const eatenCarbs = dbContext?.today?.carbs ?? 0;
    const eatenFats = dbContext?.today?.fats ?? 0;

    const targetCals = dbContext?.targets?.calories || clientContext?.targetCalories || 0;
    const targetProt = dbContext?.targets?.protein || clientContext?.targetProtein || 0;
    const targetCarbs = dbContext?.targets?.carbs || 0;
    const targetFats = dbContext?.targets?.fats || 0;

    // חישוב יתרות
    const remCals = parseFloat((targetCals - eatenCals).toFixed(1));
    const remProt = parseFloat((targetProt - eatenProt).toFixed(1));
    const remCarbs = parseFloat((targetCarbs - eatenCarbs).toFixed(1));
    const remFats = parseFloat((targetFats - eatenFats).toFixed(1));

    const hebrewGender = userProfile?.gender === 'female' ? 'נקבה' : 'זכר';
    const favStr = favorites?.map((f: any) => f.meal_name).join(', ') || "None";
    
    const weeklyReviewHtml = preferences?.last_weekly_analysis_html || 'No recent weekly review available.';
    const currentTime = new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit', timeZone: 'Asia/Jerusalem'});

    const conversationHistory = history?.map((msg: any) => 
        `${msg.role === 'user' ? 'User' : 'Dietitian'}: ${msg.content}`
    ).join('\n') || 'No previous conversation.';

    const prompt = `
      You are a specialized Clinical Dietitian AI.
      Language: Hebrew (he-IL) ONLY.
      Tone: Professional, direct, concise, yet encouraging.

      **REAL-TIME STATUS (User: ${hebrewGender}, Time: ${currentTime}):**
      - Calories: ${eatenCals} / ${targetCals} (Left: ${remCals})
      - Protein: ${eatenProt}g / ${targetProt}g (Left: ${remProt}g)
      - Carbs: ${eatenCarbs}g / ${targetCarbs}g (Left: ${remCarbs}g)
      - Fat: ${eatenFats}g / ${targetFats}g (Left: ${remFats}g)
      
      **Context:**
      - Favorites: ${favStr}
      - Preferences: ${preferences?.cooking_preference}, ${JSON.stringify(preferences?.dietary_preferences)}
      - Weekly Review Insight: ${weeklyReviewHtml.replace(/<[^>]*>?/gm, '')}
      
      **Conversation History:**
      ${conversationHistory}
      
      **CRITICAL INSTRUCTIONS FOR LOGIC:**
      1. **Time Awareness:** Check the Current Time (${currentTime}).
         - If it is morning/noon, DO NOT try to close the entire remaining gap in one meal. Distribute macros logically for the remaining meals of the day.
         - If it is late night, recommend something light or exactly what fits the remaining gap.
         
      2. **"Can I eat X?" Scenarios (Trade-off Analysis):**
         - If the user asks about specific food (e.g., Pizza, Burger, Cake), calculate its estimated impact on the *remaining* budget.
         - Explain the trade-off clearly. Example: "Yes, you can eat a slice of pizza (~300kcal, 35g carbs), BUT it will leave you with very few carbs for dinner, so your next meal will have to be mostly protein and veggies."
         - Give the user the choice based on this data.

      3. **Conciseness:** Keep answers short. Avoid long generic intros. Get to the point.

      4. **Inventory Check:** Before giving a final recipe, briefly ask if they have the main ingredients (e.g., "Do you have eggs or tuna available?").

      5. **Portion Control:** When recommending a meal, define EXACT Single Serving quantities (e.g. "150g chicken", not "a package of chicken").

      **Output Format (JSON Only):**
      
      If chatting/analyzing/asking:
      {
        "type": "chat",
        "message": "Hebrew text here. Short and focused."
      }

      If finalizing a specific recommendation (ONLY when user agreed):
      {
        "type": "recommendation",
        "message": "Short summary:",
        "data": {
            "meal_name": "...",
            "reasoning": "Why this fits the remaining budget and time.",
            "preparation_time": "10 min",
            "macros": { "calories": 0, "protein": 0, "carbs": 0, "fat": 0 },
            "recipe_outline": "Instructions with exact weights."
        }
      }
    `;

    return await callGeminiWithFallback(apiKey, prompt, true, isCustomKey);

  } catch (error: any) {
    console.error("Dietitian Chat API Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}