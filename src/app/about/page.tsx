// src/app/about/page.tsx
import Link from 'next/link';

export default function AboutPage() {
  return (
    <section className="grid gap-6 sm:gap-8 max-w-3xl" dir="rtl">
      {/* Header */}
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          אודות GymTracker 💪
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300">
          אפליקציה קלילה שעוזרת לך לתעד אימונים ותזונה, להבין מגמות ולהישאר עקביים — בלי כאב ראש.
        </p>
      </header>

      {/* What is inside */}
      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">מה יש כאן? ✨</h2>
        <ul className="list-disc pr-5 space-y-1 text-sm sm:text-base">
          <li>🏋️ <strong>אימונים</strong> — תיעוד סטים, חזרות, משקלים וזמן אימון.</li>
          <li>🥗 <strong>תזונה</strong> — קלוריות ומאקרו לכל ארוחה, כולל חישוב אוטומטי.</li>
          <li>📏 <strong>פרופיל ומדידות</strong> — גובה, משקל, היקפים ועוד לאורך זמן.</li>
          <li>🧰 <strong>מכשירים</strong> — יצירת טאבים לפי סוג אימון והתאמת ציוד.</li>
        </ul>
      </section>

      {/* Quick Start based on your instructions */}
      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">איך מתחילים — בקצרה 🚀</h2>
        <ol className="list-decimal pr-5 space-y-3 text-sm sm:text-base">
          <li>
            היכנס/י ל־{' '}
            <Link href="/profile" className="underline underline-offset-4">
              עמוד הפרופיל
            </Link>{' '}
            ועדכן/ני פרטים. לאחר מכן עבור/י ללשונית <strong>פעילות ומטרות</strong> ולעדכון היעדים.
            בלשונית <strong>מדידות</strong> עדכן/ני לפחות את <strong>המשקל</strong> כדי לאתחל את מערכת התזונה. 📋
          </li>
          <li>
            גשו אל{' '}
            <Link href="/equipment" className="underline underline-offset-4">
              עמוד המכשירים
            </Link>{' '}
            וצרו טאבים לפי סוגי אימון (לדוגמה: “אימוני כוח”, “קרדיו”, “פלג גוף תחתון”).
            לכל טאב בחרו את המכשירים/תרגילים שלו. 🧰
          </li>
          <li>
            עברו ל־{' '}
            <Link href="/nutrition" className="underline underline-offset-4">
              עמוד התזונה
            </Link>{' '}
            לקביעת <strong>יעדי חלבון</strong> ו<strong>קלוריות</strong>, ואז הזינו את הארוחות היומיות.  
            שימו לב: המערכת משתמשת ב־AI — ייתכנו סטיות קטנות, ותמיד אפשר לערוך ידנית. אם עדכנתם קלוריות למנה,
            שאר המאקרו (שומן/פחמימות וכו׳) יתעדכנו אוטומטית בהתאם. 🤖🍽️
          </li>
          <li>
            ב־{' '}
            <Link href="/workouts/start" className="underline underline-offset-4">
              עמוד התחלת האימון
            </Link>{' '}
            לחצו <strong>התחל אימון</strong> כדי להפעיל שעון האימון, ואז הגדירו סטים/חזרות/משקלים
            (או מרחק/זמן לקרדיו). בימים ללא אימון ניתן לסמן <strong>יום מנוחה</strong> — זה ישפיע על חישובי התזונה. ⏱️🏁
          </li>
        </ol>
      </section>

      {/* Tone / privacy */}
      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">פשטות ופרטיות 🔒</h2>
        <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
          הנתונים שלך שייכים לך. אנחנו שומרים על חוויה נקייה ומהירה, כך שיהיה לך קל לעקוב, לשפר ולהתמיד.
        </p>
      </section>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
        <Link
          href="/workouts/start"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 bg-foreground text-background hover:opacity-90"
        >
          להתחיל אימון עכשיו 🏋️‍♀️
        </Link>
        <Link
          href="/nutrition"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          להוסיף ארוחה 🍽️
        </Link>
        <Link
          href="/equipment"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          להגדיר מכשירים 🧰
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          לעדכן פרופיל ומדידות 📏
        </Link>
      </div>
    </section>
  );
}
