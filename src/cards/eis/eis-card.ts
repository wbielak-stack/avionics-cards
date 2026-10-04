import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num, PAIR_SEP } from '../../core/format';
import { formatValue } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { fetchNumericHistory, type Point } from '../../core/history';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import {
  type EisCardConfig,
  type EisRowConfig,
  type Level,
  EIS_DEFAULTS,
  clean,
  normalizeRow,
  levelOf,
  zonesOf,
  niceStep,
} from './config';

/** Pelne odswiezenie historii (korekta); w miedzyczasie wartosci dopisywane na biezaco. */
const HISTORY_REFRESH_MS = 30 * 60 * 1000;
/** Minimalny odstep miedzy dopisywanymi punktami tej samej wartosci. */
const LIVE_POINT_GAP_MS = 60 * 1000;

const LEVEL_COLOR: Record<Level, string> = {
  ok: 'var(--av-ok)',
  caution: 'var(--av-caution)',
  warning: 'var(--av-warning)',
  none: 'var(--av-value)',
};

export class AvionicsEisCard extends LitElement {
  @state() private _config?: EisCardConfig;
  @state() private _rows: EisRowConfig[] = [];
  @state() private _styleMode: StyleMode = 'look';
  /** Wartosci obserwowane: punkty per encja, okno = najdluzszy okres wierszy tej encji. */
  private _hist = new Map<string, Point[]>();
  private _histWindowMin = new Map<string, number>();

  private _hass?: HomeAssistant;
  private _key = '';
  private _lastFetch = 0;

  // ---------------- edytor ----------------
  static getConfigElement() {
    return document.createElement('avionics-eis-card-editor');
  }

  /** Nowa karta startuje pusta - bez podsuwania przypadkowej encji. */
  static getStubConfig() {
    return { entities: [{ entity: '' }] };
  }

  // ---------------- konfiguracja ----------------
  setConfig(config: EisCardConfig): void {
    if (!Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error(localize(getLanguage(), 'eis.error.no_entities'));
    }
    this._config = { ...EIS_DEFAULTS, ...clean(config) } as EisCardConfig;
    const fallback = config.hours_to_show ? config.hours_to_show * 60 : undefined;
    this._rows = config.entities.map((r) => normalizeRow(r, fallback));
    this._hist = new Map();
    this._histWindowMin = new Map();
    for (const r of this._rows.filter((x) => x.show_range)) {
      for (const id of [r.entity, r.entity2]) {
        if (id) this._histWindowMin.set(id, Math.max(this._histWindowMin.get(id) ?? 0, r.range_minutes!));
      }
    }
    this._lastFetch = 0;
    this._key = '';
  }

