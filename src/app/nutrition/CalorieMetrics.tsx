// src/app/nutrition/CalorieMetrics.tsx

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { round2 } from './utils';

/* =========================
   TYPES & HELPERS
   ========================= */

type Totals = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

export type DayAgg = {
  dayKey: string; // YYYY-MM-DD
  totals: Totals;
};

type Gender = 'male' | 'female' | 'other' | 'unspecified';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';
type Profile = {
  user_id: string;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
  age_years?: number | null;
  date_of_birth?: string | null;
};
type UserGoal = { id: number; goal_key: string; label: string };

type LatestMeasurement = {
  weightKg: number | null;
  bodyFatPercent: number | null;
  measuredAt: string | null;
  neck_cm: number | null;
  waist_navel_cm: number | null;
  waist_cm: number | null;
  waist_narrow_cm: number | null;
  hips_cm: number | null;
};

/* --- Helper: Navy Method Logic --- */
const log10 = (x: number) => Math.log(x) / Math.LN10;
const toNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function estimateBfFromTape(opts: {
  gender: Gender | null;
  height_cm: number | null;
  neck_cm: number | null;
  waist_cm_like: number | null; 
  hips_cm: number | null;
}): number | null {
  const cm2in = (cm: number) => cm / 2.54;

  const h = toNum(opts.height_cm);
  const neck = toNum(opts.neck_cm);
  const waist = toNum(opts.waist_cm_like);
  const hips = toNum(opts.hips_cm);

  if (!h || !neck || !waist) return null;

  const hIn = cm2in(h);
  const neckIn = cm2in(neck);
  const waistIn = cm2in(waist);

  if (opts.gender === 'female') {
    if (!hips) return null;
    const hipsIn = cm2in(hips);
    const val = 163.205 * log10(waistIn + hipsIn - neckIn) - 97.684 * log10(hIn) - 78.387;
    return Math.max(2, Math.min(60, round2(val)));
  } else {
    // Male default
    const diff = waistIn - neckIn;
    if (diff <= 0) return null;
    const val = 86.010 * log10(diff) - 70.041 * log10(hIn) + 36.76;
    return Math.max(2, Math.min(50, round2(val)));
  }
}

/* =========================
   COMPONENT
   ========================= */

