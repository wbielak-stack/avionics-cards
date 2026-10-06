import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { localize, getLanguage } from '../../core/i18n';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { gridValues, gridSvg, gridLabels, snapRange } from '../../core/grid';
import { type ForecastCardConfig, normalizeForecast, GUST_DEFAULTS } from './config';
import { type Hour, fetchOpenMeteo, pvFromEntity } from './data';

const HOUR = 3600e3;
const REFRESH_MS = 30 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** Zachmurzenie [%] -> poziom 0..4 (brak, FEW, SCT, BKN, OVC) wg oktantow. */
function cloudLevel(pct?: number): number {
  if (pct === undefined) return 0;
  const okta = Math.round(pct / 12.5);
  return okta <= 0 ? 0 : okta <= 2 ? 1 : okta <= 4 ? 2 : okta <= 7 ? 3 : 4;
}
const CLOUD_FILL = ['', '#3c3c3c', '#7a7a7a', '#bdbdbd', '#ffffff'];
/** Mgla: 0 brak, 1 BR (zamglenie, < 5 km), 2 FG (mgla, < 1 km lub kod pogody mgly). */
function fogLevel(h: Hour): number {
  if (h.code === 45 || h.code === 48 || (h.vis !== undefined && h.vis < 1000)) return 2;
  if (h.vis !== undefined && h.vis < 5000) return 1;
  return 0;
}
/** Kolor opadu jak na radarze wg natezenia [mm/h]. */
const precipColor = (mm: number) => (mm < 2.5 ? '#3fbf3f' : mm < 7.6 ? '#e6d23a' : '#e04a3a');

export class AvionicsForecastCard extends LitElement {
  @state() private _config?: ForecastCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _data: Hour[] = [];
  @state() private _error = '';
  @state() private _width = 600;
  /** widok z przyciskow (nadpisuje widok z konfiguracji do przeladowania strony) */
  @state() private _view?: { mode: 'next' | 'tomorrow'; hours: number };
  private _hass?: HomeAssistant;
  private _lastFetch = 0;
  private _fetchKey = '';
  private _ro?: ResizeObserver;

