// src/app/nutrition/ProteinGoals.tsx
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

  // שמירה ל-DB (Debounce) — UPSERT לפי user_id
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
  const isOver = targetAbs != null && consumed > targetAbs;

  // per-meal cue (0.30–0.40 g/kg per meal)
  const perMealLow = round2(0.30 * (basisKg ?? 0));
  const perMealHigh = round2(0.40 * (basisKg ?? 0));

  const band = recommendedBand(goals);
  const risk = proteinCoaching({ gpk, goals, bf: bfAuto.bf });

  /* ----- 4.6 Render ----- */
  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {loadingBase ? (
        <div className="text-sm opacity-70 p-4 text-center">טוען נתונים…</div>
      ) : !weight ? (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 rounded-2xl text-sm text-center border border-amber-200 dark:border-amber-800/30">
          לא נמצא משקל עדכני. הוסף/י משקל בטבלת <b>מדידות מעקב</b> או בפרופיל כדי לחשב יעד חלבון.
        </div>
      ) : (
        <>
          {/* 1. Main Dashboard Card */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[28px] p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white opacity-[0.03] rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-black opacity-10 rounded-full blur-3xl -ml-8 -mb-8 pointer-events-none"></div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-blue-100 font-medium text-sm tracking-wide">חלבון היום</h2>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-4xl md:text-5xl font-extrabold tracking-tight tabular-nums">{round2(consumed)}</span>
                    <span className="text-blue-200 font-medium opacity-80">/ {targetAbs ?? '—'} ג׳</span>
                  </div>
                </div>
                <div className="bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1.5">
                   🥩 מטרה: {band.label}
                </div>
              </div>

              <div className="space-y-2.5">
                <div className="flex justify-between text-sm font-medium text-blue-100">
                  <span>{remain != null ? (remain >= 0 ? `נותרו ${remain} ג׳` : `עברת ב-${Math.abs(remain)} ג׳`) : '—'}</span>
                  <span className="font-bold">{Math.round(pct)}%</span>
                </div>
                <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden p-0.5 shadow-inner">
                  <div 
                    className={`h-full rounded-full transition-all duration-700 ease-out shadow-sm ${isOver ? 'bg-emerald-400' : 'bg-white'}`} 
                    style={{ width: `${pct}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. Top Level KPIs */}
          <div className="grid grid-cols-2 gap-3">
             <KPI 
               label="משקל בשימוש" 
               value={`${round2(weight)} ק״ג`} 
               hint={weightSource === 'measurement' && weightAt ? new Date(weightAt).toLocaleDateString('he-IL') : 'מפרופיל'} 
             />
             <KPI 
               label="% שומן בשימוש" 
               value={bfAuto.bf != null ? `${round2(bfAuto.bf)}%` : '—'} 
               hint={bfAuto.bf != null ? basisLabel : 'חסר נתון'} 
             />
          </div>

          {/* 3. Advanced Settings Accordion */}
          <details className="group bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-black/5 dark:ring-white/5 shadow-sm overflow-hidden transition-all">
            <summary className="p-4 flex items-center justify-between cursor-pointer font-semibold text-sm select-none hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                </div>
                התאמת יעד והסברים מחקריים
              </div>
              <span className="transition-transform group-open:rotate-180 opacity-50">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </span>
            </summary>
            
            <div className="p-4 pt-2 border-t border-black/5 dark:border-white/5 space-y-5">
              
              {/* Slider Card */}
              <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-4 border border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="font-bold flex items-center gap-2">
                    <span className="opacity-70">🎯</span> התאמה אישית (g/kg)
                  </span>
                  <span className="bg-white dark:bg-neutral-800 px-2.5 py-1 rounded-md text-xs font-mono font-bold shadow-sm border border-black/5 dark:border-white/5">
                    {round2(gpk)} g/kg
                  </span>
                </div>
                
                <input
                  type="range"
                  min={0.8} max={2.4} step={0.1}
                  value={gpk}
                  onChange={(e) => setGpk(Number(e.target.value))}
                  className="w-full accent-blue-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  disabled={loadingSettings}
                />
                
                <div className="flex justify-between text-[10px] opacity-50 mt-2 font-mono tracking-wider">
                  <span>0.8</span>
                  <span>1.6</span>
                  <span>2.4</span>
                </div>

                <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/5 text-xs opacity-80 leading-relaxed">
                  {basisKg != null && targetAbs != null ? (
                    <>
                      חישוב היעד: <b>{basisLabel}</b> ({round2(basisKg)} ק״ג) × <b>{round2(gpk)}</b> = <b>{targetAbs} ג׳ ביום.</b>
                      <div className="mt-1 opacity-70 italic">{basisExplain}</div>
                    </>
                  ) : (
                    'לא ניתן לחשב יעד כרגע בגלל חוסר בנתונים.'
                  )}
                </div>

                {savingSettings === 'error' && <div className="mt-2 text-[10px] text-red-500">שמירה בענן נכשלה (נשמר מקומית)</div>}
              </div>

              <RiskBox items={risk.items} legend={risk.legend} />

              <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl border border-blue-100 dark:border-blue-900/20 text-xs text-blue-800 dark:text-blue-300">
                <b>💡 טיפ חלוקה בארוחות:</b>
                <br/>
                מומלץ לחלק את החלבון ל-3-5 ארוחות. למשקל שלך מומלץ לאכול כ־<b>{perMealLow}–{perMealHigh} ג׳</b> חלבון לארוחה כדי למקסם סינתזת חלבון שריר (MPS).
              </div>

              {/* עזרה: Navy Method */}
              <div className="space-y-2 pt-2">
                <p className="text-sm font-bold opacity-90">איך לקבל %שומן מדויק יותר?</p>
                <div className="text-xs opacity-80 leading-relaxed space-y-1">
                  השלמת שדות בטבלת המדידות תאפשר לנו לחשב %שומן לפי נוסחת Navy האמריקאית:
                  <ul className="list-disc pr-4 mt-1 space-y-0.5">
                    <li><b>גובה</b> (מהפרופיל)</li>
                    <li><b>צוואר</b> (בסיס הצוואר)</li>
                    <li><b>מותן</b> (בגובה הטבור)</li>
                    <li>לנשים גם <b>אגן</b> (ירכיים בנקודה הרחבה)</li>
                  </ul>
                  הזנת הנתונים האלו משפרת משמעותית את דיוק היעד.
                </div>
              </div>

              {/* Evidence */}
              <div className="pt-2 border-t border-black/5 dark:border-white/5">
                <p className="text-xs font-bold opacity-70 mb-2 uppercase tracking-wider">ביסוס מחקרי (Evidence)</p>
                <ul className="space-y-2 text-xs opacity-80">
                  {EVIDENCE.map((s, i) => (
                    <li key={i} className="leading-snug">
                      <a href={s.href} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                        {s.title}
                      </a>
                      {s.note && <span className="block opacity-70 mt-0.5">{s.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>

            </div>
          </details>
        </>
      )}
    </div>
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
    <div className="flex flex-col bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center border border-black/5 dark:border-white/5 shadow-sm">
      <span className="text-[10px] opacity-60 font-bold mb-1 tracking-wider">{label}</span>
      <span className="text-sm font-bold text-blue-900 dark:text-blue-100">{value}</span>
      {hint && <span className="text-[9px] opacity-50 mt-1">{hint}</span>}
    </div>
  );
}

function RiskBox({ items, legend }: ReturnType<typeof proteinCoaching>) {
  if (!items.length) return null;
  return (
    <ul className="space-y-2 text-xs">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 leading-snug">
          <span>{legend[it.level]}</span>
          <span className={it.level === 'danger' ? 'text-red-600 font-bold' : it.level === 'caution' ? 'text-amber-600 font-medium' : 'opacity-80'}>
            {it.text}
          </span>
        </li>
      ))}
    </ul>
  );
}