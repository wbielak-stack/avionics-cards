import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { HomeAssistant, HassEntity } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num, PAIR_SEP } from '../../core/format';
import { formatValue } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { levelOf, type Level } from '../eis/config';
import { type ListCardConfig, type ListRowConfig, normalizeListRow } from './config';

const LEVEL_COLOR: Record<Level, string> = {
  ok: 'var(--av-value)',
  caution: 'var(--av-caution)',
  warning: 'var(--av-warning)',
  none: 'var(--av-value)',
};
const RANK: Record<Level, number> = { none: 0, ok: 1, caution: 2, warning: 3 };

export class AvionicsListCard extends LitElement {
  @state() private _config?: ListCardConfig;
  @state() private _rows: ListRowConfig[] = [];
  @state() private _styleMode: StyleMode = 'look';

  private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-list-card-editor');
  }

  /** Nowa karta startuje pusta. */
  static getStubConfig() {
    return { entities: [{ entity: '' }] };
  }

  setConfig(config: ListCardConfig): void {
    if (!Array.isArray(config.entities) || config.entities.length === 0) {
      throw new Error(localize(getLanguage(), 'eis.error.no_entities'));
    }
    this._config = config;
    this._rows = config.entities.map(normalizeListRow);
    this._key = '';
  }

  getCardSize(): number {
    return 1 + Math.ceil(this._rows.length / 2);
  }

  getGridOptions() {
    return { columns: 6, min_columns: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    const mode = readStyleMode(this);
    const ids = this._rows.flatMap((r) => [r.entity, r.entity2]).filter(Boolean) as string[];
    const key = ids.map((e) => hass.states[e]?.last_updated ?? '').join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Tekst jednej wartosci + jej poziom; nieliczbowe stany jak w HA. */
  private _one(r: ListRowConfig, id: string, ent?: HassEntity): { text: string; level: Level; numeric: boolean } {
    if (!ent || ent.state === 'unavailable' || ent.state === 'unknown') {
      return { text: '--', level: 'none', numeric: true };
    }
    const v = num(ent.state);
    if (!Number.isFinite(v)) {
      const f = (this._hass as any)?.formatEntityState;
      return { text: typeof f === 'function' ? f(ent) : ent.state, level: 'none', numeric: false };
    }
    return { text: formatValue(this._hass, id, v, r.precision, r.show_sign), level: levelOf(v, r), numeric: true };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = this._config;
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${c.title ? html`<div class="title">${c.title}</div>` : nothing}
        ${this._rows.map((r) => this._renderRow(r))}
      </ha-card>
    `;
  }

  private _renderRow(r: ListRowConfig) {
    if (!r.entity) {
      return html`<div class="row empty"><span class="lbl">${localize(getLanguage(this._hass), 'eis.choose_entity')}</span></div>`;
    }
    const st = this._hass!.states;
    const ent = st[r.entity];
    const a = this._one(r, r.entity, ent);
    const b = r.entity2 ? this._one(r, r.entity2, st[r.entity2]) : undefined;
    const lvl = b && RANK[b.level] > RANK[a.level] ? b.level : a.level;
    const missing = a.text === '--' && (!b || b.text === '--');
    // jednostka tylko dla wartosci liczbowych
    const unit = a.numeric ? r.unit ?? ent?.attributes?.unit_of_measurement ?? '' : '';
    const name = r.name ?? ent?.attributes?.friendly_name ?? r.entity;

    return html`
      <div class=${classMap({ row: true, sep: !!r.separator })} @click=${() => fireMoreInfo(this, r.entity!)}>
        <span class="lbl">${name}</span>
        <span
          class="val"
          style=${styleMap({ color: missing ? 'var(--av-dim)' : LEVEL_COLOR[lvl] })}
        >${b ? `${a.text}${PAIR_SEP}${b.text}` : a.text}${unit ? html`<span class="unit">${unit}</span>` : nothing}</span>
      </div>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 16px 10px;
      }
      .title {
        color: var(--av-label);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 2px;
        border-bottom: 1px solid var(--av-frame);
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        padding: 5px 0;
        cursor: pointer;
      }
      .row.sep {
        border-top: 1px solid var(--av-frame);
        margin-top: 6px;
        padding-top: 10px;
      }
      .lbl {
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .row.empty .lbl {
        color: var(--av-dim);
      }
      .val {
        font-size: 20px;
        font-weight: 700;
        white-space: nowrap;
      }
      .val .unit {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 4px;
      }
    `,
  ];
}
