import { clean } from '../eis/config';

/** Wspolna konfiguracja kart wiatru (roza i wykres). */
export interface WindCardConfig {
  type: string;
  name?: string;
  /** stacja pogodowa - czujniki wiatru wykrywane automatycznie */
  device?: string;
  wind_speed?: string;
  wind_direction?: string;
  wind_gust?: string;
  /** encja weather.* z prognoza wiatru (magenta) */
  forecast_entity?: string;
  wind_arrow?: 'from' | 'to';
  rotation?: number;
  // tylko wykres
  hours_back?: number;
  hours_forward?: number;
  wind_caution?: number;
  wind_warning?: number;
  grid?: 'off' | 'auto' | 'nice' | 'fixed';
  grid_step?: number;
  /** staly gorny zakres osi wykresu */
  y_max?: number;
}

export const WIND_DEFAULTS: Partial<WindCardConfig> = {
  wind_arrow: 'from',
  rotation: 0,
  hours_back: 12,
  hours_forward: 12,
  grid: 'nice',
};

export function normalizeWind(c: WindCardConfig): WindCardConfig {
  return { ...WIND_DEFAULTS, ...clean(c) } as WindCardConfig;
}
