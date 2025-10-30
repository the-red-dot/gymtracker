// gym-tracker-app/src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push('/'); // חזרה לדף הבית
  };

  return (
    <div className="max-w-md" dir="rtl">
      <h1 className="text-3xl font-bold tracking-tight">🔑 התחברות</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        אין לך חשבון?{' '}
        <Link className="underline underline-offset-4" href="/signup">
          📝 הרשמה
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="הקלד/י סיסמה"
            className="rounded-md border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-right"
          />
        </label>

        <button
          disabled={busy}
          className="rounded-md px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy ? '⏳ מתחבר/ת…' : '➡️ כניסה'}
        </button>

        {error && <p className="text-sm text-red-600">❗ שגיאה: {error}</p>}
      </form>
    </div>
  );
}
