// src/app/about/page.tsx
import Link from 'next/link';

export default function AboutPage() {
  return (
    <section className="grid gap-6 sm:gap-8 max-w-3xl" dir="rtl">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          אודות GymTracker 💪
        </h1>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300">
          אפליקציה קלילה שעוזרת לך לתעד אימונים ותזונה, להבין מגמות, ולהישאר עקביים — בלי כאב ראש.
        </p>
      </header>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">מה אפשר לעשות כאן? ✨</h2>
        <ul className="list-disc pr-5 space-y-1 text-sm sm:text-base">
          <li>🏋️ <strong>אימונים</strong> — תיעוד סטים, משקלים וחזרות, וזמן אימון.</li>
          <li>🥗 <strong>תזונה</strong> — רישום מה אכלת בפועל, קלוריות ומאקרו.</li>
          <li>📏 <strong>פרופיל ומדידות</strong> — גובה/משקל/אחוזי שומן והיקפים לאורך זמן.</li>
          <li>🧰 <strong>מכשירים</strong> — ניהול הציוד הזמין לך והתאמת תרגילים.</li>
        </ul>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">איך מתחילים? 🚀</h2>
        <ol className="list-decimal pr-5 space-y-1 text-sm sm:text-base">
          <li>מעדכנים <Link href="/profile" className="underline underline-offset-4">פרופיל ומדידות</Link> בסיסיות.</li>
          <li>פותחים אימון ראשון דרך <Link href="/workouts" className="underline underline-offset-4">עמוד האימונים</Link>.</li>
          <li>מוסיפים ארוחה ב-<Link href="/nutrition" className="underline underline-offset-4">תזונה</Link> כשנוח.</li>
        </ol>
      </section>

      <section className="grid gap-2">
        <h2 className="text-xl font-semibold">פרטיות ופשטות 🔒</h2>
        <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">
          הנתונים שלך שייכים לך. המטרה שלנו: לשמור על חוויה נקייה, מהירה ופשוטה —
          בלי הסחות, ועם שליטה מלאה ביומן האימונים והתזונה.
        </p>
      </section>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 pt-2">
        <Link
          href="/workouts"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 bg-foreground text-background hover:opacity-90"
        >
          קדימה לאימונים 🏁
        </Link>
        <Link
          href="/nutrition"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          הוספת אכילה 🍽️
        </Link>
        <Link
          href="/equipment"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          מכשירים 🧰
        </Link>
        <Link
          href="/profile"
          className="inline-flex items-center justify-center rounded-md px-4 py-2 h-11 border border-black/10 dark:border-white/20 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          פרופיל ומדידות 📏
        </Link>
      </div>
    </section>
  );
}
