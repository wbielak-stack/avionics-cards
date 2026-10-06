import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { resolveZones, inverseWanted, levelStyle } from '../../core/zone-extras';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { attrNum } from '../../core/attr';
import { type TankCardConfig, normalizeTank } from './config';

const pad = (n: number) => String(n).padStart(2, '0');
/** 9.7 h -> "9:42" */
const hm = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
};

/**
 * Zbiornik (np. SoC baterii) jak wskaznik paliwa: duza wartosc, pasek poziomy albo zbiornik pionowy,
 * strefy rezerwy, cel (cyjan) w trakcie zakupu / sprzedazy, zapas i czas (do celu / do pelna / ENDUR).
 */
export class AvionicsTankCard extends LitElement {
  @state() private _config?: TankCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _size: [number, number] = [400, 250];
  private _hass?: HomeAssistant;
  private _key = '';
  private _ro?: ResizeObserver;

  static getConfigElement() {
    return document.createElement('avionics-tank-card-editor');
  }

  static getStubConfig() {
    return { entity: '' };
  }

  setConfig(config: TankCardConfig): void {
    this._config = normalizeTank(config);
    this._key = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, rows: 4, min_columns: 3, min_rows: 3 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._ro = new ResizeObserver((e) => {
      const r = e[0]?.contentRect;
      if (r && (Math.abs(r.width - this._size[0]) > 4 || Math.abs(r.height - this._size[1]) > 4)) this._size = [r.width, r.height];
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
    const ids = [c.entity, c.stock_entity, c.power_entity, c.target_entity, c.target_active_entity, c.target2_entity, c.target2_active_entity, c.endurance_entity];
    const mode = readStyleMode(this);
    const key = ids.map((id) => (id ? hass.states[id]?.last_updated ?? '' : '')).join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private _n(id?: string): number {
    return id ? num(this._hass!.states[id]?.state) : NaN;
  }

  /** Aktywny cel: pierwsza para (np. zakup), potem druga (np. sprzedaz); bez encji aktywnosci - zawsze. */
  private _target(): number {
    const c = this._config!;
    const on = (id?: string) => !id || this._hass!.states[id]?.state === 'on';
    if ((c.target_entity || typeof c.target === 'number') && on(c.target_active_entity)) {
      return c.target_entity ? this._n(c.target_entity) : (c.target as number);
    }
    if (c.target2_entity && on(c.target2_active_entity)) return this._n(c.target2_entity);
    return NaN;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = resolveZones(this._hass, this._config);
    const t = (k: string) => localize(getLanguage(this._hass), k);
    if (!c.entity) return html`<ha-card><div class="err">${t('eis.choose_entity')}</div></ha-card>`;
    const soc = this._n(c.entity);
    const [W, H] = this._size;
    const vertical = c.layout === 'vertical' || (c.layout !== 'horizontal' && H > W * 0.95);

    // zapas
    const stock = c.stock_entity
      ? this._n(c.stock_entity) * (c.stock_multiplier ?? 1)
      : c.capacity
        ? (soc / 100) * c.capacity
        : NaN;
    // moc i kierunek
    const power = this._n(c.power_entity) * (c.power_multiplier ?? 1);
    const db = Math.abs(c.deadband ?? 0);
    const dir = power > db ? 1 : power < -db ? -1 : 0;
    // cel i czas
    const tgt = this._target();
    let tLab = '';
    let tVal = NaN;
    let tCol = 'var(--av-value)';
    const cap = c.capacity ?? (Number.isFinite(stock) && soc > 0 ? (stock / soc) * 100 : NaN);
    const absP = Math.abs(power);
    if (Number.isFinite(tgt) && Number.isFinite(cap) && absP > db) {
      tLab = t('tank.to_target');
      tVal = (Math.abs(tgt - soc) / 100) * cap / absP;
      tCol = 'var(--av-forecast)';
    } else if (dir > 0 && Number.isFinite(cap)) {
      tLab = t('tank.to_full');
      tVal = ((100 - soc) / 100) * cap / absP;
      tCol = 'var(--av-forecast)';
    } else {
      tLab = 'ENDUR';
      tVal = c.endurance_entity
        ? c.endurance_attribute
          ? attrNum(this._hass, c.endurance_entity, c.endurance_attribute)
          : this._n(c.endurance_entity)
        : dir < 0 && Number.isFinite(stock)
          ? stock / absP
          : NaN;
      if (Number.isFinite(tVal)) {
        tCol = tVal < (c.warning_hours ?? 3) ? 'var(--av-warning)' : tVal < (c.caution_hours ?? 6) ? 'var(--av-caution)' : 'var(--av-value)';
      }
    }
    // strefy jak w pozostalych kartach: alarm ma pierwszenstwo przed ostrzezeniem
    const has = (v?: number) => typeof v === 'number' && Number.isFinite(v);
    const lvl =
      (has(c.warning_low) && soc < c.warning_low!) || (has(c.warning_high) && soc > c.warning_high!)
        ? 'var(--av-warning)'
        : (has(c.caution_low) && soc < c.caution_low!) || (has(c.caution_high) && soc > c.caution_high!)
          ? 'var(--av-caution)'
          : 'var(--av-value)';
    const status =
      dir > 0 && c.status_positive
        ? html`<span style="color:var(--av-ok)">▲ ${c.status_positive} ${absP.toFixed(2).replace('.', ',')} ${c.power_unit}</span>`
        : dir < 0 && c.status_negative
          ? html`<span style="color:var(--av-value)">▼ ${c.status_negative} ${absP.toFixed(2).replace('.', ',')} ${c.power_unit}</span>`
          : Number.isFinite(power) && (c.status_positive || c.status_negative)
            ? html`<span style="color:var(--av-dim)">—</span>`
            : nothing;

    const d = c.precision ?? 1;
    const txt = Number.isFinite(soc) ? soc.toFixed(d) : '--';
    const [ip, dp] = txt.split('.');
    const warn = lvl === 'var(--av-warning)';
    const big = html`<div class="big" style=${levelStyle(lvl, warn, inverseWanted(this, (c as any).warning_inverse))}>
      <span class="ip">${ip}</span>${dp ? html`<span class="dp">,${dp}</span>` : nothing}<span class="pc">%</span>
    </div>`;
    const stats = html`<div class="stats">
      <div class="st">
        <span class="sl">${t('tank.stock')}</span>
        <span class="sv">${Number.isFinite(stock) ? stock.toFixed(1).replace('.', ',') : '—'}<span class="u">${c.stock_unit}</span></span>
      </div>
      <div class="st">
        <span class="sl">${tLab}</span>
        <span class="sv" style="color:${tCol}">${Number.isFinite(tVal) && tVal < 100 ? hm(tVal) : Number.isFinite(tVal) ? '> 99' : '—'}<span class="u">h</span></span>
      </div>
    </div>`;
    const p = (v: number) => Math.min(Math.max(v, 0), 100);
    // pasma stref: [od, do, kolor] - dolne od 0, gorne do 100
    const lo = (v?: number) => (has(v) ? p(v!) : 0);
    const hi = (v?: number) => (has(v) ? p(v!) : 100);
    const bands: Array<[number, number, string]> = [
      [0, lo(c.warning_low), 'var(--av-warning)'],
      [lo(c.warning_low), Math.max(lo(c.caution_low), lo(c.warning_low)), 'var(--av-caution)'],
      [Math.min(hi(c.caution_high), hi(c.warning_high)), hi(c.warning_high), 'var(--av-caution)'],
      [hi(c.warning_high), 100, 'var(--av-warning)'],
    ].filter(([a, b]) => b > a) as Array<[number, number, string]>;

    return html`
      <ha-card
        class=${classMap({ 'true-style': this._styleMode === 'true', vertical, horizontal: !vertical })}
        @click=${() => fireMoreInfo(this, c.entity!)}
      >
        <div class="head"><span class="name">${c.name ?? 'SOC'}</span><span class="status">${status}</span></div>
        ${vertical
          ? html`<div class="vbody">
              <div class="vtank">
                <div class="fill" style="height:${p(soc)}%"></div>
                ${bands.map(
                  ([a, b, col]) =>
                    html`<div class="zone" style="bottom:calc(3px + (100% - 6px) * ${a / 100});height:calc((100% - 6px) * ${(b - a) / 100});background:${col}"></div>`,
                )}
                ${Number.isFinite(tgt)
                  ? html`<div class="vtgt" style="bottom:${p(tgt)}%"><span>${tgt.toFixed(1).replace('.', ',')}</span></div>`
                  : nothing}
              </div>
              <div class="vright">${big}${stats}</div>
            </div>`
          : html`${big}
              <div class="hbar">
                <div class="fill" style="width:${p(soc)}%"></div>
                ${bands.map(
                  ([a, b, col]) =>
                    html`<div class="zone" style="left:calc(2px + (100% - 4px) * ${a / 100});width:calc((100% - 4px) * ${(b - a) / 100});background:${col}"></div>`,
                )}
                ${Number.isFinite(tgt) ? html`<div class="htgt" style="left:${p(tgt)}%"></div>` : nothing}
              </div>
              <div class="hscale">
                <span>0</span>${Number.isFinite(tgt)
                  ? html`<span class="tl" style="left:${p(tgt)}%">${tgt.toFixed(1).replace('.', ',')}</span>`
                  : nothing}<span>100</span>
              </div>
              ${stats}`}
      </ha-card>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 12px;
        cursor: pointer;
        container-type: size;
        display: flex;
        flex-direction: column;
        min-height: 200px;
      }
      ha-card.horizontal {
        container-type: inline-size;
      }
      .err {
        color: var(--av-dim);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }
      .name {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .status {
        font-size: 13px;
        font-weight: 700;
        white-space: nowrap;
      }
      /* duza wartosc skalowana z szerokoscia karty */
      .big {
        font-weight: 700;
        line-height: 1;
        white-space: nowrap;
      }
      .ip {
        font-size: clamp(48px, 22cqi, 120px);
      }
      .dp {
        font-size: clamp(22px, 9cqi, 52px);
      }
      .pc {
        font-size: clamp(16px, 6cqi, 30px);
        color: var(--av-unit);
        margin-left: 6px;
      }
      .horizontal .big {
        text-align: center;
        margin: 6px 0 8px;
      }
      .hbar {
        position: relative;
        height: 20px;
        border: 1px solid var(--av-frame);
        margin-top: 10px;
      }
      .hbar .fill,
      .hbar .zone {
        position: absolute;
        top: 2px;
        bottom: 2px;
      }
      .hbar .fill {
        left: 2px;
      }
      .hbar .fill {
        background: #e8e8e8;
        max-width: calc(100% - 4px);
      }
      .htgt {
        position: absolute;
        top: -6px;
        bottom: -6px;
        width: 2px;
        margin-left: -1px;
        background: var(--av-setpoint);
      }
      .htgt::before {
        content: '';
        position: absolute;
        top: -8px;
        left: -5px;
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 9px solid var(--av-setpoint);
      }
      .hscale {
        position: relative;
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: var(--av-dim);
        margin-top: 3px;
        height: 14px;
      }
      .hscale .tl {
        position: absolute;
        transform: translateX(-100%);
        margin-left: -6px;
        color: var(--av-setpoint);
        font-weight: 700;
      }
      /* dane: obok siebie, a gdy brak miejsca - jedna pod druga */
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
        gap: 6px 14px;
        margin-top: auto;
        padding-top: 10px;
      }
      .st {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        min-width: 0;
      }
      .sl {
        color: var(--av-label);
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .sv {
        font-size: clamp(22px, 8cqi, 36px);
        font-weight: 700;
        line-height: 1.1;
        white-space: nowrap;
      }
      .u {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 4px;
      }
      /* --- uklad pionowy: zbiornik po lewej --- */
      .vbody {
        flex: 1 1 auto;
        display: flex;
        gap: 16px;
        margin-top: 8px;
        min-height: 0;
      }
      .vtank {
        position: relative;
        width: clamp(40px, 18cqi, 70px);
        border: 1.5px solid var(--av-frame);
        flex: none;
      }
      .vtank .fill,
      .vtank .zone {
        position: absolute;
        left: 3px;
        right: 3px;
      }
      .vtank .fill {
        bottom: 3px;
      }
      .vtank .fill {
        background: #e8e8e8;
        max-height: calc(100% - 6px);
      }
      .vtgt {
        position: absolute;
        left: -7px;
        right: -7px;
        height: 2px;
        background: var(--av-setpoint);
      }
      .vtgt span {
        position: absolute;
        left: calc(100% + 4px);
        top: -7px;
        font-size: 11px;
        font-weight: 700;
        color: var(--av-setpoint);
      }
      .vright {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        container-type: inline-size;
      }
      .vertical .big {
        text-align: right;
      }
      .vertical .ip {
        font-size: clamp(44px, 34cqi, 120px);
      }
      .vertical .dp {
        font-size: clamp(20px, 14cqi, 52px);
      }
      .vertical .pc {
        font-size: clamp(14px, 8cqi, 30px);
      }
      .vertical .sv {
        font-size: clamp(20px, 13cqi, 36px);
      }
    `,
  ];
}
