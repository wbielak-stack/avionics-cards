import { LitElement } from 'lit';
import { state } from 'lit/decorators.js';
import type { HomeAssistant } from '../../types';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { localize, getLanguage } from '../../core/i18n';
import { energySources, hourly, at, priceScale, type EnergySources, type Series } from '../../core/energy/data';
import { getGroup, setGroup, onGroup, energyCollection, type EnergyCollection } from '../../core/energy/sync';

export type Period = 'day' | 'week' | 'month';

export interface EnergyBaseConfig {
  type: string;
  title?: string;
  period?: Period;
  mode?: 'kwh' | 'pln';
  /** licznik zuzycia domu (kWh); brak - z bilansu */
  house_entity?: string;
  /** ceny zakupu: energia czynna i dystrybucja (zl/kWh albo zl/MWh); brak - koszty z panelu Energia */
  price_ec_entity?: string;
  price_dist_entity?: string;
  import_multiplier?: number;
  /** cena sprzedazy (np. RCE) i wspolczynnik net-billingu */
  price_export_entity?: string;
  export_multiplier?: number;
  /** taryfa strefowa (np. G12): ceny szczyt / poza szczytem (encja albo liczba) i godziny stref */
  tariff?: 'none' | 'zones';
  price_ec_peak?: string | number;
  price_ec_offpeak?: string | number;
  price_dist_peak?: string | number;
  price_dist_offpeak?: string | number;
  /** godziny poza szczytem, np. "22-6, 13-15" (G12 Tauron) */
  offpeak_hours?: string;
  /** osobne godziny poza szczytem latem (kwiecien-wrzesien), jesli operator je przesuwa */
  offpeak_hours_summer?: string;
  /** G12w: weekendy w calosci poza szczytem */
  offpeak_weekends?: boolean;
  /** grupa synchronizacji naszych kart energii (wspolny okres) */
  sync?: string;
  /** podazaj za karta wyboru daty z panelu Energia (i przestawiaj ja) */
  energy_sync?: boolean;
  /** klucz kolekcji kart Energia (zaczyna sie od "energy_"); puste - jak w HA dla tego dashboardu */
  collection_key?: string;
}

/** Zakresy godzin "22-6, 13-15" -> lista [od, do) (przez polnoc dozwolone). */
export function parseHours(s?: string): Array<[number, number]> {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim().split('-').map((v) => parseFloat(v)))
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .map((p) => [p[0], p[1]] as [number, number]);
}

/** Czy godzina (poczatek, ms) jest poza szczytem wg konfiguracji taryfy. */
export function isOffpeak(c: EnergyBaseConfig, t: number): boolean {
  const d = new Date(t);
  if (c.offpeak_weekends && (d.getDay() === 0 || d.getDay() === 6)) return true;
  const m = d.getMonth();
  const summer = m >= 3 && m <= 8;
  const ranges = parseHours(summer && c.offpeak_hours_summer ? c.offpeak_hours_summer : c.offpeak_hours ?? '22-6, 13-15');
  const h = d.getHours() + d.getMinutes() / 60;
  return ranges.some(([a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b));
}

/** Okres: dzien / tydzien (od poniedzialku) / miesiac, przesuniety o `offset`. */
export function periodRange(p: Period, offset: number, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (p === 'day') {
    d.setDate(d.getDate() + offset);
    const from = d.getTime();
    return { from, to: from + 86400e3 };
  }
  if (p === 'week') {
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow + offset * 7);
    const from = d.getTime();
    return { from, to: from + 7 * 86400e3 };
  }
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  const from = d.getTime();
  const e = new Date(from);
  e.setMonth(e.getMonth() + 1);
  return { from, to: e.getTime() };
}

/** Wspolna baza kart energii: okres ze strzalkami, zrodla z panelu Energia, ceny godzinowe. */
export abstract class EnergyBase<C extends EnergyBaseConfig> extends LitElement {
  @state() protected _config?: C;
  @state() protected _styleMode: StyleMode = 'look';
  @state() protected _period: Period = 'day';
  @state() protected _offset = 0;
  @state() protected _mode: 'kwh' | 'pln' = 'kwh';
  @state() protected _loading = false;
  protected _hass?: HomeAssistant;
  protected _src?: EnergySources;
  private _key = '';
  private _timer?: number;
  private _unsubGroup?: () => void;
  private _unsubColl?: () => void;
  private _coll?: EnergyCollection;
  private _fromColl = false;

  protected abstract load(hass: HomeAssistant, from: number, to: number): Promise<void>;