export default function CalorieMetrics({
  profile,
  activityLevel,
  goals,
  todayTotals,
  last7,
}: {
  profile: Profile | null;
  activityLevel: ActivityLevel | null;
  goals: UserGoal[];
  todayTotals: Totals;
  last7: DayAgg[];
}) {
  /* ---------- 1. טעינת מדידה אחרונה ---------- */
  const [latest, setLatest] = useState<LatestMeasurement>({ 
    weightKg: null, bodyFatPercent: null, measuredAt: null,
    neck_cm: null, waist_navel_cm: null, waist_cm: null, waist_narrow_cm: null, hips_cm: null
  });
  const [latestManualBf, setLatestManualBf] = useState<number | null>(null);
  const [loadingLatest, setLoadingLatest] = useState<boolean>(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        let uid: string | undefined = profile?.user_id;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id;
        }
        if (!uid) { setLoadingLatest(false); return; }

        const p1 = supabase
          .from('body_measurements')
          .select(`
            weight_kg, body_fat_percent, measured_at,
            neck_cm, waist_cm, waist_navel_cm, waist_narrow_cm, hips_cm
          `)
          .eq('user_id', uid)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const p2 = supabase
          .from('body_measurements')
          .select('body_fat_percent')
          .eq('user_id', uid)
          .not('body_fat_percent', 'is', null)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const [resLatest, resBf] = await Promise.all([p1, p2]);

        if (ignore) return;
        
        if (!resLatest.error && resLatest.data) {
          const d = resLatest.data;
          setLatest({
            weightKg: toNum(d.weight_kg),
            bodyFatPercent: toNum(d.body_fat_percent),
            measuredAt: d.measured_at ?? null,
            neck_cm: toNum(d.neck_cm),
            waist_cm: toNum(d.waist_cm),
            waist_navel_cm: toNum(d.waist_navel_cm),
            waist_narrow_cm: toNum(d.waist_narrow_cm),
            hips_cm: toNum(d.hips_cm),
          });
        } else {
          setLatest({ 
            weightKg: null, bodyFatPercent: null, measuredAt: null,
            neck_cm: null, waist_navel_cm: null, waist_cm: null, waist_narrow_cm: null, hips_cm: null
          });
        }

        if (!resBf.error && resBf.data) {
          setLatestManualBf(toNum(resBf.data.body_fat_percent));
        } else {
          setLatestManualBf(null);
        }

      } finally {
        if (!ignore) setLoadingLatest(false);
      }
    })();
    return () => { ignore = true; };
  }, [profile?.user_id]);

  /* ---------- 2. חישוב נתוני בסיס חכמים ---------- */
  const gender = (profile?.gender ?? 'unspecified') as Gender;
  const heightCm = profile?.height_cm ?? null;
  const weight = latest.weightKg ?? profile?.weight_kg ?? null;
  const ageYears = getAgeYears(profile);

  const calculatedBf = useMemo(() => {
    const manual = latest.bodyFatPercent ?? latestManualBf ?? profile?.body_fat_percent;
    if (manual != null) return manual;
    const waistLike = latest.waist_navel_cm ?? latest.waist_cm ?? latest.waist_narrow_cm;
    return estimateBfFromTape({
      gender, height_cm: heightCm, neck_cm: latest.neck_cm, waist_cm_like: waistLike, hips_cm: latest.hips_cm,
    });
  }, [latest, latestManualBf, profile?.body_fat_percent, gender, heightCm]);

  const bf = calculatedBf ?? null;
  
  const bmr = calcBMR({
    weightKg: weight, heightCm, ageYears, bfPercent: typeof bf === 'number' ? bf : null, gender,
  });

  /* ---------- דגל יום מנוחה להיום ---------- */
  const [isRestToday, setIsRestToday] = useState<boolean>(false);
  useEffect(() => {
    (async () => {
      try {
        let uid: string | undefined = profile?.user_id;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id;
        }
        if (!uid) return;

        const d = new Date();
        const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const { data } = await supabase
          .from('user_day_status')
          .select('is_rest')
          .eq('user_id', uid)
          .eq('day', dayStr)
          .maybeSingle();

        setIsRestToday(!!data?.is_rest);
      } catch { /* noop */ }
    })();
  }, [profile?.user_id]);

  /* ---------- אחוז יעד ו-TDEE מותאם (Persisted) ---------- */
  const defaultPctFromGoals = useMemo(() => {
    const has = (k: string) => goals.some((g) => g.goal_key === k);
    if (has('cutting_fast')) return 25;
    if (has('cutting')) return 20;
    if (has('recomp')) return 10;
    if (has('bulking')) return -10;
    return 0;
  }, [goals]);

  const [pct, setPct] = useState<number>(defaultPctFromGoals);
  const [customTdee, setCustomTdee] = useState<number | null>(null);
  
  const [loadingPct, setLoadingPct] = useState<boolean>(true);
  const [savingPct, setSavingPct] = useState<'idle' | 'saving' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserId = profile?.user_id;

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        let uid: string | undefined = currentUserId;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id;
        }
        if (!uid) { setLoadingPct(false); return; }

        const { data, error } = await supabase
          .from('user_calorie_settings')
          .select('deficit_pct, custom_tdee')
          .eq('user_id', uid)
          .maybeSingle();

        if (ignore) return;
        
        if (!error && data) {
          if (typeof data.deficit_pct === 'number') setPct(data.deficit_pct);
          else setPct(defaultPctFromGoals);

          if (typeof data.custom_tdee === 'number') setCustomTdee(data.custom_tdee);
          else setCustomTdee(null);
        } else {
          setPct(defaultPctFromGoals);
        }
      } finally {
        if (!ignore) setLoadingPct(false);
      }
    })();
    return () => { ignore = true; };
  }, [currentUserId, defaultPctFromGoals]);

  useEffect(() => {
    if (loadingPct || !currentUserId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        setSavingPct('saving');
        const { error } = await supabase
          .from('user_calorie_settings')
          .upsert({ user_id: currentUserId, deficit_pct: pct }, { onConflict: 'user_id' });
        if (error) throw error;
        setSavingPct('idle');
      } catch {
        setSavingPct('error');
      }
    }, 500);

    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [pct, currentUserId, loadingPct]);

  /* ---------- activity factor + TDEE Final Calculation ---------- */
  const { factor: baseFactor, label: actLabel } = activityMultiplier(activityLevel);
  const restAdj = restDayAdjustment(activityLevel); 
  const effectiveFactor = isRestToday ? Math.max(1.1, round2(baseFactor * (1 + restAdj))) : baseFactor;
  
  // TDEE Logic: Use Calibrated TDEE if available, otherwise calculate from BMR
  const calculatedTdee = bmr ? round2(bmr * effectiveFactor) : null;
  const tdee = customTdee ? customTdee : calculatedTdee;

  /* ---------- Protein g/kg (Persisted + LocalStorage Check) ---------- */
  const [gpk, setGpk] = useState<number | null>(() => {
    if (typeof window !== 'undefined') {
      const ls = localStorage.getItem('protein_gpk');
      if (ls) return Number(ls);
    }
    return null;
  });
  const [loadingGpk, setLoadingGpk] = useState<boolean>(true);
  const hasBf = typeof bf === 'number' && bf >= 0 && bf <= 60;

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const fallback = getOptimalGpkForPct(pct, hasBf ? (bf as number) : null);
        let uid: string | undefined = profile?.user_id;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id;
        }
        if (!uid) { setGpk(prev => prev ?? fallback); setLoadingGpk(false); return; }

        const { data, error } = await supabase
          .from('user_protein_settings')
          .select('grams_per_kg')
          .eq('user_id', uid)
          .maybeSingle();

        if (ignore) return;
        if (!error && data && Number.isFinite(Number(data.grams_per_kg))) {
          const val = Number(data.grams_per_kg);
          setGpk(val);
          if (typeof window !== 'undefined') localStorage.setItem('protein_gpk', String(val));
        } else {
          setGpk(prev => prev ?? fallback);
        }
      } finally {
        if (!ignore) setLoadingGpk(false);
      }
    })();
    return () => { ignore = true; };
  }, [profile?.user_id, bf, hasBf]);

  // שמירה של ערך החלבון ב-localStorage כשהוא משתנה בממשק
  useEffect(() => {
    if (gpk !== null && typeof window !== 'undefined') {
      localStorage.setItem('protein_gpk', String(gpk));
    }
  }, [gpk]);

  // שמירה של ערך החלבון למסד הנתונים כשהמשתמש מזיז סליידר
  const gpkSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loadingGpk || !currentUserId || gpk === null) return;
    if (gpkSaveTimer.current) clearTimeout(gpkSaveTimer.current);

    gpkSaveTimer.current = setTimeout(async () => {
      try {
        await supabase
          .from('user_protein_settings')
          .upsert({ 
              user_id: currentUserId, 
              grams_per_kg: gpk, 
              source_key: 'auto_adjusted', 
              updated_at: new Date().toISOString() 
          }, { onConflict: 'user_id' });
      } catch (e) {
        console.error('Failed to save GPK', e);
      }
    }, 500);

    return () => { if (gpkSaveTimer.current) clearTimeout(gpkSaveTimer.current); };
  }, [gpk, currentUserId, loadingGpk]);

  /* ---------- Macros Calculation ---------- */
  const { targetCalories, delta, modeLabel } = usePlanTargetWithPct({ tdee, pct });

  const calsToday = todayTotals.calories ?? 0;
  const p = todayTotals.protein_g ?? 0;
  const c = todayTotals.carbs_g ?? 0;
  const f = todayTotals.fat_g ?? 0;

  const avg7 = last7.length > 0 ? round2(last7.reduce((s, d) => s + (d.totals.calories ?? 0), 0) / last7.length) : 0;
  
  const progressPct = targetCalories && targetCalories > 0 ? Math.max(0, Math.min(100, (calsToday / targetCalories) * 100)) : 0;
  const remain = targetCalories != null ? round2(targetCalories - calsToday) : null;
  const remainText = remain == null ? '—' : remain >= 0 ? `נותרו ${remain} קק״ל` : `חריגה של ${Math.abs(remain)} קק״ל`;

  const risk = riskAssessment({ pct, bmr, tdee, targetCalories, gender });

  // הגמישות המטבולית וחישוב היעדים החכם (Flexible Dieting)
  const macroTargets = useMemo(() => {
    if (!targetCalories || !weight) return null;
    
    // 1. חישוב יעד חלבון בסיסי (מקודש, שומרים לו קלוריות מראש)
    const lbm = hasBf ? weight * (1 - (bf as number) / 100) : null;
    const basisKg = lbm ?? weight;
    const usedGpk = (gpk ?? getOptimalGpkForPct(pct, hasBf ? (bf as number) : null));

    let baseProt_g = round2(basisKg * usedGpk);
    let baseProt_kcal = baseProt_g * 4;

    // הגנה מקריסת תקציב: אם החלבון לבדו עובר את היעד הקלורי היומי
    if (baseProt_kcal > targetCalories) {
        baseProt_kcal = targetCalories;
        baseProt_g = baseProt_kcal / 4;
        return {
            protein_g: round2(baseProt_g), protein_kcal: round2(baseProt_kcal), 
            fat_g: round2(Math.max(f, 0)), fat_kcal: round2(Math.max(f * 9, 0)), 
            carbs_g: round2(Math.max(c, 0)), carbs_kcal: round2(Math.max(c * 4, 0)), 
            total_kcal: targetCalories
        };
    }

    // 2. חישוב יעדי בסיס לשומן ופחמימה (Base Targets)
    let baseRemain_kcal = targetCalories - baseProt_kcal;

    const inDeficit = pct >= 10;
    let fatPerKg = inDeficit ? 0.8 : 1.0;
    if (isRestToday) fatPerKg = round2(fatPerKg * 1.1); 
    
    let baseFat_g = weight * fatPerKg;
    let baseFat_kcal = baseFat_g * 9;

    if (baseFat_kcal > baseRemain_kcal) {
        baseFat_kcal = baseRemain_kcal;
        baseFat_g = baseFat_kcal / 9;
    }

    let baseCarb_kcal = baseRemain_kcal - baseFat_kcal;
    let baseCarb_g = baseCarb_kcal / 4;

    // איזון בסיסי תיאורטי
    if (baseCarb_g < 80 && baseFat_g > (weight * 0.5)) {
      const fatFloor_g = weight * 0.5; 
      const fatFloor_kcal = fatFloor_g * 9;
      
      const fatAvailableToSacrifice = Math.max(0, baseFat_kcal - fatFloor_kcal);
      const carbsNeededKcal = (80 - baseCarb_g) * 4;
      
      const transferKcal = Math.min(carbsNeededKcal, fatAvailableToSacrifice);
      
      baseFat_kcal -= transferKcal;
      baseCarb_kcal += transferKcal;
    }

    // 3. איזון דינמי בזמן אמת ("גמישות מטבולית" / Flexible Dieting)
    const minFat_g = weight * 0.5;
    const minCarb_g = 50;

    const currentCarb_kcal = c * 4;
    const currentFat_kcal = f * 9;

    // עתודה לקלוריות של חלבון שעוד לא נצרך
    const proteinDeficit_kcal = Math.max(0, baseProt_g - p) * 4;
    
    // קלוריות שנותרו בפועל להקצות לשומן ופחמימה - המלך האמיתי של האלגוריתם
    const effectiveRemainCals = Math.max(0, targetCalories - calsToday - proteinDeficit_kcal);

    // חוק ברזל: אם אין יותר תקציב קלורי בכלל, נועלים את היעדים על מה שנאכל בפועל (כדי שיוצג 100%)
    if (effectiveRemainCals <= 0) {
        return {
            protein_g: round2(baseProt_g), 
            protein_kcal: round2(baseProt_kcal), 
            fat_g: round2(Math.max(f, 0)), 
            fat_kcal: round2(Math.max(f * 9, 0)), 
            carbs_g: round2(Math.max(c, 0)), 
            carbs_kcal: round2(Math.max(c * 4, 0)),
            total_kcal: targetCalories,
        };
    }

    // יש לנו קלוריות פנויות (אחרי שריון לחלבון)! נחלק אותן.
    const pool_kcal = currentCarb_kcal + currentFat_kcal + effectiveRemainCals;

    // קביעת יעדי מינימום: לא פחות ממה שאכלנו, ולא פחות מרצפת הבריאות
    let targetFat_kcal = Math.max(currentFat_kcal, minFat_g * 9);
    let targetCarb_kcal = Math.max(currentCarb_kcal, minCarb_g * 4);

    let leftoverPool = pool_kcal - targetFat_kcal - targetCarb_kcal;

    if (leftoverPool > 0) {
      // חלוקת העודף באופן יחסי לפי הגירעון מהיעד המקורי
      const fatDeficit = Math.max(0, baseFat_kcal - targetFat_kcal);
      const carbDeficit = Math.max(0, baseCarb_kcal - targetCarb_kcal);
      const totalDeficit = fatDeficit + carbDeficit;

      if (totalDeficit > 0) {
        const fatShare = fatDeficit / totalDeficit;
        const carbShare = carbDeficit / totalDeficit;
        targetFat_kcal += leftoverPool * fatShare;
        targetCarb_kcal += leftoverPool * carbShare;
      } else {
        // אם מילאנו את שני היעדים ועדיין נשאר תקציב (למשל לא אכלנו מספיק חלבון וזה "דלף" לפחמימה)
        targetCarb_kcal += leftoverPool;
      }
    } else if (leftoverPool < 0) {
      // מקרה קיצון בו סך המינימומים דורש יותר מקלוריות התקציב. נועלים כדי למנוע יעד שלילי.
      targetFat_kcal = Math.max(currentFat_kcal, 0);
      targetCarb_kcal = Math.max(currentCarb_kcal, 0);
    }

    return {
      protein_g: round2(baseProt_g), 
      protein_kcal: round2(baseProt_kcal), 
      fat_g: round2(targetFat_kcal / 9), 
      fat_kcal: round2(targetFat_kcal), 
      carbs_g: round2(targetCarb_kcal / 4), 
      carbs_kcal: round2(targetCarb_kcal),
      total_kcal: targetCalories,
    };
  }, [targetCalories, weight, bf, pct, isRestToday, gpk, hasBf, c, f, p, calsToday]);

  /* ----- SNAPSHOT SAVE TO DB ----- */
  useEffect(() => {
    if (!currentUserId || loadingLatest || loadingPct || loadingGpk) return;
    if (!bmr || !tdee || !targetCalories || !macroTargets) return;

    const timer = setTimeout(async () => {
      try {
        const payload = {
          user_id: currentUserId,
          bmr, tdee, target_calories: targetCalories,
          target_protein_g: macroTargets.protein_g, target_carbs_g: macroTargets.carbs_g, target_fat_g: macroTargets.fat_g,
          current_calories: calsToday, current_protein_g: p, current_carbs_g: c, current_fat_g: f,
          deficit_pct: pct, activity_factor: effectiveFactor, updated_at: new Date().toISOString(),
        };
        const { error } = await supabase.from('user_nutrition_targets').upsert(payload);
        if (error) console.error('Failed to save nutrition snapshot:', error);
      } catch (err) { console.error('Exception saving snapshot:', err); }
    }, 1000); 

    return () => clearTimeout(timer);
  }, [currentUserId, bmr, tdee, targetCalories, macroTargets, pct, effectiveFactor, loadingLatest, loadingPct, loadingGpk, calsToday, p, c, f]);

  const usingMeasurement = latest.weightKg != null || latest.bodyFatPercent != null;
  const weightForText = usingMeasurement ? latest.weightKg : profile?.weight_kg;
  const bfForText = bf;

  /* ----- UI State for the Weekly Average Card (Smart Context) ----- */
  let avgStatus: 'good' | 'bad' | 'neutral' = 'neutral';
  if (targetCalories && avg7 > 0) {
      if (pct >= 0) {
          // בחיטוב או תחזוקה: עמידה ביעד אם אכלת פחות או שווה למטרה (עם באפר קטן של 50 קלוריות)
          avgStatus = avg7 <= (targetCalories + 50) ? 'good' : 'bad';
      } else {
          // במסה: עמידה ביעד אם אכלת יותר או שווה למטרה 
          avgStatus = avg7 >= (targetCalories - 50) ? 'good' : 'bad';
      }
  }

  const bgColors = {
    good: 'bg-emerald-50/40 dark:bg-emerald-900/20 ring-emerald-500/40',
    bad: 'bg-red-50/40 dark:bg-red-900/20 ring-red-500/40',
    neutral: 'bg-white dark:bg-neutral-800 ring-black/5 dark:ring-white/5'
  };

  const statusMessage = avgStatus === 'good' ? '✓ עמידה ביעד' : '⚠️ חריגה מהיעד';
  const statusColorClass = avgStatus === 'good' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400';

  /* ----- Smart Goal Match Indicator ----- */
  const isMatchingGoal = pct === defaultPctFromGoals;
  const mainGoalLabel = goals.length > 0 ? goals[0].label.split('–')[0].trim() : '';
  const defaultPctLabel = defaultPctFromGoals > 0 ? `גרעון ${defaultPctFromGoals}%` : defaultPctFromGoals < 0 ? `עודף ${Math.abs(defaultPctFromGoals)}%` : 'תחזוקה (0%)';

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      
      {/* 1. Main Dashboard Card (Calories) */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-[28px] p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white opacity-[0.03] rounded-full blur-2xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-black opacity-10 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-indigo-100 font-medium text-sm tracking-wide">קלוריות היום</h2>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-4xl md:text-5xl font-extrabold tracking-tight tabular-nums">{round2(calsToday)}</span>
                <span className="text-indigo-200 font-medium opacity-80">/ {targetCalories ?? '—'}</span>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-sm flex items-center gap-1.5">
               {isRestToday ? '🛋️ מנוחה' : '🏋️ אימון'}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between text-sm font-medium text-indigo-100">
              <span>{remainText}</span>
              <span className="font-bold">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-3 w-full bg-black/20 rounded-full overflow-hidden p-0.5 shadow-inner">
              <div 
                className={`h-full rounded-full transition-all duration-700 ease-out shadow-sm ${targetCalories && calsToday > targetCalories ? 'bg-red-400' : 'bg-white'}`} 
                style={{ width: `${Math.min(100, progressPct)}%` }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Macros Grid (App Style) */}
      <div className="grid grid-cols-3 gap-3">
        <MacroAppCard k="חלבון" consumed={p} target={macroTargets?.protein_g} colorClass="bg-blue-500" />
        <MacroAppCard k="פחמימה" consumed={c} target={macroTargets?.carbs_g} colorClass="bg-emerald-500" />
        <MacroAppCard k="שומן" consumed={f} target={macroTargets?.fat_g} colorClass="bg-amber-500" />
      </div>

      {/* 3. Advanced Settings & Adjustments */}
      <details className="group bg-white dark:bg-neutral-800 rounded-2xl ring-1 ring-black/5 dark:ring-white/5 shadow-sm overflow-hidden transition-all">
        <summary className="p-4 flex items-center justify-between cursor-pointer font-semibold text-sm select-none hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </div>
            הגדרות ויעדים (TDEE, BMR)
          </div>
          <span className="transition-transform group-open:rotate-180 opacity-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
          </span>
        </summary>
        
        <div className="p-4 pt-2 border-t border-black/5 dark:border-white/5 space-y-5">
          
          {/* Base Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="BMR המנוחה" value={bmr != null ? `${bmr}` : '—'} />
            <KPI label={customTdee ? 'TDEE (מכויל אישית) ⚡' : 'TDEE (תיאורטי)'} value={tdee != null ? `${tdee}` : '—'} />
            <KPI label="מטרה" value={modeLabelForPct(pct)} />
            <KPI label="פער ליעד" value={delta != null ? `${delta > 0 ? '+' : ''}${delta}` : '—'} />
          </div>

          <div className="text-xs opacity-70 px-1 leading-relaxed">
            {customTdee ? (
                <span className="text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded">המערכת משתמשת בנתון TDEE אישי המבוסס על היסטוריית התזונה והשקילות שלך.</span>
            ) : usingMeasurement ? (
              <>
                מחושב תיאורטית לפי המדידה מ־<b>{latest.measuredAt ? new Date(latest.measuredAt).toLocaleDateString('he-IL') : '—'}</b>: 
                משקל {weightForText ?? '—'} ק״ג {typeof bfForText === 'number' ? ` ושומן ${bfForText}%` : ''}.
              </>
            ) : (
              <>
                מחושב תיאורטית לפי הפרופיל: משקל {weightForText ?? '—'} ק״ג. מומלץ לעדכן מדידה לדייק.
              </>
            )}
          </div>

          {/* Calorie Slider Card */}
          <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-4 border border-black/5 dark:border-white/5">
            {!isMatchingGoal && goals.length > 0 && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-indigo-100 dark:border-indigo-800">
                 <div className="text-xs text-indigo-800 dark:text-indigo-200 leading-relaxed">
                    💡 המטרה המרכזית שהגדרת היא <b>{mainGoalLabel}</b>.
                    <br/>
                    להשגת המטרה, מומלץ לכוון ל-{defaultPctLabel}.
                 </div>
                 <button
                     onClick={() => {
                        setPct(defaultPctFromGoals);
                        setGpk(getOptimalGpkForPct(defaultPctFromGoals, hasBf ? (bf as number) : null));
                     }}
                     className="w-full sm:w-auto text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition-colors whitespace-nowrap"
                 >
                     התאם אוטומטית
                 </button>
              </div>
            )}
            <div className="flex items-center justify-between text-sm mb-4">
              <span className="font-bold flex items-center gap-2">
                <span className="opacity-70">🎯</span> התאמת גרעון / עודף קלורי
              </span>
              <span className="bg-white dark:bg-neutral-800 px-2.5 py-1 rounded-md text-xs font-mono font-bold shadow-sm border border-black/5 dark:border-white/5">
                {pct > 0 ? `גרעון ${pct}%` : pct < 0 ? `עודף ${Math.abs(pct)}%` : 'תחזוקה 0%'}
              </span>
            </div>
            
            <input
              type="range"
              min={-15} max={30} step={1}
              value={pct}
              onChange={(e) => {
                 const newPct = Number(e.target.value);
                 setPct(newPct);
                 setGpk(getOptimalGpkForPct(newPct, hasBf ? (bf as number) : null));
              }}
              className="w-full accent-indigo-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              disabled={loadingPct}
            />
            
            <div className="flex justify-between text-[10px] opacity-50 mt-2 font-medium uppercase tracking-wide">
              <span>מסה (15%-)</span>
              <span>תחזוקה</span>
              <span>חיטוב (30%)</span>
            </div>
            
            <div className="mt-4 pt-4 border-t border-black/5 dark:border-white/5">
              <RiskBox {...risk} />
            </div>
          </div>

          {/* Protein Slider Card (Auto-syncs with calorie slider) */}
          <div className="bg-black/[0.03] dark:bg-white/[0.03] rounded-xl p-4 border border-black/5 dark:border-white/5 mt-4">
            <div className="flex items-center justify-between text-sm mb-4">
              <span className="font-bold flex items-center gap-2">
                <span className="opacity-70">🥩</span> התאמת צריכת חלבון (g/kg)
              </span>
              <span className="bg-white dark:bg-neutral-800 px-2.5 py-1 rounded-md text-xs font-mono font-bold shadow-sm border border-black/5 dark:border-white/5">
                {round2(gpk || 1.6)} g/kg
              </span>
            </div>
            
            <input
              type="range"
              min={0.8} max={2.4} step={0.1}
              value={gpk || 1.6}
              onChange={(e) => setGpk(Number(e.target.value))}
              className="w-full accent-blue-600 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              disabled={loadingGpk}
            />
            
            <div className="flex justify-between text-[10px] opacity-50 mt-2 font-mono tracking-wider mb-2">
              <span>0.8</span>
              <span>1.6</span>
              <span>2.4</span>
            </div>
            <div className="text-[10px] opacity-60 text-center italic mt-2">
                *הערך מותאם אוטומטית למצב הגירעון/עודף שמוגדר מעלה כדי להגן על מסת השריר
            </div>
          </div>

        </div>
      </details>

      {/* 4. History (Minimal Bar Chart Style) - Updated with indicator */}
      <div className={`rounded-2xl ring-1 shadow-sm p-5 transition-colors ${avg7 > 0 ? bgColors[avgStatus] : bgColors.neutral}`}>
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2 text-gray-800 dark:text-gray-200">
          <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-xs">📊</span> 
          ממוצע שבועי: {avg7} קק"ל
          {targetCalories && avg7 > 0 && (
            <span className={`mr-auto px-2.5 py-1 rounded-md text-xs font-bold flex items-center gap-1.5 shadow-sm ${statusColorClass}`}>
              {statusMessage}
            </span>
          )}
        </h3>
        
        <div className="flex justify-between items-end h-32 gap-1.5 md:gap-3 pt-2">
          {last7.slice().reverse().map((d) => {
             const val = d.totals.calories ?? 0;
             const hPct = targetCalories ? Math.min(100, Math.max(10, (val / targetCalories) * 100)) : 50;
             const isOver = targetCalories && val > targetCalories;
             
             return (
               <div key={d.dayKey} className="flex flex-col items-center gap-2 w-full group relative flex-1 h-full justify-end">
                 
                 <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-black/80 text-white text-[10px] py-1 px-2 rounded pointer-events-none whitespace-nowrap z-10">
                   {val} קק"ל
                 </div>
                 
                 <div className="w-full max-w-[32px] bg-gray-100 dark:bg-neutral-700/50 rounded-t-lg relative flex items-end justify-center h-[calc(100%-20px)]">
                    <div 
                      className={`w-full rounded-t-lg transition-all duration-500 ease-out ${isOver ? 'bg-red-400 dark:bg-red-500/80' : 'bg-indigo-500 dark:bg-indigo-500/80'}`} 
                      style={{ height: `${hPct}%` }}
                    />
                 </div>
                 <span className="text-[10px] opacity-60 font-medium font-mono tracking-tighter">
                   {d.dayKey.split('-').slice(1).reverse().join('/')}
                 </span>
               </div>
             );
          })}
        </div>
      </div>
    </div>
  );
}

