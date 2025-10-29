// src/components/Navbar.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// הורדנו זמנית את קישור "התקדמות"
const navLinks = [
  { href: '/', label: 'בית' },
  { href: '/profile', label: 'פרופיל' },
  { href: '/nutrition', label: 'תזונה' },
  { href: '/equipment', label: 'מכשירים' },
  { href: '/workouts/start', label: 'התחלת אימון' },
  // { href: '/progress', label: 'התקדמות' }, // ← החזרו כשנרצה להפעיל שוב
  { href: '/about', label: 'אודות' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  // get current session + listen for changes
  useEffect(() => {
    let ignore = false;

    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!ignore) setEmail(data.session?.user?.email ?? null);
    };
    getSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  return (
    <header
      className="sticky top-0 z-50 bg-background/80 supports-[backdrop-filter]:bg-background/60 backdrop-blur border-b border-black/10 dark:border-white/15"
      dir="rtl"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="font-bold tracking-tight text-lg">
          GymTracker
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm hover:underline underline-offset-4"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {email ? (
            <>
              <span className="text-sm opacity-80">{email}</span>
              <button
                onClick={handleLogout}
                className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                יציאה
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-1.5 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                התחברות
              </Link>
              <Link
                href="/signup"
                className="text-sm rounded-md px-3 py-1.5 bg-foreground text-background hover:opacity-90"
              >
                הרשמה
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden inline-flex items-center justify-center rounded-md p-2 border border-black/10 dark:border-white/20"
          aria-label="פתיחת תפריט"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden border-t border-black/10 dark:border-white/15">
          <nav className="mx-auto max-w-6xl px-4 py-3 flex flex-col gap-3">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="py-2 text-sm hover:underline underline-offset-4"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </Link>
            ))}

            <div className="pt-2 border-t border-black/10 dark:border-white/15 mt-2" />

            {email ? (
              <>
                <span className="text-sm opacity-80">{email}</span>
                <button
                  onClick={handleLogout}
                  className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-2 hover:bg-black/[.04] dark:hover:bg-white/[.06] text-left"
                >
                  יציאה
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-2 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  onClick={() => setOpen(false)}
                >
                  התחברות
                </Link>
                <Link
                  href="/signup"
                  className="text-sm rounded-md px-3 py-2 bg-foreground text-background hover:opacity-90"
                  onClick={() => setOpen(false)}
                >
                  הרשמה
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
