import type { DialConfig } from './config';
import {
  RowListEditor,
  schemaGrid as grid,
  schemaSection,
  numberSel as n,
  zoneFields,
} from '../../core/row-list-editor';
import { resolveZones } from '../../core/zone-extras';
import { zonesSummary } from '../../core/zones-summary';

export class AvionicsDialCardEditor extends RowListEditor<DialConfig> {
  protected rowNotes(row: DialConfig) {
    const { summary, orderError } = zonesSummary(resolveZones(this.hass, row as any), (k) => this.t(k));
    if (orderError) return [{ type: 'warning' as const, text: this.t('zones.order_error') }];
    return summary ? [{ type: 'info' as const, text: summary }] : [];
  }

  protected labelPrefix = 'dial.editor.';

  protected cardSchema() {
    const opts = (keys: string[], prefix: string) => ({
      select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`${prefix}.${v}`) })) },
    });
    return [
      { name: 'title', selector: { text: {} } },
      { name: 'dial_style', selector: opts(['trueAvionics', 'simplified'], 'dial.editor.dial_style') },
      { name: 'warning_inverse', selector: { boolean: {} } },
    ];
  }

  protected rowFormDefaults(): Partial<DialConfig> {
    return { multiplier: 1, min: 0, max: 100, range_minutes: 60, range_markers: 'max' };
  }

  protected rowSchema(row: DialConfig) {
    const section = (title: string, schema: unknown[]) => schemaSection(this.t(title), schema);
    return [
      { name: 'entity', required: true, selector: { entity: {} } },
      { name: 'name', selector: { text: {} } },
      grid([
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
      ]),
      grid([
        { name: 'multiplier', selector: { number: { step: 0.001, mode: 'box' } } },
      ]),
      grid([
        { name: 'min', selector: n() },
        { name: 'max', selector: n() },
      ]),
      section('eis.editor.section.zones', zoneFields(!!(row as any).zones_from_entities)),
      section('eis.editor.section.setpoint', [
        grid([
          { name: 'setpoint', selector: n() },
          { name: 'setpoint_entity', selector: { entity: {} } },
        ]),
        grid([
          { name: 'forecast', selector: n() },
          { name: 'forecast_entity', selector: { entity: {} } },
        ]),
        { name: 'show_range', selector: { boolean: {} } },
        ...(row.show_range
          ? [
              grid([
                { name: 'range_minutes', selector: { number: { min: 1, max: 10080, step: 1, mode: 'box' } } },
                {
                  name: 'range_markers',
                  selector: {
                    select: {
                      mode: 'dropdown',
                      options: ['both', 'min', 'max', 'ago'].map((v) => ({
                        value: v,
                        label: this.t(`eis.editor.range_markers.${v}`),
                      })),
                    },
                  },
                },
              ]),
            ]
          : []),
      ]),
    ];
  }
}
