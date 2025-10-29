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
  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId) || null, [tabs, activeTabId]);

  // DB equipment + selections (for ALL equipment list)
  const [equipViews, setEquipViews] = useState<EquipView[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set()); // selection for CURRENT TAB
  const [selectedInitial, setSelectedInitial] = useState<Set<number>>(new Set());

  // JSON exercises
  const [exercisesJson, setExercisesJson] = useState<ExerciseJson[]>([]);

  // Filters/Search
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<FilterKey>('all');

  // Image preview (lightbox)
  const [preview, setPreview] = useState<{ url: string; alt: string } | null>(null);

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

      // Load equipment master + tabs + selection of first tab
      await Promise.all([loadEquipmentAndJson(uid), ensureTabsAndLoad(uid)]);

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
      const firstId = curTabs[0].id;
      setActiveTabId(firstId);
      await loadTabSelection(uid, firstId);
    } catch (e: any) {
      setError(e?.message || 'שגיאה בטעינת הטאבים');
    }
  }

  async function loadTabSelection(uid: string, tabId: number) {
    try {
      setError(null);
      const { data, error } = await supabase
        .from('user_tab_equipment')
        .select('equipment_id')
        .eq('user_id', uid)
        .eq('tab_id', tabId);

      if (error) throw new Error(error.message);
      const ids = new Set<number>((data ?? []).map((r: any) => r.equipment_id));
      setSelected(ids);
      setSelectedInitial(new Set(ids));
    } catch (e: any) {
      // graceful fallback if table not ready
      setError(
        (e?.message || '').includes('relation') ?
          'נראה שטבלת הטאבים טרם הוגדרה. ניתן להשתמש בברירת המחדל "כללי" לאחר יצירת הטבלאות.' :
          (e?.message || 'שגיאה בטעינת בחירות הטאב')
      );
      setSelected(new Set());
      setSelectedInitial(new Set());
    }
  }

  async function loadEquipmentAndJson(_uid: string) {
    try {
      setError(null);

      // 1) Load DB equipment (including new columns)
      const { data: eqData, error: eqErr } = await supabase
        .from('equipment')
        .select('id, name_en, name_he, image_url, is_active, body_area_he, muscles_he, description_he')
        .order('id', { ascending: true });

      if (eqErr) throw new Error(eqErr.message);
      const eqRows: EquipRow[] = (eqData ?? []).filter((r) => r.is_active !== false);

      // 2) Load JSON (public/data/exercises.json)
      const res = await fetch(JSON_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load exercises.json');
      const json = (await res.json()) as ExerciseJson[];
      setExercisesJson(json);

      // 3) Build UI rows, preferring DB values and falling back to JSON
      const mapped: EquipView[] = eqRows.map((r) => {
        const name_en = toText(r.name_en);
        const name_he = toText(r.name_he);

        // Try DB first; if missing, look for matching JSON to fill in
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
    setActiveTabId(newTab.id);
    await loadTabSelection(userId, newTab.id);
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

    // clean local
    const rest = tabs.filter(t => t.id !== tab.id);
    setTabs(rest);
    if (rest.length) {
      const newActive = rest[0].id;
      setActiveTabId(newActive);
      await loadTabSelection(userId!, newActive);
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
    } catch (e: any) {
      setError(e?.message || 'שגיאה בשמירת הבחירות');
    } finally {
      setSaving(false);
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
          if (userId && id) await loadTabSelection(userId, id);
        }}
        createTab={createTab}
        renameTab={renameTab}
        deleteTab={deleteTab}
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

    // "picked" shows only selected items (per current tab)
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
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">בחירת מכשירים</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          נהל/י טאבים שונים לאימונים (למשל "אימוני כוח", "קרדיו", "פלג גוף תחתון") ובחר/י לכל טאב את המכשירים שלו.
        </p>
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
                  שנה שם/אימוג׳י
                </button>
                {tabs.length > 1 && (
                  <button
                    onClick={() => {
                      const tab = tabs.find((x) => x.id === activeTabId)!;
                      deleteTab(tab);
                    }}
                    className="rounded-lg border border-black/10 dark:border-white/20 px-3 py-2 text-sm hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  >
                    מחק טאב
                  </button>
                )}
              </>
            )}
            <button
              onClick={createTab}
              className="rounded-lg px-3 py-2 text-sm bg-foreground text-background hover:opacity-90"
            >
              + טאב חדש
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

            // Display logic: HE as main title, EN below (only if different)
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

                {/* Image: clicking it opens preview (does NOT select card) */}
                <div className="mt-3 aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                  <button
                    type="button"
                    className="h-full w-full"
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
                      className="h-full w-full object-cover"
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

  // Score each exercise: name hit > token overlap > body area/category hint
  let best: { ex: ExerciseJson; score: number } | null = null;

  for (const ex of list) {
    const nHe = (ex.name_he || '').toLowerCase();
    const nEn = (ex.name_en || '').toLowerCase();

    let score = 0;

    // Strong score if the equipment name appears in exercise name (any language)
    if (nHe && (target.includes(nHe) || nHe.includes(equip.name_he.toLowerCase()))) score += 5;
    if (nEn && (target.includes(nEn) || nEn.includes(equip.name_en.toLowerCase()))) score += 5;

    // Medium score if any token overlaps
    const tokens = tokenSet(target);
    const nameTokens = new Set([...tokenSet(nHe), ...tokenSet(nEn)]);
    const overlap = intersectCount(tokens, nameTokens);
    score += Math.min(overlap, 3); // cap

    // Light score for body area → category match
    const exCat = catFromBodyAreaHeb(ex.body_area_he || '');
    if (exCat === equip.category) score += 2;

    if (!best || score > best.score) best = { ex, score };
  }

  // Require some confidence: score >= 2 (name token or body match)
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
    case 'chest':
      return 'חזה';
    case 'back':
      return 'גב';
    case 'shoulders':
      return 'כתפיים';
    case 'legs':
      return 'רגליים';
    case 'arms':
      return 'ידיים';
    case 'core':
      return 'ליבה';
    case 'cardio':
      return 'קרדיו';
    default:
      return 'אחר';
  }
}

