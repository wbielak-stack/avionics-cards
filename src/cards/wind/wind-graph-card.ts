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
import { type WindCardConfig, normalizeWind } from './config';
import { resolveWind } from './resolve';
import '../weather/wind-graph-el';

/** Samodzielny wykres wiatru: slupki godzinowe z pomiaru i prognozy. */
export class AvionicsWindGraphCard extends LitElement {
  @state() private _config?: WindCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-wind-graph-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config: WindCardConfig): void {
    this._config = normalizeWind(config);
    this._key = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 4, min_columns: 6, min_rows: 3 };
  }

  set hass(hass: HomeAssistant) {
    const c = this._config;
    if (!c) {
      this._hass = hass;
      return;
    }
    const e = resolveWind(hass, c);
    const mode = readStyleMode(this);
    const key = [e.speed, e.gust].map((id) => (id ? hass.states[id]?.last_updated : '')).join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key && this._hass) return;
    this._key = key;
    this._styleMode = mode;
    this._hass = hass;
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    const hass = this._hass;
    if (!c || !hass) return nothing;
    const t = (k: string) => localize(getLanguage(hass), k);
    const e = resolveWind(hass, c);
    if (!e.speed) return html`<ha-card><div class="empty">${t('weather.no_data')}</div></ha-card>`;
    const st = hass.states;
    const v = num(st[e.speed]?.state);
    const g = e.gust ? num(st[e.gust]?.state) : NaN;
    const unit = st[e.speed]?.attributes?.unit_of_measurement ?? '';
    const d = entityPrecision(hass, e.speed);
    const f = (x: number) => x.toFixed(d).replace('.', ',');
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        <div class="head" @click=${() => fireMoreInfo(this, e.speed!)}>
          <span class="name">${c.name ?? t('weather.wind')}</span>
          <span class="val"
            >${Number.isFinite(v) ? f(v) : '--'}<span class="u">${unit}</span>${Number.isFinite(g)
              ? html`<span class="g">G ${f(g)}</span>`
              : nothing}</span
          >
        </div>
        <avionics-wind-graph-el
          .hass=${hass}
          .speedEntity=${e.speed}
          .gustEntity=${e.gust}
          .dirEntity=${e.direction}
          .forecastEntity=${c.forecast_entity}
          .hoursBack=${c.hours_back ?? 12}
          .hoursForward=${c.forecast_entity ? c.hours_forward ?? 12 : 0}
          .caution=${num(c.wind_caution)}
          .warning=${num(c.wind_warning)}
          .arrowTo=${c.wind_arrow === 'to'}
          .rotation=${c.rotation ?? 0}
          .unit=${unit}
          .grid=${c.grid ?? 'nice'}
          .gridStep=${num(c.grid_step)}
          .yMax=${num(c.y_max)}
        ></avionics-wind-graph-el>
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
        gap: 8px;
        cursor: pointer;
      }
      .name {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
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
      .g {
        font-size: 14px;
        margin-left: 10px;
      }
      avionics-wind-graph-el {
        flex: 1 1 auto;
        min-height: 150px;
      }
    `,
  ];
}
