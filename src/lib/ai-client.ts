// src/lib/ai-client.ts
// סקריפט עזר לניהול הקריאות ל-AI, מודלים וגיבויים

// הגדרת המודלים (עודכן לפי בקשה לגרסאות החדשות)
const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash';

export async function callGeminiWithFallback(apiKey: string, prompt: string, jsonMode: boolean) {
  // שימוש במודל הראשי שהוגדר למעלה
  const targetPrimary = PRIMARY_MODEL;

  try {
    console.log(`AI Request: Trying Primary Model (${targetPrimary})...`);
    return await callGemini(apiKey, prompt, jsonMode, targetPrimary);
  } catch (error) {
    console.warn(`Primary model failed, switching to Fallback (${FALLBACK_MODEL}). Error:`, error);
    
    // ניסיון שני עם מודל הגיבוי
    const response = await callGemini(apiKey, prompt, jsonMode, FALLBACK_MODEL);
    
    // סימון שהשתמשנו בגיבוי (כדי להציג למשתמש ב-UI)
    const newHeaders = new Headers(response.headers);
    newHeaders.set('x-model-used', FALLBACK_MODEL);
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });
  }
}

async function callGemini(apiKey: string, prompt: string, jsonMode: boolean, model: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const body: any = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4, // יצירתיות מאוזנת
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
    const err = await response.json();
    throw new Error(err.error?.message || `Gemini API Error (${model})`);
  }

  const data = await response.json();
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) throw new Error('Empty response from AI');

  if (jsonMode) {
    // ניקוי מרקדאון אם קיים
    text = text.replace(/```json|```/g, '').trim();
    // ולידציה שזה JSON תקין
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