import type { NutritionEntry } from './page';

export const PAGE_SIZE = 150;

/** יום מקומי מה־ISO (לא UTC slice!) */
export function dayKey(iso: string) {
  const d = new Date(iso); // מומר לזמן מקומי
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dedupeById(list: NutritionEntry[]): NutritionEntry[] {
  const seen = new Set<number>();
  const out: NutritionEntry[] = [];
  for (const it of list) {
    if (!seen.has(it.id)) {
      out.push(it);
      seen.add(it.id);
    }
  }
  return out;
}

export function groupByDay(items: NutritionEntry[]) {
  const map = new Map<string, NutritionEntry[]>();
  for (const it of items) {
    const key = dayKey(it.occurred_at);
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  const groups = Array.from(map.entries())
    .map(([key, arr]) => {
      arr.sort((a, b) => +new Date(a.occurred_at) - +new Date(b.occurred_at));
      const totals = sumTotals(arr);
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(y, (m ?? 1) - 1, d ?? 1);
      return { dayKey: key, date, items: arr, totals };
    })
    .sort((a, b) => +b.date - +a.date);
  return groups;
}

export function sumTotals(items: NutritionEntry[]) {
  return {
    calories: round2(items.reduce((s, i) => s + (i.calories ?? 0), 0)),
    protein_g: round2(items.reduce((s, i) => s + (i.protein_g ?? 0), 0)),
    carbs_g: round2(items.reduce((s, i) => s + (i.carbs_g ?? 0), 0)),
    fat_g: round2(items.reduce((s, i) => s + (i.fat_g ?? 0), 0)),
  };
}

export function sumTotalsAny(
  items: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number }[]
) {
  return {
    calories: round2(items.reduce((s, i) => s + (i.calories ?? 0), 0)),
    protein_g: round2(items.reduce((s, i) => s + (i.protein_g ?? 0), 0)),
    carbs_g: round2(items.reduce((s, i) => s + (i.carbs_g ?? 0), 0)),
    fat_g: round2(items.reduce((s, i) => s + (i.fat_g ?? 0), 0)),
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export function fmtNum(n: number | null | undefined) {
  return n == null ? '' : String(n);
}
export function nowLocalInput() {
  const d = new Date();
  d.setSeconds(0, 0);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
export function localToIso(local: string) {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return dt.toISOString();
}
