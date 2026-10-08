import { html, svg, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { cardHeader } from '../../core/header';
import { computeBalance, type Balance, type HourIn } from '../../core/energy/balance';
import { EnergyBase, hourly, at, type EnergyBaseConfig, type Period } from './base';

const PV = '#ffe600';
const BAT = '#00e676';
const GRID = '#e2007a';

const n1 = (v: number) => v.toFixed(1).replace('.', ',').replace('-', '−');
const n2 = (v: number) => v.toFixed(2).replace('.', ',').replace('-', '−');
const zl = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2).replace('.', ',')} zł`;
const pct = (v: number) => `${Math.round(v * 100)} %`;

const SHARED = css`
  ha-card {
    padding: 10px 14px 12px;
  }
  .nav {
    display: inline-flex;
    gap: 3px;
    align-items: center;
  }
  .nav button {
    font: inherit;
    font-size: 11px;
    font-weight: 700;
    padding: 1px 6px;
    background: transparent;
    color: var(--av-dim);
    border: 1px solid transparent;
    cursor: pointer;
  }
  .nav button.on {
    color: var(--av-label);
    border-color: var(--av-label);
  }
  .nav button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .lbl {
    color: var(--av-label);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .dim {
    color: var(--av-dim);
  }
  .ok {
    color: var(--av-ok);
  }
  .am {
    color: var(--av-caution);
  }
  .row {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 3px 0;
    font-size: 13px;
    font-weight: 700;
  }
  .row .sp {
    flex: 1;
  }
  .row .lbl {
    min-width: 92px;
  }
  hr {
    border: 0;
    border-top: 1px solid var(--av-frame);
    margin: 8px 0;
  }
  .empty {
    color: var(--av-dim);
    padding: 10px 0;
  }
`;

function periodNav(card: EnergyBase<any>, t: (k: string) => string, period: Period, offset: number) {
  const p = (k: Period, l: string) =>
    html`<button class=${period === k ? 'on' : ''} @click=${() => (card as any).setPeriod(k)}>${l}</button>`;
  return html`<span class="nav">
    <button @click=${() => (card as any).shift(-1)}>◀</button>
    ${p('day', t('en.p.day'))}${p('week', t('en.p.week'))}${p('month', t('en.p.month'))}
    <button ?disabled=${offset >= 0} @click=${() => (card as any).shift(1)}>▶</button>
  </span>`;
}

function modeNav(mode: string, set: (m: 'kwh' | 'pln') => void) {
  return html`<span class="nav">
    <button class=${mode === 'kwh' ? 'on' : ''} @click=${() => set('kwh')}>kWh</button>
    <button class=${mode === 'pln' ? 'on' : ''} @click=${() => set('pln')}>PLN</button>
  </span>`;
}

/** Wiersz tabeli zyskow: nazwa, kWh, srednio zl/kWh, kwota. */
function gainRow(name: string, kwh: number, z: number) {
  return html`<span>${name}</span><b class="r">${n1(kwh)}</b><b class="r dim">${kwh > 0.01 ? n2(Math.abs(z) / kwh) : '—'}</b
    ><b class="r ${z >= 0 ? 'ok' : ''}">${zl(z)}</b>`;
}

// =================== BILANS ENERGII ===================
export interface BalanceCardConfig extends EnergyBaseConfig {
  /** koszt zakupu: lacznie albo energia czynna i dystrybucja osobno */
  cost_split?: 'total' | 'split';
  /** dni rozbiegu dla pochodzenia energii w magazynie */
  warmup_days?: number;
  /** zakup w gore, sprzedaz w dol (jak w panelu Energia) */
  invert_chart?: boolean;
  /** SoC magazynu (%) i pojemnosc uzyteczna (kWh) - zawartosc rzeczywista; brak - z panelu Energia */
  soc_entity?: string;
  battery_capacity?: number;
}

export class AvionicsEnergyBalanceCard extends EnergyBase<BalanceCardConfig> {
  @state() private _b?: Balance;
  @state() private _split: 'total' | 'split' = 'total';
  @state() private _from = 0;
  static getConfigElement() {
    return document.createElement('avionics-energy-balance-card-editor');
  }
  static getStubConfig() {
    return {};
  }
  getCardSize() {
    return 9;
  }
  setConfig(config: BalanceCardConfig): void {
    super.setConfig(config);
    this._split = config.cost_split ?? 'total';
  }

  protected async load(hass: HomeAssistant, from: number, to: number) {
    const s = this._src!;
    const c = this._config!;
    const warm = (c.warmup_days ?? 7) * 86400e3;
    const ids = [...s.gridFrom, ...s.gridTo, ...s.solar, ...s.batIn, ...s.batOut, ...s.costFrom, ...s.compTo, ...(c.house_entity ? [c.house_entity] : [])];
    const socId = c.soc_entity ?? s.soc;
    const cap = c.battery_capacity ?? s.capacity;
    const [st, pr, soc] = await Promise.all([
      hourly(hass, ids, from - warm, to, 'change'),
      this.prices(hass, from - warm, to),
      socId && cap ? hourly(hass, [socId], from - warm, to, 'mean') : Promise.resolve({} as Record<string, Map<number, number>>),
    ]);
    const hours: HourIn[] = [];
    for (let h = from - warm; h < to; h += 3600e3) {
      hours.push({
        t: h,
        pv: at(st, s.solar, h),
        imp: at(st, s.gridFrom, h),
        exp: at(st, s.gridTo, h),
        bin: at(st, s.batIn, h),
        bout: at(st, s.batOut, h),
        house: c.house_entity ? st[c.house_entity]?.get(h) ?? 0 : undefined,
        soc: socId ? soc[socId]?.get(h) : undefined,
        ec: pr.has ? pr.ec(h) ?? 0 : undefined,
        dist: pr.has ? pr.dist(h) ?? 0 : undefined,
        rce: pr.rce(h),
        haCost: s.costFrom.length ? at(st, s.costFrom, h) : undefined,
        haComp: s.compTo.length ? at(st, s.compTo, h) : undefined,
      });
    }
    this._from = from;
    this._b = computeBalance(hours, Math.round(warm / 3600e3), cap);
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = this.t;
    const b = this._b;
    const title = `${c.title ?? t('en.balance')} · ${this.periodLabel(this._from || Date.now())}`;
    const head = cardHeader(
      title,
      modeNav(this._mode, (m) => (this._mode = m)),
      periodNav(this, t, this._period, this._offset),
    );
    if (!b || (!b.pv && !b.imp && !b.house)) {
      return html`<ha-card>${head}<div class="empty">${this._loading ? t('en.loading') : t('en.no_data')}</div></ha-card>`;
    }
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
      ${head} ${this._mode === 'pln' ? this._pln(b) : this._kwh(b)} ${this._chart(b)}
    </ha-card>`;
  }

  private _kwh(b: Balance) {
    const t = this.t;
    const saldo = b.pv - b.house;
    // pokrycie bilansowe: produkcja / zuzycie (moze przekroczyc 100 %)
    const cov = b.house > 0 ? b.pv / b.house : 0;
    const gridShare = b.house > 0 ? b.gridHouse / b.house : 0;
    let verdict: TemplateResult;
    if (saldo >= 0) {
      verdict = html`<div class="vd ok">${t('en.v.self')} · ${t('en.v.surplus')} ${n1(saldo)} kWh</div>
        <div class="vs">
          ${t('en.v.produced')} ${n1(b.pv)} kWh, ${t('en.v.house_used')} ${n1(b.house)} kWh${b.gridHouse > 0.1
            ? html` · <span style="color:${GRID}">${t('en.v.grid_no_sun')} ${n1(b.gridHouse)} kWh</span>`
            : nothing}
        </div>`;
    } else if (gridShare < 0.05) {
      verdict = html`<div class="vd">${t('en.v.short')} ${n1(-saldo)} kWh</div>
        <div class="vs">${t('en.v.from_storage')} · ${t('en.v.grid_only')} ${n1(b.gridHouse)} kWh</div>`;
    } else {
      verdict = html`<div class="vd am">${t('en.v.grid')} ${pct(gridShare)} ${t('en.v.of_use')}</div>
        <div class="vs">${t('en.v.short')} ${n1(-saldo)} kWh · ${t('en.v.grid_took')} ${n1(b.gridHouse)} kWh</div>`;
    }
    const parts: Array<[number, string, string]> = [
      [b.pvHouse, PV, `PV ${n1(b.pvHouse)}`],
      [b.batHouse, BAT, `${t('en.storage')} ${n1(b.batHouse)} · ${pct(b.batHouse ? b.batHousePv / b.batHouse : 1)} ${t('en.from_pv')}`],
      [b.gridHouse, GRID, ''],
    ];
    const tot = parts.reduce((s, p) => s + p[0], 0) || 1;
    return html`
      <div class="top">
        <div>${verdict}</div>
        <div class="big"><span style="color:${cov >= 1 ? BAT : 'var(--av-value)'}">${pct(cov)}</span><span class="lbl">${t('en.coverage')}</span></div>
      </div>
      <hr />
      <div class="three">
        <div><span class="lbl">${t('en.pv')}</span><b style="color:${PV}">${n1(b.pv)}</b><small>kWh</small></div>
        <div><span class="lbl">${t('en.house')}</span><b>${n1(b.house)}</b><small>kWh</small></div>
        <div><span class="lbl">${t('en.saldo')}</span><b>${n1(saldo)}</b><small>kWh</small></div>
      </div>
      <div class="lbl">${t('en.house_from')}</div>
      <div class="stack">
        ${parts.map(([v, col, l]) => (v > 0 ? html`<i style="width:${(v / tot) * 100}%;background:${col}"><span>${(v / tot) * 100 > 18 ? l : ''}</span></i>` : nothing))}
      </div>
      <div class="row"><span class="sp"></span><span style="color:${GRID}">${t('en.grid')} ${n1(b.gridHouse)} kWh</span></div>
      <hr />
      <div class="row">
        <span class="lbl">${t('en.storage')}</span>${t('en.charge')} ${n1(b.bin)} · ${t('en.discharge')} ${n1(b.bout)} kWh
        <span class="sp"></span><span class="lbl">${t('en.content')}</span>
        <span class="tank"
          ><i style="width:${b.tankPv * 100}%;background:${PV}"></i><i style="width:${b.tankGrid * 100}%;background:${GRID}"></i
          ><i style="width:${b.tankUnknown * 100}%;background:#5a5a5a"></i
        ></span>
        ${pct(b.tankPv)} ${t('en.from_pv')} · ${pct(b.tankGrid)} ${t('en.from_grid_s')}${b.tankUnknown > 0.005 ? ` · ${pct(b.tankUnknown)} ${t('en.unknown')}` : ''}
      </div>
      <div class="row"><span class="lbl">${t('en.trade')}</span>${t('en.bought_storage')} ${n1(b.gridBat)} kWh · ${t('en.sold_storage')} ${n1(b.batGrid)} kWh</div>
      <div class="row"><span class="lbl">${t('en.inverter')}</span>${t('en.losses')} ${n1(b.loss)} kWh</div>
      <hr />
      <div class="row"><span class="lbl wide">${t('en.coverage')}</span><b style="color:${cov >= 1 ? BAT : 'var(--av-value)'}">${pct(cov)}</b><span class="dim small">${t('en.coverage_desc')}</span></div>
      <div class="row"><span class="lbl wide">${t('en.traced')}</span><b>${pct(b.coverage)}</b><span class="dim small">${t('en.traced_desc')}</span></div>
      <div class="row"><span class="lbl wide">${t('en.ha_ss')}</span><b>${pct(b.haSelfSuff)}</b><span class="dim small">${t('en.ha_ss_desc')}</span></div>
      <div class="row">
        <span class="lbl">${t('en.from_grid')}</span>${t('en.house')} ${n1(b.gridHouse)} · ${t('en.storage')} ${n1(b.gridBat)} · ${t('en.total')} ${n1(b.imp)} kWh
        <span class="sp"></span><span class="lbl">${t('en.export')}</span>${n1(b.exp)} kWh
      </div>
    `;
  }

  private _pln(b: Balance) {
    const t = this.t;
    if (!b.costKnown) return html`<div class="empty">${t('en.no_prices')}</div>`;
    const grid = b.expRev - b.impCost;
    const kwh = b.exp - b.imp;
    const avgBuy = b.imp > 0 ? b.impCost / b.imp : 0;
    const avgSell = b.exp > 0 ? b.expRev / b.exp : 0;
    const batGain = b.batValueHouse + b.batValueGrid - b.batCostOut;
    const value = b.pvSelfGain + batGain;
    const split = this._split === 'split';
    return html`
      <div class="top">
        <div>
          <div class="vd ${grid >= 0 ? 'ok' : 'am'}">${grid >= 0 ? t('en.v.grid_plus') : t('en.v.grid_minus')} ${zl(grid)}</div>
          <div class="vs">
            ${kwh < 0 && grid >= 0 ? html`${t('en.v.despite')} ${n1(kwh)} kWh · ` : nothing}${t('en.v.bought_at')} ${n2(avgBuy)}, ${t('en.v.sold_at')}
            ${n2(avgSell)} zł/kWh
          </div>
        </div>
        <div class="big"><span class=${value >= 0 ? 'ok' : 'am'}>${zl(value)}</span><span class="lbl">${t('en.value')}</span></div>
      </div>
      <hr />
      <div class="row">
        <span class="lbl">${t('en.grid_account')}</span><span class="sp"></span>
        <span class="nav">
          <button class=${!split ? 'on' : ''} @click=${() => (this._split = 'total')}>${t('en.c.total')}</button>
          <button class=${split ? 'on' : ''} @click=${() => (this._split = 'split')}>${t('en.c.split')}</button>
        </span>
      </div>
      <div class="acc">
        <span class="lbl"></span><span class="lbl r">kWh</span><span class="lbl r">zł/kWh</span><span class="lbl r">${t('en.amount')}</span>
        <span>${t('en.bought')}</span><b class="r">${n1(b.imp)}</b><b class="r dim">${n2(avgBuy)}</b><b class="r">${zl(-b.impCost)}</b>
        ${split
          ? html`<span class="sub">· ${t('en.c.ec')}</span><span></span><span></span><span class="r sub">${zl(-b.impEc)}</span>
              <span class="sub">· ${t('en.c.dist')}</span><span></span><span></span><span class="r sub">${zl(-b.impDist)}</span>`
          : nothing}
        <span>${t('en.sold')}</span><b class="r">${n1(b.exp)}</b><b class="r dim">${n2(avgSell)}</b><b class="r ok">${zl(b.expRev)}</b>
        <span class="lbl">${t('en.saldo')}</span><b class="r">${n1(kwh)}</b><span></span><b class="r ${grid >= 0 ? 'ok' : 'am'}">${zl(grid)}</b>
      </div>
      <div class="row"><span class="dim small">${t('en.house_grid_cost')} ${n1(b.gridHouse)} kWh · ${zl(-b.houseGridCost)}</span></div>
      <hr />
      <div class="row"><span class="lbl">${t('en.gains')}</span><span class="sp"></span><span class="dim small">${t('en.gains_note')}</span></div>
      <div class="acc">
        <span class="lbl"></span><span class="lbl r">kWh</span><span class="lbl r">zł/kWh</span><span class="lbl r">${t('en.amount')}</span>
        ${gainRow(t('en.g.pv_home'), b.pvHouse, b.pvSelfGain)}
        ${gainRow(t('en.g.bat_home'), b.batHouse, b.batValueHouse)}
        ${gainRow(t('en.g.bat_sell'), b.batGrid, b.batValueGrid)}
        ${gainRow(t('en.g.bat_cost'), b.bout, -b.batCostOut)}
        <span class="lbl">${t('en.total')}</span><span></span><span></span><b class="r ${value >= 0 ? 'ok' : 'am'}">${zl(value)}</b>
      </div>
      <div class="row">
        <span class="dim small"
          >${t('en.tank_cost')} ${Number.isFinite(b.tankAvgCost) ? `${n2(b.tankAvgCost)} zł/kWh` : '—'}${b.socKnown ? '' : ` · ${t('en.no_soc')}`}</span
        >
      </div>
    `;
  }

  /** Dzien: godziny (zakup w dol, sprzedaz w gore, linia ceny sprzedazy); tydzien / miesiac: dni. */
  private _chart(b: Balance) {
    const t = this.t;
    const day = this._period === 'day';
    const buckets: Array<{ t: number; imp: number; exp: number; price?: number }> = [];
    if (day) buckets.push(...b.hours);
    else {
      const m = new Map<number, { t: number; imp: number; exp: number }>();
      for (const h of b.hours) {
        const d = new Date(h.t).setHours(0, 0, 0, 0);
        const e = m.get(d) ?? { t: d, imp: 0, exp: 0 };
        e.imp += h.imp;
        e.exp += h.exp;
        m.set(d, e);
      }
      buckets.push(...m.values());
    }
    if (!buckets.length) return nothing;
    const W = 600;
    const H = 90;
    const mid = 48;
    const mx = Math.max(0.1, ...buckets.map((x) => Math.max(x.imp, x.exp)));
    const bw = W / buckets.length;
    const inv = !!this._config?.invert_chart;
    const sc = 40 / mx;
    return html`<hr />
      <div class="row">
        <span class="lbl">${day ? t('en.hours') : t('en.days')}</span><span class="sp"></span>
        <span style="color:${GRID}">■ ${t('en.buy')}</span><span class="ok">■ ${t('en.sell')}</span>
      </div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${buckets.map((x, i) => {
          // domyslnie sprzedaz w gore, zakup w dol; invert_chart - odwrotnie (jak w panelu Energia), kolory bez zmian
          const up = inv ? x.imp : x.exp;
          const down = inv ? x.exp : x.imp;
          return svg`<rect x=${i * bw + 1} y=${mid} width=${Math.max(1, bw - 2)} height=${down * sc} fill=${inv ? BAT : GRID}></rect>
            <rect x=${i * bw + 1} y=${mid - up * sc} width=${Math.max(1, bw - 2)} height=${up * sc} fill=${inv ? GRID : BAT}></rect>`;
        })}
        <line x1="0" x2=${W} y1=${mid} y2=${mid} stroke="#3a3a3a"></line>
      </svg>
      <div class="ticks">
        ${buckets.map((x, i) =>
          (day ? i % 3 === 0 : buckets.length <= 7 || i % 5 === 0)
            ? html`<span style="left:${((i + 0.5) / buckets.length) * 100}%">${day ? String(new Date(x.t).getHours()).padStart(2, '0') : new Date(x.t).getDate()}</span>`
            : nothing,
        )}
      </div>`;
  }

  static styles = [
    tokens,
    tileBase,
    SHARED,
    css`
      .top {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }
      .vd {
        font-size: 24px;
        font-weight: 700;
        line-height: 1.1;
      }
      .vs {
        color: var(--av-dim);
        font-size: 13px;
        margin-top: 4px;
      }
      .big {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        font-size: 28px;
        font-weight: 700;
        white-space: nowrap;
      }
      .three {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        margin-bottom: 8px;
      }
      .three div {
        display: flex;
        flex-direction: column;
      }
      .three b {
        font-size: 22px;
      }
      .three small {
        color: var(--av-unit);
        font-size: 11px;
      }
      .stack {
        display: flex;
        height: 22px;
        margin-top: 4px;
        background: #1a1d21;
      }
      .stack i {
        position: relative;
        overflow: hidden;
      }
      .stack span {
        position: absolute;
        left: 6px;
        top: 4px;
        font-size: 11px;
        font-weight: 700;
        color: #000;
        white-space: nowrap;
        font-style: normal;
        text-shadow: none;
      }
      .tank {
        display: inline-flex;
        width: 120px;
        height: 10px;
        background: #1a1d21;
      }
      .lbl.wide {
        min-width: 200px;
      }
      .small {
        font-size: 11px;
        font-weight: 400;
      }
      .acc {
        display: grid;
        grid-template-columns: 1fr 70px 70px 100px;
        gap: 3px 10px;
        font-size: 14px;
        font-weight: 700;
      }
      .r {
        text-align: right;
      }
      .sub {
        color: var(--av-dim);
        font-size: 12px;
        font-weight: 400;
      }
      .chart {
        width: 100%;
        height: 90px;
        display: block;
      }
      .ticks {
        position: relative;
        height: 14px;
      }
      .ticks span {
        position: absolute;
        transform: translateX(-50%);
        font-size: 10px;
        color: var(--av-dim);
      }
    `,
  ];
}

