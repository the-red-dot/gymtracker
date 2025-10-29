// gym-tracker-app/src/app/nutrition/bmi.tsx

'use client';

/* =========================
   SECTION 1 — Imports
   ========================= */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SectionCard, Th, Td } from './ui';
import { round2 } from './utils';

/* =========================
   END SECTION 1
   ========================= */


/* =========================
   SECTION 2 — Types
   ========================= */
type Gender = 'male' | 'female' | 'other' | 'unspecified';

export type Profile = {
  user_id: string;
  height_cm: number | null;
  gender: Gender | null;
};

type Measurement = {
  measured_at: string; // ISO
  weight_kg: number | null;
};
/* =========================
   END SECTION 2
   ========================= */


/* =========================
   SECTION 3 — Component
   ========================= */
export default function BMIWidget({
  userId,
  profile: profileProp,
}: {
  userId: string | null;
  profile: Profile | null;
}) {
  // local state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(profileProp ?? null);
  const [weights, setWeights] = useState<Measurement[]>([]);

  // bootstrap: fetch what we need (weights; profile only if not provided)
  useEffect(() => {
    if (!userId) return;

    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        if (!profileProp) {
          const { data: pData, error: pErr } = await supabase
            .from('profiles')
            .select('user_id, height_cm, gender')
            .eq('user_id', userId)
            .maybeSingle();
          if (pErr) throw pErr;
          if (!ignore) setProfile((pData ?? null) as Profile | null);
        }

        const { data: wData, error: wErr } = await supabase
          .from('body_measurements')
          .select('measured_at, weight_kg')
          .eq('user_id', userId)
          .not('weight_kg', 'is', null) // keep rows that have weight
          .order('measured_at', { ascending: true });

        if (wErr) throw wErr;
        if (!ignore) setWeights((wData ?? []) as Measurement[]);
      } catch (e: any) {
        if (!ignore) setError(e?.message || 'שגיאה בטעינת נתוני BMI');
      } finally {
        if (!ignore) setLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [userId, profileProp]);

  // derived
  const heightM = (profile?.height_cm ?? 0) > 0 ? (profile!.height_cm as number) / 100 : null;
  const currentWeight = useMemo(() => {
    const last = weights[weights.length - 1];
    return last?.weight_kg ?? null;
  }, [weights]);
  const firstWeight = useMemo(() => {
    const first = weights[0];
    return first?.weight_kg ?? null;
  }, [weights]);

  const currentBMI = heightM && currentWeight ? round2(currentWeight / (heightM * heightM)) : null;
  const category = currentBMI != null ? bmiCategory(currentBMI) : null;

  // system-picked optimal BMI (mid of normal range)
  const targetBMI = 22.5;
  const targetWeight = heightM ? round2(targetBMI * heightM * heightM) : null;

  // progress from first weight -> target
  const progressPct = useMemo(() => {
    if (!firstWeight || !currentWeight || !targetWeight) return 0;

    if (firstWeight > targetWeight) {
      const denom = firstWeight - targetWeight;
      if (denom <= 0) return 100;
      return clamp01((firstWeight - currentWeight) / denom) * 100;
    } else if (firstWeight < targetWeight) {
      const denom = targetWeight - firstWeight;
      if (denom <= 0) return 100;
      return clamp01((currentWeight - firstWeight) / denom) * 100;
    }
    return 100;
  }, [firstWeight, currentWeight, targetWeight]);

  const kgToGoal = useMemo(() => {
    if (!currentWeight || !targetWeight) return null;
    return round2(currentWeight - targetWeight); // positive → need to lose; negative → need to gain
  }, [currentWeight, targetWeight]);

  // gauge domain (visual)
  const gaugeMin = 15;
  const gaugeMax = 35;

  // pointers on the gauge
  const curPctOnGauge =
    currentBMI != null ? clamp01((currentBMI - gaugeMin) / (gaugeMax - gaugeMin)) * 100 : 0;
  const targetPctOnGauge = clamp01((targetBMI - gaugeMin) / (gaugeMax - gaugeMin)) * 100;

  // formatters
  const fmtDate = useMemo(() => new Intl.DateTimeFormat('he-IL'), []);

  // UI
  if (!userId) return <p className="opacity-70">לא מחובר/ת.</p>;
  if (loading) return <p className="opacity-70">טוען…</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8" dir="rtl">
      <SectionCard title="BMI — יעד ומשקל">
        {!heightM ? (
          <div className="text-sm text-amber-700 dark:text-amber-300">
            חסר גובה בפרופיל. עדכן/י <a href="/profile" className="underline">גובה (ס״מ)</a> כדי לחשב BMI.
          </div>
        ) : !currentWeight ? (
          <div className="text-sm text-amber-700 dark:text-amber-300">
            אין נתוני משקל ב־<span className="font-medium">body_measurements</span>. הוסף/י משקל כדי להתחיל לעקוב.
          </div>
        ) : (
          <div className="grid gap-6">
            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <KPI
                label="BMI נוכחי"
                value={currentBMI != null ? currentBMI : '—'}
                hint={category?.label}
                tone={category?.tone}
              />
              <KPI
                label="BMI יעד"
                value={targetBMI}
                hint="אמצע תחום התקין (18.5–24.9)"
              />
              <KPI
                label="משקל יעד"
                value={targetWeight != null ? `${targetWeight} ק״ג` : '—'}
                hint={heightM ? `גובה ${round2(heightM)} מ׳` : undefined}
              />
            </div>

            {/* Gauge */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between text-xs opacity-70">
                <span>15</span>
                <span>20</span>
                <span>25</span>
                <span>30</span>
                <span>35</span>
              </div>
              <div className="relative h-5 w-full rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/10">
                {/* color bands */}
                <div className="absolute inset-0 flex">
                  <div
                    className="h-full"
                    style={{ width: `${bandPct(15, 18.5, gaugeMin, gaugeMax)}%`, background: 'rgba(59,130,246,.25)' }}
                  />
                  <div
                    className="h-full"
                    style={{ width: `${bandPct(18.5, 25, gaugeMin, gaugeMax)}%`, background: 'rgba(16,185,129,.35)' }}
                  />
                  <div
                    className="h-full"
                    style={{ width: `${bandPct(25, 30, gaugeMin, gaugeMax)}%`, background: 'rgba(245,158,11,.35)' }}
                  />
                  <div className="h-full flex-1" style={{ background: 'rgba(239,68,68,.35)' }} />
                </div>
                {/* current pointer */}
                {currentBMI != null && (
                  <div
                    className="absolute -top-1 h-7 w-0.5 bg-foreground"
                    style={{ left: `calc(${curPctOnGauge}% - 1px)` }}
                    title={`BMI נוכחי: ${currentBMI}`}
                  />
                )}
                {/* target pointer */}
                <div
                  className="absolute -top-1 h-7 w-0.5 bg-black/50 dark:bg-white/60"
                  style={{ left: `calc(${targetPctOnGauge}% - 1px)` }}
                  title={`יעד: ${targetBMI}`}
                />
              </div>
              <div className="flex items-center gap-2 text-xs opacity-80">
                <Legend color="rgba(59,130,246,.5)" text="תת-משקל" />
                <Legend color="rgba(16,185,129,.6)" text="תקין" />
                <Legend color="rgba(245,158,11,.6)" text="עודף משקל" />
                <Legend color="rgba(239,68,68,.6)" text="השמנה" />
              </div>
            </div>

            {/* Progress to goal (by weight history) */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between text-sm">
                <div className="font-medium">התקדמות אל משקל היעד</div>
                <div className="opacity-70">
                  {firstWeight != null && currentWeight != null && targetWeight != null
                    ? `${round2(currentWeight)} ק״ג · יעד ${targetWeight} ק״ג`
                    : '—'}
                </div>
              </div>
              <div className="h-3 w-full rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600 dark:from-indigo-500 dark:to-indigo-400 transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
                />
              </div>
              <div className="text-xs opacity-80">
                {kgToGoal == null
                  ? '—'
                  : kgToGoal > 0
                  ? `נותרו ${kgToGoal} ק״ג לירידה עד היעד.`
                  : kgToGoal < 0
                  ? `נותרו ${Math.abs(kgToGoal)} ק״ג לעלייה עד היעד.`
                  : 'הגעת למשקל היעד!'}
              </div>
              {firstWeight != null && currentWeight != null && targetWeight != null && (
                <div className="text-xs opacity-70">
                  נקודת התחלה: {round2(firstWeight)} ק״ג · שינוי מצטבר: {round2(currentWeight - firstWeight)} ק״ג.
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* History table (optional, simple) */}
      <SectionCard title="היסטוריית משקל (body_measurements)">
        {weights.length === 0 ? (
          <div className="text-sm opacity-70">אין נתוני משקל להצגה.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg ring-1 ring-black/10 dark:ring-white/10">
            <table className="min-w-full text-sm">
              <thead className="bg-black/5 dark:bg-white/10">
                <tr className="text-right">
                  <Th>תאריך</Th>
                  <Th>משקל (ק״ג)</Th>
                  <Th>BMI</Th>
                  <Th>קטגוריה</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {weights
                  .slice()
                  .reverse()
                  .map((w, idx) => {
                    const bmi = heightM && w.weight_kg ? round2(w.weight_kg / (heightM * heightM)) : null;
                    const cat = bmi != null ? bmiCategory(bmi) : null;
                    return (
                      <tr key={idx}>
                        <Td>{fmtDate.format(new Date(w.measured_at))}</Td>
                        <Td>{numOrDash(w.weight_kg)}</Td>
                        <Td>{bmi ?? '—'}</Td>
                        <Td>
                          {cat ? (
                            <span className={`inline-block rounded px-2 py-0.5 text-xs ${cat.className}`}>
                              {cat.label}
                            </span>
                          ) : (
                            '—'
                          )}
                        </Td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
/* =========================
   END SECTION 3
   ========================= */


/* =========================
   SECTION 4 — Helpers & tiny UI bits
   ========================= */
function bmiCategory(
  bmi: number
): { label: string; className: string; tone: 'good' | 'warn' | 'bad' } {
  if (bmi < 18.5)
    return {
      label: 'תת-משקל',
      className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
      tone: 'warn',
    };
  if (bmi < 25)
    return {
      label: 'תקין',
      className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      tone: 'good',
    };
  if (bmi < 30)
    return {
      label: 'עודף משקל',
      className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      tone: 'warn',
    };
  return {
    label: 'השמנה',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400',
    tone: 'bad',
  };
}

function bandPct(a: number, b: number, min: number, max: number) {
  const w = Math.max(0, Math.min(b, max) - Math.max(a, min));
  return (w / (max - min)) * 100;
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function KPI({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'warn'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-foreground';
  return (
    <div className="rounded-lg p-3 ring-1 ring-black/10 dark:ring-white/10 bg-black/[.03] dark:bg-white/[.06]">
      <div className="text-sm opacity-70">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs opacity-70 mt-0.5">{hint}</div>}
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block h-2 w-6 rounded" style={{ background: color }} />
      <span>{text}</span>
    </span>
  );
}

function numOrDash(n: number | null | undefined) {
  return Number.isFinite(n as number) ? String(n) : '—';
}
/* =========================
   END SECTION 4
   ========================= */
