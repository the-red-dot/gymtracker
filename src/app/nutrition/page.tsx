// gym-tracker-app/src/app/nutrition/page.tsx

'use client';

/* =========================
   SECTION 1 — Imports
   ========================= */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import ProteinGoals from './ProteinGoals';
import CalorieMetrics, { type DayAgg } from './CalorieMetrics';
import BMIWidget from './bmi';

import {
  PAGE_SIZE,
  dedupeById,
  groupByDay,
  sumTotals,
  sumTotalsAny,
  nowLocalInput,
  localToIso,
  fmtNum,
  dayKey,
} from './utils';
import { SectionCard, Th, Td, DateTimeField, TextArea, NumInput } from './ui';
/* =========================
   END SECTION 1
   ========================= */


/* =========================
   SECTION 2 — Types
   ========================= */
export type NutritionEntry = {
  id: number;
  occurred_at: string;
  item: string;
  amount: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
};

type Per100 = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type AiItem = {
  item: string;
  grams: number;
  per100: Per100;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes?: string;
};
type AiResult = {
  items: AiItem[];
  totals: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  assumptions?: string[];
};

type Gender = 'male' | 'female' | 'other' | 'unspecified';
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';
type Profile = {
  user_id: string;
  gender: Gender | null;
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
};
type UserGoal = { id: number; goal_key: string; label: string };
/* =========================
   END SECTION 2
   ========================= */


/* =========================
   SECTION 3 — Page Component
   ========================= */
