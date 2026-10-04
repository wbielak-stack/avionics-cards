import type { HomeAssistant } from '../types';

/** Precyzja: konfiguracja -> ustawienie encji w HA -> tyle miejsc, ile podaje sama encja (max 2). */
export function entityPrecision(hass: HomeAssistant | undefined, entityId: string, override?: number): number {
  if (typeof override === 'number') return override;
  const reg = (hass as any)?.entities?.[entityId]?.display_precision;
  if (typeof reg === 'number') return reg;
  const raw = hass?.states[entityId]?.state ?? '';
  const dot = raw.indexOf('.');
  return dot < 0 ? 0 : Math.min(raw.length - dot - 1, 2);
}

/** Liczba z przecinkiem dziesietnym; brak -> "--"; opcjonalny "+" dla dodatnich. */
export function formatValue(
  hass: HomeAssistant | undefined,
  entityId: string,
  v: number,
  override?: number,
  sign = false,
): string {
  if (!Number.isFinite(v)) return '--';
  const s = v.toFixed(entityPrecision(hass, entityId, override)).replace('.', ',');
  return sign && v > 0 ? `+${s}` : s;
}
