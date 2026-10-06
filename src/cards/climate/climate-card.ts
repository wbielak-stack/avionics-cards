import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { gridValues, gridSvg } from '../../core/grid';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant, HassEntity } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { fmt, fmtInt, num } from '../../core/format';
import { localize, getLanguage } from '../../core/i18n';
import { fetchNumericHistory, type Point } from '../../core/history';
import { attachTapHold, fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { TEMPERATURE_THRESHOLDS } from '../../core/thresholds';
import { type ClimateCardConfig, type DeviceKind, normalizeConfig } from './config';
import { buildClimateSchema } from './editor-schema';

const GRAPH_BUCKETS = 96;
const HISTORY_REFRESH_MS = 10 * 60 * 1000;
const LIVE_POINT_MIN_GAP_MS = 5 * 60 * 1000;

export class AvionicsClimateCard extends LitElement {
  @state() private _config?: ClimateCardConfig;
  @state() private _points: Point[] = [];
  @state() private _graphH = 96;
  @state() private _styleMode: StyleMode = 'look';

  private _hass?: HomeAssistant;
  private _key = '';
  private _lastFetch = 0;
  private _ro?: ResizeObserver;
  private _detachActions?: () => void;

  // ---------------- edytor UI ----------------
  static getConfigForm() {
    return buildClimateSchema(getLanguage());
  }

  static getStubConfig(hass: HomeAssistant) {
    const t = Object.keys(hass.states).find(
      (e) => e.startsWith('sensor.') && hass.states[e].attributes.device_class === 'temperature',
    );
    return { name: 'ROOM', temperature_entity: t ?? '' };
  }

  // ---------------- konfiguracja ----------------
  setConfig(config: Record<string, unknown>): void {
    if (!config.temperature_entity && !config.climate_entity) {
      throw new Error(localize(getLanguage(), 'error.no_entity'));
    }
    this._config = normalizeConfig(config);
    this._points = [];
    this._lastFetch = 0;
    this._key = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, rows: 3, min_columns: 4, min_rows: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    if (Date.now() - this._lastFetch > HISTORY_REFRESH_MS) {
      this._lastFetch = Date.now();
      void this._loadHistory();
    }
    // przerysuj tylko gdy zmienila sie ktoras z naszych encji, styl albo jezyk
    const mode = readStyleMode(this);
    const ids = [c.temperature_entity, c.humidity_entity, c.climate_entity, c.co2_entity, c.pm25_entity];
    const key = ids.map((e) => (e ? hass.states[e]?.last_updated ?? '' : '')).join('|')
      + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this._appendLive();
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // ---------------- cykl zycia ----------------
  connectedCallback(): void {
    super.connectedCallback();
    // skala px/°C zalezy od rzeczywistej wysokosci wykresu
    this._ro = new ResizeObserver(() => this._measureGraph());
    this._ro.observe(this);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ro?.disconnect();
    this._detachActions?.();
    this._detachActions = undefined;
  }

  protected updated(): void {
    const card = this.shadowRoot?.querySelector('ha-card') as HTMLElement | null;
    if (card && !this._detachActions) {
      this._detachActions = attachTapHold(card, () => this._tap(), () => this._hold());
    }
  }

  private _measureGraph(): void {
    const g = this.shadowRoot?.querySelector('svg.graph');
    const h = g?.getBoundingClientRect().height ?? 0;
    if (h > 0 && Math.abs(h - this._graphH) > 1) this._graphH = h;
  }

  // ---------------- dane ----------------
  private _temperature(): { value: number; fromDevice: boolean } {
    const c = this._config!;
    const st = this._hass?.states ?? {};
    const t = c.temperature_entity ? num(st[c.temperature_entity]?.state) : NaN;
    if (Number.isFinite(t)) return { value: t, fromDevice: false };
    const d = c.climate_entity ? num(st[c.climate_entity]?.attributes?.current_temperature) : NaN;
    return { value: d, fromDevice: Number.isFinite(d) };
  }

  private _deviceKind(cl: HassEntity): DeviceKind {
    const c = this._config!;
    if (c.device_label !== 'auto') return c.device_label;
    const modes: string[] = cl.attributes?.hvac_modes ?? [];
    return modes.includes('cool') ? 'ac' : 'mat';
  }

  private async _loadHistory(): Promise<void> {
    const c = this._config;
    const hass = this._hass;
    if (!c || !hass) return;
    const hours = Math.max(c.hours_to_show, c.mode === 'outdoor' ? 24 : 0);
    // termometr; gdy brak albo bez historii - current_temperature urzadzenia
    let pts = c.temperature_entity ? await fetchNumericHistory(hass, c.temperature_entity, hours) : [];
    if (pts.length < 2 && c.climate_entity) {
      pts = await fetchNumericHistory(hass, c.climate_entity, hours, 'current_temperature');
    }
    this._points = pts;
  }

  private _appendLive(): void {
    const t = this._temperature().value;
    if (!Number.isFinite(t)) return;
    const now = Date.now();
    const last = this._points[this._points.length - 1];
    if (!last || last[1] !== t || now - last[0] > LIVE_POINT_MIN_GAP_MS) {
      this._points = [...this._points, [now, t]];
    }
  }

  private _minMax24(): { min: number; max: number } {
    const from = Date.now() - 24 * 3600e3;
    const v = this._points.filter((p) => p[0] >= from).map((p) => p[1]);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : { min: NaN, max: NaN };
  }

  // ---------------- akcje ----------------
  private _tap(): void {
    const c = this._config;
    if (!this._hass || !c || c.mode === 'outdoor' || !c.climate_entity) return;
    void this._hass.callService('climate', 'toggle', { entity_id: c.climate_entity });
  }

  private _hold(): void {
    const c = this._config;
    if (!c) return;
    const id = c.mode === 'outdoor' ? c.temperature_entity : c.climate_entity || c.temperature_entity;
    if (id) fireMoreInfo(this, id);
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    const hass = this._hass;
    if (!c || !hass) return nothing;

    const lang = getLanguage(hass);
    const t = (k: string) => localize(lang, k);
    const st = hass.states;
    const outdoor = c.mode === 'outdoor';
    const cl = c.climate_entity ? st[c.climate_entity] : undefined;

    const temp = this._temperature();
    const h = c.humidity_entity ? num(st[c.humidity_entity]?.state) : NaN;
    const co2 = c.co2_entity ? num(st[c.co2_entity]?.state) : NaN;
    const pm = c.pm25_entity ? num(st[c.pm25_entity]?.state) : NaN;

    const tBad = !outdoor && Number.isFinite(temp.value) && (temp.value < c.t_min || temp.value > c.t_max);
    const hBad = !outdoor && Number.isFinite(h) && (h < c.h_min || h > c.h_max);
    const co2Bad = Number.isFinite(co2) && co2 > c.co2_max;
    const pmBad = Number.isFinite(pm) && pm > c.pm25_max;
    const hasFoot = !!(c.humidity_entity || c.co2_entity || c.pm25_entity);

    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true', clickable: !!cl && !outdoor })}>
        ${this._renderGraph()}
        <div class="grid">
          <div class="name">${c.name ?? ''}</div>
          <div class="status">${this._renderStatus(cl, outdoor, t)}</div>
          <div class=${classMap({ temp: true, na: !Number.isFinite(temp.value), alarm: tBad })}>
            <span class="v">${fmt(temp.value)}</span><span class="u">°C</span>
            ${temp.fromDevice && c.temperature_entity ? html`<span class="src">${t('label.unit')}</span>` : nothing}
          </div>
          ${this._renderMiddle(cl, outdoor, t)}
          <div class="rule"></div>
          <div class="foot">
            <div class=${classMap({ wilg: true, hidden: !hasFoot, warn: hBad })}>
              ${c.humidity_entity
                ? html`<span class="lbl">${t('label.hum')}</span><span class="val h">${fmtInt(h)}</span>`
                : nothing}
              ${c.co2_entity
                ? html`<span class=${classMap({ air: true, warn: co2Bad })}
                    ><span class="lbl">CO₂</span><span class="val">${fmtInt(co2)}</span></span
                  >`
                : nothing}
              ${c.pm25_entity
                ? html`<span class=${classMap({ air: true, warn: pmBad })}
                    ><span class="lbl">PM2.5</span><span class="val">${fmtInt(pm)}</span></span
                  >`
                : nothing}
            </div>
            <div class="badge">${outdoor ? nothing : this._renderBadge(temp.value, h, co2Bad, pmBad, t)}</div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private _renderStatus(cl: HassEntity | undefined, outdoor: boolean, t: (k: string) => string) {
    if (outdoor) return html`<span class="stat">${t('status.reference')}</span>`;
    if (!cl) return nothing;
    const kind = this._deviceKind(cl);
    const map: Record<string, [string, string]> = {
      off: [t(kind === 'mat' ? 'status.off_mat' : 'status.off_ac'), 'var(--av-status)'],
      heat: [t('status.heat'), '#ffa726'],
      cool: [t('status.cool'), '#4fc3f7'],
      dry: [t('status.dry'), '#4dd0e1'],
      fan_only: [t('status.fan_only'), 'var(--av-status)'],
      auto: [t('status.auto'), '#81c784'],
      heat_cool: kind === 'mat' ? [t('status.heat'), '#ffa726'] : [t('status.auto'), '#81c784'],
      unavailable: [t('status.unavailable'), 'var(--av-warning)'],
      unknown: [t('status.unknown'), '#ff9800'],
    };
    const [txt, col] = map[cl.state] ?? [String(cl.state).toUpperCase(), 'var(--av-status)'];
    const on = !['off', 'unavailable', 'unknown'].includes(cl.state);
    return html`<span style="color:${col}">${txt}</span>
      <ha-icon icon="mdi:power" style="color:${on ? 'var(--av-ok)' : '#5a5a5a'}"></ha-icon>`;
  }

  private _renderMiddle(cl: HassEntity | undefined, outdoor: boolean, t: (k: string) => string) {
    const c = this._config!;
    if (outdoor) {
      const { min, max } = this._minMax24();
      return html`
        <div class="jedn"><span class="lbl">${t('label.min')}</span><span class="val">${fmt(min)}</span></div>
        <div class="zad"><span class="lbl">${t('label.max')}</span><span class="val">${fmt(max)}</span></div>
      `;
    }
    if (!cl) return html`<div class="jedn hidden"></div><div class="zad hidden"></div>`;
    const kind = this._deviceKind(cl);
    // bez osobnego czujnika glowna liczba juz pochodzi z urzadzenia
    const showUnit = !!c.temperature_entity;
    return html`
      <div class=${classMap({ jedn: true, hidden: !showUnit })}>
        <span class="lbl">${t(kind === 'mat' ? 'label.floor' : 'label.unit')}</span>
        <span class="val">${fmt(num(cl.attributes.current_temperature))}</span>
      </div>
      <div class="zad">
        <span class="lbl">${t('label.set')}</span>
        <span class="val sp">${fmt(num(cl.attributes.temperature))}</span>
      </div>
    `;
  }

  private _renderBadge(t: number, h: number, co2Bad: boolean, pmBad: boolean, tr: (k: string) => string) {
    const c = this._config!;
    if (!Number.isFinite(t) && !Number.isFinite(h)) return nothing;
    // kolejnosc: odczuwalne od razu -> wymagajace przewietrzenia
    let key = 'badge.comfort';
    let col = 'var(--av-ok)';
    if (Number.isFinite(t) && t < c.t_min) [key, col] = ['badge.cold', '#4fc3f7'];
    else if (Number.isFinite(t) && t > c.t_max) [key, col] = ['badge.hot', '#ff5252'];
    else if (co2Bad) [key, col] = ['badge.stuffy', 'var(--av-caution)'];
    else if (pmBad) [key, col] = ['badge.dust', 'var(--av-caution)'];
    else if (Number.isFinite(h) && h > c.h_max) [key, col] = ['badge.humid', '#ffeb3b'];
    else if (Number.isFinite(h) && h < c.h_min) [key, col] = ['badge.dry', '#ffeb3b'];
    return html`<span style="color:${col};border-color:${col}">${tr(key)}</span>`;
  }

  private _renderGraph() {
    const c = this._config!;
    const end = Date.now();
    const start = end - c.hours_to_show * 3600e3;
    const pts = this._points.filter((p) => p[0] >= start);
    if (pts.length < 2) return html`<svg class="graph" viewBox="0 0 100 40" preserveAspectRatio="none"></svg>`;

    // usrednianie do stalej liczby przedzialow (wygladzenie, stala zlozonosc)
    const step = (end - start) / GRAPH_BUCKETS;
    const buckets: Array<number | null> = [];
    let i = 0;
    for (let b = 0; b < GRAPH_BUCKETS; b++) {
      const bEnd = start + (b + 1) * step;
      let sum = 0;
      let n = 0;
      while (i < pts.length && pts[i][0] < bEnd) {
        sum += pts[i][1];
        n++;
        i++;
      }
      buckets.push(n ? sum / n : null);
    }
    // luki: ostatnia znana wartosc (stan obowiazuje do zmiany)
    let lastV = pts[0][1];
    const vals = buckets.map((v) => (v === null ? lastV : (lastV = v)));

    // stala skala: wysokosc [px] / px_per_degree = zakres °C;
    // gdy dane sie nie mieszcza - sciskamy (10% zapasu), nigdy nie rozciagamy
    const dMin = Math.min(...vals);
    const dMax = Math.max(...vals);
    const range = Math.max(this._graphH / Math.max(c.px_per_degree, 1), (dMax - dMin) * 1.2, 0.1);
    // minimum ~12% nad dolna krawedzia: stabilna temperatura lezy pod duza liczba
    const lo = dMin - range * 0.12;
    const y = (v: number) => 40 - ((v - lo) / range) * 40;
    const x = (k: number) => (k / (GRAPH_BUCKETS - 1)) * 100;

    const gv = gridValues(lo, lo + range, { mode: c.graph_grid ?? 'off', step: c.graph_grid_step });
    let d = `M ${x(0)} ${y(vals[0]).toFixed(2)}`;
    for (let k = 1; k < GRAPH_BUCKETS; k++) d += ` L ${x(k).toFixed(2)} ${y(vals[k]).toFixed(2)}`;

    const stops: Array<[number, string]> =
      c.graph_style === 'color'
        ? TEMPERATURE_THRESHOLDS.map(([v, col]): [number, string] => [Math.min(Math.max(y(v) / 40, 0), 1), col])
            .sort((a, b) => a[0] - b[0])
        : [[0, c.graph_color], [1, c.graph_color]];

    return html`
      <svg class="graph" viewBox="0 0 100 40" preserveAspectRatio="none">
        <defs>
          <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="40">
            ${stops.map(([o, col]) => svg`<stop offset=${o} stop-color=${col}></stop>`)}
          </linearGradient>
        </defs>
        ${gridSvg(gv, y, 100)}
        <path d=${`${d} L 100 40 L 0 40 Z`} fill="url(#g)" fill-opacity="0.35" stroke="none"></path>
        <path
          d=${d}
          fill="none"
          stroke="url(#g)"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
          stroke-linecap="round"
        ></path>
      </svg>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        min-height: 178px;
        padding: 10px 16px;
      }
      /* wykres konczy sie na kresce: padding 10 + stopka 30 + kreska 1 + marginesy 10 */
      svg.graph {
        position: absolute;
        left: 0;
        right: 0;
        top: 34px;
        height: calc(100% - 85px);
        width: 100%;
        opacity: 0.35;
        pointer-events: none;
        z-index: 0;
      }
      .grid {
        position: relative;
        z-index: 1;
        height: 100%;
        display: grid;
        grid-template-areas: 'name status' 'temp temp' 'jedn zad' 'rule rule' 'foot foot';
        grid-template-columns: 1fr 1fr;
        grid-template-rows: min-content 1fr min-content min-content min-content;
      }
      .name {
        grid-area: name;
        color: var(--av-label);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }
      .status {
        grid-area: status;
        justify-self: end;
        font-size: 14px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .status .stat {
        color: var(--av-status);
      }
      .status ha-icon {
        --mdc-icon-size: 18px;
      }
      .temp {
        grid-area: temp;
        justify-self: center;
        align-self: center;
        font-size: 54px;
        font-weight: 700;
        line-height: 1;
      }
      .temp .u {
        font-size: 20px;
        color: var(--av-unit);
        margin-left: 6px;
        position: relative;
        top: -18px;
      }
      .temp .src {
        font-size: 10px;
        color: var(--av-unit);
        margin-left: 4px;
        position: relative;
        top: -26px;
        letter-spacing: 0.5px;
      }
      .temp.na .v {
        color: var(--av-dim);
      }
      .temp.alarm .v {
        color: var(--av-warning);
      }
      .jedn {
        grid-area: jedn;
        justify-self: center;
      }
      .zad {
        grid-area: zad;
        justify-self: center;
      }
      .jedn .lbl,
      .zad .lbl {
        font-size: 13px;
      }
      .val {
        font-size: 21px;
        font-weight: 700;
        margin-left: 6px;
      }
      .val.sp {
        color: var(--av-setpoint-value);
      }
      .rule {
        grid-area: rule;
        height: 1px;
        background: var(--av-frame);
        margin: 6px 0 4px;
      }
      .foot {
        grid-area: foot;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-width: 0;
      }
      .wilg {
        flex: 1 1 auto;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
      }
      .wilg .lbl {
        font-size: 14px;
      }
      .wilg .val.h {
        font-size: 23px;
        margin-left: 8px;
      }
      .wilg.warn .val.h {
        color: var(--av-caution);
      }
      .air {
        margin-left: 12px;
      }
      .air .lbl {
        font-size: 12px;
      }
      .air .val {
        font-size: 16px;
        margin-left: 4px;
      }
      .air.warn .val {
        color: var(--av-caution);
      }
      .badge {
        flex: none;
      }
      .badge span {
        border: 1.5px solid;
        padding: 1px 8px;
        font-size: 15px;
        font-weight: 700;
        text-shadow: none;
      }
    `,
  ];
}
