// src/app/equipment/page.tsx

// ===== Section 1 — Imports, Types & Constants =====
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type EquipRow = {
  id: number;
  name_en: string | null;
  name_he: string | null;
  image_url: string | null;
  is_active: boolean | null;

  // NEW DB columns
  body_area_he: string | null;
  muscles_he: string[] | null;     // jsonb holding string[]
  description_he: string | null;
};

type CategoryKey =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'legs'
  | 'arms'
  | 'core'
  | 'cardio'
  | 'other';

// UI filter includes "all" and "picked"
type FilterKey = 'all' | 'picked' | CategoryKey;

const CATEGORIES: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'הכל' },
  { key: 'picked', label: 'הנבחרים שלי' }, // quick filter for user's picks (בטאב הנוכחי)
  { key: 'chest', label: 'חזה' },
  { key: 'back', label: 'גב' },
  { key: 'shoulders', label: 'כתפיים' },
  { key: 'legs', label: 'רגליים' },
  { key: 'arms', label: 'ידיים' },
  { key: 'core', label: 'ליבה' },
  { key: 'cardio', label: 'קרדיו' },
  { key: 'other', label: 'אחר' },
];

type ExerciseJson = {
  name_en: string;
  name_he: string;
  body_area_he: string;     // e.g. "חזה", "גב", "רגליים"...
  muscles_he: string[];
  description_he: string;
  image_url: string;
};

type EquipView = {
  id: number;
  name_en: string;
  name_he: string;
  category: CategoryKey;

  // chosen (DB preferred, then JSON, then placeholder)
  image_url: string;
  description: string;

  // expose for display & search
  body_area_he: string;
  muscles_he: string[];

  matchedFromJson?: {
    exerciseNameHe: string;
    bodyAreaHe: string;
  };
};

type WorkoutTab = {
  id: number;
  name: string;
  emoji?: string | null;
  order_index: number;
};

const JSON_URL = '/data/exercises.json'; // public/data/exercises.json

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e5e7eb"/>
      <stop offset="1" stop-color="#d1d5db"/>
    </linearGradient>
  </defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <g fill="#6b7280">
    <rect x="160" y="220" width="320" height="40" rx="8"/>
    <rect x="110" y="205" width="30" height="70" rx="6"/>
    <rect x="500" y="205" width="30" height="70" rx="6"/>
  </g>
