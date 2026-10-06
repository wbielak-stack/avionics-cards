import { FormEditor } from '../../core/form-editor';
import type { MetarCardConfig } from './metar-card';

export class AvionicsMetarCardEditor extends FormEditor<MetarCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'metar.editor.';

  protected formDefaults() {
    return { source: 'api' as const, show_raw: true };
  }

  protected schema(c: MetarCardConfig) {
    return [
      { name: 'station', selector: { text: {} } },
      {
        name: 'source',
        selector: {
          select: {
            mode: 'dropdown',
            options: ['api', 'entity'].map((v) => ({ value: v, label: this.t(`metar.editor.source.${v}`) })),
          },
        },
      },
      ...(c.source === 'entity'
        ? [
            { name: 'entity', selector: { entity: {} } },
            { name: 'attribute', selector: { text: {} } },
          ]
        : []),
      { name: 'show_raw', selector: { boolean: {} } },
    ];
  }
}
