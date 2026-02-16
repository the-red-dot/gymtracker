// src/app/api/dietitian-ai/recommend/route.ts

import { callGeminiWithFallback } from '@/lib/ai-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API Key' }), { status: 401 });

    const isCustomKey = !!customKey;

    const { userProfile, preferences, currentContext, favorites, history } = await req.json();

    const hebrewGender = userProfile?.gender === 'female' ? 'נקבה' : 'זכר';
    const favStr = favorites?.map((f: any) => f.meal_name).join(', ') || "None";
    
    // קריאת הדוח השבועי גם לטובת המלצות בזמן אמת
    const weeklyReviewHtml = preferences?.last_weekly_analysis_html || 'No recent weekly review available.';

    // בניית היסטוריית השיחה
    const conversationHistory = history?.map((msg: any) => 
        `${msg.role === 'user' ? 'User' : 'Dietitian'}: ${msg.content}`
    ).join('\n') || 'No previous conversation.';

    const prompt = `
      You are a friendly, professional real-time clinical dietitian in a chat.
      
      **User Context:**
      - Gender: ${hebrewGender} (Address strictly as ${hebrewGender}).
      - Current Time: ${currentContext?.time}
      - Eaten Today: ${currentContext?.eatenCalories} kcal, ${currentContext?.eatenProtein}g protein.
      - Target: ${currentContext?.targetCalories} kcal, ${currentContext?.targetProtein}g protein.
      - Favorites: ${favStr}
      - Preferences: ${preferences?.cooking_preference}, ${JSON.stringify(preferences?.dietary_preferences)}
      
      **Dietitian's Weekly Review (CRITICAL):**
      ${weeklyReviewHtml}
      
      **Conversation History:**
      ${conversationHistory}
      
      **Goal:**
      Help the user decide what to eat RIGHT NOW.
      
      **Process & Rules:**
      1. **Analysis:** First, analyze the user's habits, time of day, and remaining macros. Check the Weekly Review for deficiencies (e.g., "missing greens").
      2. **Conversation:** Do NOT immediately give a final recipe if this is the start of the conversation. First, suggest a direction based on their habits (e.g., "Hi! I see you need more protein. How about something with eggs or tuna? Do you have that at home?").
      3. **Inventory Check:** ASK if they have the main ingredients before finalizing.
      4. **Portion Control (EXTREMELY IMPORTANT):** - When you DO recommend a meal, you MUST calculate for a **SINGLE SERVING (1 Person)**.
         - Do NOT use raw package sizes (e.g., "500g meat" is WRONG for a single meal).
         - Examples of correct single servings:
           - "Blintzes with meat": 2 units (approx 100g total) + 50g meat filling. Total ~150g. NOT 500g.
           - "Schnitzel": 1 unit (~150g chicken breast).
           - "Pasta": 100g cooked pasta + 100g sauce.
      5. **Finalize:** ONLY when the user agrees or asks for the recipe/final plan, output the "recommendation" type. Otherwise, use "chat" type.

      **Output Format (JSON Only):**
      
      If chatting/asking questions:
      {
        "type": "chat",
        "message": "Hebrew text response here..."
      }

      If finalizing a specific meal recommendation:
      {
        "type": "recommendation",
        "message": "Here is the summary for your meal:",
        "data": {
            "meal_name": "...",
            "reasoning": "Hebrew explanation why this fits NOW.",
            "preparation_time": "10 min",
            "macros": { "calories": 300, "protein": 25, "carbs": 10, "fat": 15 },
            "recipe_outline": "Brief instructions including EXACT weights for a single serving (e.g., 150g chicken)"
        }
      }
    `;

    return await callGeminiWithFallback(apiKey, prompt, true, isCustomKey);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}