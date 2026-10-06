import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { cardHeader } from '../../core/header';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { localize, getLanguage } from '../../core/i18n';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { attrPath } from '../../core/attr';
import { parseMetar, flightCategory, type Metar } from './parse';

const REFRESH_MS = 10 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
const CAT_COLOR: Record<string, string> = {
  VFR: 'var(--av-ok)',
  MVFR: '#4f8dff',
  IFR: 'var(--av-warning)',
  LIFR: 'var(--av-forecast)',
};

export interface MetarCardConfig {
  type: string;
  station?: string;
  /** api = aviationweather.gov z przegladarki; entity = surowy METAR z encji (stan albo atrybut) */
  source?: 'api' | 'entity';
  entity?: string;
  attribute?: string;
  show_raw?: boolean;
}

/** METAR jak na wallboardzie: kategoria lotu, surowa depesza, rozkodowane pola. */
export class AvionicsMetarCard extends LitElement {
  @state() private _config?: MetarCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _raw = '';
  @state() private _error = '';
  @state() private _tick = 0;
  private _hass?: HomeAssistant;
  private _lastFetch = 0;
  private _timer?: number;

  static getConfigElement() {
    return document.createElement('avionics-metar-card-editor');
  }

  static getStubConfig() {
    return { station: 'EPKK' };
  }

  setConfig(config: MetarCardConfig): void {
    this._config = { source: 'api', show_raw: true, ...config };
    this._lastFetch = 0;
    this._raw = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // wiek depeszy odswiezany co minute
    this._timer = window.setInterval(() => this._tick++, 60000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    if (c.source === 'entity') {
      const v = c.attribute ? attrPath(hass, c.entity, c.attribute) : c.entity ? hass.states[c.entity]?.state : '';
      const raw = typeof v === 'string' ? v : '';
      if (raw !== this._raw) this._raw = raw;
    } else if (c.station && Date.now() - this._lastFetch > REFRESH_MS) {
      this._lastFetch = Date.now();
      void this._fetch(c.station);
    }
    const mode = readStyleMode(this);
    if (mode !== this._styleMode) this._styleMode = mode;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private async _fetch(station: string): Promise<void> {
    try {
      const res = await fetch(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(station.toUpperCase())}&format=raw`);
      if (!res.ok) throw new Error(`aviationweather.gov ${res.status}`);
      const txt = (await res.text()).trim().split('\n')[0] ?? '';
      if (!txt) throw new Error(localize(getLanguage(this._hass), 'metar.no_report'));
      this._raw = txt;
      this._error = '';
    } catch (e) {
      this._error = String((e as Error)?.message ?? e);
    }
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    void this._tick;
    const m: Metar | undefined = this._raw ? parseMetar(this._raw) : undefined;
    const cat = m ? flightCategory(m) : undefined;
    const station = m?.station ?? c.station?.toUpperCase() ?? '';
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${cardHeader(
          `METAR ${station}`,
          html`<span class="age">${m?.time ? this._age(m.time, t) : ''}</span>`,
          cat ? html`<span class="cat" style="color:${CAT_COLOR[cat]};border-color:${CAT_COLOR[cat]}">${cat}</span>` : nothing,
        )}
        ${!m
          ? html`<div class="err">
              ${this._error ? `${t('metar.error')}: ${this._error}` : t('metar.loading')}
              ${this._error && c.source !== 'entity' ? html`<div class="hint">${t('metar.cors_hint')}</div>` : nothing}
            </div>`
          : html`
              ${c.show_raw !== false ? html`<div class="raw">${m.raw}</div>` : nothing}
              <div class="grid">
                ${this._row(t('metar.wind'), this._wind(m, t))}
                ${this._row(t('metar.vis'), m.cavok ? 'CAVOK' : m.vis !== undefined ? (m.vis >= 9999 ? '≥ 10 km' : m.vis >= 5000 ? `${(m.vis / 1000).toFixed(0)} km` : `${m.vis} m`) : '—')}
                ${this._row(t('metar.clouds'), m.cavok ? 'CAVOK' : m.clouds.length ? m.clouds.map((x) => `${x.cover}${Number.isFinite(x.base) ? ` ${x.base}` : ''}${x.type ? ` ${x.type}` : ''}`).join(' · ') : 'NSC')}
                ${this._row(t('metar.ceiling'), m.ceiling !== undefined ? `${m.ceiling} ft` : '—')}
                ${this._row('T / TD °C', m.temp !== undefined ? `${m.temp} / ${m.dew ?? '—'}` : '—')}
                ${this._row('QNH hPa', m.qnh !== undefined ? String(m.qnh) : '—')}
                ${m.weather.length ? this._row(t('metar.weather'), m.weather.join(' ')) : nothing}
              </div>
            `}
      </ha-card>
    `;
  }

  private _row(label: string, value: string) {
    return html`<div class="cell"><span class="lbl">${label}</span><span class="val">${value}</span></div>`;
  }

  private _wind(m: Metar, t: (k: string) => string): string {
    const w = m.wind;
    if (!w) return '—';
    if (w.speed === 0) return t('metar.calm');
    const u = w.unit === 'MPS' ? 'm/s' : 'kt';
    const dir = w.dir === 'VRB' ? 'VRB' : `${pad(w.dir).padStart(3, '0')}°`;
    const varr = w.from !== undefined ? ` (${w.from}°–${w.to}°)` : '';
    return `${dir} ${w.speed}${w.gust ? `G${w.gust}` : ''} ${u}${varr}`;
  }

  /** Godzina obserwacji (UTC) i wiek; ponad 60 min bursztyn, ponad 120 min czerwien. */
  private _age(time: number, t: (k: string) => string) {
    const d = new Date(time);
    const min = Math.max(0, Math.round((Date.now() - time) / 60000));
    const col = min > 120 ? 'var(--av-warning)' : min > 60 ? 'var(--av-caution)' : 'var(--av-dim)';
    return html`<span style="color:${col}">${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z · ${min} ${t('metar.min_ago')}</span>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 10px;
      }
      .top {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .cat {
        border: 1.5px solid;
        padding: 0 6px;
        font-size: 14px;
        font-weight: 700;
      }
      .age {
        margin-left: auto;
        font-size: 12px;
        font-weight: 700;
      }
      .raw {
        margin: 8px 0 6px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--av-frame);
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.3px;
        word-break: break-word;
      }
      .err {
        color: var(--av-dim);
        padding: 10px 0;
      }
      .hint {
        margin-top: 6px;
        font-size: 12px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 2px 20px;
      }
      .cell {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
        padding: 3px 0;
      }
      .lbl {
        color: var(--av-label);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .val {
        font-size: 17px;
        font-weight: 700;
        text-align: right;
      }
    `,
  ];
}
