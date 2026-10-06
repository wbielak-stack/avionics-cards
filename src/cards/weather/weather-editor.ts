import { html, css } from 'lit';
import { FormEditor } from '../../core/form-editor';
import { schemaSection, schemaGrid } from '../../core/row-list-editor';
import type { WeatherCardConfig } from './config';
import { FIELDS, WEATHER_ATTR, detectFromDevice } from './fields';
import { gridSchema } from '../../core/grid';

export class AvionicsWeatherCardEditor extends FormEditor<WeatherCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'weather.editor.';

  protected formDefaults() {
    return {
      pressure_trend_hours: 3,
      layout: 'list' as const,
      columns: 2,
      wind_arrow: 'from' as const,
      rotation: 0,
      pressure_graph: false,
      pressure_graph_scale: 'fixed' as const,
      pressure_graph_span: 20,
      pressure_graph_ranges: '12, 24, 48',
      pressure_graph_reference: true,
      pressure_graph_position: 'auto' as const,
      pressure_graph_grid: 'nice' as const,
      wind_graph_grid: 'nice' as const,
      wind_forecast: true,
      wind_graph: false,
      wind_graph_position: 'auto' as const,
      wind_graph_hours_back: 12,
      wind_graph_hours_forward: 12,
      graph_order: 'pressure_first' as const,
    };
  }

  /** Co wykryto z urzadzenia i czego brakuje - widoczne pod formularzem. */
  protected notes(c: WeatherCardConfig) {
    if (!this.hass) return [];
    const det = detectFromDevice(this.hass, c.device);
    const w = c.weather_entity ? this.hass.states[c.weather_entity] : undefined;
    const used: string[] = [];
    const missing: string[] = [];
    for (const f of FIELDS) {
      const id = c[f] || det[f];
      if (id) used.push(`${this.t(`weather.field.${f}`)} → ${id}`);
      else if (w && WEATHER_ATTR[f] && w.attributes?.[WEATHER_ATTR[f]!.attr] !== undefined)
        used.push(`${this.t(`weather.field.${f}`)} → ${c.weather_entity}`);
      else missing.push(this.t(`weather.field.${f}`));
    }
    const out: Array<{ type: 'info' | 'warning'; text: string }> = [];
    if (used.length) out.push({ type: 'info', text: `${this.t('weather.detected')} ${used.join(' · ')}` });
    if (missing.length) out.push({ type: 'info', text: `${this.t('weather.skipped')} ${missing.join(', ')}` });
    return out;
  }

  protected schema(c: WeatherCardConfig) {
    return [
      { name: 'name', selector: { text: {} } },
      schemaGrid([
        {
          name: 'layout',
          selector: {
            select: {
              mode: 'dropdown',
              options: ['list', 'boxes'].map((v) => ({ value: v, label: this.t(`weather.editor.layout.${v}`) })),
            },
          },
        },
        ...(c.layout === 'boxes'
          ? [{ name: 'columns', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } }]
          : []),
      ]),
      { name: 'device', selector: { device: {} } },
      { name: 'weather_entity', selector: { entity: { filter: [{ domain: 'weather' }] } } },
      schemaSection(
        this.t('weather.editor.section.entities'),
        FIELDS.map((f) => ({ name: f, selector: { entity: { filter: [{ domain: 'sensor' }] } } })),
      ),
      { name: 'extra', selector: { entity: { multiple: true } } },
      ...(c.pressure_graph && c.wind_graph
        ? [
            {
              name: 'graph_order',
              selector: {
                select: {
                  mode: 'dropdown',
                  options: ['pressure_first', 'wind_first'].map((v) => ({
                    value: v,
                    label: this.t(`weather.editor.graph_order.${v}`),
                  })),
                },
              },
            },
          ]
        : []),
      schemaSection(this.t('weather.editor.section.wind'), [
        schemaGrid([
          {
            name: 'wind_arrow',
            selector: {
              select: {
                mode: 'dropdown',
                options: ['from', 'to'].map((v) => ({ value: v, label: this.t(`weather.editor.wind_arrow.${v}`) })),
              },
            },
          },
          { name: 'rotation', selector: { number: { min: 0, max: 359, step: 1, mode: 'box' } } },
        ]),
        { name: 'wind_forecast', selector: { boolean: {} } },
      ]),
      schemaSection(this.t('weather.editor.section.wind_graph'), [
        { name: 'wind_graph', selector: { boolean: {} } },
        ...(c.wind_graph
          ? [
              { name: 'wind_forecast_entity', selector: { entity: { filter: [{ domain: 'weather' }] } } },
              schemaGrid([
                { name: 'wind_graph_hours_back', selector: { number: { min: 1, max: 48, step: 1, mode: 'box' } } },
                { name: 'wind_graph_hours_forward', selector: { number: { min: 0, max: 48, step: 1, mode: 'box' } } },
              ]),
              schemaGrid([
                { name: 'wind_caution', selector: { number: { step: 0.1, mode: 'box' } } },
                { name: 'wind_warning', selector: { number: { step: 0.1, mode: 'box' } } },
              ]),
              schemaGrid(gridSchema('wind_graph_grid', 'wind_graph_grid_step', (k) => this.t(k), c.wind_graph_grid)),
              ...(c.layout === 'boxes'
                ? [
                    {
                      name: 'wind_graph_position',
                      selector: {
                        select: {
                          mode: 'dropdown',
                          options: ['auto', 'under_wind', 'bottom'].map((v) => ({
                            value: v,
                            label: this.t(`weather.editor.pressure_graph_position.${v}`),
                          })),
                        },
                      },
                    },
                  ]
                : []),
            ]
          : []),
      ]),
      schemaSection(this.t('weather.editor.section.pressure'), [
        schemaGrid([
          { name: 'pressure_trend_hours', selector: { number: { min: 1, max: 24, step: 1, mode: 'box' } } },
          { name: 'pressure_graph', selector: { boolean: {} } },
        ]),
        ...(c.pressure_graph
          ? [
              schemaGrid([
                {
                  name: 'pressure_graph_scale',
                  selector: {
                    select: {
                      mode: 'dropdown',
                      options: ['fixed', 'auto'].map((v) => ({ value: v, label: this.t(`graph.editor.scale.${v}`) })),
                    },
                  },
                },
                ...(c.pressure_graph_scale !== 'auto'
                  ? [{ name: 'pressure_graph_span', selector: { number: { min: 2, max: 100, step: 1, mode: 'box' } } }]
                  : []),
              ]),
              schemaGrid([
                { name: 'pressure_graph_ranges', selector: { text: {} } },
                { name: 'pressure_graph_reference', selector: { boolean: {} } },
              ]),
              schemaGrid(gridSchema('pressure_graph_grid', 'pressure_graph_grid_step', (k) => this.t(k), c.pressure_graph_grid)),
              ...(c.layout === 'boxes'
                ? [
                    {
                      name: 'pressure_graph_position',
                      selector: {
                        select: {
                          mode: 'dropdown',
                          options: ['auto', 'under_wind', 'bottom'].map((v) => ({
                            value: v,
                            label: this.t(`weather.editor.pressure_graph_position.${v}`),
                          })),
                        },
                      },
                    },
                  ]
                : []),
            ]
          : []),
      ]),
    ];
  }

  /** Pozycje w kolejnosci wyswietlania (wg `order`, reszta w kolejnosci domyslnej). */
  private _orderedItems(): Array<{ key: string; label: string }> {
    const probe = document.createElement('avionics-weather-card') as any;
    probe.setConfig({ ...this._config, hidden: [], order: [] });
    const avail: Array<{ key: string; label: string }> = probe.availableItems(this.hass);
    const order = this._config?.order ?? [];
    const pos = (k: string) => (order.indexOf(k) < 0 ? order.length : order.indexOf(k));
    return avail.map((a, i) => ({ a, i })).sort((x, y) => pos(x.a.key) - pos(y.a.key) || x.i - y.i).map((x) => x.a);
  }

  private _move(keys: string[], i: number, d: number): void {
    const j = i + d;
    if (j < 0 || j >= keys.length) return;
    const order = [...keys];
    [order[i], order[j]] = [order[j], order[i]];
    this.emitConfig({ ...this._config!, order });
  }

  private _toggle(key: string): void {
    const hidden = new Set(this._config?.hidden ?? []);
    if (hidden.has(key)) hidden.delete(key);
    else hidden.add(key);
    this.emitConfig({ ...this._config!, hidden: [...hidden] });
  }

  protected render() {
    const base = super.render();
    if (!this._config || !this.hass) return base;
    const items = this._orderedItems();
    if (!items.length) return base;
    const keys = items.map((i) => i.key);
    const hidden = new Set(this._config.hidden ?? []);
    return html`${base}
      <div class="items">
        <div class="items-title">${this.t('weather.editor.section.items')}</div>
        <div class="items-hint">${this.t('weather.items.hint')}</div>
        ${items.map(
          (it, i) => html`<div class="item ${hidden.has(it.key) ? 'off' : ''}">
            <span class="name">${it.label}</span>
            <button title="↑" ?disabled=${i === 0} @click=${() => this._move(keys, i, -1)}>↑</button>
            <button title="↓" ?disabled=${i === items.length - 1} @click=${() => this._move(keys, i, 1)}>↓</button>
            <button class="vis" @click=${() => this._toggle(it.key)}>
              <ha-icon icon=${hidden.has(it.key) ? 'mdi:eye-off' : 'mdi:eye'}></ha-icon>
              ${hidden.has(it.key) ? this.t('weather.items.hide') : this.t('weather.items.show')}
            </button>
          </div>`,
        )}
      </div>`;
  }

  static styles = [
    FormEditor.styles,
    css`
      .items {
        margin-top: 16px;
      }
      .items-title {
        font-weight: 500;
      }
      .items-hint {
        font-size: 12px;
        color: var(--secondary-text-color);
        margin: 2px 0 8px;
      }
      .item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
        border-bottom: 1px solid var(--divider-color, #444);
      }
      .item.off .name {
        opacity: 0.45;
        text-decoration: line-through;
      }
      .name {
        flex: 1 1 auto;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      button {
        font: inherit;
        padding: 3px 9px;
        border-radius: 6px;
        border: 1px solid var(--divider-color, #555);
        background: transparent;
        color: var(--primary-text-color);
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.35;
        cursor: default;
      }
      button.vis {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        min-width: 112px;
      }
      button.vis ha-icon {
        --mdc-icon-size: 18px;
      }
    `,
  ];
}
