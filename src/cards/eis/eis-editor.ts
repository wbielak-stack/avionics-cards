import type { EisRowConfig } from './config';
import {
  RowListEditor,
  schemaGrid as grid,
  schemaSection,
  numberSel as n,
  zoneFields,
} from '../../core/row-list-editor';
import { resolveZones } from '../../core/zone-extras';
import { zonesSummary } from '../../core/zones-summary';

/** Edytor karty EIS: grupy pol pokazywane tylko wtedy, gdy maja sens. */
export class AvionicsEisCardEditor extends RowListEditor<EisRowConfig> {
  protected rowNotes(row: EisRowConfig) {
    const { summary, orderError } = zonesSummary(resolveZones(this.hass, row as any), (k) => this.t(k));
    if (orderError) return [{ type: 'warning' as const, text: this.t('zones.order_error') }];
    return summary ? [{ type: 'info' as const, text: summary }] : [];
  }

  protected labelPrefix = 'eis.editor.';

  protected cardSchema() {
    return [
      { name: 'title', selector: { text: {} } },
      { name: 'warning_inverse', selector: { boolean: {} } },
    ];
  }

  protected rowFormDefaults(): Partial<EisRowConfig> {
    return { show_bar: true, range_minutes: 1440, range_markers: 'both' };
  }

  protected rowSchema(row: EisRowConfig) {
    const section = (title: string, schema: unknown[]) => schemaSection(this.t(title), schema);
    const showBar = row.show_bar !== false;

    const schema: unknown[] = [
      { name: 'entity', required: true, selector: { entity: {} } },
      { name: 'entity2', selector: { entity: {} } },
      { name: 'name', selector: { text: {} } },
      grid([
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
      ]),
      section('eis.editor.section.bar', [
        { name: 'show_bar', selector: { boolean: {} } },
        ...(showBar
          ? [
              grid([
                { name: 'min', selector: n() },
                { name: 'max', selector: n() },
              ]),
              grid([
                { name: 'major_tick', selector: n() },
                { name: 'show_scale', selector: { boolean: {} } },
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
            ]
          : []),
      ]),
      section('eis.editor.section.zones', zoneFields(!!(row as any).zones_from_entities)),
    ];
    if (showBar) {
      schema.push(
        section('eis.editor.section.setpoint', [
          grid([
            { name: 'setpoint', selector: n() },
            { name: 'setpoint_entity', selector: { entity: {} } },
          ]),
          grid([
            { name: 'forecast', selector: n() },
            { name: 'forecast_entity', selector: { entity: {} } },
          ]),
          ...(row.entity2
            ? [
                grid([
                  { name: 'setpoint2', selector: n() },
                  { name: 'setpoint2_entity', selector: { entity: {} } },
                ]),
                grid([
                  { name: 'forecast2', selector: n() },
                  { name: 'forecast2_entity', selector: { entity: {} } },
                ]),
              ]
            : []),
        ]),
      );
    }
    return schema;
  }
}
