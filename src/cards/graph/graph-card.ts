import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { entityPrecision } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { type GraphCardConfig, normalizeGraph, parseRanges } from './config';
import './graph-el';

export class AvionicsGraphCard extends LitElement {
  @state() private _config?: GraphCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-graph-card-editor');
  }

  static getStubConfig() {
    return { entity: '' };
  }

  setConfig(config: GraphCardConfig): void {
    this._config = normalizeGraph(config);
    this._key = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, rows: 4, min_columns: 4, min_rows: 3 };
  }

  set hass(hass: HomeAssistant) {
    const c = this._config;
    if (!c?.entity) {
      this._hass = hass;
      return;
    }
    const mode = readStyleMode(this);
    const key = `${hass.states[c.entity]?.last_updated}|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this._hass = hass;
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    if (!c.entity) {
      return html`<ha-card><div class="empty">${localize(getLanguage(this._hass), 'eis.choose_entity')}</div></ha-card>`;
    }
    const st = this._hass.states[c.entity];
    const v = num(st?.state) * (c.multiplier ?? 1);
    const digits =
      typeof c.precision === 'number' ? c.precision : (c.multiplier ?? 1) !== 1 ? 1 : entityPrecision(this._hass, c.entity);
    const unit = c.unit ?? st?.attributes?.unit_of_measurement ?? '';
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        <div class="head" @click=${() => fireMoreInfo(this, c.entity!)}>
          <span class="name">${c.name ?? st?.attributes?.friendly_name ?? ''}</span>
          <span class="val"
            >${Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '--'}<span class="u">${unit}</span></span
          >
        </div>
        <avionics-graph-el
          .hass=${this._hass}
          .entity=${c.entity}
          .ranges=${parseRanges(c.ranges)}
          .defaultRange=${c.default_range ?? 24}
          .scale=${c.scale ?? 'auto'}
          .span=${c.span ?? 20}
          .reference=${num(c.reference)}
          .referenceLabel=${c.reference_label ?? ''}
          .color=${c.color ?? '#00e5ff'}
          .colorMode=${c.graph_style ?? 'mono'}
          .multiplier=${c.multiplier ?? 1}
          .digits=${digits}
        ></avionics-graph-el>
      </ha-card>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 6px;
        display: flex;
        flex-direction: column;
      }
      .empty {
        color: var(--av-dim);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        cursor: pointer;
        gap: 8px;
      }
      .name {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .val {
        font-size: 24px;
        font-weight: 700;
        white-space: nowrap;
      }
      .u {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 4px;
      }
      avionics-graph-el {
        flex: 1 1 auto;
        margin-top: 2px;
      }
    `,
  ];
}
