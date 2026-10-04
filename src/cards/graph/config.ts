import { clean } from '../eis/config';

export interface GraphCardConfig {
  type: string;
  name?: string;
  entity?: string;
  unit?: string;
  precision?: number;
  multiplier?: number;
  /** zakresy przyciskow w godzinach, np. "12, 24, 48" */
  ranges?: string;
  default_range?: number;
  scale?: 'auto' | 'fixed';
  /** wysokosc wykresu w jednostkach (tryb fixed) */
  span?: number;
  reference?: number;
  reference_label?: string;
  color?: string;
  /** mono albo temperature (gradient wg progow temperatury) */
  graph_style?: 'mono' | 'temperature';
}

export const GRAPH_DEFAULTS: Partial<GraphCardConfig> = {
  ranges: '12, 24, 48',
  default_range: 24,
  scale: 'auto',
  span: 20,
  multiplier: 1,
  color: '#00e5ff',
  graph_style: 'mono',
};

export function normalizeGraph(c: GraphCardConfig): GraphCardConfig {
  return { ...GRAPH_DEFAULTS, ...clean(c) } as GraphCardConfig;
}

export function parseRanges(s?: string): number[] {
  const r = (s ?? '')
    .split(/[,;\s]+/)
    .map((x) => parseFloat(x))
    .filter((x) => Number.isFinite(x) && x > 0);
  return r.length ? r : [12, 24, 48];
}
