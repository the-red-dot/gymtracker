import { callGeminiWithFallback } from '@/lib/ai-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API Key' }), { status: 401 });

    const { userProfile, preferences, currentContext, favorites } = await req.json();

    const hebrewGender = userProfile?.gender === 'female' ? 'נקבה' : 'זכר';
    const favStr = favorites?.map((f: any) => f.meal_name).join(', ') || "None";
    
    // קריאת הדוח השבועי גם לטובת המלצות בזמן אמת
    const weeklyReviewHtml = preferences?.last_weekly_analysis_html || 'No recent weekly review available.';

    const prompt = `
      You are a real-time nutrition assistant.
      
      **User Context:**
      - Gender: ${hebrewGender} (Address strictly as ${hebrewGender}).
      - Current Time: ${currentContext?.time}
      - Eaten Today: ${currentContext?.eatenCalories} kcal, ${currentContext?.eatenProtein}g protein.
      - Target: ${currentContext?.targetCalories} kcal, ${currentContext?.targetProtein}g protein.
      - Favorites: ${favStr}
      - Preferences: ${preferences?.cooking_preference}, ${JSON.stringify(preferences?.dietary_preferences)}
      
      **Dietitian's Weekly Review (CRITICAL FOR YOUR RECOMMENDATION):**
      ${weeklyReviewHtml}
      *INSTRUCTIONS:* Read this review. If the user is missing specific vitamins, minerals, or food groups (like greens or iron), try to incorporate them into this real-time recommendation.
      
      **Task:**
      Recommend ONE specific SINGLE-SERVING meal to eat RIGHT NOW.
      
      **Logic & STRICT RULES:**
      1. **Time Check:** Is it morning? Lunch? Late night? Suggest accordingly.
      2. **Gap Analysis:** If protein is low vs target, suggest a high protein meal.
      3. **Deficiencies:** Address issues from the "Weekly Review".
      4. **MACRO PHYSICS (CRITICAL):** Calculate macros accurately for a SINGLE serving. Do not invent 40g of protein from a slice of cheese. Be realistic with the ingredients. Specify exact weights in the recipe outline (e.g., 200g tofu, 150g chicken).
      
      **Output Format (JSON):**
      {
        "meal_name": "...",
        "reasoning": "Hebrew explanation directly to the user (${hebrewGender}) why this fits NOW, mentioning how it helps hit macros or fixes deficiencies from the weekly review.",
        "preparation_time": "10 min",
        "macros": { "calories": 300, "protein": 25, "carbs": 10, "fat": 15 },
        "recipe_outline": "Brief instructions including EXACT weights for a single serving (e.g., 150g chicken)"
      }
    `;

    return await callGeminiWithFallback(apiKey, prompt, true);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}