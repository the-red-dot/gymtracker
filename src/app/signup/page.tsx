// gym-tracker-app/src/app/signup/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

// Build-time value for prod/preview; falls back to current origin in dev.
const BASE_URL =
  (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // דואג שהקישור במייל יגיע לדומיין הנכון (פרוד/לוקלי)
        emailRedirectTo: `${BASE_URL}/`,
      },
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    // אם אימותים במייל פעילים – יישלח מייל אישור
    if (data.user && !data.session) {
      setMsg('📧 שלחנו לך מייל לאישור. פתח/י את הקישור כדי להשלים הרשמה, ואז התחבר/י.');
      return;
    }

    // אם אימותים כבויים – ייתכן שהמשתמש כבר מחובר
    router.push('/');
  };

  return (
    <div className="max-w-md" dir="rtl">
      <h1 className="text-3xl font-bold tracking-tight">📝 הרשמה</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        כבר יש לך חשבון?{' '}
        <Link className="underline underline-offset-4" href="/login">
          🔑 התחברות
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm">✉️ אימייל</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="rounded-md border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm">🔒 סיסמה</span>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="לפחות 6 תווים"
            className="rounded-md border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right"
          />
        </label>

        <button
          disabled={busy}
          className="rounded-md px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '⏳ יוצר חשבון…' : '🚀 צור/צרי חשבון'}
        </button>

        {error && <p className="text-sm text-red-600">❗ שגיאה: {error}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}
      </form>
    </div>
  );
}
