// src/app/api/workout-ai/route.ts
export const runtime = 'nodejs';

import { callGeminiWithFallback } from '@/lib/ai-client';

type EquipmentItem = {
  id: number;
  name: string;
  body_area: string;
};

export async function POST(req: Request) {
  try {
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No API Key provided' }), { status: 401 });
    }

    const { userRequest, inventory, mode, currentRoutine } = await req.json();
    const isCustomKey = !!customKey;

    // Default mode is 'generate'
    const isRefresh = mode === 'refresh';

    // --- MODE 1: REFRESH (Analyze existing routine) ---
    if (isRefresh) {
        if (!currentRoutine || !Array.isArray(currentRoutine)) {
            return new Response(JSON.stringify({ error: 'Missing currentRoutine for refresh mode' }), { status: 400 });
        }

        const systemPrompt = `
        You are an expert fitness coach AI.
        The user has an existing workout routine consisting of Tabs and Exercises.
        
        **User's Current Routine:**
        ${JSON.stringify(currentRoutine, null, 2)}

        **Task:**
        Analyze this exact routine. Do NOT change the tabs or exercises. 
        Your goal is to provide an updated, explained Summary of this routine. 
        Usually, the user just modified it manually or added/removed exercises, and wants an updated explanation of "What am I doing now?".

        **Formatting Rules:**
        - The Output must be a JSON object with a single field: "summary".
        - The "summary" field contains HTML (Hebrew).
        - Use <h3> for Tab names.
        - Use <ul><li> for exercises.
        - Add tips and recommended sets/reps for each exercise based on standard hypertrophy/strength goals.
        - Structure:
          <h3>🎯 ניתוח התוכנית המעודכנת</h3>
          <p>[Short analysis of the changes or current state]</p>
          <hr />
          <h3>[Tab Name] [Emoji]</h3>
          <ul>
            <li><strong>[Exercise]</strong>: [Target] <br/> 💡 <em>טיפ:</em>... <br/> 🔢 <em>המלצה:</em>...</li>
          </ul>
        
        **Output JSON:**
        { "summary": "HTML string..." }
        `;

        const response = await callGeminiWithFallback(apiKey, systemPrompt, true, isCustomKey);
        return response;
    }

    // --- MODE 2: GENERATE (Create new routine) ---
    if (!userRequest || !inventory || !Array.isArray(inventory)) {
      return new Response(JSON.stringify({ error: 'Missing userRequest or inventory' }), { status: 400 });
    }

    const inventoryList = (inventory as EquipmentItem[]).map(e => 
      `ID:${e.id}|${e.name}|${e.body_area}`
    ).join('\n');

    const systemPrompt = `
      You are an expert fitness coach AI creating a realistic workout routine.
      The user wants a workout plan based on their goal: "${userRequest}".
      
      Here is the available equipment inventory (ID|Name|BodyArea):
      ---
      ${inventoryList}
      ---

      **Task:**
      Create a workout plan structure by grouping equipment into Tabs.
      
      **CRITICAL RULES (READ CAREFULLY):**
      1. **REALISTIC VOLUME:** Humans cannot do 80 exercises. A standard workout is 45-90 minutes.
         - **IF** the user specified a number (e.g., "2 exercises per muscle"), **YOU MUST OBEY THAT NUMBER EXACTLY**.
         - **IF NOT**, Limit each tab to **6-9 exercises MAXIMUM**.
      
      2. **SELECTION, NOT COLLECTION:** Do NOT list every matching machine. Select the **BEST** effective exercises for the goal.
         - Avoid redundancy (e.g., don't pick 4 types of bicep curls unless it's an arm specialization day).
         - Ensure muscle balance based on the user's request.

      3. **Structure Analysis:** - "Full Body" -> Create tabs like "Full Body A", "Full Body B" or just one efficient list.
         - "Split" -> Create tabs like "Push", "Pull", "Legs".
         - "Core" -> Select only the top 3-5 core exercises.

      4. **Detailed Coaching (The "summary" field):**
         - The \`summary\` field MUST be formatted using **STRICT HTML TAGS**.
         - Do NOT use Markdown (like **, #, -). Use HTML tags only.
         
         **HTML Formatting Rules:**
         - Use <h3> for Main Headers (Goals, Tabs).
         - Use <strong> for Exercise Names and Labels.
         - Use <ul> and <li> for lists of exercises.
         - Use <br> for line breaks inside list items.
         - Use <p> for paragraphs.
         - Use <hr> to separate sections.
         
         **Required Summary Structure (HTML Example):**
         
         <h3>🎯 ניתוח והסבר התוכנית</h3>
         <p>[Short analysis of the goal and logic]</p>
         <hr />
         
         <h3>🏋️ [Tab Name & Emoji]</h3>
         <ul>
           <li>
             <strong>[Exercise Name]</strong>: [Target Muscle]
             <br/>
             💡 <em>טיפ:</em> [Coach Tip]
             <br/>
             🔢 <em>המלצה:</em> [Sets x Reps, e.g. 3x12]
           </li>
           <!-- Repeat for all exercises in this tab -->
         </ul>
         
         <hr />
         <!-- Repeat for next tab -->

      5. **Output Format:**
      Return ONLY valid JSON matching this TypeScript interface:
      {
        "tabs": [
          { "name": "string (Hebrew)", "emoji": "string (1 char)", "equipment_ids": number[], "reasoning": "string (Hebrew)" }
        ],
        "summary": "string (Hebrew - The HTML formatted string described above)"
      }
      
      **Language:** Hebrew only for names/summaries.
      **Output:** JSON only. No markdown fences.
    `;

    const response = await callGeminiWithFallback(apiKey, systemPrompt, true, isCustomKey);
    return response;

  } catch (error: any) {
    console.error('AI Workout Plan Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}