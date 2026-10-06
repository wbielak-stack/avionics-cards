import type { HomeAssistant } from '../types';
import { resolveZones } from './zone-extras';
import { zonesSummary as summary } from './zones-summary';

/** Uwagi edytora o strefach (opis albo ostrzezenie o kolejnosci), z progami z encji. */
export function zonesSummary(hass: HomeAssistant | undefined, c: object, t: (k: string) => string) {
  const { summary: s, orderError } = summary(resolveZones(hass, c) as any, t);
  if (orderError) return [{ type: 'warning' as const, text: t('zones.order_error') }];
  return s ? [{ type: 'info' as const, text: s }] : [];
}
