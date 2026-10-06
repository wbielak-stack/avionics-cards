import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { localize, getLanguage } from '../../core/i18n';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { sunTimes, sunPosition, moonAltitude, moonIllumination, moonTimes, nextPhase } from '../../core/astro';

const DAY = 86400e3;
const pad = (n: number) => String(n).padStart(2, '0');
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export interface AstroCardConfig {
  type: string;
  title?: string;
  latitude?: number;
  longitude?: number;
  show_profile?: boolean;
  show_sun?: boolean;
  show_moon?: boolean;
}

/** Faza ksiezyca 0..1 -> klucz nazwy. */
function phaseKey(p: number): string {
  const keys = ['new', 'waxing_crescent', 'first_quarter', 'waxing_gibbous', 'full', 'waning_gibbous', 'last_quarter', 'waning_crescent'];
  return keys[Math.round(p * 8) % 8];
}

/**
 * Slonce i ksiezyc: profil doby (wysokosc slonca i ksiezyca, pasma zmierzchu), wschod / zachod,
 * zmierzch cywilny (granica nocy VFR), dlugosc dnia, faza ksiezyca. Liczone w karcie ze wspolrzednych domu.
 */
export class AvionicsAstroCard extends LitElement {
  @state() private _config?: AstroCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _tick = 0;
  private _hass?: HomeAssistant;
  private _timer?: number;

