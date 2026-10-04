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
import { compassPoint } from '../weather/fields';
import { type WindCardConfig, normalizeWind } from './config';
import { resolveWind } from './resolve';
import './wind-rose-el';

/** Samodzielna roza wiatru. */
export class AvionicsWindCard extends LitElement {
  @state() private _config?: WindCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  private _hass?: HomeAssistant;
  private _key = '';

  static getConfigElement() {
    return document.createElement('avionics-wind-card-editor');
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
    return { columns: 4, rows: 4, min_columns: 3, min_rows: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    const e = resolveWind(hass, c);
    const mode = readStyleMode(this);
    const key = [e.speed, e.direction, e.gust, c.forecast_entity].map((id) => (id ? hass.states[id]?.last_updated : '')).join('|')
      + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    const hass = this._hass;
    if (!c || !hass) return nothing;
    const t = (k: string) => localize(getLanguage(hass), k);
    const e = resolveWind(hass, c);
    if (!e.speed && !e.direction) return html`<ha-card><div class="empty">${t('weather.no_data')}</div></ha-card>`;
    const st = hass.states;
    const fmt = (id?: string) => {
      const v = id ? num(st[id]?.state) : NaN;
      return Number.isFinite(v) ? v.toFixed(entityPrecision(hass, id!)).replace('.', ',') : '';
    };
    const w = c.forecast_entity ? st[c.forecast_entity] : undefined;
    const fcDir = num(w?.attributes?.wind_bearing);
    const fcSpd = num(w?.attributes?.wind_speed);
    const fcText = Number.isFinite(fcDir)
      ? `${t('weather.forecast_short')} ${compassPoint(fcDir)}${
          Number.isFinite(fcSpd) ? ` ${fcSpd.toFixed(1).replace('.', ',')} ${w?.attributes?.wind_speed_unit ?? ''}` : ''
        }`
      : '';
    const target = e.speed || e.direction;
    return html`
      <ha-card
        class=${classMap({ 'true-style': this._styleMode === 'true' })}
        @click=${() => target && fireMoreInfo(this, target)}
      >
        ${c.name ? html`<div class="title">${c.name}</div>` : nothing}
        <avionics-wind-rose-el
          .bearing=${e.direction ? num(st[e.direction]?.state) : NaN}
          .speedText=${fmt(e.speed) || '--'}
          .unit=${e.speed ? st[e.speed]?.attributes?.unit_of_measurement ?? '' : ''}
          .gustText=${fmt(e.gust)}
          .fcDir=${fcDir}
          .fcText=${fcText}
          .arrowTo=${c.wind_arrow === 'to'}
          .rotation=${c.rotation ?? 0}
          .noDirLabel=${t('weather.wind')}
        ></avionics-wind-rose-el>
      </ha-card>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .empty {
        color: var(--av-dim);
      }
      .title {
        align-self: stretch;
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        text-align: center;
        margin-bottom: 4px;
      }
      avionics-wind-rose-el {
        width: 100%;
        max-width: 240px;
      }
    `,
  ];
}
