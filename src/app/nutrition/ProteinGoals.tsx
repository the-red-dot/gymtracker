// gym-tracker-app/src/app/nutrition/ProteinGoals.tsx
'use client';

/* ========= SECTION 1 — Imports ========= */
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SectionCard } from './ui';
import { round2 } from './utils';

/* ========= SECTION 2 — Types ========= */
type Gender = 'male' | 'female' | 'other' | 'unspecified';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';

type Profile = {
  user_id: string;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;            // fallback — המקור הרשמי הוא body_measurements
  body_fat_percent: number | null;     // fallback אם אין בטבלת המדידות
};
type UserGoal = { id: number; goal_key: string; label: string };

/* ========= SECTION 3 — Evidence (links only) ========= */
const EVIDENCE: Array<{ title: string; href: string; note?: string }> = [
  {
    title: 'Morton et al., 2018 — Meta-analysis: protein & resistance training',
    href: 'https://academic.oup.com/ajcn/article/108/5/989/5092610',
    note: 'נקודת רוויה סביב ~1.6 g/kg BW (עד ~2.2 כגבול עליון של CI).',
  },
  {
    title: 'Helms et al., 2014 — Protein for dieting resistance-trained athletes',
    href: 'https://pubmed.ncbi.nlm.nih.gov/24092765/',
    note: 'בחיטוב: 2.3–3.1 g/kg LBM לשימור מסת שריר.',
  },
  {
    title: 'ISSN Position Stand: Protein and Exercise (Jäger et al., 2017, update 2023)',
    href: 'https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8',
    note: 'למתאמנים: 1.4–2.0+ g/kg; חשיבות איכות/לויצין ופריסה יומית.',
  },
];

/* ========= Helpers ========= */
const toNum = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const log10 = (x: number) => Math.log(x) / Math.LN10;

/** חישוב %שומן לפי נוסחת Navy (ס״מ → אינצ׳ים) */
function estimateBfFromTape(opts: {
  gender: Gender | null;
  height_cm: number | null;
  neck_cm: number | null;
  waist_cm_like: number | null; // נעדיף waist_navel, אח״כ waist, אח״כ waist_narrow
  hips_cm: number | null;
}): { bf: number | null; explain: string | null; fieldsUsed: string[] } {
  const fieldsUsed: string[] = [];
  const cm2in = (cm: number) => cm / 2.54;

  const h = toNum(opts.height_cm);
  const neck = toNum(opts.neck_cm);
  const waist = toNum(opts.waist_cm_like);
  const hips = toNum(opts.hips_cm);

  if (!h || !neck || !waist) {
    // חסרים שדות בסיסיים
    const missing: string[] = [];
    if (!h) missing.push('height_cm (גובה)');
    if (!neck) missing.push('neck_cm (צוואר)');
    if (!waist) missing.push('waist_navel_cm/waist_cm/waist_narrow_cm (מותן)');
    const who = opts.gender === 'female' ? 'ולנשים גם hips_cm (אגן)' : '';
    return {
      bf: null,
      explain: `אין מספיק מדידות לחישוב משוער של %שומן (${missing.join(', ')} ${who}).`,
      fieldsUsed: [],
    };
  }

  fieldsUsed.push('height_cm', 'neck_cm', 'waist_*');
  const hIn = cm2in(h);
  const neckIn = cm2in(neck);
  const waistIn = cm2in(waist);

  let bf: number | null = null;
  let explain = '';

  if (opts.gender === 'female') {
    if (!hips) {
      return {
        bf: null,
        explain: 'לחישוב Navy לנשים דרוש גם hips_cm (אגן).',
        fieldsUsed: [],
      };
    }
    fieldsUsed.push('hips_cm');
    const hipsIn = cm2in(hips);
    // נוסחת Navy לנשים
    const val =
      163.205 * log10(waistIn + hipsIn - neckIn) -
      97.684 * log10(hIn) -
      78.387;
    bf = Math.max(2, Math.min(60, round2(val)));
    explain = 'חושב לפי נוסחת Navy (נשים) מהיקפים: צוואר, מותן, אגן וגובה.';
  } else {
    // ברירת מחדל: גברים
    const diff = waistIn - neckIn;
    if (diff <= 0) {
      return {
        bf: null,
        explain: 'ערכי היקף לא הגיוניים (waist ≤ neck) — לא ניתן לחשב Navy.',
        fieldsUsed: [],
      };
    }
    // נוסחת Navy לגברים
    const val = 86.010 * log10(diff) - 70.041 * log10(hIn) + 36.76;
    bf = Math.max(2, Math.min(50, round2(val)));
    explain = 'חושב לפי נוסחת Navy (גברים) מהיקפים: צוואר, מותן וגובה.';
  }

  return { bf, explain, fieldsUsed };
}

