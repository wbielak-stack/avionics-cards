import type { SoftkeyConfig } from './config';
import { RowListEditor, schemaGrid as grid, schemaSection } from '../../core/row-list-editor';

export class AvionicsSoftkeysCardEditor extends RowListEditor<SoftkeyConfig> {
  protected labelPrefix = 'softkeys.editor.';

  protected cardSchema() {
    return [
      { name: 'title', selector: { text: {} } },
      {
        name: 'key_style',
        selector: {
          select: {
            mode: 'dropdown',
            options: ['lamp', 'inverse'].map((v) => ({ value: v, label: this.t(`softkeys.editor.key_style.${v}`) })),
          },
        },
      },
      {
        name: 'layout',
        selector: {
          select: {
            mode: 'dropdown',
            options: ['list', 'row'].map((v) => ({ value: v, label: this.t(`softkeys.editor.layout.${v}`) })),
          },
        },
      },
    ];
  }

  protected rowFormDefaults(): Partial<SoftkeyConfig> {
    return { active_state: 'on', progress_min: 0, progress_max: 100 };
  }

  protected rowSchema(row: SoftkeyConfig) {
    const section = (title: string, schema: unknown[]) => schemaSection(this.t(title), schema);
    return [
      grid([
        { name: 'name', selector: { text: {} } },
        { name: 'icon', selector: { icon: {} } },
      ]),
      { name: 'secondary', selector: { template: {} } },
      { name: 'tap_action', selector: { ui_action: {} } },
      { name: 'hold_action', selector: { ui_action: {} } },
      section('softkeys.editor.section.active', [
        grid([
          { name: 'active_entity', selector: { entity: {} } },
          { name: 'active_state', selector: { text: {} } },
        ]),
        { name: 'active_template', selector: { template: {} } },
        {
          name: 'active_color',
          selector: {
            select: {
              mode: 'dropdown',
              options: ['ok', 'caution', 'warning'].map((v) => ({ value: v, label: this.t(`softkeys.editor.active_color.${v}`) })),
            },
          },
        },
        ...(row.active_entity || row.active_template
          ? [
              { name: 'active_name', selector: { text: {} } },
              { name: 'active_secondary', selector: { template: {} } },
              { name: 'active_tap_action', selector: { ui_action: {} } },
            ]
          : []),
      ]),
      section('softkeys.editor.section.armed', [
        grid([
          { name: 'armed_entity', selector: { entity: {} } },
          { name: 'armed_state', selector: { text: {} } },
        ]),
        { name: 'armed_template', selector: { template: {} } },
      ]),
      section('softkeys.editor.section.value', [
        { name: 'value_entity', selector: { entity: { filter: [{ domain: 'input_number' }, { domain: 'number' }] } } },
      ]),
      section('softkeys.editor.section.progress', [
        { name: 'progress_current', selector: { entity: {} } },
        { name: 'progress_target', selector: { entity: {} } },
        { name: 'progress_start', selector: { entity: {} } },
        grid([
          { name: 'progress_min', selector: { number: { step: 1, mode: 'box' } } },
          { name: 'progress_max', selector: { number: { step: 1, mode: 'box' } } },
        ]),
      ]),
    ];
  }
}
