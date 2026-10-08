import type { PlanEvent } from './data';

export interface RoutineRules {
  /** codzienne wydarzenia cykliczne = rutyna */
  daily?: boolean;
  /** znacznik w tytule lub opisie, np. #rutyna */
  keyword?: string;
  /** nazwy rutyn (dokladne, bez wielkosci liter) */
  names?: string[];
}

export type ItemState = 'done' | 'active' | 'next' | 'future';

export interface PlanItem {
  ev: PlanEvent;
  routine: boolean;
  /** skrocona rutyna: rzeczywisty czas */
  effStart: number;
  effEnd: number;
  skipped: boolean;
  shortened: boolean;
  /** wydarzenie w trakcie rutyny - podpunkt */
  parent?: PlanItem;
  children: PlanItem[];
  conflict?: { with: PlanItem[]; from: number; to: number };
  state: ItemState;
}

export interface Gap {
  from: number;
  to: number;
}

export interface Plan {
  items: PlanItem[]; // w kolejnosci wyswietlania (podpunkty po rodzicu)
  notams: PlanEvent[];
  gaps: Gap[];
  conflicts: Array<{ a: PlanItem; b: PlanItem; from: number; to: number }>;
  active?: PlanItem;
  next?: PlanItem;
}

export function isRoutine(e: PlanEvent, r: RoutineRules): boolean {
  if (e.routineCal) return true;
  if (r.daily !== false && e.daily) return true;
  const kw = (r.keyword ?? '#rutyna').trim();
  if (kw && (`${e.summary} ${e.description ?? ''}`.toLowerCase().includes(kw.toLowerCase()))) return true;
  return !!r.names?.some((n) => n.trim() && n.trim().toLowerCase() === e.summary.trim().toLowerCase());
}

/** Nazwa bez znacznika rutyny. */
export const cleanName = (s: string, kw = '#rutyna') => (kw ? s.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '') : s).trim();

/**
 * Model planu: rutyny (pominiete / skrocone / z podpunktami), kolizje zwyklych wydarzen,
 * NOTAM-y (calodzienne), wolne okna i stany (wykonane / aktywne / nastepne / przyszle).
 */
export function buildPlan(
  events: PlanEvent[],
  now: number,
  rules: RoutineRules,
  window: { from: number; to: number },
  opts: { minGapMin?: number; dayFrom?: number; dayTo?: number } = {},
): Plan {
  const notams = events.filter((e) => e.allDay && e.end > window.from && e.start < window.to);
  const timed = events
    .filter((e) => !e.allDay && e.end > window.from && e.start < window.to)
    .sort((a, b) => a.start - b.start || b.priority - a.priority);
  const items: PlanItem[] = timed.map((ev) => ({
    ev,
    routine: isRoutine(ev, rules),
    effStart: ev.start,
    effEnd: ev.end,
    skipped: false,
    shortened: false,
    children: [],
    state: 'future',
  }));
  const routines = items.filter((i) => i.routine);
  const normal = items.filter((i) => !i.routine);
  // rutyna vs zwykle wydarzenia
  for (const r of routines) {
    for (const n of normal) {
      if (n.ev.end <= r.ev.start || n.ev.start >= r.ev.end) continue;
      if (n.ev.start <= r.ev.start && n.ev.end >= r.ev.end) {
        r.skipped = true; // calkowicie przykryta
      } else if (n.ev.start >= r.ev.start && n.ev.end <= r.ev.end) {
        if (!n.parent) {
          n.parent = r; // w trakcie rutyny
          r.children.push(n);
        }
      } else if (n.ev.start <= r.ev.start) {
        r.effStart = Math.max(r.effStart, n.ev.end);
        r.shortened = true;
      } else {
        r.effEnd = Math.min(r.effEnd, n.ev.start);
        r.shortened = true;
      }
    }
    if (r.effEnd <= r.effStart) r.skipped = true;
  }
  // kolizje zwyklych wydarzen
  const conflicts: Plan['conflicts'] = [];
  for (let i = 0; i < normal.length; i++) {
    for (let j = i + 1; j < normal.length; j++) {
      const a = normal[i];
      const b = normal[j];
      const from = Math.max(a.ev.start, b.ev.start);
      const to = Math.min(a.ev.end, b.ev.end);
      if (to > from) {
        conflicts.push({ a, b, from, to });
        for (const [x, y] of [
          [a, b],
          [b, a],
        ] as const) {
          x.conflict = x.conflict
            ? { with: [...x.conflict.with, y], from: Math.min(x.conflict.from, from), to: Math.max(x.conflict.to, to) }
            : { with: [y], from, to };
        }
      }
    }
  }
  // stany
  for (const it of items) {
    const s = it.skipped ? it.ev.start : it.effStart;
    const e = it.skipped ? it.ev.end : it.effEnd;
    it.state = e <= now ? 'done' : s <= now && !it.skipped ? 'active' : 'future';
  }
  const actives = items.filter((i) => i.state === 'active');
  // aktywny: najbardziej szczegolowy (podpunkt przed rodzicem, zwykle przed rutyna)
  const active = actives.sort((a, b) => Number(!!b.parent) - Number(!!a.parent) || Number(a.routine) - Number(b.routine))[0];
  const next = items.filter((i) => i.state === 'future' && !i.skipped).sort((a, b) => a.effStart - b.effStart)[0];
  if (next) next.state = 'next';
  // kolejnosc wyswietlania: najwyzszy poziom wg czasu, podpunkty po rodzicu
  const ordered: PlanItem[] = [];
  for (const it of items.filter((i) => !i.parent)) {
    ordered.push(it);
    ordered.push(...it.children.sort((a, b) => a.ev.start - b.ev.start));
  }
  // wolne okna miedzy wydarzeniami najwyzszego poziomu (w godzinach dnia, od teraz)
  const minGap = (opts.minGapMin ?? 30) * 60000;
  const gaps: Gap[] = [];
  const days: number[] = [];
  for (let d = new Date(window.from).setHours(0, 0, 0, 0); d < window.to; d += 86400e3) days.push(d);
  const busy = items.filter((i) => !i.skipped).map((i) => [i.effStart, i.effEnd] as [number, number]).sort((a, b) => a[0] - b[0]);
  for (const d of days) {
    const from = Math.max(d + (opts.dayFrom ?? 6) * 3600e3, now, window.from);
    const to = Math.min(d + (opts.dayTo ?? 22) * 3600e3, window.to);
    let cur = from;
    for (const [s, e] of busy) {
      if (e <= cur || s >= to) continue;
      if (s - cur >= minGap) gaps.push({ from: cur, to: s });
      cur = Math.max(cur, e);
    }
    if (to - cur >= minGap) gaps.push({ from: cur, to });
  }
  return { items: ordered, notams, gaps, conflicts, active, next };
}

/** Okno czasu dla widoku: dzis, dzis + jutro albo N godzin od teraz. */
export function planWindow(view: 'today' | 'today_tomorrow' | 'hours', hours: number, now: number) {
  const d0 = new Date(now).setHours(0, 0, 0, 0);
  if (view === 'today') return { from: d0, to: d0 + 86400e3 };
  if (view === 'today_tomorrow') return { from: d0, to: d0 + 2 * 86400e3 };
  return { from: now - 3600e3, to: now + hours * 3600e3 };
}

export const hhmm = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const dur = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
