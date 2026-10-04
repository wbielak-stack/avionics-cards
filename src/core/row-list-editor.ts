import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { HomeAssistant } from '../types';
import { localize, getLanguage } from './i18n';

export interface RowBase {
  entity?: string;
  name?: string;
}

export interface RowListConfig<R extends RowBase> {
  type: string;
  entities: Array<R | string>;
  [key: string]: unknown;
}

/**
 * Wspolny edytor kart z lista wierszy: pola karty + wiersze
 * (dodaj / usun / przesun), kazdy wiersz w standardowym ha-form.
 * Podklasa podaje schematy i prefiks tlumaczen etykiet.
 */
export abstract class RowListEditor<R extends RowBase> extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  @state() protected _config?: RowListConfig<R>;
  @state() private _open = 0;

  /** Prefiks kluczy etykiet pol, np. 'eis.editor.' */
  protected abstract labelPrefix: string;
  protected abstract cardSchema(): unknown[];
  protected abstract rowSchema(row: R): unknown[];
  /** Komunikaty pod formularzem wiersza (np. opis stref, bledna kolejnosc progow). */
  protected rowNotes(_row: R): Array<{ type: 'info' | 'warning'; text: string }> {
    return [];
  }

  /** Wartosci domyslne pokazywane w formularzu wiersza (nie zapisywane, dopoki nie zmienione). */
  protected rowFormDefaults(): Partial<R> {
    return {};
  }

  setConfig(config: RowListConfig<R>): void {
    this._config = { ...config, entities: [...(config.entities ?? [])] };
  }

  protected t(k: string): string {
    return localize(getLanguage(this.hass), k);
  }

  private _label = (s: { name: string }) => this.t(`${this.labelPrefix}${s.name}`);

  private _emit(config: RowListConfig<R>): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  private _cardChanged(e: CustomEvent): void {
    e.stopPropagation();
    const { entities, ...rest } = this._config!;
    this._emit({ ...rest, ...e.detail.value, entities } as RowListConfig<R>);
  }

  private _rowChanged(i: number, e: CustomEvent): void {
    e.stopPropagation();
    const entities = [...this._config!.entities];
    entities[i] = e.detail.value as R;
    this._emit({ ...this._config!, entities });
  }

  private _add(): void {
    const entities = [...this._config!.entities, { entity: '' } as R];
    this._open = entities.length - 1;
    this._emit({ ...this._config!, entities });
  }

  private _remove(i: number): void {
    this._emit({ ...this._config!, entities: this._config!.entities.filter((_, k) => k !== i) });
  }

  private _move(i: number, d: number): void {
    const entities = [...this._config!.entities];
    const j = i + d;
    if (j < 0 || j >= entities.length) return;
    [entities[i], entities[j]] = [entities[j], entities[i]];
    this._open = j;
    this._emit({ ...this._config!, entities });
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    const { entities, ...card } = this._config;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${card}
        .schema=${this.cardSchema()}
        .computeLabel=${this._label}
        @value-changed=${this._cardChanged}
      ></ha-form>

      <div class="rows-title">${this.t('rows.title')}</div>
      ${entities.map((row, i) => {
        const r = (typeof row === 'string' ? { entity: row } : row) as R;
        const title =
          r.name || (r.entity ? this.hass!.states[r.entity]?.attributes?.friendly_name : undefined) || r.entity || `#${i + 1}`;
        return html`
          <ha-expansion-panel outlined .expanded=${this._open === i} .header=${`${i + 1}. ${title}`}>
            <ha-form
              .hass=${this.hass}
              .data=${{ ...this.rowFormDefaults(), ...r }}
              .schema=${this.rowSchema(r)}
              .computeLabel=${this._label}
              @value-changed=${(e: CustomEvent) => this._rowChanged(i, e)}
            ></ha-form>
            ${this.rowNotes(r).map(
              (n) => html`<ha-alert alert-type=${n.type}>${n.text}</ha-alert>`,
            )}
            <div class="row-actions">
              <button @click=${() => this._move(i, -1)} ?disabled=${i === 0}>↑ ${this.t('rows.up')}</button>
              <button @click=${() => this._move(i, 1)} ?disabled=${i === entities.length - 1}>
                ↓ ${this.t('rows.down')}
              </button>
              <button class="danger" @click=${() => this._remove(i)} ?disabled=${entities.length === 1}>
                ✕ ${this.t('rows.remove')}
              </button>
            </div>
          </ha-expansion-panel>
        `;
      })}
      <button class="add" @click=${this._add}>+ ${this.t('rows.add')}</button>
    `;
  }

  static styles = css`
    .rows-title {
      margin: 16px 0 8px;
      font-weight: 500;
    }
    ha-expansion-panel {
      display: block;
      margin-bottom: 8px;
    }
    ha-alert {
      display: block;
      margin-top: 8px;
    }
    .row-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      padding: 8px 0 4px;
    }
    button {
      font: inherit;
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid var(--divider-color, #555);
      background: transparent;
      color: var(--primary-text-color);
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    button.danger {
      color: var(--error-color, #db4437);
    }
    button.add {
      width: 100%;
      margin-top: 4px;
    }
  `;
}

/** Pomocnicze klocki schematow ha-form. */
export const schemaGrid = (schema: unknown[]) => ({ type: 'grid', name: '', schema });
export const schemaSection = (title: string, schema: unknown[]) => ({
  type: 'expandable',
  flatten: true,
  name: '',
  title,
  schema,
});
export const numberSel = (step = 0.1) => ({ number: { step, mode: 'box' } });

/**
 * Pola stref w stalym ukladzie: lewa kolumna = ponizej, prawa = powyzej;
 * gorny wiersz = ostrzezenia, dolny = alarmy.
 */
export const zoneFields = () => [
  schemaGrid([
    { name: 'caution_low', selector: numberSel() },
    { name: 'caution_high', selector: numberSel() },
  ]),
  schemaGrid([
    { name: 'warning_low', selector: numberSel() },
    { name: 'warning_high', selector: numberSel() },
  ]),
];
