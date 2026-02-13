// src/app/workouts/start/page.tsx

// ===== Section 1 — Imports & Types =====
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Equip = {
  id: number;
  name_en: string | null;
  name_he: string | null;
  image_url: string | null;
};

type WorkoutExercise = {
  id: number;           // workout_exercises.id (0 = מתוכנן לפני יצירת אימון)
  equipment_id: number; // FK to equipment
  order_index: number;
  equip: Equip;
  sets: ExerciseSet[];  // sets in THIS workout (live)
};

type ExerciseSet = {
  id: number;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  distance_m: number | null;
};

type HistoryRow = {
  id: number;
  set_index: number;
  weight_kg: number | null;
  reps: number | null;
  distance_m: number | null;
  workout_id: number;
  started_at: string; // workout started_at (for date)
};

type WorkoutTab = { id: number; name: string; emoji?: string | null; order_index: number };
// ===== End Section 1 =====



// ===== Section 2 — Constants =====
const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e5e7eb"/><stop offset="1" stop-color="#d1d5db"/></linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/>
  <g fill="#6b7280">
    <rect x="460" y="340" width="360" height="40" rx="8"/>
    <rect x="420" y="325" width="30" height="70" rx="6"/>
    <rect x="830" y="325" width="30" height="70" rx="6"/>
  </g>
