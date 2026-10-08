import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection } from '../../core/row-list-editor';

abstract class EnergyEditor extends FormEditor<Record<string, unknown> & { type: string }> {
  protected labelPrefix = 'en.editor.';
  protected sel(name: string, keys: string[]) {
    return {
      name,
      selector: { select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`en.editor.${name}.${v}`) })) } },
    };
  }
  protected priceSection() {
    const e = { entity: {} };
    const num = { number: { min: 0, max: 10, step: 0.01, mode: 'box' } };
    const zones = this._config?.tariff === 'zones';
    return schemaSection(this.t('en.editor.section.prices'), [
      this.sel('tariff', ['none', 'zones']),
      ...(zones
        ? [
            grid([
              { name: 'price_ec_peak', selector: e },
              { name: 'price_ec_offpeak', selector: e },
            ]),
            grid([
              { name: 'price_dist_peak', selector: e },
              { name: 'price_dist_offpeak', selector: e },
            ]),
            grid([
              { name: 'offpeak_hours', selector: { text: {} } },
              { name: 'offpeak_hours_summer', selector: { text: {} } },
              { name: 'offpeak_weekends', selector: { boolean: {} } },
            ]),
            { name: 'import_multiplier', selector: num },
          ]
        : []),
      ...(zones ? [] : [grid([
        { name: 'price_ec_entity', selector: e },
        { name: 'price_dist_entity', selector: e },
        { name: 'import_multiplier', selector: num },
      ])]),
      grid([
        { name: 'price_export_entity', selector: e },
        { name: 'export_multiplier', selector: num },
      ]),
    ]);
  }
}

export class AvionicsEnergyBalanceCardEditor extends EnergyEditor {
  protected formDefaults() {
    return { period: 'day', mode: 'kwh', cost_split: 'total', import_multiplier: 1, export_multiplier: 1, warmup_days: 7 };
  }
  protected schema() {
    return [
      { name: 'title', selector: { text: {} } },
      grid([this.sel('period', ['day', 'week', 'month']), this.sel('mode', ['kwh', 'pln']), this.sel('cost_split', ['total', 'split'])]),
      { name: 'house_entity', selector: { entity: {} } },
      this.priceSection(),
      schemaSection(this.t('en.editor.section.more'), [
        grid([
          { name: 'invert_chart', selector: { boolean: {} } },
          { name: 'sync', selector: { text: {} } },
        ]),
        grid([
          { name: 'energy_sync', selector: { boolean: {} } },
          { name: 'collection_key', selector: { text: {} } },
        ]),
        grid([
          { name: 'soc_entity', selector: { entity: {} } },
          { name: 'battery_capacity', selector: { number: { min: 0, max: 200, step: 0.1, mode: 'box' } } },
          { name: 'warmup_days', selector: { number: { min: 0, max: 30, step: 1, mode: 'box' } } },
        ]),
      ]),
    ];
  }
}

export class AvionicsDevicesCardEditor extends EnergyEditor {
  protected formDefaults() {
    return { period: 'day', mode: 'kwh', layout: 'bars', columns: 'auto', show_other: true, import_multiplier: 1 };
  }
  protected schema() {
    return [
      { name: 'title', selector: { text: {} } },
      grid([this.sel('period', ['day', 'week', 'month']), this.sel('mode', ['kwh', 'pln'])]),
      grid([this.sel('layout', ['bars', 'pie']), this.sel('columns', ['auto', '1', '2'])]),
      { name: 'entities', selector: { entity: { multiple: true } } },
      grid([
        { name: 'house_entity', selector: { entity: {} } },
        { name: 'show_other', selector: { boolean: {} } },
        { name: 'include_children', selector: { boolean: {} } },
      ]),
      this.priceSection(),
      schemaSection(this.t('en.editor.section.more'), [
        grid([
          { name: 'sync', selector: { text: {} } },
          { name: 'energy_sync', selector: { boolean: {} } },
          { name: 'collection_key', selector: { text: {} } },
        ]),
      ]),
    ];
  }
}
