import { clean } from '../eis/config';
import type { Field } from './fields';

export type WeatherCardConfig = {
  type: string;
  name?: string;
  /** stacja pogodowa - encje wykrywane automatycznie */
  device?: string;
  /** encja weather.* - zapas dla pol bez wlasnej encji */
  weather_entity?: string;
  /** okres trendu cisnienia [h] */
  pressure_trend_hours?: number;
  /** uklad: lista albo okienka (ramki jak w kokpicie) */
  layout?: 'list' | 'boxes';
  /** liczba kolumn okienek */
  columns?: number;
  /** dowolne dodatkowe czujniki jako kolejne pozycje */
  extra?: string[];
  /** strzalka: 'from' = skad wieje (konwencja meteo, domyslnie), 'to' = dokad wieje */
  wind_arrow?: 'to' | 'from';
  /** kierunek [°], ktory ma byc u gory rozy (np. 90 = wschod na gorze) */
  rotation?: number;
  /** wykres cisnienia na dole karty */
  pressure_graph?: boolean;
  pressure_graph_scale?: 'auto' | 'fixed';
  pressure_graph_span?: number;
  pressure_graph_ranges?: string;
  /** linia 1013 hPa na wykresie */
  pressure_graph_reference?: boolean;
  /** podzialka wykresu cisnienia i wiatru */
  pressure_graph_grid?: 'off' | 'auto' | 'nice' | 'fixed';
  pressure_graph_grid_step?: number;
  wind_graph_grid?: 'off' | 'auto' | 'nice' | 'fixed';
  wind_graph_grid_step?: number;
  /** polozenie wykresu: auto (pod roza przy 3+ kolumnach), pod roza, na dole */
  pressure_graph_position?: 'auto' | 'under_wind' | 'bottom';
  /** wiatr z encji weather.* jako prognoza (magenta) na rozy */
  wind_forecast?: boolean;
  /** wykres slupkowy wiatru: pomiary + prognoza godzinowa */
  wind_graph?: boolean;
  wind_graph_position?: 'auto' | 'under_wind' | 'bottom';
  wind_graph_hours_back?: number;
  wind_graph_hours_forward?: number;
  /** encja prognozy wiatru (weather.*); domyslnie weather_entity */
  wind_forecast_entity?: string;
  /** progi predkosci wiatru (jednostki stacji) */
  wind_caution?: number;
  wind_warning?: number;
  /** kolejnosc wykresow, gdy trafiaja w to samo miejsce */
  graph_order?: 'pressure_first' | 'wind_first';
  /** kolejnosc pozycji: klucze pol albo id dodatkowych encji */
  order?: string[];
  /** ukryte pozycje: klucze pol albo id dodatkowych encji */
  hidden?: string[];
} & Partial<Record<Field, string>>;

export const WEATHER_DEFAULTS: Partial<WeatherCardConfig> = {
  pressure_trend_hours: 3,
  layout: 'list',
  columns: 2,
  wind_arrow: 'from',
  rotation: 0,
  pressure_graph: false,
  pressure_graph_scale: 'fixed',
  pressure_graph_span: 20,
  pressure_graph_ranges: '12, 24, 48',
  pressure_graph_reference: true,
  pressure_graph_position: 'auto',
  pressure_graph_grid: 'nice',
  wind_graph_grid: 'nice',
  wind_forecast: true,
  wind_graph: false,
  wind_graph_position: 'auto',
  wind_graph_hours_back: 12,
  wind_graph_hours_forward: 12,
  graph_order: 'pressure_first',
};

export function normalizeWeather(c: WeatherCardConfig): WeatherCardConfig {
  return { ...WEATHER_DEFAULTS, ...clean(c) } as WeatherCardConfig;
}