  static getConfigElement() {
    return document.createElement('avionics-forecast-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config: ForecastCardConfig): void {
    this._config = normalizeForecast(config);
    this._view = undefined;
    this._lastFetch = 0;
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w && Math.abs(w - this._width) > 4) this._width = w;
    });
    this._ro.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ro?.disconnect();
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    const lat = c.latitude ?? (hass as any).config?.latitude;
    const lon = c.longitude ?? (hass as any).config?.longitude;
    const key = `${lat}|${lon}|${c.wind_unit}|${c.show_pv}|${c.pv_source}|${c.pv_tilt}|${c.pv_azimuth}`;
    if (typeof lat === 'number' && typeof lon === 'number' && (key !== this._fetchKey || Date.now() - this._lastFetch > REFRESH_MS)) {
      this._fetchKey = key;
      this._lastFetch = Date.now();
      fetchOpenMeteo(lat, lon, c)
        .then((d) => {
          this._data = d;
          this._error = '';
        })
        .catch((e) => (this._error = String(e?.message ?? e)));
    }
    const mode = readStyleMode(this);
    if (first || mode !== this._styleMode) this._styleMode = mode;
    // PV z integracji zmienia sie z encja
    if (c.show_pv && c.pv_source === 'entity') this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Okno czasu: od teraz (+przesuniecie) przez N godzin albo jutro 0-24. */
  private _window(): [number, number] {
    const c = this._config!;
    const v = this._view ?? { mode: c.view ?? 'next', hours: c.hours ?? 36 };
    const now = new Date();
    now.setMinutes(0, 0, 0);
    if (v.mode === 'tomorrow') {
      const d = new Date();
      d.setHours(24, 0, 0, 0);
      return [d.getTime(), d.getTime() + 24 * HOUR];
    }
    const off = this._view ? 0 : c.offset_hours ?? 0;
    const s = now.getTime() + off * HOUR;
    return [s, s + v.hours * HOUR];
  }

  /** Skala czcionek i wysokosci: recznie albo wg szerokosci karty. */
  private _scale(): number {
    const size = this._config!.size ?? 'auto';
    if (size === 'compact') return 0.85;
    if (size === 'large') return 1.35;
    if (size === 'normal') return 1;
    return this._width < 520 ? 0.85 : this._width < 1000 ? 1 : 1.35;
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const [s, e] = this._window();
    const hours = this._data.filter((h) => h.t >= s && h.t < e);
    const pvMap = c.show_pv && c.pv_source === 'entity' ? pvFromEntity(this._hass, c) : undefined;
    for (const h of hours) {
      h.pv = pvMap ? pvMap.get(h.t) : h.gti !== undefined && c.pv_kwp ? (h.gti / 1000) * c.pv_kwp * (c.pv_efficiency ?? 0.85) : undefined;
    }
    const n = hours.length;
    // odstep liczb wg szerokosci obszaru wykresu (min. ~30 px na liczbe)
    const sc = this._scale();
    const chartW = Math.max(this._width - 32 - 86 * sc, 100);
    const step = n ? [1, 2, 3, 4, 6, 8, 12].find((k) => (chartW / n) * k >= 30 * sc) ?? 12 : 1;
    const nowT = new Date().setMinutes(0, 0, 0);

    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })} style="--s:${this._scale()}">
        <div class="top">
          <span class="title">${c.title ?? t('fc.title')}</span>
          ${c.show_buttons ? this._buttons() : nothing}
        </div>
        ${this._error
          ? html`<div class="err">${t('fc.error')}: ${this._error}</div>`
          : !n
            ? html`<div class="err">${t('fc.loading')}</div>`
            : html`<div class="rows" style="--n:${n}">
                ${this._timeRow(hours, step, nowT)}
                ${c.show_clouds ? this._cloudRows(hours, nowT, t) : nothing}
                ${c.show_fog ? this._fogRow(hours, nowT, t) : nothing}
                ${c.show_precip ? this._precipRows(hours, step, nowT, t) : nothing}
                ${c.show_temperature ? this._lineRow(hours, step, nowT, 'temp', t('fc.temp'), 0) : nothing}
                ${c.show_pressure ? this._lineRow(hours, step, nowT, 'pressure', t('fc.pressure'), 0) : nothing}
                ${c.show_wind ? this._windRows(hours, step, nowT, t) : nothing}
                ${c.show_pv ? this._pvRow(hours, nowT, t) : nothing}
              </div>
              ${this._legend(t)}`}
      </ha-card>
    `;
  }

  private _buttons() {
    const c = this._config!;
    const cur = this._view ?? { mode: c.view ?? 'next', hours: c.hours ?? 36 };
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const opts: Array<{ mode: 'next' | 'tomorrow'; hours: number; label: string }> = [
      { mode: 'next', hours: c.hours ?? 36, label: `${c.hours ?? 36} h` },
      { mode: 'tomorrow', hours: 24, label: t('fc.tomorrow') },
      { mode: 'next', hours: 48, label: '48 h' },
    ];
    return html`<span class="btns">
      ${opts.map(
        (o) => html`<button
          class=${o.mode === cur.mode && o.hours === cur.hours ? 'on' : ''}
          @click=${() => (this._view = { mode: o.mode, hours: o.hours })}
        >
          ${o.label}
        </button>`,
      )}
    </span>`;
  }

  /** Wspolne nakladki obszaru wykresu: linie polnocy i linia "teraz". */
  private _marks(hours: Hour[], nowT: number) {
    const n = hours.length;
    return html`${hours.map((h, i) =>
      i > 0 && new Date(h.t).getHours() === 0 ? html`<span class="mid" style="left:${(i / n) * 100}%"></span>` : nothing,
    )}${hours.map((h, i) => (h.t === nowT ? html`<span class="now" style="left:${((i + 0.5) / n) * 100}%"></span>` : nothing))}`;
  }

  private _row(label: string | TemplateResult, cls: string, body: unknown, hours: Hour[], nowT: number) {
    return html`<div class="row ${cls}">
      <span class="lbl">${label}</span>
      <div class="area">${body}${this._marks(hours, nowT)}</div>
    </div>`;
  }

  /** Wartosci co `step` godzin, wysrodkowane nad swoja godzina. */
  private _ticks(hours: Hour[], step: number, f: (h: Hour, i: number) => TemplateResult | string) {
    const n = hours.length;
    return hours.map((h, i) =>
      i % step === 0 ? html`<span class="tick" style="left:${((i + 0.5) / n) * 100}%">${f(h, i)}</span>` : nothing,
    );
  }

  private _timeRow(hours: Hour[], step: number, nowT: number) {
    const n = hours.length;
    const lang = getLanguage(this._hass);
    const body = html`${this._ticks(hours, step, (h) => pad(new Date(h.t).getHours()))}${hours.map((h, i) =>
      i > 0 && new Date(h.t).getHours() === 0
        ? html`<span class="date" style="left:${(i / n) * 100}%"
            >${new Date(h.t).toLocaleDateString(lang, { day: '2-digit', month: '2-digit' })}</span
          >`
        : nothing,
    )}${hours.map((h, i) => (h.t === nowT ? html`<span class="nowtri" style="left:${((i + 0.5) / n) * 100}%">▼</span>` : nothing))}`;
    return html`<div class="row time"><span class="lbl">${localize(lang, 'fc.hour')}</span><div class="area">${body}</div></div>`;
  }

  private _cells(hours: Hour[], f: (h: Hour) => string) {
    return html`<div class="cells">${hours.map((h) => {
      const col = f(h);
      return html`<span class="cell ${col ? 'on' : ''}" style=${col ? `background:${col}` : ''}></span>`;
    })}</div>`;
  }

  private _cloudRows(hours: Hour[], nowT: number, t: (k: string) => string) {
    const lvl = (v?: number) => CLOUD_FILL[cloudLevel(v)];
    return html`
      ${this._row(t('fc.cloud_high'), 'cloud', this._cells(hours, (h) => lvl(h.cloudHigh)), hours, nowT)}
      ${this._row(t('fc.cloud_mid'), 'cloud', this._cells(hours, (h) => lvl(h.cloudMid)), hours, nowT)}
      ${this._row(t('fc.cloud_low'), 'cloud', this._cells(hours, (h) => lvl(h.cloudLow)), hours, nowT)}
    `;
  }

  private _fogRow(hours: Hour[], nowT: number, t: (k: string) => string) {
    const fill = ['', '#5e5e5e', '#d8d8d8'];
    return this._row(t('fc.fog'), 'cloud fog', this._cells(hours, (h) => fill[fogLevel(h)]), hours, nowT);
  }

  private _precipRows(hours: Hour[], step: number, nowT: number, t: (k: string) => string) {
    const n = hours.length;
    const maxV = Math.max(...hours.map((h) => h.precip ?? 0));
    const top = Math.max(4, maxV);
    const imax = hours.findIndex((h) => (h.precip ?? 0) === maxV);
    const bars =
      maxV > 0
        ? html`<svg viewBox="0 0 ${n * 10} 40" preserveAspectRatio="none">
              <line x1="0" x2=${n * 10} y1="40" y2="40" class="base" vector-effect="non-scaling-stroke"></line>
              ${hours.map((h, i) => {
                const mm = h.precip ?? 0;
                if (mm <= 0) return nothing;
                const hh = Math.max((mm / top) * 40, 0.8);
                return svg`<rect x=${i * 10 + 1.5} width="7" y=${40 - hh} height=${hh} fill=${precipColor(mm)}
                  fill-opacity=${0.25 + 0.75 * ((h.prob ?? 100) / 100)}></rect>`;
              })}
            </svg>
            <span class="peak" style="left:${((imax + 0.5) / n) * 100}%;bottom:${(maxV / top) * 100}%"
              >${maxV.toFixed(1).replace('.', ',')}</span
            >`
        : html`<svg viewBox="0 0 10 40" preserveAspectRatio="none">
              <line x1="0" x2="10" y1="40" y2="40" class="base" vector-effect="non-scaling-stroke"></line></svg
            ><span class="none">${t('fc.no_precip')}</span>`;
    const probs = this._ticks(hours, step, (_h, i) => {
      const p = Math.max(...hours.slice(i, i + step).map((x) => x.prob ?? 0));
      return p ? html`${p}` : html`<span class="dim">·</span>`;
    });
    return html`${this._row(`${t('fc.precip')} mm`, 'precip', bars, hours, nowT)}
    ${this._row(`${t('fc.chance')} %`, 'vals', probs, hours, nowT)}`;
  }

  /** Linia (temperatura / cisnienie) z podzialka + wartosci co `step`. */
  private _lineRow(hours: Hour[], step: number, nowT: number, key: 'temp' | 'pressure', label: string, digits: number) {
    const n = hours.length;
    const vals = hours.map((h) => h[key]).filter((v): v is number => v !== undefined);
    if (!vals.length) return nothing;
    let [lo, hi] = [Math.min(...vals), Math.max(...vals)];
    const padv = Math.max((hi - lo) * 0.15, key === 'pressure' ? 2 : 1);
    [lo, hi] = snapRange(lo - padv, hi + padv, { mode: 'nice' });
    const g = { mode: 'nice' as const };
    const gv = gridValues(lo, hi, g);
    const y = (v: number) => 40 - ((v - lo) / (hi - lo)) * 40;
    const d = hours
      .map((h, i) => (h[key] === undefined ? '' : `${i ? 'L' : 'M'} ${((i + 0.5) / n) * 100} ${y(h[key]!).toFixed(2)}`))
      .join(' ');
    const unit = key === 'temp' ? '°C' : 'hPa';
    const line = html`<svg viewBox="0 0 100 40" preserveAspectRatio="none">
        ${gridSvg(gv, y, 100)}
        <path d=${d} class="ln" vector-effect="non-scaling-stroke"></path></svg
      >${gridLabels(gv, (v) => (y(v) / 40) * 100, g, lo, hi, 'right')}`;
    const ticks = this._ticks(hours, step, (h) => (h[key] === undefined ? '' : h[key]!.toFixed(digits)));
    return html`${this._row(`${label} ${unit}`, `line ${key}`, line, hours, nowT)}${this._row('', 'vals', ticks, hours, nowT)}`;
  }

  private _windRows(hours: Hour[], step: number, nowT: number, t: (k: string) => string) {
    const c = this._config!;
    const unit = c.wind_unit ?? 'kn';
    const [gc, gw] = GUST_DEFAULTS[unit];
    const caution = c.gust_caution ?? gc;
    const warning = c.gust_warning ?? gw;
    const speeds = this._ticks(hours, step, (h) =>
      h.wind === undefined
        ? ''
        : html`${h.dir !== undefined
              ? html`<svg class="arr" viewBox="-6 -6 12 12" style="transform:rotate(${h.dir + 180}deg)">
                  <path d="M0 -5 L3.5 3 L0 1.2 L-3.5 3 Z"></path>
                </svg>`
              : nothing}${Math.round(h.wind)}`,
    );
    const gusts = this._ticks(hours, step, (_h, i) => {
      const gmax = Math.max(...hours.slice(i, i + step).map((x) => x.gust ?? 0));
      const col = gmax >= warning ? 'var(--av-warning)' : gmax >= caution ? 'var(--av-caution)' : '';
      return html`<span style=${col ? `color:${col}` : ''}>${Math.round(gmax)}</span>`;
    });
    const u = t(`fc.unit.${unit}`);
    return html`${this._row(`${t('fc.wind')} ${u}`, 'vals', speeds, hours, nowT)}${this._row(
      `${t('fc.gust')} ${u}`,
      'vals',
      gusts,
      hours,
      nowT,
    )}`;
  }

  private _pvRow(hours: Hour[], nowT: number, t: (k: string) => string) {
    const n = hours.length;
    const vals = hours.map((h) => h.pv ?? 0);
    const maxV = Math.max(...vals);
    if (!(maxV > 0)) {
      return this._row('PV kW', 'pv', html`<span class="none">${t('fc.no_pv')}</span>`, hours, nowT);
    }
    const top = maxV * 1.15;
    const imax = vals.indexOf(maxV);
    // sumy dzienne (okno moze obejmowac kilka dob)
    const sums = new Map<string, number>();
    const today = new Date().toDateString();
    const tomorrow = new Date(Date.now() + 86400e3).toDateString();
    hours.forEach((h, i) => {
      const d = new Date(h.t).toDateString();
      const k = d === today ? t('fc.today') : d === tomorrow ? t('fc.tomorrow_l') : new Date(h.t).toLocaleDateString(getLanguage(this._hass), { day: '2-digit', month: '2-digit' });
      sums.set(k, (sums.get(k) ?? 0) + vals[i]);
    });
    const sumText = [...sums.entries()]
      .filter(([, v]) => v > 0.05)
      .map(([k, v]) => `${k} ${v.toFixed(1).replace('.', ',')}`)
      .join(' · ');
    const body = html`<svg viewBox="0 0 ${n * 10} 40" preserveAspectRatio="none">
        <line x1="0" x2=${n * 10} y1="40" y2="40" class="base" vector-effect="non-scaling-stroke"></line>
        ${vals.map((v, i) =>
          v > 0
            ? svg`<rect x=${i * 10 + 1.5} width="7" y=${40 - (v / top) * 40} height=${(v / top) * 40} class="pvbar"></rect>`
            : nothing,
        )}
      </svg>
      <span class="peak" style="left:${((imax + 0.5) / n) * 100}%;bottom:${(maxV / top) * 100}%"
        >${maxV.toFixed(1).replace('.', ',')}</span
      >
      <span class="sum">Σ ${sumText} kWh</span>`;
    return this._row('PV kW', 'pv', body, hours, nowT);
  }

  private _legend(t: (k: string) => string) {
    const c = this._config!;
    const okta = c.cloud_mode !== 'percent';
    const labels = okta ? ['FEW', 'SCT', 'BKN', 'OVC'] : ['13–25%', '26–50%', '51–87%', '>87%'];
    return html`<div class="legend">
      ${c.show_clouds
        ? html`<span class="lg">${t('fc.clouds')}</span>${labels.map(
              (l, i) => html`<span class="sw" style="background:${CLOUD_FILL[i + 1]}"></span><span class="lv">${l}</span>`,
            )}`
        : nothing}
      ${c.show_fog
        ? html`<span class="sw" style="background:#5e5e5e"></span><span class="lv">BR</span
            ><span class="sw" style="background:#d8d8d8"></span><span class="lv">FG</span>`
        : nothing}
      <span class="src">Open-Meteo</span>
    </div>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 8px;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .title {
        color: var(--av-label);
        font-size: calc(var(--s, 1) * 15px);
        font-weight: 700;
        text-transform: uppercase;
      }
      .btns {
        display: flex;
        gap: 4px;
      }
      .btns button {
        font: inherit;
        font-size: calc(var(--s, 1) * 11px);
        font-weight: 700;
        padding: 1px 6px;
        background: transparent;
        color: var(--av-dim);
        border: 1px solid transparent;
        cursor: pointer;
      }
      .btns button.on {
        color: var(--av-label);
        border-color: var(--av-label);
      }
      .err {
        color: var(--av-dim);
        padding: 12px 0;
      }
      .row {
        display: grid;
        grid-template-columns: calc(var(--s, 1) * 86px) 1fr;
        align-items: center;
        margin: 2px 0;
      }
      .lbl {
        color: var(--av-label);
        font-size: calc(var(--s, 1) * 11px);
        font-weight: 700;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .area {
        position: relative;
        height: calc(var(--s, 1) * 16px);
      }
      .row.time .area {
        height: calc(var(--s, 1) * 18px);
        margin-top: calc(var(--s, 1) * 10px);
      }
      .row.cloud .area {
        height: calc(var(--s, 1) * 13px);
      }
      .row.precip .area,
      .row.pv .area {
        height: calc(var(--s, 1) * 38px);
        margin-top: calc(var(--s, 1) * 12px);
      }
      .row.line .area {
        height: calc(var(--s, 1) * 52px);
        margin-top: calc(var(--s, 1) * 6px);
      }
      .area svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .cells {
        display: grid;
        grid-template-columns: repeat(var(--n), 1fr);
        gap: 2px;
        height: 100%;
      }
      .cell {
        border: 1px solid #333;
        box-sizing: border-box;
      }
      .cell.on {
        border-color: transparent;
      }
      .tick {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        font-size: calc(var(--s, 1) * 12px);
        font-weight: 700;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .dim {
        color: var(--av-dim);
      }
      .date {
        position: absolute;
        top: -11px;
        margin-left: 3px;
        font-size: calc(var(--s, 1) * 9px);
        color: var(--av-dim);
      }
      .nowtri {
        position: absolute;
        top: -12px;
        transform: translateX(-50%);
        font-size: calc(var(--s, 1) * 9px);
      }
      .mid {
        position: absolute;
        top: -2px;
        bottom: -2px;
        border-left: 1px dashed var(--av-dim);
        pointer-events: none;
      }
      .now {
        position: absolute;
        top: -2px;
        bottom: -2px;
        border-left: 1px solid rgba(255, 255, 255, 0.45);
        pointer-events: none;
      }
      .base {
        stroke: #3a3a3a;
        stroke-width: 1;
      }
      .ln {
        fill: none;
        stroke: var(--av-value);
        stroke-width: 2;
        stroke-linejoin: round;
      }
      .pvbar {
        fill: #8c8c8c;
      }
      .peak {
        position: absolute;
        transform: translate(-50%, -2px);
        font-size: calc(var(--s, 1) * 10px);
        font-weight: 700;
      }
      .none {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 6px;
        text-align: center;
        font-size: calc(var(--s, 1) * 11px);
        color: var(--av-dim);
      }
      .sum {
        position: absolute;
        right: 0;
        top: -12px;
        font-size: calc(var(--s, 1) * 10px);
        color: var(--av-dim);
      }
      .arr {
        width: calc(var(--s, 1) * 10px);
        height: calc(var(--s, 1) * 10px);
        fill: var(--av-value);
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 6px;
        margin-top: 10px;
        font-size: calc(var(--s, 1) * 10px);
      }
      .lg {
        color: var(--av-dim);
        margin-right: 2px;
      }
      .sw {
        width: calc(var(--s, 1) * 14px);
        height: calc(var(--s, 1) * 9px);
        display: inline-block;
      }
      .lv {
        margin-right: 6px;
      }
      .src {
        margin-left: auto;
        color: var(--av-dim);
      }
    `,
  ];
}
