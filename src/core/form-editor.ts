import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types';
import { localize, getLanguage } from './i18n';

/**
 * Edytor karty bez listy wierszy: jeden ha-form + komunikaty pod nim.
 * Schemat moze zalezec od konfiguracji (pola ukrywane, gdy nie maja sensu).
 */
export abstract class FormEditor<C extends Record<string, unknown>> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected _config?: C;

  protected abstract labelPrefix: string;
  protected abstract schema(config: C): unknown[];
  protected notes(_config: C): Array<{ type: 'info' | 'warning'; text: string }> {
    return [];
  }
  protected formDefaults(): Partial<C> {
    return {};
  }

  setConfig(config: C): void {
    this._config = { ...config };
  }

  protected t(k: string): string {
    return localize(getLanguage(this.hass), k);
  }

  private _label = (s: { name: string }) => this.t(`${this.labelPrefix}${s.name}`);

  private _changed(e: CustomEvent): void {
    e.stopPropagation();
    const config = { ...this._config!, ...e.detail.value } as C;
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ ...this.formDefaults(), ...this._config }}
        .schema=${this.schema(this._config)}
        .computeLabel=${this._label}
        @value-changed=${this._changed}
      ></ha-form>
      ${this.notes(this._config).map((n) => html`<ha-alert alert-type=${n.type}>${n.text}</ha-alert>`)}
    `;
  }

  static styles = css`
    ha-alert {
      display: block;
      margin-top: 8px;
    }
  `;
}
