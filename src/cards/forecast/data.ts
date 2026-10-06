import type { HomeAssistant } from '../../types';
import type { ForecastCardConfig } from './config';

/** Godzina prognozy (czasy w ms, poczatek godziny). */
export interface Hour {
  t: number;
  temp?: number;
  cloudLow?: number;
  cloudMid?: number;
  cloudHigh?: number;
  vis?: number;
  code?: number;
  precip?: number;
  prob?: number;
  pressure?: number;
  wind?: number;
  dir?: number;
  gust?: number;
  /** promieniowanie na plaszczyzne paneli [W/m²] */
  gti?: number;
  /** moc PV [kW] */
  pv?: number;
}

const VARS = [
  'temperature_2m',
  'cloud_cover_low',
  'cloud_cover_mid',
  'cloud_cover_high',
  'visibility',
  'weather_code',
  'precipitation',
  'precipitation_probability',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
];

/** Zapytanie do Open-Meteo prosto z przegladarki (API pozwala na takie zapytania). */
export async function fetchOpenMeteo(lat: number, lon: number, c: ForecastCardConfig): Promise<Hour[]> {
  const vars = [...VARS];
  const withPv = c.show_pv && c.pv_source !== 'entity';
  if (withPv) vars.push('global_tilted_irradiance');
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: vars.join(','),
    wind_speed_unit: c.wind_unit ?? 'kn',
    timeformat: 'unixtime',
    timezone: 'auto',
    past_hours: '6',
    forecast_days: '3',
  });
  if (withPv) {
    p.set('tilt', String(c.pv_tilt ?? 35));
    p.set('azimuth', String(c.pv_azimuth ?? 0));
  }
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p.toString()}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = await res.json();
  const h = j.hourly ?? {};
  const time: number[] = h.time ?? [];
  const pick = (k: string, i: number) => {
    const v = h[k]?.[i];
    return typeof v === 'number' ? v : undefined;
  };
  return time.map((ts, i) => ({
    t: ts * 1000,
    temp: pick('temperature_2m', i),
    cloudLow: pick('cloud_cover_low', i),
    cloudMid: pick('cloud_cover_mid', i),
    cloudHigh: pick('cloud_cover_high', i),
    vis: pick('visibility', i),
    code: pick('weather_code', i),
    precip: pick('precipitation', i),
    prob: pick('precipitation_probability', i),
    pressure: pick('pressure_msl', i),
    wind: pick('wind_speed_10m', i),
    dir: pick('wind_direction_10m', i),
    gust: pick('wind_gusts_10m', i),
    gti: pick('global_tilted_irradiance', i),
  }));
}

const hourStart = (t: number) => {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/**
 * Prognoza PV z integracji: lista obiektow (czas + wartosc, np. Solcast detailedHourly)
 * albo slownik czas -> wartosc (np. Open-Meteo Solar Forecast `watts`). Srednia na godzine, w kW.
 */
export function pvFromEntity(hass: HomeAssistant, c: ForecastCardConfig): Map<number, number> {
  const out = new Map<number, { s: number; n: number }>();
  const ent = c.pv_entity ? hass.states[c.pv_entity] : undefined;
  const raw = ent?.attributes?.[c.pv_attribute ?? ''];
  const m = c.pv_multiplier ?? 1;
  const add = (time: unknown, val: unknown) => {
    const t = Date.parse(String(time));
    const v = typeof val === 'number' ? val : parseFloat(String(val));
    if (!Number.isFinite(t) || !Number.isFinite(v)) return;
    const k = hourStart(t);
    const a = out.get(k) ?? { s: 0, n: 0 };
    a.s += v * m;
    a.n += 1;
    out.set(k, a);
  };
  if (Array.isArray(raw)) {
    for (const it of raw) {
      if (it && typeof it === 'object') {
        const o = it as Record<string, unknown>;
        add(o[c.pv_time_field ?? 'period_start'], o[c.pv_value_field ?? 'pv_estimate']);
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) add(k, v);
  }
  return new Map([...out.entries()].map(([k, a]) => [k, a.s / a.n]));
}
