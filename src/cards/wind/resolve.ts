import type { HomeAssistant } from '../../types';
import { detectFromDevice } from '../weather/fields';
import type { WindCardConfig } from './config';

/** Encje wiatru: jawne z konfiguracji > wykryte z urzadzenia stacji. */
export function resolveWind(hass: HomeAssistant, c: WindCardConfig) {
  const det = detectFromDevice(hass, c.device);
  return {
    speed: c.wind_speed || det.wind_speed,
    direction: c.wind_direction || det.wind_direction,
    gust: c.wind_gust || det.wind_gust,
  };
}
