import { clean } from '../eis/config';

export interface EnduranceCardConfig {
  type: string;
  name?: string;
  /** encja prognozy z atrybutami ponizej */
  entity?: string;
  /** czas do rozladowania [h] - scenariusz bez PV (stan faktyczny) i z prognoza PV */
  endurance_attribute?: string;
  endurance_pv_attribute?: string;
  /** SoC: encja albo atrybut encji prognozy */
  soc_entity?: string;
  soc_attribute?: string;
  /** prognozowany dolek, jego godzina i SoC po doladowaniu */
  min_attribute?: string;
  min_hour_attribute?: string;
  rebound_attribute?: string;
  /** chwila wyliczenia prognozy - od niej liczona ETA */
  updated_attribute?: string;
  /** przebieg SoC (lista liczb godzinowych albo obiektow) */
  trajectory_attribute?: string;
  show_profile?: boolean;
  profile_hours?: number;
  profile_grid?: 'off' | 'auto' | 'nice' | 'fixed';
  profile_grid_step?: number;
  label_nopv?: string;
  label_pv?: string;
  /** powyzej (albo brak wartosci) - "> N h" */
  max_hours?: number;
  /** progi czasu bez PV: bursztyn / czerwien ponizej [h] */
  caution_hours?: number;
  warning_hours?: number;
  /** strefy paska SoC */
  soc_warning?: number;
  soc_caution?: number;
}

export const ENDURANCE_DEFAULTS: Partial<EnduranceCardConfig> = {
  endurance_attribute: 'autonomy_nopv_h',
  endurance_pv_attribute: 'autonomy_pv_h',
  soc_attribute: 'soc_now',
  min_attribute: 'min_soc_predicted',
  min_hour_attribute: 'min_soc_hour',
  rebound_attribute: 'rebound_soc',
  updated_attribute: 'updated',
  trajectory_attribute: 'soc_trajectory',
  show_profile: true,
  profile_hours: 24,
  profile_grid: 'nice',
  max_hours: 36,
  caution_hours: 6,
  warning_hours: 3,
  soc_warning: 10,
  soc_caution: 20,
};

export function normalizeEndurance(c: EnduranceCardConfig): EnduranceCardConfig {
  return { ...ENDURANCE_DEFAULTS, ...clean(c) } as EnduranceCardConfig;
}
