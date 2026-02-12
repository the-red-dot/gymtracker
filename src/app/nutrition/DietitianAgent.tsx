'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SectionCard } from './ui';

// Types - הוספנו תמיכה לעמודות החדשות
type DietitianProfile = {
  medical_info: string; // מכיל מידע רפואי + תרופות/תוספים
  dietary_preferences: string[];
  schedule_info: { wake_up: string; sleep: string };
  cooking_preference: 'quick' | 'chef';
  last_daily_analysis_html?: string;
  last_weekly_analysis_html?: string;
};

type DailyTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

type MealPlan = {
  days: {
    day_title: string;
    daily_totals: DailyTotals;
    daily_reasoning: string;
    meals: {
      type: string;
      time: string;
      name: string;
      calories: number;
      protein: number;
      desc: string;
    }[];
  }[];
  summary: string;
};

type Recommendation = {
  meal_name: string;
  reasoning: string;
  preparation_time: string;
  macros: { calories: number; protein: number; carbs: number; fat: number };
  recipe_outline: string;
};

type Recipe = {
  ingredients: string[];
  instructions: string[];
  prep_time: string;
  tips: string;
};

export default function DietitianAgent({ userId, logs, userGoals, userProfileData, weightHistory }: { 
    userId: string; 
    logs: any[]; 
    userGoals: any[];
    userProfileData: any; // Height, Weight, gender, etc.
    weightHistory: any[]; 
}) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'onboarding' | 'dashboard'>('dashboard');
  const [profile, setProfile] = useState<DietitianProfile | null>(null);
  
  // Settings & Targets
  const [calculatedTargets, setCalculatedTargets] = useState<DailyTotals>({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  const [realTimeStatus, setRealTimeStatus] = useState<any>(null); // שומר את השורה המלאה מ-user_nutrition_targets
  
  // Data States
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  
  // Action States & UI Modes
  const [analyzing, setAnalyzing] = useState(false); // General loading state for analysis
  const [analysisMode, setAnalysisMode] = useState<'daily' | 'weekly' | null>(null); // Track which analysis is being generated
  const [displayMode, setDisplayMode] = useState<'daily' | 'weekly'>('daily'); // טאב פעיל למעבר בין הסקירות
  
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [loadingRecipe, setLoadingRecipe] = useState<string | null>(null);
  const [activeRecipe, setActiveRecipe] = useState<{name: string, data: Recipe} | null>(null);
  
  // Feedback States
  const [usedModel, setUsedModel] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<DietitianProfile>({
    medical_info: '',
    dietary_preferences: [],
    schedule_info: { wake_up: '07:00', sleep: '23:00' },
    cooking_preference: 'quick'
  });

  useEffect(() => {
    loadAllData();
  }, [userId]);

  async function loadAllData() {
    setLoading(true);
    await Promise.all([
        loadDietitianProfile(),
        loadMealPlan(),
        loadFavorites(),
        loadAndCalcTargets()
    ]);
    setLoading(false);
  }

  async function loadDietitianProfile() {
    const { data } = await supabase.from('user_dietitian_profile').select('*').eq('user_id', userId).maybeSingle();
    if (data) {
      setProfile(data);
      setFormData(data);
      setView('dashboard');
      // Set initial view based on what exists
      if (data.last_daily_analysis_html) {
          setDisplayMode('daily');
      } else if (data.last_weekly_analysis_html) {
          setDisplayMode('weekly');
      }
    } else {
      setView('onboarding');
    }
  }

  async function loadMealPlan() {
    const { data } = await supabase.from('user_meal_plans').select('plan_data').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (data?.plan_data) setMealPlan(data.plan_data);
  }

  async function loadFavorites() {
    const { data } = await supabase.from('user_favorite_meals').select('*').eq('user_id', userId);
    if (data) setFavorites(data);
  }

  // טעינת יעדים - נותן עדיפות לטבלת user_nutrition_targets אם קיימת
  async function loadAndCalcTargets() {
      const { data: dbStatus } = await supabase
        .from('user_nutrition_targets')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dbStatus) {
          setRealTimeStatus(dbStatus);
          setCalculatedTargets({
              calories: dbStatus.target_calories || 0,
              protein: dbStatus.target_protein_g || 0,
              carbs: dbStatus.target_carbs_g || 0,
              fat: dbStatus.target_fat_g || 0
          });
          return;
      }

      // Fallback
      const weight = weightHistory[0]?.weight_kg || userProfileData.weight_kg || 75;
      const { data: calSettings } = await supabase.from('user_calorie_settings').select('deficit_pct').eq('user_id', userId).maybeSingle();
      const { data: protSettings } = await supabase.from('user_protein_settings').select('grams_per_kg').eq('user_id', userId).maybeSingle();

      const bmr = 24 * weight; 
      let activityFactor = 1.2;
      if (userProfileData.activityLevel === 'moderate') activityFactor = 1.55;
      if (userProfileData.activityLevel === 'very_active') activityFactor = 1.725;
      
      const tdee = bmr * activityFactor;
      
      const deficitPct = calSettings?.deficit_pct ?? 0;
      const targetCals = Math.round(tdee * (1 - deficitPct / 100));
      
      const gpk = protSettings?.grams_per_kg ?? 1.8;
      const targetProt = Math.round(weight * gpk);
      
      const calsForProt = targetProt * 4;
      const remainingCals = targetCals - calsForProt;
      const targetFat = Math.round((remainingCals * 0.3) / 9);
      const targetCarbs = Math.round((remainingCals * 0.7) / 4);

      setCalculatedTargets({
          calories: targetCals,
          protein: targetProt,
          carbs: targetCarbs,
          fat: targetFat
      });
  }

  async function saveProfile() {
    setLoading(true);
    const { error } = await supabase.from('user_dietitian_profile').upsert({ user_id: userId, ...formData });
    if (!error) {
      setProfile(formData);
      setView('dashboard');
      if (!profile) handleAnalyze('daily', formData); 
    }
    setLoading(false);
  }

  // --- API Calls ---

  async function handleAnalyze(mode: 'daily' | 'weekly' = 'daily', currentProfile = profile) {
    if (!currentProfile) return;
    setAnalyzing(true);
    setAnalysisMode(mode);
    
    // סינון לוגים לפי המצב הנבחר
    const now = new Date();
    let filteredLogs = [];

    if (mode === 'daily') {
        const todayStr = now.toDateString();
        filteredLogs = logs.filter(l => new Date(l.occurred_at).toDateString() === todayStr);
    } else {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        filteredLogs = logs.filter(l => new Date(l.occurred_at) >= sevenDaysAgo);
    }

    const logsSummary = filteredLogs.map(l => ({
        date: new Date(l.occurred_at).toLocaleDateString('he-IL'),
        time: new Date(l.occurred_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }),
        item: l.item,
        cals: l.calories,
        prot: l.protein_g
    }));

    try {
      const res = await fetch('/api/dietitian-ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          mode, 
          userProfile: { ...userProfileData, goals: userGoals },
          weightHistory: weightHistory,
          preferences: currentProfile,
          targets: calculatedTargets,
          dbStatus: realTimeStatus,
          medicalInfo: currentProfile.medical_info,
          logs: logsSummary
        })
      });
      
      const data = await res.json();
      updateModelFeedback(res);

      if (data.result) {
        // בחירת העמודה הנכונה לשמירה (מפריד בין יומי לשבועי)
        const updateField = mode === 'daily' ? 'last_daily_analysis_html' : 'last_weekly_analysis_html';

        setProfile(prev => prev ? ({ 
            ...prev, 
            [updateField]: data.result 
        }) : null);
        
        await supabase.from('user_dietitian_profile').update({ 
            [updateField]: data.result,
        }).eq('user_id', userId);

        setDisplayMode(mode); // העברה אוטומטית לטאב הרלוונטי
      }
    } catch (e) {
      alert('שגיאה בניתוח הנתונים');
    } finally {
      setAnalyzing(false);
      setAnalysisMode(null);
    }
  }

  async function handleGeneratePlan() {
    setGeneratingPlan(true);
    try {
        const todayName = new Date().toLocaleDateString('he-IL', { weekday: 'long' });
        
        const res = await fetch('/api/dietitian-ai/generate-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              userProfile: { goals: userGoals },
              preferences: profile,
              favorites: favorites,
              logs: logs.slice(0, 50),
              targets: calculatedTargets,
              currentDayName: todayName
            })
          });
          const data = await res.json();
          updateModelFeedback(res);

          if (data.days) {
              setMealPlan(data);
              await supabase.from('user_meal_plans').insert({ user_id: userId, plan_data: data });
          }
    } catch(e) {
        console.error(e);
    } finally {
        setGeneratingPlan(false);
    }
  }

  async function handleRecommendNow(eatenCalories: number, eatenProtein: number) {
    setRecommending(true);
    setRecommendation(null);
    try {
        const res = await fetch('/api/dietitian-ai/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              preferences: profile,
              userProfile: userProfileData,
              favorites: favorites,
              currentContext: {
                time: new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'}),
                eatenCalories,
                eatenProtein,
                targetCalories: calculatedTargets.calories, 
                targetProtein: calculatedTargets.protein
              }
            })
          });
          const data = await res.json();
          updateModelFeedback(res);
          setRecommendation(data);
    } catch(e) {
        console.error(e);
    } finally {
        setRecommending(false);
    }
  }

  // --- שונה: פונקציה זו כעת מקבלת גם את תיאור המנה כדי להגביל את ה-AI למנה יחידה מדויקת ---
  async function handleGetRecipe(mealName: string, mealDesc?: string) {
      setLoadingRecipe(mealName);
      try {
        const res = await fetch('/api/dietitian-ai/recipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              preferences: profile,
              mealName,
              mealDesc // שליחת תיאור המנה (שכולל כמויות) ל-API
            })
          });
          const data = await res.json();
          updateModelFeedback(res);
          setActiveRecipe({ name: mealName, data });
      } catch(e) {
          alert('לא הצלחתי לייצר מתכון כרגע');
      } finally {
          setLoadingRecipe(null);
      }
  }

  async function toggleFavorite(mealName: string, macros?: any) {
      const exists = favorites.find(f => f.meal_name === mealName);
      if (exists) {
          await supabase.from('user_favorite_meals').delete().eq('id', exists.id);
          setFavorites(prev => prev.filter(f => f.id !== exists.id));
      } else {
          const { data } = await supabase.from('user_favorite_meals').insert({
              user_id: userId,
              meal_name: mealName,
              macros
          }).select().single();
          if (data) setFavorites(prev => [...prev, data]);
      }
  }

  function updateModelFeedback(res: Response) {
      const model = res.headers.get('x-model-used');
      if (model) setUsedModel(model);
  }

  // --- UI Components ---

  const PlanSummaryBadge = ({ label, value, target, unit }: { label: string, value: number, target: number, unit: string }) => {
      const pct = Math.min(100, Math.round((value / target) * 100));
      const color = pct > 110 ? 'text-red-600' : pct < 80 ? 'text-yellow-600' : 'text-emerald-600';
      return (
          <div className="flex flex-col items-center bg-white/50 dark:bg-black/20 p-2 rounded-lg text-xs flex-1">
              <span className="opacity-60">{label}</span>
              <span className={`font-bold ${color}`}>{value}{unit}</span>
              <span className="text-[10px] opacity-40">יעד: {target}</span>
          </div>
      );
  };

  if (loading) return <div className="p-8 text-center opacity-50">טוען את הדיאטנית שלך...</div>;

  if (view === 'onboarding') {
    return (
        <SectionCard title="הגדרת דיאטנית אישית" subtitle="בוא/י נגדיר את ההעדפות שלך לדיוק מקסימלי.">
          <div className="grid gap-4 max-w-xl">
            <label className="block">
              <span className="text-sm font-medium">העדפות בישול</span>
              <div className="flex gap-2 mt-1">
                 <button onClick={() => setFormData({...formData, cooking_preference: 'quick'})} className={`flex-1 p-3 rounded-lg border ${formData.cooking_preference === 'quick' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}>⏱️ מהיר (15 דק')</button>
                 <button onClick={() => setFormData({...formData, cooking_preference: 'chef'})} className={`flex-1 p-3 rounded-lg border ${formData.cooking_preference === 'chef' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700'}`}>👨‍🍳 מושקע</button>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-medium">העדפות תזונה</span>
              <input type="text" className="w-full mt-1 p-2 rounded-lg border border-black/10 dark:border-white/20 bg-transparent" placeholder="צמחוני, פליאו, ללא גלוטן..." value={formData.dietary_preferences.join(', ')} onChange={e => setFormData({...formData, dietary_preferences: e.target.value.split(',').map(s => s.trim())})} />
            </label>
            <label className="block">
               <span className="text-sm font-medium">מידע רפואי / תרופות ותוספים</span>
               <textarea 
                  className="w-full mt-1 p-2 rounded-lg border border-black/10 dark:border-white/20 bg-transparent text-sm h-20" 
                  placeholder="לדוגמה: לוקח ברזל בבוקר, רגישות ללקטוז, סוכרת גבולית..." 
                  value={formData.medical_info} 
                  onChange={e => setFormData({...formData, medical_info: e.target.value})} 
               />
               <span className="text-xs opacity-60">מידע זה יעזור לדיאטנית לזהות אינטראקציות וחסרים.</span>
            </label>
            <div className="grid grid-cols-2 gap-4">
               <label><span className="text-sm">שעת קימה</span><input type="time" value={formData.schedule_info.wake_up} onChange={e => setFormData({...formData, schedule_info: {...formData.schedule_info, wake_up: e.target.value}})} className="w-full mt-1 p-2 rounded border border-black/10 dark:border-white/20 bg-transparent" /></label>
               <label><span className="text-sm">שעת שינה</span><input type="time" value={formData.schedule_info.sleep} onChange={e => setFormData({...formData, schedule_info: {...formData.schedule_info, sleep: e.target.value}})} className="w-full mt-1 p-2 rounded border border-black/10 dark:border-white/20 bg-transparent" /></label>
            </div>
            <button onClick={saveProfile} className="mt-4 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700">שמור והתחל 🚀</button>
          </div>
        </SectionCard>
      );
  }

  // VIEW: Dashboard
  const eatenCals = logs.filter(l => new Date(l.occurred_at).toDateString() === new Date().toDateString()).reduce((a, b) => a + (b.calories || 0), 0);
  const eatenProt = logs.filter(l => new Date(l.occurred_at).toDateString() === new Date().toDateString()).reduce((a, b) => a + (b.protein_g || 0), 0);
  const userGender = userProfileData.gender === 'female' ? 'female' : 'male';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">הדיאטנית האישית שלך 👩‍⚕️</h2>
            {usedModel && <span className="text-[10px] bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-500 opacity-60" title="AI Model used for last request">powered by {usedModel.replace('gemini-', '')}</span>}
         </div>
         <button onClick={() => setView('onboarding')} className="text-sm bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-full">⚙️ פרופיל ורפואי</button>
      </div>

      {/* --- Section 1: Insight / Status (TABS System) --- */}
      <SectionCard title="סקירת מצב נוכחית">
         
         {/* --- כפתורי ניווט בין סקירות --- */}
         <div className="flex gap-2 mb-4 border-b border-black/10 dark:border-white/10 pb-2">
            <button 
               onClick={() => setDisplayMode('daily')}
               className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                   displayMode === 'daily' 
                   ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500' 
                   : 'opacity-60 hover:opacity-100'
               }`}
            >
                📅 סקירה יומית
            </button>
            <button 
               onClick={() => setDisplayMode('weekly')}
               className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                   displayMode === 'weekly' 
                   ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-b-2 border-purple-500' 
                   : 'opacity-60 hover:opacity-100'
               }`}
            >
                📊 סקירה שבועית
            </button>
         </div>

         {/* --- תוכן הסקירה הנבחרת --- */}
         <div className="min-h-[150px]">
             {displayMode === 'daily' ? (
                 profile?.last_daily_analysis_html ? (
                     <div className="prose prose-sm dark:prose-invert max-w-none animate-in fade-in" dangerouslySetInnerHTML={{ __html: profile.last_daily_analysis_html }} />
                 ) : (
                     <div className="text-center py-8 opacity-70 bg-black/5 dark:bg-white/5 rounded-lg">
                         אין עדיין סקירה יומית.
                     </div>
                 )
             ) : (
                 profile?.last_weekly_analysis_html ? (
                     <div className="prose prose-sm dark:prose-invert max-w-none animate-in fade-in" dangerouslySetInnerHTML={{ __html: profile.last_weekly_analysis_html }} />
                 ) : (
                     <div className="text-center py-8 opacity-70 bg-black/5 dark:bg-white/5 rounded-lg">
                         אין עדיין סקירה שבועית.
                     </div>
                 )
             )}
         </div>
         
         {/* --- כפתור יצירת סקירה חדשה - מותאם אישית לטאב --- */}
         <div className="mt-6 pt-4 border-t border-black/10 dark:border-white/10 flex justify-end">
            <button 
                onClick={() => handleAnalyze(displayMode)} 
                disabled={analyzing}
                className={`py-2 px-4 rounded-lg font-medium text-sm transition disabled:opacity-50 flex justify-center items-center gap-2 ${
                    displayMode === 'daily' 
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40' 
                    : 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                }`}
            >
                {analyzing && analysisMode === displayMode ? (
                    <><span className="animate-spin">⌛</span> מייצר סקירה חדשה...</>
                ) : (
                    <>🔄 עדכן סקירה {displayMode === 'daily' ? 'יומית' : 'שבועית'} מחדש</>
                )}
            </button>
         </div>
      </SectionCard>

      <div className="grid md:grid-cols-2 gap-6">
          {/* --- Section 2: Weekly Plan --- */}
          <SectionCard title="תפריט מותאם אישית">
             <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                תפריט המבוסס על ההרגלים שלך, היעדים היומיים ({calculatedTargets.calories} קק"ל, {calculatedTargets.protein} גרם חלבון) והלו"ז האישי.
             </p>
             <button 
               onClick={handleGeneratePlan}
               disabled={generatingPlan}
               className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl shadow hover:opacity-90 transition disabled:opacity-50"
             >
                {generatingPlan ? 'בונה תפריט חכם (מנתח הרגלים)...' : '📅 צור תוכנית שבועית'}
             </button>
             
             {mealPlan && (
                 <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-top-4">
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl text-sm border border-emerald-100 dark:border-emerald-900/30">
                        {mealPlan.summary}
                    </div>
                    {mealPlan.days.map((day, idx) => (
                        <div key={idx} className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
                            {/* כותרת יום + סיכום ערכים */}
                            <div className="bg-gray-50 dark:bg-white/5 p-3 border-b border-black/5 dark:border-white/5">
                                <h4 className="font-bold text-lg text-emerald-700 dark:text-emerald-400 mb-3">{day.day_title}</h4>
                                <div className="flex gap-2 justify-between">
                                    <PlanSummaryBadge label="קלוריות" value={day.daily_totals?.calories || 0} target={calculatedTargets.calories} unit="" />
                                    <PlanSummaryBadge label="חלבון" value={day.daily_totals?.protein || 0} target={calculatedTargets.protein} unit="g" />
                                    <PlanSummaryBadge label="פחמימה" value={day.daily_totals?.carbs || 0} target={calculatedTargets.carbs} unit="g" />
                                    <PlanSummaryBadge label="שומן" value={day.daily_totals?.fat || 0} target={calculatedTargets.fat} unit="g" />
                                </div>
                            </div>

                            {/* רשימת ארוחות */}
                            <ul className="p-3 space-y-3 text-sm">
                                {day.meals.map((meal, mIdx) => {
                                    const isFav = favorites.some(f => f.meal_name === meal.name);
                                    return (
                                    <li key={mIdx} className="flex flex-col gap-2 bg-white dark:bg-black/20 p-3 rounded-lg border border-black/5 dark:border-white/5 hover:border-black/10 transition-colors">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded">{meal.time}</span>
                                                <span className="font-bold text-base">{meal.name}</span>
                                            </div>
                                            <button onClick={() => toggleFavorite(meal.name)} className={`transition transform active:scale-95 ${isFav ? 'opacity-100 scale-110' : 'opacity-30 hover:opacity-100 grayscale hover:grayscale-0'}`} title="שמור למועדפים">
                                                {isFav ? '❤️' : '🤍'}
                                            </button>
                                        </div>
                                        
                                        <p className="text-xs opacity-70 leading-snug">{meal.desc}</p>
                                        
                                        <div className="flex justify-between items-end mt-1 pt-2 border-t border-dashed border-black/5 dark:border-white/5">
                                            <span className="text-xs font-medium opacity-60">{meal.calories} קק"ל · {meal.protein}g חלבון</span>
                                            <button 
                                                // כאן אנחנו מעבירים גם את התיאור של המנה (עם הכמויות המדויקות)
                                                onClick={() => handleGetRecipe(meal.name, meal.desc)}
                                                className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                                            >
                                                {loadingRecipe === meal.name ? 'מכין...' : '📜 מתכון'}
                                            </button>
                                        </div>
                                    </li>
                                )})}
                            </ul>

                            {/* הסבר לוגי יומי */}
                            {day.daily_reasoning && (
                                <div className="bg-yellow-50 dark:bg-yellow-900/10 p-3 text-xs text-yellow-800 dark:text-yellow-200 border-t border-yellow-100 dark:border-yellow-900/20 italic">
                                    💡 <strong>למה תפריט זה?</strong> {day.daily_reasoning}
                                </div>
                            )}
                        </div>
                    ))}
                 </div>
             )}
          </SectionCard>

          {/* --- Section 3: Real Time Recommendation --- */}
          <SectionCard title="מה לאכול עכשיו?">
             <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/20">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-mono opacity-60">{new Date().toLocaleTimeString('he-IL', {hour: '2-digit', minute:'2-digit'})}</span>
                    <span className="text-xs bg-white dark:bg-black/20 px-2 py-0.5 rounded-full">היום: {Math.round(eatenCals)} קק"ל</span>
                </div>
                <h3 className="font-bold text-lg mb-1">
                    {userGender === 'female' ? 'רעבה?' : 'רעב?'} בוא/י נבדוק מה חסר ומה מתאים.
                </h3>
                
                <button 
                  onClick={() => handleRecommendNow(eatenCals, eatenProt)}
                  disabled={recommending}
                  className="w-full py-2 bg-orange-500 text-white rounded-lg font-medium shadow hover:bg-orange-600 disabled:opacity-50 mt-3"
                >
                    {recommending ? 'בודק העדפות ומועדפים... 🥪' : '🍽️ תן לי המלצה לכרגע'}
                </button>

                {recommendation && (
                    <div className="mt-4 bg-white dark:bg-neutral-800 p-4 rounded-lg shadow-sm border border-black/5 dark:border-white/5 animate-in zoom-in duration-200">
                        <div className="flex justify-between items-start">
                             <h4 className="font-bold text-lg">{recommendation.meal_name}</h4>
                             <div className="flex gap-2 items-center">
                                <button onClick={() => toggleFavorite(recommendation.meal_name, recommendation.macros)} className="text-lg transition hover:scale-110">
                                    {favorites.some(f => f.meal_name === recommendation.meal_name) ? '❤️' : '🤍'}
                                </button>
                                <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-1 rounded h-fit">⏱️ {recommendation.preparation_time}</span>
                             </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 italic">"{recommendation.reasoning}"</p>
                        
                        <div className="flex gap-2 mt-3 text-xs font-mono opacity-80">
                            <span>🔥 {recommendation.macros.calories}</span>
                            <span>🥩 {recommendation.macros.protein}g</span>
                            <span>🍞 {recommendation.macros.carbs}g</span>
                        </div>

                        <div className="mt-3 pt-3 border-t border-dashed border-black/10 dark:border-white/10">
                            <div className="flex justify-between items-center mb-1">
                                <div className="text-xs font-bold">איך מכינים:</div>
                                <button 
                                    // כאן אנחנו מעבירים גם את תיאור המנה (recipe_outline)
                                    onClick={() => handleGetRecipe(recommendation.meal_name, recommendation.recipe_outline)} 
                                    className="text-xs text-indigo-600 underline"
                                >
                                    מתכון מלא
                                </button>
                            </div>
                            <p className="text-xs leading-relaxed">{recommendation.recipe_outline}</p>
                        </div>
                    </div>
                )}
             </div>
          </SectionCard>
      </div>

      {/* Recipe Modal */}
      {activeRecipe && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setActiveRecipe(null)}>
              <div className="bg-white dark:bg-neutral-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                  <div className="p-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-white/5">
                      <h3 className="font-bold text-lg">{activeRecipe.name}</h3>
                      <button onClick={() => setActiveRecipe(null)} className="text-2xl opacity-50 hover:opacity-100">&times;</button>
                  </div>
                  <div className="p-6 overflow-y-auto max-h-[70vh]">
                      <div className="mb-4">
                          <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2">מצרכים:</h4>
                          <ul className="list-disc list-inside text-sm space-y-1">
                              {activeRecipe.data.ingredients.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                      </div>
                      <div className="mb-4">
                          <h4 className="font-bold text-indigo-600 dark:text-indigo-400 mb-2">הוראות הכנה:</h4>
                          <ol className="list-decimal list-inside text-sm space-y-2">
                              {activeRecipe.data.instructions.map((step, i) => <li key={i}>{step}</li>)}
                          </ol>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded text-sm text-yellow-800 dark:text-yellow-200">
                          <strong>💡 טיפ:</strong> {activeRecipe.data.tips}
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}