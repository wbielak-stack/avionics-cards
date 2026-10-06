import { clean } from '../eis/config';

export interface TankCardConfig {
  type: string;
  name?: string;
  /** poziom w % (np. SoC) */
  entity?: string;
  precision?: number;
  /** auto (wg proporcji kafla), horizontal (pasek poziomy), vertical (zbiornik pionowy) */
  layout?: 'auto' | 'horizontal' | 'vertical';
  /**
   * strefy [%]: ponizej (rezerwa) i powyzej (np. przepelnienie zbiornika na deszczowke);
   * 0 przy progu dolnym = brak strefy
   */
  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;
  /** zapas: encja (w unit_stock) albo pojemnosc, z ktorej liczony jest zapas */
  stock_entity?: string;
  capacity?: number;
  stock_unit?: string;
  /** mnoznik zapasu z encji (np. 0.001 dla Wh -> kWh) */
  stock_multiplier?: number;
  /** moc ze znakiem (dodatnia = ladowanie), mnoznik (np. 0.001 dla W -> kW) */
  power_entity?: string;
  power_multiplier?: number;
  power_unit?: string;
  status_positive?: string;
  status_negative?: string;
  deadband?: number;
  /** cel [%] - pokazywany, gdy target_active_entity ma stan "on" (albo zawsze, gdy brak tej encji) */
  target?: number;
  target_entity?: string;
  target_active_entity?: string;
  /** druga para: np. sprzedaz (cel ponizej biezacego) */
  target2_entity?: string;
  target2_active_entity?: string;
  /** ENDUR [h]: encja / atrybut encji prognozy; bez niej - zapas / biezaca moc */
  endurance_entity?: string;
  endurance_attribute?: string;
  caution_hours?: number;
  warning_hours?: number;
}

export const TANK_DEFAULTS: Partial<TankCardConfig> = {
  layout: 'auto',
  precision: 1,
  warning_low: 10,
  caution_low: 20,
  power_multiplier: 1,
  power_unit: 'kW',
  stock_unit: 'kWh',
  stock_multiplier: 1,
  status_positive: '',
  status_negative: '',
  deadband: 0.05,
  caution_hours: 6,
  warning_hours: 3,
};

export function normalizeTank(c: TankCardConfig): TankCardConfig {
  return { ...TANK_DEFAULTS, ...clean(c) } as TankCardConfig;
}
