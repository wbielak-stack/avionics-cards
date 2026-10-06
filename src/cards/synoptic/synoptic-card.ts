import { LitElement, html, svg, nothing, css, type TemplateResult, type SVGTemplateResult } from 'lit';
import { cardHeader } from '../../core/header';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { attrNum } from '../../core/attr';
import type { SynopticCardConfig, SynopticNode } from './config';

const W = 640;
const ROW = 70;
const ROW_DETAIL = 76; // gdy wezly maja linie napiecia / pradu
const TOP = 32; // tylko miejsce na podpisy szyn
const OK = 'var(--av-ok)';
const RD = 'var(--av-warning)';
const DIM = '#5a5a5a';
const pad = (n: number) => String(n).padStart(2, '0');

interface Placed extends SynopticNode {
  p: number; // moc w jednostce karty, znak wg rodzaju
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'left' | 'right';
}

/**
 * Synoptyka elektryczna jak na stronach systemow G3000: szyna DC (PV, magazyn), falownik, szyna AC
 * (dom, sieć, EV). Linie zasilane zielone ze strzalka kierunku, bez przeplywu szare przerywane,
 * siec przez stycznik (otwarty przy braku sieci - EPS).
 */
export class AvionicsSynopticCard extends LitElement {
  @state() private _config?: SynopticCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-synoptic-card-editor');
  }

  static getStubConfig() {
    return {
      nodes: [
        { name: 'PV', kind: 'source', entity: '' },
        { name: 'GRID', kind: 'grid', entity: '' },
        { name: 'HOUSE', kind: 'load', entity: '' },
      ],
    };
  }

  setConfig(config: SynopticCardConfig): void {
    const nodes = config.nodes ?? (config as any).entities;
    if (!Array.isArray(nodes)) throw new Error(localize(getLanguage(), 'syn.error.no_nodes'));
    // wiersz dodany w edytorze moze nie miec jeszcze rodzaju - domyslnie odbiornik
    this._config = { ...config, nodes: nodes.map((n: SynopticNode) => ({ ...n, kind: n.kind ?? 'load', name: n.name ?? '' })) };
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
    const ids = [
      ...c.nodes.flatMap((n) => [n.entity, n.entity_negative, n.soc_entity, n.available_entity, n.connected_entity]),
      c.inverter?.entity,
      c.inverter?.temp_entity,
      c.endurance_entity,
    ];
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

  private _p(n: SynopticNode): number {
    if (!n.entity && !n.entity_negative) return NaN;
    const st = (id?: string) => (id ? num(this._hass!.states[id]?.state) : 0);
    // osobne encje kierunkow: moc = dodatnia - ujemna (brak jednej z nich = 0)
    const pos = n.entity ? st(n.entity) : 0;
    const neg = n.entity_negative ? st(n.entity_negative) : 0;
    if (!Number.isFinite(pos) && !Number.isFinite(neg)) return NaN;
    const v = ((Number.isFinite(pos) ? pos : 0) - (Number.isFinite(neg) ? neg : 0)) * (n.multiplier ?? 1);
    return n.invert ? -v : v;
  }

  private _fmt(v: number): string {
    return Number.isFinite(v) ? Math.abs(v).toFixed(2).replace('.', ',') : '--';
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const unit = c.unit ?? 'kW';
    const db = c.deadband ?? 0.02;
    const inv = c.inverter;
    const hasInv = !!inv;
    const busOf = (n: SynopticNode) => n.bus ?? (hasInv && (n.kind === 'source' || n.kind === 'storage') ? 'dc' : 'ac');

    // siec: obecnosc
    const grid = c.nodes.find((n) => n.kind === 'grid');
    const gridDown =
      !!grid?.connected_entity && this._hass.states[grid.connected_entity]?.state !== (grid.connected_state ?? 'on');

    // rozmieszczenie: z falownikiem - DC po lewej, AC po prawej; bez - zrodla i magazyn po lewej, reszta po prawej
    const left = c.nodes.filter((n) => (hasInv ? busOf(n) === 'dc' : n.kind === 'source' || n.kind === 'storage'));
    const right = c.nodes
      .filter((n) => !left.includes(n))
      .sort((a, b) => (a.kind === 'grid' ? -1 : b.kind === 'grid' ? 1 : 0));
    const L = this._layout();
    const { rows, rowH, H, top } = L;
    this._H = H;
    // szyny blizej srodka - miejsce na linie i stycznik sieci miedzy wezlem a szyna
    const busL = hasInv ? 196 : 320;
    const busR = hasInv ? 444 : 320;
    const place = (list: SynopticNode[], side: 'left' | 'right'): Placed[] =>
      list.map((n, i) => {
        const detail = n.voltage_entity || n.current_entity ? 14 : 0;
        const h = (n.kind === 'storage' ? 62 : 52) + detail;
        return { ...n, p: this._p(n), side, w: side === 'left' ? 120 : 122, h, x: side === 'left' ? 20 : W - 20 - 122, y: top + i * rowH + (rowH - h) / 2 - 8 };
      });
    const nodes = [...place(left, 'left'), ...place(right, 'right')];
    const maxP = Math.max(0.5, ...nodes.map((n) => (Number.isFinite(n.p) ? Math.abs(n.p) : 0)));
    const width = (p: number) => 2 + 3 * Math.min(Math.abs(p) / maxP, 1);

    const lines: SVGTemplateResult[] = [];
    const boxes: TemplateResult[] = [];
    for (const n of nodes) {
      const cy = n.y + n.h / 2;
      const bx = n.side === 'left' ? busL - 5 : busR + 5;
      const nx = n.side === 'left' ? n.x + n.w : n.x;
      const off =
        n.kind === 'load' &&
        !!n.available_entity &&
        ['off', 'unavailable', 'not_home'].includes(this._hass.states[n.available_entity]?.state ?? '');
      const active = Number.isFinite(n.p) && Math.abs(n.p) > db && !off && !(n.kind === 'grid' && gridDown);
      // kierunek: do szyny (zrodlo +, magazyn rozladowanie, siec import) albo od szyny
      const toBus = n.kind === 'source' ? n.p > 0 : n.kind === 'load' ? n.p < 0 : n.kind === 'storage' ? n.p < 0 : n.p > 0;
      // zasilana linia zawsze zielona (jak w synoptykach) - kierunek pokazuje strzalka
      const color = n.kind === 'grid' && gridDown ? RD : !active ? DIM : OK;
      const [from, to] = toBus ? [nx, bx] : [bx, nx];
      if (n.kind === 'grid') {
        // stycznik w polowie linii
        const mid = (nx + bx) / 2;
        const a = Math.min(nx, bx);
        const b = Math.max(nx, bx);
        lines.push(this._seg(a, mid - 13, cy, color, active ? width(n.p) : 2, !active, false));
        lines.push(this._seg(mid + 13, b, cy, color, active ? width(n.p) : 2, !active, false));
        lines.push(this._breaker(mid - 13, cy, !gridDown, gridDown ? RD : active ? OK : '#9a9a9a'));
        if (active) lines.push(this._arrow((from + to) / 2 + (toBus === (n.side === 'right') ? 18 : -18), cy, from < to ? 1 : -1, color));
      } else {
        lines.push(this._seg(from, to, cy, color, active ? width(n.p) : 2, !active, active));
      }
      boxes.push(this._box(n, off, gridDown, unit, t));
    }

    // falownik
    let invBox: TemplateResult | typeof nothing = nothing;
    if (inv) {
      const dcNet = left.reduce((s, n) => {
        const p = this._p(n);
        if (!Number.isFinite(p)) return s;
        return s + (n.kind === 'source' ? p : n.kind === 'storage' ? -p : 0);
      }, 0);
      const acOut = inv.entity ? num(this._hass.states[inv.entity]?.state) * (inv.multiplier ?? 1) : dcNet;
      const loss = inv.entity && Number.isFinite(acOut) ? dcNet - acOut : NaN;
      const temp = inv.temp_entity ? num(this._hass.states[inv.temp_entity]?.state) : NaN;
      const status = inv.status_entity ? this._hass.states[inv.status_entity]?.state : undefined;
      const eff = inv.efficiency_entity ? num(this._hass.states[inv.efficiency_entity]?.state) : NaN;
      const statusLine = [status && status !== 'unavailable' ? status : '', Number.isFinite(eff) ? `η ${eff.toFixed(1).replace('.', ',')} %` : '']
        .filter(Boolean)
        .join(' · ');
      const ih = 96 + (statusLine ? 16 : 0);
      const iy = top + (rows * rowH) / 2 - ih / 2 - 8;
      const cy = iy + ih / 2;
      const active = Math.abs(acOut) > db;
      const dir = acOut >= 0 ? 1 : -1;
      const colDc = !active ? DIM : OK;
      lines.push(this._seg(dir > 0 ? busL + 5 : 250, dir > 0 ? 250 : busL + 5, cy, colDc, active ? width(acOut) : 2, !active, active));
      lines.push(this._seg(dir > 0 ? 390 : busR - 5, dir > 0 ? busR - 5 : 390, cy, active ? OK : DIM, active ? width(acOut) : 2, !active, active));
      const sub = [
        Number.isFinite(temp) ? `${Math.round(temp)} °C` : '',
        gridDown ? 'EPS' : Number.isFinite(loss) && loss > 0 ? `${t('syn.loss')} ${this._fmt(loss)} ${unit}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      invBox = html`<div
        class=${classMap({ node: true, inv: true, eps: gridDown })}
        style="left:${(250 / W) * 100}%;top:${(iy / H) * 100}%;width:${(140 / W) * 100}%;height:${(ih / H) * 100}%"
        @click=${() => inv.entity && fireMoreInfo(this, inv.entity)}
      >
        <span class="nl">${inv.name ?? t('syn.inverter')}</span>
        <span class="nv">AC ${this._fmt(acOut)} <small>${unit}</small></span>
        ${sub ? html`<span class=${classMap({ ns: true, epst: gridDown })}>${sub}</span>` : nothing}
        ${statusLine ? html`<span class="ns st">${statusLine}</span>` : nothing}
        ${inv.model ? html`<span class="nm">${inv.model}</span>` : nothing}
      </div>`;
    }

    const busTop = top - 6;
    const busBot = top + rows * rowH - 10;
    // suma PV nad lewa kolumna, informacje pod szynami
    const n2 = (id?: string) => (id ? num(this._hass!.states[id]?.state) : NaN);
    const f1 = (v: number) => v.toFixed(1).replace('.', ',');
    // moc w jednostce karty wg jednostki encji (W -> kW przy karcie w kW)
    const pw = (id?: string) => {
      const v = n2(id);
      const u = id ? String(this._hass!.states[id]?.attributes?.unit_of_measurement ?? '') : '';
      return u === 'W' && unit === 'kW' ? v / 1000 : u === 'kW' && unit === 'W' ? v * 1000 : v;
    };
    const pvP = pw(c.pv_power_entity);
    const pvE = n2(c.pv_energy_entity);
    // dolny blok: [etykieta, wartosc] w kolumnach pod lewa kolumna, szynami i prawa kolumna
    type Cell = [string, string];
    const pvCells: Cell[] = [];
    if (Number.isFinite(pvP)) pvCells.push(['PV Σ', `${this._fmt(pvP)} ${unit}`]);
    if (Number.isFinite(pvE)) pvCells.push([t('syn.today'), `${f1(pvE)} kWh`]);
    const dcV = n2(c.dc_voltage_entity);
    const dcI = n2(c.dc_current_entity);
    const dcP = pw(c.dc_power_entity);
    const fx = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',').replace('-', '−') : '');
    // tabelki pod szynami: jednostki w naglowku, wartosci wyrownane w kolumnach
    const cols = {
      v: !!(c.dc_voltage_entity || c.ac_voltage_entities?.length),
      a: !!(c.dc_current_entity || c.ac_current_entities?.length),
      p: !!(c.dc_power_entity || c.ac_power_entities?.length),
    };
    const dcRows: string[][] = c.dc_voltage_entity || c.dc_current_entity || c.dc_power_entity ? [['DC', fx(dcV, 1), fx(dcI, 1), fx(dcP, 2)]] : [];
    const acRows: string[][] = [];
    let acSum = 0;
    let acSumOk = (c.ac_power_entities?.length ?? 0) > 0;
    for (let k = 0; k < 3; k++) {
      const v = n2(c.ac_voltage_entities?.[k]);
      const a = n2(c.ac_current_entities?.[k]);
      const w = pw(c.ac_power_entities?.[k]);
      if (c.ac_power_entities?.[k]) {
        if (Number.isFinite(w)) acSum += w;
        else acSumOk = false;
      }
      if (c.ac_voltage_entities?.[k] || c.ac_current_entities?.[k] || c.ac_power_entities?.[k]) {
        acRows.push([`L${k + 1}`, fx(v, 0), fx(a, 1), fx(w, 2)]);
      }
    }
    const sumCells: Cell[] = acSumOk ? [['Σ L1–L3', `${this._fmt(acSum)} ${unit}`]] : [];
    const hdr = ['', cols.v ? 'V' : '', cols.a ? 'A' : '', cols.p ? unit : ''];
    const endur =
      gridDown && c.endurance_entity
        ? c.endurance_attribute
          ? attrNum(this._hass, c.endurance_entity, c.endurance_attribute)
          : num(this._hass.states[c.endurance_entity]?.state)
        : NaN;
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${cardHeader(c.title)}
        <div class="diagram" style="aspect-ratio:${W} / ${H}">
          <svg viewBox="0 0 ${W} ${H}">
            ${hasInv
              ? svg`<rect x=${busL - 5} y=${busTop} width="10" height=${busBot - busTop} class="bus"></rect>
                  <text x=${busL} y=${busTop - 8} class="bl">${t('syn.bus_dc')}</text>`
              : nothing}
            <rect x=${busR - 5} y=${busTop} width="10" height=${busBot - busTop} class="bus"></rect>
            <text x=${busR} y=${busTop - 8} class="bl">${t('syn.bus_ac')}</text>
            ${lines}
          </svg>
          ${boxes} ${invBox}
          ${this._cells(pvCells, 80, busBot, 1)} ${hasInv ? this._table(hdr, dcRows, cols, busL, busBot) : nothing}
          ${this._table(hdr, acRows, cols, busR, busBot)} ${this._cells(sumCells, W - 20 - 61, busBot, acRows.length >= 2 ? 2 : 1)}
          ${Number.isFinite(endur)
            ? html`<div class="endur">ENDUR ${Math.floor(endur)}:${pad(Math.round((endur % 1) * 60))} h</div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  /** Tabelka pod szyna: naglowek z jednostkami (cyjan), wiersze z etykieta (cyjan) i wartosciami (biale, do prawej). */
  private _table(hdr: string[], rows: string[][], cols: { v: boolean; a: boolean; p: boolean }, x: number, busBot: number) {
    if (!rows.length) return nothing;
    const keep = [true, cols.v, cols.a, cols.p];
    const pick = (r: string[]) => r.filter((_, i) => keep[i]);
    return html`<div class="tbl" style="left:${(x / W) * 100}%;top:${((busBot + 6) / this._H) * 100}%;grid-template-columns:repeat(${keep.filter(Boolean).length}, auto)">
      ${pick(hdr).map((h) => html`<span class="th">${h}</span>`)}
      ${rows.map((r) => pick(r).map((v, i) => html`<span class=${i === 0 ? 'cl' : 'td'}>${v}</span>`))}
    </div>`;
  }

  /** Kolumna dolnego bloku (HTML): etykieta (cyjan) + wartosc (biala), wysrodkowane na x; `offset` - od ktorej linii. */
  private _cells(cells: Array<[string, string]>, x: number, busBot: number, offset = 0) {
    const H = this._H;
    return cells.map(
      ([l, v], k) =>
        html`<div class="cell" style="left:${(x / W) * 100}%;top:${((busBot + 6 + (k + offset) * 15) / H) * 100}%">
          <span class="cl">${l}</span> ${v}
        </div>`,
    );
  }

  private _seg(x1: number, x2: number, y: number, col: string, w: number, dashed: boolean, arrow: boolean) {
    return svg`<line x1=${x1} x2=${x2} y1=${y} y2=${y} stroke=${col} stroke-width=${w} stroke-dasharray=${dashed ? '4 4' : 'none'}></line>
      ${arrow ? this._arrow((x1 + x2) / 2, y, x2 > x1 ? 1 : -1, col) : nothing}`;
  }

  private _arrow(x: number, y: number, dir: number, col: string) {
    return svg`<polygon points="${x + 7 * dir},${y} ${x - 5 * dir},${y - 6} ${x - 5 * dir},${y + 6}" fill=${col}></polygon>`;
  }

  /** Stycznik: zamkniety - ramie poziome, otwarty - podniesione. */
  private _breaker(x: number, y: number, closed: boolean, col: string) {
    return svg`<circle cx=${x} cy=${y} r="3" fill=${col}></circle><circle cx=${x + 26} cy=${y} r="3" fill=${col}></circle>
      <line x1=${x} y1=${y} x2=${closed ? x + 26 : x + 22} y2=${closed ? y : y - 13} stroke=${col} stroke-width="2.5"></line>`;
  }

  private _box(n: Placed, off: boolean, gridDown: boolean, unit: string, t: (k: string) => string) {
    const c = this._config!;
    const H = this._H;
    const style = `left:${(n.x / W) * 100}%;top:${(n.y / H) * 100}%;width:${(n.w / W) * 100}%;height:${(n.h / H) * 100}%`;
    const db = c.deadband ?? 0.02;
    const idle = !Number.isFinite(n.p) || Math.abs(n.p) <= db;
    let body: TemplateResult;
    let cls = '';
    if (n.kind === 'grid' && gridDown) {
      cls = 'down';
      body = html`<span class="nv red">${t('syn.no_grid')}</span>`;
    } else if (n.kind === 'grid') {
      body = idle
        ? html`<span class="nv dim">0</span>`
        : html`<span class="nv">${n.p > 0 ? t('syn.import') : t('syn.export')} ${this._fmt(n.p)} <small>${unit}</small></span>`;
    } else if (n.kind === 'storage') {
      const soc = n.soc_entity ? num(this._hass!.states[n.soc_entity]?.state) : NaN;
      const st = idle
        ? html`<span class="ns">—</span>`
        : n.p > 0
          ? html`<span class="ns" style="color:var(--av-ok)">▲ ${c.status_positive ?? t('syn.chg')} ${this._fmt(n.p)} ${unit}</span>`
          : html`<span class="ns" style="color:var(--av-value)">▼ ${c.status_negative ?? t('syn.dsg')} ${this._fmt(n.p)} ${unit}</span>`;
      body = html`${st}${Number.isFinite(soc) ? html`<span class="nv">SOC ${soc.toFixed(1).replace('.', ',')} %</span>` : nothing}`;
    } else if (off) {
      cls = 'off';
      body = html`<span class="nv dim small">${t('syn.disconnected')}</span>`;
    } else {
      if (idle && n.kind === 'source') cls = 'off';
      body = html`<span class="nv ${idle ? 'dim' : ''}">${this._fmt(n.p)} <small>${unit}</small></span>`;
    }
    const v = n.voltage_entity ? num(this._hass!.states[n.voltage_entity]?.state) : NaN;
    const a = n.current_entity ? num(this._hass!.states[n.current_entity]?.state) : NaN;
    const va = [Number.isFinite(v) ? `${v.toFixed(0)} V` : '', Number.isFinite(a) ? `${a.toFixed(1).replace('.', ',')} A` : '']
      .filter(Boolean)
      .join(' · ');
    return html`<div class="node ${cls}" style=${style} @click=${() => n.entity && fireMoreInfo(this, n.entity)}>
      <span class="nl">${n.name}</span>${body}${va ? html`<span class="va">${va}</span>` : nothing}
      ${n.kind === 'grid' && gridDown ? html`<svg class="xx" viewBox="0 0 10 10" preserveAspectRatio="none"><line x1="0" y1="0" x2="10" y2="10"></line><line x1="10" y1="0" x2="0" y2="10"></line></svg>` : nothing}
    </div>`;
  }

  private _H = 400;

  /** Uklad: liczba wierszy, wysokosc wiersza, miejsce pod szynami, calkowita wysokosc. */
  private _layout() {
    const c = this._config!;
    const hasInv = !!c.inverter;
    const busOf = (n: SynopticNode) => n.bus ?? (hasInv && (n.kind === 'source' || n.kind === 'storage') ? 'dc' : 'ac');
    const left = c.nodes.filter((n) => (hasInv ? busOf(n) === 'dc' : n.kind === 'source' || n.kind === 'storage'));
    const rows = Math.max(left.length, c.nodes.length - left.length, hasInv ? 3 : 1);
    const rowH = c.nodes.some((n) => n.voltage_entity || n.current_entity) ? ROW_DETAIL : ROW;
    const grid = c.nodes.find((n) => n.kind === 'grid');
    const gridDown = !!grid?.connected_entity && this._hass!.states[grid.connected_entity]?.state !== (grid.connected_state ?? 'on');
    // linie pod szynami: DC jedna, AC do trzech
    const acN = Math.max(c.ac_voltage_entities?.length ?? 0, c.ac_current_entities?.length ?? 0, c.ac_power_entities?.length ?? 0);
    const dcN = c.dc_voltage_entity || c.dc_current_entity || c.dc_power_entity ? 1 : 0;
    const pvN = (c.pv_power_entity ? 1 : 0) + (c.pv_energy_entity ? 1 : 0);
    const tableLines = Math.max(acN, dcN) ? Math.min(Math.max(acN, dcN), 3) + 1 : 0; // + naglowek jednostek
    const lines = Math.max(tableLines, pvN ? pvN + 1 : 0);
    const under = lines ? lines * 15 + 10 : 0;
    const top = TOP;
    const H = top + rows * rowH + under + (gridDown && c.endurance_entity ? 30 : 6);
    return { rows, rowH, H, top };
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 10px;
        container-type: inline-size;
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 4px;
        border-bottom: 1px solid var(--av-frame);
      }
      .diagram {
        position: relative;
        width: 100%;
      }
      .diagram > svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .bus {
        fill: var(--av-value);
      }
      .bl {
        fill: var(--av-dim);
        font-size: 10px;
        text-anchor: middle;
        font-family: var(--av-font);
      }
      .node {
        position: absolute;
        box-sizing: border-box;
        border: 1.5px solid var(--av-frame);
        background: #000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1px;
        cursor: pointer;
        overflow: hidden;
      }
      .node.off {
        border-color: #5a5a5a;
      }
      .node.amb,
      .node.eps {
        border-color: var(--av-caution);
      }
      .node.down {
        border-color: var(--av-warning);
      }
      .nl {
        color: var(--av-label);
        font-size: clamp(9px, 1.8cqi, 13px);
        font-weight: 700;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .nv {
        font-size: clamp(11px, 2.6cqi, 17px);
        font-weight: 700;
        white-space: nowrap;
      }
      .nv small {
        font-size: 0.65em;
        color: var(--av-unit);
      }
      .nv.small {
        font-size: clamp(9px, 1.9cqi, 13px);
      }
      .nv.dim,
      .node.off .nv {
        color: #5a5a5a;
      }
      .nv.red {
        color: var(--av-warning);
      }
      .ns {
        font-size: clamp(9px, 1.9cqi, 13px);
        font-weight: 700;
        white-space: nowrap;
        color: var(--av-dim);
      }
      .ns.epst {
        color: var(--av-caution);
      }
      .va {
        font-size: clamp(8px, 1.6cqi, 11px);
        color: var(--av-dim);
        white-space: nowrap;
      }
      .ns.st {
        color: var(--av-value);
      }
      .pvs {
        fill: var(--av-value);
        font-size: 12px;
        font-weight: 700;
        text-anchor: start;
        font-family: var(--av-font);
      }
      .bi {
        fill: var(--av-value);
        font-size: 11px;
        font-weight: 700;
        text-anchor: middle;
        font-family: var(--av-font);
      }
      .bl2 {
        fill: var(--av-label);
      }
      .cell {
        position: absolute;
        transform: translateX(-50%);
        white-space: nowrap;
        font-size: clamp(8px, 1.75cqi, 12px);
        font-weight: 700;
        line-height: 1.2;
        color: var(--av-value);
      }
      .cl {
        color: var(--av-label);
      }
      .tbl {
        position: absolute;
        transform: translateX(-50%);
        display: grid;
        column-gap: clamp(4px, 1.2cqi, 9px);
        font-size: clamp(8px, 1.75cqi, 12px);
        font-weight: 700;
        line-height: 1.25;
        white-space: nowrap;
      }
      .th {
        color: var(--av-label);
        text-align: right;
        font-weight: 400;
      }
      .td {
        color: var(--av-value);
        text-align: right;
      }
      .nm {
        font-size: clamp(8px, 1.5cqi, 10px);
        color: var(--av-dim);
      }
      .xx {
        position: absolute;
        inset: 3px;
        width: calc(100% - 6px);
        height: calc(100% - 6px);
        pointer-events: none;
      }
      .xx line {
        stroke: var(--av-warning);
        stroke-width: 0.4;
        vector-effect: non-scaling-stroke;
      }
      .endur {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 2px;
        text-align: center;
        color: var(--av-caution);
        font-weight: 700;
        font-size: clamp(10px, 2cqi, 14px);
      }
    `,
  ];
}