</svg>
`.trim());

// זיהוי פשוט לתרגילי קרדיו לפי שם
const isCardioCheck = (name: string) => {
  return /run|treadmill|row|bike|cycling|elliptical|ski|swim|walk|airdyne|crosstrainer|הליכון|ריצה|אופניים|חתירה|אליפטי/i.test(name);
};
// ===== End Section 2 =====



// ===== Section 3 — StartWorkoutPage =====
export default function StartWorkoutPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs selection
  const [tabs, setTabs] = useState<WorkoutTab[]>([]);
  const [chosenTabId, setChosenTabId] = useState<number | null>(null);

  // Workout lifecycle
  const [workoutId, setWorkoutId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null); // ISO
  const [endedAt, setEndedAt] = useState<string | null>(null);

  // Inactivity Logic State
  const [lastActivity, setLastActivity] = useState<number>(Date.now());
  const [isAutoPaused, setIsAutoPaused] = useState<boolean>(false);

  // Exercises for this workout (or planned before start)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);

  // Per-exercise new set form
  const [newSetByEx, setNewSetByEx] = useState<Record<number, { weight: string; reps: string; distance: string }>>(
    {}
  );
  const weightRefMap = useRef<Record<number, HTMLInputElement | null>>({});

  // Expand/collapse last 7 workouts history
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [historyByEquip, setHistoryByEquip] = useState<Record<number, HistoryRow[]>>({});
  const [historyBusy, setHistoryBusy] = useState<Record<number, boolean>>({});

  // Finished (green header) logic — color ONLY the previous exercise when moving on
  const [finishedWe, setFinishedWe] = useState<Record<number, boolean>>({});
  const [activeWeId, setActiveWeId] = useState<number | null>(null); // last exercise we added a set to

  // Mobile UX State: Active exercise index (using order_index instead of ID for stability)
  const [mobileActiveIndex, setMobileActiveIndex] = useState<number | null>(null);

  // Rest-day flag
  const [isRestToday, setIsRestToday] = useState<boolean>(false);

  // Helper to register user activity (resets the inactivity timer)
  const registerActivity = () => {
    setLastActivity(Date.now());
    if (isAutoPaused) setIsAutoPaused(false);
  };

  // Timer Logic (With Auto-Pause support)
  const [elapsed, setElapsed] = useState(0); // seconds
  useEffect(() => {
    if (!startedAt || endedAt) return;
    
    const startMs = +new Date(startedAt);
    
    // If auto-paused, freeze time at the moment pause started (lastActivity + 30 mins)
    if (isAutoPaused) {
       // Pause started 30 mins after last activity
       const pauseTime = lastActivity + (30 * 60 * 1000); 
       setElapsed(Math.max(0, Math.floor((pauseTime - startMs) / 1000)));
       return;
    }

    const t = setInterval(() => {
        setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [startedAt, endedAt, isAutoPaused, lastActivity]);

  // Inactivity Monitor Effect
  useEffect(() => {
    if (!workoutId || endedAt) return; // Only monitor active workouts

    const checkInterval = setInterval(() => {
        const now = Date.now();
        const diff = now - lastActivity;
        const THIRTY_MIN = 30 * 60 * 1000;

        // 1. Auto-Pause after 30 mins inactivity
        if (!isAutoPaused && diff > THIRTY_MIN) {
            setIsAutoPaused(true);
        }

        // 2. Auto-Finish after another 30 mins (Total 60 mins inactivity)
        if (isAutoPaused && diff > THIRTY_MIN * 2) {
            // Finish time should be when it effectively paused (lastActivity + 30m)
            const autoEndTime = new Date(lastActivity + THIRTY_MIN).toISOString();
            finishWorkout(autoEndTime);
        }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(checkInterval);
  }, [workoutId, endedAt, lastActivity, isAutoPaused]);

  // ----- helpers to reset ui without navigation -----
  const resetToPlanning = () => {
    // מאפס מצב אימון מקומי — ה־effect של טעינת תוכן מטאב ירוץ שוב כי workoutId חוזר ל-null
    setWorkoutId(null);
    setStartedAt(null);
    setEndedAt(null);
    setExercises([]);          // ייטען מחדש מהטאב הנבחר
    setFinishedWe({});
    setActiveWeId(null);
    setNewSetByEx({});
    setExpanded({});
    setHistoryByEquip({});
    setError(null);
    setMobileActiveIndex(null);
    setIsAutoPaused(false);
    setLastActivity(Date.now());
  };

  // Bootstrap: auth + tabs + either resume or wait for user to choose a tab + rest-flag
  useEffect(() => {
    let ignore = false;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;
      if (!uid) {
        router.push('/login');
        return;
      }
      if (ignore) return;
      setUserId(uid);
      setError(null);

      // rest-day status for today
      await loadRestFlag(uid);

      // Try to resume an active workout
      const { data: active, error: aErr } = await supabase
        .from('workouts')
        .select('id, started_at, ended_at')
        .eq('user_id', uid)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (aErr) { setError(aErr.message); setLoading(false); return; }

      // Load tabs
      const { data: tRows, error: tErr } = await supabase
        .from('user_workout_tabs')
        .select('id, name, emoji, order_index')
        .eq('user_id', uid)
        .order('order_index', { ascending: true });

      if (tErr) {
        setError(tErr.message);
      } else {
        const list: WorkoutTab[] = (tRows ?? []).map(r => ({
          id: r.id, name: r.name || 'כללי', emoji: r.emoji ?? null, order_index: r.order_index ?? 0
        }));
        setTabs(list);
        if (list.length && !active) setChosenTabId(list[0].id);
      }

      if (active?.id) {
        // Resume: load workout_exercises + sets
        setWorkoutId(active.id);
        setStartedAt(active.started_at);
        setEndedAt(active.ended_at);
        
        // Reset activity timer on resume
        setLastActivity(Date.now());

        const { data: wex, error: wexErr } = await supabase
          .from('workout_exercises')
          .select('id, equipment_id, order_index, equipment:equipment_id ( id, name_en, name_he, image_url )')
          .eq('workout_id', active.id)
          .order('order_index', { ascending: true });

        if (wexErr) { setError(wexErr.message); setLoading(false); return; }

        const ids = (wex ?? []).map((r: any) => r.id);
        let setsByWe = new Map<number, ExerciseSet[]>();
        if (ids.length) {
          const { data: setsRows, error: setsErr } = await supabase
            .from('exercise_sets')
            .select('id, workout_exercise_id, set_index, weight_kg, reps, distance_m')
            .in('workout_exercise_id', ids)
            .order('set_index', { ascending: true });

          if (setsErr) { setError(setsErr.message); setLoading(false); return; }

          setsByWe = (setsRows ?? []).reduce((m: Map<number, ExerciseSet[]>, r: any) => {
            const arr = m.get(r.workout_exercise_id) ?? [];
            arr.push({
              id: r.id,
              set_index: r.set_index,
              weight_kg: r.weight_kg,
              reps: r.reps,
              distance_m: r.distance_m,
            });
            m.set(r.workout_exercise_id, arr);
            return m;
          }, new Map());
        }

        setExercises(
          (wex ?? []).map((r: any, i: number) => ({
            id: r.id,
            equipment_id: r.equipment_id,
            order_index: r.order_index ?? i,
            equip: {
              id: r.equipment?.id ?? r.equipment_id,
              name_en: r.equipment?.name_en ?? null,
              name_he: r.equipment?.name_he ?? null,
              image_url: r.equipment?.image_url ?? null,
            },
            sets: setsByWe.get(r.id) ?? [],
          }))
        );
      }

      setLoading(false);
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user?.id) router.push('/login');
    });
    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  // Build planned exercises from chosen tab (when user switches tabs and no active workout)
  useEffect(() => {
    const loadFromTab = async () => {
      if (!userId || !chosenTabId || workoutId) return;
      setError(null);

      const { data: rows, error } = await supabase
        .from('user_tab_equipment')
        .select('equipment_id, selected_at, equipment:equipment_id ( id, name_en, name_he, image_url )')
        .eq('user_id', userId)
        .eq('tab_id', chosenTabId)
        .order('selected_at', { ascending: true });

      if (error) { setError(error.message); setExercises([]); return; }

      const planned = (rows ?? [])
        .map((r: any, i: number) => ({
          id: 0,
          equipment_id: r.equipment?.id ?? r.equipment_id,
          order_index: i,
          equip: {
            id: r.equipment?.id ?? r.equipment_id,
            name_en: r.equipment?.name_en ?? null,
            name_he: r.equipment?.name_he ?? null,
            image_url: r.equipment?.image_url ?? null,
          } as Equip,
          sets: [],
        }))
        .filter((x: any) => !!x.equipment_id);

      setExercises(planned as WorkoutExercise[]);
    };

    loadFromTab();
  }, [userId, chosenTabId, workoutId]);

  // Start workout: create workout + workout_exercises from chosenTabId
  const startWorkout = async () => {
    if (!userId) return;
    if (workoutId) return;
    if (!chosenTabId) { setError('אנא בחרו טאב אימון שממנו תרצו להתחיל.'); return; }
    if (exercises.length === 0) { setError('לטאב שנבחר אין תרגילים.'); return; }

    setError(null);
    registerActivity(); // Activity!

    const nowIso = new Date().toISOString();
    const { data: w, error: werr } = await supabase
      .from('workouts')
      .insert({ user_id: userId, started_at: nowIso, tab_id: chosenTabId })
      .select('id, started_at')
      .single();

    if (werr || !w) { setError(werr?.message || 'שגיאה ביצירת אימון.'); return; }
    setWorkoutId(w.id as number);
    setStartedAt(w.started_at as string);

    // bulk insert workout_exercises
    const payload = exercises.map((e) => ({
      workout_id: w.id,
      equipment_id: e.equipment_id,
      order_index: e.order_index,
    }));
    const { data: exRows, error: exErr } = await supabase
      .from('workout_exercises')
      .insert(payload)
      .select('id, equipment_id, order_index');

    if (exErr) { setError(exErr.message); return; }

    const idByEquip = new Map<number, number>();
    (exRows ?? []).forEach((r: any) => idByEquip.set(r.equipment_id, r.id));

    setExercises((prev) =>
      prev.map((e) => ({
        ...e,
        id: idByEquip.get(e.equipment_id) ?? e.id,
      }))
    );
  };

  // Load last 7 actual workouts history for one equipment (lazy)
  const loadHistory = async (equipmentId: number) => {
    if (!userId) return;
    setHistoryBusy((m) => ({ ...m, [equipmentId]: true }));
    registerActivity(); // User interaction count as activity

    try {
      // 1) Find last 7 workout_exercises for this equipment
      const { data: wexRows, error: wexErr } = await supabase
        .from('workout_exercises')
        .select('id, workout_id, workouts!inner(started_at, user_id)')
        .eq('equipment_id', equipmentId)
        .eq('workouts.user_id', userId)
        .order('started_at', { foreignTable: 'workouts', ascending: false })
        .limit(7);

      if (wexErr) {
        setError(wexErr.message);
        setHistoryBusy((m) => ({ ...m, [equipmentId]: false }));
        return;
      }

      if (!wexRows || wexRows.length === 0) {
        setHistoryByEquip((m) => ({ ...m, [equipmentId]: [] }));
        setHistoryBusy((m) => ({ ...m, [equipmentId]: false }));
        return;
      }

      const weIds = wexRows.map((r: any) => r.id);
      
      const workoutMeta = new Map<number, string>();
      wexRows.forEach((r: any) => {
        if (r.workouts?.started_at) {
          workoutMeta.set(r.workout_id, r.workouts.started_at);
        }
      });

      // 2) all sets for those workout_exercises
      const { data: sets, error: sErr } = await supabase
        .from('exercise_sets')
        .select('id, workout_exercise_id, set_index, weight_kg, reps, distance_m')
        .in('workout_exercise_id', weIds)
        .order('set_index', { ascending: true });

      if (sErr) {
        setError(sErr.message);
        setHistoryBusy((m) => ({ ...m, [equipmentId]: false }));
        return;
      }

      const rows: HistoryRow[] = (sets ?? []).map((s) => {
        const parentWe = wexRows.find((r: any) => r.id === s.workout_exercise_id);
        const wid = parentWe ? parentWe.workout_id : 0;
        
        return {
          id: s.id,
          set_index: s.set_index,
          weight_kg: s.weight_kg,
          reps: s.reps,
          distance_m: s.distance_m,
          workout_id: wid,
          started_at: workoutMeta.get(wid) || '',
        };
      });

      rows.sort((a, b) => +new Date(b.started_at) - +new Date(a.started_at) || a.set_index - b.set_index);

      setHistoryByEquip((m) => ({ ...m, [equipmentId]: rows }));
    } catch (err: any) {
      setError(err?.message || 'שגיאה בטעינת היסטוריה');
    } finally {
      setHistoryBusy((m) => ({ ...m, [equipmentId]: false }));
    }
  };

  // Add a set for a specific exercise card
  const addSet = async (weId: number) => {
    if (!weId) {
      await startWorkout();
      return;
    }

    const ex = exercises.find((e) => e.id === weId);
    if (!ex) return;

    const form = newSetByEx[weId] || { weight: '', reps: '', distance: '' };
    const weight = toNumOrNull(form.weight);
    const reps = toIntOrNull(form.reps);
    const distance = toIntOrNull(form.distance);

    if (reps === null && weight === null && distance === null) {
      setError('נא להזין חזרות או משקל או מרחק.');
      return;
    }

    registerActivity(); // Activity!

    const nextIndex = (ex.sets[ex.sets.length - 1]?.set_index ?? 0) + 1;

    const { data, error } = await supabase
      .from('exercise_sets')
      .insert({
        workout_exercise_id: weId,
        set_index: nextIndex,
        weight_kg: weight,
        reps: reps,
        distance_m: distance,
      })
      .select('id, set_index, weight_kg, reps, distance_m')
      .single();

    if (error) { setError(error.message); return; }

    // mark PREVIOUS active exercise as finished ONLY when moving to a new one
    setFinishedWe((prev) => {
      if (activeWeId && activeWeId !== weId) {
        return { ...prev, [activeWeId]: true };
      }
      return prev;
    });
    setActiveWeId(weId); 

    // Update local sets
    setExercises((prev) =>
      prev.map((e) => (e.id === weId ? { ...e, sets: [...e.sets, data as ExerciseSet] } : e))
    );
    // Keep form values if mobile modal, otherwise might reset - standard behavior is to reset
    setNewSetByEx((prev) => ({ ...prev, [weId]: { weight: '', reps: '', distance: '' } }));

    // focus back to weight
    const el = weightRefMap.current[weId];
    if (el) setTimeout(() => el.focus(), 0);

    // If history is open for this equipment, refresh it
    const exObj = exercises.find((e) => e.id === weId);
    if (exObj && expanded[exObj.equipment_id]) loadHistory(exObj.equipment_id);
  };

  const removeSet = async (weId: number, setId: number) => {
    const ok = confirm('למחוק את הסט?');
    if (!ok) return;
    
    registerActivity(); // Activity!

    const { error } = await supabase.from('exercise_sets').delete().eq('id', setId);
    if (error) { setError(error.message); return; }
    setExercises((prev) =>
      prev.map((e) => (e.id === weId ? { ...e, sets: e.sets.filter((s) => s.id !== setId) } : e))
    );
  };

  // Optional customEndTime allows finishing workout at a past timestamp (for auto-finish)
  const finishWorkout = async (customEndTime?: string) => {
    if (!workoutId) return;
    
    registerActivity(); 

    const endIso = customEndTime || new Date().toISOString();
    const { error } = await supabase.from('workouts').update({ ended_at: endIso }).eq('id', workoutId);
    if (error) { setError(error.message); return; }
    setEndedAt(endIso);
  };

  // ---- Deep cancel without navigation (fix 404) ----
  const cancelWorkout = async () => {
    if (!workoutId) { resetToPlanning(); return; }

    const msg = endedAt
      ? 'למחוק את האימון שהסתיים? פעולה זו תמחק לצמיתות את האימון והסטים שלו.'
      : 'לבטל את האימון? פעולה זו תמחק את כל נתוני האימון שנרשמו.';
    const ok = confirm(msg);
    if (!ok) return;

    try {
      const { data: weRows } = await supabase
        .from('workout_exercises')
        .select('id')
        .eq('workout_id', workoutId);

      const weIds = (weRows ?? []).map((r: any) => r.id);
      if (weIds.length) {
        await supabase.from('exercise_sets').delete().in('workout_exercise_id', weIds);
        await supabase.from('workout_exercises').delete().in('id', weIds);
      }

      await supabase.from('workouts').delete().eq('id', workoutId);
      resetToPlanning();
    } catch (e: any) {
      setError(e?.message || 'שגיאה בביטול אימון.');
    }
  };

  // ===== Rest-day helpers =====
  function todayDateStrLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  async function loadRestFlag(uid: string) {
    const { data } = await supabase
      .from('user_day_status')
      .select('is_rest')
      .eq('user_id', uid)
      .eq('day', todayDateStrLocal())
      .maybeSingle();
    setIsRestToday(!!data?.is_rest);
  }

  const toggleRest = async () => {
    if (!userId) return;
    const day = todayDateStrLocal();
    const next = !isRestToday;
    const { error } = await supabase
      .from('user_day_status')
      .upsert({ user_id: userId, day, is_rest: next }, { onConflict: 'user_id,day' });
    if (error) { setError(error.message); return; }
    setIsRestToday(next);
  };

  const elapsedFmt = useMemo(() => formatDuration(elapsed), [elapsed]);
  const fmtDate = useMemo(() => new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }), []); // DATE ONLY

  if (loading) return <p className="opacity-70">טוען…</p>;

  // Use order_index instead of id to find active exercise (stable across startWorkout)
  const activeMobileEx = exercises.find(e => e.order_index === mobileActiveIndex);
  
  // Calculate specific equipment type for mobile modal layout adjustments
  const isCardio = activeMobileEx ? isCardioCheck(activeMobileEx.equip.name_en || activeMobileEx.equip.name_he || '') : false;

  return (
    <div className="mx-auto max-w-6xl space-y-8" dir="rtl">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">התחלת אימון</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          בחרו טאב אימון והתחילו. כל טאב מנהל רשימת תרגילים משלו.
        </p>
      </header>

      {/* Choose tab (if not resuming) - UPDATED FOR MOBILE DROPDOWN */}
      {!workoutId && (
        <div className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-3">
          
          {/* Desktop/Tablet Horizontal Scroll */}
          <div className="hidden md:flex items-center gap-2 overflow-x-auto pb-1">
            {tabs.length === 0 ? (
              <span className="text-sm opacity-70">אין טאבים. צרו טאב בעמוד "בחירת מכשירים".</span>
            ) : (
              tabs.map((t) => {
                const active = t.id === chosenTabId;
                return (
                  <button
                    key={t.id}
                    onClick={() => setChosenTabId(t.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm border inline-flex items-center gap-2 transition
                      ${
                        active
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
                      }`}
                  >
                    <span className="text-base">{t.emoji || '🏷️'}</span>
                    <span className="font-medium">{t.name}</span>
                  </button>
                );
              })
            )}
          </div>

          {/* Mobile Dropdown */}
          <div className="md:hidden w-full">
            <label className="text-xs font-bold opacity-70 mb-1.5 block">בחר סוג אימון:</label>
            {tabs.length === 0 ? (
                 <span className="text-sm opacity-70">אין טאבים. צרו טאב בעמוד "בחירת מכשירים".</span>
            ) : (
                <div className="relative">
                    <select
                        value={chosenTabId || ''}
                        onChange={(e) => setChosenTabId(Number(e.target.value))}
                        className="w-full appearance-none bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/20 rounded-xl py-3 pr-4 pl-10 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {tabs.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.emoji || '🏷️'} {t.name}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-500">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>
            )}
          </div>

          <div className="text-sm opacity-80 self-end md:self-auto">
            {exercises.length ? `נבחרו ${exercises.length} תרגילים בטאב זה` : 'לא נבחרו תרגילים לטאב זה'}
          </div>
        </div>
      )}

      {/* Top status strip: timer + actions */}
      <div className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="text-sm flex flex-col md:flex-row items-center gap-1 md:gap-2">
          <span>סטטוס:</span>
          {startedAt ? (
             endedAt ? (
               <b className="text-emerald-600">הושלם</b>
             ) : isAutoPaused ? (
               <b className="text-orange-500 flex items-center gap-1">
                 <span className="animate-pulse">⏸️</span> מושהה (חוסר פעילות)
               </b>
             ) : (
               <b className="text-indigo-600">באימון</b>
             )
          ) : (
             <b>טרם התחלתם</b>
          )}
        </div>

        <div className={`text-2xl font-semibold tabular-nums ${isAutoPaused ? 'opacity-50' : ''}`}>
           {startedAt ? elapsedFmt : '00:00'}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleRest}
            className={`rounded-lg px-4 py-2 h-11 ${
              isRestToday
                ? 'border border-emerald-500/60 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10'
                : 'border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
            }`}
            title="סמן/י את היום כיום מנוחה — יעד פחמ׳ יורד מעט ושומן עולה מעט"
          >
            {isRestToday ? 'בטל יום מנוחה' : 'יום מנוחה'}
          </button>

          {!startedAt ? (
            <button
              onClick={startWorkout}
              className="rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90"
              disabled={!chosenTabId || exercises.length === 0}
            >
              התחל אימון
            </button>
          ) : endedAt ? (
            <>
              <button
                onClick={resetToPlanning}
                className="rounded-lg border border-black/10 dark:border-white/20 px-4 py-2 h-11 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                title="איפוס המסך כדי להתחיל אימון חדש (האימון שהסתיים נשמר)"
              >
                התחל אימון חדש
              </button>
            </>
          ) : (
            <button
              onClick={() => finishWorkout()}
              className="rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90"
            >
              סיום אימון
            </button>
          )}
          <button
            onClick={cancelWorkout}
            className="rounded-lg border border-black/10 dark:border-white/20 px-4 py-2 h-11 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            בטל אימון
          </button>
        </div>
      </div>

      {/* ===== MOBILE: Compact Grid of Images ===== */}
      <div className="md:hidden grid grid-cols-2 gap-3">
         {exercises.map(ex => (
            <button 
               key={ex.id || `mobile-ex-${ex.order_index}`}
               // Use order_index instead of potentially 0-id for selection
               onClick={() => {
                   setMobileActiveIndex(ex.order_index);
                   registerActivity(); // Tracking interaction
               }}
               className={`relative aspect-[4/3] rounded-xl overflow-hidden border transition-all ${finishedWe[ex.id] ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-black/10 dark:border-white/10'}`}
            >
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src={ex.equip.image_url || PLACEHOLDER_IMG} className="absolute inset-0 w-full h-full object-cover" alt="" />
               <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3 text-right">
                  <span className="text-white font-bold text-sm leading-tight line-clamp-2">
                    {ex.equip.name_he || ex.equip.name_en || 'תרגיל'}
                  </span>
                  <div className="flex justify-between items-end mt-1">
                     <span className="text-[10px] text-white/80">
                        {ex.sets.length > 0 ? `${ex.sets.length} סטים` : 'טרם בוצע'}
                     </span>
                     {finishedWe[ex.id] && <span className="text-emerald-400 text-xs">✓</span>}
                  </div>
               </div>
            </button>
         ))}
      </div>

      {/* ===== MOBILE MODAL for Active Exercise ===== */}
      {/* Check explicitly against null because index 0 is falsy */}
      {mobileActiveIndex !== null && activeMobileEx && (
         <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm md:hidden animate-in fade-in duration-200">
            {/* Modal Content - ADDED MARGIN AND CORNERS */}
            <div 
                className="bg-white dark:bg-neutral-900 w-[calc(100%-16px)] h-[85vh] mx-auto mb-2 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300"
                onClick={e => e.stopPropagation()}
            >
               {/* Modal Header */}
               <div className="p-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-white/5 shrink-0">
                  <div className="flex flex-col">
                      <h3 className="font-bold text-lg leading-tight">
                         {activeMobileEx.equip.name_he || activeMobileEx.equip.name_en}
                      </h3>
                      <span className="text-xs opacity-60">
                        {activeMobileEx.sets.length} סטים בוצעו
                      </span>
                  </div>
                  <button 
                     onClick={() => setMobileActiveIndex(null)} 
                     className="bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                     סגור
                  </button>
               </div>

               {/* Modal Body - Scrollable */}
               <div className="p-4 overflow-y-auto flex-1 space-y-6 bg-background">
                  
                  {/* Image & History Toggle - CHANGED */}
                  <div className="flex flex-col gap-4 items-center">
                     {/* Image Container - CENTERED AND LARGER */}
                     <div className="w-full h-48 sm:h-56 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-white shadow-sm relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                            src={activeMobileEx.equip.image_url || PLACEHOLDER_IMG} 
                            className="w-full h-full object-contain p-2" 
                            alt="equipment" 
                        />
                     </div>

                     {/* History Section - BUTTON WIDTH ADJUSTED */}
                     <div className="w-full">
                        <button
                           onClick={async () => {
                             registerActivity();
                             const equipId = activeMobileEx.equipment_id;
                             const open = !expanded[equipId];
                             setExpanded((m) => ({ ...m, [equipId]: open }));
                             if (open && historyByEquip[equipId] == null) {
                               await loadHistory(equipId);
                             }
                           }}
                           className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm font-bold transition-colors hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                        >
                           <span>{expanded[activeMobileEx.equipment_id] ? 'הסתר היסטוריה' : 'הצג היסטוריה אחרונה'}</span>
                           <span>🕒</span>
                        </button>

                        {/* History container - REMOVED SCROLL, ADDED CONDITIONAL COLUMNS */}
                        {expanded[activeMobileEx.equipment_id] && (
                           <div className="mt-3 bg-white dark:bg-black/20 border border-black/5 dark:border-white/5 rounded-xl overflow-hidden shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="p-0">
                                  {historyBusy[activeMobileEx.equipment_id] ? (
                                    <div className="p-4 text-center text-sm opacity-60">טוען נתונים...</div>
                                  ) : (historyByEquip[activeMobileEx.equipment_id]?.length ?? 0) === 0 ? (
                                    <div className="p-4 text-center text-sm opacity-60">אין היסטוריה לתרגיל זה</div>
                                  ) : (
                                    // Removed max-h and overflow-y to show full list
                                    <AggregatedHistoryByWeight 
                                        rows={historyByEquip[activeMobileEx.equipment_id]!} 
                                        fmtDate={fmtDate}
                                        isCardio={isCardio}
                                    />
                                  )}
                              </div>
                           </div>
                        )}
                     </div>
                  </div>

                  {/* Input Form */}
                  <div className="bg-white dark:bg-neutral-800 p-5 rounded-xl border border-black/5 dark:border-white/5 shadow-sm ring-1 ring-black/5">
                     <div className="flex items-center justify-between mb-4">
                        <h4 className="font-bold text-base flex items-center gap-2">
                            <span className="w-1 h-5 bg-indigo-500 rounded-full"></span>
                            הוספת סט {activeMobileEx.sets.length + 1}
                        </h4>
                        <div className="text-xs text-gray-500 font-mono">
                            {newSetByEx[activeMobileEx.id]?.weight ? `${newSetByEx[activeMobileEx.id]?.weight}kg` : ''}
                        </div>
                     </div>
                     
                     <form
                        onSubmit={async (e) => {
                           e.preventDefault();
                           await addSet(activeMobileEx.id);
                        }}
                        className="space-y-4"
                     >
                        <div className="grid grid-cols-2 gap-4">
                            {!isCardio && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium opacity-70">משקל (ק״ג)</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={newSetByEx[activeMobileEx.id]?.weight ?? ''}
                                        onChange={(e) => {
                                            registerActivity();
                                            setNewSetByEx(m => ({ ...m, [activeMobileEx.id]: { ...(m[activeMobileEx.id] ?? {weight:'',reps:'',distance:''}), weight: e.target.value } }))
                                        }}
                                        ref={el => { if(!weightRefMap.current[activeMobileEx.id]) weightRefMap.current[activeMobileEx.id] = el; }}
                                        placeholder="0"
                                        className="w-full bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}
                            
                            <div className={`space-y-1.5 ${isCardio ? 'col-span-1' : ''}`}>
                                <label className="text-xs font-medium opacity-70">חזרות</label>
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={newSetByEx[activeMobileEx.id]?.reps ?? ''}
                                    onChange={(e) => {
                                        registerActivity();
                                        setNewSetByEx(m => ({ ...m, [activeMobileEx.id]: { ...(m[activeMobileEx.id] ?? {weight:'',reps:'',distance:''}), reps: e.target.value } }))
                                    }}
                                    placeholder="0"
                                    className="w-full bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            {isCardio && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium opacity-70">מרחק (מ׳)</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={newSetByEx[activeMobileEx.id]?.distance ?? ''}
                                        onChange={(e) => {
                                            registerActivity();
                                            setNewSetByEx(m => ({ ...m, [activeMobileEx.id]: { ...(m[activeMobileEx.id] ?? {weight:'',reps:'',distance:''}), distance: e.target.value } }))
                                        }}
                                        placeholder="0"
                                        className="w-full bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-3 text-lg font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>
                            )}
                        </div>

                        <button 
                           disabled={!!endedAt || !startedAt}
                           className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2"
                        >
                           <span>{activeMobileEx.sets.length === 0 ? 'התחל תרגיל' : 'הוסף סט'}</span>
                           <span className="text-xl leading-none">+</span>
                        </button>
                        
                        {!startedAt && (
                           <p className="text-xs text-center text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 py-2 rounded-lg">
                              ⚠️ האימון יתחיל אוטומטית עם הוספת הסט
                           </p>
                        )}
                     </form>
                  </div>

                  {/* Sets List */}
                  {activeMobileEx.sets.length > 0 && (
                     <div className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h4 className="font-bold text-sm opacity-80">סטים שבוצעו ({activeMobileEx.sets.length})</h4>
                            <span className="text-xs opacity-50">האחרון למעלה</span>
                        </div>
                        <div className="space-y-2">
                           {[...activeMobileEx.sets].reverse().map((s, idx) => (
                              <div key={s.id} className="flex justify-between items-center p-3.5 bg-white dark:bg-neutral-800 rounded-xl border border-black/5 dark:border-white/5 shadow-sm">
                                 <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-bold font-mono">
                                       {s.set_index}
                                    </div>
                                    
                                    {!isCardio && (
                                        <div className="flex flex-col">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-xl font-bold tabular-nums">{fmtNum(s.weight_kg)}</span>
                                                <span className="text-xs opacity-60 font-medium">ק"ג</span>
                                            </div>
                                        </div>
                                    )}

                                    {!isCardio && <div className="w-px h-8 bg-black/5 dark:bg-white/10 mx-1"></div>}
                                    
                                    <div className="flex flex-col">
                                       <div className="flex items-baseline gap-1">
                                            <span className="text-xl font-bold tabular-nums">{fmtNum(s.reps)}</span>
                                            <span className="text-xs opacity-60 font-medium">חזרות</span>
                                       </div>
                                    </div>

                                    {isCardio && s.distance_m != null && (
                                        <>
                                            <div className="w-px h-8 bg-black/5 dark:bg-white/10 mx-1"></div>
                                            <div className="flex flex-col">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-xl font-bold tabular-nums">{fmtNum(s.distance_m)}</span>
                                                    <span className="text-xs opacity-60 font-medium">מ'</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                 </div>
                                 <button 
                                    onClick={() => removeSet(activeMobileEx.id, s.id)}
                                    className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                                    aria-label="מחק סט"
                                 >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                 </button>
                              </div>
                           ))}
                        </div>
                     </div>
                  )}

               </div>
            </div>
         </div>
      )}

      {/* ===== DESKTOP: Existing List View (Hidden on mobile) ===== */}
      <div className="hidden md:grid md:grid-cols-2 gap-5">
        {exercises.map((ex) => {
          const weId = ex.id;
          const equipId = ex.equipment_id;
          const form = newSetByEx[weId] || { weight: '', reps: '', distance: '' };
          const headerDone = !!finishedWe[weId];

          return (
            <article
              key={`${equipId}-${ex.order_index}`}
              className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 overflow-hidden bg-background flex flex-col"
            >
              {/* Card header (green when finished AFTER moving on) */}
              <div
                className={`p-4 md:p-6 border-b border-black/10 dark:border-white/10 transition-colors ${
                  headerDone ? 'bg-emerald-500/10' : 'bg-transparent'
                }`}
              >
                <h2 className="text-xl md:text-2xl font-semibold leading-tight">
                  {ex.equip.name_he || ex.equip.name_en || 'תרגיל'}
                </h2>
                {(ex.equip.name_en || ex.equip.name_he) && (
                  <div className="opacity-70 text-sm">
                    {ex.equip.name_en && ex.equip.name_he
                      ? ex.equip.name_en
                      : ex.equip.name_en || ex.equip.name_he}
                  </div>
                )}
              </div>

              <div className="p-4 md:p-6 grid gap-5">
                {/* Image — white background + object-contain */}
                <div className="relative overflow-hidden rounded-2xl ring-1 ring-black/10 dark:ring-white/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ex.equip.image_url || PLACEHOLDER_IMG}
                    alt={ex.equip.name_he || ex.equip.name_en || 'equipment'}
                    className="w-full h-56 md:h-72 object-contain bg-white"
                  />
                </div>

                {/* Toggle 7-day history */}
                <div className="flex items-center justify-end">
                  <button
                    onClick={async () => {
                      registerActivity();
                      const open = !expanded[equipId];
                      setExpanded((m) => ({ ...m, [equipId]: open }));
                      if (open && historyByEquip[equipId] == null) {
                        await loadHistory(equipId);
                      }
                    }}
                    className="rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  >
                    {expanded[equipId] ? 'הסתר היסטוריה' : 'הצג היסטוריה אחרונה'}
                  </button>
                </div>

                {/* Expanded history */}
                {expanded[equipId] && (
                  <div className="rounded-lg ring-1 ring-black/10 dark:ring-white/10 p-3">
                    {historyBusy[equipId] ? (
                      <p className="text-sm opacity-70">טוען היסטוריה…</p>
                    ) : (historyByEquip[equipId]?.length ?? 0) === 0 ? (
                      <p className="text-sm opacity-70">לא נמצאה היסטוריה לתרגיל זה.</p>
                    ) : (
                      <AggregatedHistoryByWeight rows={historyByEquip[equipId]!} fmtDate={fmtDate} />
                    )}
                  </div>
                )}

                {/* Add set form */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await addSet(weId);
                  }}
                  className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end"
                >
                  <NumberField
                    className="md:col-span-2"
                    inputRef={(el) => (weightRefMap.current[weId] = el)}
                    label="משקל (ק״ג)"
                    value={form.weight}
                    onChange={(v) => {
                      registerActivity();
                      setNewSetByEx((m) => ({
                        ...m,
                        [weId]: { ...(m[weId] ?? { weight: '', reps: '', distance: '' }), weight: v },
                      }))
                    }}
                    placeholder="לדוגמה: 40"
                  />
                  <NumberField
                    className="md:col-span-2"
                    label="חזרות"
                    value={form.reps}
                    onChange={(v) => {
                      registerActivity();
                      setNewSetByEx((m) => ({
                        ...m,
                        [weId]: { ...(m[weId] ?? { weight: '', reps: '', distance: '' }), reps: v },
                      }))
                    }}
                    placeholder="לדוגמה: 10"
                  />
                  <NumberField
                    className="md:col-span-2"
                    label="מרחק (מ׳)"
                    value={form.distance}
                    onChange={(v) => {
                      registerActivity();
                      setNewSetByEx((m) => ({
                        ...m,
                        [weId]: { ...(m[weId] ?? { weight: '', reps: '', distance: '' }), distance: v },
                      }))
                    }}
                    placeholder="לדוגמה: 1000"
                  />
                  <div className="md:col-span-6">
                    <button
                      disabled={!!endedAt || !startedAt}
                      className="w-full rounded-lg px-4 py-3 h-12 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                    >
                      הוסף סט
                    </button>
                    {!startedAt && (
                      <div className="text-xs opacity-70 mt-1">יש להתחיל אימון לפני הוספת סטים</div>
                    )}
                  </div>
                </form>

                {/* Sets in THIS workout (live) */}
                {ex.sets.length === 0 ? (
                  <p className="opacity-70">אין סטים באימון הנוכחי.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-black/5 dark:bg-white/10">
                        <tr className="text-right">
                          <Th>#</Th>
                          <Th>משקל (ק״ג)</Th>
                          <Th>חזרות</Th>
                          <Th>מרחק (מ׳)</Th>
                          <Th>פעולות</Th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10 dark:divide-white/10">
                        {ex.sets.map((s) => (
                          <tr key={s.id}>
                            <Td>{s.set_index}</Td>
                            <Td>{fmtNum(s.weight_kg)}</Td>
                            <Td>{fmtNum(s.reps)}</Td>
                            <Td>{fmtNum(s.distance_m)}</Td>
                            <Td>
                              <button
                                onClick={() => removeSet(weId, s.id)}
                                className="text-xs rounded-md border border-black/10 dark:border-white/20 px-2 py-1 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                              >
                                מחק
                              </button>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
// ===== End Section 3 =====



// ===== Section 4 — UI helpers =====
function AggregatedHistoryByWeight({
  rows,
  fmtDate,
  isCardio = false,
}: {
  rows: HistoryRow[];
  fmtDate: Intl.DateTimeFormat;
  isCardio?: boolean;
}) {
  // Group by (workout_id, weight_kg)
  type Key = string; // `${workout_id}__${weight_kg ?? 'null'}`
  const byWorkoutAndWeight = new Map<
    Key,
    { workout_id: number; started_at: string; weight_kg: number | null; sets: number; reps: number; distance: number }
  >();

  for (const r of rows) {
    const key: Key = `${r.workout_id}__${r.weight_kg ?? 'null'}`;
    const cur =
      byWorkoutAndWeight.get(key) ??
      {
        workout_id: r.workout_id,
        started_at: r.started_at,
        weight_kg: r.weight_kg ?? null,
        sets: 0,
        reps: 0,
        distance: 0,
      };
    cur.sets += 1;
    if (typeof r.reps === 'number') cur.reps += r.reps;
    if (typeof r.distance_m === 'number') cur.distance += r.distance_m;
    byWorkoutAndWeight.set(key, cur);
  }

  // Sort: date desc, then weight desc
  const items = [...byWorkoutAndWeight.values()].sort((a, b) => {
    const d = +new Date(b.started_at) - +new Date(a.started_at);
    if (d !== 0) return d;
    const aw = a.weight_kg ?? -Infinity;
    const bw = b.weight_kg ?? -Infinity;
    return (bw as number) - (aw as number);
  });

  return (
    <div className="w-full">
      <table className="w-full text-xs md:text-sm">
        <thead className="bg-black/5 dark:bg-white/10">
          <tr className="text-right">
            <Th>תאריך</Th>
            {!isCardio && <Th>משקל (ק״ג)</Th>}
            <Th>סטים</Th>
            <Th>חזרות (סה״כ)</Th>
            {isCardio && <Th>מרחק (מ׳)</Th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-black/10 dark:divide-white/10">
          {items.map((it, i) => (
            <tr key={i}>
              <Td className="whitespace-nowrap">{fmtDate.format(new Date(it.started_at))}</Td>
              {!isCardio && <Td>{it.weight_kg == null ? '—' : it.weight_kg}</Td>}
              <Td>{it.sets}</Td>
              <Td>{it.reps || 0}</Td>
              {isCardio && <Td>{it.distance || 0}</Td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 md:px-3 py-2 font-semibold whitespace-nowrap ${className}`}>{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 md:px-3 py-2 ${className}`}>{children}</td>;
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputRef?: ((el: HTMLInputElement | null) => void) | React.RefObject<HTMLInputElement>;
  className?: string;
}) {
  const refProps =
    typeof inputRef === 'function'
      ? { ref: inputRef as any }
      : inputRef
      ? { ref: inputRef as any }
      : {};
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <input
        {...refProps}
        inputMode="decimal"
        type="number"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-4 py-3 h-12 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
        step="0.25"
      />
    </label>
  );
}
// ===== End Section 4 =====

// ===== Section 5 — Utils =====
function toNumOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
function toIntOrNull(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? n : Math.round(n);
}
function fmtNum(n: number | null | undefined) {
  if (n === null || typeof n === 'undefined') return '';
  return String(n);
}
function formatDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  return [m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
// ===== End Section 5 =====