// src/app/api/coach-weekly/route.ts
export const runtime = 'edge';

/* =========================
   Types
   ========================= */
type Totals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals: number;
  workouts: number;
  sets: number;
  minutes: number;
  rest_days: number;
};

type AvgTargets = {
  calories?: number | null;
  protein_g?: number | null;
};

type WeightSpan = {
  start?: number | null;
  end?: number | null;
  delta?: number | null;
  bf_start?: number | null;
  bf_end?: number | null;
};

type WeeklyPayload = {
  locale: string;
  week_start: string; // ISO date
  week_end: string;   // ISO date
  goals: string[];
  current_week: { totals: Totals; avgTargets: AvgTargets; weight: WeightSpan };
  previous_week: null | { totals: Totals; avgTargets: AvgTargets; weight: WeightSpan };
  section_keys: string[];
};

type AiSections = Record<string, string | undefined>;

/** Minimal shape for Gemini response (we only need text parts). */
type GeminiPart = { text?: string } & Record<string, unknown>;
type GeminiContent = { parts?: GeminiPart[] } & Record<string, unknown>;
type GeminiCandidate = { content?: GeminiContent } & Record<string, unknown>;
type GeminiResponse = {
  candidates?: GeminiCandidate[];
  error?: { message?: string; code?: number } & Record<string, unknown>;
} & Record<string, unknown>;

/* =========================
   Constants
   ========================= */
const MODEL = 'gemini-2.5-flash-lite';

/* =========================
   Helpers (type guards & utils)
   ========================= */
function jsonResponse<T extends object>(obj: T, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function firstTextFromGemini(resp: unknown): string {
  const r = resp as GeminiResponse;
  const parts = r?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const p = parts.find((pt) => isString((pt as GeminiPart).text)) as GeminiPart | undefined;
    if (p?.text) return p.text;
  }
  return '';
}

function safeParseJSON(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    // Try to extract the last JSON object in the string
    const match = String(input).match(/\{[\s\S]*\}$/m);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/* =========================
   Route
   ========================= */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY is not set' }, 500);

    const payloadUnknown = await req.json();
    const payload = payloadUnknown as WeeklyPayload;

    if (
      !payload?.week_start ||
      !payload?.week_end ||
      !payload?.current_week?.totals ||
      !Array.isArray(payload?.section_keys)
    ) {
      return jsonResponse({ error: 'invalid payload' }, 400);
    }

    // System guidance (Hebrew): concise, JSON only
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
        temperature: 0.35,
        topP: 0.9,
        candidateCount: 1,
        maxOutputTokens: 400,
      },
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let raw: unknown = null;
    try {
      raw = await r.json();
    } catch {
      raw = null;
    }

    if (!r.ok) {
      const detail = isRecord(raw) && raw.error ? raw.error : raw;
      return jsonResponse({ error: 'Gemini API error', detail }, r.status);
    }

    const textOut = firstTextFromGemini(raw);
    const parsed = safeParseJSON(textOut);

    // Root can be either { sections: { ... } } or directly { key: "..." }
    let root: Record<string, unknown> | null = null;
    if (isRecord(parsed)) {
      if (isRecord(parsed.sections)) {
        root = parsed.sections as Record<string, unknown>;
      } else {
        root = parsed;
      }
    }

    // Fallback generator (short & non-robotic)
    const cw = payload.current_week;
    const fallbackShort = (k: string): string => {
      switch (k) {
        case 'nutrition_overview':
          return `השבוע נרשמו ${Math.round(cw.totals.meals)} ארוחות. הקצב התזונתי היה מתון, עם צריכה כוללת בסך ~${Math.round(
            cw.totals.calories,
          )} קק"ל.`;
        case 'protein':
          return cw.avgTargets?.protein_g != null
            ? `ממוצע חלבון שבועי התקרב ל-${Math.round(cw.avgTargets.protein_g)}ג׳ ליום. המשך לשאוף ליעד — עקביות תביא תוצאות.`
            : `צריכת החלבון הייתה יציבה — מומלץ להגדיר יעד יומי כדי לחדד את המעקב.`;
        case 'calories':
          return cw.avgTargets?.calories != null
            ? `הצריכה הקלורית הייתה סביב ${Math.round(
                cw.avgTargets.calories,
              )} קק"ל ליום. שמירה עקבית סביב היעד תסייע להתקדמות מתונה ובטוחה.`
            : `מומלץ להגדיר יעד קלורי יומי כדי לעקוב אחר המאזן לאורך השבוע.`;
        case 'training':
          return cw.totals.workouts > 0
            ? `בוצעו ${cw.totals.workouts} אימונים (סה"כ ~${cw.totals.minutes} דק׳). שמירה על רצף תוביל לשיפור מדיד בשבועות הקרובים.`
            : `השבוע נטול אימונים; גם הליכה קלה או אימון קצר יספקו דחיפה קטנה להתחלה.`;
        case 'measurements': {
          const d = cw.weight?.delta;
          return typeof d === 'number' && Number.isFinite(d) && d !== 0
            ? `שינוי משקל שבועי של ${d > 0 ? '+' : ''}${d} ק״ג. המשך לעקוב אחר היקפים ומשקל פעם–פעמיים בשבוע.`
            : `לא זוהה שינוי מהותי במדדים השבוע — עקביות תייצר מגמה ברורה יותר.`;
        }
        case 'suggestions':
          return `שמור על מה שעובד והוסף שיפור קטן אחד לשבוע: יעד חלבון ברור, שתי הליכות קצרות, או הקפדה על ארוחה מאוזנת נוספת.`;
        default:
          return '';
      }
    };

    const sections: AiSections = {};
    for (const key of payload.section_keys) {
      const candidate =
        root && Object.prototype.hasOwnProperty.call(root, key) && isString(root[key] as unknown)
          ? (root[key] as string)
          : '';
      sections[key] = candidate || fallbackShort(key);
    }

    return jsonResponse({ sections, updatedAt: new Date().toISOString() }, 200);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'unknown error';
    return jsonResponse({ error: message }, 500);
  }
}
