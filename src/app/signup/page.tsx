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
        // Make the magic-link land on the right host (prod or localhost)
        emailRedirectTo: `${BASE_URL}/`,
      },
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    // If email confirmations are ON, Supabase will send a confirmation email.
    if (data.user && !data.session) {
      setMsg('Check your email to confirm your account, then come back to log in.');
      return;
    }

    // If confirmations are OFF, user may already be logged in:
    router.push('/');
  };

  return (
    <div className="max-w-md">
      <h1 className="text-3xl font-bold tracking-tight">Sign up</h1>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Already have an account?{' '}
        <Link className="underline underline-offset-4" href="/login">
          Log in
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-black/10 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-sm">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-black/10 dark:border-white/20 bg-transparent px-3 py-2"
          />
        </label>

        <button
          disabled={busy}
          className="rounded-md px-4 py-2 h-11 bg-foreground text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}
      </form>
    </div>
  );
}