// ... Helpers ...

function getAgeYears(profile: Profile | null): number | null {
  if (!profile) return null;
  if (typeof profile.age_years === 'number') return profile.age_years;
  const dob = (profile as any).date_of_birth as string | undefined;
  if (!dob) return 37;
  const d = new Date(dob);
  if (isNaN(+d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

function calcBMR({ weightKg, heightCm, ageYears, bfPercent, gender }: any): number | null {
  if (!weightKg || weightKg <= 0) return null;
  if (typeof bfPercent === 'number' && bfPercent >= 0 && bfPercent <= 60) {
    const lbm = weightKg * (1 - bfPercent / 100);
    return round2(370 + 21.6 * lbm);
  }
  if (heightCm && ageYears != null) {
    const s = gender === 'female' ? -161 : 5;
    return round2(10 * weightKg + 6.25 * heightCm - 5 * ageYears + s);
  }
  const k = gender === 'female' ? 22 : 24;
  return round2(k * weightKg);
}

function activityMultiplier(level: ActivityLevel | null | undefined) {
  switch (level) {
    case 'sedentary':  return { factor: 1.15,   label: 'יושבני' };
    case 'light':      return { factor: 1.25, label: 'קל' };
    case 'moderate':   return { factor: 1.35,  label: 'בינוני' };
    case 'very_active':return { factor: 1.50, label: 'גבוה' };
    default:           return { factor: 1.15,   label: 'יושבני' };
  }
}

function restDayAdjustment(level: ActivityLevel | null | undefined) {
  switch (level) {
    case 'sedentary':  return 0;
    case 'light':      return -0.05;
    case 'moderate':   return -0.10;
    case 'very_active':return -0.12;
    default:           return -0.05;
  }
}

function usePlanTargetWithPct({ tdee, pct }: { tdee: number | null; pct: number; }) {
  const targetCalories = tdee == null ? null : round2(tdee * (1 - pct / 100));
  const delta = tdee == null || targetCalories == null ? null : round2(targetCalories - tdee);
  const modeLabel = pct > 0 ? `גרעון ${pct}%` : pct < 0 ? `עודף ${Math.abs(pct)}%` : 'תחזוקה';
  return { targetCalories, delta, modeLabel };
}

function modeLabelForPct(pct: number) {
  if (pct > 0) return 'חיטוב';
  if (pct < 0) return 'מסה';
  return 'תחזוקה';
}

function riskAssessment({ pct, bmr, tdee, targetCalories, gender }: any) {
  const items: { level: 'ok' | 'caution' | 'danger'; text: string }[] = [];
  const deltaPerDay = tdee != null && targetCalories != null ? Math.abs(tdee - targetCalories) : 0;
  const kgPerWeek = round2((deltaPerDay * 7) / 7700);

  if (pct > 0) {
    items.push({ level: 'ok', text: `קצב ירידה משוער: ~${kgPerWeek} ק״ג לשבוע.` });
  } else if (pct < 0) {
    items.push({ level: 'ok', text: `קצב עלייה משוער: ~${kgPerWeek} ק״ג לשבוע (מומלץ לשלב אימוני כוח).` });
  }
  
  if (pct >= 30) {
    items.push({ level: 'danger', text: 'גרעון קיצוני: עלול להוביל לעייפות ולאיבוד מסת שריר. הקפד על צריכת חלבון.' });
  }
  
  if (bmr && targetCalories && targetCalories < (bmr * 0.85)) {
    items.push({ level: 'caution', text: `היעד נמוך מ-85% מה-BMR המנוחה שלך. שים לב לרמות האנרגיה ולהתאוששות.` });
  }
  
  const legend = { ok: '✅', caution: '⚠️', danger: '⛔' } as const;
  return { items, legend };
}

function KPI({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col bg-gray-50 dark:bg-white/5 rounded-xl p-3 text-center border border-black/5 dark:border-white/5 shadow-sm">
      <span className="text-[10px] opacity-60 font-bold mb-1 tracking-wider">{label}</span>
      <span className="text-base font-bold text-indigo-900 dark:text-indigo-100">{value}</span>
    </div>
  );
}

function RiskBox({ items, legend }: ReturnType<typeof riskAssessment>) {
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

function MacroAppCard({ k, consumed = 0, target = 0, colorClass }: { k: string, consumed: number, target?: number, colorClass: string }) {
  const t = target || 0;
  const pct = t > 0 ? Math.min(100, Math.max(0, (consumed / t) * 100)) : 0;
  const isOver = t > 0 && consumed > t;

  return (
    <div className="bg-white dark:bg-neutral-800 rounded-2xl p-3 shadow-sm border border-black/5 dark:border-white/5 flex flex-col items-center justify-center text-center relative overflow-hidden group">
      <span className="text-[11px] opacity-60 font-bold mb-1.5">{k}</span>
      <div className="flex items-baseline gap-1">
        <span className={`font-black text-xl tabular-nums ${isOver ? 'text-red-500' : ''}`}>{round2(consumed)}</span>
        <span className="text-[10px] opacity-40 font-medium">/ {t ? round2(t) : '-'}g</span>
      </div>
      
      <div className="w-full h-1.5 bg-gray-100 dark:bg-neutral-700 rounded-full mt-3 overflow-hidden">
        <div 
          className={`h-full rounded-full transition-all duration-1000 ease-out ${isOver ? 'bg-red-500' : colorClass}`} 
          style={{ width: `${pct}%` }} 
        />
      </div>
    </div>
  );
}

function getOptimalGpkForPct(pct: number, bfPercent: number | null) {
  if (pct <= 0) {
    return 1.8;
  }
  
  const minGpk = 1.8;
  const maxGpk = bfPercent != null ? 2.5 : 2.3; 
  
  const scaled = minGpk + (pct / 30) * (maxGpk - minGpk);
  
  return Math.round(Math.min(maxGpk, Math.max(minGpk, scaled)) * 10) / 10;
}