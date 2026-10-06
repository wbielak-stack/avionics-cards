import { clean } from '../eis/config';

export type BarsPreset = 'pse_rce' | 'nordpool' | 'entsoe' | 'custom';

export interface BarsCardConfig {
  type: string;
  name?: string;
  entity?: string;
  /** dalsza czesc serii w osobnej encji (np. ceny na jutro), ten sam uklad danych */
  entity_next?: string;
  preset?: BarsPreset;
  /** tryb wlasny: atrybut(y) z lista (po przecinku), pola czasu i wartosci */
  attribute?: string;
  time_field?: string;
  value_field?: string;
  /** czas w danych oznacza KONIEC okresu (np. kwadransu) */
  time_is_end?: boolean;

  hours_back?: number;
  hours_forward?: number;

  unit?: string;
  precision?: number;
  /** wartosc = (surowa x multiplier + offset) x final_multiplier */
  multiplier?: number;
  /** dodatek w jednostkach po mnozniku (np. marza 0,08 PLN/kWh) */
  offset?: number;
  /** mnoznik koncowy (np. VAT 1,23) */
  final_multiplier?: number;

  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;

  /** linie progow (cyjan): wartosc albo encja (jednostki wyswietlane) + etykieta */
  line1?: number;
  line1_entity?: string;
  line1_label?: string;
  line2?: number;
  line2_entity?: string;
  line2_label?: string;
  line3?: number;
  line3_entity?: string;
  line3_label?: string;

  /** godziny strefy tanszej, np. "22-6, 13-15" -> zielony pasek; pozostale bursztynowe */
  band_hours?: string;

  /** okazja: slupki zielone powyzej / ponizej progu (wartosc albo encja, jednostki wyswietlane) */
  good_direction?: 'off' | 'above' | 'below';
  good_value?: number;
  good_entity?: string;

  /** pionowa linia o polnocy */
  show_midnight?: boolean;
  /** podzialka i staly zakres osi */
  grid?: 'off' | 'auto' | 'nice' | 'fixed';
  grid_step?: number;
  y_min?: number;
  y_max?: number;
}

export const PRESETS: Record<Exclude<BarsPreset, 'custom'>, Pick<BarsCardConfig, 'attribute' | 'time_field' | 'value_field' | 'time_is_end'>> = {
  pse_rce: { attribute: 'prices', time_field: 'dtime', value_field: 'rce_pln', time_is_end: true },
  nordpool: { attribute: 'raw_today, raw_tomorrow', time_field: 'start', value_field: 'value', time_is_end: false },
  entsoe: { attribute: 'prices', time_field: 'time', value_field: 'price', time_is_end: false },
};

export const BARS_DEFAULTS: Partial<BarsCardConfig> = {
  preset: 'pse_rce',
  hours_back: 2,
  hours_forward: 22,
  multiplier: 1,
  offset: 0,
  final_multiplier: 1,
  good_direction: 'off',
  show_midnight: true,
  grid: 'nice',
};

export function normalizeBars(c: BarsCardConfig): BarsCardConfig {
  const m = { ...BARS_DEFAULTS, ...clean(c) } as BarsCardConfig;
  if (m.preset && m.preset !== 'custom') return { ...m, ...PRESETS[m.preset] };
  return m;
}

/**
 * Godziny strefy: "22-6, 13-15" -> zbior godzin 0..23 (koniec zakresu nie wchodzi).
 * Akceptuje tez: polpauze/pauze (22–6), minuty (22:00-06:00), srednik lub spacje jako separator,
 * pojedyncza godzine (13).
 * `invalid` - fragmenty, ktorych nie udalo sie odczytac (do komunikatu w edytorze).
 */
export function parseHoursDetailed(spec?: string): { hours: Set<number>; invalid: string[] } {
  const hours = new Set<number>();
  const invalid: string[] = [];
  // ujednolicenie: pauzy -> "-", bez minut, bez spacji wokol "-"; separatory: przecinek, srednik, spacja
  const cleaned = (spec ?? '')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/:\d{2}/g, '')
    .replace(/\s*-\s*/g, '-');
  const parts = cleaned.split(/[,;\s]+/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const norm = part;
    const range = norm.match(/^(\d{1,2})-(\d{1,2})$/);
    const single = norm.match(/^(\d{1,2})$/);
    if (range && +range[1] <= 24 && +range[2] <= 24) {
      const a = +range[1] % 24;
      const b = +range[2] % 24;
      if (a === b) {
        for (let h = 0; h < 24; h++) hours.add(h);
      } else {
        for (let h = a; h !== b; h = (h + 1) % 24) hours.add(h);
      }
    } else if (single && +single[1] < 24) {
      hours.add(+single[1]);
    } else {
      invalid.push(part);
    }
  }
  return { hours, invalid };
}

export function parseHours(spec?: string): Set<number> {
  return parseHoursDetailed(spec).hours;
}
