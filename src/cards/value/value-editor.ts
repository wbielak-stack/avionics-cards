import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection, numberSel as n, zoneFields } from '../../core/row-list-editor';
import { resolveZones } from '../../core/zone-extras';
import { zonesSummary } from '../../core/zones-summary';
import type { ValueCardConfig } from './config';
import { gridSchema } from '../../core/grid';

export class AvionicsValueCardEditor extends FormEditor<ValueCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'value.editor.';

  protected formDefaults() {
    return { multiplier: 1, deadband: 0, show_footer: true, show_graph: true, hours_to_show: 24, graph_min_range: 1 };
  }

  protected notes(c: ValueCardConfig) {
    const { summary, orderError } = zonesSummary(resolveZones(this.hass, c as any), (k) => this.t(k));
    if (orderError) return [{ type: 'warning' as const, text: this.t('zones.order_error') }];
    return summary ? [{ type: 'info' as const, text: summary }] : [];
  }

  protected schema(c: ValueCardConfig) {
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
        { name: 'abs_value', selector: { boolean: {} } },
      ]),
      { name: 'show_sign', selector: { boolean: {} } },
      section('value.editor.section.status', [
        grid([
          { name: 'status_positive', selector: { text: {} } },
          { name: 'status_negative', selector: { text: {} } },
        ]),
        grid([
          { name: 'status_zero', selector: { text: {} } },
          { name: 'deadband', selector: n(0.01) },
        ]),
      ]),
      section('value.editor.section.footer', [
        { name: 'show_footer', selector: { boolean: {} } },
        ...(c.show_footer !== false
          ? [
              { name: 'footer_name', selector: { text: {} } },
              grid([
                { name: 'footer_entity', selector: { entity: {} } },
                { name: 'footer_entity2', selector: { entity: {} } },
              ]),
              { name: 'footer_precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
            ]
          : []),
      ]),
      section('eis.editor.section.zones', [...zoneFields(!!(c as any).zones_from_entities), { name: 'warning_inverse', selector: { boolean: {} } }]),
      section('value.editor.section.graph', [
        { name: 'show_graph', selector: { boolean: {} } },
        ...(c.show_graph !== false
          ? [
              grid([
                { name: 'hours_to_show', selector: { number: { min: 1, max: 168, step: 1, mode: 'box' } } },
                { name: 'graph_min_range', selector: n() },
              ]),
              { name: 'graph_color', selector: { text: {} } },
              grid(gridSchema('graph_grid', 'graph_grid_step', (k) => this.t(k), c.graph_grid)),
            ]
          : []),
      ]),
    ];
  }
}