/* ========= SECTION 4 — Component ========= */
export default function ProteinGoals({
  profile,
  goals,
  activityLevel: _activityLevel, // לא בשימוש פה
  proteinToday,
}: {
  profile: Profile | null;
  goals: UserGoal[];
  activityLevel: ActivityLevel | null;
  proteinToday: number;
}) {
  const currentUserId = profile?.user_id ?? null;

  /* ----- 4.1 משיכה חכמה של מדידות: משקל אחרון, %שומן אחרון (גם אם לא באותה מדידה), ונתוני היקפים ----- */
  const [loadingBase, setLoadingBase] = useState(true);

  const [weight, setWeight] = useState<number | null>(null);
  const [weightAt, setWeightAt] = useState<string | null>(null);
  const [weightSource, setWeightSource] = useState<'measurement' | 'profile' | 'none'>('none');

  const [bfManual, setBfManual] = useState<number | null>(null);        // הוזן ידנית מתוך טבלת המדידות (הרשומה האחרונה עם body_fat_percent)
  const [bfManualAt, setBfManualAt] = useState<string | null>(null);

  const [tapeInputs, setTapeInputs] = useState<{
    height_cm: number | null;
    neck_cm: number | null;
    waist_cm_like: number | null;
    hips_cm: number | null;
    srcAt: string | null;
  }>({ height_cm: profile?.height_cm ?? null, neck_cm: null, waist_cm_like: null, hips_cm: null, srcAt: null });

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!currentUserId) {
        setLoadingBase(false);
        return;
      }
      setLoadingBase(true);

      // 1) המדידה האחרונה (למשקל וגם היקפים לטייפ)
      const { data: last } = await supabase
        .from('body_measurements')
        .select(`
          measured_at,
          weight_kg,
          body_fat_percent,
          neck_cm,
          waist_cm,
          waist_navel_cm,
          waist_narrow_cm,
          hips_cm
        `)
        .eq('user_id', currentUserId)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ignore) return;

      const lastWeight = toNum(last?.weight_kg);
      if (lastWeight != null) {
        setWeight(lastWeight);
        setWeightAt(last?.measured_at ?? null);
        setWeightSource('measurement');
      } else if (toNum(profile?.weight_kg) != null) {
        setWeight(toNum(profile?.weight_kg));
        setWeightSource('profile');
      } else {
        setWeight(null);
        setWeightSource('none');
      }

      // הכנת קלטים לנוסחת Navy מהמדידה האחרונה + גובה מהפרופיל
      const waistLike =
        toNum(last?.waist_navel_cm) ??
        toNum(last?.waist_cm) ??
        toNum(last?.waist_narrow_cm) ??
        null;
      setTapeInputs({
        height_cm: toNum(profile?.height_cm),
        neck_cm: toNum(last?.neck_cm),
        waist_cm_like: waistLike,
        hips_cm: toNum(last?.hips_cm),
        srcAt: last?.measured_at ?? null,
      });

      // 2) שליפת ערך %שומן האחרון שאינו ריק — גם אם אינו באותה רשומה
      const { data: lastBf } = await supabase
        .from('body_measurements')
        .select('measured_at, body_fat_percent')
        .eq('user_id', currentUserId)
        .not('body_fat_percent', 'is', null)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ignore) return;

      const bfVal = toNum(lastBf?.body_fat_percent) ?? toNum(profile?.body_fat_percent);
      setBfManual(bfVal);
      setBfManualAt(lastBf?.measured_at ?? null);

      setLoadingBase(false);
    })();
    return () => {
      ignore = true;
    };
  }, [currentUserId, profile?.weight_kg, profile?.height_cm, profile?.body_fat_percent]);

  /* ----- 4.2 קביעה אוטומטית של %שומן בשימוש: ידני אם קיים, אחרת חישוב Navy אם אפשר ----- */
  const bfAuto = useMemo(() => {
    if (toNum(bfManual) != null) {
      return {
        bf: bfManual as number,
        method: 'manual', // הוזן ידנית
        explain: bfManualAt ? `הוזן ידנית במדידה בתאריך ${new Date(bfManualAt).toLocaleDateString('he-IL')}.` : 'הוזן ידנית.',
      };
    }
    // נסיון לחשב לפי Navy מהיקפים
    const { bf, explain } = estimateBfFromTape({
      gender: profile?.gender ?? 'unspecified',
      height_cm: tapeInputs.height_cm,
      neck_cm: tapeInputs.neck_cm,
      waist_cm_like: tapeInputs.waist_cm_like,
      hips_cm: tapeInputs.hips_cm,
    });
    if (bf != null) {
      return {
        bf,
        method: 'navy',
        explain: `${explain}${tapeInputs.srcAt ? ` (מבוסס על מדידות מ־${new Date(tapeInputs.srcAt).toLocaleDateString('he-IL')})` : ''}`,
      };
    }
    return { bf: null, method: 'none', explain: explain ?? 'אין נתוני מדידות ואין ערך %שומן.' };
  }, [bfManual, bfManualAt, profile?.gender, tapeInputs]);

  const lbm = weight && bfAuto.bf != null ? round2(weight * (1 - bfAuto.bf / 100)) : null;
  const basisLabel = bfAuto.bf != null ? 'מסת גוף רזה (LBM)' : 'משקל כולל (BW)';
  const basisExplain =
    bfAuto.bf != null
      ? `חישוב לפי LBM: משקל × (1 − %שומן). ${bfAuto.explain}`
      : 'אין %שומן מניח/מחושב → מחשבים לפי משקל כולל (BW).';

  /* ----- 4.3 ברירת מחדל ל-g/kg מהיעדים ----- */
  const def = useMemo(() => defaultGpkFromGoals(goals, weight, bfAuto.bf), [goals, weight, bfAuto.bf]);

  /* ----- 4.4 טעינה/שמירה יציבה של g/kg ----- */
  const [gpk, setGpk] = useState<number>(() => {
    const ls = typeof window !== 'undefined' ? toNum(localStorage.getItem('protein_gpk')) : null;
    return ls ?? def.value;
  });
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [savingSettings, setSavingSettings] = useState<'idle' | 'saving' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // טעינה מה-DB (אם קיים — גובר על localStorage והדיפולט)
  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!currentUserId) { setLoadingSettings(false); return; }
      const { data, error } = await supabase
        .from('user_protein_settings')
        .select('grams_per_kg, updated_at')
        .eq('user_id', currentUserId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ignore) return;

      if (!error && data && toNum(data.grams_per_kg) != null) {
        setGpk(Number(data.grams_per_kg));
      } else {
        // אם אין שורה — נשארים עם מה שיש (LS/דיפולט)
      }
      setLoadingSettings(false);
    })();
    return () => { ignore = true; };
  }, [currentUserId]);

  // גיבוי ל-localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('protein_gpk', String(gpk));
  }, [gpk]);

  // שמירה ל-DB (Debounce) — UPSERT לפי user_id (כמו בגרסה שעבדה)
  useEffect(() => {
    if (loadingSettings || !currentUserId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        setSavingSettings('saving');

        const payload = {
          user_id: currentUserId,
          grams_per_kg: Number(gpk),
          source_key: 'custom',
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('user_protein_settings')
          .upsert(payload, { onConflict: 'user_id' });

        if (error) throw error;

        setSavingSettings('idle');
      } catch (e) {
        console.error('save protein gpk failed', e);
        setSavingSettings('error');
      }
    }, 400);

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [gpk, currentUserId, loadingSettings]);


  /* ----- 4.5 חישובי UI ----- */
  const basisKg = bfAuto.bf != null && lbm != null ? lbm : (weight ?? null);
  const targetAbs = basisKg ? round2(gpk * basisKg) : null;

  const consumed = Number.isFinite(proteinToday) ? proteinToday : 0;
  const pct = targetAbs && targetAbs > 0 ? Math.max(0, Math.min(100, (consumed / targetAbs) * 100)) : 0;
  const remain = targetAbs != null ? round2(targetAbs - consumed) : null;

  // per-meal cue (0.30–0.40 g/kg per meal) — לפי הבסיס שנבחר אוטומטית
  const perMealLow = round2(0.30 * (basisKg ?? 0));
  const perMealHigh = round2(0.40 * (basisKg ?? 0));

  const band = recommendedBand(goals);
  const risk = proteinCoaching({ gpk, goals, bf: bfAuto.bf });

  /* ----- 4.6 Render ----- */
  return (
    <SectionCard title="יעד חלבון יומי — שקוף ומותאם אישית">
      {loadingBase ? (
        <div className="text-sm opacity-70">טוען נתונים…</div>
      ) : !weight ? (
        <div className="text-sm text-amber-700 dark:text-amber-300">
          לא נמצא משקל עדכני. הוסף/י משקל בטבלת <b>body_measurements</b> או בפרופיל כדי לחשב יעד חלבון.
        </div>
      ) : (
        <div className="grid gap-6">
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <KPI
              label="משקל מקור"
              value={`${round2(weight)} ק״ג`}
              hint={
                weightSource === 'measurement'
                  ? `מ־body_measurements${weightAt ? ` · ${new Date(weightAt).toLocaleDateString('he-IL')}` : ''}`
                  : weightSource === 'profile'
                  ? 'מהפרופיל (מומלץ לעדכן מדידה)'
                  : undefined
              }
            />
            <KPI
              label="% שומן בשימוש"
              value={bfAuto.bf != null ? `${round2(bfAuto.bf)}%` : '—'}
              hint={bfAuto.explain}
            />
            <KPI label="בסיס לחישוב" value={basisLabel} hint={basisExplain} />
            <KPI
              label="יעד חלבון"
              value={targetAbs != null ? `${targetAbs} ג׳` : '—'}
              hint={`טווח מומלץ: ${band.min}–${band.max} g/kg (${band.label})`}
            />
          </div>

          {/* Controls: רק סליידר g/kg */}
          <div className="rounded-xl p-4 ring-1 ring-black/10 dark:ring-white/10 bg-gradient-to-br from-white to-black/[.02] dark:from-neutral-900 dark:to-neutral-800">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">בחר/י יעד אישי — גרם לק״ג (לפי הבסיס האוטומטי)</div>
              <div className="opacity-70">
                {round2(gpk)} g/kg {savingSettings === 'saving' ? '· שומר…' : savingSettings === 'error' ? '· שמירה נכשלה (נשמר מקומית)' : ''}
              </div>
            </div>
            <div className="mt-1 text-xs opacity-80">
              מומלץ למטרה שלך: <b>{band.min}–{band.max} g/kg</b> ({band.label})
            </div>
            <input
              type="range"
              min={0.8}
              max={2.4}
              step={0.1}
              value={gpk}
              onChange={(e) => setGpk(Number(e.target.value))}
              className="w-full mt-3"
              aria-label="סליידר יעד חלבון (g/kg)"
              disabled={loadingSettings}
            />
            <div className="flex justify-between text-xs opacity-70">
              <span>0.8</span><span>1.2</span><span>1.6</span><span>2.0</span><span>2.4</span>
            </div>

            {/* Calculation breakdown */}
            <div className="mt-4 text-xs opacity-80">
              {basisKg != null && targetAbs != null ? (
                <>
                  חישוב: <b>{basisLabel}</b> = <b>{round2(basisKg)} ק״ג</b> · <b>{round2(gpk)} g/kg</b> ⇒ <b>{targetAbs} ג׳/יום</b>. {basisExplain}
                </>
              ) : (
                'אין בסיס חוקי לחישוב כרגע.'
              )}
            </div>

            {/* Progress */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm">
                <div className="font-medium">התקדמות היום לעבר היעד</div>
                <div className="opacity-70">{targetAbs != null ? `${round2(consumed)} / ${targetAbs} ג׳` : '—'}</div>
              </div>
              <div className="mt-2 h-3 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden" aria-label="התקדמות חלבון">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-400 transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {remain != null && (
                <div className="mt-2 text-xs opacity-80">{remain >= 0 ? `נותרו ${remain} ג׳ היום.` : `חריגה של ${Math.abs(remain)} ג׳.`}</div>
              )}
            </div>

            {/* Coaching / Risk */}
            <RiskBox items={risk.items} legend={risk.legend} />

            {/* Per-meal cue */}
            <div className="mt-3 text-xs opacity-70">
              טיפ פריסה: 0.30–0.40 g/kg (לפי הבסיס האוטומטי) לכל ארוחה ⇒ אצלך ≈ {perMealLow}–{perMealHigh} ג׳ לארוחה (3–5 ארוחות).
            </div>

            {/* עזרה: איך לקבל %שומן בלי מכשיר */}
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer font-medium">אין מכשיר %שומן? כך תקבל/י חישוב אוטומטי</summary>
              <div className="mt-2 space-y-1">
                <div>השלמת שדות במדידה עוזרת לנו לחשב %שומן לפי נוסחת Navy:</div>
                <ul className="list-disc pr-5 space-y-1">
                  <li><b>height_cm</b> — גובה בס״מ (מהפרופיל).</li>
                  <li><b>neck_cm</b> — היקף צוואר.</li>
                  <li><b>waist_navel_cm</b> (מועדף) או <b>waist_cm</b> / <b>waist_narrow_cm</b> — היקף מותן.</li>
                  <li>לנשים גם <b>hips_cm</b> — היקף אגן.</li>
                </ul>
                <div className="opacity-70">
                  אם תמלא/י את ההיקפים — נחשב %שומן אוטומטית ונשתמש ב-LBM; אם קיים גם ערך ידני <b>body_fat_percent</b> — הוא יגבר.
                </div>
              </div>
            </details>

            {/* Evidence */}
            <details className="mt-4 text-xs">
              <summary className="cursor-pointer font-medium">מקורות/מחקרים שעליהם מבוסס החישוב</summary>
              <ul className="mt-2 space-y-1 list-disc pr-5">
                {EVIDENCE.map((s, i) => (
                  <li key={i}>
                    <a href={s.href} target="_blank" rel="noreferrer" className="underline">
                      {s.title}
                    </a>
                    {s.note ? <> — <span className="opacity-80">{s.note}</span></> : null}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ========= SECTION 5 — Defaults & bands ========= */
function defaultGpkFromGoals(goals: UserGoal[], weight: number | null, bf: number | null) {
  const has = (k: string) => goals.some((g) => g.goal_key === k);
  if (has('cutting')) {
    if (weight && bf != null) {
      const fracLBM = Math.max(0, Math.min(1, 1 - bf / 100));
      return { value: round2(2.3 * fracLBM), reason: 'חיטוב (מבוסס LBM — Helms 2014)' };
    }
    return { value: 2.0, reason: 'חיטוב' };
  }
  if (has('recomp')) return { value: 2.0, reason: 'ריקומפ' };
  if (has('bulking')) return { value: 1.8, reason: 'מסה' };
  return { value: 1.6, reason: 'כללי למתאמנים' };
}

function recommendedBand(goals: UserGoal[]) {
  const has = (k: string) => goals.some((g) => g.goal_key === k);
  if (has('cutting'))  return { min: 1.8, max: 2.3, label: 'חיטוב/גרעון' };
  if (has('recomp'))   return { min: 1.8, max: 2.2, label: 'ריקומפ' };
  if (has('bulking'))  return { min: 1.6, max: 2.2, label: 'מסה' };
  return { min: 1.4, max: 2.0, label: 'תחזוקה/כללי' };
}

/* ========= SECTION 6 — Coaching & UI bits ========= */
function proteinCoaching({
  gpk,
  goals,
  bf,
}: {
  gpk: number;
  goals: UserGoal[];
  bf: number | null;
}) {
  const items: { level: 'ok' | 'caution' | 'danger'; text: string }[] = [];
  const legend = { ok: '✅', caution: '⚠️', danger: '⛔' } as const;

  const has = (k: string) => goals.some((g) => g.goal_key === k);

  if (gpk < 1.0) {
    items.push({ level: 'caution', text: 'נמוך למתאמנים — עלול לפגוע בשימור שריר בגרעון.' });
  } else if (gpk < 1.4) {
    items.push({ level: 'ok', text: 'סביר לתחזוקה, אך למתאמני כוח נהוג ≥1.6 g/kg.' });
  } else if (gpk <= 2.2) {
    items.push({ level: 'ok', text: 'טווח יעיל לרוב המתאמנים לבניית/שמירת שריר.' });
  } else if (gpk <= 2.4) {
    items.push({ level: 'caution', text: 'גבוה—בד״כ ללא תועלת נוספת; שמור/י על איזון קלורי/סיבים/מיקרו.' });
  } else {
    items.push({ level: 'danger', text: 'גבוה מאוד—נדיר שנחוץ; שקול/י לרדת לכיוון 1.6–2.2 g/kg.' });
  }

  if (has('cutting')) {
    if (bf == null) {
      items.push({ level: 'ok', text: 'בחיטוב ללא %שומן: 1.8–2.2 g/kg מתאים לשימור מסת שריר.' });
    } else {
      items.push({ level: 'ok', text: 'בחיטוב עם %שומן: יעד לפי LBM (~2.3 g/kg LBM) מדויק יותר.' });
    }
  } else if (has('bulking')) {
    items.push({ level: 'ok', text: 'במסה: ≥1.6 g/kg בד״כ מספיק — הדגש על עודף קלורי ואימוני כוח.' });
  } else if (has('recomp')) {
    items.push({ level: 'ok', text: 'בריקומפ: 1.8–2.2 g/kg תומך שמירה/בנייה בגרעון קטן.' });
  }

  return { items, legend };
}

function KPI({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg p-3 ring-1 ring-black/10 dark:ring-white/10 bg-black/[.03] dark:bg-white/[.06]">
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-xs opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}

function RiskBox({ items, legend }: ReturnType<typeof proteinCoaching>) {
  return (
    <div className="mt-4 rounded-lg p-3 ring-1 ring-black/10 dark:ring-white/10 bg-black/[.03] dark:bg-white/[.06]">
      <div className="text-sm font-medium mb-1">השלכות/טיפים לבחירה שלך:</div>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2">
            <span>{legend[it.level]}</span>
            <span className={it.level === 'danger' ? 'text-red-600' : it.level === 'caution' ? 'text-amber-600' : ''}>
              {it.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
