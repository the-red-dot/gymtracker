'use client';

import React, { useMemo, useState } from 'react';

/* =========================
   TYPES & HELPERS
   ========================= */

const round2 = (num: number) => Math.round(num * 100) / 100;
const format1Dec = (n: number | null | undefined) => (n == null || isNaN(n)) ? '--' : Number(n).toFixed(1);
const format2Dec = (n: number | null | undefined) => (n == null || isNaN(n)) ? '--' : Number(n).toFixed(2);
const formatDateShort = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;

// כרטיסייה חכמה עם הסבר נפתח/נסגר (אקורדיון)
function SectionCard({ title, subtitle, explanation, children }: { title: string, subtitle?: string, explanation?: React.ReactNode, children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 md:p-6 shadow-sm mb-6 relative overflow-hidden">
      <div className="mb-5 border-b border-black/5 dark:border-white/5 pb-4 flex flex-col gap-2">
        <div className="flex justify-between items-start gap-4">
          <h2 className="text-xl md:text-2xl font-bold">{title}</h2>
          {explanation && (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
            >
              <span className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
              מה זה אומר?
            </button>
          )}
        </div>
        {subtitle && <p className="text-sm text-gray-500 leading-relaxed">{subtitle}</p>}
        
        {/* Expanded Explanation Area */}
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/20 rounded-xl text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed">
                    {explanation}
                </div>
            </div>
        </div>
      </div>
      {children}
    </div>
  );
}

type Gender = 'male' | 'female' | 'other' | 'unspecified';

export interface Profile {
  user_id: string;
  gender: Gender | null;
  height_cm: number | null;
  birth_date?: string | null;
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

const toNum = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const log10 = (x: number) => Math.log(x) / Math.LN10;

/* --- Math Models based on Research --- */

function calcTimeAwareEmaArray(measurements: { weight: number, date: Date }[], dailyAlpha = 0.1): number[] {
  if (!measurements.length) return [];
  const ema = [measurements[0].weight];
  
  for (let i = 1; i < measurements.length; i++) {
    const curr = measurements[i];
    const prev = measurements[i - 1];
    
    const diffTime = Math.abs(curr.date.getTime() - prev.date.getTime());
    const diffDays = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24))); 

    const dynamicAlpha = 1 - Math.pow(1 - dailyAlpha, diffDays);
    ema.push(dynamicAlpha * curr.weight + (1 - dynamicAlpha) * ema[i - 1]);
  }
  return ema;
}

function calcRFM(gender: Gender | null, height: number, waist: number): number | null {
  if (!gender || gender === 'unspecified' || gender === 'other' || !height || !waist) return null;
  if (gender === 'male') return 64 - 20 * (waist / (height / 100));
  return 76 - 20 * (waist / (height / 100));
}

function calcNavy(opts: { gender: Gender | null; height_cm: number | null; neck_cm: number | null; waist_cm: number | null; hips_cm: number | null; }): number | null {
  const cm2in = (cm: number) => cm / 2.54;
  const h = toNum(opts.height_cm);
  const neck = toNum(opts.neck_cm);
  const waist = toNum(opts.waist_cm);
  const hips = toNum(opts.hips_cm);

  if (!h || !neck || !waist) return null;
  const hIn = cm2in(h);
  const neckIn = cm2in(neck);
  const waistIn = cm2in(waist);

  if (opts.gender === 'female') {
    if (!hips) return null;
    const hipsIn = cm2in(hips);
    const val = 163.205 * log10(waistIn + hipsIn - neckIn) - 97.684 * log10(hIn) - 78.387;
    return Math.max(2, Math.min(60, val));
  } else {
    const diff = waistIn - neckIn;
    if (diff <= 0) return null;
    const val = 86.010 * log10(diff) - 70.041 * log10(hIn) + 36.76;
    return Math.max(2, Math.min(50, val));
  }
}

function calcSMM(gender: Gender | null, weight: number, waist: number, hip: number, height: number, age: number): number | null {
  if (!gender || gender === 'unspecified' || gender === 'other') return null;
  if (gender === 'male') {
    return 39.5 + 0.665 * weight - 0.185 * waist - 0.418 * hip - 0.08 * age;
  } else {
    return 2.89 + 0.255 * weight - 0.175 * hip - 0.038 * age + 0.118 * height;
  }
}

