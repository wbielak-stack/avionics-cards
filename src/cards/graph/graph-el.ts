import { LitElement, html, svg, nothing, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../../types';
import { fetchNumericHistory, type Point } from '../../core/history';
import { num } from '../../core/format';
import { localize, getLanguage } from '../../core/i18n';
import { TEMPERATURE_THRESHOLDS } from '../../core/thresholds';

const HISTORY_REFRESH_MS = 10 * 60 * 1000;
const LIVE_GAP_MS = 60 * 1000;
const BUCKETS = 120;

/**
 * Wykres historii jednej encji z przelacznikiem zakresu na samym wykresie.
 * scale: 'auto' - dopasowany do wysokosci; 'fixed' - wysokosc = `span` jednostek
 * (rozszerzana tylko, gdy dane sie nie mieszcza).
 */
export class AvionicsGraphEl extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() entity?: string;
  @property({ attribute: false }) ranges: number[] = [12, 24, 48];
  @property({ type: Number }) defaultRange = 24;
  @property() scale: 'auto' | 'fixed' = 'auto';
  @property({ type: Number }) span = 20;
  @property({ type: Number }) reference = NaN;
  @property() referenceLabel = '';
  @property() color = '#00e5ff';
  /** mono = jeden kolor; temperature = gradient wg progow temperatury (jak w karcie klimatu) */
  @property() colorMode: 'mono' | 'temperature' = 'mono';
  @property({ type: Number }) multiplier = 1;
  @property({ type: Number }) digits = 0;

  @state() private _range?: number;
  @state() private _points: Point[] = [];
  private _lastFetch = 0;
  private _fetchedFor = '';
  private _lastState = '';

  /** Przy samej zmianie hass rysuj tylko, gdy zmienila sie nasza encja albo czas na odswiezenie historii. */
  protected shouldUpdate(changed: Map<string, unknown>): boolean {
    if (changed.size === 1 && changed.has('hass') && this.hass && this.entity) {
      const st = this.hass.states[this.entity];
      return st?.last_updated !== this._lastState || Date.now() - this._lastFetch > HISTORY_REFRESH_MS;
    }
    return true;
  }

  protected willUpdate(): void {
    if (!this.hass || !this.entity) return;
    const maxH = Math.max(...this.ranges, this.defaultRange);
    const key = `${this.entity}|${maxH}`;
    if (key !== this._fetchedFor || Date.now() - this._lastFetch > HISTORY_REFRESH_MS) {
      this._fetchedFor = key;
      this._lastFetch = Date.now();
      void fetchNumericHistory(this.hass, this.entity, maxH).then((p) => {
        this._points = p;
      });
    }
    // dopisz biezaca wartosc
    const st = this.hass.states[this.entity];
    if (st && st.last_updated !== this._lastState) {
      this._lastState = st.last_updated;
      const v = num(st.state);
      const last = this._points[this._points.length - 1];
      if (Number.isFinite(v) && (!last || last[1] !== v || Date.now() - last[0] > LIVE_GAP_MS)) {
        this._points = [...this._points, [Date.now(), v]];
      }
    }
  }

  private _fmt(v: number): string {
    return v.toFixed(this.digits).replace('.', ',');
  }

  protected render() {
    const range = this._range ?? this.defaultRange;
    const end = Date.now();
    const start = end - range * 3600e3;
    const m = this.multiplier;
    // wartosc obowiazujaca na poczatku okna + punkty w oknie
    let startVal = NaN;
    for (const p of this._points) {
      if (p[0] <= start) startVal = p[1];
      else break;
    }
    const pts = this._points.filter((p) => p[0] > start);
    if (Number.isFinite(startVal)) pts.unshift([start, startVal]);
    // stan obowiazuje do zmiany: ostatnia znana wartosc trwa do teraz
    // (czujnik bez zmian w calym okresie daje w historii tylko jeden punkt)
    if (pts.length) {
      if (pts[0][0] > start) pts.unshift([start, pts[0][1]]);
      if (pts[pts.length - 1][0] < end) pts.push([end, pts[pts.length - 1][1]]);
    }

    const buttons = html`<div class="ranges">
      ${this.ranges.map(
        (h) => html`<button class=${h === range ? 'on' : ''} @click=${(e: Event) => {
          e.stopPropagation();
          this._range = h;
        }}>${h}h</button>`,
      )}
    </div>`;

    if (pts.length < 2) return html`${buttons}<div class="chart empty"></div>`;

    // usrednianie do stalej liczby przedzialow
    const step = (end - start) / BUCKETS;
    const vals: number[] = [];
    let i = 0;
    let last = pts[0][1] * m;
    for (let b = 0; b < BUCKETS; b++) {
      const bEnd = start + (b + 1) * step;
      let s = 0;
      let n = 0;
      while (i < pts.length && pts[i][0] < bEnd) {
        s += pts[i][1] * m;
        n++;
        i++;
      }
      if (n) last = s / n;
      vals.push(last);
    }
    const dMin = Math.min(...vals);
    const dMax = Math.max(...vals);
    // seria plaska (np. brak opadu): linia przy podlodze + napis na srodku
    const flat = dMax - dMin < 1e-9;
    let lo: number;
    let hi: number;
    if (flat) {
      const span = this.scale === 'fixed' ? this.span : Math.max(Math.abs(dMax) * 0.1, 1);
      lo = dMin - span * 0.08;
      hi = lo + span;
    } else if (this.scale === 'fixed') {
      const span = Math.max(this.span, (dMax - dMin) * 1.1);
      const mid = (dMin + dMax) / 2;
      lo = mid - span / 2;
      hi = mid + span / 2;
    } else {
      const pad = Math.max((dMax - dMin) * 0.12, Math.abs(dMax) * 1e-4, 1e-6);
      lo = dMin - pad;
      hi = dMax + pad;
    }
    const y = (v: number) => 40 - ((v - lo) / (hi - lo)) * 40;
    const x = (k: number) => (k / (BUCKETS - 1)) * 100;
    let d = `M 0 ${y(vals[0]).toFixed(2)}`;
    for (let k = 1; k < BUCKETS; k++) d += ` L ${x(k).toFixed(2)} ${y(vals[k]).toFixed(2)}`;
    const ref = Number.isFinite(this.reference) && this.reference > lo && this.reference < hi ? this.reference : NaN;
    // kolor: jeden albo gradient wg progow temperatury (w ukladzie wspolrzednych wykresu)
    const stops: Array<[number, string]> =
      this.colorMode === 'temperature'
        ? TEMPERATURE_THRESHOLDS.map(([v, col]): [number, string] => [Math.min(Math.max(y(v) / 40, 0), 1), col]).sort(
            (a, b) => a[0] - b[0],
          )
        : [
            [0, this.color],
            [1, this.color],
          ];

    // etykiety czasu: 4 rowne odcinki
    const fmtT = (t: number) => {
      const dt = new Date(t);
      return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
    };
    const times = [0, 0.25, 0.5, 0.75].map((f) => ({ f, t: fmtT(start + f * (end - start)) }));

    return html`
      ${buttons}
      <div class="chart">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gc" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="40">
              ${stops.map(([o, col]) => svg`<stop offset=${o} stop-color=${col}></stop>`)}
            </linearGradient>
          </defs>
          <path d=${`${d} L 100 40 L 0 40 Z`} fill="url(#gc)" fill-opacity="0.15" stroke="none"></path>
          ${Number.isFinite(ref)
            ? svg`<line class="ref" x1="0" x2="100" y1=${y(ref)} y2=${y(ref)} vector-effect="non-scaling-stroke"></line>`
            : nothing}
          <path d=${d} fill="none" stroke="url(#gc)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"></path>
        </svg>
        ${flat
          ? html`<span class="flat"
              >${localize(getLanguage(this.hass), 'graph.flat').replace('{h}', String(range))} · ${this._fmt(dMin)}</span
            >`
          : html`<span class="ymax">${this._fmt(dMax)}</span><span class="ymin">${this._fmt(dMin)}</span>`}
        ${Number.isFinite(ref)
          ? html`<span class="reflbl" style="top:${(y(ref) / 40) * 100}%">${this.referenceLabel || this._fmt(ref)}</span>`
          : nothing}
      </div>
      <div class="times">
        ${times.map((tm) => html`<span style="left:${tm.f * 100}%">${tm.t}</span>`)}
        <span class="nowlbl">▲</span>
      </div>
    `;
  }

  static styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        font-family: var(--avionics-font-family, 'Roboto Condensed', 'Arial Narrow', sans-serif);
        font-variant-numeric: tabular-nums;
        --av-dim: var(--avionics-dim-color, #9a9a9a);
        --av-label: var(--avionics-label-color, #00e5ff);
        --av-frame: var(--avionics-frame-color, #8c8c8c);
      }
      .ranges {
        display: flex;
        gap: 4px;
        justify-content: flex-end;
      }
      button {
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        padding: 1px 6px;
        background: transparent;
        color: var(--av-dim);
        border: 1px solid transparent;
        cursor: pointer;
      }
      button.on {
        color: var(--av-label);
        border-color: var(--av-label);
      }
      .chart {
        position: relative;
        flex: 1 1 auto;
        min-height: 90px;
        margin-top: 4px;
      }
      .chart svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .ref {
        stroke: var(--av-dim);
        stroke-width: 1;
        stroke-dasharray: 4 3;
      }
      .ymax,
      .ymin,
      .reflbl {
        position: absolute;
        left: 2px;
        font-size: 10px;
        color: var(--av-dim);
        background: rgba(0, 0, 0, 0.6);
        padding: 0 2px;
      }
      .ymax {
        top: 0;
      }
      .flat {
        position: absolute;
        left: 0;
        right: 0;
        top: 40%;
        text-align: center;
        font-size: 12px;
        color: var(--av-dim);
      }
      .ymin {
        bottom: 0;
      }
      .reflbl {
        left: auto;
        right: 2px;
        transform: translateY(-110%);
      }
      .times {
        position: relative;
        height: 14px;
        margin-top: 2px;
      }
      .times span {
        position: absolute;
        font-size: 10px;
        color: var(--av-dim);
      }
      .times .nowlbl {
        right: 0;
      }
    `,
  ];
}

if (!customElements.get('avionics-graph-el')) customElements.define('avionics-graph-el', AvionicsGraphEl);
