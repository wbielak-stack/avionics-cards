export type DeviceKind = 'ac' | 'mat';

export interface ClimateCardConfig {
  type: string;
  name?: string;
  mode: 'room' | 'outdoor';
  temperature_entity?: string;
  humidity_entity?: string;
  climate_entity?: string;
  co2_entity?: string;
  pm25_entity?: string;
  device_label: 'auto' | DeviceKind;
  hours_to_show: number;
  t_min: number;
  t_max: number;
  h_min: number;
  h_max: number;
  co2_max: number;
  pm25_max: number;
  graph_color: string;
  graph_style: 'color' | 'mono';
  px_per_degree: number;
}

/**
 * Wartosci wspolne. Pola zostawione puste w edytorze biora je stad,
 * wiec zmiana tutaj zmienia wszystkie takie kafle naraz.
 */
export const CLIMATE_DEFAULTS: Omit<ClimateCardConfig, 'type'> = {
  mode: 'room',
  device_label: 'auto',
  hours_to_show: 24,
  t_min: 19,
  t_max: 26,
  h_min: 30,
  h_max: 60,
  co2_max: 1200, // ppm - powyzej: DUSZNO
  pm25_max: 25, // ug/m3 - powyzej: PYŁ
  graph_color: '#00e5ff',
  graph_style: 'color', // 'color' = progi temperatury, 'mono' = graph_color
  px_per_degree: 12, // maksymalna wysokosc [px] odpowiadajaca 1 °C
};

/** Wartosci z wersji g1000-climate-card. */
const LEGACY_DEVICE: Record<string, DeviceKind> = { KLIMA: 'ac', MATA: 'mat' };

export function normalizeConfig(config: Record<string, unknown>): ClimateCardConfig {
  // puste pola z edytora nie nadpisuja wartosci wspolnych
  const clean = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== '' && v !== null && v !== undefined),
  );
  const merged = { ...CLIMATE_DEFAULTS, ...clean } as ClimateCardConfig;
  merged.device_label = LEGACY_DEVICE[merged.device_label as string] ?? merged.device_label;
  return merged;
}
