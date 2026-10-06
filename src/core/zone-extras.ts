import type { HomeAssistant } from '../types';
import { num } from './format';

const KEYS = ['warning_low', 'caution_low', 'caution_high', 'warning_high'] as const;

/**
 * Progi stref z encji: ten sam klucz przyjmuje liczbe albo nazwe encji (np. input_number.komfort_max);
 * zwraca kopie z liczbami (biezace wartosci encji). Bez encji - ten sam obiekt.
 */
export function resolveZones<T extends object>(hass: HomeAssistant | undefined, r: T): T {
  const o = r as Record<string, unknown>;
  if (!KEYS.some((k) => typeof o[k] === 'string')) return r;
  const out: Record<string, unknown> = { ...o };
  for (const k of KEYS) {
    const v = o[k];
    if (typeof v === 'string') {
      const n = v.includes('.') && hass ? num(hass.states[v]?.state) : num(v);
      out[k] = Number.isFinite(n) ? n : undefined;
    }
  }
  return out as T;
}

/** Czy wartosci w alarmie pokazywac w inwersji: opcja karty, a bez niej zmienna motywu --avionics-warning-inverse. */
export function inverseWanted(host: HTMLElement, flag?: boolean): boolean {
  if (typeof flag === 'boolean') return flag;
  const v = getComputedStyle(host).getPropertyValue('--avionics-warning-inverse').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

/**
 * Styl wartosci wg poziomu: zwykle kolor tekstu; w alarmie z inwersja - bialy tekst na czerwonym polu
 * (statycznie, bez migania - miganie dopiero z systemem alertow i potwierdzaniem).
 */
export function levelStyle(color: string, warning: boolean, inverse: boolean): string {
  return warning && inverse
    ? 'color:#fff;background:var(--av-warning);padding:0 4px;border-radius:1px'
    : `color:${color}`;
}
