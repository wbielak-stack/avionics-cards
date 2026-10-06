import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { cardHeader } from '../../core/header';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { fetchNumericHistory } from '../../core/history';
import { gridValues, gridLabel, snapRange } from '../../core/grid';
import { levelOf, zonesOf, type Level } from '../eis/config';
import { resolveZones, inverseWanted, levelStyle } from '../../core/zone-extras';
import { type CylinderCardConfig, type CylinderItem, normalizeCylinder } from './config';

const LEVEL_COLOR: Record<Level, string> = {
  none: 'var(--av-value)',
  ok: 'var(--av-value)',
  caution: 'var(--av-caution)',
  warning: 'var(--av-warning)',
};

/**
 * Wykres cylindrow jak strona LEAN w G1000: slupki podobnych wartosci obok siebie (ogniwa, strefy, fazy),
 * wspolna skala i strefy, wyrozniony element skrajny, znacznik maksimum / minimum dnia, podsumowanie w naglowku.
 */
export class AvionicsCylinderCard extends LitElement {
  @state() private _config?: CylinderCardConfig;
  @state() private _items: CylinderItem[] = [];
  @state() private _styleMode: StyleMode = 'look';
  @state() private _peaks = new Map<string, number>();
  @state() private _width = 400;
  private _hass?: HomeAssistant;
  private _key = '';
  private _peakDay = '';
  private _ro?: ResizeObserver;

  static getConfigElement() {
    return document.createElement('avionics-cylinder-card-editor');
  }

  static getStubConfig() {
    return { entities: [] };
  }

  setConfig(config: CylinderCardConfig): void {
    if (!Array.isArray(config.entities)) throw new Error(localize(getLanguage(), 'eis.error.no_entities'));
    this._config = normalizeCylinder(config);
    this._items = config.entities.map((e) => (typeof e === 'string' ? { entity: e } : e));
    this._key = '';
    this._peakDay = '';
  }

  getCardSize(): number {
    return 5;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4 };
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
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    const mode = readStyleMode(this);
    const zoneIds = [c.warning_low, c.caution_low, c.caution_high, c.warning_high].filter((x) => typeof x === 'string') as string[];
    const key =
      [...this._items.map((i) => i.entity), ...zoneIds].map((id) => hass.states[id]?.last_updated ?? '').join('|') +
      `|${mode}|${getLanguage(hass)}`;
    if (key !== this._key) {
      this._key = key;
      this._styleMode = mode;
      this.requestUpdate();
    }
    // maksimum / minimum od polnocy: historia raz na 10 min
    if (c.peak && c.peak !== 'off') {
      const slot = `${new Date().toDateString()}|${Math.floor(Date.now() / 600e3)}`;
      if (slot !== this._peakDay) {
        this._peakDay = slot;
        void this._loadPeaks(hass);
      }
    }
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private async _loadPeaks(hass: HomeAssistant): Promise<void> {
    const c = this._config!;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const hours = (Date.now() - midnight.valueOf()) / 3600e3;
    const out = new Map<string, number>();
    await Promise.all(
      this._items.map(async (it) => {
        const pts = await fetchNumericHistory(hass, it.entity, Math.max(hours, 0.1));
        const vals = pts.map((p) => p[1] * (c.multiplier ?? 1));
        if (vals.length) out.set(it.entity, c.peak === 'min' ? Math.min(...vals) : Math.max(...vals));
      }),
    );
    this._peaks = out;
  }

