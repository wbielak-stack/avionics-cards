import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { resolveZones, inverseWanted, levelStyle } from '../../core/zone-extras';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { levelOf, type EisRowConfig } from '../eis/config';
import { type BarsCardConfig, normalizeBars, parseHours } from './config';
import { hourlySeries, windowBars, currentHourStart, type HourBar } from './series';
import { gridValues, gridSvg, gridLabels, snapRange, fixedRange } from '../../core/grid';

const W = 10; // szerokosc slotu godziny w ukladzie SVG
const H = 100; // wysokosc obszaru slupkow
const BAND = 5; // pasek stref pod slupkami

export class AvionicsBarsCard extends LitElement {
  @state() private _config?: BarsCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _selected?: number;

  private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-bars-card-editor');
  }

  static getStubConfig() {
    return { entity: '', preset: 'pse_rce' };
  }

  setConfig(config: BarsCardConfig): void {
    this._config = normalizeBars(config);
    this._key = '';
    this._selected = undefined;
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, rows: 4, min_columns: 4, min_rows: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    const mode = readStyleMode(this);
    const ids = [c.entity, c.entity_next, c.line1_entity, c.line2_entity, c.line3_entity, c.good_entity];
    // biezaca godzina w kluczu: przesuniecie okna co pelna godzine
    const key = ids.map((e) => (e ? hass.states[e]?.last_updated ?? '' : '')).join('|')
      + `|${mode}|${getLanguage(hass)}|${currentHourStart()}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private _fmt(v: number): string {
    const c = this._config!;
    if (!Number.isFinite(v)) return '--';
    const d = typeof c.precision === 'number' ? c.precision : Math.abs(v) >= 100 ? 0 : 2;
    return v.toFixed(d).replace('.', ',');
  }

  private _lines(): Array<{ v: number; label?: string }> {
    const c = this._config!;
    const st = this._hass!.states;
    const out: Array<{ v: number; label?: string }> = [];
    for (const i of [1, 2, 3] as const) {
      const ent = c[`line${i}_entity`];
      const v = ent ? num(st[ent]?.state) : num(c[`line${i}`]);
      if (Number.isFinite(v)) out.push({ v, label: c[`line${i}_label`] });
    }
    return out;
  }

  /**
   * Etykiety linii stoja nad linia; gdy linia lezy za blisko poprzedniej (wyzszej),
   * jej etykieta przechodzi pod linie. Wejscie: polozenie w % wysokosci.
   */
  private _labelBelow(tops: number[]): boolean[] {
    const GAP = 12;
    const order = tops.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t);
    const below: boolean[] = tops.map(() => false);
    for (let k = 1; k < order.length; k++) {
      if (order[k].t - order[k - 1].t < GAP && !below[order[k - 1].i]) below[order[k].i] = true;
    }
    return below;
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    if (!c.entity) return html`<ha-card><div class="empty">${t('eis.choose_entity')}</div></ha-card>`;

    const ent = this._hass.states[c.entity];
    // wartosc = (surowa x mnoznik + dodatek) x mnoznik koncowy (np. (cena + marza) x VAT)
    const m = c.multiplier ?? 1;
    const off = c.offset ?? 0;
    const fm = c.final_multiplier ?? 1;
    const next = c.entity_next ? this._hass.states[c.entity_next] : undefined;
    const bars: HourBar[] = windowBars(hourlySeries([ent, next], c), c.hours_back!, c.hours_forward!).map((b) => ({
      t: b.t,
      v: (b.v * m + off) * fm,
    }));
    const now = currentHourStart();
    const curIdx = bars.findIndex((b) => b.t === now);
    const selIdx = this._selected !== undefined && this._selected < bars.length ? this._selected : curIdx;
    const sel = bars[selIdx];
    const unit = c.unit ?? ent?.attributes?.unit_of_measurement ?? '';
    const lines = this._lines();
    const band = parseHours(c.band_hours);

    // skala: zawsze z zerem i liniami progow, 8% zapasu
    const vals = [...bars.map((b) => b.v), ...lines.map((l) => l.v), 0];
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = (hi - lo || 1) * 0.08;
    hi += pad;
    lo = lo < 0 ? lo - pad : 0;
    const g = { mode: c.grid ?? 'nice', step: c.grid_step };
    if (typeof c.y_min === 'number' || typeof c.y_max === 'number') [lo, hi] = fixedRange(lo, hi, c.y_min, c.y_max);
    else [lo, hi] = snapRange(lo, hi, g);
    const gv = gridValues(lo, hi, g);
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
    const n = Math.max(bars.length, 1);
    const vbW = n * W;
    const labelEvery = n > 18 ? 3 : n > 9 ? 2 : 1;

    const hourOf = (ts: number) => new Date(ts).getHours();
    // okazja (zielony) po wybranej stronie progu; ostrzezenie i alarm maja pierwszenstwo
    const good = c.good_entity ? num(this._hass.states[c.good_entity]?.state) : num(c.good_value);
    const isGood = (v: number) =>
      Number.isFinite(good) &&
      ((c.good_direction === 'above' && v > good) || (c.good_direction === 'below' && v < good));
    const color = (v: number) => {
      const l = levelOf(v, resolveZones(this._hass, c) as EisRowConfig);
      if (l === 'warning') return 'var(--av-warning)';
      if (l === 'caution') return 'var(--av-caution)';
      return isGood(v) ? 'var(--av-ok)' : 'var(--av-bar)';
    };
    const midnights = c.show_midnight
      ? bars.map((b, i) => (i > 0 && hourOf(b.t) === 0 ? i : -1)).filter((i) => i > 0)
      : [];

    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        <div class="head" @click=${() => fireMoreInfo(this, c.entity!)}>
          <span class="name">${c.name ?? ent?.attributes?.friendly_name ?? ''}</span>
          <span class="read">
            ${sel
              ? html`<span class="v" style="color:${color(sel.v) === 'var(--av-bar)' ? 'var(--av-value)' : color(sel.v)}"
                    >${this._fmt(sel.v)}</span
                  ><span class="u">${unit}</span><span class="at">@ ${hourOf(sel.t)}</span>`
              : html`<span class="v na">--</span>`}
          </span>
        </div>

        <div class="chart">
          <svg viewBox="0 0 ${vbW} ${H + BAND + 2}" preserveAspectRatio="none">
            ${gridSvg(gv, y, vbW)}
            ${bars.map((b, i) => {
              const y0 = y(0);
              const y1 = y(b.v);
              const past = b.t < now;
              const cur = i === curIdx;
              return svg`<rect
                class=${past ? 'bar past' : 'bar'}
                x=${i * W + 1.2} width=${W - 2.4}
                y=${Math.min(y0, y1)} height=${Math.max(Math.abs(y1 - y0), 0.6)}
                fill=${cur && color(b.v) === 'var(--av-bar)' ? 'var(--av-value)' : color(b.v)}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._selected = this._selected === i ? undefined : i;
                }}></rect>`;
            })}
            ${lo < 0
              ? svg`<line x1="0" x2=${vbW} y1=${y(0)} y2=${y(0)} class="zero" vector-effect="non-scaling-stroke"></line>`
              : nothing}
            ${midnights.map(
              (i) => svg`<line class="midnight" x1=${i * W} x2=${i * W} y1="0" y2=${H + BAND + 2} vector-effect="non-scaling-stroke"></line>`,
            )}
            ${lines.map(
              (l) => svg`<line x1="0" x2=${vbW} y1=${y(l.v)} y2=${y(l.v)} class="ref" vector-effect="non-scaling-stroke"></line>`,
            )}
            ${band.size
              ? bars.map(
                  (b, i) => svg`<rect class=${b.t < now ? 'band past' : 'band'}
                    x=${i * W} width=${W} y=${H + 2} height=${BAND}
                    fill=${band.has(hourOf(b.t)) ? 'var(--av-ok)' : 'var(--av-caution)'}></rect>`,
                )
              : nothing}
          </svg>
          ${(() => {
            const tops = lines.map((l) => (y(l.v) / (H + BAND + 2)) * 100);
            const below = this._labelBelow(tops);
            return lines.map(
              (l, i) => html`<span class=${classMap({ 'ref-label': true, below: below[i] })} style="top:${tops[i]}%"
                >${l.label ?? this._fmt(l.v)}</span
              >`,
            );
          })()}
          ${curIdx >= 0
            ? html`<span class="now" style="left:${((curIdx + 0.5) / n) * 100}%">▼</span>`
            : nothing}
          ${gridLabels(gv, (v) => (y(v) / (H + BAND + 2)) * 100, g, lo, hi, 'right')}
          ${midnights.map(
            (i) => html`<span class="date" style="left:${(i / n) * 100}%"
              >${new Date(bars[i].t).toLocaleDateString(getLanguage(this._hass), { day: '2-digit', month: '2-digit' })}</span
            >`,
          )}
        </div>

        <div class="axis">
          ${bars.map(
            (b, i) => html`<span style="left:${((i + 0.5) / n) * 100}%"
              >${i % labelEvery === 0 ? hourOf(b.t) : ''}</span
            >`,
          )}
        </div>
      </ha-card>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 6px;
        --av-bar: #8c8c8c;
        display: flex;
        flex-direction: column;
      }
      .empty {
        color: var(--av-dim);
        padding: 8px 0;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        cursor: pointer;
      }
      .name {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .read {
        white-space: nowrap;
      }
      .read .v {
        font-size: 24px;
        font-weight: 700;
      }
      .read .v.na {
        color: var(--av-dim);
      }
      .read .u {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 4px;
        font-weight: 700;
      }
      .read .at {
        font-size: 12px;
        color: var(--av-dim);
        margin-left: 6px;
      }
      /* wykres wypelnia wysokosc karty (np. po powiekszeniu kafla w sekcji) */
      .chart {
        position: relative;
        flex: 1 1 auto;
        min-height: 110px;
        margin-top: 14px;
      }
      .chart svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
      }
      .bar {
        cursor: pointer;
      }
      .bar.past,
      .band.past {
        opacity: 0.35;
      }
      .zero {
        stroke: var(--av-value);
        stroke-width: 1;
        opacity: 0.6;
      }
      .midnight {
        stroke: var(--av-dim);
        stroke-width: 1;
        stroke-dasharray: 3 3;
      }
      .ref {
        stroke: var(--av-setpoint);
        stroke-width: 1.5;
        stroke-dasharray: 4 3;
      }
      /* etykiety po lewej: zaslaniaja co najwyzej minione godziny */
      .ref-label {
        position: absolute;
        left: 0;
        transform: translateY(-110%);
        font-size: 10px;
        font-weight: 700;
        color: var(--av-setpoint);
        background: var(--av-bg);
        padding: 0 2px;
      }
      .ref-label.below {
        transform: translateY(10%);
      }
      /* data po prawej stronie linii polnocy */
      .date {
        position: absolute;
        top: 0;
        margin-left: 3px;
        font-size: 10px;
        color: var(--av-dim);
        line-height: 1;
      }
      .now {
        position: absolute;
        top: -13px;
        transform: translateX(-50%);
        font-size: 10px;
        color: var(--av-value);
        line-height: 1;
      }
      .axis {
        position: relative;
        height: 16px;
        margin-top: 2px;
      }
      .axis span {
        position: absolute;
        transform: translateX(-50%);
        font-size: 11px;
        color: var(--av-dim);
      }
    `,
  ];
}
