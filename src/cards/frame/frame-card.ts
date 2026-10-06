import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { localize, getLanguage } from '../../core/i18n';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { cardHeader } from '../../core/header';

type InnerCard = HTMLElement & { hass?: HomeAssistant; getCardSize?: () => number | Promise<number> };

export interface FrameCardConfig {
  type: string;
  title?: string;
  /** dowolna karta w srodku (jej wlasne tlo, ramka i cien sa wygaszane) */
  card?: Record<string, unknown> & { type: string };
  /** wewnetrzny margines wokol karty (domyslnie bez - karta ma wlasny) */
  padding?: boolean;
}

/**
 * Ramka: naglowek i rama zestawu wokol dowolnej karty (np. Sankey), bez card-mod.
 * Tlo, ramke i cien wewnetrznej karty wygaszaja zmienne motywu ustawione na kontenerze.
 */
export class AvionicsFrameCard extends LitElement {
  @state() private _config?: FrameCardConfig;
  @state() private _card?: InnerCard;
  @state() private _styleMode: StyleMode = 'look';
  private _hass?: HomeAssistant;
  private _build = 0;

  static getConfigElement() {
    return document.createElement('avionics-frame-card-editor');
  }

  static getStubConfig() {
    return { title: 'Frame', card: { type: 'markdown', content: '…' } };
  }

  setConfig(config: FrameCardConfig): void {
    if (!config.card || typeof config.card !== 'object' || !config.card.type) {
      throw new Error(localize(getLanguage(), 'frame.error.no_card'));
    }
    this._config = config;
    void this._create(config.card);
  }

  /** Karta wewnetrzna przez standardowe pomocniki HA (te same co w stosach kart). */
  private async _create(cardConfig: FrameCardConfig['card']): Promise<void> {
    const token = ++this._build;
    const helpers = await (window as any).loadCardHelpers?.();
    if (token !== this._build || !helpers) return;
    const el = helpers.createCardElement(cardConfig) as InnerCard;
    if (this._hass) el.hass = this._hass;
    // karta jeszcze sie laduje (custom element) - podmiana po zdefiniowaniu
    el.addEventListener('ll-rebuild', (e) => {
      e.stopPropagation();
      void this._create(cardConfig);
    });
    this._card = el;
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (this._card) this._card.hass = hass;
    const mode = readStyleMode(this);
    if (mode !== this._styleMode) this._styleMode = mode;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  async getCardSize(): Promise<number> {
    const inner = this._card?.getCardSize ? await this._card.getCardSize() : 3;
    return inner + (this._config?.title ? 1 : 0);
  }

  getGridOptions() {
    return { columns: 12, min_columns: 4 };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config) return nothing;
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true', pad: !!this._config.padding })}>
        ${cardHeader(this._config.title)}
        <div class="inner">${this._card ?? nothing}</div>
      </ha-card>
    `;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 0 0;
        display: flex;
        flex-direction: column;
      }
      .av-head {
        margin-left: 14px;
        margin-right: 14px;
      }
      ha-card.pad .inner {
        padding: 0 14px 10px;
      }
      /* wewnetrzna karta bez wlasnej ramy - rama jest nasza */
      .inner {
        flex: 1 1 auto;
        min-height: 0;
        --ha-card-background: transparent;
        --card-background-color: transparent;
        --ha-card-border-width: 0px;
        --ha-card-border-color: transparent;
        --ha-card-border-radius: 0px;
        --ha-card-box-shadow: none;
        text-shadow: none;
      }
    `,
  ];
}
