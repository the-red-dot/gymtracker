// src/app/page.tsx
'use client';

/**
 * עמוד בית פשוט: ברכה + הסבר קצר + קישורי פעולה (עם אמוג'ים 😄)
 * כולל באנר "בטא" בחלק העליון.
 */

import Link from 'next/link';

export default function Home() {
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

      {/* הסבר קצר על העמודים */}
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
      </div>

      <footer className="pt-2 text-xs text-gray-500 dark:text-gray-400">
        טיפ: להתחלה מהירה — היכנס/י ל״אימונים״ לפתיחת אימון חדש, או ל״תזונה״ להוספת הארוחה הבאה. 🚀
      </footer>
    </section>
  );
}

function FeatureCard({
  title,
  href,
  points,
}: {
  title: string;
  href: string;
  points: string[];
}) {
  return (
    <section className="rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-background">
      <div className="p-4 md:p-5 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Link
          href={href}
          className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
        >
          מעבר לעמוד →
        </Link>
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
