import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection, zoneFields } from '../../core/row-list-editor';
import { zonesSummary } from '../../core/zone-extras-summary';
import { CYLINDER_DEFAULTS, type CylinderCardConfig } from './config';

export class AvionicsCylinderCardEditor extends FormEditor<CylinderCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'cyl.editor.';

  protected formDefaults() {
    return { ...CYLINDER_DEFAULTS };
  }

  protected notes(c: CylinderCardConfig) {
    return zonesSummary(this.hass, c, (k) => this.t(k));
  }

  protected schema(c: CylinderCardConfig) {
    const n = (step = 1) => ({ number: { step, mode: 'box' } });
    const sel = (keys: string[], prefix: string) => ({
      select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`${prefix}.${v}`) })) },
    });
    return [
      { name: 'title', selector: { text: {} } },
      // wybor wielu encji dziala na liscie nazw; etykiety z YAML (name) zostaja w YAML
      ...(c.entities.every((e) => typeof e === 'string') ? [{ name: 'entities', selector: { entity: { multiple: true } } }] : []),
      { name: 'labels', selector: { text: {} } },
      grid([
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
        { name: 'multiplier', selector: n(0.001) },
      ]),
      grid([
        { name: 'highlight', selector: sel(['min', 'max', 'both', 'none'], 'cyl.editor.highlight') },
        { name: 'peak', selector: sel(['off', 'max', 'min'], 'cyl.editor.peak') },
      ]),
      grid([
        { name: 'summary', selector: sel(['delta', 'avg', 'sum'], 'cyl.editor.summary') },
        { name: 'show_values', selector: sel(['auto', 'all', 'highlighted'], 'cyl.editor.show_values') },
      ]),
      ...(c.summary === 'delta' || !c.summary
        ? [
            grid([
              { name: 'delta_multiplier', selector: n(0.001) },
              { name: 'delta_unit', selector: { text: {} } },
            ]),
          ]
        : []),
      schemaSection(this.t('cyl.editor.section.scale'), [
        grid([
          { name: 'min', selector: n(0.01) },
          { name: 'max', selector: n(0.01) },
          { name: 'limit', selector: n(0.01) },
        ]),
      ]),
      schemaSection(this.t('eis.editor.section.zones'), [
        ...zoneFields(!!c.zones_from_entities),
        { name: 'warning_inverse', selector: { boolean: {} } },
      ]),
    ];
  }
}
