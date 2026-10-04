import { clean } from '../eis/config';

export interface ValueCardConfig {
  type: string;
  name?: string;
  entity?: string;
  unit?: string;
  precision?: number;
  /** np. 0.001 dla W -> kW */
  multiplier?: number;
  /** pokazuj wartosc bezwzgledna (kierunek pokazuje status) */
  abs_value?: boolean;
  show_sign?: boolean;

  /** status kierunku wg znaku wartosci (po mnozniku) */
  status_positive?: string;
  status_negative?: string;
  status_zero?: string;
  /** martwa strefa wokol zera, w jednostkach wyswietlanych */
  deadband?: number;

  /** false = ukryj kreske i stopke; wartosc zostaje w tym samym miejscu */
  show_footer?: boolean;
  footer_name?: string;
  footer_entity?: string;
  footer_entity2?: string;
  footer_precision?: number;

  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;

  show_graph?: boolean;
  hours_to_show?: number;
  /** minimalny zakres osi wykresu w jednostkach wyswietlanych */
  graph_min_range?: number;
  graph_color?: string;
}

export const VALUE_DEFAULTS: Partial<ValueCardConfig> = {
  multiplier: 1,
  abs_value: false,
  show_sign: false,
  status_zero: '—',
  show_footer: true,
  deadband: 0,
  show_graph: true,
  hours_to_show: 24,
  graph_min_range: 1,
  graph_color: '#00e5ff',
};

export function normalizeValueConfig(c: ValueCardConfig): ValueCardConfig {
  return { ...VALUE_DEFAULTS, ...clean(c) } as ValueCardConfig;
}
