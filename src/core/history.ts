import type { HomeAssistant } from '../types';
import { num } from './format';

/** [czas ms, wartosc] */
export type Point = [number, number];

interface CompressedState {
  s?: string;
  a?: Record<string, unknown>;
  lu?: number;
  lc?: number;
}

/**
 * Historia liczbowa encji z ostatnich `hours` godzin.
 * Z `attribute` - wartosc atrybutu (np. current_temperature klimatyzatora).
 * Bledy zwracaja pusta liste - brak historii nie blokuje karty.
 */
export async function fetchNumericHistory(
  hass: HomeAssistant,
  entityId: string,
  hours: number,
  attribute?: string,
): Promise<Point[]> {
  try {
    const res = await hass.callWS<Record<string, CompressedState[]>>({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - hours * 3600e3).toISOString(),
      entity_ids: [entityId],
      minimal_response: !attribute,
      no_attributes: !attribute,
      significant_changes_only: false,
    });
    return (res?.[entityId] ?? [])
      .map((p): Point => [
        ((p.lu ?? p.lc) || 0) * 1000,
        attribute ? num(p.a?.[attribute]) : num(p.s),
      ])
      .filter((p) => p[0] > 0 && Number.isFinite(p[1]));
  } catch (e) {
    console.warn('avionics-cards: historia niedostepna', entityId, e);
    return [];
  }
}
