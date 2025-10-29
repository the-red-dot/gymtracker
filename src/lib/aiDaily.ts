// src/lib/aiDaily.ts
'use client';
import { supabase } from '@/lib/supabaseClient';

export async function refreshLast14DaysForCurrentUser(): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const userId = sess?.session?.user?.id;
  if (!userId) return;

  const end = new Date();                // היום (לפי דפדפן)
  const start = new Date();
  start.setDate(end.getDate() - 13);     // 14 ימים כולל היום

  const { error } = await supabase.rpc('refresh_ai_daily_metrics', {
    p_user_id: userId,
    p_start: start.toISOString().slice(0,10),
    p_end:   end.toISOString().slice(0,10),
  });

  if (error) {
    // חשוב: לא לבלוע בשקט — לפחות לוג
    console.error('refresh_ai_daily_metrics error:', error.message);
    throw new Error(error.message);
  }
}