</svg>
`.trim());

const toText = (v: string | null | undefined) => (v ?? '').trim();
// ===== End Section 1 =====

// ===== Section 2 — Component: State, Auth & Data Load =====
export default function EquipmentPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  const [tabs, setTabs] = useState<WorkoutTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
   
  // DB equipment + selections (for ALL equipment list)
  const [equipViews, setEquipViews] = useState<EquipView[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set()); // selection for CURRENT TAB
  const [selectedInitial, setSelectedInitial] = useState<Set<number>>(new Set());
  // Map to hold selections for ALL tabs (needed for AI Refresh)
  const [allTabsSelections, setAllTabsSelections] = useState<Record<number, Set<number>>>({});

  // JSON exercises
  const [_exercisesJson, setExercisesJson] = useState<ExerciseJson[]>([]);

  // Filters/Search
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<FilterKey>('all');

  // Image preview (lightbox)
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);

  // --- AI Generator State ---
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ summary: string; tabsCount?: number; itemsCount?: number } | null>(null);
  
  // Persisted AI Plan
  const [savedAiPlan, setSavedAiPlan] = useState<string | null>(null);

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

      // Load equipment master + tabs + selection of first tab + Saved AI Plan
      await Promise.all([
        loadEquipmentAndJson(uid), 
        ensureTabsAndLoad(uid),
        loadSavedAiPlan(uid)
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

  // close preview by ESC
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Load Saved AI Plan ---
  async function loadSavedAiPlan(uid: string) {
    const { data, error } = await supabase
      .from('user_ai_plans')
      .select('summary_html')
      .eq('user_id', uid)
      .maybeSingle();

    if (!error && data) {
      setSavedAiPlan(data.summary_html);
    }
  }

  // --- Save AI Plan to DB ---
  async function saveAiPlanToDb(html: string) {
    if (!userId) return;
    const { error } = await supabase
      .from('user_ai_plans')
      .upsert({ user_id: userId, summary_html: html }, { onConflict: 'user_id' });
    
    if (error) {
      console.error('Error saving AI plan:', error);
    } else {
      setSavedAiPlan(html);
    }
  }

  async function ensureTabsAndLoad(uid: string) {
    try {
      setError(null);
      const { data: tRows, error: tErr } = await supabase
        .from('user_workout_tabs')
        .select('id, name, emoji, order_index')
        .eq('user_id', uid)
        .order('order_index', { ascending: true });

      if (tErr) throw new Error(tErr.message);

      let curTabs: WorkoutTab[] = (tRows ?? []).map(r => ({
        id: r.id,
        name: r.name || 'כללי',
        emoji: r.emoji ?? null,
        order_index: r.order_index ?? 0,
      }));

      if (curTabs.length === 0) {
        // create default tab
        const { data: inserted, error: cErr } = await supabase
          .from('user_workout_tabs')
          .insert([{ user_id: uid, name: 'כללי', emoji: '📋', order_index: 0 }])
          .select('id, name, emoji, order_index');

        if (cErr) throw new Error(cErr.message);
        curTabs = inserted as any;
      }

      setTabs(curTabs);
      
      // Load all selections for ALL tabs (to support refresh logic later)
      await loadAllTabsSelections(uid, curTabs);

      if (activeTabId === null || !curTabs.find(t => t.id === activeTabId)) {
        const firstId = curTabs[0].id;
        setActiveTabId(firstId);
        // Set local selection state for UI based on the pre-loaded map
        updateLocalSelectionFromMap(firstId);
      } else {
        updateLocalSelectionFromMap(activeTabId);
      }
      
    } catch (e: any) {
      setError(e?.message || 'שגיאה בטעינת הטאבים');
    }
  }

  async function loadAllTabsSelections(uid: string, currentTabs: WorkoutTab[]) {
    // Fetch all equipment selections for this user
    const { data, error } = await supabase
      .from('user_tab_equipment')
      .select('tab_id, equipment_id')
      .eq('user_id', uid);

    if (error) {
      console.error('Error loading selections:', error);
      return;
    }

    const map: Record<number, Set<number>> = {};
    // Initialize empty sets for known tabs
    currentTabs.forEach(t => map[t.id] = new Set());
    
    // Fill with data
    (data || []).forEach((r: any) => {
      if (!map[r.tab_id]) map[r.tab_id] = new Set();
      map[r.tab_id].add(r.equipment_id);
    });

    setAllTabsSelections(map);
  }

  function updateLocalSelectionFromMap(tabId: number) {
    const ids = allTabsSelections[tabId] || new Set();
    setSelected(new Set(ids));
    setSelectedInitial(new Set(ids));
  }

  async function loadTabSelection(uid: string, tabId: number) {
    // Legacy single load wrapper - logic moved to loadAllTabsSelections for efficiency
    // But we still need to refresh the map if called individually
    await loadAllTabsSelections(uid, tabs);
    updateLocalSelectionFromMap(tabId);
  }

  async function loadEquipmentAndJson(_uid: string) {
    try {
      setError(null);
      const { data: eqData, error: eqErr } = await supabase
        .from('equipment')
        .select('id, name_en, name_he, image_url, is_active, body_area_he, muscles_he, description_he')
        .order('id', { ascending: true });

      if (eqErr) throw new Error(eqErr.message);
      const eqRows: EquipRow[] = (eqData ?? []).filter((r) => r.is_active !== false);

      const res = await fetch(JSON_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load exercises.json');
      const json = (await res.json()) as ExerciseJson[];
      setExercisesJson(json);

      const mapped: EquipView[] = eqRows.map((r) => {
        const name_en = toText(r.name_en);
        const name_he = toText(r.name_he);
        const guessedCategory = guessCategory(name_en, name_he);
        const match = pickBestJsonMatch({ name_en, name_he, category: guessedCategory }, json);

        const dbBodyArea = toText(r.body_area_he);
        const jsonBodyArea = toText(match?.body_area_he);
        const body_area_he = dbBodyArea || jsonBodyArea;

        const category = body_area_he
          ? catFromBodyAreaHeb(body_area_he)
          : guessedCategory;

        const dbDesc = toText(r.description_he);
        const desc = dbDesc || toText(match?.description_he) || genericDescription(category);

        const dbMuscles = Array.isArray(r.muscles_he) ? (r.muscles_he as string[]) : [];
        const muscles = dbMuscles.length ? dbMuscles : (match?.muscles_he ?? []);
        const img = r.image_url || match?.image_url || PLACEHOLDER_IMG;

        return {
          id: r.id,
          name_en: name_en || name_he || 'Unknown',
          name_he: name_he || name_en || 'לא ידוע',
          category,
          image_url: img,
          description: desc,
          body_area_he: body_area_he || categoryHeb(category),
          muscles_he: muscles,
          matchedFromJson: match
            ? { exerciseNameHe: match.name_he, bodyAreaHe: match.body_area_he }
            : undefined,
        };
      });

      setEquipViews(mapped);
      return true;
    } catch (e: any) {
      setError(e?.message || 'שגיאה בטעינת המכשירים/התרגילים');
      setEquipViews([]);
      setExercisesJson([]);
      return false;
    }
  }

  // ---- Tabs: CRUD ----
  async function createTab() {
    if (!userId) return;
    const base = prompt('שם הטאב החדש:', 'אימון חדש');
    if (!base) return;
    const emoji = prompt('אפשר להוסיף אימוג׳י (לא חובה):', '💪') || null;
    const order_index = (tabs[tabs.length - 1]?.order_index ?? 0) + 1;

    const { data, error } = await supabase
      .from('user_workout_tabs')
      .insert({ user_id: userId, name: base, emoji, order_index })
      .select('id, name, emoji, order_index')
      .single();

    if (error || !data) {
      setError(error?.message || 'שגיאה ביצירת טאב');
      return;
    }
    const newTab: WorkoutTab = { id: data.id, name: data.name, emoji: data.emoji, order_index: data.order_index };
    const next = [...tabs, newTab].sort((a, b) => a.order_index - b.order_index);
    setTabs(next);
    // Initialize empty selection set for new tab
    setAllTabsSelections(prev => ({ ...prev, [newTab.id]: new Set() }));
    
    setActiveTabId(newTab.id);
    updateLocalSelectionFromMap(newTab.id);
  }

  async function renameTab(tab: WorkoutTab) {
    if (!userId) return;
    const name = prompt('שם חדש לטאב:', tab.name) || tab.name;
    const emoji = prompt('שנו אימוג׳י (או רוקנו):', tab.emoji || '') || null;

    const { error } = await supabase
      .from('user_workout_tabs')
      .update({ name, emoji })
      .eq('id', tab.id)
      .eq('user_id', userId);

    if (error) { setError(error.message); return; }

    setTabs((prev) => prev.map(t => t.id === tab.id ? { ...t, name, emoji } : t));
  }

  async function deleteTab(tab: WorkoutTab) {
    if (!userId) return;
    if (!confirm(`למחוק את הטאב "${tab.name}"? הפעולה תמחק גם את הבחירות שלו.`)) return;

    const { error } = await supabase.from('user_workout_tabs').delete().eq('id', tab.id).eq('user_id', userId);
    if (error) { setError(error.message); return; }

    const rest = tabs.filter(t => t.id !== tab.id);
    setTabs(rest);
    
    // Update local map
    const newMap = { ...allTabsSelections };
    delete newMap[tab.id];
    setAllTabsSelections(newMap);

    if (rest.length) {
      const newActive = rest[0].id;
      setActiveTabId(newActive);
      updateLocalSelectionFromMap(newActive);
    } else {
      setActiveTabId(null);
      setSelected(new Set());
      setSelectedInitial(new Set());
    }
  }

  // ---- Selection save (per tab) ----
  async function saveSelection() {
    if (!userId || !activeTabId) return;
    setSaving(true);
    setError(null);

    try {
      const toInsert = diffPlus(selected, selectedInitial);
      const toDelete = diffPlus(selectedInitial, selected);

      if (toInsert.length) {
        const payload = toInsert.map((equipment_id) => ({
          user_id: userId,
          tab_id: activeTabId,
          equipment_id,
        }));
        const { error } = await supabase.from('user_tab_equipment').insert(payload);
        if (error) throw new Error(error.message);
      }

      if (toDelete.length) {
        const { error } = await supabase
          .from('user_tab_equipment')
          .delete()
          .eq('user_id', userId)
          .eq('tab_id', activeTabId)
          .in('equipment_id', toDelete);
        if (error) throw new Error(error.message);
      }

      setSelectedInitial(new Set(selected));
      // Update the global map too
      setAllTabsSelections(prev => ({ ...prev, [activeTabId]: new Set(selected) }));

    } catch (e: any) {
      setError(e?.message || 'שגיאה בשמירת הבחירות');
    } finally {
      setSaving(false);
    }
  }

  // ---- AI Generator Logic (New & Refresh) ----
  
  // 1. New Plan from Prompt
  async function handleAiPlan() {
    if (!userId || !aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    setError(null);

    try {
      const key = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
      
      const inventory = equipViews.map(e => ({
        id: e.id,
        name: e.name_he || e.name_en,
        body_area: e.body_area_he
      }));

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (key) headers['x-custom-api-key'] = key;

      const res = await fetch('/api/workout-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
            mode: 'generate',
            userRequest: aiPrompt, 
            inventory 
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה ביצירת התוכנית');
      }

      const data = await res.json();
      
      let totalTabs = 0;
      let totalItems = 0;
      let nextOrder = (tabs[tabs.length - 1]?.order_index ?? 0) + 1;

      for (const t of data.tabs) {
        const { data: newTab, error: tabErr } = await supabase
          .from('user_workout_tabs')
          .insert({ user_id: userId, name: t.name, emoji: t.emoji, order_index: nextOrder++ })
          .select('id')
          .single();
        
        if (tabErr) throw tabErr;
        if (!newTab) continue;

        totalTabs++;
        
        if (t.equipment_ids && t.equipment_ids.length > 0) {
          const payload = t.equipment_ids.map((eid: number) => ({
            user_id: userId,
            tab_id: newTab.id,
            equipment_id: eid
          }));
          
          const { error: linkErr } = await supabase.from('user_tab_equipment').insert(payload);
          if (linkErr) throw linkErr;
          totalItems += t.equipment_ids.length;
        }
      }

      setAiResult({ summary: data.summary, tabsCount: totalTabs, itemsCount: totalItems });
      
      // Save the generated HTML to DB
      await saveAiPlanToDb(data.summary);

      setAiPrompt('');
      await ensureTabsAndLoad(userId);

    } catch (e: any) {
      setError(e?.message || 'שגיאה בלתי צפויה ביצירת התוכנית');
    } finally {
      setAiLoading(false);
    }
  }

  // 2. Refresh existing Plan (Analyze current tabs)
  async function handleRefreshPlan() {
    if (!userId) return;
    setAiLoading(true);
    setAiResult(null); 
    setError(null);

    try {
      const key = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;

      // Construct current routine structure
      const currentRoutine = tabs.map(t => {
        const eqIds = Array.from(allTabsSelections[t.id] || []);
        const eqNames = eqIds.map(eid => {
          const eq = equipViews.find(ev => ev.id === eid);
          return eq ? (eq.name_he || eq.name_en) : `Unknown ID ${eid}`;
        });
        return {
            name: t.name,
            emoji: t.emoji,
            exercises: eqNames
        };
      });

      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (key) headers['x-custom-api-key'] = key;

      const res = await fetch('/api/workout-ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
            mode: 'refresh',
            currentRoutine 
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'שגיאה ברענון התוכנית');
      }

      const data = await res.json();
      
      // Data should contain only 'summary'
      setAiResult({ summary: data.summary });
      
      // Save new summary to DB
      await saveAiPlanToDb(data.summary);

    } catch (e: any) {
      setError(e?.message || 'שגיאה בלתי צפויה ברענון התוכנית');
    } finally {
      setAiLoading(false);
    }
  }

  if (loading) return <p className="opacity-70">טוען…</p>;

  return (
    <>
      <EquipmentPageView
        // tabs
        tabs={tabs}
        activeTabId={activeTabId}
        setActiveTabId={async (id) => {
          if (id === activeTabId) return;
          setActiveTabId(id);
          // Sync current selection first if saving needed? 
          // (Right now we require manual save, so we just switch view)
          updateLocalSelectionFromMap(id);
        }}
        createTab={createTab}
        renameTab={renameTab}
        deleteTab={deleteTab}
        // AI
        openAiModal={() => {
            // If we have a result from THIS session, show it.
            // If not, but we have a SAVED plan, load that into result (for display)
            if (!aiResult && savedAiPlan) {
                setAiResult({ summary: savedAiPlan });
            }
            setShowAiModal(true);
        }}
        hasSavedPlan={!!savedAiPlan}

        // data
        equipViews={equipViews}
        selected={selected}
        selectedInitial={selectedInitial}
        // filters/search
        search={search}
        setSearch={setSearch}
        activeCat={activeCat}
        setActiveCat={setActiveCat}
        // status/errors
        saving={saving}
        error={error}
        // actions
        toggle={(id) => {
          setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }}
        clearSelection={() => setSelected(new Set())}
        save={saveSelection}
        // preview controls
        openPreview={(url, alt) => setPreview({ url, alt })}
      />

      {/* Image Lightbox */}
      <ImageLightbox
        open={!!preview}
        url={preview?.url || ''}
        alt={preview?.alt || ''}
        onClose={() => setPreview(null)}
      />

      {/* AI Workout Builder Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-lg overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-white/5 shrink-0">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <MagicIcon className="w-5 h-5 text-indigo-500" />
                {aiResult ? 'התוכנית שלך' : 'בניית תוכנית חכמה (AI)'}
              </h3>
              <button 
                onClick={() => { setShowAiModal(false); }} 
                className="text-2xl leading-none opacity-50 hover:opacity-100 px-2"
                aria-label="סגור"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {!aiResult ? (
                // --- CREATE NEW MODE ---
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    תאר/י את המטרות שלך (למשל: "אני רוצה קוביות בבטן", "חיזוק פלג גוף עליון", "תוכנית לכל הגוף ב-3 ימים").
                    <br/>
                    ה-AI יסרוק את המכשירים הקיימים וייצור עבורך טאבים חדשים עם תרגילים מתאימים.
                  </p>
                  
                  <textarea
                    className="w-full h-32 p-3 rounded-lg border border-black/10 dark:border-white/20 bg-transparent focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    placeholder="פרט/י כאן את מטרות האימון שלך..."
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    disabled={aiLoading}
                  />

                  <div className="flex justify-end">
                    <button
                      onClick={handleAiPlan}
                      disabled={aiLoading || !aiPrompt.trim()}
                      className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {aiLoading ? 'הרובוט עובד... 🤖' : 'צור תוכנית ✨'}
                    </button>
                  </div>
                </>
              ) : (
                // --- VIEW / REFRESH MODE ---
                <div className="space-y-4">
                  
                  {/* Refresh Button - Based on ACTUAL tabs/exercises */}
                  <div className="flex justify-end">
                     <button
                        onClick={handleRefreshPlan}
                        disabled={aiLoading}
                        className="text-xs flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 px-3 py-1.5 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/40 transition"
                        title="ינתח מחדש את הטאבים והתרגילים שבחרת וייצור הסבר מעודכן"
                     >
                        <svg className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        {aiLoading ? 'מעדכן...' : 'רענן ניתוח עפ"י השינויים שלי'}
                     </button>
                  </div>

                  {/* Summary rendered as HTML */}
                  <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-lg text-sm text-right space-y-2 border border-black/5 dark:border-white/5 shadow-inner">
                    <div 
                      className="
                        prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-white
                        [&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-3 [&_h3]:text-indigo-600 dark:[&_h3]:text-indigo-400 [&_h3:first-child]:mt-0
                        [&_strong]:font-bold [&_strong]:text-indigo-700 dark:[&_strong]:text-indigo-300
                        [&_ul]:list-none [&_ul]:space-y-4 [&_ul]:p-0
                        [&_li]:bg-white dark:[&_li]:bg-white/5 [&_li]:p-3 [&_li]:rounded-md [&_li]:shadow-sm [&_li]:border [&_li]:border-black/5 dark:[&_li]:border-white/5
                        [&_p]:leading-relaxed
                        [&_hr]:my-6 [&_hr]:border-black/10 dark:[&_hr]:border-white/10
                      "
                      dangerouslySetInnerHTML={{ __html: aiResult.summary }}
                    />
                    
                    {(aiResult.tabsCount || 0) > 0 && (
                        <div className="flex gap-4 text-xs opacity-80 pt-4 border-t border-black/10 dark:border-white/10 mt-4 font-mono">
                        <span>📂 {aiResult.tabsCount} טאבים חדשים נוצרו</span>
                        </div>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 p-3 rounded-lg text-sm text-center">
                  שגיאה: {error}
                </div>
              )}
            </div>

            {/* Footer actions for modal */}
            {aiResult && (
              <div className="p-4 border-t border-black/10 dark:border-white/10 bg-gray-50 dark:bg-white/5 flex gap-3 shrink-0">
                <button
                    onClick={() => { setAiResult(null); }}
                    className="flex-1 bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 text-gray-800 dark:text-white px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50"
                >
                    ✨ תוכנית חדשה
                </button>
                <button
                  onClick={() => { setShowAiModal(false); }}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700"
                >
                  סגור
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
// ===== End Section 2 =====




// ===== Section 3 — Stateless View & Filtering =====
function EquipmentPageView(props: {
  // tabs
  tabs: WorkoutTab[];
  activeTabId: number | null;
  setActiveTabId: (id: number) => void | Promise<void>;
  createTab: () => void | Promise<void>;
  renameTab: (tab: WorkoutTab) => void | Promise<void>;
  deleteTab: (tab: WorkoutTab) => void | Promise<void>;
   
  // AI
  openAiModal: () => void;
  hasSavedPlan: boolean; // NEW: to decide if we show the "Show Plan" button

  // equipment list + selection
  equipViews: EquipView[];
  selected: Set<number>;
  selectedInitial: Set<number>;

  // search/filter
  search: string;
  setSearch: (v: string) => void;
  activeCat: FilterKey;
  setActiveCat: (v: FilterKey) => void;

  // status
  saving: boolean;
  error: string | null;

  // actions
  toggle: (id: number) => void;
  clearSelection: () => void;
  save: () => Promise<void>;
  openPreview: (url: string, alt: string) => void;
}) {
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    createTab,
    renameTab,
    deleteTab,
    openAiModal,
    hasSavedPlan,
    equipViews,
    selected,
    selectedInitial,
    search,
    setSearch,
    activeCat,
    setActiveCat,
    saving,
    error,
    toggle,
    clearSelection,
    save,
    openPreview,
  } = props;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = equipViews;

    if (activeCat === 'picked') {
      arr = arr.filter((e) => selected.has(e.id));
    } else if (activeCat !== 'all') {
      arr = arr.filter((e) => e.category === activeCat);
    }

    if (q) {
      arr = arr.filter((e) => {
        const pool = [
          e.name_he,
          e.name_en,
          e.description,
          e.body_area_he,
          e.muscles_he.join(' '),
          categoryLabel(e.category),
          e.matchedFromJson?.exerciseNameHe ?? '',
          e.matchedFromJson?.bodyAreaHe ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return pool.includes(q);
      });
    }
    return arr;
  }, [equipViews, search, activeCat, selected]);

  return (
    <div className="mx-auto max-w-6xl space-y-8" dir="rtl">
      <header className="space-y-2 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">בחירת מכשירים</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            נהל/י טאבים שונים לאימונים ובחר/י לכל טאב את המכשירים שלו.
          </p>
        </div>
        <div className="flex gap-2">
            {/* Show Plan Button - Only if we have a saved plan */}
            {hasSavedPlan && (
                <button
                onClick={openAiModal}
                className="inline-flex items-center gap-2 bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 text-gray-800 dark:text-white px-4 py-2 rounded-full font-medium shadow-sm hover:bg-gray-50 transition-all"
                >
                <span className="text-lg">📋</span>
                הצג תוכנית
                </button>
            )}

            <button
            onClick={openAiModal}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-4 py-2 rounded-full font-medium shadow hover:shadow-lg transition-all hover:scale-105"
            >
            <MagicIcon className="w-4 h-4" />
            בניית תוכנית AI
            </button>
        </div>
      </header>

      {/* Tabs bar */}
      <section className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
        <div className="p-3 md:p-4 flex items-center justify-between gap-2 border-b border-black/10 dark:border-white/10">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {tabs.map((t) => {
              const isActive = t.id === activeTabId;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTabId(t.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm border inline-flex items-center gap-2 transition
                    ${
                      isActive
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
                    }`}
                  title={t.name}
                >
                  <span className="text-base">{t.emoji || '🏷️'}</span>
                  <span className="font-medium">{t.name}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {activeTabId != null && (
              <>
                <button
                  onClick={() => {
                    const tab = tabs.find((x) => x.id === activeTabId)!;
                    renameTab(tab);
                  }}
                  className="rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                >
                  שנה שם
                </button>
                {tabs.length > 1 && (
                  <button
                    onClick={() => {
                      const tab = tabs.find((x) => x.id === activeTabId)!;
                      deleteTab(tab);
                    }}
                    className="rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  >
                    מחק
                  </button>
                )}
              </>
            )}
            <button
              onClick={createTab}
              className="rounded-lg px-3 py-2 text-sm bg-foreground text-background hover:opacity-90"
            >
              + חדש
            </button>
          </div>
        </div>

        {/* Quick filter inside the same card */}
        <div className="p-4 md:p-6 grid gap-4">
          <SearchField
            label="חיפוש"
            placeholder="למשל: חזה / Chest / Row / כתפיים / בייספס…"
            value={search}
            onChange={setSearch}
          />
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((c) => {
              const isPicked = c.key === 'picked';
              const pickedCount = isPicked ? (activeTabId ? selected.size : 0) : 0;

              return (
                <button
                  key={c.key}
                  onClick={() => setActiveCat(c.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm border inline-flex items-center gap-2
                    ${
                      activeCat === c.key
                        ? 'bg-foreground text-background border-foreground'
                        : 'border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
                    }`}
                >
                  <span>{c.label}</span>
                  {isPicked && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full border ${
                        activeCat === c.key
                          ? 'border-background/50'
                          : 'border-black/10 dark:border-white/20'
                      }`}
                      title="כמה נבחרו בטאב הנוכחי"
                    >
                      {pickedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* גריד מכשירים */}
      <section className="grid gap-6">
        {activeCat !== 'all' && activeCat !== 'picked' ? (
          <h2 className="text-xl font-semibold">{categoryHeb(activeCat as CategoryKey)}</h2>
        ) : null}

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.length === 0 && (
            <div className="col-span-full opacity-70">
              {activeCat === 'picked' ? 'עוד לא נבחרו תרגילים בטאב זה.' : 'לא נמצאו מכשירים תואמים.'}
            </div>
          )}
          {filtered.map((e) => {
            const isOn = selected.has(e.id);
            const titleHe = e.name_he || e.name_en || 'לא ידוע';
            const subtitleEn =
              e.name_en && e.name_en.trim() !== '' && e.name_en.trim() !== e.name_he?.trim()
                ? e.name_en
                : '';

            return (
              <article
                key={e.id}
                className={`group rounded-xl ring-1 p-3 md:p-4 cursor-pointer select-none
                  ${
                    isOn
                      ? 'ring-foreground/60 bg-foreground/[.06]'
                      : 'ring-black/10 dark:ring-white/10 hover:bg-black/[.03] dark:hover:bg-white/[.04]'
                  }`}
                onClick={() => activeTabId && toggle(e.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-black/10 dark:border-white/20">
                      {e.body_area_he}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center justify-center text-xs px-2 py-1 rounded-full border
                      ${
                        isOn
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-black/10 dark:border-white/20'
                      }`}
                  >
                    {isOn ? 'נבחר' : 'בחר'}
                  </span>
                </div>

                <div className="mt-3 aspect-square overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10 bg-white">
                  <button
                    type="button"
                    className="h-full w-full flex items-center justify-center"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      openPreview(e.image_url, titleHe);
                    }}
                    title="הצג תמונה מלאה"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={e.image_url}
                      alt={titleHe}
                      className="h-full w-full object-contain"
                      loading="lazy"
                    />
                  </button>
                </div>

                <div className="mt-3">
                  <h3 className="text-base md:text-lg font-semibold leading-tight">{titleHe}</h3>
                  {subtitleEn ? (
                    <div className="text-sm opacity-80 ltr:font-medium">{subtitleEn}</div>
                  ) : null}

                  {e.muscles_he?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.muscles_he.slice(0, 6).map((m, idx) => (
                        <span
                          key={`${e.id}-m-${idx}`}
                          className="text-[11px] px-2 py-0.5 rounded-full border border-black/10 dark:border-white/20"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <p className="text-sm mt-2 opacity-90">{e.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* סרגל פעולה בתחתית */}
      <div className="sticky bottom-3">
        <div className="mx-auto max-w-6xl">
          <div className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background/90 supports-[backdrop-filter]:bg-background/75 backdrop-blur p-3 md:p-4 flex flex-col md:flex-row items-center gap-3 md:gap-4 justify-between">
            <div className="text-sm">
              טאב נוכחי:{' '}
              <b>{(tabs.find((t) => t.id === activeTabId)?.name) || '—'}</b>{' '}
              · <b>{selected.size}</b> מכשירים נבחרו
              {diffPlus(selected, selectedInitial).length > 0 ||
              diffPlus(selectedInitial, selected).length > 0 ? (
                <span className="opacity-70"> (יש שינויים שלא נשמרו)</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearSelection}
                className="rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                נקה בחירות בטאב
              </button>
              <button
                disabled={saving || !activeTabId}
                onClick={save}
                className="rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'שומר…' : 'שמור לטאב'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
// ===== End Section 3 =====


// ===== Section 4 — Matching Logic (DB Equipment ↔ JSON Exercises) =====
function pickBestJsonMatch(
  equip: { name_en: string; name_he: string; category: CategoryKey },
  list: ExerciseJson[]
): ExerciseJson | undefined {
  if (!list.length) return undefined;

  const target = `${equip.name_en} ${equip.name_he}`.toLowerCase();
  let best: { ex: ExerciseJson; score: number } | null = null;

  for (const ex of list) {
    const nHe = (ex.name_he || '').toLowerCase();
    const nEn = (ex.name_en || '').toLowerCase();
    let score = 0;

    if (nHe && (target.includes(nHe) || nHe.includes(equip.name_he.toLowerCase()))) score += 5;
    if (nEn && (target.includes(nEn) || nEn.includes(equip.name_en.toLowerCase()))) score += 5;

    const tokens = tokenSet(target);
    const nameTokens = new Set([...tokenSet(nHe), ...tokenSet(nEn)]);
    const overlap = intersectCount(tokens, nameTokens);
    score += Math.min(overlap, 3); // cap

    const exCat = catFromBodyAreaHeb(ex.body_area_he || '');
    if (exCat === equip.category) score += 2;

    if (!best || score > best.score) best = { ex, score };
  }
  return best && best.score >= 2 ? best.ex : undefined;
}

function tokenSet(s: string) {
  return new Set(s.split(/[\s\-\(\),.'"/]+/).filter(Boolean));
}
function intersectCount(a: Set<string>, b: Set<string>) {
  let c = 0;
  for (const x of a) if (b.has(x)) c++;
  return c;
}
// ===== End Section 4 =====



// ===== Section 5 — Category/Description Helpers =====
function categoryLabel(c: CategoryKey) {
  return categoryHeb(c).toLowerCase();
}

function categoryHeb(c: CategoryKey): string {
  switch (c) {
    case 'chest': return 'חזה';
    case 'back': return 'גב';
    case 'shoulders': return 'כתפיים';
    case 'legs': return 'רגליים';
    case 'arms': return 'ידיים';
    case 'core': return 'ליבה';
    case 'cardio': return 'קרדיו';
    default: return 'אחר';
  }
}

function catFromBodyAreaHeb(body_he: string): CategoryKey {
  const s = (body_he || '').trim();
  if (/(מותני|מותניים)/.test(s)) return 'core';
  if (/(ירך|ירכיים|ירכי)/.test(s)) return 'legs';
  if (/(קרדיו|אירובי|לב.?ר.?א?ה)/.test(s)) return 'cardio';
  if (/חזה/.test(s)) return 'chest';
  if (/גב/.test(s)) return 'back';
  if (/כתפ/.test(s)) return 'shoulders';
  if (/רגל/.test(s)) return 'legs';
  if (/יד/.test(s)) return 'arms';
  if (/ליבה|בטן/.test(s)) return 'core';
  return 'other';
}

function guessCategory(name_en: string, name_he: string): CategoryKey {
  const s = `${name_en} ${name_he}`.toLowerCase();
  if (/(מותני|מותניים)/.test(s)) return 'core';
  if (/(ירך|ירכיים)/.test(s)) return 'legs';
  if (/(קרדיו|אירובי|לב.?ר.?א?ה)/.test(s)) return 'cardio';
  if (/\b(chest|pec|fly)\b/.test(s) || /חזה/.test(s)) return 'chest';
  if (/\b(lat|row(?!er)|pull|pulldown|back)\b/.test(s) || /(גב|חתירה)/.test(s)) return 'back';
  if (/\b(shoulder|overhead|press)\b/.test(s) || /כתפ/.test(s)) return 'shoulders';
  if (/\b(leg|squat|press|extension|curl|quad|hamstring)\b/.test(s) || /(רגל|ירך|שוק|ירכיים)/.test(s)) return 'legs';
  if (/\b(biceps|triceps|curl|dip|pushdown)\b/.test(s) || /(יד|מרפק)/.test(s)) return 'arms';
  if (/\b(core|ab|crunch|plank)\b/.test(s) || /(בטן|ליבה|מותני|מותניים)/.test(s)) return 'core';
  if (/\b(treadmill|elliptical|bike|cycling|rower|rowing|stair|stepper|spinning|run|walk)\b/.test(s) || /(קרדיו|מסלול|הליכון|אופניים|אליפטי|חתירה|מדרגות|ריצה|הליכה|אירובי)/.test(s)) return 'cardio';
  return 'other';
}

function genericDescription(cat: CategoryKey): string {
  switch (cat) {
    case 'chest': return 'מכשיר לחיזוק ופיתוח שרירי החזה.';
    case 'back': return 'מכשיר לעבודה על שרירי הגב והיציבה.';
    case 'shoulders': return 'מכשיר לפיתוח שרירי הכתף.';
    case 'legs': return 'מכשיר לחיזוק ופיתוח שרירי הרגליים.';
    case 'arms': return 'מכשיר לעבודה ממוקדת על שרירי הידיים.';
    case 'core': return 'מכשיר/תרגיל לחיזוק שרירי הליבה והבטן.';
    case 'cardio': return 'מכשיר קרדיו לשיפור סבולת ומערכת לב־ריאה.';
    default: return 'מכשיר כללי לאימון פונקציונלי.';
  }
}

function diffPlus(a: Set<number>, b: Set<number>) {
  const out: number[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out;
}
// ===== End Section 5 =====



// ===== Section 6 — Small UI Bits =====
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
      <div className="p-4 md:p-6 border-b border-black/10 dark:border-white/10">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="p-4 md:p-6">{children}</div>
    </section>
  );
}

function SearchField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
      />
    </label>
  );
}

// ===== Lightbox (Full Image Preview) =====
function ImageLightbox({
  open,
  url,
  alt,
  onClose,
}: {
  open: boolean;
  url: string;
  alt: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -left-3 md:top-0 md:left-0 translate-y-[-100%] md:translate-y-0 md:-translate-x-full rounded-md bg-white/90 text-black text-sm px-3 py-1 shadow hover:bg-white"
          aria-label="סגור"
        >
          ✕ סגור
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          className="max-h-[85vh] w-full object-contain rounded-lg shadow-lg bg-white"
        />
      </div>
    </div>
  );
}

function MagicIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={props.className}>
      <path d="M15 4V2m0 2l-2-2m2 2l2-2M15 4h2M15 4H13" />
      <path d="M19 15v-2m0 2l-2-2m2 2l2-2M19 15h2M19 15h-2" />
      <path d="M8.5 4a5.5 5.5 0 0 1 5.5 5.5v1a5.5 5.5 0 0 1-5.5 5.5H8a5.5 5.5 0 0 1-5.5-5.5v-1A5.5 5.5 0 0 1 8 5.5h.5Z" />
    </svg>
  );
}
// ===== End Section 6 =====