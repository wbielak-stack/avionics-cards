import type { HassEntity } from '../../types';
import type { BarsCardConfig } from './config';

export interface HourBar {
  /** poczatek godziny, ms */
  t: number;
  /** srednia z okresow w tej godzinie (przed mnoznikiem) */
  v: number;
}

const HOUR = 3600e3;

/**
 * Seria godzinowa z atrybutow encji (jednej lub kilku, np. dzis + jutro):
 * srednia okresow w kazdej godzinie.
 */
export function hourlySeries(ents: Array<HassEntity | undefined>, c: BarsCardConfig): HourBar[] {
  const attrs = (c.attribute ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  const items: unknown[] = ents.flatMap((ent) =>
    ent
      ? attrs.flatMap((a) => {
          const v = ent.attributes?.[a];
          return Array.isArray(v) ? v : [];
        })
      : [],
  );
  const sums = new Map<number, { s: number; n: number }>();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const rec = it as Record<string, unknown>;
    const raw = rec[c.time_field ?? ''];
    const val = parseFloat(String(rec[c.value_field ?? '']));
    let ts = typeof raw === 'number' ? (raw < 1e12 ? raw * 1000 : raw) : Date.parse(String(raw).replace(' ', 'T'));
    if (!Number.isFinite(ts) || !Number.isFinite(val)) continue;
    // czas = koniec okresu -> przesun o 1 ms, zeby okres 00:45-01:00 trafil do godziny 00
    if (c.time_is_end) ts -= 1;
    const d = new Date(ts);
    d.setMinutes(0, 0, 0);
    const key = d.getTime();
    const acc = sums.get(key) ?? { s: 0, n: 0 };
    acc.s += val;
    acc.n += 1;
    sums.set(key, acc);
  }
  return [...sums.entries()].sort((a, b) => a[0] - b[0]).map(([t, { s, n }]) => ({ t, v: s / n }));
}

export function currentHourStart(): number {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

export function windowBars(series: HourBar[], back: number, forward: number): HourBar[] {
  const now = currentHourStart();
  return series.filter((b) => b.t >= now - back * HOUR && b.t < now + forward * HOUR);
}