// =================== URZADZENIA ===================
export interface DevicesCardConfig extends EnergyBaseConfig {
  /** encje urzadzen; brak - z panelu Energia */
  entities?: Array<string | { entity: string; name?: string; color?: string }>;
  /** kolory na stale: encja -> kolor */
  colors?: Record<string, string>;
  layout?: 'bars' | 'pie';
  columns?: 'auto' | '1' | '2' | 1 | 2;
  /** urzadzenia zagniezdzone w innych (included_in_stat) - domyslnie pominiete */
  include_children?: boolean;
  /** "Pozostale" = dom minus suma urzadzen */
  show_other?: boolean;
}

/** Kolor staly dla encji: z identyfikatora (nie zalezy od kolejnosci ani liczby urzadzen). */
export function stableColor(id: string): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 12 wyraznie roznych odcieni x 2 jasnosci (sasiednie odcienie nie myla sie na wykresie)
  const hues = [0, 30, 55, 90, 140, 170, 195, 220, 250, 280, 310, 335];
  const u = h >>> 0;
  return `hsl(${hues[u % 12]} 72% ${u % 24 < 12 ? 58 : 72}%)`;
}

export class AvionicsDevicesCard extends EnergyBase<DevicesCardConfig> {
  @state() private _rows: Array<{ id: string; name: string; kwh: number; cost?: number; color: string }> = [];
  @state() private _layout: 'bars' | 'pie' = 'bars';
  @state() private _from = 0;
  static getConfigElement() {
    return document.createElement('avionics-devices-card-editor');
  }
  static getStubConfig() {
    return {};
  }
  getCardSize() {
    return 6;
  }
  setConfig(config: DevicesCardConfig): void {
    super.setConfig(config);
    this._layout = config.layout ?? 'bars';
  }
  private _list() {
    const c = this._config!;
    if (c.entities?.length) return c.entities.map((e) => (typeof e === 'string' ? { stat: e } : { stat: e.entity, name: e.name, color: e.color }));
    return (this._src?.devices ?? []).filter((d) => c.include_children || !d.parent).map((d) => ({ stat: d.stat, name: d.name, color: undefined as string | undefined }));
  }
  protected async load(hass: HomeAssistant, from: number, to: number) {
    const c = this._config!;
    const list = this._list();
    const ids = [...list.map((d) => d.stat), ...(c.house_entity ? [c.house_entity] : [])];
    const [st, pr] = await Promise.all([hourly(hass, ids, from, to, 'change'), this.prices(hass, from, to)]);
    const sum = (id: string) => [...(st[id]?.values() ?? [])].reduce((a, b) => a + b, 0);
    const cost = (id: string) => {
      if (!pr.has) return undefined;
      let z = 0;
      for (const [h, v] of st[id] ?? []) z += v * ((pr.ec(h) ?? 0) + (pr.dist(h) ?? 0));
      return z;
    };
    const rows = list.map((d) => ({
      id: d.stat,
      name: d.name ?? String(hass.states[d.stat]?.attributes?.friendly_name ?? d.stat),
      kwh: sum(d.stat),
      cost: cost(d.stat),
      color: (d as any).color ?? c.colors?.[d.stat] ?? stableColor(d.stat),
    }));
    if (c.show_other !== false && c.house_entity) {
      const house = sum(c.house_entity);
      const other = house - rows.reduce((a, r) => a + r.kwh, 0);
      const hc = cost(c.house_entity);
      if (other > 0.05)
        rows.push({ id: '_other', name: this.t('en.other'), kwh: other, cost: hc !== undefined ? hc - rows.reduce((a, r) => a + (r.cost ?? 0), 0) : undefined, color: '#5a5a5a' });
    }
    this._from = from;
    this._rows = rows.filter((r) => r.kwh > 0.005).sort((a, b) => (a.id === '_other' ? 1 : b.id === '_other' ? -1 : b.kwh - a.kwh));
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = this.t;
    const rows = this._rows;
    const pln = this._mode === 'pln' && rows.some((r) => r.cost !== undefined);
    const lay = (l: 'bars' | 'pie', s: string) => html`<button class=${this._layout === l ? 'on' : ''} @click=${() => (this._layout = l)}>${s}</button>`;
    const head = cardHeader(
      `${c.title ?? t('en.devices')} · ${this.periodLabel(this._from || Date.now())}`,
      html`<span class="nav">${lay('bars', '▤')}${lay('pie', '◔')}</span>${modeNav(this._mode, (m) => (this._mode = m))}`,
      periodNav(this, t, this._period, this._offset),
    );
    if (!rows.length) return html`<ha-card>${head}<div class="empty">${this._loading ? t('en.loading') : t('en.no_devices')}</div></ha-card>`;
    const total = rows.reduce((a, r) => a + r.kwh, 0);
    const totalCost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
    const colsCfg = String(c.columns ?? 'auto');
    const cols = colsCfg === '1' ? 1 : colsCfg === '2' || rows.length > 8 ? 2 : 1;
    const mx = Math.max(...rows.map((r) => r.kwh));
    const val = (r: (typeof rows)[number]) =>
      pln && r.cost !== undefined ? html`<b>${n1(r.kwh)}</b><span class="dim">${n2(r.cost)}</span>` : html`<b>${n1(r.kwh)}</b><span class="dim">${pct(r.kwh / total)}</span>`;
    const list = html`<div class="dl ${cols === 2 ? 'two' : ''}">
      ${rows.map(
        (r) => html`<div class="dr">
          <i class="sw" style="background:${r.color}"></i><span class="nm">${r.name}</span>
          ${this._layout === 'bars' ? html`<span class="bar"><i style="width:${(r.kwh / mx) * 100}%;background:${r.color}"></i></span>` : nothing}
          ${val(r)}
        </div>`,
      )}
    </div>`;
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
      ${head} ${this._layout === 'pie' ? html`<div class="pie-wrap">${this._pie(rows, total)}${list}</div>` : list}
      <hr />
      <div class="row"><span class="lbl">${t('en.total')}</span><span class="sp"></span><b>${n1(total)} kWh</b>${pln ? html`<b>${n2(totalCost)} zł</b>` : nothing}</div>
    </ha-card>`;
  }

  private _pie(rows: Array<{ kwh: number; color: string }>, total: number) {
    let a = -Math.PI / 2;
    const R = 46;
    const r0 = 28;
    const arcs = rows.map((r) => {
      const da = (r.kwh / total) * Math.PI * 2;
      const a1 = a + da;
      const big = da > Math.PI ? 1 : 0;
      const p = (rad: number, ang: number) => `${50 + rad * Math.cos(ang)},${50 + rad * Math.sin(ang)}`;
      const d = `M${p(R, a)} A${R},${R} 0 ${big} 1 ${p(R, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${big} 0 ${p(r0, a)} Z`;
      a = a1;
      return svg`<path d=${d} fill=${r.color} stroke="var(--av-bg, #000)" stroke-width="0.6"></path>`;
    });
    return html`<svg class="pie" viewBox="0 0 100 100">${arcs}
      <text x="50" y="49" text-anchor="middle" class="pt">${n1(total)}</text><text x="50" y="60" text-anchor="middle" class="pu">kWh</text>
    </svg>`;
  }

  static styles = [
    tokens,
    tileBase,
    SHARED,
    css`
      .dl {
        display: grid;
        grid-template-columns: 1fr;
        column-gap: 18px;
      }
      .dl.two {
        grid-template-columns: 1fr 1fr;
      }
      .dr {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr) minmax(40px, 0.8fr) 44px 46px;
        gap: 8px;
        align-items: center;
        padding: 4px 0;
        border-bottom: 1px solid rgba(140, 140, 140, 0.18);
        font-size: 13px;
        font-weight: 700;
      }
      .pie-wrap .dr {
        grid-template-columns: 10px minmax(0, 1fr) 44px 46px;
      }
      .sw {
        width: 10px;
        height: 10px;
      }
      .nm {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bar {
        height: 10px;
        background: #1a1d21;
      }
      .bar i {
        display: block;
        height: 100%;
      }
      .dr b,
      .dr .dim {
        text-align: right;
      }
      .dr .dim {
        font-size: 12px;
      }
      .pie-wrap {
        display: grid;
        grid-template-columns: minmax(120px, 34%) 1fr;
        gap: 16px;
        align-items: center;
      }
      .pie {
        width: 100%;
        max-width: 220px;
      }
      .pt {
        fill: var(--av-value);
        font-size: 14px;
        font-weight: 700;
      }
      .pu {
        fill: var(--av-unit);
        font-size: 7px;
      }
    `,
  ];
}
