// src/app/progress/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

/* =========================
   Types
   ========================= */
type RangeDays = 7 | 30 | 60 | 90;
type Intent = 'good' | 'warn' | 'bad';

type Workout = {
  id: number;
  user_id?: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  tab_id?: number | null;
};
type WorkoutExercise = { id: number; workout_id: number; equipment_id: number };
type ExerciseSet = {
  id: number;
  workout_exercise_id: number;
  weight_kg?: number | null;
  reps?: number | null;
  distance_m?: number | null;
  distance_km?: number | null;
  duration_sec?: number | null;
  notes?: string | null;
  [k: string]: any;
};
type Equipment = {
  id: number;
  name_en?: string | null;
  name_he?: string | null;
  image_url?: string | null;
  body_area_he?: string | null;
  muscles_he?: any | null;
};
type BodyMeas = {
  id: number;
  measured_at: string;
  user_id: string;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  chest_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  biceps_cm?: number | null;
  thigh_cm?: number | null;
  calf_cm?: number | null;
  neck_cm?: number | null;
  waist_navel_cm?: number | null;
  waist_narrow_cm?: number | null;
  shoulders_cm?: number | null;
};
type Profile = {
  user_id: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  body_fat_percent?: number | null;
  gender?: 'male' | 'female' | 'other' | 'unspecified';
};
type Goal = { goal_key: string; label: string };

type UserTabEquip = { id?: number; user_id: string; tab_id: number; equipment_id: number };

/* =========================
   Helpers
   ========================= */
const fmtNum = (n: number | null | undefined, d = 1) =>
  n == null || isNaN(n) ? '—' : Number(n).toFixed(d);
const round2 = (n: number) => Math.round(n * 100) / 100;
const toDate = (iso: string) => new Date(iso);
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dateISO = (d: Date) => dayStart(d).toISOString().slice(0, 10);

function slopePerWeek(points: Array<{ t: number; v: number }>) {
  if (points.length < 2) return NaN;
  const xs = points.map((p) => p.t / 86400000 / 7);
  const ys = points.map((p) => p.v);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const vx = xs[i] - mx, vy = ys[i] - my; num += vx * vy; den += vx * vx; }
  return den === 0 ? NaN : num / den;
}

const cm2in = (cm?: number | null) => (cm == null ? NaN : Number(cm) / 2.54);
function estimateBfNavy(
  gender: Profile['gender'],
  height_cm?: number | null,
  neck_cm?: number | null,
  waist_cm?: number | null,
  hips_cm?: number | null
) {
  const h = cm2in(height_cm), n = cm2in(neck_cm), w = cm2in(waist_cm), hp = cm2in(hips_cm);
  if (!isFinite(h)) return NaN;
  if (gender === 'female') {
    if (!isFinite(w) || !isFinite(n)) return NaN;
    const sum = isFinite(hp) ? w + hp - n : w - n;
    if (!(sum > 0)) return NaN;
    const denom = isFinite(hp)
      ? 1.29579 - 0.35004 * Math.log10(sum) + 0.221 * Math.log10(h)
      : 1.0324 - 0.19077 * Math.log10(sum) + 0.15456 * Math.log10(h);
    return 495 / denom - 450;
  } else {
    if (!isFinite(w) || !isFinite(n)) return NaN;
    const diff = w - n;
    if (!(diff > 0)) return NaN;
    const denom = 1.0324 - 0.19077 * Math.log10(diff) + 0.15456 * Math.log10(h);
    return 495 / denom - 450;
  }
}

/* =========================
   UI atoms
   ========================= */
function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode; }) {
  return (
    <section className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
      <div className="p-4 md:p-5 border-b border-black/10 dark:border-white/10">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <p className="text-sm opacity-70 mt-1">{subtitle}</p>}
      </div>
      <div className="p-3 md:p-5">{children}</div>
    </section>
  );
}
type IntentProps = { label: string; value: string; hint?: string; intent?: Intent; };
function KPI({ label, value, hint, intent }: IntentProps) {
  const color = intent === 'good' ? 'text-emerald-700' : intent === 'bad' ? 'text-red-700' : intent === 'warn' ? 'text-amber-700' : 'text-foreground';
  const ring  = intent === 'good' ? 'ring-emerald-500/20' : intent === 'bad' ? 'ring-red-500/20' : intent === 'warn' ? 'ring-amber-500/20' : 'ring-black/10 dark:ring-white/10';
  return (
    <div className={`rounded-xl ${ring} ring-1 bg-background p-4 md:p-5`}>
      <div className="text-sm opacity-70">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="text-xs opacity-70 mt-1">{hint}</div>}
    </div>
  );
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span className="text-xs rounded-full px-2 py-0.5 ring-1 ring-black/10 dark:ring-white/20">{children}</span>;
}

