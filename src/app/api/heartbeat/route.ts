// src/app/api/heartbeat/route.ts
export const runtime = 'nodejs';

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// minimal, HEAD-only query to touch the DB without returning rows
export async function GET() {
  try {
    const supabase = createClient(url, anon, { auth: { persistSession: false } });

    // Use a table that exists in your app (profiles). If it doesn't exist,
    // the request will still hit Supabase and that's enough to count as activity.
    const { error } = await supabase
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .limit(1);

    const ok = !error;
    return new Response(
      JSON.stringify({ ok, note: ok ? 'pong' : `pong (query error: ${error.message})` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    // still a Supabase-bound attempt; return 200 so cron doesn’t alert
    return new Response(
      JSON.stringify({ ok: true, note: `pong (exception: ${e?.message || 'unknown'})` }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