  getCardSize(): number {
    return 1 + this._rows.length;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    if (this._histWindowMin.size && Date.now() - this._lastFetch > HISTORY_REFRESH_MS) {
      this._lastFetch = Date.now();
      void this._loadHistory();
    }
    const mode = readStyleMode(this);
    const ids = this._rows
      .flatMap((r) => [
        r.entity,
        r.entity2,
        r.setpoint_entity,
        r.setpoint2_entity,
        r.forecast_entity,
        r.forecast2_entity,
      ])
      .filter(Boolean) as string[];
    const key = ids.map((e) => hass.states[e]?.last_updated ?? '').join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this._appendLive();
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private async _loadHistory(): Promise<void> {
    const hass = this._hass;
    if (!hass) return;
    for (const [id, minutes] of this._histWindowMin) {
      const pts = await fetchNumericHistory(hass, id, minutes / 60);
      // zachowaj punkty dopisane na zywo po starcie pobierania
      const last = pts.length ? pts[pts.length - 1][0] : 0;
      const live = (this._hist.get(id) ?? []).filter((p) => p[0] > last);
      this._hist.set(id, [...pts, ...live]);
    }
    this.requestUpdate();
  }

  /** Dopisz biezace wartosci sledzonych encji i odrzuc punkty starsze niz okno. */
  private _appendLive(): void {
    const now = Date.now();
    for (const [id, minutes] of this._histWindowMin) {
      const v = num(this._hass?.states[id]?.state);
      const arr = this._hist.get(id) ?? [];
      const last = arr[arr.length - 1];
      if (Number.isFinite(v) && (!last || last[1] !== v || now - last[0] > LIVE_POINT_GAP_MS)) {
        arr.push([now, v]);
      }
      // zostaw ostatni punkt sprzed okna - to wartosc obowiazujaca na jego poczatku
      const from = now - minutes * 60000;
      while (arr.length > 1 && arr[1][0] <= from) arr.shift();
      this._hist.set(id, arr);
    }
  }

  /** Min/max encji z ostatnich `minutes` minut (z wartoscia obowiazujaca na poczatku okna). */
  private _observed(id: string | undefined, minutes: number): { min: number; max: number } | undefined {
    if (!id) return undefined;
    const pts = this._hist.get(id) ?? [];
    const from = Date.now() - minutes * 60000;
    const v = pts.filter((p) => p[0] >= from).map((p) => p[1]);
    const atStart = this._valueAt(id, from);
    if (Number.isFinite(atStart)) v.push(atStart);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : undefined;
  }

  /** Wartosc obowiazujaca w chwili `t` (ostatni punkt nie pozniejszy niz t). */
  private _valueAt(id: string | undefined, t: number): number {
    if (!id) return NaN;
    const pts = this._hist.get(id) ?? [];
    let v = NaN;
    for (const p of pts) {
      if (p[0] <= t) v = p[1];
      else break;
    }
    return v;
  }

  // ---------------- formatowanie ----------------
  private _fmt(r: EisRowConfig, v: number, entityId: string): string {
    return formatValue(this._hass, entityId, v, r.precision);
  }

  /** Liczby skali: calkowite bez przecinka. */
  private _fmtScale(v: number): string {
    return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
  }

  private _pct(r: EisRowConfig, v: number): number {
    const span = r.max! - r.min!;
    if (!(span > 0) || !Number.isFinite(v)) return 0;
    return Math.min(Math.max(((v - r.min!) / span) * 100, 0), 100);
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = this._config;
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${c.title ? html`<div class="title">${c.title}</div>` : nothing}
        ${this._rows.map((r) => this._renderRow(r))}
      </ha-card>
    `;
  }

  private _renderRow(r: EisRowConfig) {
    const t = (k: string) => localize(getLanguage(this._hass), k);
    if (!r.entity) {
      return html`<div class="row empty"><span class="lbl">${t('eis.choose_entity')}</span></div>`;
    }
    const st = this._hass!.states;
    const ent = st[r.entity];
    const v = num(ent?.state);
    const v2 = r.entity2 ? num(st[r.entity2]?.state) : NaN;
    const failed = !Number.isFinite(v);

    const unit = r.unit ?? ent?.attributes?.unit_of_measurement ?? '';
    const name = r.name ?? ent?.attributes?.friendly_name ?? r.entity;
    const valueText = r.entity2
      ? `${this._fmt(r, v, r.entity)}${PAIR_SEP}${this._fmt(r, v2, r.entity2)}`
      : this._fmt(r, v, r.entity);

    // kolor liczby: gorszy ze stanow obu wartosci
    const rank: Record<Level, number> = { none: 0, ok: 1, caution: 2, warning: 3 };
    const levels: Level[] = [levelOf(v, r)];
    if (r.entity2) levels.push(levelOf(v2, r));
    const lvl = levels.reduce((a, b) => (rank[b] > rank[a] ? b : a), 'none' as Level);

    return html`
      <div class="row" @click=${() => fireMoreInfo(this, r.entity!)}>
        <div class="head">
          <span class="lbl">${name}</span>
          <span class="val" style=${styleMap({ color: lvl === 'ok' ? 'var(--av-value)' : LEVEL_COLOR[lvl] })}>
            ${valueText}${unit ? html`<span class="unit">${unit}</span>` : nothing}
          </span>
        </div>
        ${r.show_bar ? this._renderBar(r, v, v2, failed) : nothing}
      </div>
    `;
  }

  private _renderBar(r: EisRowConfig, v: number, v2: number, failed: boolean) {
    const zones = zonesOf(r);
    const span = r.max! - r.min!;
    const step = r.major_tick && r.major_tick > 0 ? r.major_tick : niceStep(span);
    const ticks: Array<{ p: number; major: boolean }> = [];
    if (span > 0) {
      const first = Math.ceil(r.min! / (step / 2)) * (step / 2);
      for (let t = first, i = 0; t <= r.max! + 1e-9 && i < 60; t += step / 2, i++) {
        const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
        ticks.push({ p: this._pct(r, t), major });
      }
    }
    // konwencja kokpitu: pelne = biezace (1. nad pasmem, 2. pod), puste = obserwowane min/max
    const colorOf = (x: number) => {
      const l = levelOf(x, r);
      return l === 'caution' || l === 'warning' ? LEVEL_COLOR[l] : 'var(--av-value)';
    };
    // nastawy po stronie swoich wartosci: pierwsza nad paskiem, druga pod
    const spOf = (ent?: string, val?: number) => (ent ? num(this._hass!.states[ent]?.state) : num(val));
    const sp = spOf(r.setpoint_entity, r.setpoint);
    const sp2 = r.entity2 ? spOf(r.setpoint2_entity, r.setpoint2) : NaN;
    const fc = spOf(r.forecast_entity, r.forecast);
    const fc2 = r.entity2 ? spOf(r.forecast2_entity, r.forecast2) : NaN;
    // puste znaczniki: skrajne wartosci z okresu albo wartosc sprzed okresu
    const mode = r.range_markers ?? 'both';
    const observed = (id: string | undefined, top: boolean) => {
      if (!r.show_range || !id) return nothing;
      if (mode === 'ago') {
        const past = this._valueAt(id, Date.now() - r.range_minutes! * 60000);
        return Number.isFinite(past) ? marker(past, top, false, 'var(--av-dim)') : nothing;
      }
      const rg = this._observed(id, r.range_minutes!);
      if (!rg) return nothing;
      return html`${mode !== 'max' ? marker(rg.min, top, false, 'var(--av-dim)') : nothing}${mode !== 'min'
        ? marker(rg.max, top, false, 'var(--av-dim)')
        : nothing}`;
    };
    const DOWN = 'M0 0 L12 0 L6 9 Z';
    const UP = 'M6 0 L12 9 L0 9 Z';
    const DOWN_HOLLOW = 'M1 0.75 L11 0.75 L6 8 Z';
    const UP_HOLLOW = 'M6 1 L11 8.25 L1 8.25 Z';
    const marker = (x: number, top: boolean, filled: boolean, color: string) => html`
      <div class="mk ${top ? 'top' : 'bottom'}" style="left:${this._pct(r, x)}%">
        <svg viewBox="0 0 12 9">
          ${filled
            ? svg`<path d=${top ? DOWN : UP} fill=${color}></path>`
            : svg`<path d=${top ? DOWN_HOLLOW : UP_HOLLOW} fill="none" stroke=${color} stroke-width="1.5"></path>`}
        </svg>
      </div>
    `;

    return html`
      <div class="bar">
        <div class="band">
          ${zones.length
            ? zones.map(
                ([a, b, l]) => html`<div
                  class="zone"
                  style=${styleMap({
                    left: `${this._pct(r, a)}%`,
                    width: `${this._pct(r, b) - this._pct(r, a)}%`,
                    background: LEVEL_COLOR[l],
                  })}
                ></div>`,
              )
            : html`<div class="zone neutral" style="left:0;width:100%"></div>`}
        </div>
        ${ticks.map(
          (t) => html`<div class=${classMap({ tick: true, major: t.major })} style="left:${t.p}%"></div>`,
        )}
        ${Number.isFinite(sp) ? marker(sp, true, true, 'var(--av-setpoint)') : nothing}
        ${Number.isFinite(sp2) ? marker(sp2, false, true, 'var(--av-setpoint)') : nothing}
        ${Number.isFinite(fc) ? marker(fc, true, true, 'var(--av-forecast)') : nothing}
        ${Number.isFinite(fc2) ? marker(fc2, false, true, 'var(--av-forecast)') : nothing}
        ${observed(r.entity, true)} ${observed(r.entity2, false)}
        ${!failed ? marker(v, true, true, colorOf(v)) : nothing}
        ${Number.isFinite(v2) ? marker(v2, false, true, colorOf(v2)) : nothing}
        ${failed
          ? html`<svg class="fail" viewBox="0 0 100 10" preserveAspectRatio="none">
              ${svg`<line x1="0" y1="0" x2="100" y2="10"></line><line x1="0" y1="10" x2="100" y2="0"></line>`}
            </svg>`
          : nothing}
      </div>
      ${r.show_scale
        ? html`<div class="scale"><span>${this._fmtScale(r.min!)}</span><span>${this._fmtScale(r.max!)}</span></div>`
        : nothing}
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 16px 12px;
      }
      .title {
        color: var(--av-label);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 4px;
        border-bottom: 1px solid var(--av-frame);
      }
      .row {
        padding: 6px 0 4px;
        cursor: pointer;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }
      .head .lbl {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .val {
        font-size: 22px;
        font-weight: 700;
        white-space: nowrap;
      }
      .val .unit {
        font-size: 13px;
        color: var(--av-unit);
        margin-left: 4px;
        font-weight: 700;
      }
      /* --- pasek EIS: wskaznik nad pasmem, nastawa i zakres pod pasmem --- */
      .bar {
        position: relative;
        height: 28px;
        margin: 2px 6px 0;
      }
      .band {
        position: absolute;
        left: 0;
        right: 0;
        top: 11px;
        height: 6px;
        background: #262626;
      }
      .zone {
        position: absolute;
        top: 0;
        bottom: 0;
      }
      .zone.neutral {
        background: var(--av-dim);
        opacity: 0.45;
      }
      .tick {
        position: absolute;
        top: 13px;
        width: 1px;
        height: 4px;
        background: var(--av-value);
        transform: translateX(-0.5px);
        opacity: 0.7;
      }
      .tick.major {
        top: 9px;
        height: 10px;
        opacity: 1;
      }
      .row.empty .lbl {
        color: var(--av-dim);
        font-size: 14px;
      }
      .mk {
        position: absolute;
        width: 12px;
        height: 9px;
        transform: translateX(-50%);
        line-height: 0;
      }
      .mk svg {
        width: 12px;
        height: 9px;
        display: block;
      }
      .mk.top {
        top: 0;
      }
      .mk.bottom {
        top: 19px;
      }
      svg.fail {
        position: absolute;
        left: 0;
        right: 0;
        top: 4px;
        width: 100%;
        height: 20px;
      }
      svg.fail line {
        stroke: var(--av-warning);
        stroke-width: 2;
        vector-effect: non-scaling-stroke;
      }
      .scale {
        display: flex;
        justify-content: space-between;
        margin: 0 6px;
        font-size: 11px;
        color: var(--av-dim);
      }
    `,
  ];
}