/* =========================
   Page
   ========================= */
export default function ProgressPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Controls (7/30/60/90)
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);

  // Raw
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [equip, setEquip] = useState<Map<number, Equipment>>(new Map());
  const [userTabEquip, setUserTabEquip] = useState<UserTabEquip[]>([]);
  const [meas, setMeas] = useState<BodyMeas[]>([]);

  // Weight baseline & latest (all-time)
  const [baselineWeight, setBaselineWeight] = useState<number | null>(null);
  const [baselineDate, setBaselineDate] = useState<string | null>(null);
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);

  /* ---------- bootstrap ---------- */
  useEffect(() => {
    let ignore = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id ?? null;
      if (!id) { router.push('/login'); return; }
      if (ignore) return;
      setUid(id);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s?.user?.id) router.push('/login'); });
    return () => { sub.subscription.unsubscribe(); ignore = true; };
  }, [router]);

  useEffect(() => {
    if (!uid) return;
    (async () => {
      setLoading(true); setErr(null);
      const now = new Date();
      const start = new Date(now); start.setDate(start.getDate() - rangeDays);
      const startISO = start.toISOString(), nowISO = now.toISOString();

      try {
        // profile & goals
        const [{ data: p, error: pe }, { data: gs, error: ge }] = await Promise.all([
          supabase.from('profiles').select('user_id, weight_kg, height_cm, body_fat_percent, gender').eq('user_id', uid).maybeSingle(),
          supabase.from('user_goals').select('goal_key, label').eq('user_id', uid),
        ]);
        if (pe) throw pe; if (ge) throw ge;
        setProfile(p as any || null);
        setGoals((gs as any[]) || []);

        // workouts in range
        const { data: w, error: we } = await supabase.from('workouts')
          .select('id, user_id, started_at, ended_at, duration_seconds, tab_id')
          .eq('user_id', uid).gte('started_at', startISO).lte('started_at', nowISO).order('started_at', { ascending: true });
        if (we) throw we;
        setWorkouts((w||[]) as Workout[]);
        const wids = (w||[]).map(x=>x.id);

        // workout_exercises + sets(*)
        let wex: any[] = [], st: any[] = [];
        if (wids.length) {
          const [{ data: wx, error: wxe }, ss] = await Promise.all([
            supabase.from('workout_exercises').select('id, workout_id, equipment_id').in('workout_id', wids),
            (async () => {
              const idsRes = await supabase.from('workout_exercises').select('id').in('workout_id', wids);
              const ids = idsRes.data?.map(r=>r.id) || [];
              if (!ids.length) return { data: [] as any[], error: null as any };
              return supabase.from('exercise_sets').select('*').in('workout_exercise_id', ids);
            })()
          ]);
          if (wxe) throw wxe;
          if (ss.error) throw ss.error;
          wex = wx || [];
          st = ss.data || [];
        }
        setWorkoutExercises(wex as WorkoutExercise[]);
        setSets(st as ExerciseSet[]);

        // user_tab_equipment for tabs used
        const tabIds = Array.from(new Set(((w||[]).map(x=>x.tab_id).filter(Boolean) as number[])));
        if (tabIds.length) {
          const { data: uteRows } = await supabase
            .from('user_tab_equipment')
            .select('tab_id, equipment_id')
            .eq('user_id', uid)
            .in('tab_id', tabIds);
          setUserTabEquip(((uteRows||[]) as any) || []);
        } else setUserTabEquip([]);

        // equipment map (union of performed + selected)
        const eidsFromWorkouts = Array.from(new Set((wex||[]).map((x:any)=>x.equipment_id)));
        const eidsFromTabs = Array.from(new Set(((userTabEquip||[]).map(x=>x.equipment_id)) as number[]));
        const eidsAll = Array.from(new Set([...eidsFromWorkouts, ...eidsFromTabs]));
        if (eidsAll.length) {
          const { data: eq, error: eqe } = await supabase.from('equipment').select('id, name_en, name_he, image_url, body_area_he, muscles_he').in('id', eidsAll);
          if (eqe) throw eqe;
          const m = new Map<number, Equipment>();
          (eq||[]).forEach((r:any)=>m.set(r.id, r));
          setEquip(m);
        } else setEquip(new Map());

        // body measurements (window for charts/tables)
        const measStart = new Date(now); measStart.setDate(measStart.getDate() - Math.max(rangeDays, 120));
        const { data: bm, error: bme } = await supabase.from('body_measurements')
          .select('*').eq('user_id', uid)
          .gte('measured_at', measStart.toISOString())
          .lte('measured_at', nowISO)
          .order('measured_at', { ascending: true });
        if (bme) throw bme;
        setMeas((bm||[]) as BodyMeas[]);

        // baseline (earliest ever) + latest (all-time)
        const [earliest, latest] = await Promise.all([
          supabase.from('body_measurements')
            .select('measured_at, weight_kg')
            .eq('user_id', uid)
            .not('weight_kg','is',null)
            .order('measured_at', { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase.from('body_measurements')
            .select('measured_at, weight_kg')
            .eq('user_id', uid)
            .not('weight_kg','is',null)
            .order('measured_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (earliest.data?.weight_kg != null) {
          setBaselineWeight(Number(earliest.data.weight_kg));
          setBaselineDate(earliest.data.measured_at);
        } else { setBaselineWeight(null); setBaselineDate(null); }
        if (latest.data?.weight_kg != null) {
          setLatestWeight(Number(latest.data.weight_kg));
          setLatestDate(latest.data.measured_at);
        } else { setLatestWeight(null); setLatestDate(null); }

      } catch (e: any) {
        setErr(e?.message || 'שגיאה בטעינה');
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, rangeDays, userTabEquip.length]);

  /* ---------- Derivations: SUMMARY (“תמונת מצב”) ---------- */

  // 1) Workout summary
  const workoutSummary = useMemo(() => {
    const weByWorkout = new Map<number, WorkoutExercise[]>();
    workoutExercises.forEach(we => {
      const arr = weByWorkout.get(we.workout_id) || [];
      arr.push(we); weByWorkout.set(we.workout_id, arr);
    });
    const setsByWe = new Map<number, ExerciseSet[]>();
    sets.forEach(s => {
      const arr = setsByWe.get(s.workout_exercise_id) || [];
      arr.push(s); setsByWe.set(s.workout_exercise_id, arr);
    });

    const cardioRe = /(run|treadmill|row|rowing|bike|cycling|elliptical|swim|walk|erg|airdyne|ski|skierg|jump\s*rope|sprint|jog|קרדיו|ריצה|הליכה|אופניים|שח(י|יָ)ה|חתירה|אליפט)/i;
    const strengthRe = /(press|squat|deadlift|bench|curl|row|pull|push|fly|dip|lunge|raise|press|חזה|דחיקה|סקוואט|דדליפט|לחיצה|עליות|משיכה|פשיטה|כפיפות|יד|כתפ|גב|ירך)/i;

    let total=0, cardio=0, strength=0, mixed=0;
    for (const w of workouts) {
      total++;
      const wes = weByWorkout.get(w.id) || [];
      let hasCardio=false, hasStrength=false;
      for (const we of wes) {
        const e = equip.get(we.equipment_id);
        const nm = `${e?.name_en||''} ${e?.name_he||''}`;
        if (cardioRe.test(nm)) hasCardio = true;
        if (strengthRe.test(nm)) hasStrength = true;
        const ss = setsByWe.get(we.id) || [];
        if (ss.some(s=> (s.weight_kg??null)!=null )) hasStrength = true;
      }
      if (hasCardio && !hasStrength) cardio++;
      else if (!hasCardio && hasStrength) strength++;
      else if (hasCardio && hasStrength) mixed++;
      else strength++; // ברירת מחדל: אימון עם סטים → כוח
    }
    return { total, cardio, strength, mixed };
  }, [workouts, workoutExercises, sets, equip]);

  // 2) Weight: slope in range; Δ baseline→latest (all-time)
  const weightSummary = useMemo(() => {
    // slope based on in-range points; fallback to all-time
    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate()-rangeDays);
    const weightsAll = meas
      .filter(m=>m.weight_kg!=null)
      .map(m=>({ t: dayStart(new Date(m.measured_at)).getTime(), v: Number(m.weight_kg) }))
      .sort((a,b)=> a.t-b.t);
    const inRange = weightsAll.filter(p => p.t>=dayStart(start).getTime() && p.t<=dayStart(now).getTime());

    let slope = slopePerWeek(inRange);
    if (!isFinite(slope)) {
      slope = slopePerWeek(weightsAll);
      if (!isFinite(slope)) slope = 0; // single point → 0
    }

    const startV = baselineWeight ?? (weightsAll[0]?.v ?? NaN);
    const endV   = latestWeight ?? (weightsAll[weightsAll.length-1]?.v ?? NaN);
    const delta  = isFinite(startV)&&isFinite(endV) ? endV - startV : NaN;

    return { slopeKgPerWeek: slope, start: startV, end: endV, delta };
  }, [meas, rangeDays, baselineWeight, latestWeight]);

  // 3) Body fat — measured or estimated (latest)
  const bodyFatSummary = useMemo(() => {
    const sorted = [...meas].sort((a,b)=> +new Date(a.measured_at) - +new Date(b.measured_at));
    const latest = sorted[sorted.length-1];
    if (!latest) return { bf: NaN, source: '—' as string, when: '' };
    if (latest.body_fat_percent!=null) return { bf: Number(latest.body_fat_percent), source: 'נמדד' as const, when: latest.measured_at };
    const bfEst = estimateBfNavy(
      profile?.gender,
      profile?.height_cm,
      latest.neck_cm,
      latest.waist_navel_cm ?? latest.waist_cm,
      latest.hips_cm
    );
    return { bf: isFinite(bfEst)? bfEst : NaN, source: isFinite(bfEst)? 'אומדן (US Navy)' : '—', when: latest.measured_at };
  }, [meas, profile]);

  /* ---------- Workout log helpers ---------- */
  const weByWorkout = useMemo(() => {
    const map = new Map<number, WorkoutExercise[]>();
    for (const we of workoutExercises) {
      const arr = map.get(we.workout_id) || [];
      arr.push(we); map.set(we.workout_id, arr);
    }
    return map;
  }, [workoutExercises]);

  const setsByWe = useMemo(() => {
    const map = new Map<number, ExerciseSet[]>();
    for (const s of sets) {
      const arr = map.get(s.workout_exercise_id) || [];
      arr.push(s); map.set(s.workout_exercise_id, arr);
    }
    return map;
  }, [sets]);

  const workoutsByTab = useMemo(() => {
    const map = new Map<number, Workout[]>();
    for (const w of workouts) {
      const tid = w.tab_id ?? -1;
      const arr = map.get(tid) || [];
      arr.push(w); map.set(tid, arr);
    }
    for (const [tid, arr] of map.entries()) {
      arr.sort((a,b)=> +new Date(a.started_at) - +new Date(b.started_at));
      map.set(tid, arr);
    }
    return map;
  }, [workouts]);

  const startValuePerEquip = useMemo(() => {
    const firstByEquip = new Map<number, number | null>();
    const sortedW = [...workouts].sort((a,b)=> +new Date(a.started_at) - +new Date(b.started_at));
    for (const w of sortedW) {
      const wes = weByWorkout.get(w.id) || [];
      for (const we of wes) {
        const ss = setsByWe.get(we.id) || [];
        const best = ss.map(s=>s.weight_kg ?? null).filter(v=>v!=null) as number[];
        if (!firstByEquip.has(we.equipment_id)) {
          firstByEquip.set(we.equipment_id, best.length ? Math.max(...best) : null);
        }
      }
    }
    return firstByEquip;
  }, [weByWorkout, setsByWe, workouts]);

  /* ---------- UI ---------- */
  if (loading) return <p className="opacity-70" dir="rtl">טוען…</p>;

  const bfDisplay = ((): string => {
    const v = bodyFatSummary.bf;
    return typeof v === 'number' && isFinite(v) && v >= 0 && v <= 60 ? `${fmtNum(v,1)}%` : '—';
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-8" dir="rtl">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">סיכום התקדמות</h1>
        <p className="text-sm opacity-70">תצוגה מסכמת: אימונים, משקל ומדידות – לפי טווח.</p>

        <div className="flex items-center gap-2">
          <RangeButton v={7}  cur={rangeDays} set={setRangeDays} />
          <RangeButton v={30} cur={rangeDays} set={setRangeDays} />
          <RangeButton v={60} cur={rangeDays} set={setRangeDays} />
          <RangeButton v={90} cur={rangeDays} set={setRangeDays} />
          {goals.length>0 && (
            <div className="ml-auto flex items-center gap-2">
              {goals.map(g=> <Tag key={g.goal_key}>{g.label}</Tag>)}
            </div>
          )}
        </div>
      </header>

      {/* ===================== תמונת מצב ===================== */}
      <Section title="תמונת מצב">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <KPI
            label="מס׳ אימונים"
            value={String(workoutSummary.total || 0)}
            hint={`כוח ${workoutSummary.strength} · קרדיו ${workoutSummary.cardio} · משולב ${workoutSummary.mixed}`}
          />

          <KPI
            label="קצב משקל (ק״ג/שבוע)"
            value={fmtNum(weightSummary.slopeKgPerWeek,2)}
            hint={`Δ ${fmtNum(weightSummary.delta,1)} (מ־${fmtNum(weightSummary.start,1)} ל־${fmtNum(weightSummary.end,1)})`}
            intent={isFinite(weightSummary.slopeKgPerWeek) ? (weightSummary.slopeKgPerWeek<0 ? 'good' : 'warn') : undefined}
          />

          <KPI
            label="אחוז שומן"
            value={bfDisplay}
            hint={bodyFatSummary.source}
          />
        </div>

        {/* מידע עזר קטן על הבייסליין/נוכחי (לא חובה) */}
        <div className="mt-3 text-xs opacity-70 space-x-3 space-y-1">
          {baselineWeight!=null && baselineDate && (
            <span>בייסליין: {fmtNum(baselineWeight,1)} ק״ג ({new Date(baselineDate).toLocaleDateString()})</span>
          )}
          {latestWeight!=null && latestDate && (
            <span>נוכחי: {fmtNum(latestWeight,1)} ק״ג ({new Date(latestDate).toLocaleDateString()})</span>
          )}
        </div>
      </Section>

      {/* ===================== מדידות (summary only) ===================== */}
      <Section title="שינויים במדידות (נפתח/נסגר)" subtitle="למעט משקל ואחוז שומן שמוצגים למעלה">
        <details className="rounded-lg ring-1 ring-black/10 dark:ring-white/10 p-3">
          <summary className="cursor-pointer select-none font-medium">פתח/י טבלת מדידות</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-black/5 dark:bg-white/10">
                <tr className="text-right">
                  <th className="px-3 py-2">מדד</th>
                  <th className="px-3 py-2">תחילת טווח</th>
                  <th className="px-3 py-2">סוף טווח</th>
                  <th className="px-3 py-2">Δ שינוי</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/10">
                {[
                  { key: 'waist_navel_cm', label: 'מותן–טבור (ס״מ)' },
                  { key: 'waist_cm', label: 'מותן (ס״מ)' },
                  { key: 'waist_narrow_cm', label: 'מותן צר (ס״מ)' },
                  { key: 'chest_cm', label: 'חזה (ס״מ)' },
                  { key: 'shoulders_cm', label: 'כתפיים (ס״מ)' },
                  { key: 'biceps_cm', label: 'זרוע (ס״מ)' },
                  { key: 'hips_cm', label: 'ירכיים/אגן (ס״מ)' },
                  { key: 'thigh_cm', label: 'ירך (ס״מ)' },
                  { key: 'calf_cm', label: 'שוק (ס״מ)' },
                  { key: 'neck_cm', label: 'צוואר (ס״מ)' },
                ].map(({key,label}: any, i: number) => {
                  const now = new Date();
                  const start = new Date(now); start.setDate(start.getDate() - rangeDays);
                  const inRange = meas
                    .filter(m => new Date(m.measured_at) >= start && new Date(m.measured_at) <= now)
                    .map(m => (m as any)[key])
                    .filter((v: any) => v!=null) as number[];
                  const startV = inRange.length ? Number(inRange[0]) : null;
                  const endV   = inRange.length ? Number(inRange[inRange.length-1]) : null;
                  const delta  = (startV!=null && endV!=null) ? endV - startV : null;
                  return (
                    <tr key={i}>
                      <td className="px-3 py-2">{label}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtNum(startV,1)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtNum(endV,1)}</td>
                      <td className="px-3 py-2 tabular-nums">{fmtNum(delta,1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      {/* ===================== יומן אימונים לפי TAB ===================== */}
      <Section title="יומן אימונים לפי TAB (נפתח/נסגר)" subtitle="כל האימונים בטווח, רק התרגילים הנבחרים בטאב, כולל סטים/חזרות/משקלים.">
        <details className="rounded-lg ring-1 ring-black/10 dark:ring-white/10 p-3">
          <summary className="cursor-pointer select-none font-medium">פתח/י טבלת אימונים מפורטת</summary>
          <div className="mt-3 grid gap-4">
            {Array.from(workoutsByTab.entries()).sort((a,b)=>(a[0]??0)-(b[0]??0)).map(([tabId, ws])=>{
              const chosenEqIds = userTabEquip.filter(x=>x.tab_id===tabId).map(x=>x.equipment_id);
              if (!ws.length || !chosenEqIds.length) return null;

              const startBadges = new Map<number, string>();
              for (const eqId of chosenEqIds) {
                const sv = startValuePerEquip.get(eqId);
                if (sv != null) startBadges.set(eqId, `נתון פתיחה: ${fmtNum(sv,0)} ק״ג`);
              }

              return (
                <div key={tabId} className="rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                  <div className="px-3 py-2 border-b border-black/10 dark:border-white/10 flex items-center gap-2">
                    <div className="font-medium">TAB #{tabId}</div>
                    <div className="text-xs opacity-70">
                      {chosenEqIds.slice(0,8).map((id,i)=><Tag key={i}>{equipName(equip.get(id))}</Tag>)}
                      {chosenEqIds.length>8 && <Tag>+{chosenEqIds.length-8} עוד</Tag>}
                    </div>
                  </div>

                  <div className="p-3 overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-black/5 dark:bg-white/10">
                        <tr className="text-right">
                          <th className="px-3 py-2">תאריך אימון</th>
                          <th className="px-3 py-2">תרגיל</th>
                          <th className="px-3 py-2">סטים שבוצעו</th>
                          <th className="px-3 py-2">פתיחה</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10 dark:divide-white/10">
                        {ws.map(w=>{
                          const wes = (weByWorkout.get(w.id)||[]).filter(we=> chosenEqIds.includes(we.equipment_id));
                          if (!wes.length) return null;
                          return wes.map((we, idx)=>{
                            const e = equip.get(we.equipment_id);
                            const ss = (setsByWe.get(we.id)||[]).sort((a,b)=> (a.id??0)-(b.id??0));
                            const setLine = (s: ExerciseSet) => {
                              const parts: string[] = [];
                              if (s.weight_kg != null && s.reps != null) parts.push(`${s.weight_kg}×${s.reps}`);
                              else if (s.reps != null) parts.push(`${s.reps} חזרות`);
                              if (s.distance_km != null) parts.push(`${s.distance_km} ק״מ`);
                              else if (s.distance_m != null) parts.push(`${s.distance_m} מ׳`);
                              if (s.duration_sec != null) parts.push(`${Math.round((s.duration_sec||0)/60)} דק׳`);
                              return parts.join(' · ');
                            };
                            return (
                              <tr key={`${w.id}-${we.id}`}>
                                <td className="px-3 py-2 whitespace-nowrap">{idx===0? new Date(w.started_at).toLocaleDateString(): ''}</td>
                                <td className="px-3 py-2 whitespace-nowrap">{equipName(e)}</td>
                                <td className="px-3 py-2">
                                  {ss.length ? <div className="flex flex-wrap gap-1">{ss.map(s=> <Tag key={s.id}>{setLine(s)}</Tag>)}</div> : <span className="opacity-60">—</span>}
                                </td>
                                <td className="px-3 py-2 text-xs opacity-70">{startBadges.get(we.equipment_id) || '—'}</td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </Section>

      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  );
}

/* =========================
   Local UI bits
   ========================= */
function RangeButton({ v, cur, set }: { v: RangeDays; cur: RangeDays; set: (v: RangeDays)=>void }) {
  const active = v===cur;
  return (
    <button onClick={()=>set(v)}
      className={`rounded-full px-3 py-1.5 text-sm border ${active?'bg-foreground text-background border-foreground':'border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]'}`}>
      {v} ימים
    </button>
  );
}
function equipName(e?: Equipment) {
  if (!e) return '—';
  const en = (e?.name_en||'').trim(), he = (e?.name_he||'').trim();
  if (en && he) return `${en} — ${he}`;
  return he || en || `#${e?.id}`;
}
