// src/app/page.tsx
'use client';

/**
 * עמוד בית פשוט: ברכה + הסבר קצר + קישורי פעולה (עם אמוג'ים 😄)
 * כולל באנר "בטא" בחלק העליון ואפשרות להגדרת מפתח AI אישי.
 */

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Home() {
  // API Key Modal State
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [apiKey, setApiKey] = useState('');

  // Load API Key from local storage (on mount)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('gemini_api_key');
      if (storedKey) setApiKey(storedKey);
    }
  }, []);

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

  const deleteApiKey = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('gemini_api_key');
    }
    setApiKey('');
  };

  return (
    <section className="grid gap-6 sm:gap-8 max-w-3xl" dir="rtl">
      {/* Beta Banner */}
      <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3 text-sm">
        🚧 גרסת בטא: האתר בפיתוח פעיל — ייתכנו שינויים ותקלות. נשמח לשמוע מכם משוב!
        {' '}
        <Link href="/about" className="underline underline-offset-4 hover:opacity-90">
          קראו עוד באודות
        </Link>
        .
      </div>

      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          ברוכים הבאים ל-GymTracker 💪
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300">
          יומן אימונים ותזונה פשוט ואמין — כדי להתמיד, לעקוב ולהרגיש בשליטה.
        </p>
      </header>

      {/* קישורי פעולה מהירים */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <Link
          href="/workouts/start"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 bg-foreground text-background hover:opacity-90"
        >
          התחל/י אימון 🏋️
        </Link>
        <Link
          href="/nutrition"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          הוספת אכילה 🍽️
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          עדכון פרופיל/מדידות 📏
        </Link>
        <Link
          href="/equipment"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          מכשירים 🧰
        </Link>
      </div>

      {/* הסבר קצר על העמודים + כרטיסיית AI חדשה */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureCard
          title="אימונים 🏋️"
          href="/workouts/start"
          points={[
            'תיעוד אימון לפי תרגילים וסטים',
            'שמירת משקלים וחזרות',
            'מעקב אחר נפח וזמן אימון',
          ]}
        />
        <FeatureCard
          title="תזונה 🥗"
          href="/nutrition"
          points={[
            'רישום ארוחות ומה אכלת בפועל',
            'קלוריות וחלוקת מאקרו (חלבון/פחמימות/שומן)',
            'אפשר להוסיף הערות לכל סעיף',
          ]}
        />
        <FeatureCard
          title="פרופיל ומדידות 📏"
          href="/profile"
          points={[
            'פרטים אישיים והעדפות',
            'מדידות היקפים/משקל לאורך זמן',
            'יעדי חלבון/קלוריות לפי משקל/פעילות',
          ]}
        />
        <FeatureCard
          title="מכשירים 🧰"
          href="/equipment"
          points={[
            'בחירת ציוד זמין עבורך',
            'התאמת תרגילים לפי ציוד',
            'ארגון לפי טאבים/קטגוריות',
          ]}
        />
        {/* כרטיסיית הגדרות AI */}
        <FeatureCard
          title="הגדרות AI 🤖"
          action={() => setShowKeyModal(true)}
          actionLabel="הגדר מפתח"
          points={[
            'חיבור מפתח API אישי (Gemini)',
            'לשימוש חופשי בפיצ׳ר זיהוי תזונה',
            'פרטיות: נשמר מקומית בדפדפן שלך',
          ]}
        />
      </div>

      <footer className="pt-2 text-xs text-gray-500 dark:text-gray-400">
        טיפ: להתחלה מהירה — היכנס/י ל״אימונים״ לפתיחת אימון חדש, או ל״תזונה״ להוספת הארוחה הבאה. 🚀
      </footer>

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
    </section>
  );
}

function FeatureCard({
  title,
  href,
  action,
  actionLabel = 'מעבר לעמוד →',
  points,
}: {
  title: string;
  href?: string;
  action?: () => void;
  actionLabel?: string;
  points: string[];
}) {
  return (
    <section className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
      <div className="p-4 md:p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
          >
            {actionLabel}
          </Link>
        ) : action ? (
          <button
            onClick={action}
            className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100 text-blue-600 dark:text-blue-400"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="p-4 md:p-5 text-sm space-y-1">
        {points.map((p, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-0.5">•</span>
            <span>{p}</span>
          </div>
        ))}
      </div>
    </section>
  );
}