import { callGeminiWithFallback } from '@/lib/ai-client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return new Response(JSON.stringify({ error: 'No API Key' }), { status: 401 });

    // הוספנו תמיכה לקבלת התיאור עם הכמויות המדויקות (mealDesc)
    const { mealName, mealDesc, preferences } = await req.json();

    const prompt = `
      Create a detailed cooking recipe for: "${mealName}".
      
      **Context & MANDATORY QUANTITIES:**
      - **Meal Description & Weights:** ${mealDesc || 'Not provided, assume a standard single serving'}
      
      **CRITICAL RULES:**
      1. **SINGLE SERVING ONLY:** This recipe is for exactly 1 person.
      2. **RESPECT THE WEIGHTS:** You MUST strictly adhere to the quantities provided in the "Meal Description & Weights" above. If it says 150g of chicken, write exactly 150g in the ingredients. DO NOT multiply or bulk up the recipe to 500g!
      
      **User Preferences:**
      - Diet: ${JSON.stringify(preferences?.dietary_preferences || [])}
      - Style: ${preferences?.cooking_preference}
      
      **Output Format (JSON):**
      {
        "ingredients": ["150g chicken breast", "1 tsp olive oil", "item 3"],
        "instructions": ["step 1", "step 2"],
        "prep_time": "15 min",
        "tips": "Chef tip for making it tasty"
      }
      Language: Hebrew only.
    `;

    return await callGeminiWithFallback(apiKey, prompt, true);

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}