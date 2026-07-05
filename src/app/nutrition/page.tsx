// src/app/nutrition/page.tsx

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
import DietitianAgent from './DietitianAgent'; 
import BodyComposition from './BodyComposition';

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
import { SectionCard, Th, Td, TextArea, NumInput } from './ui';
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
  birth_date: string | null; // <-- הוספנו את השדה כדי שיעבור ל-AI
};
type UserGoal = { id: number; goal_key: string; label: string };

// סוג חדש להיסטוריית מנות - מעודכן עם ID ונתוני AI
type MealHistoryItem = {
  id: number;
  meal_text: string;
  usage_count: number;
  last_used_at?: string;
  items_data?: AiItem[]; // שומר את הערכים התזונתיים (כמו שתיקנו ידנית)
};
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

  // --- UI State for History List ---
  const [visibleDaysCount, setVisibleDaysCount] = useState(3); // Start with 3 days visible

  // --- profile bits ---
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [measurements, setMeasurements] = useState<any[]>([]);

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

  // --- Meal History State (Autocomplete) ---
  const [mealHistory, setMealHistory] = useState<MealHistoryItem[]>([]);
  const [suggestions, setSuggestions] = useState<MealHistoryItem[]>([]); // עכשיו זה מערך של אובייקטים

  // --- carousel tabs (5 tabs; default = 'what') ---
  const [activeTab, setActiveTab] = useState<'what' | 'protein' | 'calories' | 'bodycomp' | 'bmi' | 'dietitian'>('what');

  const fmtDate = useMemo(() => new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }), []);
  const fmtTime = useMemo(() => new Intl.DateTimeFormat('he-IL', { timeStyle: 'short' }), []);

  // Helper for nice date display (client-side only to ensure correct locale)
  const [displayDate, setDisplayDate] = useState('');
  useEffect(() => {
    if (!aiOccurredLocal) {
        setDisplayDate('');
        return;
    }
    const d = new Date(aiOccurredLocal);
    // Explicitly using he-IL
    setDisplayDate(new Intl.DateTimeFormat('he-IL', { 
       day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    }).format(d));
  }, [aiOccurredLocal]);

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
      await Promise.all([
        loadPage(uid, 0), 
        fetchProfile(uid), 
        fetchActivity(uid), 
        fetchGoals(uid),
        fetchMealHistory(uid),
        fetchMeasurements(uid)
      ]);
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

  /* -------- Data Fetchers Logic -------- */
  const fetchMealHistory = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from('user_meal_history')
        .select('id, meal_text, usage_count, last_used_at, items_data') // הבאנו גם את ה-ID והנתונים
        .eq('user_id', uid)
        .order('usage_count', { ascending: false })
        .order('last_used_at', { ascending: false })
        .limit(500);
      
      if (error) {
        console.error('Failed to fetch meal history:', error.message);
        return;
      }
      
      if (data) {
        setMealHistory(data as MealHistoryItem[]);
      }
    } catch (err) {
      console.error('Exception fetching meal history:', err);
    }
  };

  const fetchMeasurements = async (uid: string) => {
      const { data } = await supabase
        .from('body_measurements')
        .select('*') // משנים ל-* כדי לקבל את כל ההיקפים עבור BodyComposition
        .eq('user_id', uid)
        .order('measured_at', { ascending: false })
        .limit(20);
      if (data) setMeasurements(data);
  };

  // פילטור הצעות בזמן הקלדה (Bulletproof Filtering)
  useEffect(() => {
    try {
      if (!aiText || !aiText.trim() || aiText.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      const q = aiText.trim().toLowerCase();
      
      if (!mealHistory || mealHistory.length === 0) {
        setSuggestions([]);
        return;
      }

      // סינון מוגן ומיפוי של כל האובייקט
      const matches = mealHistory
        .filter(h => {
          if (!h || !h.meal_text) return false;
          const textLower = h.meal_text.toLowerCase();
          return textLower.includes(q) && textLower !== q;
        })
        .slice(0, 5); // מקסימום 5 הצעות

      setSuggestions(matches);
    } catch (err) {
      console.error("Error filtering meal suggestions:", err);
      setSuggestions([]);
    }
  }, [aiText, mealHistory]);

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
      .select('user_id, gender, height_cm, weight_kg, body_fat_percent, birth_date')
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
  
  // UI: חיתוך הקבוצות שמוצגות בפועל לפי visibleDaysCount
  const visibleGroups = useMemo(() => groups.slice(0, visibleDaysCount), [groups, visibleDaysCount]);

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
    const order: Array<'what' | 'protein' | 'calories' | 'bodycomp' | 'bmi' | 'dietitian'> = ['what', 'protein', 'calories', 'bodycomp', 'bmi', 'dietitian'];
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

      const customKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
      const headers: HeadersInit = customKey ? { 'x-custom-api-key': customKey } : {};

      if (photoFile) {
        const fd = new FormData();
        fd.append('file', photoFile, photoFile.name || 'meal.jpg');
        if (aiText.trim()) fd.append('text', aiText.trim());
        
        res = await fetch('/api/nutrition-ai', {
          method: 'POST',
          headers: headers,
          body: fd,
        });
      } else {
        res = await fetch('/api/nutrition-ai', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
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

  // --- Update Meal History (Upsert) - מעודכן לשמירת הנתונים עצמם ---
  const updateMealHistory = async (text: string, finalItems: AiItem[]) => {
    if (!userId || !text) return;
    const cleanText = text.trim();
    if (cleanText.length < 3) return; 

    const nowIso = new Date().toISOString();

    const { data: existing } = await supabase
      .from('user_meal_history')
      .select('id, usage_count')
      .eq('user_id', userId)
      .eq('meal_text', cleanText)
      .maybeSingle();

    const payload = {
      user_id: userId,
      meal_text: cleanText,
      usage_count: existing ? existing.usage_count + 1 : 1,
      last_used_at: nowIso,
      items_data: finalItems // <-- שומרים את הערכים התזונתיים
    };

    if (existing) {
      await supabase.from('user_meal_history').update(payload).eq('id', existing.id);
      
      setMealHistory(prev => {
        const updated = prev.map(m => m.id === existing.id ? { ...m, usage_count: m.usage_count + 1, last_used_at: nowIso, items_data: finalItems } : m);
        return updated.sort((a,b) => +new Date(b.last_used_at || 0) - +new Date(a.last_used_at || 0));
      });
    } else {
      const { data: newRow } = await supabase.from('user_meal_history').insert(payload).select('id').single();
      if(newRow) {
         setMealHistory(prev => {
           const updated = [...prev, { id: newRow.id, meal_text: cleanText, usage_count: 1, last_used_at: nowIso, items_data: finalItems }];
           return updated.sort((a,b) => +new Date(b.last_used_at || 0) - +new Date(a.last_used_at || 0));
         });
      }
    }
  };

  // --- מחיקת מנה מההיסטוריה ---
  const deleteHistoryItem = async (e: React.MouseEvent, id: number, textToClear: string) => {
    e.stopPropagation(); // מונע מתיבת הטקסט "לתפוס" את הלחיצה
    if (!confirm('למחוק מנה זו מזיכרון ההיסטוריה?')) return;
    
    await supabase.from('user_meal_history').delete().eq('id', id);
    setMealHistory(prev => prev.filter(h => h.id !== id));
    setSuggestions(prev => prev.filter(h => h.id !== id));

    // איפוס הערכים אם המנה שנמחקה היא זו שכרגע מוצגת בתיבת הטקסט
    if (aiText.trim() === textToClear.trim()) {
      setAiText('');
      setAiItems(null);
    }
  };

  // --- AI: save (Confirm & Save) ---
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

    // שמירת הטקסט להיסטוריה (יחד עם הערכים הסופיים המעודכנים)
    if (aiText && !photoFile) {
      await updateMealHistory(aiText, aiItems);
    }

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

  const TABS_CONFIG = [
    { id: 'what', label: 'מה אכלתי', icon: '🍽️' },
    { id: 'protein', label: 'מדדי חלבון', icon: '🥩' },
    { id: 'calories', label: 'מדדים קלוריים', icon: '🔥' },
    { id: 'bodycomp', label: 'הרכב גוף', icon: '🧬' },
    { id: 'bmi', label: 'BMI ומשקל', icon: '⚖️' },
    { id: 'dietitian', label: 'דיאטנית AI', icon: '👩‍⚕️' },
  ] as const;

  if (loading) return <p className="opacity-70">טוען…</p>;
  const aiTotals = sumTotalsAny(aiItems ?? []);

  /* -------- Render -------- */
  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">תזונה</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          תאר/י בקצרה מה אכלת או צלמו את הצלחת—וקבל/י חישוב אוטומטי.
        </p>
      </header>

      {/* ===== Tabs Navigation (Responsive) ===== */}
      
      {/* Mobile: Dropdown */}
      <div className="md:hidden">
        <label className="text-xs font-bold opacity-70 mb-1.5 block">תצוגה:</label>
        <div className="relative">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as any)}
            className="w-full appearance-none bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/20 rounded-xl py-3 pr-4 pl-10 text-base font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {TABS_CONFIG.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-500">
            <ChevronDownIcon className="h-4 w-4" />
          </div>
        </div>
      </div>

      {/* Desktop: Horizontal Buttons */}
      <nav
        className="hidden md:inline-flex rounded-lg ring-1 ring-black/10 dark:ring-white/10 overflow-hidden flex-wrap gap-1"
        role="tablist"
        aria-label="תצוגות מדדים"
      >
        {TABS_CONFIG.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${
                isActive
                  ? t.id === 'dietitian' 
                    ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white'
                    : 'bg-foreground text-background'
                  : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
              }`}
              onClick={() => setActiveTab(t.id as any)}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* ===== Active Tab Content ===== */}
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
        ) : activeTab === 'bodycomp' ? (
          <BodyComposition profile={profile} measurements={measurements} goals={goals} />
        ) : activeTab === 'bmi' ? (
          <BMIWidget userId={userId} profile={profile} />
        ) : activeTab === 'dietitian' ? (
           userId && (
               <DietitianAgent 
                 userId={userId} 
                 logs={entries} 
                 userGoals={goals} 
                 userProfileData={{...profile, activityLevel}}
                 weightHistory={measurements}
               />
           )
        ) : null}
      </div>

      {/* ===== הוספה חכמה (AI) — רק בטאב "מה אכלתי" ===== */}
      {activeTab === 'what' && (
        <SectionCard title="הוספה חכמה (AI)">
          <div className="space-y-4">
            
            {/* 1. TextArea & Smart Suggestions */}
            <div className="flex flex-col gap-2 relative">
              <TextArea
                label="מה אכלת?"
                placeholder='לדוגמה: "חביתה משתי ביצים, סלט קטן וכף קוטג׳"'
                value={aiText}
                onChange={(val) => {
                  setAiText(val);
                  // התרוקנה התיבה לחלוטין? מנקים את נתוני הטבלה כדי שלא יישארו תקועים
                  if (val.trim() === '') {
                    setAiItems(null);
                  }
                }}
                className="w-full"
              />
              
              {/* כפתורי הצעות דינמיים (Chips) */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1 animate-in fade-in slide-in-from-top-1">
                  {suggestions.map((s, i) => (
                    <div 
                      key={s.id || i}
                      className="inline-flex items-center bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-full shadow-sm transition-colors overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setAiText(s.meal_text);
                          // טעינה מיידית ללא צורך להמתין ל-AI אם יש לנו כבר נתונים שמורים
                          if (s.items_data && s.items_data.length > 0) {
                             setAiItems(s.items_data);
                          }
                          setSuggestions([]);
                        }}
                        className="px-3 py-1.5 flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors active:scale-95"
                      >
                        <span className="opacity-60 text-xs">🕒</span>
                        {s.meal_text}
                      </button>
                      
                      <div className="w-px h-4 bg-indigo-200 dark:bg-indigo-800"></div>
                      
                      <button
                        type="button"
                        onClick={(e) => deleteHistoryItem(e, s.id, s.meal_text)}
                        className="px-2 py-1.5 text-indigo-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="מחק מנה מהיסטוריית חיפושים"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Actions Row: Date, Camera, Gallery */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
               
               {/* Date Picker Button (Masking real input for better UI on iPhone) */}
               <div className="relative w-full min-w-0">
                  <span className="text-sm font-medium opacity-80 mb-1 block">מתי?</span>
                  <div className="relative w-full h-12 rounded-lg border border-black/10 dark:border-white/20 bg-white dark:bg-white/5 flex items-center justify-between shadow-sm transition-colors overflow-hidden group">
                      {/* Visuals - Using absolute positioning for text to avoid layout shift */}
                      <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none z-10">
                          <span className="text-sm font-mono ltr:tracking-wide truncate text-gray-700 dark:text-gray-200">
                              {displayDate}
                          </span>
                          <span className="text-indigo-500 opacity-80">📅</span>
                      </div>
                      
                      {/* The invisible native input trigger - z-20 to be on top */}
                      <input
                        type="datetime-local"
                        value={aiOccurredLocal}
                        onChange={(e) => setAiOccurredLocal(e.target.value)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 appearance-none"
                        style={{ direction: 'ltr' }}
                      />
                  </div>
               </div>

               {/* Buttons Row - Fixed Layout */}
               <div className="flex gap-2 w-full h-12">
                   {/* Mobile Camera */}
                   <label className="md:hidden flex-1 flex items-center justify-center gap-2 rounded-lg border border-black/10 dark:border-white/20 text-sm font-medium cursor-pointer bg-white dark:bg-white/5 shadow-sm hover:bg-gray-50 dark:hover:bg-white/10 h-full transition-colors relative overflow-hidden">
                    <CameraIcon className="w-5 h-5 text-indigo-500" />
                    <span>צלם</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                    />
                  </label>

                   {/* Upload */}
                  <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-black/10 dark:border-white/20 text-sm font-medium cursor-pointer bg-white dark:bg-white/5 shadow-sm hover:bg-gray-50 dark:hover:bg-white/10 h-full transition-colors relative overflow-hidden">
                    <UploadIcon className="w-5 h-5 text-indigo-500" />
                    <span className="hidden sm:inline">{photoFile ? 'החלף' : 'גלריה/קובץ'}</span>
                    <span className="sm:hidden">{photoFile ? 'החלף' : 'גלריה'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                    />
                  </label>

                   {/* Clear Photo */}
                   {photoFile && (
                     <button
                       type="button"
                       onClick={clearPhoto}
                       className="w-12 flex items-center justify-center rounded-lg border border-red-200 dark:border-red-900/30 text-red-600 bg-red-50 dark:bg-red-900/10 h-full hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
                     >
                       ✕
                     </button>
                   )}
               </div>
            </div>

            {/* Preview (if any) */}
            {photoPreviewUrl && (
              <div className="relative rounded-lg overflow-hidden h-40 w-full bg-black/5 dark:bg-white/5 flex items-center justify-center border border-black/10 dark:border-white/10 mt-2">
                <img
                  src={photoPreviewUrl}
                  alt="תצוגה מקדימה"
                  className="h-full object-contain"
                />
                <div className="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-md">
                   נשלח ל-Gemini לניתוח
                </div>
              </div>
            )}

            {/* 3. Analyze Button - Big & Prominent */}
            <button
              onClick={runAi}
              disabled={aiLoading || (!aiText.trim() && !photoFile)}
              className="w-full rounded-xl py-3.5 bg-indigo-600 text-white font-bold shadow-md hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2 text-base mt-2"
            >
              {aiLoading ? (
                <>
                  <span className="animate-spin">⌛</span> מנתח ומחשב...
                </>
              ) : (
                <>
                  <span>✨</span> נתח וחשב קלוריות
                </>
              )}
            </button>

            {/* Error Message */}
            {aiError && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-lg text-red-600 text-sm text-center">
                {aiError}
              </div>
            )}

            {/* Results Table */}
            {aiItems && aiItems.length > 0 && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-4 mt-4">
                <div className="flex justify-between items-center bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-900/30">
                   <div className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                     סה״כ: {fmtNum(aiTotals.calories)} קק״ל
                   </div>
                   <div className="text-xs text-indigo-700 dark:text-indigo-300 space-x-2 rtl:space-x-reverse">
                      <span>🥩 {fmtNum(aiTotals.protein_g)} גר'</span>
                      <span>🍞 {fmtNum(aiTotals.carbs_g)} גר'</span>
                      <span>🥑 {fmtNum(aiTotals.fat_g)} גר'</span>
                   </div>
                </div>

                <div className="overflow-x-auto rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                  <table className="min-w-full text-sm">
                    <thead className="bg-black/5 dark:bg-white/10 text-xs">
                      <tr className="text-right">
                        <Th>פריט</Th>
                        <Th>כמות (גרם)</Th>
                        <Th>קק"ל</Th>
                        <Th>חלבון</Th>
                        <Th>פחמ׳</Th>
                        <Th>שומן</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/10 dark:divide-white/10 bg-white dark:bg-neutral-900">
                      {aiItems.map((it, idx) => (
                        <tr key={idx}>
                          <Td>
                            <input
                              type="text"
                              value={it.item}
                              onChange={(e) => updateAiItem(idx, { item: e.target.value })}
                              className="w-32 bg-transparent border-b border-transparent focus:border-indigo-500 focus:outline-none"
                            />
                          </Td>
                          <Td>
                            <NumInput value={it.grams} onChange={(v) => updateAiItem(idx, { grams: Math.max(0, v) })} />
                          </Td>
                          <Td>
                            <NumInput value={it.calories} onChange={(v) => updateAiItem(idx, { calories: Math.max(0, v) })} />
                          </Td>
                          <Td>
                            <NumInput value={it.protein_g} onChange={(v) => updateAiItem(idx, { protein_g: Math.max(0, v) })} />
                          </Td>
                          <Td>
                            <NumInput value={it.carbs_g} onChange={(v) => updateAiItem(idx, { carbs_g: Math.max(0, v) })} />
                          </Td>
                          <Td>
                            <NumInput value={it.fat_g} onChange={(v) => updateAiItem(idx, { fat_g: Math.max(0, v) })} />
                          </Td>
                          <Td>
                            <button
                              onClick={() => removeAiItem(idx)}
                              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded"
                            >
                              ✕
                            </button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <button
                  onClick={saveAiItems}
                  disabled={aiSaving}
                  className="w-full py-3 rounded-xl bg-emerald-600 text-white font-bold shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {aiSaving ? 'שומר...' : '✅ אשר והוסף ליומן'}
                </button>
              </div>
            )}
            
            {aiItems && aiItems.length === 0 && !aiLoading && (
              <div className="text-sm opacity-70 text-center py-2">
                לא זוהו פריטים. נסו לתאר בצורה מפורטת יותר.
              </div>
            )}
            
            {aiSavedAt && !aiSaving && (
                <div className="text-center text-emerald-600 font-bold animate-in fade-in zoom-in">
                    נשמר בהצלחה! 🎉
                </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* ===== Groups by day (History) — ONLY in "what" ===== */}
      {activeTab === 'what' && (
        <div className="space-y-6">
           <h3 className="text-lg font-bold opacity-80 px-1">היסטוריה</h3>
           <div className="grid gap-4">
             {/* Render only visible groups */}
             {visibleGroups.map((g) => {
                const isOpen = expanded[g.dayKey] ?? false;
                return (
                  <section key={g.dayKey} className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background overflow-hidden">
                    <button
                      onClick={() => setExpanded((ex) => ({ ...ex, [g.dayKey]: !isOpen }))}
                      className="w-full text-right p-4 flex flex-col gap-1 hover:bg-black/[.03] dark:hover:bg-white/[.04] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <div className={`text-lg font-bold ${isOpen ? 'text-indigo-600 dark:text-indigo-400' : ''}`}>
                             {fmtDate.format(new Date(g.date))}
                           </div>
                           {/* Day Total Badge */}
                           <span className="text-xs bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full font-mono">
                              {fmtNum(g.totals.calories)} קק"ל
                           </span>
                        </div>
                        <ChevronDownIcon className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} opacity-50`} />
                      </div>
                      
                      {!isOpen && (
                         <div className="text-xs opacity-60 flex gap-3 mt-1">
                            <span>🥩 {fmtNum(g.totals.protein_g)} גר'</span>
                            <span>🍞 {fmtNum(g.totals.carbs_g)} גר'</span>
                            <span>🥑 {fmtNum(g.totals.fat_g)} גר'</span>
                         </div>
                      )}
                    </button>

                    {isOpen && (
                      <div className="border-t border-black/5 dark:border-white/5 bg-gray-50/50 dark:bg-white/[.02]">
                         {/* Mobile List View */}
                         <div className="md:hidden divide-y divide-black/5 dark:divide-white/5">
                           {g.items.map((e) => (
                             <div key={e.id} className="p-3 flex justify-between items-start">
                                <div className="space-y-0.5">
                                   <div className="font-medium text-sm">{e.item}</div>
                                   <div className="text-xs opacity-60">{fmtTime.format(new Date(e.occurred_at))} • {e.amount || '-'}</div>
                                   {e.notes && <div className="text-xs opacity-50 italic">"{e.notes}"</div>}
                                </div>
                                <div className="text-right space-y-1">
                                   <div className="font-mono text-sm font-bold">{Math.round(e.calories || 0)} קק"ל</div>
                                   <button 
                                      onClick={() => deleteEntry(e.id)}
                                      className="text-xs text-red-500 hover:text-red-600 px-2 py-1 rounded bg-red-50 dark:bg-red-900/10"
                                   >
                                      מחק
                                   </button>
                                </div>
                             </div>
                           ))}
                         </div>

                         {/* Desktop Table View */}
                         <div className="hidden md:block overflow-x-auto p-4">
                           <table className="min-w-full text-sm">
                             <thead className="bg-black/5 dark:bg-white/10 rounded-lg">
                               <tr className="text-right">
                                 <Th className="rounded-r-lg">שעה</Th>
                                 <Th>פריט</Th>
                                 <Th>כמות</Th>
                                 <Th>קלוריות</Th>
                                 <Th>חלבון</Th>
                                 <Th>פחמ׳</Th>
                                 <Th>שומן</Th>
                                 <Th className="rounded-l-lg">פעולות</Th>
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
                                   <Td>
                                     <button
                                       onClick={() => deleteEntry(e.id)}
                                       className="text-xs text-red-500 hover:text-red-700 font-medium"
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
           
           {/* Load Actions */}
           {activeTab === 'what' && (
              <div className="pt-4 flex flex-col gap-3 items-center">
                 {/* 1. Client-side expansion: Show more days from loaded list */}
                 {visibleDaysCount < groups.length && (
                    <button
                      onClick={() => setVisibleDaysCount(prev => prev + 3)}
                      className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-4 py-2 rounded-full transition-colors"
                    >
                        👇 הצג ימים נוספים
                    </button>
                 )}

                 {/* 2. Server-side fetching: Load older days (only if we've shown everything or close to end) */}
                 {hasMore && groupsAll.length < MAX_DAYS && visibleDaysCount >= groups.length && (
                    <button
                      onClick={() => userId && loadPage(userId, page + 1)}
                      className="text-sm text-gray-500 border border-gray-200 dark:border-gray-800 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                      טען היסטוריה ישנה יותר מהשרת...
                    </button>
                 )}
              </div>
           )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 text-center bg-red-50 dark:bg-red-900/20 p-2 rounded">{error}</p>}
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
          fat_g: Math.round(((cur.fat_g * 100) / cur.grams) * 100) / 100,
        };
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
   END SECTION 3
   ========================= */



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
function ChevronDownIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
/* =========================
   END FILE
   ========================= */