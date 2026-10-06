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
import { attrNum, attrPath } from '../../core/attr';
import { gridValues, gridSvg, gridLabels } from '../../core/grid';
import { type EnduranceCardConfig, normalizeEndurance } from './config';

const HOUR = 3600e3;
const pad = (n: number) => String(n).padStart(2, '0');

/** 9.7 h -> "9:42" */
function hm(h: number): string {
  const total = Math.round(h * 60);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

/**
 * Komputer paliwowy dla magazynu energii: ENDUR (czas do rozladowania) i ETA w dwoch scenariuszach,
 * pasek SoC jak wskaznik paliwa z prognozowanym dolkiem, opcjonalny profil SoC.
 */
export class AvionicsEnduranceCard extends LitElement {
  @state() private _config?: EnduranceCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-endurance-card-editor');
  }

  static getStubConfig() {
    return { entity: '' };
  }

  setConfig(config: EnduranceCardConfig): void {
    this._config = normalizeEndurance(config);
    this._key = '';
  }

  getCardSize(): number {
    return 6;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    const mode = readStyleMode(this);
    // minuta w kluczu - ETA i "teraz" na profilu przesuwaja sie z czasem
    const key = [c.entity, c.soc_entity].map((e) => (e ? hass.states[e]?.last_updated ?? '' : '')).join('|')
      + `|${mode}|${getLanguage(hass)}|${Math.floor(Date.now() / 60000)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private _a(path?: string): number {
    return attrNum(this._hass, this._config!.entity, path);
  }

  /** Chwila wyliczenia prognozy (ETA liczona od niej, jak w karcie "Godzina rozladowania"). */
  private _anchor(): number {
    const raw = attrPath(this._hass, this._config!.entity, this._config!.updated_attribute);
    const t = raw ? Date.parse(String(raw)) : NaN;
    return Number.isFinite(t) ? t : Date.now();
  }

  private _eta(hours: number): string {
    const d = new Date(this._anchor() + hours * HOUR);
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400e3);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}${days > 0 ? ` +${days}` : ''}`;
  }

  /** Przebieg SoC: lista liczb (godzina po godzinie) albo obiektow z polem SoC i ew. godzina. */
  private _trajectory(): number[] {
    const raw = attrPath(this._hass, this._config!.entity, this._config!.trajectory_attribute);
    if (!Array.isArray(raw)) return [];
    const out: number[] = [];
    for (const it of raw) {
      if (typeof it === 'number') out.push(it);
      else if (it && typeof it === 'object') {
        const o = it as Record<string, unknown>;
        const v = o.soc ?? o.soc_pct ?? o.value ?? o.v;
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (Number.isFinite(n)) out.push(n);
      } else {
        const n = parseFloat(String(it));
        if (Number.isFinite(n)) out.push(n);
      }
    }
    return out;
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    const hass = this._hass;
    if (!c || !hass) return nothing;
    const t = (k: string) => localize(getLanguage(hass), k);
    if (!c.entity || !hass.states[c.entity]) {
      return html`<ha-card><div class="empty">${t('eis.choose_entity')}</div></ha-card>`;
    }
    const nopv = this._a(c.endurance_attribute);
    const pv = this._a(c.endurance_pv_attribute);
    const soc = c.soc_entity ? num(hass.states[c.soc_entity]?.state) : this._a(c.soc_attribute);
    const dip = this._a(c.min_attribute);
    const diph = this._a(c.min_hour_attribute);
    const reb = this._a(c.rebound_attribute);
    const max = c.max_hours ?? 36;
    const over = (h: number) => !Number.isFinite(h) || h > max;
    const nopvCol =
      !over(nopv) && nopv < (c.warning_hours ?? 3)
        ? 'var(--av-warning)'
        : !over(nopv) && nopv < (c.caution_hours ?? 6)
          ? 'var(--av-caution)'
          : 'var(--av-value)';

    return html`
      <ha-card
        class=${classMap({ 'true-style': this._styleMode === 'true' })}
        @click=${() => fireMoreInfo(this, c.entity!)}
      >
        ${cardHeader(c.name)}
        <div class="scen">
          <div class="box">
            <div class="blbl">${c.label_nopv ?? t('endur.nopv')}</div>
            <div class="big" style="color:${nopvCol}">
              ${over(nopv) ? html`&gt; ${max}<span class="u">h</span>` : html`${hm(nopv)}<span class="u">h</span>`}
            </div>
            <div class="foot">
              <span>ETA</span><span class="fv">${over(nopv) ? '—' : this._eta(nopv)}</span>
            </div>
          </div>
          <div class="box fc">
            <div class="blbl">${c.label_pv ?? t('endur.pv')}</div>
            <div class="big">
              ${Number.isFinite(pv) && pv <= max
                ? html`${hm(pv)}<span class="u">h</span>`
                : html`<span class="txt">${Number.isFinite(pv) ? `> ${max} h` : t('endur.no_depletion')}</span>`}
            </div>
            <div class="foot">
              ${Number.isFinite(pv) && pv <= max
                ? html`<span>ETA</span><span class="fv">${this._eta(pv)}</span>`
                : Number.isFinite(dip)
                  ? html`<span>MIN</span
                      ><span class="fv"
                        >${Math.round(dip)}%${Number.isFinite(diph) ? ` @ ${pad(diph)}:00` : ''}${Number.isFinite(reb)
                          ? ` → ${Math.round(reb)}%`
                          : ''}</span
                      >`
                  : nothing}
            </div>
          </div>
        </div>
        ${Number.isFinite(soc) ? this._socBar(soc, dip, diph, reb, t) : nothing}
        ${c.show_profile ? this._profile(soc, t) : nothing}
      </ha-card>
    `;
  }

  /** Pasek SoC jak wskaznik paliwa: bialy = teraz, magentowy pusty = dolek, pelny = po doladowaniu. */
  private _socBar(soc: number, dip: number, diph: number, reb: number, t: (k: string) => string) {
    const c = this._config!;
    const p = (v: number) => Math.min(Math.max(v, 0), 100);
    const w = c.soc_warning ?? 10;
    const ca = c.soc_caution ?? 20;
    const hasDip = Number.isFinite(dip) && dip < soc;
    return html`<div class="soc">
      <div class="sh"><span class="blbl">SOC</span><span class="sv">${soc.toFixed(1).replace('.', ',')}<span class="u">%</span></span></div>
      <div class="bar">
        <div class="band"></div>
        <div class="zone" style="left:0;width:${p(w)}%;background:var(--av-warning)"></div>
        <div class="zone" style="left:${p(w)}%;width:${p(ca) - p(w)}%;background:var(--av-caution)"></div>
        ${hasDip ? html`<div class="seg" style="left:${p(dip)}%;width:${p(soc) - p(dip)}%"></div>` : nothing}
        <div class="mk cur" style="left:${p(soc)}%"></div>
        ${hasDip ? html`<div class="mk dip" style="left:${p(dip)}%"></div>
              <span class="ml" style="left:${p(dip)}%">MIN${Number.isFinite(diph) ? ` ${pad(diph)}:00` : ''}</span>` : nothing}
        ${Number.isFinite(reb) && Math.abs(reb - soc) > 1
          ? html`<div class="mk reb" style="left:${p(reb)}%"></div>
              <span class="ml" style="left:${p(reb)}%">${t('endur.after_pv')}</span>`
          : nothing}
      </div>
    </div>`;
  }

  /** Profil prognozowanego SoC (magenta, przerywana) - jak profil pionowy trasy. */
  private _profile(soc: number, t: (k: string) => string) {
    const c = this._config!;
    const hours = c.profile_hours ?? 24;
    const traj = this._trajectory().slice(0, hours + 1);
    if (traj.length < 2) return nothing;
    const pts = Number.isFinite(soc) ? [soc, ...traj.slice(1)] : traj;
    const n = Math.max(pts.length - 1, 1);
    const x = (i: number) => (i / hours) * 100;
    const y = (v: number) => 40 - (Math.min(Math.max(v, 0), 100) / 100) * 40;
    const d = pts.map((v, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ');
    const now = new Date(this._anchor());
    const labels = [0, 0.25, 0.5, 0.75].map((f) => {
      const h = new Date(now.getTime() + f * hours * HOUR);
      return { f, l: f === 0 ? t('endur.now') : pad(h.getHours()) };
    });
    void n;
    const g = { mode: c.profile_grid ?? 'nice', step: c.profile_grid_step };
    return html`<div class="profile">
      <span class="plbl">${t('endur.profile').replace('{h}', String(hours))}</span>
      ${gridLabels(gridValues(0, 100, g), (v) => (y(v) / 40) * 100, g, 0, 100, 'right')}
      <svg viewBox="0 0 100 40" preserveAspectRatio="none">
        ${gridSvg(gridValues(0, 100, g), y, 100)}
        <line x1="0" x2="100" y1=${y(c.soc_caution ?? 20)} y2=${y(c.soc_caution ?? 20)} class="lvl" vector-effect="non-scaling-stroke"></line>
        <path d=${d} class="traj" vector-effect="non-scaling-stroke"></path>
      </svg>
      <div class="ptimes">${labels.map((l) => html`<span style="left:${l.f * 100}%">${l.l}</span>`)}</div>
    </div>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 10px;
        cursor: pointer;
      }
      .empty {
        color: var(--av-dim);
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--av-frame);
      }
      .scen {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .box {
        border: 1px solid #5a5a5a;
        padding: 6px 10px 6px;
        min-width: 0;
      }
      .blbl {
        color: var(--av-label);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .big {
        text-align: right;
        font-size: 30px;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
      }
      .box.fc .big,
      .box.fc .fv {
        color: var(--av-forecast);
      }
      .big .txt {
        font-size: 16px;
        text-transform: uppercase;
        line-height: 36px;
      }
      .u {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 2px;
      }
      .foot {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        font-size: 11px;
        color: var(--av-dim);
        min-height: 16px;
      }
      .fv {
        color: var(--av-value);
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
      }
      .soc {
        margin-top: 10px;
      }
      .sh {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
      }
      .sv {
        font-size: 16px;
        font-weight: 700;
      }
      .bar {
        position: relative;
        height: 34px;
        margin-top: 2px;
      }
      .band,
      .zone,
      .seg {
        position: absolute;
        top: 10px;
        height: 4px;
      }
      .band {
        left: 0;
        right: 0;
        background: #3a3a3a;
      }
      .seg {
        background: var(--av-forecast);
      }
      .mk {
        position: absolute;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        transform: translateX(-5px);
      }
      .mk.cur {
        top: 0;
        border-top: 8px solid var(--av-value);
      }
      .mk.dip,
      .mk.reb {
        top: 16px;
        border-bottom: 8px solid var(--av-forecast);
      }
      .mk.dip::after {
        content: '';
        position: absolute;
        left: -3px;
        top: 2px;
        border-left: 3px solid transparent;
        border-right: 3px solid transparent;
        border-bottom: 5px solid var(--av-bg);
      }
      .ml {
        position: absolute;
        top: 24px;
        transform: translateX(-50%);
        font-size: 9px;
        color: var(--av-forecast);
        white-space: nowrap;
      }
      .profile {
        position: relative;
        margin-top: 10px;
        border: 1px solid #3a3a3a;
        height: 70px;
      }
      .plbl {
        position: absolute;
        top: 3px;
        left: 6px;
        font-size: 10px;
        color: var(--av-dim);
      }
      .profile svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .traj {
        fill: none;
        stroke: var(--av-forecast);
        stroke-width: 2;
        stroke-dasharray: 5 3;
      }
      .lvl {
        stroke: var(--av-caution);
        stroke-width: 1;
        stroke-dasharray: 2 3;
        opacity: 0.6;
      }
      .ptimes {
        position: absolute;
        left: 0;
        right: 0;
        bottom: -15px;
        height: 12px;
      }
      .ptimes span {
        position: absolute;
        font-size: 10px;
        color: var(--av-dim);
      }
      .profile {
        margin-bottom: 16px;
      }
    `,
  ];
}
