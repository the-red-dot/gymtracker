// src/app/api/coach-weekly/route.ts
// Updated to use the central AI client for proper fallback handling

export const runtime = 'edge';

import { callGeminiWithFallback } from '@/lib/ai-client';

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

function safeParseJSON(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
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
    const customKey = req.headers.get('x-custom-api-key');
    const apiKey = customKey || process.env.GEMINI_API_KEY;
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY is not set' }, 500);

    const isCustomKey = !!customKey; // Check if user provided their own key

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

    const prompt = `DATA:\n${dataBlock}\n\n${system}\n\nהחזר רק {"sections": {...}}.`;

    // Use central client with fallback logic
    const aiRes = await callGeminiWithFallback(apiKey, prompt, true, isCustomKey);
    const aiData = await aiRes.json();
    
    // Logic to parse potential variations (if lib didn't fully clean up or if structure differs)
    let root: Record<string, unknown> | null = null;
    
    // aiData might be the direct object or contain { result: string } if handled by legacy logic, 
    // but callGeminiWithFallback parses JSON when jsonMode=true.
    // However, if the model returned { sections: ... } or just { ... }, we need to handle it.
    
    if (isRecord(aiData)) {
      if (isRecord(aiData.sections)) {
        root = aiData.sections as Record<string, unknown>;
      } else {
        root = aiData;
      }
    }

    // Fallback generator (short & non-robotic) if specific keys missing
    const cw = payload.current_week;
    const fallbackShort = (k: string): string => {
      switch (k) {
        case 'nutrition_overview':
          return `השבוע נרשמו ${Math.round(cw.totals.meals)} ארוחות. הקצב התזונתי היה מתון, עם צריכה כוללת בסך ~${Math.round(cw.totals.calories)} קק"ל.`;
        case 'protein':
          return cw.avgTargets?.protein_g != null
            ? `ממוצע חלבון שבועי התקרב ל-${Math.round(cw.avgTargets.protein_g)}ג׳ ליום. המשך לשאוף ליעד.`
            : `צריכת החלבון הייתה יציבה — מומלץ להגדיר יעד יומי.`;
        case 'calories':
          return cw.avgTargets?.calories != null
            ? `הצריכה הקלורית הייתה סביב ${Math.round(cw.avgTargets.calories)} קק"ל ליום.`
            : `מומלץ להגדיר יעד קלורי יומי.`;
        case 'training':
          return cw.totals.workouts > 0
            ? `בוצעו ${cw.totals.workouts} אימונים (סה"כ ~${cw.totals.minutes} דק׳).`
            : `השבוע נטול אימונים; גם הליכה קלה תעזור.`;
        case 'measurements': {
          const d = cw.weight?.delta;
          return typeof d === 'number' && Number.isFinite(d) && d !== 0
            ? `שינוי משקל שבועי של ${d > 0 ? '+' : ''}${d} ק״ג.`
            : `לא זוהה שינוי מהותי במדדים השבוע.`;
        }
        case 'suggestions':
          return `שמור על מה שעובד והוסף שיפור קטן אחד לשבוע.`;
        default:
          return '';
      }
    };

    const sections: AiSections = {};
    for (const key of payload.section_keys) {
      const candidate = root && Object.prototype.hasOwnProperty.call(root, key) && isString(root[key] as unknown)
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