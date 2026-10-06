import { clean } from '../eis/config';

export interface CylinderItem {
  entity: string;
  name?: string;
}

export interface CylinderCardConfig {
  type: string;
  title?: string;
  entities: Array<CylinderItem | string>;
  /** krotkie etykiety po przecinku, np. "1, 2, 3" albo "SALON, GABIN." */
  labels?: string;
  unit?: string;
  precision?: number;
  multiplier?: number;
  /** skala; bez nich - przyblizona do zakresu danych (rownie liczby) */
  min?: number;
  max?: number;
  /** strefy (wspolne dla slupkow); liczby albo encje */
  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;
  zones_from_entities?: boolean;
  /** czerwona linia limitu w poprzek */
  limit?: number;
  /** wyrozniony element: min, max, both, none */
  highlight?: 'min' | 'max' | 'both' | 'none';
  /** znacznik nad slupkiem: maksimum / minimum od polnocy (historia) */
  peak?: 'max' | 'min' | 'off';
  /** trzecie pole naglowka: delta (max - min), avg, sum */
  summary?: 'delta' | 'avg' | 'sum';
  /** delta w innej jednostce, np. V -> mV (mnoznik i jednostka) */
  delta_multiplier?: number;
  delta_unit?: string;
  /** miejsca po przecinku dla delty (domyslnie 0 przy mnozniku, inaczej jak wartosci) */
  delta_precision?: number;
  /** wartosci pod slupkami: auto (gdy sie mieszcza), all, highlighted */
  show_values?: 'auto' | 'all' | 'highlighted';
  warning_inverse?: boolean;
}

export const CYLINDER_DEFAULTS: Partial<CylinderCardConfig> = {
  multiplier: 1,
  highlight: 'min',
  peak: 'off',
  summary: 'delta',
  show_values: 'auto',
};

export function normalizeCylinder(c: CylinderCardConfig): CylinderCardConfig {
  return { ...CYLINDER_DEFAULTS, ...clean(c) } as CylinderCardConfig;
}