/**
 * Map Hebrew body area labels to categories.
 * - מותניים => core
 * - ירכיים (and forms) => legs
 * - קרדיו/אירובי/לב־ריאה => cardio
 * Keeps other existing mappings.
 */
function catFromBodyAreaHeb(body_he: string): CategoryKey {
  const s = (body_he || '').trim();

  // Specific remaps first
  if (/(מותני|מותניים)/.test(s)) return 'core';                     // waist → core
  if (/(ירך|ירכיים|ירכי)/.test(s)) return 'legs';                    // thighs/hips → legs
  if (/(קרדיו|אירובי|לב.?ר.?א?ה)/.test(s)) return 'cardio';         // cardio/aerobic/לב-ריאה

  // Existing mappings
  if (/חזה/.test(s)) return 'chest';
  if (/גב/.test(s)) return 'back';
  if (/כתפ/.test(s)) return 'shoulders';
  if (/רגל/.test(s)) return 'legs';
  if (/יד/.test(s)) return 'arms';
  if (/ליבה|בטן/.test(s)) return 'core';
  return 'other';
}

/**
 * Fallback guess from names if body_area is missing/unknown.
 * Also includes the same remaps for מותניים/ירכיים/קרדיו to avoid "other".
 */
function guessCategory(name_en: string, name_he: string): CategoryKey {
  const s = `${name_en} ${name_he}`.toLowerCase();

  // Specific remaps (Hebrew keywords inside names)
  if (/(מותני|מותניים)/.test(s)) return 'core';
  if (/(ירך|ירכיים)/.test(s)) return 'legs';
  if (/(קרדיו|אירובי|לב.?ר.?א?ה)/.test(s)) return 'cardio';

  if (/\b(chest|pec|fly)\b/.test(s) || /חזה/.test(s)) return 'chest';
  if (/\b(lat|row(?!er)|pull|pulldown|back)\b/.test(s) || /(גב|חתירה)/.test(s)) return 'back';
  if (/\b(shoulder|overhead|press)\b/.test(s) || /כתפ/.test(s)) return 'shoulders';
  if (/\b(leg|squat|press|extension|curl|quad|hamstring)\b/.test(s) || /(רגל|ירך|שוק|ירכיים)/.test(s))
    return 'legs';
  if (/\b(biceps|triceps|curl|dip|pushdown)\b/.test(s) || /(יד|מרפק)/.test(s)) return 'arms';
  if (/\b(core|ab|crunch|plank)\b/.test(s) || /(בטן|ליבה|מותני|מותניים)/.test(s)) return 'core';
  if (/\b(treadmill|elliptical|bike|cycling|rower|rowing|stair|stepper|spinning|run|walk)\b/.test(s) || /(קרדיו|מסלול|הליכון|אופניים|אליפטי|חתירה|מדרגות|ריצה|הליכה|אירובי)/.test(s))
    return 'cardio';
  return 'other';
}

function genericDescription(cat: CategoryKey): string {
  switch (cat) {
    case 'chest':
      return 'מכשיר לחיזוק ופיתוח שרירי החזה.';
    case 'back':
      return 'מכשיר לעבודה על שרירי הגב והיציבה.';
    case 'shoulders':
      return 'מכשיר לפיתוח שרירי הכתף.';
    case 'legs':
      return 'מכשיר לחיזוק ופיתוח שרירי הרגליים.';
    case 'arms':
      return 'מכשיר לעבודה ממוקדת על שרירי הידיים.';
    case 'core':
      return 'מכשיר/תרגיל לחיזוק שרירי הליבה והבטן.';
    case 'cardio':
      return 'מכשיר קרדיו לשיפור סבולת ומערכת לב־ריאה.';
    default:
      return 'מכשיר כללי לאימון פונקציונלי.';
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
// ===== End Section 6 =====
