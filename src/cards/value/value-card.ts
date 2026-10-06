import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { resolveZones, inverseWanted, levelStyle } from '../../core/zone-extras';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num, PAIR_SEP } from '../../core/format';
import { entityPrecision } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { fetchNumericHistory, type Point } from '../../core/history';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { buildSpark } from '../../core/sparkline';
import { gridValues, gridSvg } from '../../core/grid';
import { levelOf, type Level } from '../eis/config';
import { type ValueCardConfig, normalizeValueConfig } from './config';

const HISTORY_REFRESH_MS = 10 * 60 * 1000;
const LIVE_POINT_GAP_MS = 60 * 1000;

const LEVEL_COLOR: Record<Level, string> = {
  ok: 'var(--av-value)',
  caution: 'var(--av-caution)',
  warning: 'var(--av-warning)',
  none: 'var(--av-value)',
};

export class AvionicsValueCard extends LitElement {
  @state() private _config?: ValueCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _points: Point[] = [];

  private _hass?: HomeAssistant;
  private _key = '';
  private _lastFetch = 0;

  static getConfigElement() {
    return document.createElement('avionics-value-card-editor');
  }

  /** Nowa karta startuje pusta. */
  static getStubConfig() {
    return { entity: '' };
  }

  setConfig(config: ValueCardConfig): void {
    this._config = normalizeValueConfig(config);
    this._points = [];
    this._lastFetch = 0;
    this._key = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, rows: 3, min_columns: 4, min_rows: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c?.entity) {
      this.requestUpdate();
      return;
    }
    if (c.show_graph && Date.now() - this._lastFetch > HISTORY_REFRESH_MS) {
      this._lastFetch = Date.now();
      void this._loadHistory();
    }
    const mode = readStyleMode(this);
    const ids = [c.entity, c.footer_entity, c.footer_entity2];
    const key = ids.map((e) => (e ? hass.states[e]?.last_updated ?? '' : '')).join('|')
      + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this._appendLive();
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Wartosc po mnozniku (ze znakiem). */
  private _value(): number {
    const c = this._config!;
    return num(this._hass?.states[c.entity!]?.state) * (c.multiplier ?? 1);
  }

  private async _loadHistory(): Promise<void> {
    const c = this._config;
    if (!c?.entity || !this._hass) return;
    const pts = await fetchNumericHistory(this._hass, c.entity, c.hours_to_show!);
    const m = c.multiplier ?? 1;
    this._points = pts.map((p): Point => [p[0], p[1] * m]);
  }

  private _appendLive(): void {
    const v = this._value();
    if (!Number.isFinite(v)) return;
    const now = Date.now();
    const last = this._points[this._points.length - 1];
    if (!last || last[1] !== v || now - last[0] > LIVE_POINT_GAP_MS) this._points = [...this._points, [now, v]];
  }

  /**
   * Precyzja wartosci glownej: konfiguracja -> encja; przy mnozniku
   * (np. W -> kW) precyzja encji nie ma sensu, wiec domyslnie 2 miejsca.
   */
  private _digits(): number {
    const c = this._config!;
    if (typeof c.precision === 'number') return c.precision;
    if ((c.multiplier ?? 1) !== 1) return 2;
    return entityPrecision(this._hass, c.entity!);
  }

  private _fmt(v: number, digits: number, sign = false): string {
    if (!Number.isFinite(v)) return '--,-';
    const s = v.toFixed(digits).replace('.', ',');
    return sign && v > 0 ? `+${s}` : s;
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);

    if (!c.entity) {
      return html`<ha-card><div class="empty">${t('eis.choose_entity')}</div></ha-card>`;
    }

    const st = this._hass.states;
    const ent = st[c.entity];
    const v = this._value();
    const failed = !Number.isFinite(v);
    const shown = c.abs_value ? Math.abs(v) : v;
    const lvl = levelOf(shown, resolveZones(this._hass, c));
    const inv = inverseWanted(this, (c as any).warning_inverse);
    const unit = c.unit ?? ent?.attributes?.unit_of_measurement ?? '';

