'use client';

import React, { useMemo, useState } from 'react';

/* =========================
   TYPES & HELPERS
   ========================= */

const round2 = (num: number) => Math.round(num * 100) / 100;
const format1Dec = (n: number | null | undefined) => (n == null || isNaN(n)) ? '--' : Number(n).toFixed(1);
const format2Dec = (n: number | null | undefined) => (n == null || isNaN(n)) ? '--' : Number(n).toFixed(2);
const formatDateShort = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}`;

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

export interface UserGoal {
  id: number;
  goal_key: string;
  label: string;
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
  goals = [], // מקבל את המטרות שהוגדרו באתר
}: {
  profile: Profile | null;
  measurements: BodyMeas[];
  goals?: UserGoal[];
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

    // Carry-forward logic: נזכור את ההיקפים והשומן האחרונים שהוזנו, כדי שאם
    // תהיה מדידת משקל בלי היקפים באותו רגע, נשתמש בהיקפים מהיום/השבוע האחרון.
    let runningWaist: number | null = null;
    let runningHips: number | null = null;
    let runningNeck: number | null = null;
    let runningBf: number | null = null;

    const enriched = sortedRawMeasurements.map((m) => {
      // עדכון ערכים נוכחיים (אם קיימים בשורה זו, נשמור אותם להמשך)
      const currentWaist = toNum(m.waist_navel_cm) ?? toNum(m.waist_cm) ?? toNum(m.waist_narrow_cm);
      if (currentWaist !== null) runningWaist = currentWaist;
      if (toNum(m.hips_cm) !== null) runningHips = toNum(m.hips_cm);
      if (toNum(m.neck_cm) !== null) runningNeck = toNum(m.neck_cm);
      if (toNum(m.body_fat_percent) !== null) runningBf = toNum(m.body_fat_percent);

      const rawW = toNum(m.weight_kg);
      if (!rawW) return null; // ממשיכים הלאה, אבל זכרנו את ההיקפים לשימוש בשקילה הבאה
      
      const emaW = emaWeights[weightIdx++];
      
      let bf = runningBf;
      if (bf == null && h && runningWaist) {
        const navy = runningNeck ? calcNavy({ gender: profile?.gender ?? null, height_cm: h, neck_cm: runningNeck, waist_cm: runningWaist, hips_cm: runningHips }) : null;
        const rfm = calcRFM(profile?.gender ?? null, h, runningWaist);
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

      if (runningWaist && runningHips && h) {
        smm = calcSMM(profile?.gender ?? null, emaW, runningWaist, runningHips, h, age);
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

  // שאיבת המטרה של המשתמש (או דיפולט לריקומפ)
  const mainGoalKey = goals?.[0]?.goal_key || 'recomp';
  const mainGoalLabel = goals?.[0]?.label || 'ברירת מחדל (ריקומפוזיציה)';

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
              <StatBox label="מסת גוף רזה (LBM)" current={current?.lbm} prev={previous?.lbm} unit="kg" reverseColors={false} />
              <StatBox label="מסת שומן (FM)" current={current?.fm} prev={previous?.fm} unit="kg" reverseColors={true} />
              <StatBox label="אחוז שומן" current={current?.bf} prev={previous?.bf} unit="%" reverseColors={true} />
              <StatBox label="משקל כולל" current={current?.emaWeight} prev={previous?.emaWeight} unit="kg" reverseColors={true} />
            </div>
            
            {current?.bf != null && <BfGauge bf={current.bf} gender={profile?.gender ?? 'male'} />}
          </div>
        </div>
      )}

      {/* 2. NOISE FILTER: EMA vs RAW WEIGHT CHART */}
      {hasEnoughWeightData && (
        <SectionCard 
          title="משקל מגמה מוחלק (Time-Aware EMA Filter)" 
          subtitle="הקו הכחול מייצג את המשקל הפיזיולוגי האמיתי שלך, מסונן מתנודות יומיות על בסיס ציר הזמן."
        >
          <div className="bg-gray-50 dark:bg-[#1a1a1a] p-4 rounded-xl border border-gray-200 dark:border-white/5">
              <div className="flex items-center justify-center sm:justify-end flex-wrap gap-4 mb-4 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500"></span> משקל מגמה (EMA)</div>
                  <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-400 dark:bg-gray-600"></span> מדידות גולמיות (בפועל)</div>
              </div>
              
              <EmaChart data={processedData} />
              
              <div className="mt-2 flex flex-col sm:flex-row justify-between items-center px-2 pt-4 border-t border-black/5 dark:border-white/5 gap-2">
                  <div className="text-xs opacity-60 text-center sm:text-right">מציג את נקודת הפתיחה ומקסימום 4 המדידות האחרונות (למניעת עומס)</div>
                  <div className="text-sm">משקל מגמה נוכחי: <strong className="text-indigo-600 dark:text-indigo-400 text-lg tabular-nums" dir="ltr">{format1Dec(current?.emaWeight)}kg</strong></div>
              </div>
          </div>
        </SectionCard>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        
        {/* 3. COMPARTMENT ANALYSIS (FFMI & SMM) */}
        {hasEnoughWeightData && (
          <SectionCard 
            title="מסת שריר שלד (SMM & FFMI)"
            subtitle="ה-'GPS' שלך לדעת אם אתה באמת בונה שריר. המדדים מנכים את השומן מהמשקל ובוחנים רק את המסה הפעילה."
          >
            {current?.ffmi ? (
              <div className="space-y-6">
                
                {/* 1. FFMI Section with Custom Graph */}
                <div className="bg-gray-50 dark:bg-black/20 p-5 rounded-2xl border border-black/5 dark:border-white/5 relative shadow-sm flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex flex-col">
                            <h3 className="font-bold text-lg">Normalized FFMI</h3>
                            <span className="text-xs opacity-60">מדד מסת שריר מנורמלת לגובה</span>
                        </div>
                        <div className="text-4xl font-black text-indigo-700 dark:text-indigo-400 tabular-nums leading-none tracking-tight" dir="ltr">
                            {format1Dec(current.ffmi)}
                        </div>
                    </div>
                    
                    {/* Scale Feedback */}
                    <FfmiGauge ffmi={current.ffmi} gender={profile?.gender ?? 'male'} />

                    <Accordion title="מה זה בכלל אומר?">
                        <div className="text-xs space-y-2 opacity-90">
                            <p>
                                בעוד ש-BMI רגיל בודק רק משקל מול גובה (ולכן מפתח גוף יכול להיחשב בו "שמן"), <strong>FFMI</strong> מודד כמה מסת שריר יש לך ביחס לגובה שלך, תוך נטרול אחוז השומן. הגרסה המנורמלת (Normalized) עושה התאמה מתמטית כדי שלאנשים גבוהים או נמוכים מאוד לא יהיה עיוות בתוצאה.
                            </p>
                            <p>עבור גברים מתאמנים, הסקאלה הכללית נראית בערך כך:</p>
                            <ul className="list-disc pr-4 space-y-1">
                                <li><strong>מתחת ל-18:</strong> מסת שריר נמוכה מהממוצע או נקודת התחלה של מתאמן מתחיל.</li>
                                <li><strong>18–20:</strong> ממוצע.</li>
                                <li><strong>20–22:</strong> מעל הממוצע (מתאמנים טבעיים מתקדמים).</li>
                                <li><strong>22–25:</strong> גנטיקה מעולה / רמה עילאית של מתאמן טבעי ותיק.</li>
                                <li><strong>מעל 25:</strong> לרוב קשה מאוד עד בלתי אפשרי להשגה ללא עזרים כימיים.</li>
                            </ul>
                            <p className="bg-white dark:bg-black/20 p-2 rounded border border-black/5 dark:border-white/5 mt-2 font-medium">
                                הנתון שלך, <strong dir="ltr">{format1Dec(current.ffmi)}</strong>, אומר ש{getDynamicFfmiExplanation(current.ffmi, profile?.gender ?? 'male')}
                            </p>
                            <p className="text-[10px] opacity-70 italic mt-2 border-t border-black/10 dark:border-white/10 pt-2">
                                * מילה חשובה: הנוסחה מסתמכת על אחוז השומן שהזנת. אל תתקבע על המספר המדויק בכל יום, אלא על מגמת השינוי של המספר לאורך זמן.
                            </p>
                        </div>
                    </Accordion>

                    {/* Goal Based Feedback */}
                    <div className="mt-4 text-xs leading-relaxed opacity-90 p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100/50 dark:border-indigo-800/30">
                        <div className="font-bold mb-2 pb-2 border-b border-indigo-100 dark:border-indigo-800/30 flex items-center gap-2">
                            <span>🎯</span> 
                            איך הנתון מתקדם אל היעד שלך?
                            <span className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 px-2 py-0.5 rounded text-[10px] mr-auto">
                                {mainGoalLabel}
                            </span>
                        </div>
                        {getFfmiGoalFeedback(mainGoalKey, current.ffmi, previous?.ffmi, (current.emaWeight - (previous?.emaWeight || 0)))}
                    </div>

                    {/* Mini History Graph */}
                    <div className="mt-auto pt-4 border-t border-black/5 dark:border-white/5">
                        <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider mb-2 block">מגמת ה-FFMI (המדידות האחרונות):</span>
                        <TrendLineChart data={processedData} dataKey="ffmi" color="#4f46e5" />
                    </div>
                </div>

                {/* 2. SMM Section with Custom Graph */}
                {current.smm && (
                    <div className="bg-gray-50 dark:bg-black/20 p-5 rounded-2xl border border-black/5 dark:border-white/5 relative shadow-sm flex flex-col h-full">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex flex-col">
                                <h3 className="font-bold text-lg">שריר שלד נטו</h3>
                                <span className="text-xs opacity-60">הערכת Al-Gindan (בק"ג)</span>
                            </div>
                            <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums leading-none tracking-tight" dir="ltr">
                                {format1Dec(current.smm)}<span className="text-lg ml-1">kg</span>
                            </div>
                        </div>
                        
                        <div className="mt-3 text-xs leading-relaxed opacity-80 mb-4">
                            הערכה מתמטית למסת שריר השלד האקטיבית שלך. מחושבת על בסיס קורלציה של המשקל המוחלק מול היקף המותן והאגן.
                        </div>

                        <Accordion title="איך המדד הזה עובד?">
                            <div className="text-xs space-y-2 opacity-90">
                                <p>
                                    בעוד ש-FFMI מנרמל את המסה לגובה, מדד ה-SMM מציג את ההערכה האבסולוטית של מסת השריר הפעילה שלך בקילוגרמים. 
                                </p>
                                <p>
                                    <strong>איך קוראים את המגמה? (בדיוק כמו FFMI)</strong><br/>
                                    כאשר משקל המגמה נשאר יציב (או עולה), אך היקף המותן יורד, המערכת מסיקה שהעלייה באיכות ההרכב נובעת משריר שלד. 
                                    אם אתה בחיטוב וה-SMM נשאר יציב - אתה עושה עבודה מעולה. אם אתה במסה וה-SMM עולה - המשקל שהוספת הוא שריר איכותי.
                                </p>
                            </div>
                        </Accordion>

                        {/* Goal Based Feedback for SMM */}
                        <div className="mt-4 text-xs leading-relaxed opacity-90 p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100/50 dark:border-emerald-800/30">
                            {getSmmGoalFeedback(mainGoalKey, current.smm, previous?.smm, (current.emaWeight - (previous?.emaWeight || 0)))}
                        </div>

                        {/* Mini History Graph */}
                        <div className="mt-auto pt-4 border-t border-black/5 dark:border-white/5">
                            <span className="text-[10px] font-bold opacity-50 uppercase tracking-wider mb-2 block">מגמת מסת השריר האבסולוטית בק"ג:</span>
                            <TrendLineChart data={processedData} dataKey="smm" color="#10b981" />
                        </div>
                    </div>
                )}
                
              </div>
            ) : (
              <div className="text-sm opacity-60 text-center py-8 bg-gray-50 dark:bg-white/5 rounded-2xl">
                חסרים נתוני גובה או אחוז שומן לחישוב מדדים מתקדמים. אנא עדכן אותם בלשונית המדידות.
              </div>
            )}
          </SectionCard>
        )}

        {/* 4. AESTHETIC RATIOS */}
        {hasEnoughWeightData && (
          <SectionCard 
            title="אסתטיקה ופרופורציות (Ratios)"
            subtitle="מדדים אובייקטיביים הבוחנים את יחס ההיקפים שלך. ככל שהמדד מתקרב ליעד, הפרופורציות משתפרות."
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
        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">רדאר היקפים: נתונים פיזיים</h3>
        <SectionCard 
            title="השוואת היקפים (Radar)" 
            subtitle="השוואה ישירה של כל היקף מול הפעם הקודמת שהוא נמדד."
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

function Accordion({ title, children }: { title: string, children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
        <div className="mt-2 border border-black/5 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-black/10">
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="w-full text-right p-3 flex justify-between items-center text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="opacity-60 text-lg">💡</span> {title}
                </div>
                <span className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
            </button>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                    <div className="p-4 pt-0 border-t border-black/5 dark:border-white/5 mt-2">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
}

function FfmiGauge({ ffmi, gender }: { ffmi: number, gender: string }) {
    const isFemale = gender === 'female';
    const min = isFemale ? 13 : 15;
    const max = isFemale ? 24 : 28;
    
    const pct = Math.max(0, Math.min(100, ((ffmi - min) / (max - min)) * 100));

    // Markers
    const getMarkerPct = (val: number) => ((val - min) / (max - min)) * 100;
    
    const markers = isFemale 
        ? [ {v: 15, l: 'מתחילה'}, {v: 17, l: 'ממוצע'}, {v: 19, l: 'מתקדמת'}, {v: 21, l: 'עילאי'} ]
        : [ {v: 18, l: 'מתחיל'}, {v: 20, l: 'ממוצע'}, {v: 22, l: 'מתקדם'}, {v: 25, l: 'עילאי'} ];

    return (
        <div className="mt-4 mb-6 relative px-2">
            <div className="relative h-4 w-full rounded-full bg-gradient-to-l from-purple-500 via-emerald-400 to-amber-300 shadow-inner">
                {/* Pointer */}
                <div 
                    className="absolute top-1/2 w-1.5 h-6 bg-gray-900 dark:bg-white rounded-full shadow-md z-10 transition-all duration-1000 ease-out" 
                    style={{ left: `${pct}%`, transform: 'translate(-50%, -50%)' }}
                />
            </div>
            {/* Legend / Axis */}
            <div className="relative h-6 mt-1 text-[9px] font-bold opacity-60">
                {markers.map((m, i) => (
                    <div key={i} className="absolute text-center" style={{ left: `${getMarkerPct(m.v)}%`, transform: 'translateX(-50%)' }}>
                        <div className="h-1 w-px bg-gray-400 mx-auto mb-0.5"></div>
                        {m.v} <span className="hidden sm:inline">({m.l})</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function getDynamicFfmiExplanation(ffmi: number, gender: string) {
    if (gender === 'female') {
        if (ffmi < 15) return 'את נמצאת בנקודת פתיחה קלאסית. יש לך המון פוטנציאל לגדילה ("Newbie Gains") ומקום רב לבניית שריר חדש.';
        if (ffmi < 17) return 'את במצב ממוצע וטוב, בסיס מעולה להמשך אימונים ועיצוב הגוף.';
        if (ffmi < 19) return 'את מציגה מסת שריר מעל הממוצע! זוהי תוצאה של אימוני התנגדות עקביים ותזונה נכונה.';
        if (ffmi <= 21) return 'רמה עילאית וגנטיקה מעולה! השגת תוצאה יוצאת דופן של מסת שריר פעילה.';
        return 'מסת שריר חריגה מאוד, לרוב ברמה תחרותית מקצועית.';
    } else {
        if (ffmi < 18) return 'אתה נמצא כרגע בנקודת פתיחה קלאסית. יש לך המון פוטנציאל לגדילה ("Newbie Gains") ומקום רב לבניית מסת שריר חדשה.';
        if (ffmi < 20) return 'אתה במצב ממוצע, בסיס מעולה להמשך בניית מסת שריר באימונים.';
        if (ffmi < 22) return 'אתה מציג מסת שריר מעל הממוצע, תוצאה של אימונים טבעיים עקביים ומתקדמים.';
        if (ffmi <= 25) return 'רמה עילאית וגנטיקה מעולה! השגת תוצאה יוצאת דופן כמתאמן טבעי ותיק.';
        return 'מסת שריר חריגה מאוד, לרוב מעבר לגבול הטבעי.';
    }
}

function getFfmiCategoryText(ffmi: number) {
    if (ffmi < 18) return 'מתחת לממוצע / מתחיל';
    if (ffmi < 20) return 'ממוצע';
    if (ffmi < 22) return 'מעל הממוצע (מתקדם)';
    if (ffmi <= 25) return 'גנטיקה מעולה / עילאי';
    return 'מעבר לגבול הטבעי (>25)';
}

function getFfmiGoalFeedback(goalKey: string, currentFfmi: number, prevFfmi?: number, weightDelta: number = 0) {
    if (!prevFfmi) return <span className="opacity-70">ממתינים למדידה נוספת (שתכלול משקל, היקפים ואחוז שומן) כדי לזהות מגמה ולוודא התאמה ליעד שלך.</span>;
    
    const ffmiDelta = currentFfmi - prevFfmi;

    if (goalKey.includes('bulk')) {
       if (ffmiDelta > 0) return <span className="text-emerald-700 dark:text-emerald-400"><strong>✅ סימן להתקדמות (חיובי):</strong> ה-FFMI שלך עולה! זה אומר שהעלייה שלך במשקל היא אכן מסת שריר איכותית ולא רק שומן ונוזלים. עבודה מעולה.</span>;
       if (ffmiDelta <= 0 && weightDelta > 0) return <span className="text-amber-700 dark:text-amber-500"><strong>⚠️ תמרור אזהרה (שלילי):</strong> המשקל שלך עולה, אבל ה-FFMI נשאר תקוע או יורד. המשמעות: אתה בפלוס קלורי, אבל רוב המשקל שהוספת הוא שומן. בדוק את החלבון ועצימות האימון.</span>;
       return <span>המשקל ומסת השריר נותרו יציבים. כדי לראות עלייה נדרש לעבור לפלוס קלורי קל.</span>;
    }
    
    if (goalKey.includes('cut')) {
       if (ffmiDelta >= -0.05) return <span className="text-emerald-700 dark:text-emerald-400"><strong>✅ סימן להתקדמות (חיובי):</strong> המשקל הכללי שלך יורד, אבל ה-FFMI שלך נשאר יציב (או אפילו עולה מעט). זה אומר שאתה שורף שומן ומצליח באופן מושלם לשמור על השריר הקיים!</span>;
       if (ffmiDelta < -0.1) return <span className="text-red-600 dark:text-red-400"><strong>⛔ תמרור אזהרה (שלילי):</strong> אתה יורד במשקל וה-FFMI שלך צונח. המשמעות: הגירעון הקלורי שלך אגרסיבי מדי, או שאינך צורך מספיק חלבון, והגוף מפרק שריר במקום שומן.</span>;
       return <span>המשקל יציב ומסת השריר נשמרת היטב בחיטוב.</span>;
    }
    
    // Recomp or default
    if (ffmiDelta > 0) return <span className="text-emerald-700 dark:text-emerald-400"><strong>✅ סימן להתקדמות (חיובי):</strong> ה-FFMI עולה! אתה מצליח לבנות שריר שלד.</span>;
    if (ffmiDelta < -0.1) return <span className="text-amber-700 dark:text-amber-500"><strong>⚠️ תמרור אזהרה (שלילי):</strong> המערכת מזהה איבוד של מסת שריר. שים לב לצריכת החלבון ולהתאוששות שלך.</span>;
    
    return <span className="opacity-70">הנתון יציב. במצב של ריקומפוזיציה זו אינדיקציה טובה שאינך מאבד שריר, אך כדי לגדול נסה להרים כבד יותר ולייצר פרוגרסיב אוברלוד.</span>;
}

function getSmmGoalFeedback(goalKey: string, currentSmm: number, prevSmm?: number, weightDelta: number = 0) {
    if (!prevSmm) return <span className="opacity-70">ממתינים למדידה נוספת כדי להציג את קצב בניית השריר בק"ג.</span>;
    const smmDelta = currentSmm - prevSmm;
    
    if (smmDelta > 0.2) return <span className="text-emerald-700 dark:text-emerald-400"><strong>✅ מעולה!</strong> הוספת {format1Dec(smmDelta)} ק"ג של שריר שלד מאז המדידה הקודמת. המגמה מאוד חיובית לאור היעד שהצבת.</span>;
    if (smmDelta < -0.2) return <span className="text-red-600 dark:text-red-400"><strong>⚠️ שים לב:</strong> ישנה ירידה משוערת של {Math.abs(smmDelta).toFixed(1)} ק"ג שריר שלד. ודא שצריכת החלבון מספקת.</span>;
    return <span className="opacity-70">מסת שריר השלד (בק"ג) יציבה ושמורה היטב.</span>;
}


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

// --- Custom SVG Charts ---

function TrendLineChart({ data, dataKey, color }: { data: any[], dataKey: string, color: string }) {
    // מציג רק את 5 הנקודות האחרונות
    const chartData = data.length > 5 ? data.slice(-5) : data;
    if (chartData.length < 2) return <div className="text-center text-[10px] opacity-50 py-2">אין מספיק נתונים לגרף</div>;

    const vals = chartData.map(d => d[dataKey]).filter(v => v != null);
    if (vals.length === 0) return null;

    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = (max - min) || 1; // Prevent division by zero
    const padding = range * 0.2; // Add 20% padding top and bottom

    const yMin = min - padding;
    const yMax = max + padding;
    const yRange = yMax - yMin;

    const getX = (index: number) => (index / (chartData.length - 1)) * 100;
    const getY = (val: number) => 100 - ((val - yMin) / yRange) * 100;

    const points = chartData.map((d, i) => {
        if (d[dataKey] == null) return '';
        return `${getX(i)},${getY(d[dataKey])}`;
    }).filter(p => p !== '').join(' ');

    return (
        <div className="relative w-full h-24 mt-4 mb-2" dir="ltr">
            {/* Simple Grid */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-10 z-0">
                <div className="border-b border-black dark:border-white h-0"></div>
                <div className="border-b border-black dark:border-white h-0"></div>
            </div>

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible z-0">
                <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
            </svg>

            {chartData.map((d, i) => {
                if (d[dataKey] == null) return null;
                const xPct = getX(i);
                const yPct = getY(d[dataKey]);

                return (
                    <div key={i} className="absolute inset-0 pointer-events-none z-10">
                        {/* Dot */}
                        <div className="absolute w-2 h-2 rounded-full border border-white dark:border-[#1a1a1a] shadow-sm" style={{ backgroundColor: color, left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }}></div>
                        {/* Value */}
                        <div className="absolute text-[9px] font-bold" style={{ color: color, left: `${xPct}%`, top: `calc(${yPct}% - 14px)`, transform: 'translateX(-50%)' }}>
                            {format1Dec(d[dataKey])}
                        </div>
                        {/* Date */}
                        <div className="absolute text-[8px] text-gray-500 font-medium whitespace-nowrap" style={{ left: `${xPct}%`, bottom: '-14px', transform: 'translateX(-50%)' }}>
                            {formatDateShort(d.date)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function StatBox({ 
    label, 
    current, 
    prev, 
    unit, 
    reverseColors 
}: { 
    label: string, 
    current: number | null | undefined, 
    prev: number | null | undefined, 
    unit: string, 
    reverseColors: boolean
}) {

  if (current == null || prev == null) {
      return (
        <div className="bg-white/60 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5 text-center flex flex-col justify-center shadow-sm">
          <span className="text-[10px] md:text-xs font-bold opacity-70 mb-1">{label}</span>
          <span className="text-lg md:text-xl font-black leading-none mb-1 tabular-nums" dir="ltr">--</span>
          <span className="text-[10px] font-bold text-gray-500 tabular-nums" dir="ltr">חסר נתון</span>
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
    <div className="bg-white/60 dark:bg-black/20 p-3 rounded-xl border border-black/5 dark:border-white/5 text-center flex flex-col justify-center shadow-sm">
      <span className="text-[10px] md:text-xs font-bold opacity-70 mb-1">{label}</span>
      <span className="text-lg md:text-xl font-black leading-none mb-1 tabular-nums" dir="ltr">
        {format1Dec(current)}<span className="text-[10px] font-normal ml-0.5">{unit}</span>
      </span>
      <span className={`text-[10px] font-bold ${colorClass} tabular-nums`} dir="ltr">
        {isNeutral ? 'ללא שינוי' : `${isPositive ? '+' : ''}${format1Dec(delta)}${unit}`}
      </span>
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
    if (data.length === 0) return null;
    
    // מציג רק את הראשונה ומקסימום את ה-4 האחרונות
    let displayData = data;
    if (data.length > 5) {
        displayData = [data[0], ...data.slice(-4)];
    }

    if (displayData.length < 2) return null;
    
    const allWeights = [...displayData.map(d => d.rawWeight), ...displayData.map(d => d.emaWeight)];
    const minW = Math.floor(Math.min(...allWeights)) - 1;
    const maxW = Math.ceil(Math.max(...allWeights)) - 1;
    const range = (maxW - minW) || 1;

    const getX = (index: number) => (index / (displayData.length - 1)) * 100;
    const getY = (val: number) => 100 - ((val - minW) / range) * 100;

    const emaPoints = displayData.map((d, i) => `${getX(i)},${getY(d.emaWeight)}`).join(' ');

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

            {displayData.map((d, i) => {
                const xPct = getX(i);
                const rawY = getY(d.rawWeight);
                const emaY = getY(d.emaWeight);

                return (
                    <div key={i} className="absolute inset-0 pointer-events-none z-10">
                        <div className="absolute text-[10px] text-gray-500 font-medium whitespace-nowrap" style={{ left: `${xPct}%`, bottom: '-20px', transform: 'translateX(-50%)' }}>
                            {formatDateShort(d.date)}
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
  const range = (max - min) || 1;

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
              {formatDateShort(d.date)}
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