function getAge(birthDateStr?: string | null): number {
  if (!birthDateStr) return 30; 
  const b = new Date(birthDateStr);
  if (isNaN(b.getTime())) return 30;
  const today = new Date();
  let age = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--;
  return age;
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

  const sortedRawMeasurements = useMemo(() => {
    if (!measurements) return [];
    return [...measurements].sort((a, b) => +new Date(a.measured_at) - +new Date(b.measured_at));
  }, [measurements]);

  const { processedData, statusInfo } = useMemo(() => {
    if (sortedRawMeasurements.length === 0) return { processedData: [], statusInfo: null };
    
    const validMeasurements = sortedRawMeasurements
      .filter(m => toNum(m.weight_kg) !== null)
      .map(m => ({ weight: toNum(m.weight_kg)!, date: new Date(m.measured_at) }));
    
    if (validMeasurements.length === 0) return { processedData: [], statusInfo: null };

    const emaWeights = calcTimeAwareEmaArray(validMeasurements, 0.1);
    let weightIdx = 0;

    const age = getAge(profile?.birth_date);
    const h = toNum(profile?.height_cm);
    const hm = h ? h / 100 : null;

    const enriched = sortedRawMeasurements.map((m) => {
      const rawW = toNum(m.weight_kg);
      if (!rawW) return null; 
      
      const emaW = emaWeights[weightIdx++];
      
      const waist = toNum(m.waist_navel_cm) ?? toNum(m.waist_cm) ?? toNum(m.waist_narrow_cm);
      const neck = toNum(m.neck_cm);
      const hips = toNum(m.hips_cm);
      const chest = toNum(m.chest_cm);
      const shoulders = toNum(m.shoulders_cm);

      let bf = toNum(m.body_fat_percent);
      if (bf == null && h && waist) {
        const navy = neck ? calcNavy({ gender: profile?.gender ?? null, height_cm: h, neck_cm: neck, waist_cm: waist, hips_cm: hips }) : null;
        const rfm = calcRFM(profile?.gender ?? null, h, waist);
        if (navy && rfm) bf = (navy + rfm) / 2;
        else bf = navy || rfm;
      }

      let fm = null, lbm = null, ffmi = null, smm = null;
      if (bf != null) {
        fm = emaW * (bf / 100);
        lbm = emaW - fm;
        if (hm) {
          const rawFfmi = lbm / (hm * hm);
          ffmi = rawFfmi + 6.1 * (1.8 - hm); 
        }
      }

      if (waist && hips && h) {
        smm = calcSMM(profile?.gender ?? null, emaW, waist, hips, h, age);
      }

      return {
        date: new Date(m.measured_at),
        rawWeight: rawW,
        emaWeight: emaW,
        bf, fm, lbm, ffmi, smm,
      };
    }).filter(Boolean) as any[];

    let status = null;
    if (enriched.length >= 2) {
      const first = enriched[enriched.length - 2];
      const last = enriched[enriched.length - 1];

      const weightChange = last.emaWeight - first.emaWeight;
      const lbmChange = (last.lbm || 0) - (first.lbm || 0);

      let waistChange = 0;
      let lastWaist = null;
      let prevWaist = null;
      for (let i = sortedRawMeasurements.length - 1; i >= 0; i--) {
        const w = toNum(sortedRawMeasurements[i].waist_navel_cm) ?? toNum(sortedRawMeasurements[i].waist_cm);
        if (w !== null) {
            if (lastWaist === null) lastWaist = w;
            else if (prevWaist === null) { prevWaist = w; break; }
        }
      }
      if (lastWaist !== null && prevWaist !== null) waistChange = lastWaist - prevWaist;

      if (Math.abs(weightChange) <= 1.0 && waistChange < -1 && lbmChange > 0) {
        status = {
          type: 'recomp',
          title: 'רקומפוזיציה זוהתה! 🎯',
          text: 'משקל המגמה שלך נותר יציב, אך מסת השריר גדלה והיקף המותן פוחת. הגוף שלך שורף שומן ובונה שריר בו-זמנית. התעלם מהמשקל הקבוע, אתה במסלול המושלם!'
        };
      } else if (weightChange < -0.5 && lbmChange >= -0.2) {
        status = {
          type: 'cut_good',
          title: 'חיטוב איכותי (איבוד שומן ושמירה על שריר) 🔪',
          text: 'המשקל יורד ואתה שומר באופן מצוין על מסת הגוף הרזה (LBM). תהליך איבוד השומן יעיל מאוד.'
        };
      } else if (weightChange > 1.0 && lbmChange > 0.5) {
        status = {
          type: 'bulk_good',
          title: 'בניית מסה חיובית 📈',
          text: 'עלייה במשקל מלווה בעלייה ברורה ב-FFMI (מסת שריר נטו). פרוגרסיב אוברלוד עובד!'
        };
      } else if (weightChange < -0.5 && lbmChange < -0.5) {
        status = {
          type: 'warn',
          title: 'שים לב: איבוד משקל ושריר ⚠️',
          text: 'המשקל יורד אך המערכת מזהה גם איבוד של מסת שריר. מומלץ להקפיד על צריכת חלבון ואימוני התנגדות.'
        }
      }
    }

    return { processedData: enriched, statusInfo: status };
  }, [sortedRawMeasurements, profile]);

  const getHistoricalValues = (key: keyof BodyMeas) => {
    let curr: { val: number; date: Date } | null = null;
    let prev: { val: number; date: Date } | null = null;

    for (let i = sortedRawMeasurements.length - 1; i >= 0; i--) {
      const val = toNum(sortedRawMeasurements[i][key]);
      if (val !== null) {
        if (!curr) {
          curr = { val, date: new Date(sortedRawMeasurements[i].measured_at) };
        } else if (!prev) {
          prev = { val, date: new Date(sortedRawMeasurements[i].measured_at) };
          break; 
        }
      }
    }
    return { curr, prev };
  };

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

  const renderMuscleItem = (item: any) => {
    const { curr, prev } = getHistoricalValues(item.key as keyof BodyMeas);
    
    if (!curr) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0 opacity-50 grayscale">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-gray-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-gray-500 font-bold">לא נמדד</span>
          </div>
          <div className="text-xs text-gray-400 font-medium" dir="ltr">-- cm <span className="mx-1">➔</span> -- cm</div>
        </div>
      );
    }
    
    if (!prev) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">מדידת בסיס</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium" dir="ltr">
            -- cm <span className="mx-1">➔</span> {format1Dec(curr.val)} cm <span className="text-[9px] opacity-60">({formatDateShort(curr.date)})</span>
          </div>
        </div>
      );
    }
    
    const diff = curr.val - prev.val;
    totalMuscleDiff += diff;
    validMuscleCount++;
    const isGood = diff >= 0; 
    
    return (
      <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${isGood ? 'text-emerald-500' : 'text-orange-500'}`} dir="ltr">
            {diff > 0 ? '+' : ''}{format1Dec(diff)}cm {isGood ? '⬆️' : '⬇️'}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1" dir="ltr">
          <span>{format1Dec(prev.val)} cm</span>
          <span className="text-[9px] opacity-50">({formatDateShort(prev.date)})</span>
          <span className="mx-1">➔</span> 
          <span>{format1Dec(curr.val)} cm</span>
          <span className="text-[9px] opacity-50">({formatDateShort(curr.date)})</span>
        </div>
      </div>
    );
  };

  const renderFatItem = (item: any) => {
    const { curr, prev } = getHistoricalValues(item.key as keyof BodyMeas);
    
    if (!curr) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0 opacity-50 grayscale">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-gray-200 dark:bg-neutral-800 px-2 py-0.5 rounded text-gray-500 font-bold">לא נמדד</span>
          </div>
          <div className="text-xs text-gray-400 font-medium" dir="ltr">-- cm <span className="mx-1">➔</span> -- cm</div>
        </div>
      );
    }
    
    if (!prev) {
      return (
        <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">מדידת בסיס</span>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium" dir="ltr">
            -- cm <span className="mx-1">➔</span> {format1Dec(curr.val)} cm <span className="text-[9px] opacity-60">({formatDateShort(curr.date)})</span>
          </div>
        </div>
      );
    }
    
    const diff = curr.val - prev.val;
    const isGood = diff <= 0; 
    
    return (
      <div key={item.key} className="flex flex-col py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{item.label}</span>
          <span className={`text-sm font-bold flex items-center gap-1 ${isGood ? 'text-emerald-500' : 'text-red-500'}`} dir="ltr">
            {diff > 0 ? '+' : ''}{format1Dec(diff)}cm {isGood ? '⬇️' : '⬆️'}
          </span>
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1" dir="ltr">
          <span>{format1Dec(prev.val)} cm</span>
          <span className="text-[9px] opacity-50">({formatDateShort(prev.date)})</span>
          <span className="mx-1">➔</span> 
          <span>{format1Dec(curr.val)} cm</span>
          <span className="text-[9px] opacity-50">({formatDateShort(curr.date)})</span>
        </div>
      </div>
    );
  };

  const muscleElements = muscleMeasurements.map(renderMuscleItem);
  const fatElements = fatMeasurements.map(renderFatItem);

  let correlationMessage = null;
  if (validMuscleCount > 0 && processedData.length >= 2) {
    const currentPD = processedData[processedData.length - 1];
    const prevPD = processedData[processedData.length - 2];
    
    if (currentPD.lbm != null && prevPD.lbm != null) {
      const deltaLean = round2(currentPD.lbm - prevPD.lbm);
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
  }

  // --- Ratios Calculation ---
  const waistVal = getHistoricalValues('waist_navel_cm').curr?.val ?? getHistoricalValues('waist_cm').curr?.val ?? getHistoricalValues('waist_narrow_cm').curr?.val;
  const prevWaistVal = getHistoricalValues('waist_navel_cm').prev?.val ?? getHistoricalValues('waist_cm').prev?.val ?? getHistoricalValues('waist_narrow_cm').prev?.val;
  
  const chestVal = getHistoricalValues('chest_cm').curr?.val;
  const prevChestVal = getHistoricalValues('chest_cm').prev?.val;

  const hipVal = getHistoricalValues('hips_cm').curr?.val;
  const prevHipVal = getHistoricalValues('hips_cm').prev?.val;

  const shoulderVal = getHistoricalValues('shoulders_cm').curr?.val;
  const prevShoulderVal = getHistoricalValues('shoulders_cm').prev?.val;

  const currentWaistToChest = waistVal && chestVal ? waistVal / chestVal : null;
  const prevWaistToChest = prevWaistVal && prevChestVal ? prevWaistVal / prevChestVal : null;

  const currentWaistToHip = waistVal && hipVal ? waistVal / hipVal : null;
  const prevWaistToHip = prevWaistVal && prevHipVal ? prevWaistVal / prevHipVal : null;

  const currentWaistToShoulder = waistVal && shoulderVal ? waistVal / shoulderVal : null;
  const prevWaistToShoulder = prevWaistVal && prevShoulderVal ? prevWaistVal / prevShoulderVal : null;

  // =====================================
  // RENDER UI
  // =====================================

  if (processedData.length < 2 && sortedRawMeasurements.length < 2) {
    return (
      <div className="animate-in fade-in duration-300">
        <SectionCard title="דשבורד הרכב גוף מתקדם">
          <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-8 rounded-2xl text-center shadow-sm">
            <div className="text-4xl mb-4">🔬</div>
            <h4 className="font-bold text-lg text-indigo-900 dark:text-indigo-200 mb-2">מערכת אנליטית להרכב הגוף</h4>
            <p className="text-sm text-indigo-700 dark:text-indigo-300 max-w-md mx-auto">
              כדי להפעיל את האלגוריתמים (EMA, FFMI, ומודלי Ratios), נדרשות לפחות 2 מדידות היסטוריות הכוללות משקל והיקפים.
            </p>
          </div>
        </SectionCard>
      </div>
    );
  }

  const hasEnoughWeightData = processedData.length >= 2;
  const current = hasEnoughWeightData ? processedData[processedData.length - 1] : null;
  const previous = hasEnoughWeightData ? processedData[processedData.length - 2] : null;

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      
      {/* 1. STATUS BANNER */}
      {statusInfo && (
        <div className={`p-5 rounded-2xl border flex gap-4 items-center shadow-sm
          ${statusInfo.type === 'recomp' ? 'bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800/50' : 
            statusInfo.type.includes('good') ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50' : 
            statusInfo.type === 'warn' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50' :
            'bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10'}`}
        >
          <div className="flex-1 w-full text-center md:text-right">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-bold text-lg md:text-xl
                ${statusInfo.type === 'recomp' ? 'text-emerald-800 dark:text-emerald-300' : 
                  statusInfo.type.includes('good') ? 'text-emerald-800 dark:text-emerald-300' :
                  'text-amber-800 dark:text-amber-300'}`}>
                {statusInfo.title}
              </h3>
              <div className="text-3xl bg-white/50 dark:bg-black/20 p-2 rounded-xl shadow-sm">
                {statusInfo.type === 'recomp' ? '🎯' : statusInfo.type.includes('good') ? '✅' : '⚠️'}
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox 
                 label="מסת גוף רזה (LBM)" 
                 current={current?.lbm} prev={previous?.lbm} unit="kg" reverseColors={false} 
                 actionPlan={{
                     why: "מייצג את המשקל נטול השומן (שריר, עצמות, נוזלים). עלייה במדד זה מעידה לרוב על בניית שריר והאצת חילוף החומרים.",
                     diet: "כדי לבנות שריר יש להקפיד על עודף קלורי קל (במסה) או תחזוקה, יחד עם צריכת חלבון גבוהה (1.6-2.2 גרם לקילו).",
                     training: "אימוני התנגדות וכוח (משקולות/מכשירים) עם עקרון העומס המוסף (Progressive Overload) הם הדרך היחידה להגדיל נתון זה."
                 }}
              />
              <StatBox 
                 label="מסת שומן (FM)" 
                 current={current?.fm} prev={previous?.fm} unit="kg" reverseColors={true} 
                 actionPlan={{
                     why: "המשקל האבסולוטי של השומן שלך. ירידה כאן אומרת שבאמת שרפת רקמת שומן, בלי קשר לתנודות משקל נוזלים או שריר.",
                     diet: "המפתח הוא גירעון קלורי עקבי. אכול פחות קלוריות ממה שהגוף שורף (TDEE).",
                     training: "אימונים שורפים מעט קלוריות ישירות, אך אימוני כוח יבטיחו שהירידה במשקל תגיע מהשומן ולא מפירוק מסת שריר."
                 }}
              />
              <StatBox 
                 label="אחוז שומן" 
                 current={current?.bf} prev={previous?.bf} unit="%" reverseColors={true} 
                 actionPlan={{
                     why: "היחס בין השומן למשקל הכללי. משפיע על המראה המחוטב. חשוב להבין: ניתן להוריד אחוז שומן גם על ידי בניית שריר, ללא ירידה בגרם שומן!",
                     diet: "גירעון קלורי להורדת השומן, או לחלופין מאזן נטרלי עם חלבון גבוה לטובת 'רקומפוזיציה' (המרה איטית של יחס שומן/שריר).",
                     training: "שילוב של היפרטרופיה (להגדלת מסת השריר הכוללת) יחד עם אירובי יעזור להוריד את האחוז הכללי."
                 }}
              />
              <StatBox 
                 label="משקל כולל" 
                 current={current?.emaWeight} prev={previous?.emaWeight} unit="kg" reverseColors={true} 
                 actionPlan={{
                     why: "מספר אבסולוטי המורכב משומן, שריר, מים, ומזון. אל תיתן לו לנהל אותך רגשית - הוא בעיקר כלי עזר לחישוב קלוריות מתמטי.",
                     diet: "עלייה או ירידה במשקל הכללי נקבעות אך ורק ממאזן הקלוריות (Calories In vs. Calories Out).",
                     training: "האימונים שלך הם אלו שיקבעו איך המשקל הזה ייראה במראה (האם תראה מוצק וחזק או רך)."
                 }}
              />
            </div>
            
            {current?.bf != null && <BfGauge bf={current.bf} gender={profile?.gender ?? 'male'} />}
          </div>
        </div>
      )}

      {/* 2. NOISE FILTER: EMA vs RAW WEIGHT CHART */}
      {hasEnoughWeightData && (
        <SectionCard 
          title="משקל מגמה מוחלק (Time-Aware EMA Filter)" 
          subtitle="הקו הכחול מייצג את המשקל הפיזיולוגי האמיתי שלך, מנוקה מרעשים ותנודות יומיות."
          explanation="האלגוריתם מסנן קפיצות פתאומיות (כגון אגירת נוזלים לאחר ארוחה מלוחה או פחמימות). הוא לוקח בחשבון את הזמן שעבר בין המדידות כדי להתאים את המגמה (Trend), מה שמונע ממך לקבל החלטות פזיזות בגלל שקילה נקודתית."
        >
          <div className="bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-white/5">
              <div className="flex items-center justify-center sm:justify-end flex-wrap gap-4 mb-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500"></span> משקל מגמה (EMA)</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-600"></span> מדידות גולמיות (בפועל)</div>
              </div>
              
              <EmaChart data={processedData} />
              
              <div className="mt-2 flex flex-col sm:flex-row justify-between items-center px-2 pt-4 border-t border-black/5 dark:border-white/5 gap-2">
                  <div className="text-xs opacity-60 text-center sm:text-right">מסנן דינמי: מחושב את פער הימים בין המדידות</div>
                  <div className="text-sm">משקל מגמה נוכחי: <strong className="text-indigo-600 dark:text-indigo-400 text-lg tabular-nums" dir="ltr">{format1Dec(current?.emaWeight)}kg</strong></div>
              </div>
          </div>
        </SectionCard>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        
        {/* 3. COMPARTMENT ANALYSIS (FFMI & SMM) */}
        {hasEnoughWeightData && (
          <SectionCard 
            title="מסת שריר שלד (SMM & FFMI)"
            subtitle="ה-'GPS' שלך לדעת אם אתה באמת בונה שריר. המדדים מנכים את השומן מהמשקל ובוחנים רק את המסה הפעילה."
            explanation={
                <div className="space-y-3">
                  <p><strong>FFMI (Fat-Free Mass Index):</strong> מדד המנכה את השומן ובוחן את מסת השריר ביחס לגובה. בדומה ל-BMI, רק שהוא מתמקד בשריר. מחושב מתוך הגובה שלך ({profile?.height_cm || '?'} ס"מ), משקל המגמה ({format1Dec(current?.emaWeight)} ק"ג) ואחוז השומן המוערך ({format1Dec(current?.bf || 0)}%).</p>
                  <p><strong>שריר שלד נטו (SMM - Al-Gindan):</strong> הערכה מתמטית למסת שריר השלד האקטיבית (בקילוגרמים). מחושבת על בסיס היחס שבין המשקל הכולל להיקף המותן והאגן. ירידה במותן בזמן שמשקל המגמה יציב - תעלה נתון זה.</p>
                </div>
            }
          >
            {current?.ffmi ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div className="text-right">
                      <span className={`text-xs px-3 py-1 rounded-full font-bold
                        ${current.ffmi >= 22 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 
                          current.ffmi >= 20 ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 
                          'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}`}>
                          {getFfmiCategory(current.ffmi, profile?.gender ?? null)}
                      </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="text-4xl font-black text-indigo-700 dark:text-indigo-400 tabular-nums leading-none tracking-tight" dir="ltr">{format1Dec(current.ffmi)}</div>
                    <div className="text-[11px] font-bold opacity-50 uppercase tracking-wider mt-1">Normalized FFMI</div>
                  </div>
                </div>
                
                <div className="space-y-2 pt-2" dir="ltr">
                  <div className="h-4 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden relative shadow-inner">
                    <div 
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-400 to-indigo-600 transition-all duration-1000"
                        style={{ width: `${Math.min(100, Math.max(0, ((current.ffmi - 15) / (25 - 15)) * 100))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-bold opacity-50 px-1">
                      <span>15 (Avg)</span>
                      <span>20 (Athletic)</span>
                      <span>25 (Limit)</span>
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-900/10 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/20 text-xs text-indigo-800 dark:text-indigo-200 leading-relaxed">
                  <strong>איך הגענו לזה?</strong><br/>
                  ה-FFMI חושב מתוך הגובה שלך ({profile?.height_cm || '?'} ס"מ), משקל המגמה ({format1Dec(current.emaWeight)} ק"ג) ואחוז השומן המוערך ({format1Dec(current.bf || 0)}%).
                </div>

                {current.smm && (
                  <div className="pt-3 border-t border-black/5 dark:border-white/5 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                          <strong className="text-lg tabular-nums text-indigo-600 dark:text-indigo-400" dir="ltr">{format1Dec(current.smm)} kg</strong>
                          <span className="text-sm font-bold opacity-80" dir="ltr">:(Al-Gindan) שריר שלד נטו</span>
                      </div>
                      <div className="text-[11px] opacity-60 leading-relaxed">
                        הערכה מתמטית למסת שריר השלד האקטיבית. מחושבת על בסיס קורלציה של המשקל מול היקף המותן והאגן. ירידה במותן בזמן שמשקל המגמה יציב, תעלה נתון זה.
                      </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm opacity-60 text-center py-8">חסרים נתוני גובה או אחוז שומן לחישוב מדדים מתקדמים.</div>
            )}
          </SectionCard>
        )}

        {/* 4. AESTHETIC RATIOS */}
        {hasEnoughWeightData && (
          <SectionCard 
            title="אסתטיקה ופרופורציות (Ratios)"
            subtitle="מדדים אובייקטיביים הבוחנים את יחס ההיקפים שלך. ככל שהמדד מתקרב ליעד, הפרופורציות משתפרות."
            explanation={
                <div className="space-y-3">
                  <p>במקום להסתכל רק על המשקל, המערכת משווה בין ההיקפים השונים. שיפור כאן מעיד על שינוי פיזי משמעותי גם אם המשקל "תקוע".</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>V-Taper:</strong> מותן צרה ביחס לחזה רחב (מבנה משולש אתלטי).</li>
                    <li><strong>שעון חול / בריאות:</strong> אינדיקציה חזקה לשריפת שומן בטני (ויסרלי) וירידה בהיקף המותן ביחס לאגן.</li>
                    <li><strong>דומיננטיות:</strong> כתפיים רחבות הנישאות על מותן צרה. מדד קלאסי למראה אתלטי.</li>
                  </ul>
                </div>
            }
          >
            <div className="space-y-4">
                <RatioBar 
                    label="V-Taper (מותן לחזה)" 
                    value={currentWaistToChest} 
                    prevValue={prevWaistToChest}
                    target={0.72} 
                    targetLabel="0.72" 
                    inverse={true}
                    actionPlan={{
                        why: "יחס נמוך מעיד על חזה רחב ביחס למותן צרה, מה שיוצר מראה משולש ואתלטי בפלג הגוף העליון.",
                        diet: "כדי להצר את המותן נדרשת ירידה באחוזי שומן דרך גירעון קלורי מתון, תוך הקפדה על חלבון לשימור השריר.",
                        training: "התמקד בפיתוח שרירי החזה והרחבת הגב. מכשירים: לחיצת חזה (Bench Press), פרפר מכונה (Pec Deck), ומשיכת פולי עליון (Lat Pulldown)."
                    }}
                />
                <RatioBar 
                    label="שעון חול / בריאות (מותן לאגן)" 
                    value={currentWaistToHip} 
                    prevValue={prevWaistToHip}
                    target={profile?.gender === 'female' ? 0.75 : 0.85} 
                    targetLabel={profile?.gender === 'female' ? "0.80" : "0.90"} 
                    inverse={true} 
                    actionPlan={{
                        why: "סמן קריטי לבריאות הלב. מותן צרה ביחס לאגן מעידה על פחות שומן ויסרלי (עוטף איברים) מסוכן, ומבנה פלג גוף תחתון חזק.",
                        diet: "שילוב של גירעון קלורי לשריפת השומן הבטני, יחד עם צריכת חלבון מספקת לאפשר היפרטרופיה בפלג הגוף התחתון.",
                        training: "פיתוח מסת שריר בישבן ובירכיים. מכשירים/תרגילים: סקוואט (Squat), היפ-טראסט (Hip Thrust), לחיצת רגליים (Leg Press), ופשיטת ירך."
                    }}
                />
                <RatioBar 
                    label="דומיננטיות (מותן לכתפיים)" 
                    value={currentWaistToShoulder} 
                    prevValue={prevWaistToShoulder}
                    target={0.60} 
                    targetLabel="0.60" 
                    inverse={true} 
                    actionPlan={{
                        why: "כתפיים רחבות הנישאות על מותן צרה מקושרות פסיכולוגית למראה חזק ודומיננטי, ומשפרות דרמטית את היציבה.",
                        diet: "שמירה על משקל או ירידה קלה בשומן (להצרת המותן), עם עודף קלורי קל בימי אימון כתפיים (אם המטרה היא צבירת מסה).",
                        training: "התמקד בכתף האמצעית (Lateral Delts) ליצירת רוחב. מכשירים/תרגילים: הרחקת כתפיים לצדדים במשקולות/כבלים (Lateral Raises), ולחיצת כתפיים מעל הראש."
                    }}
                />
                
                {!currentWaistToChest && !currentWaistToHip && !currentWaistToShoulder && (
                    <div className="text-sm opacity-60 text-center py-4 bg-gray-50 dark:bg-white/5 rounded-lg">
                        הזן היקפי חזה, אגן או כתפיים כדי לראות פרופורציות.
                    </div>
                )}
            </div>
          </SectionCard>
        )}

      </div>

      {/* 2. RADAR - DECOUPLED FROM WEIGHT */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2 mb-4">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide">רדאר היקפים: נתונים פיזיים</h3>
          {correlationMessage && (
            <div className="text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-200 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800/30 shadow-sm">
              {correlationMessage}
            </div>
          )}
        </div>

        <SectionCard 
            title="השוואת היקפים (Radar)" 
            subtitle="השוואה ישירה של כל היקף מול הפעם הקודמת שהוא נמדד."
            explanation="הגרפים הפיזיים מראים לך איפה בדיוק הגוף השתנה. המערכת מחפשת את המדידה הקודמת עבור כל אזור ספציפי (גם אם נמדד בנפרד מהמשקל) ומראה האם עלית (ירוק בשרירים) או ירדת (ירוק בשומן)."
        >
            <div className="grid md:grid-cols-2 gap-6">
            {/* כרטיס מדדי שומן */}
            <div>
                <div className="flex items-center justify-end gap-2 mb-3 border-b border-gray-100 dark:border-white/10 pb-2">
                <div>
                    <h4 className="font-bold text-sm text-left">מדדי אגירת שומן</h4>
                </div>
                <span className="text-lg">🧲</span>
                </div>
                <div className="flex flex-col">
                {fatElements}
                </div>
            </div>

            {/* כרטיס מדדי שריר */}
            <div>
                <div className="flex items-center justify-end gap-2 mb-3 border-b border-gray-100 dark:border-white/10 pb-2">
                <div>
                    <h4 className="font-bold text-sm text-left">מדדי מסת שריר</h4>
                </div>
                <span className="text-lg">💪</span>
                </div>
                <div className="flex flex-col">
                {muscleElements}
                </div>
            </div>
            </div>
        </SectionCard>
      </div>

      {/* 5. MULTI-COMPARTMENT STACKED AREA CHART */}
      {hasEnoughWeightData && (
        <SectionCard 
            title="גרף מגמה: מסה רזה (LBM) לעומת מסת שומן (FM)"
            subtitle="מעקב אבסולוטי בקילוגרמים (ולא באחוזים) אחר הרכב הגוף שלך לאורך זמן."
            explanation={
                <div className="space-y-3">
                  <p>אחוז שומן יכול להטעות - אם עלית 2 קילו שריר ולא שינית את כמות השומן, אחוז השומן שלך ירד, למרות שלא שרפת גרם שומן! לכן הגרף הזה מציג קילוגרמים מוחלטים:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>מסת שומן (FM - צהוב):</strong> משקל רקמת השומן הטהורה. ירידה כאן אומרת שבאמת שרפת שומן.</li>
                    <li><strong>מסת גוף רזה (LBM - כחול):</strong> משקל הגוף ללא שומן (שריר, נוזלים, עצם). עליה בקו זה מעידה על צבירת מסה והתאוששות.</li>
                  </ul>
                  <p>ברקומפוזיציה טובה, נראה את הקו הכחול עולה ואת הצהוב יורד - גם אם המשקל הכולל לא זז.</p>
                </div>
            }
        >
          <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-white/5 shadow-inner">
              <div className="flex justify-center md:justify-end gap-6 mb-4 text-xs font-medium">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm"></span> מסת גוף רזה (LBM)</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 shadow-sm"></span> מסת שומן (FM)</div>
              </div>
              <CrossGraph data={processedData} />
          </div>
        </SectionCard>
      )}

    </div>
  );
}

// --- Sub-components for UI ---

function RatioBar({ 
    label, 
    value, 
    prevValue, 
    target, 
    targetLabel, 
    actionPlan,
    inverse = false 
}: { 
    label: string, 
    value: number | null | undefined, 
    prevValue: number | null | undefined, 
    target: number, 
    targetLabel: string, 
    actionPlan: { why: string, diet: string, training: string },
    inverse?: boolean 
}) {
    const [isOpen, setIsOpen] = useState(false);

    if (value == null) return null;
    
    const startingWorstCase = 1.0; 
    let progressPct = 0;
    
    if (inverse) {
        if (value <= target) progressPct = 100;
        else progressPct = Math.max(0, ((startingWorstCase - value) / (startingWorstCase - target)) * 100);
    } else {
        progressPct = Math.min(100, (value / target) * 100);
    }

    let deltaDisplay = null;
    if (prevValue != null) {
        const diff = value - prevValue;
        if (Math.abs(diff) > 0.005) { 
            const isGood = inverse ? diff < 0 : diff > 0;
            const diffFormatted = Math.abs(diff).toFixed(2);
            deltaDisplay = (
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isGood ? 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/20' : 'text-gray-500 bg-gray-50 dark:bg-white/5'}`} dir="ltr">
                    {diff < 0 ? '↓' : '↑'} {diffFormatted}
                </span>
            );
        }
    }

    return (
        <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-black/5 dark:border-white/5 flex flex-col justify-start shadow-sm transition-all">
            <div className="flex justify-between items-start mb-2">
                <div className="flex flex-col items-start gap-1">
                    <span className="text-sm font-bold opacity-90">{label}</span>
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-2 py-1 rounded transition-colors flex items-center gap-1 mt-1"
                    >
                        <span className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                        איך לשפר?
                    </button>
                </div>
                <div className="flex flex-col items-end gap-1">
                   <div className="flex items-center gap-2">
                       {deltaDisplay}
                       <span className="text-xl font-black tabular-nums leading-none text-indigo-700 dark:text-indigo-400" dir="ltr">
                          {format2Dec(value)}
                       </span>
                   </div>
                   <div className="text-[10px] opacity-60 flex items-center gap-1">
                       <span>יעד:</span>
                       <span dir="ltr">~{targetLabel}</span>
                   </div>
                </div>
            </div>
            
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden flex" dir="ltr">
                <div 
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-1000" 
                    style={{ width: `${progressPct}%` }} 
                />
            </div>

            {/* Action Plan Accordion */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out w-full ${isOpen ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="p-3 bg-white dark:bg-neutral-800 border border-black/5 dark:border-white/5 rounded-lg text-xs leading-relaxed space-y-3 shadow-inner">
                        <p><strong>למה זה חשוב?</strong><br/><span className="opacity-80">{actionPlan.why}</span></p>
                        <p><strong>🥗 תזונה:</strong><br/><span className="opacity-80">{actionPlan.diet}</span></p>
                        <p><strong>🏋️ אימון:</strong><br/><span className="opacity-80">{actionPlan.training}</span></p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function getFfmiCategory(ffmi: number, gender: Gender | null) {
    const isFemale = gender === 'female';
    if (isFemale) {
        if (ffmi >= 21) return 'חריג / עילית';
        if (ffmi >= 19) return 'אתלטי / מתאמן עקבי';
        if (ffmi >= 17) return 'ממוצע פלוס';
        return 'נקודת פתיחה / ממוצע';
    } else {
        if (ffmi >= 25) return 'גבול טבעי עליון';
        if (ffmi >= 22) return 'אתלטי / מתקדם';
        if (ffmi >= 20) return 'ממוצע פלוס / מתאמן';
        return 'נקודת פתיחה / ממוצע';
    }
}

// --- Custom SVG Charts ---

function StatBox({ 
    label, 
    current, 
    prev, 
    unit, 
    reverseColors, 
    actionPlan 
}: { 
    label: string, 
    current: number | null | undefined, 
    prev: number | null | undefined, 
    unit: string, 
    reverseColors: boolean, 
    actionPlan?: { why: string, diet: string, training: string } 
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (current == null || prev == null) {
      return (
        <div className="bg-white/60 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5 flex flex-col justify-start shadow-sm transition-all">
          <div className="flex justify-between items-start w-full">
            <span className="text-[10px] md:text-xs font-bold opacity-70 border-b border-dashed border-gray-400 dark:border-gray-600 pb-0.5 inline-block">{label}</span>
            {actionPlan && (
              <button onClick={() => setIsOpen(!isOpen)} className="text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
                <span className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
              </button>
            )}
          </div>
          
          <div className="text-center flex flex-col items-center justify-center my-3">
             <span className="text-lg md:text-xl font-black leading-none tabular-nums" dir="ltr">--</span>
             <span className="text-[10px] font-bold text-gray-500 tabular-nums mt-1" dir="ltr">חסר נתון</span>
          </div>

          {actionPlan && (
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out text-right w-full ${isOpen ? 'grid-rows-[1fr] mt-1' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="pt-3 border-t border-black/5 dark:border-white/5 text-[10px] leading-relaxed space-y-2 mt-2">
                        <p><strong className="text-indigo-600 dark:text-indigo-400">למה זה חשוב?</strong><br/><span className="opacity-80">{actionPlan.why}</span></p>
                        <p><strong>🥗 תזונה:</strong><br/><span className="opacity-80">{actionPlan.diet}</span></p>
                        <p><strong>🏋️ אימון:</strong><br/><span className="opacity-80">{actionPlan.training}</span></p>
                    </div>
                </div>
            </div>
          )}
        </div>
      );
  }

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
    <div className="bg-white/60 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5 flex flex-col justify-start shadow-sm transition-all">
      <div className="flex justify-between items-start w-full">
        <span className="text-[10px] md:text-xs font-bold opacity-70 border-b border-dashed border-gray-400 dark:border-gray-600 pb-0.5 inline-block">{label}</span>
        {actionPlan && (
          <button onClick={() => setIsOpen(!isOpen)} className="text-[10px] bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1">
            <span className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
          </button>
        )}
      </div>
      
      <div className="text-center flex flex-col items-center justify-center my-3">
         <span className="text-lg md:text-xl font-black leading-none tabular-nums" dir="ltr">
            {format1Dec(current)}<span className="text-[10px] font-normal ml-0.5">{unit}</span>
         </span>
         <span className={`text-[10px] font-bold ${colorClass} tabular-nums mt-1`} dir="ltr">
            {isNeutral ? 'ללא שינוי' : `${isPositive ? '+' : ''}${format1Dec(delta)}${unit}`}
         </span>
      </div>

      {actionPlan && (
        <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out text-right w-full ${isOpen ? 'grid-rows-[1fr] mt-1' : 'grid-rows-[0fr]'}`}>
            <div className="overflow-hidden">
                <div className="pt-3 border-t border-black/5 dark:border-white/5 text-[10px] leading-relaxed space-y-2 mt-2">
                    <p><strong className="text-indigo-600 dark:text-indigo-400">למה זה חשוב?</strong><br/><span className="opacity-80">{actionPlan.why}</span></p>
                    <p><strong>🥗 תזונה:</strong><br/><span className="opacity-80">{actionPlan.diet}</span></p>
                    <p><strong>🏋️ אימון:</strong><br/><span className="opacity-80">{actionPlan.training}</span></p>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

function BfGauge({ bf, gender }: { bf: number, gender: string }) {
  const isFemale = gender === 'female';
  const min = isFemale ? 10 : 2;
  const max = isFemale ? 40 : 30;
  
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
    <div className="mt-6 pt-5 border-t border-black/10 dark:border-white/10 relative">
      <div className="flex justify-between items-end mb-3">
        <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{category}</span>
        <span className="text-sm font-bold opacity-80">:מדד אחוז שומן נוכחי</span>
      </div>

      <div dir="ltr" className="relative h-3 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 shadow-inner mt-6">
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-800 dark:border-gray-200 rounded-full shadow-md z-10 transition-all duration-700" 
          style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
        >
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

function EmaChart({ data }: { data: any[] }) {
    if (data.length < 2) return null;
    
    const allWeights = [...data.map(d => d.rawWeight), ...data.map(d => d.emaWeight)];
    const minW = Math.floor(Math.min(...allWeights)) - 1;
    const maxW = Math.ceil(Math.max(...allWeights)) - 1;
    const range = maxW - minW;

    const getX = (index: number) => (index / (data.length - 1)) * 100;
    const getY = (val: number) => 100 - ((val - minW) / range) * 100;

    const emaPoints = data.map((d, i) => `${getX(i)},${getY(d.emaWeight)}`).join(' ');

    return (
        <div className="relative w-full h-56 mt-6 mb-8" dir="ltr">
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none z-0">
                <div className="border-b border-black/10 dark:border-white/10 h-0 relative">
                    <span className="absolute -top-3 -left-8 text-[10px] opacity-50">{maxW}kg</span>
                </div>
                <div className="border-b border-black/10 dark:border-white/10 h-0"></div>
                <div className="border-b border-black/10 dark:border-white/10 h-0"></div>
                <div className="border-b border-black/10 dark:border-white/10 h-0 relative">
                    <span className="absolute -bottom-3 -left-8 text-[10px] opacity-50">{minW}kg</span>
                </div>
            </div>
            
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible z-0">
                <polyline points={emaPoints} fill="none" stroke="#4f46e5" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            {data.map((d, i) => {
                const xPct = getX(i);
                const rawY = getY(d.rawWeight);
                const emaY = getY(d.emaWeight);

                return (
                    <div key={i} className="absolute inset-0 pointer-events-none z-10">
                        <div className="absolute text-[10px] text-gray-500 font-medium whitespace-nowrap" style={{ left: `${xPct}%`, bottom: '-20px', transform: 'translateX(-50%)' }}>
                            {d.date.toLocaleDateString('he-IL').slice(0, 5)}
                        </div>
                        <div className="absolute w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full" style={{ left: `${xPct}%`, top: `${rawY}%`, transform: 'translate(-50%, -50%)' }}></div>
                        <div className="absolute text-[9px] opacity-60 font-bold" style={{ left: `${xPct}%`, top: `calc(${rawY}% + 6px)`, transform: 'translateX(-50%)' }}>
                            {format1Dec(d.rawWeight)}
                        </div>
                        <div className="absolute w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-[#1a1a1a] rounded-full shadow-sm" style={{ left: `${xPct}%`, top: `${emaY}%`, transform: 'translate(-50%, -50%)' }}></div>
                        <div className="absolute text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-white/80 dark:bg-[#1a1a1a]/80 px-1 rounded backdrop-blur-sm" style={{ left: `${xPct}%`, top: `calc(${emaY}% - 18px)`, transform: 'translateX(-50%)' }}>
                            {format1Dec(d.emaWeight)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function CrossGraph({ data }: { data: any[] }) {
  if (data.length < 2) return null;

  const fData = data.map(d => d.fm);
  const lData = data.map(d => d.lbm);
  const allVals = [...fData, ...lData].filter(v => v != null);
  
  if (allVals.length === 0) return null;
  
  const min = Math.max(0, Math.min(...allVals) - 3);
  const max = Math.max(...allVals) + 3;
  const range = max - min;

  const getPoints = (arr: number[]) => arr.map((val, i) => {
    if (val == null) return '';
    const x = (i / (arr.length - 1)) * 100;
    const y = 100 - ((val - min) / range) * 100;
    return `${x},${y}`;
  }).filter(p => p !== '').join(' ');

  return (
    <div className="relative w-full h-56 mt-4 mb-6" dir="ltr">
      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20 dark:opacity-10 z-0">
        <div className="border-b border-black dark:border-white h-0"></div>
        <div className="border-b border-black dark:border-white h-0"></div>
        <div className="border-b border-black dark:border-white h-0"></div>
        <div className="border-b border-black dark:border-white h-0"></div>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-0">
        <polyline points={getPoints(lData)} fill="none" stroke="#6366f1" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        <polyline points={getPoints(fData)} fill="none" stroke="#fbbf24" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>

      {data.map((d, i) => {
        const xPct = (i / (data.length - 1)) * 100;
        
        return (
          <div key={i} className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute text-[10px] text-gray-500 font-medium whitespace-nowrap" style={{ left: `${xPct}%`, bottom: '-24px', transform: 'translateX(-50%)' }}>
              {d.date.toLocaleDateString('he-IL').slice(0, 5)}
            </div>

            {d.lbm != null && (
                <>
                    <div className="absolute w-3.5 h-3.5 bg-indigo-500 border-2 border-white dark:border-[#1a1a1a] rounded-full shadow-sm" style={{ left: `${xPct}%`, top: `${100 - ((d.lbm - min) / range) * 100}%`, transform: 'translate(-50%, -50%)' }}></div>
                    <div className="absolute text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-white/80 dark:bg-[#1a1a1a]/80 px-1 rounded backdrop-blur-sm" style={{ left: `${xPct}%`, top: `calc(${100 - ((d.lbm - min) / range) * 100}% - 22px)`, transform: 'translateX(-50%)' }}>
                    {format1Dec(d.lbm)}
                    </div>
                </>
            )}

            {d.fm != null && (
                <>
                    <div className="absolute w-3.5 h-3.5 bg-amber-400 border-2 border-white dark:border-[#1a1a1a] rounded-full shadow-sm" style={{ left: `${xPct}%`, top: `${100 - ((d.fm - min) / range) * 100}%`, transform: 'translate(-50%, -50%)' }}></div>
                    <div className="absolute text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-white/80 dark:bg-[#1a1a1a]/80 px-1 rounded backdrop-blur-sm" style={{ left: `${xPct}%`, top: `calc(${100 - ((d.fm - min) / range) * 100}% + 12px)`, transform: 'translateX(-50%)' }}>
                    {format1Dec(d.fm)}
                    </div>
                </>
            )}
          </div>
        );
      })}
    </div>
  );
}