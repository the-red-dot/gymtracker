// src/lib/ai-client.ts
// סקריפט עזר לניהול הקריאות ל-AI, מודלים וגיבויים

const GENERAL_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

const BACKUP_MODEL = 'DeepSeek-R1-Distill-Llama-70B';
const SAMBANOVA_URL = 'https://api.sambanova.ai/v1/chat/completions';

/**
 * פונקציה מרכזית לקריאה ל-Gemini עם מנגנון Fallback וגיבוי SambaNova
 * @param apiKey המפתח ל-Gemini
 * @param prompt הטקסט לשליחה
 * @param jsonMode האם לצפות ל-JSON
 * @param isCustomKey האם המפתח הוא מפתח אישי של המשתמש (קריטי לגיבוי SambaNova)
 */
export async function callGeminiWithFallback(apiKey: string, prompt: string, jsonMode: boolean, isCustomKey: boolean = false) {
  let lastError: any = null;

  // 1. נסה את כל מודלי Gemini לפי הסדר
  for (let i = 0; i < GENERAL_MODELS.length; i++) {
    const model = GENERAL_MODELS[i];
    console.log(`[AI Request] Attempt ${i + 1}/${GENERAL_MODELS.length}: Trying ${model}...`);

    try {
      const response = await callGemini(apiKey, prompt, jsonMode, model);
      // הצלחה - הוסף כותרת לדיבוג
      const newHeaders = new Headers(response.headers);
      newHeaders.set('x-model-used', model);
      return new Response(response.body, { status: response.status, headers: newHeaders });
    } catch (error: any) {
      console.warn(`[AI Fail] Model ${model} failed after ${i + 1} attempts. Error: ${error.message}`);
      lastError = error;
      // ממשיכים למודל הבא
    }
  }

  // 2. אם הכל נכשל והמשתמש הביא מפתח משלו - נסה גיבוי SambaNova
  if (isCustomKey) {
    const sambaKey = process.env.SAMBANOVA_API_KEY;
    if (sambaKey) {
      console.log(`[AI Critical] All Gemini models failed. Switching to Backup: ${BACKUP_MODEL} (SambaNova)...`);
      try {
        const backupResponse = await callSambaNova(sambaKey, prompt, jsonMode);
        return backupResponse;
      } catch (backupError: any) {
        console.error(`[AI Backup Fail] SambaNova failed: ${backupError.message}`);
        lastError = backupError;
      }
    } else {
        console.warn(`[AI Backup Skipped] No SAMBANOVA_API_KEY defined in server environment.`);
    }
  } else {
      console.log(`[AI Backup Skipped] User uses system key, skipping backup model.`);
  }

  // 3. כישלון מוחלט
  throw lastError || new Error('All AI models failed');
}

async function callGemini(apiKey: string, prompt: string, jsonMode: boolean, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
    }
  };

  if (jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API Error (${model})`);
  }

  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) throw new Error('Empty response from AI');

  if (jsonMode) {
    text = text.replace(/```json|```/g, '').trim();
    try {
       JSON.parse(text);
    } catch (e) {
       console.error("Invalid JSON received:", text);
       throw new Error('Invalid JSON response form AI');
    }
  } else {
    // עוטפים טקסט רגיל במבנה JSON אחיד לקונסיסטנטיות
    text = JSON.stringify({ result: text });
  }

  return new Response(text, { 
    headers: { 
        'Content-Type': 'application/json',
        'x-model-used': model
    } 
  });
}

async function callSambaNova(apiKey: string, prompt: string, jsonMode: boolean) {
    const body = {
      model: BACKUP_MODEL,
      messages: [
        { role: "system", content: jsonMode ? "You are a helpful assistant. Output ONLY valid JSON." : "You are a helpful assistant." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
    };
  
    const res = await fetch(SAMBANOVA_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`SambaNova API Error: ${err}`);
    }
    
    const data = await res.json();
    let text = data.choices?.[0]?.message?.content || '';

    // נרמול תשובה למבנה של האפליקציה
    if (jsonMode) {
        text = text.replace(/```json|```/g, '').trim();
        // נסיון חילוץ JSON אם המודל הוסיף טקסט מסביב
        const match = text.match(/\{[\s\S]*\}/);
        if (match) text = match[0];
    } else {
        text = JSON.stringify({ result: text });
    }

    return new Response(text, {
        headers: {
            'Content-Type': 'application/json',
            'x-model-used': `${BACKUP_MODEL} (Backup)`
        }
    });
}