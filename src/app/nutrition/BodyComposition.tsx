// src/app/nutrition/BodyComposition.tsx
'use client';

import React, { useMemo } from 'react';

/* =========================
   TYPES & HELPERS
   ========================= */

const round2 = (num: number) => Math.round(num * 100) / 100;
const format1Dec = (n: number) => n.toFixed(1);

function SectionCard({ title, children }: { title: string, children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 md:p-6 shadow-sm mb-6">
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      {children}
    </div>
  );
}

type Gender = 'male' | 'female' | 'other' | 'unspecified';

export interface Profile {
  user_id: string;
  gender: Gender | null;
  height_cm: number | null;
}

export interface BodyMeas {
  id: number;
  measured_at: string;
  weight_kg: number | null;
  body_fat_percent: number | null;
  neck_cm?: number | null;
  waist_cm?: number | null;
  waist_navel_cm?: number | null;
  waist_narrow_cm?: number | null;
  hips_cm?: number | null;
  chest_cm?: number | null;
  shoulders_cm?: number | null;
  biceps_cm?: number | null;
  thigh_cm?: number | null;
  calf_cm?: number | null;
}

const log10 = (x: number) => Math.log(x) / Math.LN10;
const toNum = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function estimateBfFromTape(opts: {
  gender: Gender | null;
  height_cm: number | null;
  neck_cm: number | null;
  waist_cm_like: number | null;
  hips_cm: number | null;
}): number | null {
  const cm2in = (cm: number) => cm / 2.54;
  const h = toNum(opts.height_cm);
  const neck = toNum(opts.neck_cm);
  const waist = toNum(opts.waist_cm_like);
  const hips = toNum(opts.hips_cm);

  if (!h || !neck || !waist) return null;
  const hIn = cm2in(h);
  const neckIn = cm2in(neck);
  const waistIn = cm2in(waist);

  if (opts.gender === 'female') {
    if (!hips) return null;
    const hipsIn = cm2in(hips);
    const val = 163.205 * log10(waistIn + hipsIn - neckIn) - 97.684 * log10(hIn) - 78.387;
    return Math.max(2, Math.min(60, round2(val)));
  } else {
    const diff = waistIn - neckIn;
    if (diff <= 0) return null;
    const val = 86.010 * log10(diff) - 70.041 * log10(hIn) + 36.76;
    return Math.max(2, Math.min(50, round2(val)));
  }
}

/* =========================
   COMPONENT
   ========================= */