  private _fmt(v: number): string {
    const d = this._config!.precision;
    const digits = typeof d === 'number' ? d : Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
    return Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '--';
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = resolveZones(this._hass, this._config);
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const m = c.multiplier ?? 1;
    const vals = this._items.map((it) => num(this._hass!.states[it.entity]?.state) * m);
    const labels = (c.labels ?? '').split(',').map((x) => x.trim());
    const names = this._items.map(
      (it, i) =>
        it.name || labels[i] || ((this._hass!.states[it.entity]?.attributes?.friendly_name as string | undefined) ?? String(i + 1)),
    );
    const unit = c.unit ?? ((this._hass.states[this._items[0]?.entity]?.attributes?.unit_of_measurement as string) || '');
    const finite = vals.filter(Number.isFinite);
    if (!finite.length) {
      return html`<ha-card>${cardHeader(c.title)}<div class="err">--</div></ha-card>`;
    }
    const iMin = vals.indexOf(Math.min(...finite));
    const iMax = vals.indexOf(Math.max(...finite));
    const hl = new Set<number>(
      c.highlight === 'both' ? [iMin, iMax] : c.highlight === 'max' ? [iMax] : c.highlight === 'none' ? [] : [iMin],
    );
    const peaks = this._items.map((it) => this._peaks.get(it.entity));

    // skala: zadana albo przyblizona do danych (+ znaczniki, limit), dociagnieta do rownych liczb
    const all = [...finite, ...(peaks.filter((p) => p !== undefined) as number[])];
    if (typeof c.limit === 'number') all.push(c.limit);
    let lo = typeof c.min === 'number' ? c.min : Math.min(...all);
    let hi = typeof c.max === 'number' ? c.max : Math.max(...all);
    if (typeof c.min !== 'number' || typeof c.max !== 'number') {
      const pad = Math.max((hi - lo) * 0.15, Math.abs(hi) * 1e-3, 1e-6);
      [lo, hi] = snapRange(typeof c.min === 'number' ? lo : lo - pad, typeof c.max === 'number' ? hi : hi + pad, { mode: 'nice' });
    }
    const pct = (v: number) => Math.min(Math.max(((v - lo) / (hi - lo)) * 100, 0), 100);
    const zones = zonesOf({ ...c, min: lo, max: hi } as any);
    const gv = gridValues(lo, hi, { mode: 'nice' });
    const inv = inverseWanted(this, c.warning_inverse);

    // naglowek
    const sum = finite.reduce((a, b) => a + b, 0);
    const third =
      c.summary === 'avg'
        ? { l: t('cyl.avg'), v: this._fmt(sum / finite.length), u: unit, lvl: 'none' as Level }
        : c.summary === 'sum'
          ? { l: 'Σ', v: this._fmt(sum), u: unit, lvl: 'none' as Level }
          : (() => {
              const d = (vals[iMax] - vals[iMin]) * (c.delta_multiplier ?? 1);
              const dp = c.delta_precision ?? (c.delta_multiplier && c.delta_multiplier !== 1 ? 0 : undefined);
              return { l: 'Δ', v: dp !== undefined ? d.toFixed(dp).replace('.', ',') : this._fmt(d), u: c.delta_unit ?? unit, lvl: 'none' as Level };
            })();
    // etykieta liczbowa jako numer elementu: #8
    const tag = (n: string) => (/^\d+$/.test(n) ? `#${n}` : n);
    const head = [
      { l: 'MIN', v: `${tag(names[iMin])} ${this._fmt(vals[iMin])}`, u: unit, lvl: levelOf(vals[iMin], c) },
      { l: 'MAX', v: `${tag(names[iMax])} ${this._fmt(vals[iMax])}`, u: unit, lvl: levelOf(vals[iMax], c) },
      third,
    ];
    // wartosci pod slupkami: wszystkie, gdy sie mieszcza
    const colW = (this._width - 60) / Math.max(this._items.length, 1);
    const longest = Math.max(...vals.map((v) => this._fmt(v).length));
    const showAll = c.show_values === 'all' || (c.show_values !== 'highlighted' && colW >= longest * 7.5 + 6);

    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${cardHeader(c.title)}
        <div class="head">
          ${head.map(
            (h) => html`<div class="hc">
              <span class="hl">${h.l}</span>
              <span class="hv" style=${levelStyle(h.lvl === 'caution' || h.lvl === 'warning' ? LEVEL_COLOR[h.lvl] : 'var(--av-value)', h.lvl === 'warning', inv)}
                >${h.v}<span class="u">${h.u}</span></span
              >
            </div>`,
          )}
        </div>
        <div class="chart">
          <div class="zstrip">
            ${zones.map(
              ([a, b, l]) =>
                l === 'ok' ? nothing : html`<span style="bottom:${pct(a)}%;height:${pct(b) - pct(a)}%;background:${LEVEL_COLOR[l]}"></span>`,
            )}
          </div>
          <div class="plot">
            ${gv.map(
              (v) => html`<span class="gl" style="bottom:${pct(v)}%"></span><span class="glb" style="bottom:${pct(v)}%"
                  >${gridLabel(v, { mode: 'nice' }, lo, hi)}</span
                >`,
            )}
            ${typeof c.limit === 'number' ? html`<span class="limit" style="bottom:${pct(c.limit)}%"></span>` : nothing}
            <div class="cols">
              ${this._items.map((it, i) => {
                const v = vals[i];
                const lvl = levelOf(v, c);
                const col = lvl === 'caution' || lvl === 'warning' ? LEVEL_COLOR[lvl] : '#e8e8e8';
                const pk = peaks[i];
                return html`<div class="col" @click=${() => fireMoreInfo(this, it.entity)}>
                  <div class="bar" style="height:${Number.isFinite(v) ? pct(v) : 0}%;background:${col}"></div>
                  ${pk !== undefined ? html`<span class="peak" style="bottom:${pct(pk)}%"></span>` : nothing}
                  ${!Number.isFinite(v) ? html`<span class="x">✕</span>` : nothing}
                </div>`;
              })}
            </div>
          </div>
        </div>
        <div class="labels">
          ${this._items.map((_it, i) => {
            const sel = hl.has(i);
            const lvl = levelOf(vals[i], c);
            return html`<div class="lab">
              <span class=${classMap({ val: true, sel })} style=${sel ? '' : levelStyle(lvl === 'caution' || lvl === 'warning' ? LEVEL_COLOR[lvl] : 'var(--av-value)', lvl === 'warning', inv)}
                >${sel || showAll ? this._fmt(vals[i]) : ''}</span
              >
              <span class="nm">${names[i]}</span>
            </div>`;
          })}
        </div>
      </ha-card>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 10px;
        display: flex;
        flex-direction: column;
      }
      .err {
        color: var(--av-dim);
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 6px;
        border-bottom: 1px solid var(--av-frame);
      }
      .head {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 8px;
      }
      .hc {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .hl {
        color: var(--av-label);
        font-size: 11px;
        font-weight: 700;
      }
      .hv {
        font-size: 16px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        align-self: flex-start;
        max-width: 100%;
      }
      .u {
        font-size: 11px;
        color: var(--av-unit);
        margin-left: 3px;
      }
      /* wykres wypelnia wolna wysokosc przy stalej liczbie wierszy */
      .chart {
        display: flex;
        gap: 6px;
        flex: 1 1 auto;
        min-height: 150px;
      }
      .zstrip {
        position: relative;
        width: 4px;
        flex: none;
      }
      .zstrip span {
        position: absolute;
        left: 0;
        right: 0;
      }
      .plot {
        position: relative;
        flex: 1 1 auto;
      }
      .gl {
        position: absolute;
        left: 0;
        right: 0;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
      }
      .glb {
        position: absolute;
        right: 0;
        transform: translateY(50%);
        margin-bottom: 6px;
        font-size: 8px;
        color: var(--av-dim);
      }
      .limit {
        position: absolute;
        left: 0;
        right: 0;
        border-top: 2px solid var(--av-warning);
        z-index: 2;
      }
      .cols {
        position: absolute;
        inset: 0;
        display: flex;
      }
      .col {
        position: relative;
        flex: 1 1 0;
        cursor: pointer;
      }
      .bar {
        position: absolute;
        bottom: 0;
        left: 22%;
        right: 22%;
      }
      .peak {
        position: absolute;
        left: 50%;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 7px solid var(--av-dim);
        transform: translate(-50%, -3px);
      }
      .peak::after {
        content: '';
        position: absolute;
        left: -3px;
        top: -6px;
        border-left: 3px solid transparent;
        border-right: 3px solid transparent;
        border-top: 4px solid var(--av-bg, #000);
      }
      .x {
        position: absolute;
        bottom: 4px;
        left: 0;
        right: 0;
        text-align: center;
        color: var(--av-warning);
        font-weight: 700;
      }
      .labels {
        display: flex;
        margin-left: 10px;
        margin-top: 4px;
      }
      .lab {
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 0;
      }
      .val {
        font-size: 12px;
        font-weight: 700;
        white-space: nowrap;
        min-height: 16px;
      }
      .val.sel {
        background: var(--av-setpoint);
        color: #000;
        padding: 0 4px;
      }
      .nm {
        color: var(--av-label);
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
    `,
  ];
}
