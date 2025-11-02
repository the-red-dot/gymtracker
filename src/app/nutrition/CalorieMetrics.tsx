// src/app/nutrition/CalorieMetrics.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SectionCard } from './ui';
import { round2 } from './utils';

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
  measuredAt: string | null; // ISO
};

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
  /* ---------- טעינת מדידה אחרונה (body_measurements) ---------- */
  const [latest, setLatest] = useState<LatestMeasurement>({ weightKg: null, bodyFatPercent: null, measuredAt: null });
  const [loadingLatest, setLoadingLatest] = useState<boolean>(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        // קבלת ה־uid
        let uid: string | undefined = profile?.user_id;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id;
        }
        if (!uid) { setLoadingLatest(false); return; }

        // שליפת המדידה האחרונה
        const { data, error } = await supabase
          .from('body_measurements')
          .select('weight_kg, body_fat_percent, measured_at')
          .eq('user_id', uid)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ignore) return;
        if (!error && data) {
          setLatest({
            weightKg: toNum(data.weight_kg),
            bodyFatPercent: toNum(data.body_fat_percent),
            measuredAt: data.measured_at ?? null,
          });
        } else {
          setLatest({ weightKg: null, bodyFatPercent: null, measuredAt: null });
        }
      } finally {
        if (!ignore) setLoadingLatest(false);
      }
    })();
    return () => { ignore = true; };
  }, [profile?.user_id]);

  /* ---------- נתוני בסיס (מעודכנים לפי מדידה) ---------- */
  const weight = latest.weightKg ?? profile?.weight_kg ?? null;
  const heightCm = profile?.height_cm ?? null;
  const bf = latest.bodyFatPercent ?? profile?.body_fat_percent ?? null;
  const ageYears = getAgeYears(profile);
  const gender = (profile?.gender ?? 'unspecified') as Gender;

  const bmr = calcBMR({
    weightKg: weight,
    heightCm,
    ageYears,
    bfPercent: typeof bf === 'number' ? bf : null,
    gender,
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
        const dayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
          d.getDate()
        ).padStart(2, '0')}`;

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

  /* ---------- activity factor + TDEE (עם התאמה ליום מנוחה) ---------- */
  const { factor: baseFactor, label: actLabel } = activityMultiplier(activityLevel);
  const restAdj = restDayAdjustment(activityLevel); // 0..-0.12
  const effectiveFactor = isRestToday ? Math.max(1.1, round2(baseFactor * (1 + restAdj))) : baseFactor;
  const tdee = bmr ? round2(bmr * effectiveFactor) : null;

  /* ---------- ברירת מחדל לפי "מטרות" ---------- */
  const defaultPctFromGoals = useMemo(() => {
    const has = (k: string) => goals.some((g) => g.goal_key === k);
    if (has('cutting_fast')) return 25;
    if (has('cutting')) return 20;
    if (has('recomp')) return 10;
    if (has('bulking')) return -10;
    return 0;
  }, [goals]);

  /* ---------- אחוז יעד (Persisted) ---------- */
  const [pct, setPct] = useState<number>(defaultPctFromGoals);
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
          .select('deficit_pct')
          .eq('user_id', uid)
          .maybeSingle();

        if (ignore) return;
        if (!error && data && typeof data.deficit_pct === 'number') {
          setPct(data.deficit_pct);
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
    if (loadingPct) return;
    if (!currentUserId) return;
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

  /* ---------- Protein g/kg (Persisted) ---------- */
  const [gpk, setGpk] = useState<number | null>(null);
  const [loadingGpk, setLoadingGpk] = useState<boolean>(true);

  const hasBf = typeof bf === 'number' && bf >= 0 && bf <= 60;

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        // דיפולט עקבי לפי מטרות ואם יש %שומן
        const fallback = defaultGpkFromGoals(goals, hasBf ? (bf as number) : null);

        let uid: string | undefined = profile?.user_id;
        if (!uid) {
          const { data } = await supabase.auth.getSession();
          uid = data.session?.user?.id;
        }
        if (!uid) { setGpk(fallback); setLoadingGpk(false); return; }

        const { data, error } = await supabase
          .from('user_protein_settings')
          .select('grams_per_kg')
          .eq('user_id', uid)
          .maybeSingle();

        if (ignore) return;

        if (!error && data && Number.isFinite(Number(data.grams_per_kg))) {
          setGpk(Number(data.grams_per_kg));
        } else {
          setGpk(fallback);
        }
      } finally {
        if (!ignore) setLoadingGpk(false);
      }
    })();
    return () => { ignore = true; };
  }, [profile?.user_id, goals, bf, hasBf]);

  /* ---------- Guardrails ---------- */
  const hardFloor = useMemo(() => {
    const sexFloor = gender === 'female' ? 1200 : gender === 'male' ? 1500 : 1400;
    const bmrFloor = bmr ? 0.8 * bmr : 0;
    const tdeeFloor = tdee ? 0.55 * tdee : 0;
    return Math.max(sexFloor, bmrFloor, tdeeFloor || 0);
  }, [bmr, tdee, gender]);

  const { targetCalories, delta, modeLabel } = usePlanTargetWithPct({ tdee, pct, hardFloor });

  /* ---------- היום + היסטוריה ---------- */
  const calsToday = todayTotals.calories ?? 0;
  const p = todayTotals.protein_g ?? 0;
  const c = todayTotals.carbs_g ?? 0;
  const f = todayTotals.fat_g ?? 0;

  const kcalFromMacros = p * 4 + c * 4 + f * 9;

  const avg7 =
    last7.length > 0 ? round2(last7.reduce((s, d) => s + (d.totals.calories ?? 0), 0) / last7.length) : 0;

  const maxDay = last7.reduce(
    (best, d) => ((d.totals.calories ?? 0) > (best?.totals.calories ?? -1) ? d : best),
    null as DayAgg | null
  );

  const progressPct =
    targetCalories && targetCalories > 0 ? Math.max(0, Math.min(100, (calsToday / targetCalories) * 100)) : 0;

  const remain = targetCalories != null ? round2(targetCalories - calsToday) : null;
  const remainText = remain == null ? '—' : remain >= 0 ? `נותרו ${remain} קק״ל` : `חריגה של ${Math.abs(remain)} קק״ל`;

  const risk = riskAssessment({ pct, bmr, tdee, targetCalories, hardFloor, gender });

  /* ---------- Macro targets (מושפע מ־isRestToday) ---------- */
  const macroTargets = useMemo(() => {
    if (!targetCalories || !weight) return null;

    const hasBf = typeof bf === 'number' && bf >= 0 && bf <= 60;
    const lbm = hasBf ? weight * (1 - (bf as number) / 100) : null;
    const basisKg = lbm ?? weight;

    // g/kg בפועל — מה־DB אם נטען, אחרת דיפולט עקבי לפי מטרות ו-%שומן
    const usedGpk = (gpk ?? defaultGpkFromGoals(goals, hasBf ? (bf as number) : null));

    // === Protein first (aligned with ProteinGoals) ===
    const protein_g = round2(basisKg * usedGpk);
    let protein_kcal = protein_g * 4;

    // === Fat: על בסיס BW, עם התאמה קלה ליום מנוחה ===
    const inDeficit = pct >= 10;
    let fatPerKg = inDeficit ? 0.9 : 1.1;
    fatPerKg = Math.max(fatPerKg, 0.6);       // רצפה 0.6g/kg
    if (isRestToday) fatPerKg = round2(fatPerKg * 1.1); // +10% ביום מנוחה
    let fat_g = round2(weight * fatPerKg);
    let fat_kcal = fat_g * 9;

    // === Carbs: השארית, עם רצפת 130g ===
    let remain_kcal = targetCalories - protein_kcal - fat_kcal;
    let carbs_g = round2(Math.max(130, remain_kcal / 4));
    let carbs_kcal = carbs_g * 4;

    // אם אין מקום לרצפת 130g — חותכים שומן עד 0.6g/kg
    if (remain_kcal < 130 * 4) {
      const fatFloor_g = round2(weight * 0.6);
      const need_kcal = 130 * 4 - remain_kcal;
      const canDropFat_kcal = Math.max(0, (fat_g - fatFloor_g) * 9);
      const drop = Math.min(need_kcal, canDropFat_kcal);
      fat_kcal = Math.max(fat_kcal - drop, fatFloor_g * 9);
      fat_g = round2(fat_kcal / 9);
      remain_kcal = targetCalories - protein_kcal - fat_kcal;
      carbs_g = round2(Math.max(130, remain_kcal / 4));
      carbs_kcal = carbs_g * 4;
    }

    return {
      protein_g, protein_kcal,
      fat_g, fat_kcal,
      carbs_g, carbs_kcal,
      total_kcal: round2(protein_kcal + fat_kcal + carbs_kcal),
    };
  }, [targetCalories, weight, bf, pct, isRestToday, gpk, goals]);

  /* ----- צבע דינמי לבר ההתקדמות (ירוק בתוך היעד, אדום מעבר) ----- */
  const progressBarClass = useMemo(() => {
    if (targetCalories == null) return 'bg-gray-400 dark:bg-gray-500';
    return calsToday <= targetCalories
      ? 'bg-gradient-to-r from-emerald-400 to-emerald-600 dark:from-emerald-500 dark:to-emerald-400'
      : 'bg-gradient-to-r from-rose-400 to-rose-600 dark:from-rose-500 dark:to-rose-400';
  }, [calsToday, targetCalories]);

  /* ---------- תצוגה ---------- */
  const usingMeasurement = latest.weightKg != null || latest.bodyFatPercent != null;
  const weightForText = usingMeasurement ? latest.weightKg : profile?.weight_kg;
  const bfForText = usingMeasurement ? latest.bodyFatPercent : profile?.body_fat_percent;

  return (
    <SectionCard title="מדדים קלוריים — יעד יומי, פרוגרס ו־7 ימים">
      <div className="grid grid-cols-1 gap-4">
        {/* יעד + שליטה */}
        <div className="rounded-xl p-4 ring-1 ring-black/10 dark:ring-white/10 bg-gradient-to-br from-white to-black/[.02] dark:from-neutral-900 dark:to-neutral-800">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs px-2 py-1 rounded bg-black/5 dark:bg-white/10">
              מצב: {isRestToday ? 'יום מנוחה' : 'יום אימון/רגיל'} · מקדם פעילות: {effectiveFactor} ({actLabel})
            </div>
            {savingPct === 'saving' && <div className="text-xs opacity-70">שומר יעד…</div>}
            {savingPct === 'error' && <div className="text-xs text-red-600">שמירה נכשלה</div>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KPI label="BMR — מנוחה" value={bmr != null ? `${bmr} קק״ל` : 'חסר נתון'} hint={bmrHint(profile)} />
            <KPI label={`TDEE — אפקטיבי (${isRestToday ? 'יום מנוחה' : actLabel})`} value={tdee != null ? `${tdee} קק״ל` : 'חסר נתון'} />
            <KPI
              label={`יעד קלורי (${modeLabelForPct(pct)}${modeLabel ? ` · ${modeLabel}` : ''})`}
              value={targetCalories != null ? `${targetCalories} קק״ל` : 'חסר נתון'}
              hint={delta != null && tdee != null ? explainDeltaPct(pct, delta, tdee) : undefined}
            />
            <KPI
              label="אכלתי היום"
              value={`${round2(calsToday)} קק״ל`}
              hint={`מאקרו ≈ ${round2(kcalFromMacros)} קק״ל${loadingLatest ? ' · טוען מדידה…' : ''}`}
            />
          </div>

          {/* שליטה: סליידר עם Guardrails */}
          <div className="mt-4 grid gap-2">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">בחר/י גרעון/עודף (בטווח הבטוח)</div>
              <div className="opacity-70">
                {pct > 0 ? `גרעון ${pct}%` : pct < 0 ? `עודף ${Math.abs(pct)}%` : 'תחזוקה 0%'}
              </div>
            </div>
            <input
              type="range"
              min={-15}
              max={30}
              step={1}
              value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="w-full"
              aria-label="סליידר גרעון/עודף קלורי"
              disabled={loadingPct}
            />
            <div className="flex justify-between text-xs opacity-70">
              <span>עודף 15%-</span>
              <span>תחזוקה</span>
              <span>גרעון 30%</span>
            </div>

            <RiskBox {...risk} />
          </div>

          {/* פרוגרס יומי */}
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">התקדמות היום לעבר היעד</div>
              <div className="opacity-70">
                {targetCalories != null ? `${round2(calsToday)} / ${targetCalories} קק״ל` : '—'}
              </div>
            </div>
            <div className="mt-2 h-3 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden" aria-label="התקדמות לעבר היעד הקלורי">
              <div
                className={`h-full rounded-full transition-[width] ${progressBarClass}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-2 text-xs opacity-80">{remainText}</div>
          </div>

          {/* חלוקת מאקרו — צריכה מול יעד מותאם אישית + ברי פרוגרס */}
          <div className="mt-6 grid grid-cols-1 md-grid-cols-3 md:grid-cols-3 gap-3 text-sm">
            <MacroGoal
              k="חלבון"
              consumed_g={p}
              consumed_kcal={p * 4}
              target_g={macroTargets?.protein_g ?? 0}
              target_kcal={macroTargets?.protein_kcal ?? 0}
            />
            <MacroGoal
              k="פחמימות"
              consumed_g={c}
              consumed_kcal={c * 4}
              target_g={macroTargets?.carbs_g ?? 0}
              target_kcal={macroTargets?.carbs_kcal ?? 0}
              note={isRestToday ? 'יום מנוחה: יעד פחמ׳ מעט נמוך' : 'יום אימון: יעד פחמ׳ גבוה יותר'}
            />
            <MacroGoal
              k="שומן"
              consumed_g={f}
              consumed_kcal={f * 9}
              target_g={macroTargets?.fat_g ?? 0}
              target_kcal={macroTargets?.fat_kcal ?? 0}
              note={isRestToday ? 'יום מנוחה: יעד שומן מעט גבוה' : undefined}
            />
          </div>

          <div className="mt-2 text-xs opacity-70">
            {usingMeasurement ? (
              <>
                היעדים מתבססים על BMR/TDEE מחושבים לפי <b>המדידה האחרונה</b>
                {latest.measuredAt ? ` (${new Date(latest.measuredAt).toLocaleDateString('he-IL')})` : ''}:
                משקל {weightForText ?? '—'} ק״ג
                {typeof bfForText === 'number' ? ` ואחוז שומן ${bfForText}%` : ''}. ביום מנוחה מקדם הפעילות יורד במעט,
                פחמימות יורדות ושומן עולה במעט; עם רצפת פחמימות של ~130g.
              </>
            ) : (
              <>
                היעדים מתבססים על BMR/TDEE (פרופיל): משקל {weightForText ?? '—'} ק״ג
                {typeof bfForText === 'number' ? ` ואחוז שומן ${bfForText}%` : ''}. מומלץ לעדכן מדידה כדי לדייק.
              </>
            )}
          </div>
        </div>

        {/* היסטוריה 7 ימים */}
        <div className="rounded-xl p-4 ring-1 ring-black/10 dark:ring-white/10">
          <div className="text-sm opacity-70">7 הימים האחרונים</div>
          <div className="mt-1 text-צxl text-2xl font-semibold">{avg7} קק״ל בממוצע</div>

          <div className="mt-3 text-sm grid gap-1">
            {last7.map((d) => (
              <Row key={d.dayKey} dayKey={d.dayKey} calories={d.totals.calories ?? 0} />
            ))}
          </div>

          {maxDay && (
            <div className="mt-3 text-xs opacity-80">
              יום שיא: <span className="font-medium">{maxDay.dayKey}</span> — {round2(maxDay.totals.calories ?? 0)} קק״ל.
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

/* ===================== חישובים ===================== */

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

function calcBMR({
  weightKg,
  heightCm,
  ageYears,
  bfPercent,
  gender,
}: {
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  bfPercent: number | null;
  gender: Gender;
}): number | null {
  if (!weightKg || weightKg <= 0) return null;

  if (typeof bfPercent === 'number' && bfPercent >= 0 && bfPercent <= 60) {
    const lbm = weightKg * (1 - bfPercent / 100);
    return round2(370 + 21.6 * lbm); // Katch–McArdle
  }

  if (heightCm && ageYears != null) {
    const s = gender === 'female' ? -161 : 5;
    return round2(10 * weightKg + 6.25 * heightCm - 5 * ageYears + s); // Mifflin–St Jeor
  }

  const k = gender === 'female' ? 22 : 24; // fallback
  return round2(k * weightKg);
}

function activityMultiplier(level: ActivityLevel | null | undefined) {
  switch (level) {
    case 'sedentary':  return { factor: 1.2,   label: 'יושבני' };
    case 'light':      return { factor: 1.375, label: 'קל' };
    case 'moderate':   return { factor: 1.55,  label: 'בינוני' };
    case 'very_active':return { factor: 1.725, label: 'גבוה' };
    default:           return { factor: 1.2,   label: 'ברירת מחדל (יושבני)' };
  }
}

/** כמה להפחית מהמכפיל ביום מנוחה (כתוספת שלילית יחסית) */
function restDayAdjustment(level: ActivityLevel | null | undefined) {
  switch (level) {
    case 'sedentary':  return 0;
    case 'light':      return -0.05; // ~5%
    case 'moderate':   return -0.10; // ~10%
    case 'very_active':return -0.12; // ~12%
    default:           return -0.05;
  }
}

function usePlanTargetWithPct({
  tdee,
  pct, // -15..30
  hardFloor,
}: {
  tdee: number | null;
  pct: number;
  hardFloor: number;
}) {
  const initialTarget = tdee == null ? null : round2(tdee * (1 - pct / 100));
  const targetCalories = initialTarget == null ? null : Math.max(hardFloor, initialTarget);
  const delta = tdee == null || targetCalories == null ? null : round2(targetCalories - tdee);
  const modeLabel = pct > 0 ? `גרעון ${pct}%` : pct < 0 ? `עודף ${Math.abs(pct)}%` : 'תחזוקה';
  return { targetCalories, delta, modeLabel };
}

function modeLabelForPct(pct: number) {
  if (pct > 0) return 'חיטוב';
  if (pct < 0) return 'מסה';
  return 'תחזוקה';
}

function explainDeltaPct(_pct: number, delta: number, tdee: number) {
  const pctEff = Math.round((Math.abs(delta) / tdee) * 100);
  if (delta === 0) return `יעד ≈ TDEE (${tdee} קק״ל).`;
  if (delta < 0) return `גרעון אפקטיבי של ${Math.abs(delta)} קק״ל (~${pctEff}%).`;
  return `עודף אפקטיבי של ${delta} קק״ל (~${pctEff}%).`;
}

/* ===== סיכונים / הסברים ===== */
function riskAssessment({
  pct,
  bmr,
  tdee,
  targetCalories,
  hardFloor,
  gender,
}: {
  pct: number;
  bmr: number | null;
  tdee: number | null;
  targetCalories: number | null;
  hardFloor: number;
  gender: Gender;
}) {
  const items: { level: 'ok' | 'caution' | 'danger'; text: string }[] = [];

  const deficitPerDay = tdee != null && targetCalories != null ? Math.max(0, tdee - targetCalories) : 0;
  const kgPerWeek = round2((deficitPerDay * 7) / 7700);
  if (pct > 0) {
    items.push({
      level: kgPerWeek <= 0.4 ? 'ok' : kgPerWeek <= 0.7 ? 'caution' : 'danger',
      text: `קצב ירידה משוער: ~${kgPerWeek} ק״ג/שבוע.`,
    });
  } else if (pct < 0) {
    items.push({
      level: Math.abs(pct) <= 10 ? 'ok' : 'caution',
      text: `קצב עלייה משוער נמוך (מסה רזה) אם החלבון/אימונים מספקים.`,
    });
  }

  if (targetCalories != null && targetCalories === Math.round(hardFloor)) {
    items.push({ level: 'caution', text: 'הפעלנו רצפת בטיחות לקלוריות כדי לא לרדת נמוך מדי (בריאות/ביצועים).' });
  }

  if (bmr && targetCalories && targetCalories < bmr) {
    items.push({ level: 'danger', text: `יעד נמוך מ־BMR — סיכון לעייפות, ירידה בביצועים והאטת מטבוליזם.` });
  }

  if (pct > 0) {
    items.push({ level: 'ok', text: 'בגרעון מומלץ חלבון גבוה (1.8–2.3g/kg; ואם יש %שומן — לפי LBM).' });
  } else if (pct < 0) {
    items.push({ level: 'ok', text: 'בעודף שמור על חלבון ≥1.6g/kg כדי למקד את העלייה לשריר.' });
  }

  if (pct >= 25) {
    items.push({ level: 'danger', text: 'גרעון גבוה מאוד: עלול לפגוע באימונים, הורמונים ומצב רוח. עדיף 15–20%.' });
  } else if (pct >= 20) {
    items.push({ level: 'caution', text: 'גרעון משמעותי: טוב לטווח קצר; הקפד/י על שינה, חלבון והתאוששות.' });
  } else if (pct >= 10) {
    items.push({ level: 'ok', text: 'גרעון מתון: בר־קיימא, מתאים לריקומפ/חיטוב ארוך.' });
  }

  if (!tdee) {
    items.push({ level: 'caution', text: 'חסר נתון לחישוב TDEE מדויק — עדכון גיל/גובה ישפר את ההערכה.' });
  }

  const legend = { ok: '✅', caution: '⚠️', danger: '⛔' } as const;
  return { items, legend };
}

/* ===================== UI bits ===================== */

function KPI({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg p-3 ring-1 ring-black/10 dark:ring-white/10 bg-black/[.03] dark:bg-white/[.06]">
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-lg font-semibold mt-0.5">{value}</div>
      {hint && <div className="text-xs opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}

function RiskBox({ items, legend }: ReturnType<typeof riskAssessment>) {
  return (
    <div className="rounded-lg p-3 ring-1 ring-black/10 dark:ring-white/10 bg-black/[.03] dark:bg-white/[.06]">
      <div className="text-sm font-medium mb-1">השלכות הבחירה שלך:</div>
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

function bmrHint(profile: Profile | null) {
  if (!profile?.weight_kg) return 'דרוש משקל כדי להעריך BMR.';
  if (typeof profile?.body_fat_percent === 'number') return 'Katch–McArdle (LBM).';
  if (profile?.height_cm && getAgeYears(profile) != null) return 'Mifflin–St Jeor.';
  return 'קירוב לפי משקל/מין.';
}

function MacroGoal({
  k,
  consumed_g,
  consumed_kcal,
  target_g,
  target_kcal,
  note,
}: {
  k: string;
  consumed_g: number;
  consumed_kcal: number;
  target_g: number;
  target_kcal: number;
  note?: string;
}) {
  const pct = target_kcal > 0 ? Math.max(0, Math.min(100, (consumed_kcal / target_kcal) * 100)) : 0;
  const remain_g = round2(target_g - consumed_g);
  const remainTxt =
    target_g > 0 ? (remain_g >= 0 ? `נותר ~${remain_g}g` : `חריגה ~${Math.abs(remain_g)}g`) : '—';
  return (
    <div className="rounded-lg p-3 bg-black/[.03] dark:bg-white/[.06]">
      <div className="font-medium">{k}</div>
      <div className="mt-1 text-sm">
        {round2(consumed_g)}g / {round2(target_g)}g · {round2(consumed_kcal)} / {round2(target_kcal)} קק״ל
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden" aria-label={`התקדמות ${k}`}>
        <div className="h-full rounded-full bg-black/50 dark:bg-white/60 transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs opacity-70">
        {remainTxt}
        {note ? ` · ${note}` : ''}
      </div>
    </div>
  );
}

function Row({ dayKey, calories }: { dayKey: string; calories: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="opacity-70">{dayKey}</div>
      <div className="font-medium">{round2(calories)} קק״ל</div>
    </div>
  );
}

/* ===================== Utils ===================== */

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ---- defaults for protein g/kg (align with ProteinGoals) ---- */
function defaultGpkFromGoals(goals: UserGoal[], bfPercent: number | null) {
  const has = (k: string) => goals.some((g) => g.goal_key === k);
  if (has('cutting'))  return bfPercent != null ? 2.3 : 2.0; // אם יש %שומן → LBM*2.3; אחרת כיוונון כללי
  if (has('recomp'))   return 2.0;
  if (has('bulking'))  return 1.8;
  return 1.6;
}
