import type { HomeAssistant } from '../../types';

export type Field =
  | 'temperature'
  | 'humidity'
  | 'pressure'
  | 'uv'
  | 'wind_speed'
  | 'wind_direction'
  | 'wind_gust'
  | 'rain_rate'
  | 'rain_today'
  | 'feels_like'
  | 'dew_point'
  | 'solar'
  | 'illuminance'
  | 'pm25'
  | 'pm10'
  | 'radiation';

export const FIELDS: Field[] = [
  'temperature',
  'humidity',
  'pressure',
  'uv',
  'wind_speed',
  'wind_direction',
  'wind_gust',
  'rain_rate',
  'rain_today',
  'feels_like',
  'dew_point',
  'solar',
  'illuminance',
  'pm25',
  'pm10',
  'radiation',
];

/** Atrybuty encji weather.* uzywane jako zapas, gdy pole nie ma wlasnej encji. */
export const WEATHER_ATTR: Partial<Record<Field, { attr: string; unitAttr?: string; unit?: string }>> = {
  temperature: { attr: 'temperature', unitAttr: 'temperature_unit' },
  humidity: { attr: 'humidity', unit: '%' },
  pressure: { attr: 'pressure', unitAttr: 'pressure_unit' },
  uv: { attr: 'uv_index' },
  wind_speed: { attr: 'wind_speed', unitAttr: 'wind_speed_unit' },
  wind_direction: { attr: 'wind_bearing', unit: '°' },
  wind_gust: { attr: 'wind_gust_speed', unitAttr: 'wind_speed_unit' },
  feels_like: { attr: 'apparent_temperature', unitAttr: 'temperature_unit' },
  dew_point: { attr: 'dew_point', unitAttr: 'temperature_unit' },
};

const has = (id: string, ...words: string[]) => words.some((w) => id.includes(w));

/**
 * Punktacja dopasowania encji do pola (>0 = pasuje, wieksza = lepiej).
 * Rozroznia m.in. temperature zewnetrzna od wewnetrznej i punktu rosy,
 * cisnienie wzgledne od bezwzglednego, wiatr od porywu.
 */
function score(field: Field, id: string, dc: string | undefined, unit: string | undefined): number {
  const outdoor = has(id, 'outdoor', 'outside', 'exterior', 'zewn') ? 5 : 0;
  const notOutdoor = has(id, 'indoor', 'inside', 'interior', 'wewn', 'soil', 'water', 'pool') ? 20 : 0;
  switch (field) {
    case 'temperature':
      if (dc !== 'temperature') return -1;
      return 10 + outdoor - notOutdoor - (has(id, 'dew', 'feels', 'apparent', 'chill', 'heat_index', 'rosy') ? 20 : 0);
    case 'humidity':
      if (dc !== 'humidity') return -1;
      return 10 + outdoor - notOutdoor;
    case 'pressure':
      if (dc !== 'atmospheric_pressure' && dc !== 'pressure') return -1;
      return 10 + (has(id, 'relative', 'rel_', 'sea') ? 5 : 0) - (has(id, 'absolute', 'abs_') ? 2 : 0);
    case 'uv':
      if (unit === 'UV index' || unit === 'UVI') return 12;
      return has(id, 'uv') && !has(id, 'radiation', 'irradiance', 'solar') ? 10 : -1;
    case 'wind_speed':
      if (dc !== 'wind_speed' || has(id, 'gust', 'poryw', 'max')) return -1;
      return 10;
    case 'wind_gust':
      if (dc !== 'wind_speed' || !has(id, 'gust', 'poryw')) return -1;
      return 10 - (has(id, 'max', 'daily') ? 3 : 0);
    case 'wind_direction':
      if (unit !== '°' || !has(id, 'direction', 'dir', 'bearing', 'kierunek')) return -1;
      return 10 - (has(id, 'avg', '10m') ? 1 : 0);
    case 'rain_rate':
      if (dc === 'precipitation_intensity') return 12;
      return unit === 'mm/h' || unit === 'in/h' ? 10 : -1;
    case 'rain_today':
      if (dc !== 'precipitation' && unit !== 'mm' && unit !== 'in') return -1;
      if (!has(id, 'daily', 'today', 'day', 'dzis', 'dobow')) return -1;
      return has(id, 'week', 'month', 'year', 'event', 'total', 'hour') ? -1 : 10;
    case 'dew_point':
      if (dc !== 'temperature' || !has(id, 'dew', 'rosy')) return -1;
      return 10 + outdoor - notOutdoor;
    case 'feels_like':
      if (dc !== 'temperature' || !has(id, 'feels', 'apparent', 'odczuw')) return -1;
      return 10 + outdoor - notOutdoor;
    case 'solar':
      if (has(id, 'uv')) return -1;
      return dc === 'irradiance' || unit === 'W/m²' || unit === 'W/m2' ? 10 : -1;
    case 'illuminance':
      return dc === 'illuminance' ? 10 + outdoor - notOutdoor : -1;
    case 'pm25':
      return dc === 'pm25' ? 10 + outdoor - notOutdoor : -1;
    case 'pm10':
      return dc === 'pm10' ? 10 + outdoor - notOutdoor : -1;
    case 'radiation':
      return ['µSv/h', 'μSv/h', 'uSv/h', 'nSv/h'].includes(unit ?? '') ? 10 : -1;
  }
}

/** Encje urzadzenia przypisane do pol (najlepsze dopasowanie na pole). */
export function detectFromDevice(hass: HomeAssistant, deviceId?: string): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  if (!deviceId) return out;
  const reg = (hass as any).entities as Record<string, { device_id?: string }> | undefined;
  if (!reg) return out;
  const ids = Object.keys(reg).filter((id) => reg[id]?.device_id === deviceId && id.startsWith('sensor.') && hass.states[id]);
  for (const f of FIELDS) {
    let best: { id: string; s: number } | undefined;
    for (const id of ids) {
      const st = hass.states[id];
      const s = score(f, id.toLowerCase(), st.attributes?.device_class, st.attributes?.unit_of_measurement);
      if (s > 0 && (!best || s > best.s)) best = { id, s };
    }
    if (best) out[f] = best.id;
  }
  return out;
}

/** Kierunek 16-punktowy (oznaczenia lotnicze). */
export function compassPoint(deg: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