  setConfig(config: C): void {
    this._config = config;
    this._period = config.period ?? 'day';
    this._mode = config.mode ?? 'kwh';
    this._key = '';
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  protected t = (k: string) => localize(getLanguage(this._hass), k);
  protected get uiLang() {
    return getLanguage(this._hass);
  }

  connectedCallback(): void {
    super.connectedCallback();
    // statystyki godzinowe - odswiezanie co 5 min
    this._timer = window.setInterval(() => this.refresh(), 5 * 60e3);
    const g = getGroup(this._config?.sync);
    if (g) {
      this._period = g.period;
      this._offset = g.offset;
    }
    this._unsubGroup = onGroup(this._config?.sync, (s) => {
      if (s.period === this._period && s.offset === this._offset) return;
      this._period = s.period;
      this._offset = s.offset;
      this.refresh();
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
    this._unsubGroup?.();
    this._unsubColl?.();
    this._unsubColl = undefined;
    this._coll = undefined;
  }

  /** Podlaczenie do kolekcji kart Energia (gdy na dashboardzie jest karta wyboru daty). */
  private _attachCollection(hass: HomeAssistant) {
    if (!this._config?.energy_sync || this._coll) return;
    const coll = energyCollection(hass, this._config.collection_key);
    if (!coll) return; // karta wyboru daty jeszcze jej nie utworzyla - sprobujemy przy kolejnym hass
    this._coll = coll;
    this._unsubColl = coll.subscribe((data) => this._followCollection(data.start, data.end));
    if (coll.start) this._followCollection(coll.start, coll.end);
  }

  /** Okres z kolekcji HA -> nasz okres i przesuniecie. */
  private _followCollection(start: Date, end?: Date) {
    if (!start) return;
    const s = start.getTime();
    const e = (end ?? new Date()).getTime();
    const days = (e - s) / 86400e3;
    const p: Period = days <= 1.5 ? 'day' : days <= 7.5 ? 'week' : 'month';
    const now = new Date();
    let off = 0;
    if (p === 'day') off = Math.round((new Date(s).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400e3);
    else if (p === 'week') off = Math.round((s - periodRange('week', 0).from) / (7 * 86400e3));
    else off = (new Date(s).getFullYear() - now.getFullYear()) * 12 + new Date(s).getMonth() - now.getMonth();
    if (p === this._period && off === this._offset) return;
    this._fromColl = true;
    this._period = p;
    this._offset = Math.min(0, off);
    setGroup(this._config?.sync, { period: this._period, offset: this._offset });
    this.refresh();
    this._fromColl = false;
  }

  /** Zmiana okresu z karty: grupa i (opcjonalnie) kolekcja kart Energia. */
  private _broadcast() {
    setGroup(this._config?.sync, { period: this._period, offset: this._offset });
    if (this._coll && !this._fromColl) {
      const r = periodRange(this._period, this._offset);
      this._coll.setPeriod(new Date(r.from), new Date(r.to - 1));
      this._coll.refresh();
    }
  }

  protected refresh(): void {
    this._key = '';
    if (this._hass) this.hass = this._hass;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    this._attachCollection(hass);
    const mode = readStyleMode(this);
    if (mode !== this._styleMode) this._styleMode = mode;
    const key = `${this._period}|${this._offset}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    const r = periodRange(this._period, this._offset);
    this._loading = true;
    void (async () => {
      this._src = await energySources(hass);
      await this.load(hass, r.from, Math.min(r.to, Date.now() + 3600e3));
      this._loading = false;
    })();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Ceny godzinowe (zl/kWh, z mnoznikami) albo undefined. */
  protected async prices(hass: HomeAssistant, from: number, to: number) {
    const c = this._config!;
    const ids = [c.price_ec_entity, c.price_dist_entity, c.price_export_entity].filter(Boolean) as string[];
    const s = await hourly(hass, ids, from, to, 'mean');
    const mi = c.import_multiplier ?? 1;
    const me = c.export_multiplier ?? 1;
    const get = (id: string | undefined, h: number, m: number) => {
      if (!id) return undefined;
      const v = s[id]?.get(h);
      return v === undefined ? undefined : v * priceScale(hass, id) * m;
    };
    // taryfa strefowa: stala cena szczytowa / pozaszczytowa (encja albo liczba), wybierana wg godziny
    if (c.tariff === 'zones') {
      const val = (v: string | number | undefined) => {
        if (v === undefined || v === '') return undefined;
        if (typeof v === 'number') return v;
        const n = parseFloat(String(v).includes('.') && hass.states[v as string] ? hass.states[v as string].state : String(v));
        return Number.isFinite(n) ? n * priceScale(hass, typeof v === 'string' ? v : undefined) : undefined;
      };
      const ecP = val(c.price_ec_peak);
      const ecO = val(c.price_ec_offpeak) ?? ecP;
      const dP = val(c.price_dist_peak);
      const dO = val(c.price_dist_offpeak) ?? dP;
      return {
        ec: (h: number) => {
          const v = isOffpeak(c, h) ? ecO : ecP;
          return v === undefined ? undefined : v * mi;
        },
        dist: (h: number) => {
          const v = isOffpeak(c, h) ? dO : dP;
          return v === undefined ? undefined : v * mi;
        },
        rce: (h: number) => get(c.price_export_entity, h, me),
        has: ecP !== undefined || dP !== undefined,
      };
    }
    return {
      ec: (h: number) => get(c.price_ec_entity, h, mi),
      dist: (h: number) => get(c.price_dist_entity, h, mi),
      rce: (h: number) => get(c.price_export_entity, h, me),
      has: !!(c.price_ec_entity || c.price_dist_entity),
    };
  }

  protected periodLabel(from: number): string {
    const d = new Date(from);
    const dm = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (this._period === 'day') {
      return this.uiLang.startsWith('pl') ? `${['ND', 'PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO'][d.getDay()]} ${dm}` : d.toLocaleDateString(this.uiLang, { weekday: 'short', day: '2-digit', month: '2-digit' });
    }
    if (this._period === 'week') {
      const e = new Date(from + 6 * 86400e3);
      return `${dm}–${String(e.getDate()).padStart(2, '0')}.${String(e.getMonth() + 1).padStart(2, '0')}`;
    }
    return d.toLocaleDateString(this.uiLang, { month: 'long', year: 'numeric' }).toUpperCase();
  }

  protected shift(d: number) {
    this._offset = Math.min(0, this._offset + d);
    this._broadcast();
    this.refresh();
  }

  protected setPeriod(p: Period) {
    this._period = p;
    this._offset = 0;
    this._broadcast();
    this.refresh();
  }
}

export { at, hourly, type Series };
