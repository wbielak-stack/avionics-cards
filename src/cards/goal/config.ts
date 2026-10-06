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
  /**
   * cel wiersza goal: payback = do zwrotu (100 % celu, jak dotad), target_pct = do zadanego zysku,
   * end_of_life = do konca resursu (prognoza z wiersza limitu w tej karcie)
   */
  projection?: 'payback' | 'target_pct' | 'end_of_life';
  /** zadany zysk w % celu (tryb target_pct) */
  target_pct?: number;
  /** punkty trasy w % celu, np. "100, 150, 200" */
  waypoints?: string;
  /** pojemnosc na koniec resursu w % (100 = bez korekty) */
  eol_capacity?: number;
  /** nazwa wiersza resursu (domyslnie pierwszy wiersz typu limit) */
  life_row?: string;
}

export interface GoalCardConfig {
  type: string;
  title?: string;
  entities: GoalRowConfig[];
}

export function normalizeGoalRow(r: GoalRowConfig): GoalRowConfig {
  return {
    kind: 'goal',
    start: 0,
    marker: 'target',
    marker_color: 'forecast',
    caution_pct: 80,
    warning_pct: 95,
    projection: 'payback',
    target_pct: 150,
    waypoints: '100, 150, 200, 250, 300',
    eol_capacity: 100,
    ...clean(r),
  } as GoalRowConfig;
}
