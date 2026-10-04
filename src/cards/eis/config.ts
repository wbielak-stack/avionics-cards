export type Level = 'ok' | 'caution' | 'warning' | 'none';

export interface EisRowConfig {
  entity?: string;
  name?: string;
  unit?: string;
  precision?: number;
  min?: number;
  max?: number;
  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;
  /** Nastawa pierwszej wartosci - cyjanowy wskaznik nad paskiem. */
  setpoint?: number;
  setpoint_entity?: string;
  /** Nastawa drugiej wartosci - cyjanowy wskaznik pod paskiem. */
  setpoint2?: number;
  setpoint2_entity?: string;
  /** Prognoza pierwszej / drugiej wartosci - magentowe wskazniki. */
  forecast?: number;
  forecast_entity?: string;
  forecast2?: number;
  forecast2_entity?: string;
  entity2?: string;
  show_bar?: boolean;
  /** Wartosci obserwowane (puste znaczniki) z ostatnich range_minutes minut. */
  show_range?: boolean;
  range_minutes?: number;
  /** both/min/max = skrajne wartosci z okresu, ago = wartosc sprzed range_minutes minut */
  range_markers?: 'both' | 'min' | 'max' | 'ago';
  show_scale?: boolean;
  major_tick?: number;
}

export interface EisCardConfig {
  type: string;
  title?: string;
  /** @deprecated zastapione przez range_minutes w wierszu; uzywane jako domyslne */
  hours_to_show?: number;
  entities: EisRowConfig[];
}

export const EIS_ROW_DEFAULTS: Partial<EisRowConfig> = {
  min: 0,
  max: 100,
  show_bar: true,
  show_range: false,
  range_minutes: 1440,
  range_markers: 'both',
  show_scale: false,
};

export const EIS_DEFAULTS = {};

/** Puste pola z edytora nie nadpisuja wartosci domyslnych. */
export function clean<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  ) as Partial<T>;
}

/** `fallbackMinutes` - okres z karty (stare hours_to_show), gdy wiersz nie ma wlasnego. */
export function normalizeRow(row: EisRowConfig | string, fallbackMinutes?: number): EisRowConfig {
  const r = typeof row === 'string' ? { entity: row } : row;
  const base = fallbackMinutes ? { ...EIS_ROW_DEFAULTS, range_minutes: fallbackMinutes } : EIS_ROW_DEFAULTS;
  return { ...base, ...clean(r) } as EisRowConfig;
}

/** Poziom wartosci wg progow EIS. */
type Thresholds = Pick<EisRowConfig, 'warning_low' | 'caution_low' | 'caution_high' | 'warning_high'>;

export function levelOf(v: number, r: Thresholds): Level {
  if (!Number.isFinite(v)) return 'none';
  const has = (x?: number) => typeof x === 'number' && Number.isFinite(x);
  if ((has(r.warning_low) && v < r.warning_low!) || (has(r.warning_high) && v > r.warning_high!)) return 'warning';
  if ((has(r.caution_low) && v < r.caution_low!) || (has(r.caution_high) && v > r.caution_high!)) return 'caution';
  const any = [r.warning_low, r.caution_low, r.caution_high, r.warning_high].some(has);
  return any ? 'ok' : 'none';
}

/** Pasma kolorow [od, do, poziom] z czterech progow. */
export function zonesOf(r: EisRowConfig): Array<[number, number, Level]> {
  const min = r.min!;
  const max = r.max!;
  const has = (x?: number) => typeof x === 'number' && Number.isFinite(x);
  if (![r.warning_low, r.caution_low, r.caution_high, r.warning_high].some(has)) return [];
  const z: Array<[number, number, Level]> = [];
  const wl = has(r.warning_low) ? r.warning_low! : undefined;
  const cl = has(r.caution_low) ? r.caution_low! : undefined;
  const ch = has(r.caution_high) ? r.caution_high! : undefined;
  const wh = has(r.warning_high) ? r.warning_high! : undefined;
  if (wl !== undefined) z.push([min, wl, 'warning']);
  if (cl !== undefined) z.push([wl ?? min, cl, 'caution']);
  z.push([cl ?? wl ?? min, ch ?? wh ?? max, 'ok']);
  if (ch !== undefined) z.push([ch, wh ?? max, 'caution']);
  if (wh !== undefined) z.push([wh, max, 'warning']);
  return z.filter(([a, b]) => b > a);
}

/** Krok glownej podzialki: ~5 przedzialow, "ladne" wartosci 1/2/2.5/5 x 10^n. */
export function niceStep(range: number): number {
  if (!(range > 0)) return 1;
  const raw = range / 5;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * p;
}
