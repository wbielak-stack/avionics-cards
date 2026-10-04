import { LitElement, html, svg, nothing, css } from 'lit';
import { property } from 'lit/decorators.js';
import { compassPoint } from '../weather/fields';

/**
 * Roza wiatru w stylu HSI. Strzalka: 'from' (domyslnie, meteorologicznie) - od krawedzi
 * po stronie nawietrznej do srodka; 'to' - od srodka na zewnatrz po stronie zawietrznej.
 * Prognoza (magenta) ciensza, pod strzalka pomiaru. Obrot: wskazany kierunek u gory.
 */
export class AvionicsWindRoseEl extends LitElement {
  /** kierunek, z ktorego wieje [°] */
  @property({ type: Number }) bearing = NaN;
  @property() speedText = '--';
  @property() unit = '';
  @property() gustText = '';
  @property({ type: Number }) fcDir = NaN;
  @property() fcText = '';
  @property({ type: Boolean }) arrowTo = false;
  @property({ type: Number }) rotation = 0;
  /** napis pod roza, gdy brak kierunku */
  @property() noDirLabel = '';

  protected render() {
    const CX = 60;
    const CY = 60;
    const R = 50;
    const rot = this.rotation || 0;
    const p = (a: number, rad: number) => {
      const x = (a * Math.PI) / 180;
      return [CX + rad * Math.sin(x), CY - rad * Math.cos(x)];
    };
    const pts = (list: number[][]) => list.map((q) => q.map((n) => n.toFixed(2)).join(' ')).join(' ');
    const arrow = (d: number, thin: boolean) => {
      const a = (this.arrowTo ? d + 180 : d) - rot;
      const [l1, l2] = this.arrowTo ? [p(a, 30), p(a, R - 8)] : [p(a, R - 2), p(a, 30)];
      const w = thin ? 6 : 7;
      const head = this.arrowTo
        ? [p(a, R - 2), p(a + w, R - 10), p(a - w, R - 10)]
        : [p(a, 26), p(a + w, 34), p(a - w, 34)];
      const cls = thin ? 'fc' : 'cur';
      return svg`<line class="${cls}-line" x1=${l1[0]} y1=${l1[1]} x2=${l2[0]} y2=${l2[1]}></line>
        <polygon class="${cls}-head" points=${pts(head)}></polygon>`;
    };
    const hasDir = Number.isFinite(this.bearing);
    const hasFc = Number.isFinite(this.fcDir);
    const letters: Array<[string, number]> = [
      ['N', 0],
      ['E', 90],
      ['S', 180],
      ['W', 270],
    ];
    return html`
      <svg viewBox="0 0 120 120">
        <circle cx=${CX} cy=${CY} r=${R} class="ring"></circle>
        ${Array.from({ length: 36 }, (_, i) => i * 10).map((tk) => {
          const major = tk % 30 === 0;
          const [x1, y1] = p(tk - rot, R);
          const [x2, y2] = p(tk - rot, R - (major ? 7 : 4));
          return svg`<line class=${major ? 'tick major' : 'tick'} x1=${x1} y1=${y1} x2=${x2} y2=${y2}></line>`;
        })}
        ${letters.map(([l, la]) => {
          const [x, y] = p(la - rot, R - 14);
          return svg`<text class="card" x=${x} y=${y + 4} text-anchor="middle">${l}</text>`;
        })}
        ${hasFc ? arrow(this.fcDir, true) : nothing} ${hasDir ? arrow(this.bearing, false) : nothing}
        <text class="spd" x=${CX} y=${CY + 6} text-anchor="middle">${this.speedText}</text>
        <text class="spdu" x=${CX} y=${CY + 17} text-anchor="middle">${this.unit}</text>
        ${this.gustText ? svg`<text class="gust" x=${CX} y=${CY + 29} text-anchor="middle">G ${this.gustText}</text>` : nothing}
      </svg>
      <div class="dir">
        ${hasDir
          ? html`${compassPoint(this.bearing)} <span class="deg">${Math.round(this.bearing)}°</span>`
          : html`${this.noDirLabel}`}
      </div>
      ${hasFc && this.fcText ? html`<div class="fc">${this.fcText}</div>` : nothing}
    `;
  }

  static styles = css`
    :host {
      display: block;
      font-family: var(--avionics-font-family, 'Roboto Condensed', 'Arial Narrow', sans-serif);
      font-variant-numeric: tabular-nums;
      color: var(--avionics-value-color, #fff);
      --rose-value: var(--avionics-value-color, #fff);
      --rose-forecast: var(--avionics-forecast-color, #ff00ff);
    }
    svg {
      width: 100%;
      display: block;
    }
    .ring {
      fill: none;
      stroke: var(--rose-value);
      stroke-width: 1;
      opacity: 0.6;
    }
    .tick {
      stroke: var(--rose-value);
      stroke-width: 1;
      opacity: 0.6;
    }
    .tick.major {
      stroke-width: 1.5;
      opacity: 1;
    }
    text {
      font-family: inherit;
    }
    .card {
      fill: var(--rose-value);
      font-size: 11px;
      font-weight: 700;
    }
    .cur-line {
      stroke: var(--rose-value);
      stroke-width: 2.5;
    }
    .cur-head {
      fill: var(--rose-value);
    }
    .fc-line {
      stroke: var(--rose-forecast);
      stroke-width: 1.5;
    }
    .fc-head {
      fill: var(--rose-forecast);
    }
    .spd {
      fill: var(--rose-value);
      font-size: 20px;
      font-weight: 700;
    }
    .spdu {
      fill: var(--avionics-unit-color, #00e5ff);
      font-size: 8px;
      font-weight: 700;
    }
    .gust {
      fill: var(--rose-value);
      font-size: 10px;
      font-weight: 700;
    }
    .dir {
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      margin-top: 2px;
    }
    .deg {
      color: var(--avionics-dim-color, #9a9a9a);
      font-size: 13px;
    }
    .fc {
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--rose-forecast);
    }
  `;
}

if (!customElements.get('avionics-wind-rose-el')) customElements.define('avionics-wind-rose-el', AvionicsWindRoseEl);
