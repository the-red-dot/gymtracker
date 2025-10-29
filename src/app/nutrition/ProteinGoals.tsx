// SECTION 1 — Imports & setup
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SectionCard } from './ui';
import { round2 } from './utils';
// END SECTION 1


// SECTION 2 — Types
type Gender = 'male' | 'female' | 'other' | 'unspecified';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';

type Profile = {
  user_id: string;
  gender: Gender | null;
  height_cm: number | null;           // לא נדרש לחישוב כאן, נשאר ל־props קיימים
  weight_kg: number | null;           // fallback בלבד — המקור הרשמי הוא body_measurements
  body_fat_percent: number | null;
};

type UserGoal = { id: number; goal_key: string; label: string };
// END SECTION 2


// SECTION 3 — Component
export default function ProteinGoals({
  profile,
  goals,
  activityLevel: _activityLevel, // לא בשימוש כרגע
  proteinToday,
}: {
  profile: Profile | null;
  goals: UserGoal[];
  activityLevel: ActivityLevel | null;
  proteinToday: number;
}) {
  const currentUserId = profile?.user_id ?? null;

  // ===== 3.1 Latest weight from body_measurements =====
  const [loadingWeight, setLoadingWeight] = useState<boolean>(true);
  const [weight, setWeight] = useState<number | null>(null);
  const [weightSource, setWeightSource] = useState<'measurement' | 'profile' | 'none'>('none');
  const [weightAt, setWeightAt] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!currentUserId) {
        setWeight(null);
        setWeightSource('none');
        setLoadingWeight(false);
        return;
      }
      try {
        setLoadingWeight(true);
        const { data, error } = await supabase
          .from('body_measurements')
          .select('measured_at, weight_kg')
          .eq('user_id', currentUserId)
          .not('weight_kg', 'is', null)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ignore) return;

        if (!error && data && typeof data.weight_kg === 'number') {
          setWeight(data.weight_kg);
          setWeightAt(data.measured_at);
          setWeightSource('measurement');
        } else if (typeof profile?.weight_kg === 'number') {
          setWeight(profile!.weight_kg as number);
          setWeightSource('profile');
        } else {
          setWeight(null);
          setWeightSource('none');
        }
      } catch {
        if (typeof profile?.weight_kg === 'number') {
          setWeight(profile!.weight_kg as number);
          setWeightSource('profile');
        } else {
          setWeight(null);
          setWeightSource('none');
        }
      } finally {
        if (!ignore) setLoadingWeight(false);
      }
    })();
    return () => { ignore = true; };
  }, [currentUserId, profile?.weight_kg]);

  const bf = typeof profile?.body_fat_percent === 'number' ? (profile!.body_fat_percent as number) : null;

  // ===== 3.2 Default g/kg based on goals & BF =====
  const def = useMemo(() => defaultGpkFromGoals(goals, weight, bf), [goals, weight, bf]);

  // ===== 3.3 Persisted user_protein_settings (grams_per_kg) =====
  const [gpk, setGpk] = useState<number>(def.value); // grams per kg BW (user-chosen)
  const [loadingGpk, setLoadingGpk] = useState<boolean>(true);
  const [savingGpk, setSavingGpk] = useState<'idle' | 'saving' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        if (!currentUserId) { setLoadingGpk(false); return; }
        const { data, error } = await supabase
          .from('user_protein_settings')
          .select('grams_per_kg')
          .eq('user_id', currentUserId)
          .maybeSingle();
        if (ignore) return;
        if (!error && data && typeof data.grams_per_kg === 'number') {
          setGpk(data.grams_per_kg);
        } else {
          setGpk(def.value);
        }
      } catch {
        setGpk(def.value);
      } finally {
        if (!ignore) setLoadingGpk(false);
      }
    })();
    return () => { ignore = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  useEffect(() => {
    if (loadingGpk) return;
    if (!currentUserId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        setSavingGpk('saving');
        const { error } = await supabase
          .from('user_protein_settings')
          .upsert(
            { user_id: currentUserId, grams_per_kg: gpk, source_key: 'custom' },
            { onConflict: 'user_id' }
          );
        if (error) throw error;
        setSavingGpk('idle');
      } catch (e: any) {
        if (!/relation .* does not exist/i.test(String(e?.message))) {
          console.error('save protein gpk failed:', e);
        }
        setSavingGpk('error');
      }
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [gpk, loadingGpk, currentUserId]);

  // ===== 3.4 Calculations for UI =====
  const consumed = Number.isFinite(proteinToday) ? proteinToday : 0;
  const targetAbs = weight ? round2(gpk * weight) : null;

  // LBM cue for cutting (Helms 2014): 2.3 g/kg LBM (שימוש רק להצגת חלופה אם יש %שומן)
  const lbm = weight && bf != null ? round2(weight * (1 - bf / 100)) : null;
  const altCutAbs = lbm ? round2(2.3 * lbm) : null;
  const altCutGpkApprox = lbm && weight ? round2((2.3 * lbm) / weight) : null;

  const band = recommendedBand(goals);

  const pct =
    targetAbs && targetAbs > 0
      ? Math.max(0, Math.min(100, (consumed / targetAbs) * 100))
      : 0;

  const remain =
    targetAbs != null ? round2(targetAbs - consumed) : null;

  const risk = proteinCoaching({ gpk, goals, bf });

  // per-meal cue (0.30–0.40 g/kg/meal)
  const perMealLow = round2(0.3 * (weight ?? 0));
  const perMealHigh = round2(0.4 * (weight ?? 0));

  // ===== 3.5 Render (clean & minimal) =====
  return (
    <SectionCard title="יעד חלבון יומי">
      {loadingWeight ? (
        <div className="text-sm opacity-70">טוען משקל עדכני…</div>
      ) : !weight ? (
        <div className="text-sm text-amber-700 dark:text-amber-300">
          לא נמצא משקל עדכני. הוסף/י משקל בטבלת <span className="font-medium">body_measurements</span>{' '}
          (או הזן משקל בפרופיל כגיבוי) כדי לחשב יעד חלבון מותאם אישית.
        </div>
      ) : (
        <div className="grid gap-6">
          {/* KPI Row */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <KPI
              label="משקל"
              value={`${round2(weight)} ק״ג`}
              hint={
                weightSource === 'measurement'
                  ? `מ־body_measurements${weightAt ? ` · ${new Date(weightAt).toLocaleDateString('he-IL')}` : ''}`
                  : weightSource === 'profile'
                  ? 'מהפרופיל (מומלץ לעדכן מדידה בטבלת body_measurements)'
                  : undefined
              }
            />
            <KPI
              label="בחירתך (g/kg)"
              value={round2(gpk)}
              hint={savingGpk === 'saving' ? 'שומר…' : savingGpk === 'error' ? 'שמירה נכשלה (ממשיך מקומי)' : undefined}
            />
            <KPI
              label="יעד חלבון"
              value={targetAbs != null ? `${targetAbs} ג׳` : '—'}
              hint={band?.label ? `טווח מומלץ: ${band.min}–${band.max} g/kg (${band.label})` : undefined}
            />
            <KPI
              label="אכלתי היום"
              value={`${round2(consumed)} ג׳`}
              hint={remain == null ? undefined : remain >= 0 ? `נותרו ${remain} ג׳` : `חריגה של ${Math.abs(remain)} ג׳`}
            />
          </div>

          {/* Slider + cues */}
          <div className="rounded-xl p-4 ring-1 ring-black/10 dark:ring-white/10 bg-gradient-to-br from-white to-black/[.02] dark:from-neutral-900 dark:to-neutral-800">
            <div className="flex items-center justify-between text-sm">
              <div className="font-medium">בחר/י יעד אישי (גרם לק״ג)</div>
              <div className="opacity-70">{round2(gpk)} g/kg</div>
            </div>

            {band && (
              <div className="mt-1 text-xs opacity-80">
                מומלץ למטרה שלך: <span className="font-medium">{band.min}–{band.max} g/kg</span> ({band.label})
              </div>
            )}

            <input
              type="range"
              min={0.8}
              max={2.4}
              step={0.1}
              value={gpk}
              onChange={(e) => setGpk(Number(e.target.value))}
              className="w-full mt-3"
              aria-label="סליידר יעד חלבון (g/kg)"
              disabled={loadingGpk}
            />

            <div className="flex justify-between text-xs opacity-70">
              <span>0.8</span>
              <span>1.2</span>
              <span>1.6</span>
              <span>2.0</span>
              <span>2.4</span>
            </div>

            {/* (אופציונלי) חלופה לחיטוב לפי LBM אם יש %שומן */}
            {altCutAbs != null && (
              <div className="mt-2 text-xs opacity-80">
                חלופה לחיטוב לפי LBM: ≈{altCutAbs} ג׳ (≈{altCutGpkApprox} g/kg).
              </div>
            )}

            {/* Progress bar */}
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
              טיפ פריסה: 0.30–0.40 g/kg לארוחה ⇒ אצלך ≈ {perMealLow}–{perMealHigh} ג׳ לארוחה (3–5 ארוחות).
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
// END SECTION 3


// SECTION 4 — Defaults & bands
function defaultGpkFromGoals(goals: UserGoal[], weight: number | null, bf: number | null) {
  const has = (k: string) => goals.some((g) => g.goal_key === k);
  if (has('cutting')) {
    if (weight && bf != null) {
      const fracLBM = Math.max(0, Math.min(1, 1 - bf / 100));
      return { value: round2(2.3 * fracLBM), reason: 'חיטוב (מבוסס LBM)' };
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
// END SECTION 4


// SECTION 5 — Coaching & UI bits
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
    items.push({ level: 'ok', text: 'בריקומפ: שמירה על 1.8–2.2 g/kg תומכת שמירה/בנייה בגרעון קטן.' });
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
// END SECTION 5
