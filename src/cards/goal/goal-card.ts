import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { TemplateSubscriptions } from '../../core/templates';
import { readSource, type NumberSource } from '../../core/value-source';
import { type GoalCardConfig, type GoalRowConfig, normalizeGoalRow } from './config';

const DAY = 86400e3;

/**
 * Postep do celu jak w kokpicie: resurs (zuzycie do limitu, jak TBO silnika) albo droga do celu
 * (jak lot: przebyte szare, pozostale magenta, DIS / GS / ETE / ETA).
 */
export class AvionicsGoalCard extends LitElement {
  @state() private _config?: GoalCardConfig;
  @state() private _rows: GoalRowConfig[] = [];
  @state() private _styleMode: StyleMode = 'look';
  private _hass?: HomeAssistant;
  private _key = '';
  private _tpl = new TemplateSubscriptions();

  static getConfigElement() {
    return document.createElement('avionics-goal-card-editor');
  }

  static getStubConfig() {
    return { entities: [{ name: 'GOAL', kind: 'goal' }] };
  }

  setConfig(config: GoalCardConfig): void {
    if (!Array.isArray(config.entities) || !config.entities.length) {
      throw new Error(localize(getLanguage(), 'eis.error.no_entities'));
    }
    this._config = config;
    this._rows = config.entities.map(normalizeGoalRow);
    this._tpl.clear();
    this._key = '';
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._tpl.clear();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._key = '';
    if (this._hass) this.hass = this._hass;
  }

