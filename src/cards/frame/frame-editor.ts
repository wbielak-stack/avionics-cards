import { LitElement, html, nothing, css } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../../types';
import { localize, getLanguage } from '../../core/i18n';
import type { FrameCardConfig } from './frame-card';

/** Edytor ramki: tytul i opcje w formularzu, karta wewnetrzna w edytorze YAML (jak w HA dla kart w kartach). */
export class AvionicsFrameCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: FrameCardConfig;

  setConfig(config: FrameCardConfig): void {
    this._config = config;
  }

  private _t(k: string): string {
    return localize(getLanguage(this.hass), k);
  }

  private _emit(config: FrameCardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const { card, ...rest } = this._config;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${rest}
        .schema=${[
          { name: 'title', selector: { text: {} } },
          { name: 'padding', selector: { boolean: {} } },
        ]}
        .computeLabel=${(s: { name: string }) => this._t(`frame.editor.${s.name}`)}
        @value-changed=${(e: CustomEvent) => {
          e.stopPropagation();
          this._emit({ ...this._config!, ...e.detail.value, card: this._config!.card });
        }}
      ></ha-form>
      <div class="lbl">${this._t('frame.editor.card')}</div>
      <ha-yaml-editor
        .hass=${this.hass}
        .defaultValue=${card}
        @value-changed=${(e: CustomEvent) => {
          e.stopPropagation();
          if (e.detail.isValid && e.detail.value && typeof e.detail.value === 'object' && e.detail.value.type) {
            this._emit({ ...this._config!, card: e.detail.value });
          }
        }}
      ></ha-yaml-editor>
    `;
  }

  static styles = css`
    .lbl {
      margin: 16px 0 6px;
      font-weight: 500;
    }
  `;
}
