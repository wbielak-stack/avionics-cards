import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import type { WindCardConfig } from './config';

type C = WindCardConfig & Record<string, unknown>;

/** Pola wspolne obu kart wiatru. */
function common(e: FormEditor<C> & { tr: (k: string) => string }) {
  return [
    { name: 'name', selector: { text: {} } },
    { name: 'device', selector: { device: {} } },
    schemaSection(e.tr('weather.editor.section.entities'), [
      { name: 'wind_speed', selector: { entity: { filter: [{ domain: 'sensor' }] } } },
      { name: 'wind_direction', selector: { entity: { filter: [{ domain: 'sensor' }] } } },
      { name: 'wind_gust', selector: { entity: { filter: [{ domain: 'sensor' }] } } },
    ]),
    { name: 'forecast_entity', selector: { entity: { filter: [{ domain: 'weather' }] } } },
    grid([
      {
        name: 'wind_arrow',
        selector: {
          select: {
            mode: 'dropdown',
            options: ['from', 'to'].map((v) => ({ value: v, label: e.tr(`weather.editor.wind_arrow.${v}`) })),
          },
        },
      },
      { name: 'rotation', selector: { number: { min: 0, max: 359, step: 1, mode: 'box' } } },
    ]),
  ];
}

export class AvionicsWindCardEditor extends FormEditor<C> {
  protected labelPrefix = 'wind.editor.';
  tr = (k: string) => this.t(k);
  protected formDefaults() {
    return { wind_arrow: 'from' as const, rotation: 0 };
  }
  protected schema() {
    return common(this);
  }
}

export class AvionicsWindGraphCardEditor extends FormEditor<C> {
  protected labelPrefix = 'wind.editor.';
  tr = (k: string) => this.t(k);
  protected formDefaults() {
    return { wind_arrow: 'from' as const, rotation: 0, hours_back: 12, hours_forward: 12 };
  }
  protected schema() {
    return [
      ...common(this),
      grid([
        { name: 'hours_back', selector: { number: { min: 1, max: 48, step: 1, mode: 'box' } } },
        { name: 'hours_forward', selector: { number: { min: 0, max: 48, step: 1, mode: 'box' } } },
      ]),
      grid([
        { name: 'wind_caution', selector: { number: { step: 0.1, mode: 'box' } } },
        { name: 'wind_warning', selector: { number: { step: 0.1, mode: 'box' } } },
      ]),
    ];
  }
}
