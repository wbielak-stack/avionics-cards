import type { HomeAssistant } from '../types';
import { fetchNumericHistory, type Point } from './history';
import { num } from './format';

/** Pelne odswiezenie historii (korekta); w miedzyczasie wartosci dopisywane na biezaco. */
const HISTORY_REFRESH_MS = 30 * 60 * 1000;
const LIVE_POINT_GAP_MS = 60 * 1000;

export type ObservedMode = 'both' | 'min' | 'max' | 'ago';

/**
 * Wartosci obserwowane encji: historia pobierana raz (najdluzsze okno),
 * potem dopisywana na zywo. Wspolne dla kart z pustymi znacznikami.
 */
export class ObservedHistory {
  private hist = new Map<string, Point[]>();
  private windows = new Map<string, number>();
  private lastFetch = 0;

  /** Zarejestruj encje z oknem w minutach (bierze najdluzsze). */
  track(id: string | undefined, minutes: number): void {
    if (!id) return;
    this.windows.set(id, Math.max(this.windows.get(id) ?? 0, minutes));
  }

  reset(): void {
    this.hist = new Map();
    this.windows = new Map();
    this.lastFetch = 0;
  }

  get active(): boolean {
    return this.windows.size > 0;
  }

  /** Wywolywac przy kazdym hass; zwraca Promise, gdy trwa pobieranie historii. */
  update(hass: HomeAssistant, onLoaded: () => void): void {
    if (!this.active) return;
    if (Date.now() - this.lastFetch > HISTORY_REFRESH_MS) {
      this.lastFetch = Date.now();
      void this.load(hass).then(onLoaded);
    }
    this.appendLive(hass);
  }

  private async load(hass: HomeAssistant): Promise<void> {
    for (const [id, minutes] of this.windows) {
      const pts = await fetchNumericHistory(hass, id, minutes / 60);
      const last = pts.length ? pts[pts.length - 1][0] : 0;
      const live = (this.hist.get(id) ?? []).filter((p) => p[0] > last);
      this.hist.set(id, [...pts, ...live]);
    }
  }

  private appendLive(hass: HomeAssistant): void {
    const now = Date.now();
    for (const [id, minutes] of this.windows) {
      const v = num(hass.states[id]?.state);
      const arr = this.hist.get(id) ?? [];
      const last = arr[arr.length - 1];
      if (Number.isFinite(v) && (!last || last[1] !== v || now - last[0] > LIVE_POINT_GAP_MS)) arr.push([now, v]);
      // zostaw ostatni punkt sprzed okna - wartosc obowiazujaca na jego poczatku
      const from = now - minutes * 60000;
      while (arr.length > 1 && arr[1][0] <= from) arr.shift();
      this.hist.set(id, arr);
    }
  }

  /** Wartosc obowiazujaca w chwili t. */
  valueAt(id: string | undefined, t: number): number {
    if (!id) return NaN;
    let v = NaN;
    for (const p of this.hist.get(id) ?? []) {
      if (p[0] <= t) v = p[1];
      else break;
    }
    return v;
  }

  /** Min/max z ostatnich `minutes` minut. */
  range(id: string | undefined, minutes: number): { min: number; max: number } | undefined {
    if (!id) return undefined;
    const from = Date.now() - minutes * 60000;
    const v = (this.hist.get(id) ?? []).filter((p) => p[0] >= from).map((p) => p[1]);
    const start = this.valueAt(id, from);
    if (Number.isFinite(start)) v.push(start);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : undefined;
  }

  /** Wartosci do narysowania pustymi znacznikami wg trybu. */
  markers(id: string | undefined, minutes: number, mode: ObservedMode): number[] {
    if (mode === 'ago') {
      const v = this.valueAt(id, Date.now() - minutes * 60000);
      return Number.isFinite(v) ? [v] : [];
    }
    const r = this.range(id, minutes);
    if (!r) return [];
    return [...(mode !== 'max' ? [r.min] : []), ...(mode !== 'min' ? [r.max] : [])];
  }
}
