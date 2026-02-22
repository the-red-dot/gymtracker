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
const KNOWN_GOALS: { key: string; label: string; icon: string }[] = [
  { key: 'bulking', label: 'BULKING – עלייה במסת שריר', icon: '💪' },
  { key: 'cutting', label: 'CUTTING – חיטוב וירידה בשומן', icon: '🔥' },
  { key: 'recomp',  label: 'RECOMP – ריקומפ (בנייה והורדה במקביל)', icon: '⚖️' },
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

// תמונות למדידות
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
    waist_cm: null, // legacy
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
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fmtDate = useMemo(() => new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }), []);
  const fmtTime = useMemo(() => new Intl.DateTimeFormat('he-IL', { timeStyle: 'short' }), []);

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
    setSavingActivity(true);
    setError(null);

    const { error } = await supabase.from('user_activity_levels').upsert(
      { user_id: userId, activity_level: activityLevel },
      { onConflict: 'user_id' }
    );

    setSavingActivity(false);
    if (error) setError(error.message);
  };

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
      weight_kg: null, body_fat_percent: null, chest_cm: null, waist_cm: null, hips_cm: null,
      biceps_cm: null, thigh_cm: null, calf_cm: null, neck_cm: null, waist_navel_cm: null,
      waist_narrow_cm: null, shoulders_cm: null, notes: null,
    });
    if (userId) await fetchRecent(userId);
  };

  // ----- מחיקת מדידה בודדת -----
  const deleteMeasurement = async (id: number, whenISO: string) => {
    if (!userId) return;
    const dateStr = fmtDate.format(new Date(whenISO));
    if (!confirm(`למחוק את המדידה מתאריך ${dateStr}? פעולה זו בלתי הפיכה.`)) return;

    setDeletingId(id);
    setError(null);
    const { error } = await supabase.from('body_measurements').delete().eq('user_id', userId).eq('id', id);

    setDeletingId(null);
    if (error) {
      setError(error.message);
      return;
    }
    setRecent((prev) => prev.filter((m) => m.id !== id));
  };

  if (loading) {
    return <div className="p-8 text-center opacity-50">טוען פרופיל...</div>;
  }

  const female = profile.gender === 'female';

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300" dir="rtl">
      
      {/* Header Profile App Style */}
      <div className="flex items-center gap-4 px-2">
         <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-md">
            {profile.full_name ? profile.full_name.charAt(0) : '👤'}
         </div>
         <div>
            <h1 className="text-2xl font-bold tracking-tight">{profile.full_name || 'פרופיל אישי'}</h1>
            <p className="text-sm opacity-70">
              עדכון נתונים, מטרות ומדידות מעקב
            </p>
         </div>
      </div>

      {/* App-like Tab Navigation */}
      <div className="bg-gray-100 dark:bg-white/5 p-1 rounded-2xl flex w-full overflow-hidden shadow-inner sticky top-16 z-20">
        {[
          { id: 'profile', label: 'פרופיל' },
          { id: 'activity', label: 'מטרות' },
          { id: 'measurements', label: 'מדידות' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex-1 text-sm font-medium py-2.5 rounded-xl transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="pt-2">
        
        {/* ===================== TAB: PROFILE ===================== */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-5 md:p-6 shadow-sm border border-black/5 dark:border-white/5">
              <form onSubmit={saveProfile} className="space-y-5">
                
                <div className="space-y-1">
                   <h3 className="font-bold">פרטים בסיסיים</h3>
                   <p className="text-xs opacity-60">הפרטים הכלליים שלך לחישובים ותצוגה.</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextField
                    label="שם מלא"
                    value={profile.full_name ?? ''}
                    onChange={(v) => setProfile((p) => ({ ...p, full_name: v }))}
                    placeholder="ישראל ישראלי"
                  />
                  <SelectField
                    label="מין (רלוונטי לחישובי TDEE/Navy)"
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
                </div>

                <div className="space-y-1 pt-4 border-t border-black/5 dark:border-white/5">
                   <h3 className="font-bold">נתוני גוף התחלתיים</h3>
                   <p className="text-xs opacity-60">הבסיס לחישוב BMR ו-TDEE. מומלץ בהמשך לעדכן דרך טאב המדידות.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <NumberField
                    label="גובה (ס״מ)"
                    value={profile.height_cm}
                    onChange={(v) => setProfile((p) => ({ ...p, height_cm: v }))}
                  />
                  <NumberField
                    label="משקל נוכחי (ק״ג)"
                    value={profile.weight_kg}
                    onChange={(v) => setProfile((p) => ({ ...p, weight_kg: v }))}
                  />
                  <NumberField
                    label="אחוז שומן (%)"
                    value={profile.body_fat_percent}
                    onChange={(v) => setProfile((p) => ({ ...p, body_fat_percent: v }))}
                    placeholder="לא חובה"
                  />
                </div>

                <div className="pt-4 flex justify-end">
                  <button
                    disabled={saving}
                    className="w-full md:w-auto px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition disabled:opacity-50"
                  >
                    {saving ? 'שומר שינויים...' : 'שמור פרופיל'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ===================== TAB: ACTIVITY & GOALS ===================== */}
        {activeTab === 'activity' && (
          <div className="space-y-4">
            {/* Activity Card */}
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-5 md:p-6 shadow-sm border border-black/5 dark:border-white/5">
              <div className="space-y-1 mb-4">
                 <h3 className="font-bold text-lg">רמת פעילות שבועית</h3>
                 <p className="text-xs opacity-60">משפיע ישירות על כמות הקלוריות היומית המומלצת (TDEE).</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <RadioTile
                  name="activity"
                  checked={activityLevel === 'sedentary'}
                  onChange={() => setActivityLevel('sedentary')}
                  title="מעט או בכלל לא"
                  subtitle="יושבני, ללא אימונים קבועים"
                  icon="🛋️"
                />
                <RadioTile
                  name="activity"
                  checked={activityLevel === 'light'}
                  onChange={() => setActivityLevel('light')}
                  title="קל (1–3 בשבוע)"
                  subtitle="הליכות / אימונים קלים"
                  icon="🚶"
                />
                <RadioTile
                  name="activity"
                  checked={activityLevel === 'moderate'}
                  onChange={() => setActivityLevel('moderate')}
                  title="בינוני (3–5 בשבוע)"
                  subtitle="אימונים עצימים בינונית"
                  icon="🏃"
                />
                <RadioTile
                  name="activity"
                  checked={activityLevel === 'very_active'}
                  onChange={() => setActivityLevel('very_active')}
                  title="גבוה (6–7 בשבוע)"
                  subtitle="אימונים תכופים / עבודה פיזית"
                  icon="🔥"
                />
              </div>
              
              <div className="flex justify-end">
                <button
                  onClick={saveActivityLevel}
                  disabled={!activityLevel || savingActivity}
                  className="w-full md:w-auto px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl font-bold hover:opacity-90 transition disabled:opacity-50"
                >
                  {savingActivity ? 'שומר...' : 'שמור רמת פעילות'}
                </button>
              </div>
            </div>

            {/* Goals Card */}
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-5 md:p-6 shadow-sm border border-black/5 dark:border-white/5">
              <div className="space-y-1 mb-4">
                 <h3 className="font-bold text-lg">המטרות שלך</h3>
                 <p className="text-xs opacity-60">בחר את המטרה המרכזית שלך (אפשר לבחור כמה, הדיאטנית תתחשב בזה).</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {KNOWN_GOALS.map((g) => {
                  const checked = isGoalChecked(g.key);
                  return (
                    <label
                      key={g.key}
                      className={`relative flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-all ${
                        checked 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500/20' 
                          : 'border-black/5 dark:border-white/5 hover:border-black/20 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={() => toggleKnownGoal(g.key, g.label)}
                        disabled={goalsBusy}
                      />
                      <span className="text-2xl">{g.icon}</span>
                      <span className={`font-semibold text-sm leading-tight ${checked ? 'text-indigo-900 dark:text-indigo-100' : ''}`}>
                        {g.label.split('–')[0].trim()}<br/>
                        <span className="text-xs opacity-70 font-normal">{g.label.split('–')[1]?.trim()}</span>
                      </span>
                      {checked && (
                        <div className="absolute top-2 left-2 text-indigo-500">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        </div>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: MEASUREMENTS ===================== */}
        {activeTab === 'measurements' && (
          <div className="space-y-6">
            
            {/* Add New Measurement Card */}
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-5 shadow-sm border border-black/5 dark:border-white/5">
              <div className="mb-4">
                 <h3 className="font-bold text-lg">תיעוד מדידה חדשה</h3>
                 <p className="text-xs opacity-60">הזן נתונים בבוקר, אחרי שירותים ולפני אוכל. אין צורך למלא הכל בכל פעם.</p>
              </div>

              <form onSubmit={addMeasurement} className="space-y-5">
                
                {/* Core Stats First */}
                <div className="grid grid-cols-2 gap-3 pb-4 border-b border-black/5 dark:border-white/5">
                   <MeasurementField
                      label="משקל"
                      value={meas.weight_kg}
                      onChange={(v: number | null) => setMeas((m) => ({ ...m, weight_kg: v }))}
                      helpTitle={MEAS_HELP.weight_kg.title}
                      helpText={MEAS_HELP.weight_kg.text}
                      imageSrc={MEAS_IMG.weight_kg}
                      unit="ק״ג"
                    />
                    <MeasurementField
                      label="אחוז שומן"
                      value={meas.body_fat_percent}
                      onChange={(v: number | null) => setMeas((m) => ({ ...m, body_fat_percent: v }))}
                      helpTitle={MEAS_HELP.body_fat_percent.title}
                      helpText={MEAS_HELP.body_fat_percent.text}
                      imageSrc={MEAS_IMG.body_fat_percent}
                      unit="%"
                    />
                </div>

                {/* Optional Tapes Grid - Dense Mobile Layout */}
                <div className="pt-2">
                  <p className="text-xs font-bold opacity-50 mb-3 uppercase tracking-wider">היקפים אופציונליים (ס"מ)</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    <MeasurementField label="צוואר" value={meas.neck_cm ?? null} onChange={(v: number | null) => setMeas((m) => ({ ...m, neck_cm: v }))} helpTitle={MEAS_HELP.neck_cm.title} helpText={MEAS_HELP.neck_cm.text} imageSrc={MEAS_IMG.neck_cm} />
                    <MeasurementField label="כתפיים" value={meas.shoulders_cm ?? null} onChange={(v: number | null) => setMeas((m) => ({ ...m, shoulders_cm: v }))} helpTitle={MEAS_HELP.shoulders_cm.title} helpText={MEAS_HELP.shoulders_cm.text} imageSrc={MEAS_IMG.shoulders_cm} />
                    <MeasurementField label="חזה" value={meas.chest_cm} onChange={(v: number | null) => setMeas((m) => ({ ...m, chest_cm: v }))} helpTitle={MEAS_HELP.chest_cm.title} helpText={MEAS_HELP.chest_cm.text} imageSrc={MEAS_IMG.chest_cm} />
                    <MeasurementField label="יד קדמית" value={meas.biceps_cm} onChange={(v: number | null) => setMeas((m) => ({ ...m, biceps_cm: v }))} helpTitle={MEAS_HELP.biceps_cm.title} helpText={MEAS_HELP.biceps_cm.text} imageSrc={MEAS_IMG.biceps_cm} />
                    <MeasurementField label="מותן (צרה)" value={meas.waist_narrow_cm ?? null} onChange={(v: number | null) => setMeas((m) => ({ ...m, waist_narrow_cm: v }))} helpTitle={MEAS_HELP.waist_narrow_cm.title} helpText={MEAS_HELP.waist_narrow_cm.text} imageSrc={MEAS_IMG.waist_narrow_cm} />
                    <MeasurementField label="מותן (טבור)" value={meas.waist_navel_cm ?? null} onChange={(v: number | null) => setMeas((m) => ({ ...m, waist_navel_cm: v }))} helpTitle={MEAS_HELP.waist_navel_cm.title} helpText={MEAS_HELP.waist_navel_cm.text} imageSrc={MEAS_IMG.waist_navel_cm} />
                    <MeasurementField label="ירכיים/אגן" value={meas.hips_cm} onChange={(v: number | null) => setMeas((m) => ({ ...m, hips_cm: v }))} helpTitle={MEAS_HELP.hips_cm.title} helpText={MEAS_HELP.hips_cm.text} recommended={female} imageSrc={MEAS_IMG.hips_cm} />
                    <MeasurementField label="ירך" value={meas.thigh_cm} onChange={(v: number | null) => setMeas((m) => ({ ...m, thigh_cm: v }))} helpTitle={MEAS_HELP.thigh_cm.title} helpText={MEAS_HELP.thigh_cm.text} imageSrc={MEAS_IMG.thigh_cm} />
                    <MeasurementField label="שוק" value={meas.calf_cm} onChange={(v: number | null) => setMeas((m) => ({ ...m, calf_cm: v }))} helpTitle={MEAS_HELP.calf_cm.title} helpText={MEAS_HELP.calf_cm.text} imageSrc={MEAS_IMG.calf_cm} />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    disabled={addingMeas}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold shadow-md hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <span>{addingMeas ? 'שומר...' : '➕ הוסף מדידה ליומן'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* History List (App Style Cards) */}
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-5 shadow-sm border border-black/5 dark:border-white/5">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <span>📅</span> היסטוריית מדידות
              </h3>
              
              {recent.length === 0 ? (
                <div className="text-center py-8 opacity-50 text-sm bg-black/5 dark:bg-white/5 rounded-2xl">
                  עוד אין מדידות מוקלטות.
                </div>
              ) : (
                <div className="grid gap-3">
                  {recent.map((r) => (
                    <div key={r.id} className="relative bg-gray-50 dark:bg-black/20 border border-black/5 dark:border-white/5 rounded-2xl p-4 flex flex-col gap-3 group">
                      
                      {/* Header Date & Delete */}
                      <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
                         <div className="font-bold text-sm text-indigo-900 dark:text-indigo-200">
                           {fmtDate.format(new Date(r.measured_at))}
                           <span className="text-xs opacity-50 font-normal mr-2">
                             {fmtTime.format(new Date(r.measured_at))}
                           </span>
                         </div>
                         <button
                            onClick={() => deleteMeasurement(r.id, r.measured_at)}
                            disabled={deletingId === r.id}
                            className="text-gray-400 hover:text-red-500 p-1 transition-colors"
                            aria-label="מחק"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                          </button>
                      </div>

                      {/* Main Stats */}
                      <div className="flex gap-4 items-center">
                         {r.weight_kg != null && (
                           <div className="flex flex-col">
                             <span className="text-[10px] opacity-60 font-bold uppercase">משקל</span>
                             <span className="font-black text-xl tabular-nums">{r.weight_kg}<span className="text-xs font-medium opacity-50">kg</span></span>
                           </div>
                         )}
                         {r.body_fat_percent != null && (
                           <>
                             <div className="w-px h-8 bg-black/10 dark:bg-white/10"></div>
                             <div className="flex flex-col">
                               <span className="text-[10px] opacity-60 font-bold uppercase">שומן</span>
                               <span className="font-black text-xl tabular-nums">{r.body_fat_percent}<span className="text-xs font-medium opacity-50">%</span></span>
                             </div>
                           </>
                         )}
                      </div>

                      {/* Optional Tapes (Collapsible visually for cleanliness) */}
                      {Object.keys(r).some(k => k.includes('_cm') && (r as any)[k] != null) && (
                        <div className="pt-2 mt-1">
                           <div className="flex flex-wrap gap-1.5">
                              {['waist_navel_cm', 'waist_narrow_cm', 'chest_cm', 'hips_cm', 'biceps_cm', 'thigh_cm', 'calf_cm', 'neck_cm', 'shoulders_cm'].map(k => {
                                 const val = (r as any)[k];
                                 if (val == null) return null;
                                 const name = MEAS_HELP[k]?.title?.replace(' (ס״מ)', '') || k;
                                 return (
                                   <div key={k} className="bg-white dark:bg-neutral-800 border border-black/5 dark:border-white/5 rounded-md px-2 py-1 flex items-center gap-1.5 text-[11px]">
                                      <span className="opacity-60">{name}</span>
                                      <span className="font-bold tabular-nums">{val}</span>
                                   </div>
                                 );
                              })}
                           </div>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      {error && <div className="fixed bottom-4 left-4 right-4 bg-red-600 text-white p-3 rounded-xl text-sm text-center shadow-lg z-50 animate-in slide-in-from-bottom-5">{error}</div>}
    </div>
  );
}
// ===== SECTION 4 END =====

// ===== SECTION 5 TITLE: Shared Components =====

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}

function TextField({ label, value, onChange, type = 'text', placeholder, className = '' }: TextFieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-bold opacity-70 ml-1">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
      />
    </label>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}

function SelectField({ label, value, onChange, options, className = '' }: SelectFieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-bold opacity-70 ml-1">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-4 text-gray-500 opacity-50">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
        </div>
      </div>
    </label>
  );
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
  className?: string;
  placeholder?: string;
}

function NumberField({ label, value, onChange, hint, className = '', placeholder }: NumberFieldProps) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-bold opacity-70 ml-1">{label}</span>
      <input
        inputMode="decimal"
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full bg-gray-50 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
        step="0.01"
      />
      {hint && <span className="text-[10px] opacity-50 px-1 leading-tight">{hint}</span>}
    </label>
  );
}

interface RadioTileProps {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle?: string;
  icon: string;
}

function RadioTile({ name, checked, onChange, title, subtitle, icon }: RadioTileProps) {
  return (
    <label
      className={`relative flex flex-col p-4 rounded-2xl border cursor-pointer transition-all ${
        checked 
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500/20' 
          : 'border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <div className={`font-bold text-sm ${checked ? 'text-indigo-900 dark:text-indigo-100' : ''}`}>{title}</div>
      </div>
      <div className="text-xs opacity-60 leading-snug pr-7">{subtitle}</div>
      {checked && (
        <div className="absolute top-4 left-4 text-indigo-500">
           <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
        </div>
      )}
    </label>
  );
}

interface MeasurementFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  helpTitle: string;
  helpText: string;
  imageSrc: string;
  recommended?: boolean;
  unit?: string;
}

// Measurement Field with visual cue
function MeasurementField({ label, value, onChange, helpTitle, helpText, imageSrc, recommended = false, unit = 'cm' }: MeasurementFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl p-2 relative group">
      
      <div className="flex justify-between items-start mb-2 px-1">
        <div className="flex flex-col">
          <span className="text-[11px] font-bold opacity-80">{label}</span>
          {recommended && <span className="text-[9px] text-pink-500 font-bold tracking-tight">מומלץ לנשים</span>}
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-5 h-5 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-[10px] opacity-50 hover:opacity-100 transition-opacity"
        >
          ?
        </button>
      </div>

      <div className="relative w-full aspect-square rounded-xl overflow-hidden mb-2 border border-black/5 dark:border-white/5 bg-white mix-blend-multiply dark:mix-blend-normal">
         {/* eslint-disable-next-line @next/next/no-img-element */}
         <img src={imageSrc} alt={label} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy" />
         
         {/* Tooltip Overlay */}
         {open && (
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm p-3 flex flex-col justify-center text-white text-right animate-in fade-in z-10" onClick={()=>setOpen(false)}>
             <div className="text-xs font-bold text-indigo-300 mb-1">{helpTitle}</div>
             <div className="text-[10px] leading-relaxed opacity-90">{helpText}</div>
           </div>
         )}
      </div>

      <div className="relative">
        <input
          inputMode="decimal"
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full bg-white dark:bg-neutral-800 border border-black/10 dark:border-white/10 rounded-xl pl-6 pr-3 py-2 text-sm font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
          placeholder="—"
          step="0.01"
        />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold opacity-40 pointer-events-none">{unit}</span>
      </div>
    </div>
  );
}

// ===== SECTION 6 TITLE: Utils =====
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
// ===== SECTION 6 END =====