  getCardSize(): number {
    return 1 + this._rows.length * 2;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    const upd = () => this.requestUpdate();
    this._rows.forEach((r, i) => {
      this._tpl.ensure(hass, `c${i}`, r.current_template, upd);
      this._tpl.ensure(hass, `t${i}`, r.target_template, upd);
      this._tpl.ensure(hass, `r${i}`, r.rate_template, upd);
      this._tpl.ensure(hass, `m${i}`, r.marker_template, upd);
    });
    const mode = readStyleMode(this);
    const ids = this._rows.flatMap((r) => [r.current_entity, r.target_entity, r.rate_entity, r.marker_entity]);
    const key = ids.map((id) => (id ? hass.states[id]?.last_updated ?? '' : '')).join('|')
      + `|${mode}|${getLanguage(hass)}|${new Date().toDateString()}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  private _src(i: number, k: 'c' | 't' | 'r' | 'm', s: NumberSource): number {
    return readSource(this._hass, this._tpl, `${k}${i}`, s);
  }

  private _fmt(r: GoalRowConfig, v: number): string {
    if (!Number.isFinite(v)) return '--';
    const d = typeof r.precision === 'number' ? r.precision : Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : 2;
    return v.toFixed(d).replace('.', ',');
  }

  /** Czas trwania w dniach -> "302 d" albo od 400 dni "~1,4 lat" (PL) / "~1.4 y". */
  private _ete(days: number, t: (k: string) => string): string {
    if (!Number.isFinite(days) || days < 0) return '—';
    if (days >= 400) return `~${(days / 365).toFixed(1).replace('.', ',')} ${t('goal.years')}`;
    return `${Math.ceil(days)} ${t('goal.days')}`;
  }

  /** Data dotarcia: dd.mm przy bliskiej, mm.rrrr przy dalekiej. */
  private _eta(days: number): string {
    if (!Number.isFinite(days) || days < 0) return '—';
    const d = new Date(Date.now() + days * DAY);
    const pad = (n: number) => String(n).padStart(2, '0');
    return days <= 60 ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : `${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = this._config;
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${c.title ? html`<div class="title">${c.title}</div>` : nothing}
        ${this._rows.map((r, i) => this._renderRow(r, i))}
      </ha-card>
    `;
  }

  private _renderRow(r: GoalRowConfig, i: number) {
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const cur = this._src(i, 'c', { entity: r.current_entity, attribute: r.current_attribute, template: r.current_template });
    const target = this._src(i, 't', { value: r.target, entity: r.target_entity, template: r.target_template });
    const start = r.start ?? 0;
    const unit = r.unit ?? (r.current_entity ? this._hass!.states[r.current_entity]?.attributes?.unit_of_measurement ?? '' : '');
    const u = unit ? ` ${unit}` : '';
    if (!Number.isFinite(cur) || !Number.isFinite(target) || target === start) {
      return html`<div class="row"><div class="head"><span class="lbl">${r.name ?? ''}</span><span class="v na">--</span></div></div>`;
    }
    const span = target - start;
    const frac = (cur - start) / span; // 1 = cel osiagniety
    const pctTotal = frac * 100;

    // tempo na dobe: encja/szablon albo od daty startu
    let rate = this._src(i, 'r', { entity: r.rate_entity, template: r.rate_template });
    if (!Number.isFinite(rate) && r.start_date) {
      const days = (Date.now() - Date.parse(r.start_date)) / DAY;
      if (days > 0) rate = (cur - start) / Math.max(days, 1);
    }

    const goal = r.kind !== 'limit';
    const laps = goal && frac >= 1 ? Math.floor(frac) : 0; // ile razy cel osiagniety
    const barFrac = goal ? (laps ? frac - laps : frac) : Math.min(frac, 1);
    const nextTarget = start + span * (laps + 1);
    const remaining = goal ? nextTarget - cur : target - cur;
    const eteDays = Number.isFinite(rate) && rate > 0 && remaining > 0 ? remaining / rate : NaN;

    // strefy resursu
    const ca = (r.caution_pct ?? 80) / 100;
    const wa = (r.warning_pct ?? 95) / 100;
    const over = !goal && frac >= 1;
    const curCol = goal ? 'var(--av-value)' : frac >= wa ? 'var(--av-warning)' : frac >= ca ? 'var(--av-caution)' : 'var(--av-value)';

    // znacznik: cel / wlasny punkt / brak
    const markerFrac =
      r.marker === 'off'
        ? NaN
        : r.marker === 'custom'
          ? (this._src(i, 'm', { value: r.marker_value, entity: r.marker_entity, template: r.marker_template }) - start) / span - laps
          : 1;
    const markerCol = r.marker === 'custom' && r.marker_color !== 'setpoint' ? 'var(--av-forecast)' : 'var(--av-setpoint)';
    const p = (f: number) => Math.min(Math.max(f, 0), 1) * 100;
    const target1 = r.current_entity || r.target_entity;

    return html`<div class="row" @click=${() => target1 && fireMoreInfo(this, target1)}>
      <div class="head">
        <span class="lbl">${r.name ?? ''}${laps ? html`<span class="done">${t('goal.reached')} ✓</span>` : nothing}</span>
        <span class="v" style="color:${curCol}">${this._fmt(r, cur)}<span class="u">${unit}</span></span>
      </div>
      <div class="sub">
        / ${goal ? '' : t('goal.limit') + ' '}${this._fmt(r, target)}${u} · ${pctTotal.toFixed(1).replace('.', ',')} %
      </div>
      <div class="bar">
        <div class="band"></div>
        ${goal
          ? html`<div class="seg done" style="left:0;width:${p(barFrac)}%"></div>
              <div class="seg togo" style="left:${p(barFrac)}%;width:${100 - p(barFrac)}%"></div>`
          : html`<div class="zone" style="left:${ca * 100}%;width:${(wa - ca) * 100}%;background:var(--av-caution)"></div>
              <div class="zone" style="left:${wa * 100}%;width:${(1 - wa) * 100}%;background:var(--av-warning)"></div>
              <div class="seg used" style="left:0;width:${p(barFrac)}%;${over ? 'background:var(--av-warning)' : ''}"></div>`}
        ${Number.isFinite(markerFrac) && markerFrac >= 0 && markerFrac <= 1
          ? html`<div class="mk tgt" style="left:${p(markerFrac)}%;border-top-color:${markerCol}"></div>`
          : nothing}
        <div class="mk cur" style="left:${p(barFrac)}%;border-top-color:${curCol}"></div>
      </div>
      ${goal
        ? html`<div class="nav">
            <div><span class="nl">DIS</span><span class="nv">${this._fmt(r, remaining)}${u}</span></div>
            <div><span class="nl">GS</span><span class="nv">${Number.isFinite(rate) ? `${this._fmt(r, rate)}${u}/${t('goal.day')}` : '—'}</span></div>
            <div><span class="nl">ETE</span><span class="nv fc">${this._ete(eteDays, t)}</span></div>
            <div><span class="nl">ETA</span><span class="nv fc">${this._eta(eteDays)}</span></div>
          </div>`
        : html`<div class="foot">
            <span style=${over ? 'color:var(--av-warning)' : ''}
              >${over
                ? `${t('goal.exceeded')} · ${pctTotal.toFixed(0)} %`
                : `${t('goal.remaining')} ${(100 - pctTotal).toFixed(1).replace('.', ',')} %`}</span
            >
            ${over || !Number.isFinite(eteDays)
              ? nothing
              : html`<span class="fc">ETE ${this._ete(eteDays, t)} · ETA ${this._eta(eteDays)}</span>`}
          </div>`}
    </div>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 6px;
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
      .row {
        padding: 8px 0 10px;
        cursor: pointer;
      }
      .row + .row {
        border-top: 1px solid rgba(140, 140, 140, 0.35);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 8px;
      }
      .lbl {
        color: var(--av-label);
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .done {
        margin-left: 8px;
        padding: 0 5px;
        background: var(--av-ok);
        color: #000;
        font-size: 11px;
      }
      .v {
        font-size: 20px;
        font-weight: 700;
        white-space: nowrap;
      }
      .v.na {
        color: var(--av-dim);
      }
      .u {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 3px;
      }
      .sub {
        text-align: right;
        font-size: 11px;
        color: var(--av-dim);
      }
      .bar {
        position: relative;
        height: 20px;
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
      .seg.done,
      .seg.used {
        background: var(--av-dim);
      }
      .seg.togo {
        background: var(--av-forecast);
      }
      .mk {
        position: absolute;
        top: 1px;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 8px solid var(--av-value);
        transform: translateX(-5px);
      }
      .nav {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 6px;
        margin-top: 4px;
      }
      .nav > div {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .nl {
        color: var(--av-label);
        font-size: 10px;
        font-weight: 700;
      }
      .nv {
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .fc {
        color: var(--av-forecast);
      }
      .foot {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 12px;
        color: var(--av-dim);
        margin-top: 2px;
      }
      .foot .fc {
        font-weight: 700;
      }
    `,
  ];
}