  static getConfigElement() {
    return document.createElement('avionics-astro-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config: AstroCardConfig): void {
    this._config = { show_profile: true, show_sun: true, show_moon: true, ...config };
  }

  getCardSize(): number {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._timer = window.setInterval(() => this._tick++, 60000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    const mode = readStyleMode(this);
    if (first || mode !== this._styleMode) this._styleMode = mode;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private _loc(): [number, number] | undefined {
    const c = this._config!;
    const lat = c.latitude ?? (this._hass as any)?.config?.latitude;
    const lon = c.longitude ?? (this._hass as any)?.config?.longitude;
    return typeof lat === 'number' && typeof lon === 'number' ? [lat, lon] : undefined;
  }

  private _t(d?: Date): string {
    return d && Number.isFinite(d.valueOf()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '—';
  }

  private _date(d: Date): string {
    return Number.isFinite(d.valueOf())
      ? d.toLocaleDateString(getLanguage(this._hass), { day: '2-digit', month: '2-digit' }) + ` ${this._t(d)}`
      : '—';
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    void this._tick;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const loc = this._loc();
    if (!loc) return html`<ha-card><div class="err">${t('astro.no_location')}</div></ha-card>`;
    const [lat, lon] = loc;
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const noonish = new Date(midnight.valueOf() + 12 * 3600e3);
    const st = sunTimes(noonish, lat, lon);
    const sy = sunTimes(new Date(noonish.valueOf() - DAY), lat, lon);
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        <div class="title">${c.title ?? t('astro.title')}</div>
        ${c.show_profile !== false ? this._profile(midnight, now, lat, lon, st, t) : nothing}
        <div class="boxes">
          ${c.show_sun !== false ? this._sunBox(now, lat, lon, st, sy, t) : nothing}
          ${c.show_moon !== false ? this._moonBox(now, midnight, lat, lon, t) : nothing}
        </div>
      </ha-card>
    `;
  }

  /**
   * Profil doby: tlo wg pory dnia (noc / zmierzch zeglarski / cywilny / dzien - pasy w czasie),
   * horyzont, wysokosc slonca (biala) i ksiezyca (blada, przerywana), "teraz" z ikonami.
   */
  private _profile(midnight: Date, now: Date, lat: number, lon: number, st: ReturnType<typeof sunTimes>, t: (k: string) => string) {
    const N = 145;
    const sun: number[] = [];
    const moon: number[] = [];
    for (let i = 0; i < N; i++) {
      const d = new Date(midnight.valueOf() + (i / (N - 1)) * DAY);
      sun.push(sunPosition(d, lat, lon).alt);
      moon.push(moonAltitude(d, lat, lon));
    }
    const top = Math.max(20, ...sun, ...moon) + 8;
    const bottom = -14;
    // bez obcinania - krzywa schodzi pod dolna krawedz zamiast lezec na niej
    const y = (a: number) => (40 * (top - a)) / (top - bottom);
    const x = (i: number) => (i / (N - 1)) * 100;
    const path = (arr: number[]) => arr.map((a, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(a).toFixed(2)}`).join(' ');
    const xt = (d?: Date) => (d ? ((d.valueOf() - midnight.valueOf()) / DAY) * 100 : NaN);
    const xn = xt(now);
    const sunNow = sunPosition(now, lat, lon).alt;
    const moonNow = moonAltitude(now, lat, lon);
    // pora doby w kazdym przedziale 10 min -> pasy tla
    const band = (a: number) => (a > 0 ? '' : a > -6 ? 'civil' : a > -12 ? 'naut' : 'night');
    const strips: Array<{ x0: number; x1: number; cls: string }> = [];
    for (let i = 0; i < N - 1; i++) {
      const cls = band((sun[i] + sun[i + 1]) / 2);
      const last = strips[strips.length - 1];
      if (last && last.cls === cls) last.x1 = x(i + 1);
      else strips.push({ x0: x(i), x1: x(i + 1), cls });
    }
    const ill = moonIllumination(now);
    const yh = (y(0) / 40) * 100;
    return html`<div class="profile">
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        ${strips.map((b) => (b.cls ? svg`<rect x=${b.x0} y="0" width=${b.x1 - b.x0 + 0.05} height="40" class=${b.cls}></rect>` : nothing))}
        <line x1="0" x2="100" y1=${y(0)} y2=${y(0)} class="hor" vector-effect="non-scaling-stroke"></line>
        <path d=${path(moon)} class="moonl" vector-effect="non-scaling-stroke"></path>
        <path d=${path(sun)} class="sunl" vector-effect="non-scaling-stroke"></path>
        <line x1=${xn} x2=${xn} y1="0" y2="40" class="nowl" vector-effect="non-scaling-stroke"></line>
      </svg>
      ${moonNow > bottom
        ? html`<span class="mico" style="left:${xn}%;top:${(y(moonNow) / 40) * 100}%">${this._moonIcon(ill.phase)}</span>`
        : nothing}
      ${sunNow > bottom ? html`<span class="dot sun" style="left:${xn}%;top:${(y(sunNow) / 40) * 100}%"></span>` : nothing}
      ${st.sunrise ? html`<span class="mk" style="left:${xt(st.sunrise)}%;top:${yh}%">▲ ${this._t(st.sunrise)}</span>` : nothing}
      ${st.sunset ? html`<span class="mk" style="left:${xt(st.sunset)}%;top:${yh}%">▼ ${this._t(st.sunset)}</span>` : nothing}
      <div class="hours">${[0, 6, 12, 18, 24].map((h) => html`<span style="left:${(h / 24) * 100}%">${pad(h % 24)}</span>`)}</div>
    </div>
    <div class="legend">
      <span class="sw civil"></span>${t('astro.civil_l')}
      <span class="sw naut"></span>${t('astro.nautical_l')}
      <span class="sw night"></span>${t('astro.night_l')}
      <span class="ln sunln"></span>${t('astro.sun')}
      <span class="ln moonln"></span>${t('astro.moon')}
    </div>`;
  }

  private _row(label: string, value: TemplateResult | string) {
    return html`<div class="r"><span class="l">${label}</span><span class="v">${value}</span></div>`;
  }

  private _sunBox(now: Date, lat: number, lon: number, st: ReturnType<typeof sunTimes>, sy: ReturnType<typeof sunTimes>, t: (k: string) => string) {
    const len = st.sunrise && st.sunset ? (st.sunset.valueOf() - st.sunrise.valueOf()) / 60000 : NaN;
    const leny = sy.sunrise && sy.sunset ? (sy.sunset.valueOf() - sy.sunrise.valueOf()) / 60000 : NaN;
    const delta = len - leny;
    const pos = sunPosition(now, lat, lon);
    return html`<div class="box">
      <div class="bt">${t('astro.sun')}</div>
      ${this._row(t('astro.sunrise_sunset'), `${this._t(st.sunrise)} / ${this._t(st.sunset)}`)}
      ${this._row(t('astro.civil'), `${this._t(st.dawn)} / ${this._t(st.dusk)}`)}
      ${this._row(t('astro.noon'), this._t(st.noon))}
      ${this._row(
        t('astro.day_length'),
        Number.isFinite(len)
          ? html`${Math.floor(len / 60)}:${pad(Math.round(len % 60))}${Number.isFinite(delta)
                ? html`<span class="sub">${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1).replace('.', ',')} min</span>`
                : nothing}`
          : '—',
      )}
      ${this._row(t('astro.elev_az'), `${pos.alt.toFixed(1).replace('.', ',')}° / ${Math.round(pos.az)}° ${DIRS[Math.round(pos.az / 22.5) % 16]}`)}
    </div>`;
  }

  private _moonBox(now: Date, midnight: Date, lat: number, lon: number, t: (k: string) => string) {
    const ill = moonIllumination(now);
    const mt = moonTimes(midnight, lat, lon);
    return html`<div class="box">
      <div class="bt">${t('astro.moon')}</div>
      <div class="moonhead">
        ${this._moonIcon(ill.phase)}
        <div>
          <div class="pn">${t(`astro.phase.${phaseKey(ill.phase)}`)}</div>
          <div class="sub">${t('astro.illuminated')} ${Math.round(ill.fraction * 100)} %</div>
        </div>
      </div>
      ${this._row(t('astro.moonrise_set'), `${this._t(mt.rise)} / ${this._t(mt.set)}`)}
      ${this._row(t('astro.full'), this._date(nextPhase(now, 0.5)))}
      ${this._row(t('astro.new'), this._date(nextPhase(now, 0)))}
    </div>`;
  }

  /** Rysunek fazy: oswietlona czesc tarczy (polkula polnocna: przybywa z prawej). */
  private _moonIcon(p: number) {
    const r = 15;
    const cx = 17;
    const cy = 17;
    const k = Math.cos(2 * Math.PI * p);
    const rx = Math.abs(k) * r;
    const waxing = p < 0.5;
    const crescent = Math.abs(p - 0.5) > 0.25; // ponizej polowy oswietlenia
    const edge = waxing ? `A ${r} ${r} 0 0 1 ${cx} ${cy + r}` : `A ${r} ${r} 0 0 0 ${cx} ${cy + r}`;
    const sweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
    const d = `M ${cx} ${cy - r} ${edge} A ${rx.toFixed(2)} ${r} 0 0 ${sweep} ${cx} ${cy - r} Z`;
    return html`<svg class="micon" viewBox="0 0 34 34">
      <circle cx=${cx} cy=${cy} r=${r} class="mdark"></circle>
      ${p > 0.02 && p < 0.98 ? svg`<path d=${d} class="mlit"></path>` : nothing}
    </svg>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 10px;
      }
      .err {
        color: var(--av-dim);
        padding: 8px 0;
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .profile {
        position: relative;
        height: 130px;
        margin: 4px 0 18px;
      }
      .profile svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .civil {
        fill: #17324f;
        background: #17324f;
      }
      .naut {
        fill: #0e2036;
        background: #0e2036;
      }
      .night {
        fill: #07101c;
        background: #07101c;
      }
      .hor {
        stroke: var(--av-value);
        stroke-width: 1;
        opacity: 0.7;
      }
      .sunl {
        fill: none;
        stroke: var(--av-value);
        stroke-width: 2;
      }
      .moonl {
        fill: none;
        stroke: var(--av-dim);
        stroke-width: 1;
        stroke-dasharray: 3 3;
        opacity: 0.7;
      }
      .nowl {
        stroke: var(--av-setpoint);
        stroke-width: 1;
        opacity: 0.7;
      }
      .dot {
        position: absolute;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        transform: translate(-50%, -50%);
      }
      .dot.sun {
        background: var(--av-value);
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.7);
      }
      .mico {
        position: absolute;
        transform: translate(-50%, -50%);
        line-height: 0;
      }
      .mico svg {
        width: 16px;
        height: 16px;
      }
      /* godziny wschodu / zachodu nad horyzontem, na ciemnym tle */
      .mk {
        position: absolute;
        transform: translate(-50%, calc(-100% - 3px));
        font-size: 10px;
        font-weight: 700;
        white-space: nowrap;
        background: rgba(0, 0, 0, 0.75);
        padding: 0 3px;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px 6px;
        font-size: 10px;
        color: var(--av-dim);
        margin-bottom: 8px;
      }
      .legend .sw {
        width: 12px;
        height: 8px;
        display: inline-block;
      }
      .legend .ln {
        width: 14px;
        height: 0;
        display: inline-block;
        margin-left: 6px;
      }
      .sunln {
        border-top: 2px solid var(--av-value);
      }
      .moonln {
        border-top: 1px dashed var(--av-dim);
      }
      .hours {
        position: absolute;
        left: 0;
        right: 0;
        bottom: -15px;
        height: 12px;
      }
      .hours span {
        position: absolute;
        transform: translateX(-50%);
        font-size: 10px;
        color: var(--av-dim);
      }
      .hours span:first-child {
        transform: none;
      }
      .hours span:last-child {
        transform: translateX(-100%);
      }
      .boxes {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 8px;
      }
      .box {
        border: 1px solid #5a5a5a;
        padding: 6px 10px 8px;
      }
      .bt {
        color: var(--av-label);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .r {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
        padding: 2px 0;
      }
      .l {
        font-size: 12px;
        color: var(--av-label);
        white-space: nowrap;
      }
      .v {
        font-size: 15px;
        font-weight: 700;
        white-space: nowrap;
        text-align: right;
      }
      .sub {
        font-size: 11px;
        font-weight: 400;
        color: var(--av-dim);
        margin-left: 6px;
      }
      .moonhead {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 4px;
      }
      .micon {
        width: 34px;
        height: 34px;
        flex: none;
      }
      .mdark {
        fill: #2a2a2a;
        stroke: #5a5a5a;
        stroke-width: 0.8;
      }
      .mlit {
        fill: #e8e8e8;
      }
      .pn {
        font-size: 15px;
        font-weight: 700;
      }
      .moonhead .sub {
        margin-left: 0;
      }
    `,
  ];
}
