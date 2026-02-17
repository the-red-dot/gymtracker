// gym-tracker-app\src\lib\aiDaily.ts

import { createClient } from '@supabase/supabase-js';
import { supabase as supabaseClient } from '@/lib/supabaseClient';

// יצירת קליינט אדמין לשימוש בצד השרת בלבד
// זה נחוץ כדי לקרוא נתונים של משתמש ספציפי (userId) בתוך API route ללא Session פעיל
// המשתנה SUPABASE_SERVICE_ROLE_KEY חייב להיות מוגדר ב-.env.local
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, 
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

/**
 * שולף נתונים קריטיים לדיאטנית בזמן אמת.
 * משתמש ב-Admin Client כדי לעקוף RLS ולהבטיח שהנתונים ייקראו.
 */
export async function getDietitianContext(userId: string) {
  // 1. שליפת סטטוס יומי ומטרות
  const { data: status, error: statusError } = await supabaseAdmin
    .from('user_nutrition_targets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (statusError) {
    console.error('Error fetching nutrition status:', statusError);
  }

  // 2. שליפת היסטוריית מנות
  const { data: historyData } = await supabaseAdmin
    .from('user_meal_history')
    .select('meal_text')
    .eq('user_id', userId)
    .order('usage_count', { ascending: false })
    .limit(30);

  const history = historyData?.map(r => r.meal_text) || [];

  // מיפוי הנתונים מה-DB. אם ערך חסר - מחזירים 0.
  const today = {
    calories: status?.current_calories ?? 0,
    protein: status?.current_protein_g ?? 0,
    carbs: status?.current_carbs_g ?? 0,
    fats: status?.current_fat_g ?? 0
  };

  const targets = status ? {
    calories: status.target_calories ?? 0,
    protein: status.target_protein_g ?? 0,
    carbs: status.target_carbs_g ?? 0,
    fats: status.target_fat_g ?? 0
  } : null;

  return { today, targets, history };
}

/**
 * פונקציית עזר לרענון מטריקות (קיימת במערכת)
 * פונקציה זו רצה בדרך כלל בקונטקסט של משתמש מחובר ולכן משתמשת בלקוח הרגיל
 */
export async function refreshLast14DaysForCurrentUser(): Promise<void> {
  const { data: sess } = await supabaseClient.auth.getSession();
  const userId = sess?.session?.user?.id;
  if (!userId) return;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 13);

  const { error } = await supabaseClient.rpc('refresh_ai_daily_metrics', {
    p_user_id: userId,
    p_start: start.toISOString().slice(0,10),
    p_end:   end.toISOString().slice(0,10),
  });

  if (error) {
    console.error('refresh_ai_daily_metrics error:', error.message);
    throw new Error(error.message);
  }
}