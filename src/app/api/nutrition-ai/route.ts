// src/app/api/nutrition-ai/route.ts
export const runtime = 'edge';

type Per100 = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type AiItem = {
  item: string;

  // ALWAYS grams
  grams: number;

  // for display/back-compat (we'll fill "<grams> גרם")
  amount: string;

  // density per 100g for live recalculation
  per100: Per100;

  // totals for the current grams (computed here for convenience)
  calories: number;
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

const MODEL = 'gemini-2.5-flash-lite';

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!process.env.GEMINI_API_KEY) return j({ error: 'GEMINI_API_KEY is not set' }, 500);
    if (!text || typeof text !== 'string') return j({ error: 'missing "text"' }, 400);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    // === מערכת: מחייב גרמים + ערכי 100גרם ===
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

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return j({ error: 'Gemini API error', detail: data?.error ?? data }, r.status === 429 ? 429 : 502);
    }

    const textOut =
      data?.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text ?? '';
    let parsed: any = null;

    try { parsed = JSON.parse(textOut); }
    catch {
      const m = String(textOut).match(/\{[\s\S]*\}$/m);
      if (m) parsed = JSON.parse(m[0]);
    }

    if (!parsed) return j({ error: 'model returned empty' }, 502);

    // tolerate "meals" → "items"
    if (!Array.isArray(parsed.items) && Array.isArray(parsed.meals)) {
      parsed.items = parsed.meals;
      delete parsed.meals;
    }
    if (!Array.isArray(parsed.items)) {
      return j({ error: 'model returned unexpected format', raw: textOut, full: data }, 502);
    }

    // === נירמול: מבטיח שיש grams + per100; מחשב totals לכל פריט ===
    const items: AiItem[] = parsed.items.map((it: any) => {
      const item = String(it.item ?? '').trim();

      // get grams (try several fields or parse from text)
      let grams = toNum(it.grams ?? it.g ?? it.amount_grams);
      if (!grams && typeof it.amount === 'string') {
        const m = it.amount.match(/(\d+(?:\.\d+)?)\s*(?:g|גר(?:ם|מים)?)/i);
        if (m) grams = toNum(m[1]);
      }
      if (!grams) grams = 100; // fallback reasonable default

      // per100
      let per100: Per100 = {
        calories: toNum(it.per100?.calories ?? it.calories_per_100g),
        protein_g: toNum(it.per100?.protein_g ?? it.protein_g_per_100g),
        carbs_g:   toNum(it.per100?.carbs_g   ?? it.carbs_g_per_100g),
        fat_g:     toNum(it.per100?.fat_g     ?? it.fat_g_per_100g),
      };

      // If density missing but absolute macros exist, infer per100 from them
      const absCal = toNum(it.calories);
      const absPro = toNum(it.protein_g);
      const absCar = toNum(it.carbs_g);
      const absFat = toNum(it.fat_g);

      if (!(per100.calories || per100.protein_g || per100.carbs_g || per100.fat_g)) {
        if (grams > 0 && (absCal || absPro || absCar || absFat)) {
          per100 = {
            calories: round2((absCal * 100) / grams),
            protein_g: round2((absPro * 100) / grams),
            carbs_g: round2((absCar * 100) / grams),
            fat_g: round2((absFat * 100) / grams),
          };
        }
      }

      // compute totals for current grams
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
        notes: it.notes ? String(it.notes) : undefined,
      };
    });

    const totals = {
      calories: round2(items.reduce((s, i) => s + i.calories, 0)),
      protein_g: round2(items.reduce((s, i) => s + i.protein_g, 0)),
      carbs_g:   round2(items.reduce((s, i) => s + i.carbs_g, 0)),
      fat_g:     round2(items.reduce((s, i) => s + i.fat_g, 0)),
    };

    const out: AiResponse = { items, totals };
    return j(out, 200);
  } catch (e: any) {
    return j({ error: e?.message || 'unknown error' }, 500);
  }
}

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function toNum(n: any) { const x = Number(n); return Number.isFinite(x) ? x : 0; }
function round2(n: number) { return Math.round(n * 100) / 100; }
