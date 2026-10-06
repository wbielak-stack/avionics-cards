import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import { ENDURANCE_DEFAULTS, type EnduranceCardConfig } from './config';
import { gridSchema } from '../../core/grid';

export class AvionicsEnduranceCardEditor extends FormEditor<EnduranceCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'endur.editor.';

  protected formDefaults() {
    return { ...ENDURANCE_DEFAULTS };
  }

  protected schema(c: EnduranceCardConfig) {
    const txt = { text: {} };
    const numSel = (step = 1) => ({ number: { step, mode: 'box' } });
    return [
      { name: 'entity', required: true, selector: { entity: {} } },
      { name: 'name', selector: txt },
      grid([
        { name: 'label_nopv', selector: txt },
        { name: 'label_pv', selector: txt },
      ]),
      grid([
        { name: 'max_hours', selector: numSel() },
        { name: 'caution_hours', selector: numSel(0.5) },
        { name: 'warning_hours', selector: numSel(0.5) },
      ]),
      schemaSection(this.t('endur.editor.section.attributes'), [
        grid([
          { name: 'endurance_attribute', selector: txt },
          { name: 'endurance_pv_attribute', selector: txt },
        ]),
        grid([
          { name: 'soc_attribute', selector: txt },
          { name: 'soc_entity', selector: { entity: {} } },
        ]),
        grid([
          { name: 'min_attribute', selector: txt },
          { name: 'min_hour_attribute', selector: txt },
          { name: 'rebound_attribute', selector: txt },
        ]),
        grid([
          { name: 'updated_attribute', selector: txt },
          { name: 'trajectory_attribute', selector: txt },
        ]),
      ]),
      schemaSection(this.t('endur.editor.section.soc'), [
        grid([
          { name: 'soc_warning', selector: numSel() },
          { name: 'soc_caution', selector: numSel() },
        ]),
        grid([
          { name: 'show_profile', selector: { boolean: {} } },
          ...(c.show_profile !== false ? [{ name: 'profile_hours', selector: numSel() }] : []),
        ]),
        ...(c.show_profile !== false ? [grid(gridSchema('profile_grid', 'profile_grid_step', (k) => this.t(k), c.profile_grid))] : []),
      ]),
    ];
  }
}