    return html`
      <ha-card
        class=${classMap({ 'true-style': this._styleMode === 'true' })}
        @click=${() => fireMoreInfo(this, c.entity!)}
      >
        ${c.show_graph ? this._renderGraph() : nothing}
        <div class="grid">
          <div class="name">${c.name ?? ent?.attributes?.friendly_name ?? ''}</div>
          <div class="status">${failed ? nothing : this._renderStatus(v)}</div>
          <div class=${classMap({ value: true, na: failed })}>
            <span class="v" style=${failed ? 'color:var(--av-dim)' : levelStyle(LEVEL_COLOR[lvl], lvl === 'warning', inv)}
              >${this._fmt(shown, this._digits(), c.show_sign)}</span
            >${unit ? html`<span class="u">${unit}</span>` : nothing}
          </div>
          <div class=${classMap({ rule: true, hidden: c.show_footer === false })}></div>
          <div class=${classMap({ foot: true, hidden: c.show_footer === false })}>${this._renderFooter()}</div>
        </div>
      </ha-card>
    `;
  }

  private _renderStatus(v: number) {
    const c = this._config!;
    if (!c.status_positive && !c.status_negative) return nothing;
    const db = Math.abs(c.deadband ?? 0);
    if (v > db && c.status_positive) {
      return html`<span style="color:var(--av-ok)">▲ ${c.status_positive}</span>`;
    }
    if (v < -db && c.status_negative) {
      return html`<span style="color:var(--av-value)">▼ ${c.status_negative}</span>`;
    }
    return html`<span style="color:var(--av-status)">${c.status_zero ?? '—'}</span>`;
  }

  private _renderFooter() {
    const c = this._config!;
    const st = this._hass!.states;
    // sama etykieta (bez encji) dziala jako opis kafla
    if (!c.footer_entity) {
      return c.footer_name ? html`<span class="lbl">${c.footer_name}</span>` : nothing;
    }
    const one = (id: string) => {
      const x = num(st[id]?.state);
      const d = typeof c.footer_precision === 'number' ? c.footer_precision : entityPrecision(this._hass, id);
      return Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '--';
    };
    const text = c.footer_entity2 ? `${one(c.footer_entity)}${PAIR_SEP}${one(c.footer_entity2)}` : one(c.footer_entity);
    const label = c.footer_name ?? st[c.footer_entity]?.attributes?.friendly_name ?? '';
    return html`<span class="lbl">${label}</span><span class="fval">${text}</span>`;
  }

  private _renderGraph() {
    const c = this._config!;
    const end = Date.now();
    const spark = buildSpark(this._points, end - c.hours_to_show! * 3600e3, end, c.graph_min_range!);
    if (!spark) return nothing;
    return html`
      <svg class="graph" viewBox="0 0 100 40" preserveAspectRatio="none">
        ${gridSvg(
          gridValues(spark.lo, spark.hi, { mode: c.graph_grid ?? 'off', step: c.graph_grid_step }),
          (v) => 40 - ((v - spark.lo) / (spark.hi - spark.lo)) * 40,
          100,
        )}
        <path d=${spark.area} fill=${c.graph_color!} fill-opacity="0.35" stroke="none"></path>
        <path
          d=${spark.line}
          fill="none"
          stroke=${c.graph_color!}
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          stroke-linejoin="round"
        ></path>
        ${spark.zeroY !== undefined
          ? html`<line
              x1="0"
              x2="100"
              y1=${spark.zeroY}
              y2=${spark.zeroY}
              stroke="var(--av-value)"
              stroke-width="1"
              stroke-dasharray="2 2"
              vector-effect="non-scaling-stroke"
            ></line>`
          : nothing}
      </svg>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        min-height: 178px;
        padding: 10px 16px;
        cursor: pointer;
      }
      .empty {
        color: var(--av-dim);
        padding: 8px 0;
      }
      /* wykres konczy sie na kresce: padding 10 + stopka 30 + kreska 1 + marginesy 10 */
      svg.graph {
        position: absolute;
        left: 0;
        right: 0;
        top: 34px;
        width: 100%;
        height: calc(100% - 85px);
        opacity: 0.35;
        pointer-events: none;
        z-index: 0;
      }
      .grid {
        position: relative;
        z-index: 1;
        height: 100%;
        display: grid;
        grid-template-areas: 'name status' 'value value' 'rule rule' 'foot foot';
        grid-template-columns: 1fr auto;
        grid-template-rows: min-content 1fr min-content min-content;
      }
      .name {
        grid-area: name;
        color: var(--av-label);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .status {
        grid-area: status;
        justify-self: end;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
      }
      .value {
        grid-area: value;
        align-self: center;
        font-size: 54px;
        font-weight: 700;
        line-height: 1;
      }
      .value .u {
        font-size: 20px;
        color: var(--av-unit);
        margin-left: 8px;
      }
      .rule {
        grid-area: rule;
        height: 1px;
        background: var(--av-frame);
        margin: 6px 0 4px;
      }
      .foot {
        grid-area: foot;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .foot .lbl {
        font-size: 14px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .fval {
        font-size: 22px;
        font-weight: 700;
        white-space: nowrap;
      }
    `,
  ];
}
