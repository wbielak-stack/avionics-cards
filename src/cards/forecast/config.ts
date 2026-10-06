import { clean } from '../eis/config';

export type WindUnit = 'kn' | 'kmh' | 'ms' | 'mph';

export interface ForecastCardConfig {
  type: string;
  title?: string;
  /** wspolrzedne (domyslnie - lokalizacja domu z HA) */
  latitude?: number;
  longitude?: number;
  /** widok: next = od teraz (+offset) przez `hours`; tomorrow = jutro 0-24 */
  view?: 'next' | 'tomorrow';
  hours?: number;
  offset_hours?: number;
  show_buttons?: boolean;
  /** rozmiar czcionek i wysokosc wykresow; auto = wg szerokosci karty */
  size?: 'auto' | 'compact' | 'normal' | 'large';

  show_clouds?: boolean;
  show_fog?: boolean;
  show_precip?: boolean;
  show_temperature?: boolean;
  show_pressure?: boolean;
  show_wind?: boolean;
  show_pv?: boolean;

  /** zachmurzenie: okta (FEW/SCT/BKN/OVC) albo percent */
  cloud_mode?: 'okta' | 'percent';
  wind_unit?: WindUnit;
  gust_caution?: number;
  gust_warning?: number;

  /** PV: calculated (promieniowanie na plaszczyzne paneli z Open-Meteo) albo entity (integracja) */
  pv_source?: 'calculated' | 'entity';
  pv_kwp?: number;
  /** nachylenie [°] i azymut paneli (0 = poludnie, -90 = wschod, 90 = zachod) */
  pv_tilt?: number;
  pv_azimuth?: number;
  pv_efficiency?: number;
  pv_entity?: string;
  pv_preset?: 'solcast' | 'open_meteo_solar' | 'custom';
  pv_attribute?: string;
  pv_time_field?: string;
  pv_value_field?: string;
  /** mnoznik do kW (np. 0.001 dla W) */
  pv_multiplier?: number;
}

export const FORECAST_DEFAULTS: Partial<ForecastCardConfig> = {
  view: 'next',
  hours: 36,
  offset_hours: 0,
  show_buttons: true,
  size: 'auto',
  show_clouds: true,
  show_fog: true,
  show_precip: true,
  show_temperature: true,
  show_pressure: true,
  show_wind: true,
  show_pv: false,
  cloud_mode: 'okta',
  wind_unit: 'kn',
  pv_source: 'calculated',
  pv_tilt: 35,
  pv_azimuth: 0,
  pv_efficiency: 0.85,
  pv_preset: 'solcast',
  pv_multiplier: 1,
};

/** Domyslne progi porywow wg jednostki. */
export const GUST_DEFAULTS: Record<WindUnit, [number, number]> = {
  kn: [25, 35],
  kmh: [45, 65],
  ms: [12, 18],
  mph: [30, 40],
};

export const PV_PRESETS: Record<'solcast' | 'open_meteo_solar', Pick<ForecastCardConfig, 'pv_attribute' | 'pv_time_field' | 'pv_value_field' | 'pv_multiplier'>> = {
  // Solcast: detailedHourly = [{ period_start, pv_estimate [kW] }]
  solcast: { pv_attribute: 'detailedHourly', pv_time_field: 'period_start', pv_value_field: 'pv_estimate', pv_multiplier: 1 },
  // Open-Meteo Solar Forecast: watts = { "iso": W }
  open_meteo_solar: { pv_attribute: 'watts', pv_multiplier: 0.001 },
};

export function normalizeForecast(c: ForecastCardConfig): ForecastCardConfig {
  const m = { ...FORECAST_DEFAULTS, ...clean(c) } as ForecastCardConfig;
  if (m.pv_source === 'entity' && m.pv_preset && m.pv_preset !== 'custom') {
    return { ...m, ...PV_PRESETS[m.pv_preset], ...clean(c) } as ForecastCardConfig;
  }
  return m;
}
