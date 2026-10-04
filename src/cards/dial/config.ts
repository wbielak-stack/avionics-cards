import { clean } from '../eis/config';
import type { ObservedMode } from '../../core/observed';

export type DialStyle = 'trueAvionics' | 'simplified';

export interface DialConfig {
  entity?: string;
  name?: string;
  unit?: string;
  precision?: number;
  /** np. 0.001 dla W -> kW */
  multiplier?: number;
  min?: number;
  max?: number;
  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;
  /** cyjan: nastawa */
  setpoint?: number;
  setpoint_entity?: string;
  /** magenta: prognoza */
  forecast?: number;
  forecast_entity?: string;
  /** puste znaczniki: wartosci obserwowane */
  show_range?: boolean;
  range_minutes?: number;
  range_markers?: ObservedMode;
}

export interface DialCardConfig {
  type: string;
  title?: string;
  dial_style?: DialStyle;
  entities: Array<DialConfig | string>;
}

export const DIAL_DEFAULTS: Partial<DialConfig> = {
  multiplier: 1,
  min: 0,
  max: 100,
  show_range: false,
  range_minutes: 60,
  range_markers: 'max',
};

export function normalizeDial(d: DialConfig | string): DialConfig {
  const r = typeof d === 'string' ? { entity: d } : d;
  return { ...DIAL_DEFAULTS, ...clean(r) } as DialConfig;
}
