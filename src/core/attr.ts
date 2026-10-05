import type { HomeAssistant } from '../types';

/** Atrybut encji po sciezce z kropkami (np. "dane.plan"). */
export function attrPath(hass: HomeAssistant | undefined, entity: string | undefined, path: string | undefined): unknown {
  if (!hass || !entity || !path) return undefined;
  let v: unknown = hass.states[entity]?.attributes;
  for (const part of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

/** Liczba z atrybutu albo NaN (null / brak = NaN). */
export function attrNum(hass: HomeAssistant | undefined, entity: string | undefined, path: string | undefined): number {
  const v = attrPath(hass, entity, path);
  if (v === null || v === undefined || v === '') return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}
