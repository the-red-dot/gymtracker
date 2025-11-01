// src/app/api/nutrition-ai/route.ts
export const runtime = 'edge';

/* ============================ Types ============================ */
type Per100 = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type AiItem = {
  item: string;
  grams: number;             // ALWAYS grams
  amount: string;            // "<grams> גרם" for display/back-compat
  per100: Per100;            // density per 100g
  calories: number;          // totals for 'grams'
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes?: string;
};

type AiResponse = {
  items: AiItem[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  assumptions?: string[];
};

type GeminiInlineData = { mime_type: string; data: string }; // base64
type GeminiPart = { text?: string; inline_data?: GeminiInlineData };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = { candidates?: GeminiCandidate[]; [k: string]: unknown };

const MODEL = 'gemini-2.5-flash-lite';
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // ~15MB

/* ============================ Handler ============================ */
export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) return j({ error: 'GEMINI_API_KEY is not set' }, 500);

    const ctype = (req.headers.get('content-type') || '').toLowerCase();
    const isMultipart = ctype.includes('multipart/form-data');

    let text = '';
    let imagePart: GeminiInlineData | null = null;

    if (isMultipart) {
      const form = await req.formData();
      const maybeFile = form.get('file');
      const maybeText = form.get('text');

      text = typeof maybeText === 'string' ? maybeText : '';

      if (maybeFile && typeof maybeFile === 'object' && 'arrayBuffer' in maybeFile) {
        const file = maybeFile as File;

        if (!ALLOWED_IMAGE_MIME.has(file.type)) {
          return j({ error: `unsupported image type: ${file.type}` }, 400);
        }
        if (file.size > MAX_IMAGE_BYTES) {
          return j({ error: `image too large (${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, 413);
        }

        const buf = await file.arrayBuffer();
        const b64 = toBase64(buf);
        imagePart = { mime_type: file.type || 'image/jpeg', data: b64 };
      }

      if (!imagePart && !text.trim()) {
        return j({ error: 'missing "file" or "text"' }, 400);
      }
    } else {
      // JSON back-compat
      const payload = (await req.json().catch(() => ({}))) as unknown;
      text = getTextField(payload, 'text');
      if (!text) return j({ error: 'missing "text"' }, 400);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
      process.env.GEMINI_API_KEY
    )}`;

    // === System instruction: Hebrew-only labels + granular decomposition ===
    const system = [
      'Return ONLY valid JSON with this shape:',
      '{',
      '  "items": [',
      '    {',
      '      "item": string,                   // MUST be Hebrew (he-IL), e.g., "דג אמנון אפוי", "תפוחי אדמה", "מיונז"',
      '      "grams": number,                  // estimated mass in grams (metric ONLY)',
      '      "per100": {                       // nutrition density per 100 grams',
      '        "calories": number,',
      '        "protein_g": number,',
      '        "carbs_g": number,',
      '        "fat_g": number',
      '      },',
      '      "notes": string?                  // Hebrew note about assumptions',
      '    }',
      '  ],',
      '  "totals": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }',
      '}',
      '',
      'STRICT RULES:',
      '- All text fields ("item", "notes") MUST be in Hebrew only. No English. No transliteration.',
      '- ALWAYS quantify each component in grams. For beverages use 1 מ״ל ≈ 1 גרם.',
      '- If the input or image shows a COMPOSITE dish (e.g., "סלט אוליביה", "פיצה", "שקשוקה", "טוסט", "סלט טונה"),',
      '  then BREAK IT INTO SEPARATE INGREDIENT ITEMS (e.g., תפוחי אדמה, מיונז, אפונה, גזר, מלפפון חמוץ, ביצים).',
      '- For fish/meat, prefer a specific common Hebrew species/cut (e.g., "דג אמנון", "חזה עוף", "סלמון").',
      '- Use realistic per-100g values for each ingredient. If unsure about a component, pick a typical Israeli recipe baseline and explain in "notes".',
      '- Choose reasonable grams per component so that their sum approximates the visible/mentioned portion.',
      '- No free text outside of the single JSON.',
      '',
      'Formatting:',
      '- Return concise Hebrew item names. Round numbers to up to 2 decimals.',
      '- If any ambiguity exists (e.g., סוג הדג לא ברור), write a short Hebrew note in "notes".',
      '',
      'דוגמה לקומפוזיציה (הסבר בלבד, לא להחזיר כדוגמה):',
      'קלט: "סלט אוליביה ודג אמנון אפוי".',
      'פלט: מרכיבים נפרדים כגון "תפוחי אדמה", "מיונז", "אפונה", "גזר", "מלפפון חמוץ", "ביצים",',
      'ועבור הדג: "דג אמנון אפוי".',
    ].join('\n');

    const userParts: GeminiPart[] = [];
    // Force Hebrew hint at the top to nudge locality:
    userParts.push({ text: 'שפה: עברית (he-IL). החזר אך ורק טקסט בעברית בתוך JSON.' });
    if (imagePart) userParts.push({ inline_data: imagePart });
    if (text && text.trim()) userParts.push({ text: text.trim() });

    const body = {
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      contents: [{ role: 'user', parts: userParts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        topK: 40,
        topP: 0.95,
      },
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const raw: unknown = await r.json().catch<unknown>(() => ({}));
    if (!r.ok) {
      return j(
        { error: 'Gemini API error', detail: isRecord(raw) && (raw as any).error ? (raw as any).error : raw },
        r.status === 429 ? 429 : 502
      );
    }

    const textOut = extractGeminiText(raw);
    const parsedUnknown = safeParseJson(textOut);
    if (!parsedUnknown) return j({ error: 'model returned empty' }, 502);

    if (!isRecord(parsedUnknown)) {
      return j({ error: 'model returned unexpected format', raw: textOut, full: raw }, 502);
    }

    // tolerate "meals" → "items"
    const rawItems =
      (Array.isArray((parsedUnknown as any).items) ? (parsedUnknown as any).items : undefined) ??
      (Array.isArray((parsedUnknown as any).meals) ? (parsedUnknown as any).meals : undefined);

    if (!Array.isArray(rawItems)) {
      return j({ error: 'model returned unexpected format (no items array)', raw: textOut, full: raw }, 502);
    }

    // === Normalize items: ensure grams & per100; compute totals ===
    const items: AiItem[] = rawItems.map((it) => coerceItem(it));

    const totals = {
      calories: round2(items.reduce((s, i) => s + i.calories, 0)),
      protein_g: round2(items.reduce((s, i) => s + i.protein_g, 0)),
      carbs_g: round2(items.reduce((s, i) => s + i.carbs_g, 0)),
      fat_g: round2(items.reduce((s, i) => s + i.fat_g, 0)),
    };

    const out: AiResponse = { items, totals };
    return j(out, 200);
  } catch (e) {
    const msg = (e as { message?: string })?.message || 'unknown error';
    return j({ error: msg }, 500);
  }
}

/* ============================ Helpers ============================ */

function j(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getTextField(obj: unknown, key: string): string {
  if (!isRecord(obj)) return '';
  const v = (obj as any)[key];
  return typeof v === 'string' ? v : '';
}

function toNum(n: unknown): number {
  const x = typeof n === 'string' ? Number(n.trim()) : typeof n === 'number' ? n : NaN;
  return Number.isFinite(x) ? x : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function safeParseJson(s: unknown): unknown | null {
  if (typeof s !== 'string' || !s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    // try to salvage {...} from possible extra tokens
    const m = s.match(/\{[\s\S]*\}$/m);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function extractGeminiText(resp: unknown): string {
  if (!isRecord(resp)) return '';
  const candidates = (resp as any).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const c0 = candidates[0] as GeminiCandidate;
  const parts = c0?.content?.parts;
  if (!Array.isArray(parts)) return '';
  for (const p of parts as any[]) {
    if (p && typeof p.text === 'string') return p.text;
  }
  return '';
}

function parseGramsAmount(amountField: unknown): number {
  if (typeof amountField !== 'string') return 0;
  const m = amountField.match(/(\d+(?:\.\d+)?)\s*(?:g|גר(?:ם|מים)?)/i);
  return m ? toNum(m[1]) : 0;
}

function coerceItem(raw: unknown): AiItem {
  const o = isRecord(raw) ? raw : {};

  // Ensure item & notes are strings, default to empty Hebrew instead of English fallbacks
  const itemRaw = (o as any).item;
  const notesRaw = (o as any).notes;

  const item = typeof itemRaw === 'string' ? itemRaw.trim() : '';
  const notes = typeof notesRaw === 'string' ? notesRaw : undefined;

  let grams =
    toNum((o as any).grams) ||
    toNum((o as any).g) ||
    toNum((o as any).amount_grams) ||
    parseGramsAmount(typeof (o as any).amount === 'string' ? (o as any).amount : undefined);
  if (!grams || grams <= 0) grams = 100;

  const p100Obj = isRecord((o as any).per100) ? (o as any).per100 : {};
  let per100: Per100 = {
    calories: toNum((p100Obj as any).calories ?? (o as any).calories_per_100g),
    protein_g: toNum((p100Obj as any).protein_g ?? (o as any).protein_g_per_100g),
    carbs_g: toNum((p100Obj as any).carbs_g ?? (o as any).carbs_g_per_100g),
    fat_g: toNum((p100Obj as any).fat_g ?? (o as any).fat_g_per_100g),
  };

  // If density missing but absolute macros exist, infer per-100g
  const absCal = toNum((o as any).calories);
  const absPro = toNum((o as any).protein_g);
  const absCar = toNum((o as any).carbs_g);
  const absFat = toNum((o as any).fat_g);

  const p100Missing =
    !per100.calories && !per100.protein_g && !per100.carbs_g && !per100.fat_g;

  if (p100Missing && grams > 0 && (absCal || absPro || absCar || absFat)) {
    per100 = {
      calories: round2((absCal * 100) / grams),
      protein_g: round2((absPro * 100) / grams),
      carbs_g: round2((absCar * 100) / grams),
      fat_g: round2((absFat * 100) / grams),
    };
  }

  // Compute totals for current grams
  const calories = round2((per100.calories * grams) / 100);
  const protein_g = round2((per100.protein_g * grams) / 100);
  const carbs_g = round2((per100.carbs_g * grams) / 100);
  const fat_g = round2((per100.fat_g * grams) / 100);

  return {
    item,
    grams,
    amount: `${grams} גרם`,
    per100,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    notes,
  };
}

/* ---- utils ---- */
function toBase64(ab: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