export default function BodyComposition({
  profile,
  measurements,
}: {
  profile: Profile | null;
  measurements: BodyMeas[];
}) {

  const processedData = useMemo(() => {
    if (!measurements || measurements.length === 0) return [];
    const sorted = [...measurements].sort((a, b) => +new Date(a.measured_at) - +new Date(b.measured_at));

    return sorted.map(m => {
      const weight = toNum(m.weight_kg);
      if (!weight) return null;

      let bf = toNum(m.body_fat_percent);
      let isEstimated = false;

      if (bf == null) {
        const waistLike = toNum(m.waist_navel_cm) ?? toNum(m.waist_cm) ?? toNum(m.waist_narrow_cm);
        bf = estimateBfFromTape({
          gender: profile?.gender ?? null,
          height_cm: profile?.height_cm ?? null,
          neck_cm: toNum(m.neck_cm),
          waist_cm_like: waistLike,
          hips_cm: toNum(m.hips_cm)
        });
        if (bf != null) isEstimated = true;
      }

      if (bf == null) return null; 

      const fatMass = weight * (bf / 100);
      const leanMass = weight - fatMass;

      return {
        date: new Date(m.measured_at),
        weight: round2(weight),
        bf: round2(bf),
        fatMass: round2(fatMass),
        leanMass: round2(leanMass),
        isEstimated,
        raw: m
      };
    }).filter(Boolean) as Array<{
      date: Date, weight: number, bf: number, fatMass: number, leanMass: number, isEstimated: boolean, raw: BodyMeas
    }>;
  }, [measurements, profile]);

  if (processedData.length < 2) {
    return (
      <div className="animate-in fade-in duration-300">
        <SectionCard title="הרכב גוף (מגמות והיקפים)">
          <div className="bg-gray-50 dark:bg-white/5 border border-black/5 dark:border-white/10 p-8 rounded-2xl text-center shadow-sm">
            <div className="text-4xl mb-4">📊</div>
            <h4 className="font-bold text-lg mb-2">חסרים נתונים להשוואה</h4>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              כדי להציג את השפעת המדידות על השריר והשומן, נדרשות לפחות 2 מדידות הכוללות משקל ונתוני היקפים (מותן וצוואר).
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  const current = processedData[processedData.length - 1];
  const previous = processedData[processedData.length - 2];

  const deltaWeight = round2(current.weight - previous.weight);
  const deltaBf = round2(current.bf - previous.bf);
  const deltaFat = round2(current.fatMass - previous.fatMass);
  const deltaLean = round2(current.leanMass - previous.leanMass);

  // 1. המצפן (סטטוס)
  let status: 'good' | 'warn' | 'bad' | 'neutral' = 'neutral';
  let messageTitle = '';

  if (deltaWeight < -0.3) {
    if (deltaLean >= 0) { status = 'good'; messageTitle = 'חיטוב מושלם! (איבוד שומן ושמירה על שריר)'; } 
    else if (deltaLean < 0 && Math.abs(deltaLean) <= Math.abs(deltaWeight) * 0.3) { status = 'good'; messageTitle = 'ירידה איכותית ותקינה'; } 
    else { status = 'warn'; messageTitle = 'אזהרה: איבוד מסת שריר מואץ'; }
  } else if (deltaWeight > 0.3) {
    if (deltaLean > deltaFat * 1.5) { status = 'good'; messageTitle = 'עלייה נקייה (Clean Bulk)'; } 
    else if (deltaLean > 0) { status = 'warn'; messageTitle = 'עלייה במסה עם צבירת שומן'; } 
    else { status = 'bad'; messageTitle = 'השמנה ללא בניית שריר'; }
  } else {
    if (deltaFat < -0.3 && deltaLean > 0.3) { status = 'good'; messageTitle = 'ריקומפוזיציה (Recomp) מעולה!'; } 
    else if (deltaFat > 0.5 && deltaLean < -0.5) { status = 'warn'; messageTitle = 'ירידה באיכות הרכב הגוף'; } 
    else { status = 'neutral'; messageTitle = 'שמירה על הקיים (Maintenance)'; }
  }

  const statusColors = {
    good: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-100',
    warn: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-100',
    bad: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-900 dark:text-red-100',
    neutral: 'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-gray-100'
  };

  const statusIcons = { good: '✅', warn: '⚠️', bad: '⛔', neutral: '➖' };

  // 2. רדאר היקפים חכם (מחפש נתונים היסטוריים אם קיימים)
  const muscleMeasurements = [
    { key: 'biceps_cm', label: 'יד קדמית' },
    { key: 'shoulders_cm', label: 'כתפיים' },
    { key: 'chest_cm', label: 'חזה' },
    { key: 'thigh_cm', label: 'ירך קדמית' },
    { key: 'calf_cm', label: 'שוק' },
  ];

  const fatMeasurements = [
    { key: 'waist_navel_cm', label: 'מותן (טבור)' },
    { key: 'waist_narrow_cm', label: 'מותן (צרה)' },
    { key: 'hips_cm', label: 'ירכיים/אגן' },
  ];

  let totalMuscleDiff = 0;
  let validMuscleCount = 0;

  // פונקציית עזר למציאת הנתון ההיסטורי הרלוונטי האחרון
  const getPrevValidValue = (key: keyof BodyMeas) => {
    for (let i = processedData.length - 2; i >= 0; i--) {
      const val = toNum(processedData[i].raw[key]);
      if (val !== null) return val;
    }
    return null;
  };

  const renderMuscleItem = (item: any) => {
    const currVal = toNum(current.raw[item.key as keyof BodyMeas]);
    const prevVal = getPrevValidValue(item.key as keyof BodyMeas);
    
    // אם לא נמדד הפעם, אבל יש היסטוריה
    if (currVal === null) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0 opacity-50 grayscale">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-gray-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-gray-500 font-bold">לא נמדד</span>
          </div>
          <div className="text-xs text-gray-400 font-medium" dir="ltr">
            {prevVal !== null ? format1Dec(prevVal) : '--'} cm <span className="mx-1">➔</span> -- cm
          </div>
        </div>
      );
    }
    
    // אם נמדד הפעם, אבל אין שום היסטוריה להשוות אליה
    if (prevVal === null) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">מדידת בסיס</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium" dir="ltr">
            -- cm <span className="mx-1">➔</span> {format1Dec(currVal)} cm
          </div>
        </div>
      );
    }
    
    // יש גם נוכחי וגם עבר - מציגים את השינוי!
    const diff = round2(currVal - prevVal);
    totalMuscleDiff += diff;
    validMuscleCount++;

    const isGood = diff >= 0; // לשריר: עליה או שימור זה טוב
    
    return (
      <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${isGood ? 'text-emerald-500' : 'text-orange-500'}`} dir="ltr">
            {diff > 0 ? '+' : ''}{diff}cm {isGood ? '⬆️' : '⬇️'}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium" dir="ltr">
          {format1Dec(prevVal)} cm <span className="mx-1">➔</span> {format1Dec(currVal)} cm
        </div>
      </div>
    );
  };

  const renderFatItem = (item: any) => {
    const currVal = toNum(current.raw[item.key as keyof BodyMeas]);
    const prevVal = getPrevValidValue(item.key as keyof BodyMeas);
    
    // אם לא נמדד הפעם
    if (currVal === null) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0 opacity-50 grayscale">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-gray-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-gray-500 font-bold">לא נמדד</span>
          </div>
          <div className="text-xs text-gray-400 font-medium" dir="ltr">
            {prevVal !== null ? format1Dec(prevVal) : '--'} cm <span className="mx-1">➔</span> -- cm
          </div>
        </div>
      );
    }
    
    // אם נמדד הפעם, אבל אין שום היסטוריה
    if (prevVal === null) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">מדידת בסיס</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium" dir="ltr">
            -- cm <span className="mx-1">➔</span> {format1Dec(currVal)} cm
          </div>
        </div>
      );
    }
    
    const diff = round2(currVal - prevVal);
    const isGood = diff <= 0; // לשומן: ירידה או שימור זה טוב
    
    return (
      <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${isGood ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">
            {diff > 0 ? '+' : ''}{diff}cm {isGood ? '⬇️' : '⬆️'}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium" dir="ltr">
          {format1Dec(prevVal)} cm <span className="mx-1">➔</span> {format1Dec(currVal)} cm
        </div>
      </div>
    );
  };

  const muscleElements = muscleMeasurements.map(renderMuscleItem);
  const fatElements = fatMeasurements.map(renderFatItem);

  // יצירת משפט חיבור הגיוני רק אם יש נתונים ברי השוואה
  let correlationMessage = null;
  if (validMuscleCount > 0) {
    const muscleTrendPositive = totalMuscleDiff >= 0;
    const lbmPositive = deltaLean >= 0;

    if (lbmPositive && muscleTrendPositive) {
      correlationMessage = "✅ המגמה תואמת: העלייה ב-LBM מגובה בעלייה בפועל בהיקפי השרירים.";
    } else if (!lbmPositive && !muscleTrendPositive) {
      correlationMessage = "⚠️ המגמה תואמת: איבוד מסת השריר משתקף גם בירידה בהיקפי השרירים.";
    } else if (lbmPositive && !muscleTrendPositive) {
      correlationMessage = "ℹ️ ה-LBM מראה עלייה, אך היקפי השרירים ירדו. ייתכן שחלק מהעלייה נובעת מנוזלים.";
    } else {
      correlationMessage = "ℹ️ ה-LBM מראה ירידה, אך שמרת על היקפי השרירים! ייתכן שאיבדת רק נוזלים ולא שריר.";
    }
  }

  return (
    <div className="animate-in fade-in duration-300">
      <SectionCard title="הרכב גוף">
        
        {/* ========================================= */}
        {/* 1. המצפן (סטטוס ונתונים מול מדידה קודמת) */}
        {/* ========================================= */}
        <div className={`p-4 md:p-5 rounded-2xl border ${statusColors[status]} mb-8 flex flex-col md:flex-row gap-4 items-center md:items-start shadow-sm`}>
          <div className="text-4xl">{statusIcons[status]}</div>
          <div className="flex-1 w-full text-center md:text-right">
            <h4 className="font-bold text-lg mb-4">{messageTitle}</h4>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="משקל" current={current.weight} prev={previous.weight} unit="kg" reverseColors={true} />
              <StatBox label="אחוז שומן" current={current.bf} prev={previous.bf} unit="%" reverseColors={true} />
              <StatBox label="שומן נקי (FM)" current={current.fatMass} prev={previous.fatMass} unit="kg" reverseColors={true} />
              <StatBox label="מסת שריר (LBM)" current={current.leanMass} prev={previous.leanMass} unit="kg" reverseColors={false} />
            </div>
            
            <BfGauge bf={current.bf} gender={profile?.gender ?? 'male'} />
          </div>
        </div>

        {/* ========================================= */}
        {/* 2. רדאר ההיקפים (השפעת השריר והשומן) */}
        {/* ========================================= */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 mb-4">
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">רדאר היקפים: נתונים פיזיים</h3>
            {correlationMessage && (
              <div className="text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                {correlationMessage}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            
            {/* כרטיס מדדי שריר */}
            <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 border-b border-gray-100 dark:border-white/10 pb-2">
                <span className="text-lg">💪</span>
                <div>
                  <h4 className="font-bold text-sm">מדדי מסת שריר</h4>
                  <p className="text-[10px] text-gray-500">השוואה: מדידה אחרונה לעומת נוכחית</p>
                </div>
              </div>
              <div className="flex flex-col">
                {muscleElements}
              </div>
            </div>

            {/* כרטיס מדדי שומן */}
            <div className="bg-white dark:bg-[#1a1a1a] border border-gray-100 dark:border-white/10 rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3 border-b border-gray-100 dark:border-white/10 pb-2">
                <span className="text-lg">🧲</span>
                <div>
                  <h4 className="font-bold text-sm">מדדי אגירת שומן</h4>
                  <p className="text-[10px] text-gray-500">השוואה: מדידה אחרונה לעומת נוכחית</p>
                </div>
              </div>
              <div className="flex flex-col">
                {fatElements}
              </div>
            </div>

          </div>
        </div>

        {/* ========================================= */}
        {/* 3. גרף הצטלבות (X-Graph) אמיתי */}
        {/* ========================================= */}
        <div>
          <h3 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wide">גרף מגמה: שריר לעומת שומן</h3>
          <div className="bg-white dark:bg-[#1a1a1a] p-4 md:p-6 rounded-xl border border-gray-200 dark:border-white/10 shadow-sm">
            <CrossGraph data={processedData} />
            <div className="flex justify-center gap-6 mt-2 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm"></span> מסת שריר (LBM)</div>
              <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm"></span> מסת שומן (FM)</div>
            </div>
          </div>
        </div>

      </SectionCard>
    </div>
  );
}

// ---- Sub Components ----

function StatBox({ label, current, prev, unit, reverseColors }: { label: string, current: number, prev: number, unit: string, reverseColors: boolean }) {
  const delta = round2(current - prev);
  const isPositive = delta > 0;
  const isNeutral = delta === 0;
  
  let colorClass = 'text-gray-500';
  if (!isNeutral) {
    if (reverseColors) {
      colorClass = isPositive ? 'text-red-500' : 'text-emerald-500'; 
    } else {
      colorClass = isPositive ? 'text-emerald-500' : 'text-red-500'; 
    }
  }

  return (
    <div className="bg-white/60 dark:bg-black/20 p-3 rounded-lg border border-black/5 dark:border-white/5 text-center flex flex-col justify-center shadow-sm">
      <span className="text-[10px] md:text-xs font-bold opacity-70 mb-1">{label}</span>
      <span className="text-lg md:text-xl font-black leading-none mb-1 tabular-nums">
        {format1Dec(current)}<span className="text-[10px] font-normal ml-0.5">{unit}</span>
      </span>
      <span className={`text-[10px] font-bold ${colorClass} tabular-nums`} dir="ltr">
        {isNeutral ? 'ללא שינוי' : `${isPositive ? '+' : ''}${format1Dec(delta)}${unit}`}
      </span>
    </div>
  );
}

// מדד נורמה ויזואלי לאחוז שומן מתוקן
function BfGauge({ bf, gender }: { bf: number, gender: string }) {
  const isFemale = gender === 'female';
  const min = isFemale ? 10 : 2;
  const max = isFemale ? 40 : 30;
  
  // מניעת חריגה מגבולות הגרף
  const pct = Math.max(0, Math.min(100, ((bf - min) / (max - min)) * 100));
  
  let category = 'עודף';
  if (isFemale) {
    if (bf <= 20) category = 'אתלטי / תחרותי';
    else if (bf <= 24) category = 'כושר (Fitness)';
    else if (bf <= 31) category = 'תקין וממוצע';
  } else {
    if (bf <= 13) category = 'אתלטי / תחרותי';
    else if (bf <= 17) category = 'כושר (Fitness)';
    else if (bf <= 24) category = 'תקין וממוצע';
  }

  return (
    <div className="mt-8 pt-5 border-t border-black/10 dark:border-white/10 relative">
      <div className="flex justify-between items-end mb-3">
        <span className="text-sm font-bold opacity-80">מדד אחוז שומן נוכחי:</span>
        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{category}</span>
      </div>

      {/* LTR נכפה כאן כדי שהגרף יזרום באופן תקין משמאל (נמוך/ירוק) לימין (גבוה/אדום) */}
      <div dir="ltr" className="relative h-3 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 shadow-inner mt-6">
        
        {/* הסמן שיושב על הגרף עם המספר שמוצג מעליו */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-800 dark:border-gray-200 rounded-full shadow-md z-10 transition-all duration-700" 
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
        >
          {/* בלונית הנתון */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[11px] font-black px-2 py-1 rounded shadow-lg whitespace-nowrap">
            {format1Dec(bf)}%
          </div>
        </div>

      </div>

      <div dir="ltr" className="flex justify-between text-[10px] mt-2 opacity-50 font-bold px-1">
        <span>{min}% (מינימום)</span>
        <span>{max}%+ (עודף)</span>
      </div>
    </div>
  );
}

// גרף קווים עם נקודות HTML (למניעת מתיחת אליפסות) ותצוגת נתונים
function CrossGraph({ data }: { data: any[] }) {
  if (data.length < 2) return null;

  const fData = data.map(d => d.fatMass);
  const lData = data.map(d => d.leanMass);
  const allVals = [...fData, ...lData];
  
  // הוספת מרווחים (Padding) לציר ה-Y כדי שהנקודות והטקסט לא ייחתכו
  const min = Math.max(0, Math.min(...allVals) - 3);
  const max = Math.max(...allVals) + 3;
  const range = max - min;

  // יצירת הקווים המחברים עבור ה-SVG
  const getPoints = (arr: number[]) => arr.map((val, i) => {
    const x = (i / (arr.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="relative w-full h-56 mt-4 mb-6" dir="ltr"> {/* LTR is strictly required for the timeline to flow correctly */}
      
      {/* קווי אורך - גריד רקע */}
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 dark:opacity-10 z-0">
        <div className="border-b border-black dark:border-white h-0"></div>
        <div className="border-b border-black dark:border-white h-0"></div>
        <div className="border-b border-black dark:border-white h-0"></div>
        <div className="border-b border-black dark:border-white h-0"></div>
      </div>

      {/* SVG אחראי אך ורק על ציור הקווים (ללא עיגולים) */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-0">
        <polyline points={getPoints(lData)} fill="none" stroke="#6366f1" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={getPoints(fData)} fill="none" stroke="#fbbf24" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>

      {/* יצירת הנקודות והטקסטים בעזרת HTML רגיל כדי לשמור על פרופורציה עיגולית מושלמת */}
      {data.map((d, i) => {
        const xPct = (i / (data.length - 1)) * 100;
        const fY = 100 - ((d.fatMass - min) / range) * 100;
        const lY = 100 - ((d.leanMass - min) / range) * 100;

        return (
          <div key={i} className="absolute inset-0 pointer-events-none z-10">
            {/* ציר זמן X בתחתית הנקודה */}
            <div className="absolute text-[10px] text-gray-500 font-medium whitespace-nowrap" style={{ left: `${xPct}%`, bottom: '-24px', transform: 'translateX(-50%)' }}>
              {d.date.toLocaleDateString('he-IL').slice(0, 5)}
            </div>

            {/* נקודת מסת שריר + ערך מספרי מעליה */}
            <div className="absolute w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-[#1a1a1a] rounded-full shadow-sm" style={{ left: `${xPct}%`, top: `${lY}%`, transform: 'translate(-50%, -50%)' }}></div>
            <div className="absolute text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-white/80 dark:bg-[#1a1a1a]/80 px-1 rounded backdrop-blur-sm" style={{ left: `${xPct}%`, top: `calc(${lY}% - 22px)`, transform: 'translateX(-50%)' }}>
              {format1Dec(d.leanMass)}
            </div>

            {/* נקודת מסת שומן + ערך מספרי מתחתיה */}
            <div className="absolute w-3.5 h-3.5 bg-amber-400 border-2 border-white dark:border-[#1a1a1a] rounded-full shadow-sm" style={{ left: `${xPct}%`, top: `${fY}%`, transform: 'translate(-50%, -50%)' }}></div>
            <div className="absolute text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-white/80 dark:bg-[#1a1a1a]/80 px-1 rounded backdrop-blur-sm" style={{ left: `${xPct}%`, top: `calc(${fY}% + 12px)`, transform: 'translateX(-50%)' }}>
              {format1Dec(d.fatMass)}
            </div>
          </div>
        );
      })}
    </div>
  );
}