export default function NutritionPage() {
  const router = useRouter();

  // --- hard caps / config ---
  const MAX_DAYS = 30;
  const MAX_IMAGE_MB = 12; // client guard; Edge can handle, but keep UX friendly
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

  // --- auth / loading ---
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- pagination + data ---
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [entries, setEntries] = useState<NutritionEntry[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // --- profile bits ---
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [goals, setGoals] = useState<UserGoal[]>([]);

  // --- AI state (text + photo) ---
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiItems, setAiItems] = useState<AiItem[] | null>(null);
  const [aiOccurredLocal, setAiOccurredLocal] = useState(nowLocalInput());
  const [aiSaving, setAiSaving] = useState(false);
  const [aiSavedAt, setAiSavedAt] = useState<number | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  // --- carousel tabs (4 tabs; default = 'what') ---
  const [activeTab, setActiveTab] = useState<'what' | 'protein' | 'calories' | 'bmi'>('what');

  const fmtDate = useMemo(() => new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }), []);
  const fmtTime = useMemo(() => new Intl.DateTimeFormat('he-IL', { timeStyle: 'short' }), []);

  /* -------- Bootstrap -------- */
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
      await Promise.all([loadPage(uid, 0), fetchProfile(uid), fetchActivity(uid), fetchGoals(uid)]);
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

  /* -------- Data fetchers -------- */
  const loadPage = async (uid: string, p: number) => {
    setError(null);
    const start = p * PAGE_SIZE;
       const end = start + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from('nutrition_entries')
      .select('id, occurred_at, item, amount, calories, protein_g, carbs_g, fat_g, notes', { count: 'exact' })
      .eq('user_id', uid)
      .order('occurred_at', { ascending: false })
      .range(start, end);

    if (error) {
      setError(error.message);
      return;
    }

    const newEntries = (data ?? []) as NutritionEntry[];
    setEntries((prev) => dedupeById([...prev, ...newEntries]));
    setPage(p);
    if (count !== null) {
      setHasMore(end + 1 < count);
    } else {
      setHasMore(newEntries.length === PAGE_SIZE);
    }
  };

  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, gender, height_cm, weight_kg, body_fat_percent')
      .eq('user_id', uid)
      .maybeSingle();
    if (error) { setError(error.message); return; }
    if (data) setProfile(data as Profile);
  };

  const fetchActivity = async (uid: string) => {
    const { data, error } = await supabase
      .from('user_activity_levels')
      .select('activity_level')
      .eq('user_id', uid)
      .maybeSingle();
    if (error && !/relation .* does not exist/i.test(error.message)) setError(error.message);
    if (data?.activity_level) setActivityLevel(data.activity_level as ActivityLevel);
  };

  const fetchGoals = async (uid: string) => {
    const { data, error } = await supabase
      .from('user_goals')
      .select('id, goal_key, label')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (error && !/relation .* does not exist/i.test(error.message)) setError(error.message);
    setGoals((data ?? []) as UserGoal[]);
  };

  /* -------- Derived: groups + today totals -------- */
  const groupsAll = useMemo(() => groupByDay(entries), [entries]);
  const groups = useMemo(() => groupsAll.slice(0, MAX_DAYS), [groupsAll]);

  const todayKey = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const day = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const todayEntries = useMemo(
    () => entries.filter((e) => dayKey(e.occurred_at) === todayKey),
    [entries, todayKey]
  );
  const todayTotals = useMemo(() => sumTotals(todayEntries), [todayEntries]);
  const proteinToday = todayTotals.protein_g ?? 0;

  const last7: DayAgg[] = useMemo(
    () => groups.slice(0, 7).map((g) => ({ dayKey: g.dayKey, totals: g.totals })),
    [groups]
  );

  /* -------- UI helpers -------- */
  const toggleAll = (open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const g of groups) next[g.dayKey] = open;
    setExpanded(next);
  };

  // Arrow keys — cycle tabs
  useEffect(() => {
    const order: Array<'what' | 'protein' | 'calories' | 'bmi'> = ['what', 'protein', 'calories', 'bmi'];
    const onKey = (e: KeyboardEvent) => {
      const idx = order.indexOf(activeTab);
      if (e.key === 'ArrowRight') setActiveTab(order[(idx + 1) % order.length]);
      if (e.key === 'ArrowLeft') setActiveTab(order[(idx - 1 + order.length) % order.length]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab]);

  /* -------- Photo selection / cleanup -------- */
  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  function onPickPhoto(file: File | null) {
    setAiError(null);
    // Cleanup previous preview URL
    if (photoPreviewUrl) {
      URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(null);
    }
    if (!file) {
      setPhotoFile(null);
      return;
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      setAiError('סוג קובץ לא נתמך. נא לבחור JPG/PNG/WebP/HEIC.');
      return;
    }
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_IMAGE_MB) {
      setAiError(`התמונה גדולה מדי (${mb.toFixed(1)}MB). המקסימום הוא ${MAX_IMAGE_MB}MB.`);
      return;
    }
    const url = URL.createObjectURL(file);
    setPhotoFile(file);
    setPhotoPreviewUrl(url);
  }

  function clearPhoto() {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(null);
    setPhotoFile(null);
  }

  /* -------- AI: call backend (text+optional photo) -------- */
  const runAi = async () => {
    setAiError(null);
    setAiItems(null);

    if (!aiText.trim() && !photoFile) {
      setAiError('נא לכתוב בקצרה מה אכלת או לצלם/להעלות תמונה.');
      return;
    }

    try {
      setAiLoading(true);
      let res: Response;

      if (photoFile) {
        // Send multipart with optional text
        const fd = new FormData();
        fd.append('file', photoFile, photoFile.name || 'meal.jpg');
        if (aiText.trim()) fd.append('text', aiText.trim());
        res = await fetch('/api/nutrition-ai', {
          method: 'POST',
          body: fd,
        });
      } else {
        // Pure JSON (back-compat)
        res = await fetch('/api/nutrition-ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: aiText.trim() }),
        });
      }

      const data: AiResult = await res.json();
      if (!res.ok) {
        setAiError((data as any)?.error || 'שגיאה בחישוב AI');
        setAiLoading(false);
        return;
      }
      setAiItems((data.items || []) as AiItem[]);
    } catch (e: any) {
      setAiError(e?.message || 'שגיאה לא צפויה');
    } finally {
      setAiLoading(false);
    }
  };

  // --- AI: save ---
  const saveAiItems = async () => {
    if (!userId || !aiItems || aiItems.length === 0 || aiSaving) return;
    setAiError(null);
    setAiSaving(true);

    const occurred_at = localToIso(aiOccurredLocal);
    const payload = aiItems.map((it) => ({
      user_id: userId,
      occurred_at,
      item: it.item.trim() || 'לא ידוע',
      amount: `${Math.max(0, Math.round(it.grams))} גרם`,
      calories: Number.isFinite(it.calories) ? it.calories : 0,
      protein_g: Number.isFinite(it.protein_g) ? it.protein_g : 0,
      carbs_g: Number.isFinite(it.carbs_g) ? it.carbs_g : 0,
      fat_g: Number.isFinite(it.fat_g) ? it.fat_g : 0,
      notes: it.notes ? String(it.notes) : null,
    }));

    const { data, error } = await supabase
      .from('nutrition_entries')
      .insert(payload)
      .select('id, occurred_at, item, amount, calories, protein_g, carbs_g, fat_g, notes');

    if (error) { setAiError(error.message); setAiSaving(false); return; }
    const inserted = (data ?? []) as NutritionEntry[];
    setEntries((prev) => dedupeById([...inserted, ...prev]));

    const dk = dayKey(occurred_at);
    setExpanded((ex) => ({ ...ex, [dk]: true }));

    setAiText('');
    setAiItems(null);
    clearPhoto();
    setAiSavedAt(Date.now());
    setAiSaving(false);
    setTimeout(() => setAiSavedAt((t) => (t && Date.now() - t > 0 ? null : t)), 1800);
  };

  const deleteEntry = async (id: number) => {
    const ok = confirm('למחוק את הרשומה?');
    if (!ok) return;
    const { error } = await supabase.from('nutrition_entries').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  if (loading) return <p className="opacity-70">טוען…</p>;
  const aiTotals = sumTotalsAny(aiItems ?? []);

  /* -------- Render -------- */
  return (
    <div className="mx-auto max-w-5xl space-y-8" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">תזונה</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          תאר/י בקצרה מה אכלת או צלמו את הצלחת—וקבל/י חישוב אוטומטי. מעקב חלבון, קלוריות ו-BMI 🎯
        </p>
      </header>

      {/* ===== Tabs / Carousel header ===== */}
      <nav
        className="inline-flex rounded-lg ring-1 ring-black/10 dark:ring-white/10 overflow-hidden"
        role="tablist"
        aria-label="תצוגות מדדים"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'what'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'what'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('what')}
        >
          מה אכלתי
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'protein'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'protein'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('protein')}
        >
          מדדי חלבון
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'calories'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'calories'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('calories')}
        >
          מדדים קלוריים
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'bmi'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'bmi'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('bmi')}
        >
          BMI ומשקל
        </button>
      </nav>

      {/* ===== Carousel body (analytics only) ===== */}
      <div className="relative">
        {activeTab === 'protein' ? (
          <ProteinGoals
            profile={profile}
            goals={goals}
            activityLevel={activityLevel}
            proteinToday={proteinToday}
          />
        ) : activeTab === 'calories' ? (
          <CalorieMetrics
            profile={profile}
            activityLevel={activityLevel}
            goals={goals}
            todayTotals={todayTotals}
            last7={last7}
          />
        ) : activeTab === 'bmi' ? (
          <BMIWidget userId={userId} profile={profile} />
        ) : null}
      </div>

      {/* ===== הוספה חכמה (AI) — ONLY in "what" ===== */}
      {activeTab === 'what' && (
        <SectionCard title="הוספה חכמה (AI)">
          <div className="grid gap-4">
            {/* Text + Date */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <TextArea
                label="מה אכלתי?"
                placeholder='לדוגמה: "שניצל מטוגן עם פירה וסלט קטן" (לא חובה אם יש תמונה)'
                value={aiText}
                onChange={setAiText}
                className="md:col-span-2"
              />
              <DateTimeField
                label="תאריך ושעה לארוחה"
                value={aiOccurredLocal}
                onChange={setAiOccurredLocal}
                className="md:col-span-1"
              />
            </div>

            {/* Photo controls */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Mobile camera icon button */}
              <label
                className="md:hidden inline-flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                title="צלם/י תמונה"
              >
                <CameraIcon className="w-5 h-5" />
                <span>צלם/י</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                />
              </label>

              {/* Desktop upload button */}
              <label
                className="hidden md:inline-flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                title="בחר/י תמונה"
              >
                <UploadIcon className="w-5 h-5" />
                <span>העלאת תמונה</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                />
              </label>

              {/* Current filename / clear */}
              {photoFile && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="opacity-80">{photoFile.name}</span>
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="rounded-md border border-black/10 dark:border-white/20 px-2 py-1 text-xs hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  >
                    הסר תמונה
                  </button>
                </div>
              )}
            </div>

            {/* Preview (if any) */}
            {photoPreviewUrl && (
              <div className="flex items-center gap-3">
                <img
                  src={photoPreviewUrl}
                  alt="תצוגה מקדימה"
                  className="h-28 w-28 object-cover rounded-lg ring-1 ring-black/10 dark:ring-white/10"
                />
                <p className="text-xs opacity-70">
                  התמונה נשלחת ל-Gemini לצורך ניתוח ולא נשמרת באפליקציה.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={runAi}
                disabled={aiLoading}
                className="rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
              >
                {aiLoading ? 'מחשב…' : 'חישוב AI'}
              </button>
              {aiItems && aiItems.length > 0 && (
                <>
                  <div className="text-sm opacity-80 self-center">
                    סה״כ (AI): {fmtNum(aiTotals.calories)} קק״ל · חלבון {fmtNum(aiTotals.protein_g)}ג׳ · פחמ׳ {fmtNum(aiTotals.carbs_g)}ג׳ · שומן {fmtNum(aiTotals.fat_g)}ג׳
                  </div>
                  <button
                    onClick={saveAiItems}
                    disabled={aiSaving}
                    aria-busy={aiSaving}
                    className={`rounded-lg px-4 py-2 h-11 border border-black/10 dark:border-white/20
                                ${aiSaving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-black/[.04] dark:hover:bg-white/[.06]'}`}
                  >
                    {aiSaving ? 'שומר…' : 'הוסף הכל לרשומות'}
                  </button>
                  {aiSavedAt && !aiSaving && (
                    <span className="text-sm text-emerald-600 self-center">נשמר! ✅</span>
                  )}
                </>
              )}
            </div>

            {aiError && <p className="text-sm text-red-600">{aiError}</p>}

            {/* AI table */}
            {aiItems && aiItems.length > 0 && (
              <div className="overflow-x-auto rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                <table className="min-w-full text-sm">
                  <thead className="bg-black/5 dark:bg-white/10">
                    <tr className="text-right">
                      <Th>פריט</Th>
                      <Th>כמות (גרם)</Th>
                      <Th>קלוריות</Th>
                      <Th>חלבון (ג׳)</Th>
                      <Th>פחמימות (ג׳)</Th>
                      <Th>שומן (ג׳)</Th>
                      <Th>הערות</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/10 dark:divide-white/10">
                    {aiItems.map((it, idx) => (
                      <tr key={idx}>
                        <Td>
                          <input
                            type="text"
                            value={it.item}
                            onChange={(e) => updateAiItem(idx, { item: e.target.value })}
                            className="w-48 md:w-64 rounded border border-black/10 dark:border-white/20 bg-transparent px-2 py-1"
                          />
                        </Td>
                        <Td>
                          <NumInput value={it.grams} onChange={(v) => updateAiItem(idx, { grams: Math.max(0, v) })} />
                        </Td>
                        <Td>
                          <NumInput value={it.calories} onChange={(v) => updateAiItem(idx, { calories: v })} />
                        </Td>
                        <Td>
                          <NumInput value={it.protein_g} onChange={(v) => updateAiItem(idx, { protein_g: v })} />
                        </Td>
                        <Td>
                          <NumInput value={it.carbs_g} onChange={(v) => updateAiItem(idx, { carbs_g: v })} />
                        </Td>
                        <Td>
                          <NumInput value={it.fat_g} onChange={(v) => updateAiItem(idx, { fat_g: v })} />
                        </Td>
                        <Td>
                          <input
                            type="text"
                            value={it.notes ?? ''}
                            onChange={(e) => updateAiItem(idx, { notes: e.target.value })}
                            className="w-52 md:w-64 rounded border border-black/10 dark:border-white/20 bg-transparent px-2 py-1"
                          />
                        </Td>
                        <Td>
                          <button
                            onClick={() => removeAiItem(idx)}
                            className="text-xs rounded-md border border-black/10 dark:border-white/20 px-2 py-1 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                          >
                            הסר
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {aiItems && aiItems.length === 0 && !aiLoading && (
              <div className="text-sm opacity-70">לא זוהו פריטים מהטקסט/תמונה. נסו לתאר קצת יותר או תמונה ברורה יותר.</div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ===== Groups by day — ONLY in "what" ===== */}
      {activeTab === 'what' && (
        <div className="grid gap-4">
          {groups.map((g) => {
            const isOpen = expanded[g.dayKey] ?? false;
            return (
              <section key={g.dayKey} className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
                <button
                  onClick={() => setExpanded((ex) => ({ ...ex, [g.dayKey]: !isOpen }))}
                  className="w-full text-right p-4 md:p-6 flex flex-col gap-1 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                >
                  <div className="flex flex-wrap items-center gap-2 justify-between">
                    <h2 className="text-lg md:text-xl font-semibold">{fmtDate.format(new Date(g.date))}</h2>
                    <div className="text-sm md:text-base opacity-80">
                      סה״כ: {fmtNum(g.totals.calories)} קק״ל · חלבון {fmtNum(g.totals.protein_g)}ג׳ · פחמ׳ {fmtNum(g.totals.carbs_g)}ג׳ · שומן {fmtNum(g.totals.fat_g)}ג׳
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="p-4 md:p-6 pt-0">
                    {/* Mobile cards */}
                    <div className="grid gap-3 md:hidden">
                      {g.items.map((e) => (
                        <article key={e.id} className="rounded-lg ring-1 ring-black/10 dark:ring-white/10 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">{fmtTime.format(new Date(e.occurred_at))}</div>
                            <button
                              onClick={() => deleteEntry(e.id)}
                              className="text-xs rounded-md border border-black/10 dark:border-white/20 px-2 py-1 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                            >
                              מחק
                            </button>
                          </div>
                          <div className="mt-1">
                            <div className="font-medium leading-snug break-words">{e.item}</div>
                            {e.amount && <div className="opacity-70 text-xs mt-0.5">{e.amount}</div>}
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 dark:ring-white/10">
                              קלוריות&nbsp;{fmtNum(e.calories)}
                            </span>
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 dark:ring-white/10">
                              חלבון&nbsp;{fmtNum(e.protein_g)}ג׳
                            </span>
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 dark:ring-white/10">
                              פחמ׳&nbsp;{fmtNum(e.carbs_g)}ג׳
                            </span>
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs ring-1 ring-black/10 dark:ring-white/10">
                              שומן&nbsp;{fmtNum(e.fat_g)}ג׳
                            </span>
                          </div>
                          {e.notes && (
                            <div className="mt-2 text-xs leading-relaxed opacity-80 break-words whitespace-pre-wrap">
                              {e.notes}
                            </div>
                          )}
                        </article>
                      ))}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                      <table className="min-w-full text-sm">
                        <thead className="bg-black/5 dark:bg-white/10">
                          <tr className="text-right">
                            <Th>שעה</Th>
                            <Th>פריט</Th>
                            <Th>כמות</Th>
                            <Th>קלוריות</Th>
                            <Th>חלבון (ג׳)</Th>
                            <Th>פחמימות (ג׳)</Th>
                            <Th>שומן (ג׳)</Th>
                            <Th>הערות</Th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/10 dark:divide-white/10">
                          {g.items.map((e) => (
                            <tr key={e.id}>
                              <Td>{fmtTime.format(new Date(e.occurred_at))}</Td>
                              <Td className="font-medium">{e.item}</Td>
                              <Td className="opacity-80">{e.amount ?? ''}</Td>
                              <Td>{fmtNum(e.calories)}</Td>
                              <Td>{fmtNum(e.protein_g)}</Td>
                              <Td>{fmtNum(e.carbs_g)}</Td>
                              <Td>{fmtNum(e.fat_g)}</Td>
                              <Td className="max-w-[18rem] truncate">{e.notes ?? ''}</Td>
                              <Td>
                                <button
                                  onClick={() => deleteEntry(e.id)}
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
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Load more only if we haven't reached the MAX_DAYS cap — ONLY in "what" */}
      {activeTab === 'what' && hasMore && groupsAll.length < MAX_DAYS && (
        <div className="pt-2">
          <button
            onClick={() => userId && loadPage(userId, page + 1)}
            className="rounded-lg border border-black/10 dark:border-white/20 px-4 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            טען ימים ישנים יותר
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );

  /* ---- local helpers for AI table edits ---- */
  function updateAiItem(index: number, patch: Partial<AiItem>) {
    setAiItems((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const cur = { ...next[index], ...patch };

      if (typeof patch.grams === 'number') {
        const g = Math.max(0, patch.grams);
        cur.grams = g;
        cur.calories = Math.round(((cur.per100.calories * g) / 100) * 100) / 100;
        cur.protein_g = Math.round(((cur.per100.protein_g * g) / 100) * 100) / 100;
        cur.carbs_g = Math.round(((cur.per100.carbs_g * g) / 100) * 100) / 100;
        cur.fat_g = Math.round(((cur.per100.fat_g * g) / 100) * 100) / 100;
      }

      const macrosChanged =
        'calories' in patch || 'protein_g' in patch || 'carbs_g' in patch || 'fat_g' in patch;
      if (macrosChanged && cur.grams > 0) {
        cur.per100 = {
          calories: Math.round(((cur.calories * 100) / cur.grams) * 100) / 100,
          protein_g: Math.round(((cur.protein_g * 100) / cur.grams) * 100) / 100,
          carbs_g: Math.round(((cur.carbs_g * 100) / cur.grams) * 100) / 100,
          fat_g: Math.round(((cur.fat_g * 100) / 100 / (cur.grams / 1)) * 100) / 100, // keep pattern consistent
        };
        // Fix fat_g per100 calc (typo-safe):
        cur.per100.fat_g = Math.round(((cur.fat_g * 100) / cur.grams) * 100) / 100;
      }

      next[index] = cur;
      return next;
    });
  }

  function removeAiItem(index: number) {
    setAiItems((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      next.splice(index, 1);
      return next;
    });
  }
}

/* =========================
   SECTION 4 — Icons
   ========================= */
function CameraIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}>
      <path d="M3 7.5h3l1.2-1.8A1.5 1.5 0 0 1 8.6 5h6.8a1.5 1.5 0 0 1 1.3.7L18 7.5h3A1.5 1.5 0 0 1 22.5 9v9A1.5 1.5 0 0 1 21 19.5H3A1.5 1.5 0 0 1 1.5 18V9A1.5 1.5 0 0 1 3 7.5Z" />
      <circle cx="12" cy="13.5" r="4" />
    </svg>
  );
}
function UploadIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={props.className}>
      <path d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
/* =========================
   END FILE
   ========================= */
