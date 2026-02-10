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

  // API Key Modal State
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // get current session + listen for changes + load local API key
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

    // Load API Key from local storage (if exists)
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) setApiKey(storedKey);
    }

    return () => {
      ignore = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setOpen(false);
  };

  // שמירת המפתח בלוקל סטורג'
  const saveApiKey = () => {
    if (typeof window !== 'undefined') {
      if (apiKey.trim()) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
      } else {
        localStorage.removeItem('gemini_api_key');
      }
    }
    setShowKeyModal(false);
  };

  // מחיקת המפתח
  const deleteApiKey = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gemini_api_key');
    }
    setApiKey('');
    // משאירים את המודל פתוח כדי שהמשתמש יראה שהשדה התנקה, או סוגרים:
    // setShowKeyModal(false); 
  };

  return (
    <>
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
                {/* Email as button to open settings */}
                <button
                  onClick={() => setShowKeyModal(true)}
                  className="text-sm opacity-80 hover:opacity-100 hover:underline underline-offset-4"
                  title="לחץ להגדרת מפתח AI אישי"
                >
                  {email}
                </button>
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
                  <button
                    onClick={() => {
                      setOpen(false);
                      setShowKeyModal(true);
                    }}
                    className="text-sm opacity-80 text-right hover:opacity-100 font-medium"
                  >
                    {email} <span className="text-xs opacity-70">(הגדרות API)</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-2 hover:bg-black/[.04] dark:hover:bg-white/[.06] text-right"
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

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl w-full max-w-md overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-black/10 dark:border-white/10 flex justify-between items-center bg-gray-50 dark:bg-white/5">
              <h3 className="font-semibold text-lg">הגדרת מפתח AI אישי 🤖</h3>
              <button 
                onClick={() => setShowKeyModal(false)} 
                className="text-2xl leading-none opacity-50 hover:opacity-100 px-2"
                aria-label="סגור"
              >
                ×
              </button>
            </div>
            
            <div className="p-5 space-y-5 text-sm">
              <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
                כדי להשתמש בפיצ'ר ה-AI (זיהוי תמונות וניתוח תזונה) ללא מגבלות, מומלץ להזין מפתח API אישי משלך.
              </p>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-blue-800 dark:text-blue-200 space-y-2 border border-blue-100 dark:border-blue-800/30">
                <div className="font-bold flex items-center gap-2">
                  <span>🔑</span> איך משיגים מפתח?
                </div>
                <ol className="list-decimal list-inside space-y-1 opacity-90 text-xs sm:text-sm">
                  <li>
                    היכנס/י ל־
                    <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noreferrer" className="underline font-bold mx-1 hover:text-blue-600">
                      Google AI Studio
                    </a>
                  </li>
                  <li>לחצ/י על הכפתור הכחול <span className="font-mono bg-black/5 px-1 rounded mx-1">Create API key</span>.</li>
                  <li>בחלון שנפתח, העתק/י את רצף האותיות (API Key).</li>
                  <li>הדבק/י אותו בשדה למטה.</li>
                </ol>
              </div>

              <div className="space-y-2">
                <label className="font-medium block">API Key שלך</label>
                <input 
                  type="text" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="הדבק כאן (מתחיל ב-AIzaSy...)"
                  className="w-full rounded-md border border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-left ltr font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  🔒 <b>פרטיות:</b> המפתח נשמר <u>בדפדפן שלך בלבד</u> (Local Storage) ואינו מועבר לאתר שלנו או לצד שלישי (למעט גוגל בעת השימוש).
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={saveApiKey}
                  className="flex-1 bg-foreground text-background py-2 rounded-md font-medium hover:opacity-90 transition shadow-sm"
                >
                  שמור הגדרות
                </button>
                {apiKey && (
                  <button 
                    onClick={deleteApiKey}
                    className="px-4 py-2 text-red-600 border border-red-200 dark:border-red-900/30 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                  >
                    מחק מפתח
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}