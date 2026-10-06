import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { cardHeader } from '../../core/header';
import { resolveZones, inverseWanted, levelStyle } from '../../core/zone-extras';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { entityPrecision } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { ObservedHistory } from '../../core/observed';
import { levelOf, zonesOf, niceStep, type Level, type EisRowConfig } from '../eis/config';
import { type DialCardConfig, type DialConfig, normalizeDial } from './config';

const LEVEL_COLOR: Record<Level, string> = {
  ok: 'var(--av-ok)',
  caution: 'var(--av-caution)',
  warning: 'var(--av-warning)',
  none: 'var(--av-value)',
};

// geometria tarczy: viewBox 120 x 100, srodek (60,56), luk 240° (od -120° do +120°, 0° = gora)
const CX = 60;
const CY = 56;
const SPAN = 240;
const A0 = -SPAN / 2;

const pt = (a: number, r: number): [number, number] => {
  const rad = (a * Math.PI) / 180;
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)];
};
const p2 = (a: number, r: number) => pt(a, r).map((n) => n.toFixed(2)).join(' ');
const arc = (r: number, a0: number, a1: number) =>
  `M ${p2(a0, r)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p2(a1, r)}`;

export class AvionicsDialCard extends LitElement {
  @state() private _config?: DialCardConfig;
  @state() private _dials: DialConfig[] = [];
  @state() private _styleMode: StyleMode = 'look';

  private _hass?: HomeAssistant;
  private _key = '';
  private _observed = new ObservedHistory();

  static getConfigElement() {
    return document.createElement('avionics-dial-card-editor');
  }

  static getStubConfig() {
    return { entities: [{ entity: '' }] };
  }

  setConfig(config: DialCardConfig): void {
    if (!Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error(localize(getLanguage(), 'eis.error.no_entities'));
    }
    this._config = config;
    this._dials = config.entities.map(normalizeDial);
    this._observed.reset();
    for (const d of this._dials.filter((x) => x.show_range)) this._observed.track(d.entity, d.range_minutes!);
    this._key = '';
  }

  getCardSize(): number {
    return 3;
  }

