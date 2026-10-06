import type { GoalRowConfig } from './config';
import { RowListEditor, schemaGrid as grid, schemaSection } from '../../core/row-list-editor';

export class AvionicsGoalCardEditor extends RowListEditor<GoalRowConfig> {
  protected labelPrefix = 'goal.editor.';

  protected cardSchema() {
    return [{ name: 'title', selector: { text: {} } }];
  }

  protected rowFormDefaults(): Partial<GoalRowConfig> {
    return { kind: 'goal', start: 0, marker: 'target', marker_color: 'forecast', caution_pct: 80, warning_pct: 95 };
  }

  protected rowSchema(row: GoalRowConfig) {
    const section = (title: string, schema: unknown[]) => schemaSection(this.t(title), schema);
    const sel = (keys: string[], prefix: string) => ({
      select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`${prefix}.${v}`) })) },
    });
    const n = (step = 1) => ({ number: { step, mode: 'box' } });
    return [
      grid([
        { name: 'name', selector: { text: {} } },
        { name: 'kind', selector: sel(['goal', 'limit'], 'goal.editor.kind') },
      ]),
      grid([
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
      ]),
      section('goal.editor.section.current', [
        grid([
          { name: 'current_entity', selector: { entity: {} } },
          { name: 'current_attribute', selector: { text: {} } },
        ]),
        { name: 'current_template', selector: { template: {} } },
      ]),
      section('goal.editor.section.target', [
        grid([
          { name: 'target', selector: n(0.1) },
          { name: 'target_entity', selector: { entity: {} } },
          { name: 'start', selector: n(0.1) },
        ]),
        { name: 'target_template', selector: { template: {} } },
      ]),
      section('goal.editor.section.rate', [
        grid([
          { name: 'start_date', selector: { date: {} } },
          { name: 'rate_entity', selector: { entity: {} } },
        ]),
        { name: 'rate_template', selector: { template: {} } },
      ]),
      section('goal.editor.section.marker', [
        { name: 'marker', selector: sel(['target', 'custom', 'off'], 'goal.editor.marker') },
        ...(row.marker === 'custom'
          ? [
              grid([
                { name: 'marker_value', selector: n(0.1) },
                { name: 'marker_entity', selector: { entity: {} } },
                { name: 'marker_color', selector: sel(['forecast', 'setpoint'], 'goal.editor.marker_color') },
              ]),
              { name: 'marker_template', selector: { template: {} } },
            ]
          : []),
      ]),
      ...(row.kind === 'limit'
        ? [
            section('goal.editor.section.zones', [
              grid([
                { name: 'caution_pct', selector: n() },
                { name: 'warning_pct', selector: n() },
              ]),
            ]),
          ]
        : []),
    ];
  }
}
