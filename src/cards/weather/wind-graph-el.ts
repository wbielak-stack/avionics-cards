import { LitElement, html, svg, nothing, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../../types';
import { fetchNumericHistory, type Point } from '../../core/history';
import { num } from '../../core/format';
import { type GridMode, gridValues, gridSvg, gridLabels, snapRange } from '../../core/grid';

const HOUR = 3600e3;
const HISTORY_REFRESH_MS = 10 * 60 * 1000;

interface HourWind {
  t: number;
  speed?: number;
  gust?: number;
  dir?: number;
  forecast: boolean;
}

/** Przeliczenie predkosci wiatru miedzy jednostkami (do jednostki stacji). */
const TO_MS: Record<string, number> = { 'm/s': 1, 'km/h': 1 / 3.6, kn: 0.514444, mph: 0.44704, 'ft/s': 0.3048 };
function convert(v: number, from?: string, to?: string): number {
  if (!from || !to || from === to || !TO_MS[from] || !TO_MS[to]) return v;
  return (v * TO_MS[from]) / TO_MS[to];
}

const hourStart = (t: number) => {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
};

/** Srednia kierunkow (kolowa). */
function meanDir(dirs: number[]): number | undefined {
  if (!dirs.length) return undefined;
  let x = 0;
  let y = 0;
  for (const d of dirs) {
    x += Math.cos((d * Math.PI) / 180);
    y += Math.sin((d * Math.PI) / 180);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Godzinowe slupki wiatru: przeszlosc z pomiarow (srednia, maks. poryw, sredni kierunek),
 * przyszlosc z prognozy godzinowej encji weather.* (magenta, kontur).
 */
export class AvionicsWindGraphEl extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @property() speedEntity?: string;
  @property() gustEntity?: string;
  @property() dirEntity?: string;
  @property() forecastEntity?: string;
  @property({ type: Number }) hoursBack = 12;
  @property({ type: Number }) hoursForward = 12;
  @property({ type: Number }) caution = NaN;
  @property({ type: Number }) warning = NaN;
  @property({ type: Boolean }) arrowTo = false;
  @property({ type: Number }) rotation = 0;
  @property() unit = '';
  @property() grid: GridMode = 'nice';
  @property({ type: Number }) gridStep = NaN;
  /** staly gorny zakres osi (rozszerzany tylko, gdy wiatr go przekroczy) */
  @property({ type: Number }) yMax = NaN;

  @state() private _hist: Record<'speed' | 'gust' | 'dir', Point[]> = { speed: [], gust: [], dir: [] };
  @state() private _forecast: Array<Record<string, unknown>> = [];
  @state() private _fcUnit?: string;
  private _lastFetch = 0;
  private _fetchKey = '';
  private _unsub?: () => void;
  private _subKey = '';

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    this._subKey = '';
  }

  protected shouldUpdate(changed: Map<string, unknown>): boolean {
    if (changed.size === 1 && changed.has('hass')) {
      return Date.now() - this._lastFetch > HISTORY_REFRESH_MS;
    }
    return true;
  }

  protected willUpdate(): void {
    const hass = this.hass;
    if (!hass) return;
    const key = `${this.speedEntity}|${this.gustEntity}|${this.dirEntity}|${this.hoursBack}`;
    if (key !== this._fetchKey || Date.now() - this._lastFetch > HISTORY_REFRESH_MS) {
      this._fetchKey = key;
      this._lastFetch = Date.now();
      const hours = this.hoursBack + 1;
      const get = (id?: string) => (id ? fetchNumericHistory(hass, id, hours) : Promise.resolve([] as Point[]));
      void Promise.all([get(this.speedEntity), get(this.gustEntity), get(this.dirEntity)]).then(([speed, gust, dir]) => {
        this._hist = { speed, gust, dir };
      });
    }
    // prognoza godzinowa - subskrypcja jak w samym HA
    const subKey = this.forecastEntity ?? '';
    if (subKey !== this._subKey) {
      this._unsub?.();
      this._unsub = undefined;
      this._subKey = subKey;
      this._forecast = [];
      const conn = (hass as any).connection;
      if (subKey && conn?.subscribeMessage) {
        conn
          .subscribeMessage(
            (ev: { forecast?: Array<Record<string, unknown>> }) => {
              this._forecast = ev.forecast ?? [];
            },
            { type: 'weather/subscribe_forecast', forecast_type: 'hourly', entity_id: subKey },
          )
          .then((u: () => void) => (this._unsub = u))
          .catch(() => undefined);
      }
    }
    this._fcUnit = subKey ? hass.states[subKey]?.attributes?.wind_speed_unit : undefined;
  }

  /** Godziny okna: pomiary dla minionych, prognoza dla przyszlych. */
  private _hours(): HourWind[] {
    const now = hourStart(Date.now());
    const out: HourWind[] = [];
    const inHour = (pts: Point[], t: number) => pts.filter((p) => p[0] >= t && p[0] < t + HOUR).map((p) => p[1]);
    const fc = new Map<number, Record<string, unknown>>();
    for (const f of this._forecast) {
      const t = hourStart(Date.parse(String(f.datetime)));
      if (Number.isFinite(t)) fc.set(t, f);
    }
    for (let t = now - this.hoursBack * HOUR; t < now + (this.hoursForward + 1) * HOUR; t += HOUR) {
      if (t <= now) {
        const s = inHour(this._hist.speed, t);
        const g = inHour(this._hist.gust, t);
        out.push({
          t,
          speed: s.length ? s.reduce((a, b) => a + b, 0) / s.length : undefined,
          gust: g.length ? Math.max(...g) : undefined,
          dir: meanDir(inHour(this._hist.dir, t)),
          forecast: false,
        });
      } else {
        const f = fc.get(t);
        const sp = num(f?.wind_speed);
        const gu = num(f?.wind_gust_speed);
        const di = num(f?.wind_bearing);
        out.push({
          t,
          speed: Number.isFinite(sp) ? convert(sp, this._fcUnit, this.unit) : undefined,
          gust: Number.isFinite(gu) ? convert(gu, this._fcUnit, this.unit) : undefined,
          dir: Number.isFinite(di) ? di : undefined,
          forecast: true,
        });
      }
    }
    return out;
  }

  private _color(v: number | undefined, fc: boolean): string {
    if (v !== undefined && Number.isFinite(this.warning) && v >= this.warning) return 'var(--av-warning, #ff3b30)';
    if (v !== undefined && Number.isFinite(this.caution) && v >= this.caution) return 'var(--av-caution, #ffb300)';
    return fc ? 'var(--av-forecast, #ff00ff)' : '#8c8c8c';
  }

  protected render() {
    const hours = this._hours();
    const n = hours.length;
    if (!hours.some((h) => h.speed !== undefined)) return html`<div class="empty"></div>`;
    const W = 10;
    const H = 100;
    const maxV = Math.max(
      1,
      ...hours.map((h) => Math.max(h.speed ?? 0, h.gust ?? 0)),
      Number.isFinite(this.caution) ? this.caution : 0,
    );
    const g = { mode: this.grid, step: this.gridStep };
    let top = Number.isFinite(this.yMax) ? Math.max(this.yMax, maxV) : maxV * 1.1;
    if (!Number.isFinite(this.yMax)) top = snapRange(0, top, g)[1];
    const gv = gridValues(0, top, g);
    const y = (v: number) => H - (v / top) * H;
    const now = hourStart(Date.now());
    const nowIdx = hours.findIndex((h) => h.t === now);
    const labelEvery = n > 18 ? 3 : n > 9 ? 2 : 1;
    const arrowEvery = n > 30 ? 2 : 1;
    const hourOf = (t: number) => new Date(t).getHours();
    const line = (v: number, cls: string) =>
      svg`<line class=${cls} x1="0" x2=${n * W} y1=${y(v)} y2=${y(v)} vector-effect="non-scaling-stroke"></line>`;

    return html`
      <div class="chart">
        <svg viewBox="0 0 ${n * W} ${H}" preserveAspectRatio="none">
          ${gridSvg(gv, y, n * W)}
          ${Number.isFinite(this.caution) ? line(this.caution, 'thr caution') : nothing}
          ${Number.isFinite(this.warning) && this.warning < top ? line(this.warning, 'thr warning') : nothing}
          ${hours.map((h, i) => {
            if (h.speed === undefined) return nothing;
            const col = this._color(h.speed, h.forecast);
            const past = h.t < now;
            return svg`<rect x=${i * W + 1.5} width=${W - 3} y=${y(h.speed)} height=${Math.max(H - y(h.speed), 0.5)}
              fill=${h.forecast ? col : i === nowIdx ? 'var(--av-value, #fff)' : col}
              fill-opacity=${h.forecast ? 0.15 : past ? 0.55 : 1}
              stroke=${h.forecast ? col : 'none'} stroke-width="1" vector-effect="non-scaling-stroke"></rect>`;
          })}
          ${hours.map((h, i) =>
            h.gust !== undefined
              ? svg`<line x1=${i * W + 1} x2=${i * W + W - 1} y1=${y(h.gust)} y2=${y(h.gust)}
                  stroke=${this._color(h.gust, h.forecast)} stroke-width="2" vector-effect="non-scaling-stroke"></line>`
              : nothing,
          )}
          ${nowIdx >= 0
            ? svg`<line class="nowline" x1=${(nowIdx + 1) * W} x2=${(nowIdx + 1) * W} y1="0" y2=${H} vector-effect="non-scaling-stroke"></line>`
            : nothing}
        </svg>
        ${this.grid === 'nice' || this.grid === 'fixed'
          ? gridLabels(gv, (v) => (y(v) / H) * 100, g, 0, top)
          : html`<span class="ymax">${top.toFixed(0)}${this.unit ? ` ${this.unit}` : ''}</span>`}
        ${nowIdx >= 0 ? html`<span class="now" style="left:${((nowIdx + 0.5) / n) * 100}%">▼</span>` : nothing}
      </div>
      <div class="arrows">
        ${hours.map((h, i) => {
          if (h.dir === undefined || i % arrowEvery !== 0) return nothing;
          // strzalka jak na rozy: 'to' = dokad wieje; z uwzglednieniem obrotu rozy
          const a = (this.arrowTo ? h.dir + 180 : h.dir) - this.rotation;
          return html`<span class=${h.forecast ? 'fc' : ''} style="left:${((i + 0.5) / n) * 100}%">
            <svg viewBox="-6 -6 12 12" style="transform: rotate(${this.arrowTo ? a : a + 180}deg)">
              <path d="M0 -5 L3.5 3 L0 1.2 L-3.5 3 Z"></path>
            </svg>
          </span>`;
        })}
      </div>
      <div class="axis">
        ${hours.map(
          (h, i) => html`<span style="left:${((i + 0.5) / n) * 100}%">${i % labelEvery === 0 ? hourOf(h.t) : ''}</span>`,
        )}
      </div>
    `;
  }

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      font-family: var(--avionics-font-family, 'Roboto Condensed', 'Arial Narrow', sans-serif);
      font-variant-numeric: tabular-nums;
      color: var(--avionics-value-color, #fff);
    }
    .empty {
      min-height: 90px;
    }
    .chart {
      position: relative;
      flex: 1 1 auto;
      min-height: 80px;
      margin-top: 14px;
    }
    .chart svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    .thr {
      stroke-width: 1;
      stroke-dasharray: 4 3;
    }
    .thr.caution {
      stroke: var(--avionics-caution-color, #ffb300);
    }
    .thr.warning {
      stroke: var(--avionics-warning-color, #ff3b30);
    }
    .nowline {
      stroke: var(--avionics-dim-color, #9a9a9a);
      stroke-width: 1;
      stroke-dasharray: 2 2;
    }
    .ymax {
      position: absolute;
      top: 0;
      left: 2px;
      font-size: 10px;
      color: var(--avionics-dim-color, #9a9a9a);
      background: rgba(0, 0, 0, 0.6);
      padding: 0 2px;
    }
    .now {
      position: absolute;
      top: -13px;
      transform: translateX(-50%);
      font-size: 10px;
      line-height: 1;
    }
    .arrows,
    .axis {
      position: relative;
    }
    .arrows {
      height: 14px;
      margin-top: 3px;
    }
    .arrows span {
      position: absolute;
      transform: translateX(-50%);
      line-height: 0;
    }
    .arrows svg {
      width: 11px;
      height: 11px;
      fill: var(--avionics-value-color, #fff);
    }
    .arrows span.fc svg {
      fill: var(--avionics-forecast-color, #ff00ff);
    }
    .axis {
      height: 14px;
    }
    .axis span {
      position: absolute;
      transform: translateX(-50%);
      font-size: 10px;
      color: var(--avionics-dim-color, #9a9a9a);
    }
  `;
}

if (!customElements.get('avionics-wind-graph-el')) customElements.define('avionics-wind-graph-el', AvionicsWindGraphEl);
