// src/app/page.tsx
'use client';

/**
 * עמוד בית מעודכן: כולל מדריך צעדים (אקורדיון) להתחלה מהירה, הסברים על ה-API, והפניות לעמודים השונים.
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
          המקום שלך לעקוב, להבין ולהתמיד. בואו נעשה סדר בבלאגן.
        </p>
      </header>

      {/* --- רכיב המדריך החדש (אקורדיון) --- */}
      <GuideSection onOpenApiKey={() => setShowKeyModal(true)} />

      {/* כותרת משנית לגישה מהירה */}
      <div className="pt-4 border-t border-black/5 dark:border-white/5">
        <h3 className="text-lg font-semibold mb-3">גישה מהירה</h3>
        
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
            עדכון פרופיל 📏
          </Link>
          <Link
            href="/equipment"
            className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
          >
            מכשירים 🧰
          </Link>
        </div>
      </div>

      <footer className="pt-2 text-xs text-center text-gray-500 dark:text-gray-400">
        טיפ: קוד ג'מיני נשמר מקומית בדפדפן או בבסיס הנתונים שלך. הפרטיות שלך חשובה לנו. 🔒
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

// --- קומפוננטת המדריך (אקורדיון) ---
function GuideSection({ onOpenApiKey }: { onOpenApiKey: () => void }) {
  const [activeStep, setActiveStep] = useState<number | null>(0); // פותח את הראשון כברירת מחדל

  const steps = [
    {
      id: 0,
      title: '1. המנוע של המערכת (API Key) 🔑',
      short: 'חובה להתחלה - חינמי, מאובטח ובשליטה שלך.',
      content: (
        <div className="space-y-3">
          <p>
            כדי שהאתר יוכל "לחשוב" (לנתח ארוחות, לבנות תפריטים ולהציע אימונים), הוא זקוק למפתח גישה למודל ה-AI של גוגל.
          </p>
          <ul className="list-disc list-inside space-y-1 opacity-90 text-sm">
            <li><strong>למה זה חובה?</strong> בלי זה, כל הפיצ'רים החכמים יהיו מושבתים.</li>
            <li><strong>זה עולה כסף?</strong> לא! גוגל מאפשרת להוציא מפתח לשימוש אישי בחינם.</li>
            <li><strong>פרטיות:</strong> המפתח נשמר רק אצלך בדפדפן. תמיד אפשר למחוק אותו.</li>
          </ul>
          <div className="mt-2">
            <button onClick={onOpenApiKey} className="inline-flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm">
              🔑 לחץ להגדרת מפתח עכשיו
            </button>
          </div>
        </div>
      )
    },
    {
      id: 1,
      title: '2. הפרופיל שלך 👤',
      short: 'הגדרת גיל, משקל וגובה לדיוק מקסימלי.',
      content: (
        <div className="space-y-3">
          <p>
            אחרי שהגדרת את המפתח, המערכת צריכה להכיר אותך.
          </p>
          <p>
            בלי גיל, גובה ומשקל, לא נוכל לחשב שריפת קלוריות או להתאים לך תפריט.
            <br/>
            זה לוקח דקה וזה הבסיס להכל.
          </p>
          <Link href="/profile" className="text-sm bg-black/5 dark:bg-white/10 px-3 py-1.5 rounded inline-block mt-1 font-medium hover:bg-black/10 dark:hover:bg-white/20 transition">
            מעבר לעדכון פרופיל &larr;
          </Link>
        </div>
      )
    },
    {
      id: 2,
      title: '3. גאונות התזונה 🥗',
      short: 'ניתוח ארוחות, סקירות יומיות ובניית תפריט.',
      content: (
        <div className="space-y-3">
          <p>
            עמוד התזונה הוא ה"מוח" של האתר. הנה מה שאפשר לעשות שם:
          </p>
          <ul className="list-disc list-inside space-y-1 opacity-90 text-sm">
            <li><strong>תיעוד מהיר:</strong> פשוט כתבו "חביתה וקוטג'" או העלו תמונה – ה-AI יחשב לבד קלוריות וחלבון.</li>
            <li><strong>סקירות חכמות:</strong> בלחיצת כפתור, תקבלו ניתוח יומי או שבועי: האם עמדתם ביעדים? מה חסר?</li>
            <li><strong>בניית תפריט:</strong> ה-AI יכול לבנות לכם תוכנית אכילה מלאה המותאמת להעדפות שלכם.</li>
          </ul>
          <Link href="/nutrition" className="text-sm bg-black/5 dark:bg-white/10 px-3 py-1.5 rounded inline-block mt-1 font-medium hover:bg-black/10 dark:hover:bg-white/20 transition">
            מעבר לתזונה &larr;
          </Link>
        </div>
      )
    },
    {
      id: 3,
      title: '4. אימונים חכמים 🏋️',
      short: 'בחירת מכשירים, בניית תוכנית ומעקב זמן אמת.',
      content: (
        <div className="space-y-3">
          <p>
            כדי להתאמן יעיל, לא צריך לנחש:
          </p>
          <ol className="list-decimal list-inside space-y-2 opacity-90 text-sm">
            <li><strong>הגדרת ציוד:</strong> כנסו ל"מכשירים" וסמנו מה יש לכם (משקולות, מכונות, גומיות).</li>
            <li><strong>בניית תוכנית AI:</strong> בקשו מהמאמן הווירטואלי לבנות לכם תוכנית (למשל "AB" או "פול בודי") המבוססת <u>רק</u> על הציוד שלכם.</li>
            <li><strong>בזמן אימון:</strong> לחצו על "התחל אימון", הפעילו את השעון ⏱️, ותעדו כל סט. בסוף לחצו על "סיים אימון" כדי לשמור היסטוריה.</li>
          </ol>
          <Link href="/equipment" className="text-sm bg-black/5 dark:bg-white/10 px-3 py-1.5 rounded inline-block mt-1 font-medium hover:bg-black/10 dark:hover:bg-white/20 transition">
            הגדרת מכשירים &larr;
          </Link>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold opacity-90">איך מתחילים? 🚀</h2>
      <div className="grid gap-3">
        {steps.map((step) => (
          <div key={step.id} className={`rounded-xl border transition-all duration-300 overflow-hidden ${
            activeStep === step.id 
              ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10 shadow-md ring-1 ring-indigo-500/20' 
              : 'border-black/5 dark:border-white/5 bg-white dark:bg-white/5 hover:border-black/10'
          }`}>
            <button 
              onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
              className="w-full text-right p-4 flex items-center justify-between gap-4"
            >
              <div>
                <div className={`font-bold text-base ${activeStep === step.id ? 'text-indigo-700 dark:text-indigo-300' : ''}`}>
                  {step.title}
                </div>
                <div className="text-xs opacity-70 mt-0.5">{step.short}</div>
              </div>
              <div className={`transition-transform duration-300 opacity-50 ${activeStep === step.id ? 'rotate-180' : ''}`}>
                ▼
              </div>
            </button>
            
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${activeStep === step.id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
              <div className="overflow-hidden">
                <div className="p-4 pt-0 text-sm leading-relaxed opacity-90 border-t border-black/5 dark:border-white/5 mt-2">
                  <div className="pt-3">
                    {step.content}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}