  /** 1 tarcza = 1/3 szerokosci, 2 = polowa, 3+ = cala szerokosc sekcji */
  getGridOptions() {
    const n = this._dials.length;
    return { columns: n <= 1 ? 4 : n === 2 ? 6 : 12, min_columns: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    this._observed.update(hass, () => this.requestUpdate());
    const mode = readStyleMode(this);
    const ids = this._dials.flatMap((d) => [d.entity, d.setpoint_entity, d.forecast_entity]).filter(Boolean) as string[];
    const key = ids.map((e) => hass.states[e]?.last_updated ?? '').join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // ---------------- pomocnicze ----------------
  private _val(d: DialConfig, id?: string, fixed?: number): number {
    if (id) return num(this._hass!.states[id]?.state) * (id === d.entity ? d.multiplier ?? 1 : 1);
    return num(fixed);
  }

  private _angle(d: DialConfig, v: number): number {
    const span = d.max! - d.min!;
    if (!(span > 0) || !Number.isFinite(v)) return A0;
    return A0 + (Math.min(Math.max((v - d.min!) / span, 0), 1) * SPAN);
  }

  private _digits(d: DialConfig): number {
    if (typeof d.precision === 'number') return d.precision;
    if ((d.multiplier ?? 1) !== 1) return 1;
    return entityPrecision(this._hass, d.entity!);
  }

  private _fmtScale(v: number): string {
    return Number.isInteger(v) ? String(v) : String(v).replace('.', ',');
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = this._config;
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${cardHeader(c.title)}
        <div class="dials">${this._dials.map((d) => this._renderDial(d))}</div>
      </ha-card>
    `;
  }

  private _renderDial(d: DialConfig) {
    const t = (k: string) => localize(getLanguage(this._hass), k);
    if (!d.entity) return html`<div class="dial empty">${t('eis.choose_entity')}</div>`;
    const c = this._config!;
    const ent = this._hass!.states[d.entity];
    const v = this._val(d, d.entity);
    const failed = !Number.isFinite(v);
    d = resolveZones(this._hass, d);
    const lvl = levelOf(v, d as EisRowConfig);
    const unit = d.unit ?? ent?.attributes?.unit_of_measurement ?? '';
    const name = d.name ?? ent?.attributes?.friendly_name ?? d.entity;
    const simplified = c.dial_style === 'simplified';
    const text = failed ? '--' : v.toFixed(this._digits(d)).replace('.', ',');

    return html`
      <div class="dial" @click=${() => fireMoreInfo(this, d.entity!)}>
        <svg viewBox="0 0 120 100">
          ${simplified ? this._simplified(d, v, lvl, failed) : this._trueAvionics(d, v, lvl, failed)}
          ${this._markers(d, simplified)}
          ${failed
            ? svg`<line class="fail" x1="22" y1="22" x2="98" y2="88"></line>
                 <line class="fail" x1="98" y1="22" x2="22" y2="88"></line>`
            : nothing}
          <text class="mm" x=${pt(A0, 44)[0]} y="96" text-anchor="middle">${this._fmtScale(d.min!)}</text>
          <text class="mm" x=${pt(-A0, 44)[0]} y="96" text-anchor="middle">${this._fmtScale(d.max!)}</text>
        </svg>
        ${simplified
          ? nothing
          : html`<div class="readout"><span style=${failed ? 'color:var(--av-dim)' : levelStyle(lvl === 'ok' || lvl === 'none' ? 'var(--av-value)' : LEVEL_COLOR[lvl], lvl === 'warning', inverseWanted(this, (this._config as any)?.warning_inverse))}>
              ${text}<span class="u">${unit}</span></span>
            </div>`}
        <div class="name">${name}</div>
      </div>
    `;
  }

  /** Styl kokpitu: cienka skala, pasma stref na zewnatrz, podzialka, redline, igla. */
  private _trueAvionics(d: DialConfig, v: number, lvl: Level, failed: boolean) {
    const zones = zonesOf(d as EisRowConfig);
    const span = d.max! - d.min!;
    const step = niceStep(span);
    const ticks: Array<{ a: number; major: boolean }> = [];
    if (span > 0) {
      const first = Math.ceil(d.min! / (step / 2)) * (step / 2);
      for (let x = first, i = 0; x <= d.max! + 1e-9 && i < 60; x += step / 2, i++) {
        ticks.push({ a: this._angle(d, x), major: Math.abs(x / step - Math.round(x / step)) < 1e-6 });
      }
    }
    const a = this._angle(d, v);
    const col = lvl === 'caution' || lvl === 'warning' ? LEVEL_COLOR[lvl] : 'var(--av-value)';
    const redline = typeof d.warning_high === 'number' ? this._angle(d, d.warning_high) : undefined;

    return svg`
      ${zones.map(
        ([z0, z1, l]) =>
          svg`<path d=${arc(47, this._angle(d, z0), this._angle(d, z1))} stroke=${LEVEL_COLOR[l]} stroke-width="4" fill="none"></path>`,
      )}
      <path d=${arc(44, A0, -A0)} class="scale"></path>
      ${ticks.map(
        (tk) => svg`<line class=${tk.major ? 'tick major' : 'tick'}
          x1=${pt(tk.a, tk.major ? 38 : 41)[0]} y1=${pt(tk.a, tk.major ? 38 : 41)[1]}
          x2=${pt(tk.a, 44)[0]} y2=${pt(tk.a, 44)[1]}></line>`,
      )}
      ${redline !== undefined
        ? svg`<line class="redline" x1=${pt(redline, 36)[0]} y1=${pt(redline, 36)[1]} x2=${pt(redline, 50)[0]} y2=${pt(redline, 50)[1]}></line>`
        : nothing}
      ${failed
        ? nothing
        : svg`<polygon fill=${col} points="${p2(a, 42)} ${p2(a + 90, 2.6)} ${p2(a - 90, 2.6)}"></polygon>
              <circle cx=${CX} cy=${CY} r="3.2" fill=${col}></circle>`}
    `;
  }

  /** Styl uproszczony (wallboard): gruby tor, wypelnienie do wartosci, liczba w srodku. */
  private _simplified(d: DialConfig, v: number, lvl: Level, failed: boolean) {
    const a = this._angle(d, v);
    const fill = lvl === 'none' ? 'var(--av-value)' : LEVEL_COLOR[lvl];
    const ent = this._hass!.states[d.entity!];
    const unit = d.unit ?? ent?.attributes?.unit_of_measurement ?? '';
    const text = failed ? '--' : v.toFixed(this._digits(d)).replace('.', ',');
    return svg`
      <path d=${arc(40, A0, -A0)} stroke="#5a5a5a" stroke-width="9" fill="none"></path>
      ${!failed && a > A0 + 0.5 ? svg`<path d=${arc(40, A0, a)} stroke=${fill} stroke-width="9" fill="none"></path>` : nothing}
      <text class="big" x=${CX} y=${CY + 6} text-anchor="middle">${text}</text>
      <text class="unit" x=${CX} y=${CY + 20} text-anchor="middle">${unit}</text>
    `;
  }

  /** Strzalki na zewnatrz luku (nastawa cyjan, prognoza magenta) i puste znaczniki obserwowane wewnatrz. */
  private _markers(d: DialConfig, simplified: boolean) {
    const out = simplified ? 46 : 51;
    const inner = simplified ? 34 : 38;
    const arrowIn = (v: number, color: string) => {
      const a = this._angle(d, v);
      return svg`<polygon fill=${color} points="${p2(a, out)} ${p2(a + 5, out + 7)} ${p2(a - 5, out + 7)}"></polygon>`;
    };
    const hollow = (v: number) => {
      const a = this._angle(d, v);
      return svg`<polygon class="hollow" points="${p2(a, inner + 6)} ${p2(a + 6, inner - 1)} ${p2(a - 6, inner - 1)}"></polygon>`;
    };
    const sp = this._val(d, d.setpoint_entity, d.setpoint);
    const fc = this._val(d, d.forecast_entity, d.forecast);
    const obs = d.show_range
      ? this._observed.markers(d.entity, d.range_minutes!, d.range_markers ?? 'max').map((x) => x * (d.multiplier ?? 1))
      : [];
    return svg`
      ${obs.map((x) => hollow(x))}
      ${Number.isFinite(sp) ? arrowIn(sp, 'var(--av-setpoint)') : nothing}
      ${Number.isFinite(fc) ? arrowIn(fc, 'var(--av-forecast)') : nothing}
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 12px 8px;
      }
      .title {
        color: var(--av-label);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 4px;
      }
      .dials {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 4px 8px;
      }
      .dial {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        min-width: 0;
      }
      .dial.empty {
        color: var(--av-dim);
        padding: 24px 0;
      }
      svg {
        width: 100%;
        max-width: 200px;
        display: block;
        overflow: visible;
      }
      .scale {
        fill: none;
        stroke: var(--av-value);
        stroke-width: 1.2;
      }
      .tick {
        stroke: var(--av-value);
        stroke-width: 1;
        opacity: 0.7;
      }
      .tick.major {
        stroke-width: 1.4;
        opacity: 1;
      }
      .redline {
        stroke: var(--av-warning);
        stroke-width: 2.4;
      }
      .hollow {
        fill: none;
        stroke: var(--av-dim);
        stroke-width: 1.3;
      }
      .fail {
        stroke: var(--av-warning);
        stroke-width: 2;
      }
      text {
        font-family: var(--av-font);
        font-variant-numeric: tabular-nums;
      }
      .mm {
        fill: var(--av-dim);
        font-size: 9px;
      }
      .big {
        fill: var(--av-value);
        font-size: 22px;
        font-weight: 700;
      }
      .unit {
        fill: var(--av-unit);
        font-size: 9px;
        font-weight: 700;
      }
      /* odczyt cyfrowy pod osia (styl trueAvionics) */
      .readout {
        margin-top: -30px;
        font-size: 20px;
        font-weight: 700;
        line-height: 1;
        position: relative;
        z-index: 1;
      }
      .readout .u {
        font-size: 11px;
        color: var(--av-unit);
        margin-left: 3px;
      }
      .name {
        margin-top: 8px;
        color: var(--av-label);
        font-size: 14px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
    `,
  ];
}
