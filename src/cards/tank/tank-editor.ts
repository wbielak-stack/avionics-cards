import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection, zoneFields } from '../../core/row-list-editor';
import { zonesSummary } from '../../core/zones-summary';
import { TANK_DEFAULTS, type TankCardConfig } from './config';

export class AvionicsTankCardEditor extends FormEditor<TankCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'tank.editor.';

  protected formDefaults() {
    return { ...TANK_DEFAULTS };
  }

  /** Opis stref pod formularzem (jak w pozostalych kartach); 0 przy progu dolnym = brak strefy. */
  protected notes(c: TankCardConfig) {
    const z = {
      warning_low: c.warning_low || undefined,
      caution_low: c.caution_low || undefined,
      caution_high: c.caution_high,
      warning_high: c.warning_high,
    };
    const { summary, orderError } = zonesSummary(z, (k) => this.t(k));
    if (orderError) return [{ type: 'warning' as const, text: this.t('zones.order_error') }];
    return summary ? [{ type: 'info' as const, text: summary }] : [];
  }

  protected schema() {
    const n = (step = 1) => ({ number: { step, mode: 'box' } });
    const e = { entity: {} };
    const tx = { text: {} };
    return [
      { name: 'entity', required: true, selector: e },
      grid([
        { name: 'name', selector: tx },
        {
          name: 'layout',
          selector: {
            select: {
              mode: 'dropdown',
              options: ['auto', 'horizontal', 'vertical'].map((v) => ({ value: v, label: this.t(`tank.editor.layout.${v}`) })),
            },
          },
        },
      ]),
      { name: 'precision', selector: { number: { min: 0, max: 2, step: 1, mode: 'box' } } },
      schemaSection(this.t('tank.editor.section.zones'), zoneFields()),
      schemaSection(this.t('tank.editor.section.stock'), [
        grid([
          { name: 'stock_entity', selector: e },
          { name: 'stock_multiplier', selector: n(0.001) },
        ]),
        grid([
          { name: 'capacity', selector: n(0.1) },
          { name: 'stock_unit', selector: tx },
        ]),
      ]),
      schemaSection(this.t('tank.editor.section.power'), [
        grid([
          { name: 'power_entity', selector: e },
          { name: 'power_multiplier', selector: n(0.001) },
          { name: 'power_unit', selector: tx },
        ]),
        grid([
          { name: 'status_positive', selector: tx },
          { name: 'status_negative', selector: tx },
          { name: 'deadband', selector: n(0.01) },
        ]),
      ]),
      schemaSection(this.t('tank.editor.section.target'), [
        grid([
          { name: 'target_entity', selector: e },
          { name: 'target_active_entity', selector: e },
        ]),
        grid([
          { name: 'target2_entity', selector: e },
          { name: 'target2_active_entity', selector: e },
        ]),
      ]),
      schemaSection(this.t('tank.editor.section.endurance'), [
        grid([
          { name: 'endurance_entity', selector: e },
          { name: 'endurance_attribute', selector: tx },
        ]),
        grid([
          { name: 'caution_hours', selector: n(0.5) },
          { name: 'warning_hours', selector: n(0.5) },
        ]),
      ]),
    ];
  }
}
