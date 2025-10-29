// src/app/profile/page.tsx
'use client';

// ===== SECTION 1 TITLE: Imports & Setup =====
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
// ===== SECTION 1 END =====

// ===== SECTION 2 TITLE: Type Definitions =====
type Gender = 'male' | 'female' | 'other' | 'unspecified';

// Activity + Goals
type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very_active';
type UserGoal = { id: number; goal_key: string; label: string };

type Profile = {
  user_id: string;
  full_name: string | null;
  gender: Gender;
  birth_date: string | null;        // ISO date (yyyy-mm-dd)
  height_cm: number | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
};

type Measurement = {
  id: number;
  measured_at: string;              // ISO datetime
  weight_kg: number | null;
  body_fat_percent: number | null;

  // קיימים בטבלה
  chest_cm: number | null;
  waist_cm: number | null;          // נשמר לתאימות לאחור (לא מוצג)
  hips_cm: number | null;
  biceps_cm: number | null;
  thigh_cm: number | null;
  calf_cm: number | null;

  // חדשים (מומלצים)
  neck_cm?: number | null;          // צוואר
  waist_navel_cm?: number | null;   // מותן בגובה הטבור
  waist_narrow_cm?: number | null;  // מותן בנקודה הצרה ביותר
  shoulders_cm?: number | null;     // היקף כתפיים

  notes: string | null;
};
// ===== SECTION 2 END =====

// ===== SECTION 3 TITLE: Constants =====
const KNOWN_GOALS: { key: string; label: string }[] = [
  { key: 'bulking', label: 'BULKING – עלייה במסת שריר' },
  { key: 'cutting', label: 'CUTTING – חיטוב / ירידה באחוזי שומן' },
  { key: 'recomp',  label: 'RECOMP – ריקומפ (בניית שריר והורדת שומן במקביל)' },
];

const MEAS_HELP: Record<
  string,
  { title: string; text: string; femaleRecommended?: boolean }
> = {
  neck_cm: {
    title: 'צוואר',
    text: 'בסיס הצוואר מעל עצם הבריח, בלי להדק חזק. ראש במנח ניטרלי.',
  },
  shoulders_cm: {
    title: 'כתפיים',
    text: 'סביב הכתפיים בנקודה הרחבה ביותר. זרועות רפויות לצד הגוף.',
  },
  chest_cm: {
    title: 'חזה',
    text: 'סביב בית החזה בגובה הפטמות. לנשום רגיל, זרועות משוחררות.',
  },
  biceps_cm: {
    title: 'יד קדמית',
    text: 'במרכז הזרוע העליונה. עדיף רפויה לאחידות בין מדידות.',
  },
  waist_narrow_cm: {
    title: 'מותן – נקודה צרה',
    text: 'מדדו בנקודה הצרה בין הצלעות לאגן. עקבי לצורת הגוף ויעיל למעקב חיטוב.',
  },
  waist_navel_cm: {
    title: 'מותן – טבור',
    text: 'סרט סביב הבטן בגובה הטבור. עמדו רגוע, נשיפה רגילה (לא לשאוב בטן). רגיש לשומן בטני.',
  },
  hips_cm: {
    title: 'ירכיים',
    text: 'מדידה בנקודה הרחבה באזור הישבן/ירך. לרוב חשוב לנשים להערכת %שומן מדויקת.',
    femaleRecommended: true,
  },
  thigh_cm: {
    title: 'ירך',
    text: 'באמצע הירך, כמה ס"מ מעל הברך. עמידה ישרה, משקל מחולק שווה.',
  },
  calf_cm: {
    title: 'שוק',
    text: 'בנקודה הרחבה ביותר בשוק. עמידה זקופה, עקבים צמודים לרצפה.',
  },
  weight_kg: {
    title: 'משקל',
    text: 'מדידה בבוקר אחרי שירותים ולפני אוכל/קפה. לעמוד יחף, בלי פריטים כבדים בכיסים.',
  },
  body_fat_percent: {
    title: 'אחוז שומן',
    text: 'אם אין – השאירו ריק. ההיקפים יעזרו להבין מגמות. אפשר לעדכן בעתיד ממאזן/קליפרים.',
  },
};

