import type { HomeAssistant } from '../../types';

/** Grupa naszych kart energii: wspolny okres i przesuniecie. */
type State = { period: 'day' | 'week' | 'month'; offset: number };
const groups = new Map<string, State>();
const listeners = new Map<string, Set<(s: State) => void>>();

export function getGroup(name?: string): State | undefined {
  return name ? groups.get(name) : undefined;
}

export function setGroup(name: string | undefined, s: State): void {
  if (!name) return;
  groups.set(name, s);
  listeners.get(name)?.forEach((fn) => fn(s));
}

export function onGroup(name: string | undefined, fn: (s: State) => void): () => void {
  if (!name) return () => {};
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name)!.add(fn);
  return () => listeners.get(name)?.delete(fn);
}

/**
 * Kolekcja okresu kart panelu Energia (HA): wspolny obiekt na polaczeniu, klucz `_energy_<adres dashboardu>`
 * albo `_<collection_key>` (musi zaczynac sie od "energy_"). Tworzy ja karta wyboru daty (energy-date-selection).
 */
export interface EnergyCollection {
  start: Date;
  end?: Date;
  setPeriod(start: Date, end?: Date): void;
  refresh(): void;
  subscribe(cb: (data: { start: Date; end?: Date }) => void): () => void;
}

export function energyCollection(hass: HomeAssistant, collectionKey?: string): EnergyCollection | undefined {
  const conn = (hass as any).connection;
  if (!conn) return undefined;
  const panel = window.location.pathname.split('/')[1] ?? '';
  const key = collectionKey ? `_${collectionKey}` : panel ? `_energy_${panel}` : '_energy';
  return conn[key] ?? (collectionKey ? undefined : conn['_energy']);
}
