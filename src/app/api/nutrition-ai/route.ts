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

type GeminiPart = { text?: string };
type GeminiContent = { role?: string; parts?: GeminiPart[] };
type GeminiCandidate = { content?: GeminiContent };
type GeminiResponse = { candidates?: GeminiCandidate[]; [k: string]: unknown };

const MODEL = 'gemini-2.5-flash-lite';

/* ============================ Handler ============================ */
export async function POST(req: Request) {
  try {
    const payload = (await req.json()) as unknown;

    const text = getTextField(payload, 'text');
    if (!process.env.GEMINI_API_KEY) return j({ error: 'GEMINI_API_KEY is not set' }, 500);
    if (!text) return j({ error: 'missing "text"' }, 400);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(
      process.env.GEMINI_API_KEY
    )}`;

    // === System instruction (Heb/Eng): enforce grams + per-100g and JSON only ===
    const system = [
      'Return ONLY valid JSON with this shape:',
      '{',
      '  "items": [',
      '    {',
      '      "item": string,',
      '      "grams": number,                 // estimated mass in grams, never units',
      '      "per100": {                      // nutrition density per 100 grams',
      '        "calories": number,',
      '        "protein_g": number,',
      '        "carbs_g": number,',
      '        "fat_g": number',
      '      },',
      '      "notes": string?                 // if you made size assumptions',
      '    }',
      '  ]',
      '  ,"totals": { "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number }',
      '}',
      '',
      'Rules:',
      '- ALWAYS quantify each component in grams. If a beverage is mentioned (e.g. Pepsi Zero), approximate 1 ml ≈ 1 g and use realistic per-100g values (Pepsi Zero macros ≈ 0).',
      '- Per food, choose a reasonable grams estimate for a typical serving if the user did not specify.',
      '- No free text outside of the single JSON.',
    ].join('\n');

    const body = {
      systemInstruction: { role: 'system', parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const raw: unknown = await r.json().catch<unknown>(() => ({}));
    if (!r.ok) {
      return j(
        { error: 'Gemini API error', detail: isRecord(raw) && raw.error ? raw.error : raw },
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
      (Array.isArray(parsedUnknown.items) ? parsedUnknown.items : undefined) ??
      (Array.isArray(parsedUnknown.meals) ? parsedUnknown.meals : undefined);

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
  const v = obj[key];
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
  const candidates = resp.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return '';
  const c0 = candidates[0] as GeminiCandidate;
  const parts = c0?.content?.parts;
  if (!Array.isArray(parts)) return '';
  for (const p of parts) {
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

  const item = typeof o.item === 'string' ? o.item.trim() : '';
  let grams =
    toNum(o.grams) ||
    toNum(o.g) ||
    toNum(o.amount_grams) ||
    parseGramsAmount(typeof o.amount === 'string' ? o.amount : undefined);
  if (!grams || grams <= 0) grams = 100;

  // per100 (try nested object or *_per_100g flat keys)
  const p100Obj = isRecord(o.per100) ? o.per100 : {};
  let per100: Per100 = {
    calories: toNum(p100Obj.calories ?? (o as Record<string, unknown>).calories_per_100g),
    protein_g: toNum(p100Obj.protein_g ?? (o as Record<string, unknown>).protein_g_per_100g),
    carbs_g: toNum(p100Obj.carbs_g ?? (o as Record<string, unknown>).carbs_g_per_100g),
    fat_g: toNum(p100Obj.fat_g ?? (o as Record<string, unknown>).fat_g_per_100g),
  };

  // If density missing but absolute macros exist, infer per-100g
  const absCal = toNum(o.calories);
  const absPro = toNum(o.protein_g);
  const absCar = toNum(o.carbs_g);
  const absFat = toNum(o.fat_g);

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

  const notes = typeof o.notes === 'string' ? o.notes : undefined;

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