// תמונות למדידות — עודכן ללינקים מ־Imgur
const MEAS_IMG: Record<string, string> = {
  neck_cm:          'https://i.imgur.com/bKXG4Px.jpeg',
  shoulders_cm:     'https://i.imgur.com/mvWGAEC.jpeg',
  chest_cm:         'https://i.imgur.com/94BmMdg.jpeg',
  biceps_cm:        'https://i.imgur.com/NMJUQYp.jpeg',
  waist_narrow_cm:  'https://i.imgur.com/gQfSxo5.jpeg',
  waist_navel_cm:   'https://i.imgur.com/qCIucik.jpeg',
  hips_cm:          'https://i.imgur.com/6c3R3wi.jpeg',
  thigh_cm:         'https://i.imgur.com/IiRRIkA.jpeg',
  calf_cm:          'https://i.imgur.com/QilLjFu.jpeg',
  weight_kg:        'https://i.imgur.com/XxMPXTh.jpeg',
  body_fat_percent: 'https://i.imgur.com/pAxCrLf.jpeg',
};
// ===== SECTION 3 END =====


// ===== SECTION 4 TITLE: Profile Page Component (State, Effects, Handlers, Render) =====
export default function ProfilePage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addingMeas, setAddingMeas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----- Tabs -----
  type Tab = 'profile' | 'activity' | 'measurements';
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // ----- פרופיל (state) -----
  const [profile, setProfile] = useState<Profile>({
    user_id: '',
    full_name: '',
    gender: 'unspecified',
    birth_date: null,
    height_cm: null,
    weight_kg: null,
    body_fat_percent: null,
  });

  // ----- פעילות ומטרות -----
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(null);
  const [savingActivity, setSavingActivity] = useState(false);

  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [goalsBusy, setGoalsBusy] = useState(false);

  // ----- טופס מדידה (שדות רלוונטיים בלבד) -----
  const [meas, setMeas] = useState<Omit<Measurement, 'id' | 'measured_at'>>({
    weight_kg: null,
    body_fat_percent: null,
    chest_cm: null,
    waist_cm: null, // legacy (לא יוצג)
    hips_cm: null,
    biceps_cm: null,
    thigh_cm: null,
    calf_cm: null,
    neck_cm: null,
    waist_navel_cm: null,
    waist_narrow_cm: null,
    shoulders_cm: null,
    notes: null,
  });

  const [recent, setRecent] = useState<Measurement[]>([]);
  const [openMobileMeasId, setOpenMobileMeasId] = useState<number | null>(null);

  // פורמט תאריך עברי
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    []
  );

  // ----- טעינת משתמש+נתונים -----
  useEffect(() => {
    let ignore = false;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id ?? null;

      if (!uid) {
        router.push('/login');
        return;
      }
      if (ignore) return;

      setUserId(uid);
      await Promise.all([fetchProfile(uid), fetchActivity(uid), fetchGoals(uid), fetchRecent(uid)]);
      setLoading(false);
    };

    bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user?.id) router.push('/login');
    });

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  // ----- Keyboard arrows: switch tabs (RTL-friendly order) -----
  useEffect(() => {
    const order: Tab[] = ['profile', 'activity', 'measurements'];
    const onKey = (e: KeyboardEvent) => {
      const idx = order.indexOf(activeTab);
      if (e.key === 'ArrowRight') setActiveTab(order[(idx + 1) % order.length]);
      if (e.key === 'ArrowLeft') setActiveTab(order[(idx - 1 + order.length) % order.length]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeTab]);

  const fetchProfile = async (uid: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      setError(error.message);
      return;
    }

    if (data) {
      setProfile({
        user_id: data.user_id,
        full_name: data.full_name ?? '',
        gender: (data.gender as Gender) ?? 'unspecified',
        birth_date: data.birth_date ?? null,
        height_cm: data.height_cm,
        weight_kg: data.weight_kg,
        body_fat_percent: data.body_fat_percent,
      });
    } else {
      setProfile((p) => ({ ...p, user_id: uid }));
    }
  };

  const fetchActivity = async (uid: string) => {
    const { data, error } = await supabase
      .from('user_activity_levels')
      .select('activity_level')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) {
      if (!/relation .* does not exist/i.test(error.message)) setError(error.message);
      return;
    }
    if (data?.activity_level) setActivityLevel(data.activity_level as ActivityLevel);
  };

  const fetchGoals = async (uid: string) => {
    const { data, error } = await supabase
      .from('user_goals')
      .select('id, goal_key, label')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });

    if (error) {
      if (!/relation .* does not exist/i.test(error.message)) setError(error.message);
      return;
    }
    setGoals(data ?? []);
  };

  const fetchRecent = async (uid: string) => {
    const { data, error } = await supabase
      .from('body_measurements')
      .select(
        'id, measured_at, weight_kg, body_fat_percent, chest_cm, waist_cm, hips_cm, biceps_cm, thigh_cm, calf_cm, neck_cm, waist_navel_cm, waist_narrow_cm, shoulders_cm, notes'
      )
      .eq('user_id', uid)
      .order('measured_at', { ascending: false })
      .limit(20);

    if (error) {
      setError(error.message);
      return;
    }
    setRecent(data ?? []);
    // מובייל: ברירת מחדל – רק האחרונה פתוחה
    if (data && data.length > 0) setOpenMobileMeasId(data[0].id);
  };

  // ----- שמירת פרופיל -----
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setError(null);

    const payload = {
      user_id: userId,
      full_name: emptyToNull(profile.full_name),
      gender: profile.gender,
      birth_date: emptyToNull(profile.birth_date),
      height_cm: toNumOrNull(profile.height_cm),
      weight_kg: toNumOrNull(profile.weight_kg),
      body_fat_percent: toNumOrNull(profile.body_fat_percent),
    };

    const { error } = await supabase.from('profiles').upsert(payload, {
      onConflict: 'user_id',
    });

    setSaving(false);
    if (error) setError(error.message);
  };

  // ----- פעילות -----
  const saveActivityLevel = async () => {
    if (!userId || !activityLevel) return;
    setSavingActivityTrue();
    setError(null);

    const { error } = await supabase.from('user_activity_levels').upsert(
      { user_id: userId, activity_level: activityLevel },
      { onConflict: 'user_id' }
    );

    setSavingActivity(false);
    if (error) setError(error.message);
  };
  function setSavingActivityTrue(){ setSavingActivity(true); }

  // ----- מטרות -----
  const isGoalChecked = (key: string) => goals.some((g) => g.goal_key === key);

  const toggleKnownGoal = async (key: string, label: string) => {
    if (!userId) return;
    setGoalsBusy(true);
    setError(null);

    const existing = goals.find((g) => g.goal_key === key);
    if (existing) {
      const { error } = await supabase.from('user_goals').delete().eq('id', existing.id);
      if (error) setError(error.message);
      else setGoals((prev) => prev.filter((g) => g.id !== existing.id));
    } else {
      const { data, error } = await supabase
        .from('user_goals')
        .insert({ user_id: userId, goal_key: key, label })
        .select('id, goal_key, label')
        .single();
      if (error) setError(error.message);
      else if (data) setGoals((prev) => [...prev, data]);
    }

    setGoalsBusy(false);
  };

  const removeGoal = async (goalId: number) => {
    if (!userId) return;
    setGoalsBusy(true);
    const { error } = await supabase.from('user_goals').delete().eq('id', goalId);
    setGoalsBusy(false);
    if (error) setError(error.message);
    else setGoals((prev) => prev.filter((g) => g.id !== goalId));
  };

  // ----- הוספת מדידה -----
  const addMeasurement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setAddingMeas(true);
    setError(null);

    const payload = {
      user_id: userId,
      weight_kg: toNumOrNull(meas.weight_kg),
      body_fat_percent: toNumOrNull(meas.body_fat_percent),

      chest_cm: toNumOrNull(meas.chest_cm),
      // לא כותבים waist_cm (legacy). נשאר להצגה אחורית בלבד.
      hips_cm: toNumOrNull(meas.hips_cm),
      biceps_cm: toNumOrNull(meas.biceps_cm),
      thigh_cm: toNumOrNull(meas.thigh_cm),
      calf_cm: toNumOrNull(meas.calf_cm),

      neck_cm: toNumOrNull(meas.neck_cm),
      waist_navel_cm: toNumOrNull(meas.waist_navel_cm),
      waist_narrow_cm: toNumOrNull(meas.waist_narrow_cm),
      shoulders_cm: toNumOrNull(meas.shoulders_cm),

      notes: emptyToNull(meas.notes),
    };

    const { error } = await supabase.from('body_measurements').insert(payload);

    setAddingMeas(false);
    if (error) {
      setError(error.message);
      return;
    }

    setMeas({
      weight_kg: null,
      body_fat_percent: null,
      chest_cm: null,
      waist_cm: null,
      hips_cm: null,
      biceps_cm: null,
      thigh_cm: null,
      calf_cm: null,
      neck_cm: null,
      waist_navel_cm: null,
      waist_narrow_cm: null,
      shoulders_cm: null,
      notes: null,
    });
    if (userId) await fetchRecent(userId);
  };

  if (loading) {
    return <p className="opacity-70">טוען…</p>;
  }

  // דגלים לפי מגדר – לשימוש בתגיות "מומלץ לנשים"
  const female = profile.gender === 'female';

  return (
    <div className="mx-auto max-w-4xl space-y-8" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">פרופיל מתאמן</h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          עדכון פרטים בסיסיים, פעילות ומטרות, ומדידות מעקב.
        </p>
      </header>

      {/* ==== Tabs header ==== */}
      <nav
        className="inline-flex rounded-lg ring-1 ring-black/10 dark:ring-white/10 overflow-hidden"
        role="tablist"
        aria-label="תצוגות פרופיל"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'profile'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('profile')}
        >
          פרטים אישיים
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'activity'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'activity'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('activity')}
        >
          פעילות ומטרות
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'measurements'}
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'measurements'
              ? 'bg-foreground text-background'
              : 'bg-background text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]'
          }`}
          onClick={() => setActiveTab('measurements')}
        >
          עדכון מדידות
        </button>
      </nav>

      {/* ==== Tabs body ==== */}
      <div className="relative">
        {activeTab === 'profile' && (
          <SectionCard title="פרטים אישיים">
            <form onSubmit={saveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField
                label="שם מלא"
                value={profile.full_name ?? ''}
                onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))}
                className="md:col-span-2"
                placeholder="לדוגמה: ישראל ישראלי"
              />

              <SelectField
                label="מין"
                value={profile.gender}
                onChange={(v) => setProfile((p) => ({ ...p, gender: v as Gender }))}
                options={[
                  { value: 'unspecified', label: 'לא מצוין' },
                  { value: 'male', label: 'זכר' },
                  { value: 'female', label: 'נקבה' },
                  { value: 'other', label: 'אחר' },
                ]}
              />
              <TextField
                label="תאריך לידה"
                type="date"
                value={profile.birth_date ?? ''}
                onChange={(v) => setProfile((p) => ({ ...p, birth_date: v }))}
              />

              <NumberField
                label="גובה (ס״מ)"
                value={profile.height_cm}
                onChange={(v) => setProfile((p) => ({ ...p, height_cm: v }))}
                hint="משמש לנוסחאות הערכת אחוז שומן (US Navy) וליחס מותן/גובה."
              />
              <NumberField
                label="משקל (ק״ג)"
                value={profile.weight_kg}
                onChange={(v) => setProfile((p) => ({ ...p, weight_kg: v }))}
                hint="בבוקר, אחרי שירותים ולפני אוכל/קפה – למדידה עקבית."
              />
              <NumberField
                label="אחוז שומן (%)"
                value={profile.body_fat_percent}
                onChange={(v) => setProfile((p) => ({ ...p, body_fat_percent: v }))}
                hint="לא חובה. גם בלי זה נבין מגמות לפי היקפים."
              />

              <div className="md:col-span-2">
                <button
                  disabled={saving}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50 w-full md:w-auto"
                >
                  {saving ? 'שומר…' : 'שמור פרטים'}
                </button>
              </div>
            </form>
          </SectionCard>
        )}

        {activeTab === 'activity' && (
          <SectionCard title="פעילות ומטרות">
            <div className="grid gap-8">
              {/* פעילות */}
              <div className="grid gap-3">
                <h3 className="font-semibold">רמת פעילות</h3>
                <p className="text-sm opacity-80">בחר/י את עוצמת האימונים השבועית שלך.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RadioTile
                    name="activity"
                    checked={activityLevel === 'sedentary'}
                    onChange={() => setActivityLevel('sedentary')}
                    title="מעט או בכלל לא"
                    subtitle="מעט תנועה ביום, ללא אימונים קבועים"
                  />
                  <RadioTile
                    name="activity"
                    checked={activityLevel === 'light'}
                    onChange={() => setActivityLevel('light')}
                    title="קל (1–3 בשבוע)"
                    subtitle="הליכות/אימונים קלים 1–3 פעמים בשבוע"
                  />
                  <RadioTile
                    name="activity"
                    checked={activityLevel === 'moderate'}
                    onChange={() => setActivityLevel('moderate')}
                    title="בינוני (3–5 בשבוע)"
                    subtitle="אימונים עצימים בינונית 3–5 פעמים בשבוע"
                  />
                  <RadioTile
                    name="activity"
                    checked={activityLevel === 'very_active'}
                    onChange={() => setActivityLevel('very_active')}
                    title="גבוה (6–7 בשבוע)"
                    subtitle="אימונים תכופים/עבודה פיזית"
                  />
                </div>
                <div>
                  <button
                    onClick={saveActivityLevel}
                    disabled={!activityLevel || savingActivity}
                    className="rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
                  >
                    {savingActivity ? 'שומר…' : 'שמור רמת פעילות'}
                  </button>
                </div>
              </div>

              {/* מטרות */}
              <div className="grid gap-3">
                <h3 className="font-semibold">מטרות</h3>
                <p className="text-sm opacity-80">בחר/י מטרה אחת או יותר מתוך האפשרויות הבאות.</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {KNOWN_GOALS.map((g) => (
                    <label
                      key={g.key}
                      className="flex items-center gap-2 rounded-lg border border-black/10 dark:border-white/20 px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={isGoalChecked(g.key)}
                        onChange={() => toggleKnownGoal(g.key, g.label)}
                        disabled={goalsBusy}
                      />
                      <span>{g.label}</span>
                    </label>
                  ))}
                </div>

                {goals.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {goals.map((g) => (
                      <span
                        key={g.id}
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm border border-black/10 dark:border-white/20"
                      >
                        {g.label}
                        <button
                          onClick={() => removeGoal(g.id)}
                          className="opacity-70 hover:opacity-100"
                          aria-label={`הסר ${g.label}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === 'measurements' && (
          <>
            <SectionCard
              title="עדכון מדידות"
              subtitle="למדידה עקבית: בבוקר, אחרי שירותים, לפני אוכל/קפה. אותו סרט, אותה נקודה, אותו לחץ."
            >
              <form
                onSubmit={addMeasurement}
                // יותר גדולות במסכים רחבים, 2 בעמודה במובייל
                className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6 gap-4"
              >
                {/* --- סדר לפי הגוף מלמעלה למטה --- */}
                <MeasurementField
                  label="צוואר (ס״מ)"
                  value={meas.neck_cm ?? null}
                  onChange={(v) => setMeas((m) => ({ ...m, neck_cm: v }))}
                  helpTitle={MEAS_HELP.neck_cm.title}
                  helpText={MEAS_HELP.neck_cm.text}
                  imageSrc={MEAS_IMG.neck_cm}
                />
                <MeasurementField
                  label="כתפיים (ס״מ)"
                  value={meas.shoulders_cm ?? null}
                  onChange={(v) => setMeas((m) => ({ ...m, shoulders_cm: v }))}
                  helpTitle={MEAS_HELP.shoulders_cm.title}
                  helpText={MEAS_HELP.shoulders_cm.text}
                  imageSrc={MEAS_IMG.shoulders_cm}
                />
                <MeasurementField
                  label="חזה (ס״מ)"
                  value={meas.chest_cm}
                  onChange={(v) => setMeas((m) => ({ ...m, chest_cm: v }))}
                  helpTitle={MEAS_HELP.chest_cm.title}
                  helpText={MEAS_HELP.chest_cm.text}
                  imageSrc={MEAS_IMG.chest_cm}
                />
                <MeasurementField
                  label="יד קדמית (ס״מ)"
                  value={meas.biceps_cm}
                  onChange={(v) => setMeas((m) => ({ ...m, biceps_cm: v }))}
                  helpTitle={MEAS_HELP.biceps_cm.title}
                  helpText={MEAS_HELP.biceps_cm.text}
                  imageSrc={MEAS_IMG.biceps_cm}
                />
                <MeasurementField
                  label="מותן – נקודה צרה (ס״מ)"
                  value={meas.waist_narrow_cm ?? (meas.waist_cm ?? null)}
                  onChange={(v) => setMeas((m) => ({ ...m, waist_narrow_cm: v }))}
                  helpTitle={MEAS_HELP.waist_narrow_cm.title}
                  helpText={MEAS_HELP.waist_narrow_cm.text}
                  imageSrc={MEAS_IMG.waist_narrow_cm}
                />
                <MeasurementField
                  label="מותן – טבור (ס״מ)"
                  value={meas.waist_navel_cm ?? null}
                  onChange={(v) => setMeas((m) => ({ ...m, waist_navel_cm: v }))}
                  helpTitle={MEAS_HELP.waist_navel_cm.title}
                  helpText={MEAS_HELP.waist_navel_cm.text}
                  imageSrc={MEAS_IMG.waist_navel_cm}
                />
                <MeasurementField
                  label="ירכיים (ס״מ)"
                  value={meas.hips_cm}
                  onChange={(v) => setMeas((m) => ({ ...m, hips_cm: v }))}
                  helpTitle={MEAS_HELP.hips_cm.title}
                  helpText={MEAS_HELP.hips_cm.text}
                  recommended={female}
                  imageSrc={MEAS_IMG.hips_cm}
                />
                <MeasurementField
                  label="ירך (ס״מ)"
                  value={meas.thigh_cm}
                  onChange={(v) => setMeas((m) => ({ ...m, thigh_cm: v }))}
                  helpTitle={MEAS_HELP.thigh_cm.title}
                  helpText={MEAS_HELP.thigh_cm.text}
                  imageSrc={MEAS_IMG.thigh_cm}
                />
                <MeasurementField
                  label="שוק (ס״מ)"
                  value={meas.calf_cm}
                  onChange={(v) => setMeas((m) => ({ ...m, calf_cm: v }))}
                  helpTitle={MEAS_HELP.calf_cm.title}
                  helpText={MEAS_HELP.calf_cm.text}
                  imageSrc={MEAS_IMG.calf_cm}
                />

                {/* בסוף: משקל ואחוז שומן */}
                <MeasurementField
                  label="משקל (ק״ג)"
                  value={meas.weight_kg}
                  onChange={(v) => setMeas((m) => ({ ...m, weight_kg: v }))}
                  helpTitle={MEAS_HELP.weight_kg.title}
                  helpText={MEAS_HELP.weight_kg.text}
                  imageSrc={MEAS_IMG.weight_kg}
                />
                <MeasurementField
                  label="אחוז שומן (%)"
                  value={meas.body_fat_percent}
                  onChange={(v) => setMeas((m) => ({ ...m, body_fat_percent: v }))}
                  helpTitle={MEAS_HELP.body_fat_percent.title}
                  helpText={MEAS_HELP.body_fat_percent.text}
                  imageSrc={MEAS_IMG.body_fat_percent}
                />

                {/*
                // הוסתר לפי בקשה: "הערות" לא יופיע כרגע
                <TextField
                  label="הערות"
                  value={meas.notes ?? ''}
                  onChange={(v) => setMeas((m) => ({ ...m, notes: v || null }))}
                  className="col-span-2 md:col-span-3 xl:col-span-6"
                  placeholder="עייפות/מחזור/נפיחות/אימון כבד – עוזר להסביר תנודות"
                />
                */}

                <div className="col-span-2 md:col-span-3 lg:col-span-4 2xl:col-span-6">
                  <button
                    disabled={addingMeas}
                    className="inline-flex items-center justify-center rounded-lg px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50 w-full md:w-auto"
                  >
                    {addingMeas ? 'מוסיף…' : 'הוסף מדידה'}
                  </button>
                </div>
              </form>
            </SectionCard>

            {/* רשימת מדידות אחרונות */}
            <SectionCard title="מדידות אחרונות">
              {recent.length === 0 ? (
                <p className="opacity-70">עוד אין מדידות.</p>
              ) : (
                <>
                  {/* מובייל: כרטיסים מתקפלים */}
                  <div className="grid gap-3 md:hidden">
                    {recent.map((r) => {
                      const open = openMobileMeasId === r.id;
                      return (
                        <div
                          key={r.id}
                          className="rounded-lg ring-1 ring-black/10 dark:ring-white/10 overflow-hidden"
                        >
                          <button
                            className="w-full flex items-center justify-between px-3 py-3 text-right"
                            onClick={() =>
                              setOpenMobileMeasId((prev) => (prev === r.id ? null : r.id))
                            }
                            aria-expanded={open}
                            aria-controls={`meas-${r.id}`}
                          >
                            <div className="text-sm font-medium">
                              {fmt.format(new Date(r.measured_at))}
                            </div>
                            <div className={`transform transition ${open ? 'rotate-180' : ''}`}>
                              ▾
                            </div>
                          </button>

                          {open && (
                            <div id={`meas-${r.id}`} className="px-3 pb-3">
                              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                <KV k="משקל" v={num(r.weight_kg)} />
                                <KV k="% שומן" v={num(r.body_fat_percent)} />
                                <KV k="מותן–טבור" v={num(r.waist_navel_cm ?? null)} />
                                <KV k="מותן–צרה" v={num(r.waist_narrow_cm ?? r.waist_cm ?? null)} />
                                <KV k="ירכיים" v={num(r.hips_cm)} />
                                <KV k="חזה" v={num(r.chest_cm)} />
                                <KV k="כתפיים" v={num(r.shoulders_cm ?? null)} />
                                <KV k="יד קדמית" v={num(r.biceps_cm)} />
                                <KV k="ירך" v={num(r.thigh_cm)} />
                                <KV k="שוק" v={num(r.calf_cm)} />
                                <KV k="צוואר" v={num(r.neck_cm ?? null)} />
                                {/* הערות הוסתר */}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* דסקטופ: טבלה */}
                  <div className="hidden md:block overflow-x-auto rounded-lg ring-1 ring-black/10 dark:ring-white/10">
                    <table className="min-w-full text-sm">
                      <thead className="bg-black/5 dark:bg-white/10">
                        <tr className="text-right">
                          <Th>תאריך</Th>
                          <Th>משקל</Th>
                          <Th>% שומן</Th>
                          <Th>מותן–טבור</Th>
                          <Th>מותן–צרה</Th>
                          <Th>ירכיים</Th>
                          <Th>חזה</Th>
                          <Th>כתפיים</Th>
                          <Th>יד קדמית</Th>
                          <Th>ירך</Th>
                          <Th>שוק</Th>
                          <Th>צוואר</Th>
                          {/* <Th>הערות</Th> הוסתר */}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/10 dark:divide-white/10">
                        {recent.map((r) => (
                          <tr key={r.id}>
                            <Td>{fmt.format(new Date(r.measured_at))}</Td>
                            <Td>{num(r.weight_kg)}</Td>
                            <Td>{num(r.body_fat_percent)}</Td>
                            <Td>{num(r.waist_navel_cm ?? null)}</Td>
                            <Td>{num(r.waist_narrow_cm ?? r.waist_cm ?? null)}</Td>
                            <Td>{num(r.hips_cm)}</Td>
                            <Td>{num(r.chest_cm)}</Td>
                            <Td>{num(r.shoulders_cm ?? null)}</Td>
                            <Td>{num(r.biceps_cm)}</Td>
                            <Td>{num(r.thigh_cm)}</Td>
                            <Td>{num(r.calf_cm)}</Td>
                            <Td>{num(r.neck_cm ?? null)}</Td>
                            {/* <Td className="max-w-[16rem] truncate">{r.notes ?? ''}</Td> */}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </SectionCard>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
// ===== SECTION 4 END =====

// ===== SECTION 5 TITLE: Layout Helpers (SectionCard) =====
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
// ===== SECTION 5 END =====

// ===== SECTION 6 TITLE: Small Key-Value for Mobile Cards =====
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="opacity-70">{k}</span>
      <span className="font-medium">{v || '-'}</span>
    </div>
  );
}
// ===== SECTION 6 END =====

// ===== SECTION 7 TITLE: Form Inputs & MeasurementField =====
function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  className = '',
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  hint?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <input
        inputMode="decimal"
        type="number"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
        step="0.01"
      />
      {hint && <span className="text-xs opacity-70">{hint}</span>}
    </label>
  );
}

// MeasurementField = שדה מדידה עם תמונה + אייקון הסבר
function MeasurementField({
  label,
  value,
  onChange,
  helpTitle,
  helpText,
  imageSrc,
  recommended = false,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  helpTitle: string;
  helpText: string;
  imageSrc: string;
  recommended?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="grid gap-2 rounded-lg ring-1 ring-black/10 dark:ring-white/10 p-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-1">
          {recommended && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-foreground/10 text-foreground">
              מומלץ לנשים
            </span>
          )}
          <button
            type="button"
            aria-label="מידע"
            onClick={() => setOpen((o) => !o)}
            className="relative rounded-full w-6 h-6 text-xs flex items-center justify-center ring-1 ring-black/10 dark:ring-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            title="הסבר קצר"
          >
            ⓘ
            {open && (
              <div
                className="absolute z-20 top-full mt-2 right-0 w-64 rounded-md bg-background ring-1 ring-black/10 dark:ring-white/10 p-3 shadow-lg"
                role="dialog"
              >
                <div className="text-xs font-semibold mb-1">{helpTitle}</div>
                <div className="text-xs opacity-80 leading-relaxed">{helpText}</div>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* חדש: תמיד תמונה מעל, קלט מתחת. תמונה מלאה כדי שלא תהיה קטנה מדי */}
      <div className="grid gap-3">
        <img
          src={imageSrc}
          alt={`הדגמה: ${label}`}
          className="w-full rounded-md object-cover aspect-[4/3] md:aspect-[3/2]"
          loading="lazy"
        />
        <input
          inputMode="decimal"
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                     focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
          step="0.01"
        />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right
                   focus-visible:outline-none focus:ring-2 focus:ring-foreground/40"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
// ===== SECTION 7 END =====

/* Keep table cells consistent with app design */
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-semibold whitespace-nowrap">{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 whitespace-nowrap ${className}`}>{children}</td>;
}
// ===== SECTION 8 END =====

// ===== SECTION 9 TITLE: Radio Tile (Activity) =====
function RadioTile({
  name,
  checked,
  onChange,
  title,
  subtitle,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
}) {
  return (
    <label
      className={`rounded-lg border px-3 py-2 cursor-pointer ${
        checked ? 'border-foreground' : 'border-black/10 dark:border-white/20'
      }`}
    >
      <div className="flex items-start gap-3">
        <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1" />
        <div>
          <div className="font-medium">{title}</div>
          {subtitle && <div className="text-xs opacity-70">{subtitle}</div>}
        </div>
      </div>
    </label>
  );
}
// ===== SECTION 9 END =====

// ===== SECTION 10 TITLE: Utils =====
function toNumOrNull(v: any): number | null {
  if (v === '' || v === null || typeof v === 'undefined') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function emptyToNull(v: any) {
  return v === '' ? null : v;
}
function num(v: number | null | undefined) {
  return v === null || typeof v === 'undefined' ? '' : String(v);
}
// ===== SECTION 10 END =====
