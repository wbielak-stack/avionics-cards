import { clean } from '../eis/config';

export interface GoalRowConfig {
  name?: string;
  /** limit = zuzycie do limitu (resurs); goal = droga do celu (zwrot) */
  kind?: 'limit' | 'goal';
  unit?: string;
  precision?: number;
  // wartosc biezaca
  current_entity?: string;
  current_attribute?: string;
  current_template?: string;
  // cel / limit
  target?: number;
  target_entity?: string;
  target_template?: string;
  /** poczatek skali (domyslnie 0) */
  start?: number;
  /** tempo na dobe: encja / szablon albo wyliczane od daty startu */
  rate_entity?: string;
  rate_template?: string;
  start_date?: string;
  /** znacznik na pasku: cel (domyslnie), wlasny punkt albo brak */
  marker?: 'target' | 'custom' | 'off';
  marker_value?: number;
  marker_entity?: string;
  marker_template?: string;
  /** kolor wlasnego znacznika: setpoint (cyjan) albo forecast (magenta) */
  marker_color?: 'setpoint' | 'forecast';
  /** strefy resursu w % limitu */
  caution_pct?: number;
  warning_pct?: number;
}

export interface GoalCardConfig {
  type: string;
  title?: string;
  entities: GoalRowConfig[];
}

export function normalizeGoalRow(r: GoalRowConfig): GoalRowConfig {
  return { kind: 'goal', start: 0, marker: 'target', marker_color: 'forecast', caution_pct: 80, warning_pct: 95, ...clean(r) } as GoalRowConfig;
}
