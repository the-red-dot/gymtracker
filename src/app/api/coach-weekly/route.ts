// src/app/api/coach-weekly/route.ts
export const runtime = 'edge';

type Totals = {
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  meals: number; workouts: number; sets: number; minutes: number; rest_days: number;
};
type AvgTargets = { calories?: number | null; protein_g?: number | null; };
type WeightSpan = { start?: number | null; end?: number | null; delta?: number | null; bf_start?: number | null; bf_end?: number | null; };

type WeeklyPayload = {
  locale: string;
  week_start: string;
  week_end: string;
  goals: string[];
  current_week: { totals: Totals; avgTargets: AvgTargets; weight: WeightSpan; };
  previous_week: null | { totals: Totals; avgTargets: AvgTargets; weight: WeightSpan; };
  section_keys: string[];
};

type AiSections = { [key: string]: string | undefined; };

const MODEL = 'gemini-2.5-flash-lite';

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) return j({ error: 'GEMINI_API_KEY is not set' }, 500);
    const payload = (await req.json()) as WeeklyPayload;

    if (!payload?.week_start || !payload?.week_end || !payload?.current_week?.totals || !Array.isArray(payload?.section_keys)) {
      return j({ error: 'invalid payload' }, 400);
    }

    // מערכת: עברית קצרה, תובנות, JSON בלבד
    const system = [
      'החזר JSON בלבד: { "sections": { "<key>": string, ... } }',
      'ה"מפתחות" חייבים להתאים ל-section_keys שנשלחו.',
      'שפה: עברית טבעית, תמציתית (2–4 משפטים לכל כותרת), מעודדת אך כנה.',
      'שלב מס׳ בודדים כשזה תורם; אל תשלשל טבלאות או רשימות ארוכות.',
      'השווה לשבוע קודם רק אם previous_week קיים.',
      'אם חסר יעד/מספר—נסח מסקנה איכותית ולא מלא מספרים מומצאים.',
      'אין טקסט מחוץ ל-JSON. אין ```.',
    ].join('\n');

    const dataBlock = JSON.stringify({
      locale: payload.locale,
      goals: payload.goals,
      week: { start: payload.week_start, end: payload.week_end },
      current_week: payload.current_week,
      previous_week: payload.previous_week,
      section_keys: payload.section_keys,
    });

    const body = {
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: `DATA:\n${dataBlock}\n\nהחזר רק {"sections": {...}}.` }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.35, topP: 0.9, candidateCount: 1, maxOutputTokens: 400,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const raw = await r.json().catch(() => ({}));
    if (!r.ok) return j({ error: 'Gemini API error', detail: raw?.error ?? raw }, r.status);

    const textOut = raw?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text ?? '';

    // פרסינג חסין + תמיכה גם אם המודל החזיר את המפתחות בשורש
    let parsed: any = null;
    try { parsed = JSON.parse(textOut); }
    catch {
      const m = String(textOut).match(/\{[\s\S]*\}$/m);
      if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
    }

    const root = parsed && typeof parsed === 'object'
      ? (parsed.sections && typeof parsed.sections === 'object' ? parsed.sections : parsed)
      : null;

    // fallback גנרי קצר (שאינו רובוטי מידי) אם אין בכלל פלט ראוי
    const fallbackShort = (k: string) => {
      const cw = payload.current_week;
      switch (k) {
        case 'nutrition_overview':
          return `השבוע נרשמו ${Math.round(cw.totals.meals)} ארוחות. הקצב התזונתי היה מתון, עם צריכה כוללת בסך ~${Math.round(cw.totals.calories)} קק"ל.`;
        case 'protein':
          return cw.avgTargets?.protein_g
            ? `ממוצע חלבון שבועי התקרב ל-${Math.round(cw.avgTargets.protein_g)}ג׳ ליום. המשך לשאוף ליעד — עקביות תביא תוצאות.`
            : `צריכת החלבון הייתה יציבה — מומלץ להגדיר יעד יומי כדי לחדד את המעקב.`;
        case 'calories':
          return cw.avgTargets?.calories
            ? `הצריכה הקלורית הייתה סביב ${Math.round(cw.avgTargets.calories)} קק"ל ליום. שמירה עקבית סביב היעד תסייע להתקדמות מתונה ובטוחה.`
            : `מומלץ להגדיר יעד קלורי יומי כדי לעקוב אחר המאזן לאורך השבוע.`;
        case 'training':
          return cw.totals.workouts > 0
            ? `בוצעו ${cw.totals.workouts} אימונים (סה"כ ~${cw.totals.minutes} דק׳). שמירה על רצף תוביל לשיפור מדיד בשבועות הקרובים.`
            : `השבוע נטול אימונים; גם הליכה קלה או אימון קצר יספקו דחיפה קטנה להתחלה.`;
        case 'measurements':
          return typeof cw.weight?.delta === 'number' && cw.weight.delta !== 0
            ? `שינוי משקל שבועי של ${cw.weight.delta > 0 ? '+' : ''}${cw.weight.delta} ק״ג. המשך לעקוב אחר היקפים ומשקל פעם–פעמיים בשבוע.`
            : `לא זוהה שינוי מהותי במדדים השבוע — עקביות תייצר מגמה ברורה יותר.`;
        case 'suggestions':
          return `שמור על מה שעובד והוסף שיפור קטן אחד לשבוע: יעד חלבון ברור, שתי הליכות קצרות, או הקפדה על ארוחה מאוזנת נוספת.`;
        default:
          return '';
      }
    };

    const sections: AiSections = {};
    for (const key of payload.section_keys) {
      const v = root && typeof root[key] === 'string' ? root[key] : '';
      sections[key] = v || fallbackShort(key);
    }

    return j({ sections, updatedAt: new Date().toISOString() }, 200);
  } catch (e: any) {
    return j({ error: e?.message || 'unknown error' }, 500);
  }
}

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
