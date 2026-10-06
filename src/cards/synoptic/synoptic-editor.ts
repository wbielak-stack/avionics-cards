import { RowListEditor, schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import type { SynopticNode, SynopticCardConfig } from './config';

/** Edytor synoptyki: lista wezlow (dodawanie, kolejnosc) + falownik i ENDUR. W YAML zapisuje `nodes`. */
export class AvionicsSynopticCardEditor extends RowListEditor<SynopticNode & { entity: string }> {
  protected labelPrefix = 'syn.editor.';

  setConfig(config: any): void {
    super.setConfig({ ...config, entities: config.nodes ?? config.entities ?? [] });
  }

  protected toCardConfig(config: any): object {
    const { entities, ...rest } = config;
    return { ...rest, nodes: entities };
  }

  protected cardSchema() {
    const tx = { text: {} };
    const e = { entity: {} };
    return [
      { name: 'title', selector: tx },
      schemaSection(this.t('syn.editor.section.inverter'), [
        {
          type: 'expandable',
          name: 'inverter',
          title: this.t('syn.editor.inverter_fields'),
          expanded: true,
          schema: [
            grid([
              { name: 'name', selector: tx },
              { name: 'model', selector: tx },
            ]),
            grid([
              { name: 'entity', selector: e },
              { name: 'multiplier', selector: { number: { step: 0.001, mode: 'box' } } },
            ]),
            { name: 'temp_entity', selector: e },
            grid([
              { name: 'status_entity', selector: e },
              { name: 'efficiency_entity', selector: e },
            ]),
          ],
        },
      ]),
      schemaSection(this.t('syn.editor.section.buses'), [
        grid([
          { name: 'pv_power_entity', selector: e },
          { name: 'pv_energy_entity', selector: e },
        ]),
        grid([
          { name: 'dc_voltage_entity', selector: e },
          { name: 'dc_current_entity', selector: e },
          { name: 'dc_power_entity', selector: e },
        ]),
        { name: 'ac_voltage_entities', selector: { entity: { multiple: true } } },
        { name: 'ac_current_entities', selector: { entity: { multiple: true } } },
        { name: 'ac_power_entities', selector: { entity: { multiple: true } } },
      ]),
      schemaSection(this.t('syn.editor.section.more'), [
        grid([
          { name: 'unit', selector: tx },
          { name: 'deadband', selector: { number: { step: 0.01, mode: 'box' } } },
        ]),
        grid([
          { name: 'status_positive', selector: tx },
          { name: 'status_negative', selector: tx },
        ]),
        grid([
          { name: 'endurance_entity', selector: e },
          { name: 'endurance_attribute', selector: tx },
        ]),
      ]),
    ];
  }

  protected rowFormDefaults(): Partial<SynopticNode> {
    return { kind: 'load', multiplier: 1 };
  }

  protected rowSchema(row: SynopticNode) {
    const sel = (keys: string[], prefix: string) => ({
      select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`${prefix}.${v}`) })) },
    });
    const kind = row.kind ?? 'load';
    return [
      grid([
        { name: 'name', selector: { text: {} } },
        { name: 'kind', selector: sel(['source', 'storage', 'load', 'grid'], 'syn.editor.kind') },
        { name: 'bus', selector: sel(['dc', 'ac'], 'syn.editor.bus') },
      ]),
      grid([
        { name: 'entity', selector: { entity: {} } },
        { name: 'multiplier', selector: { number: { step: 0.001, mode: 'box' } } },
        { name: 'invert', selector: { boolean: {} } },
      ]),
      // osobna encja kierunku ujemnego - gdy integracja podaje import i eksport (albo ladowanie i rozladowanie) osobno
      ...(kind === 'grid' || kind === 'storage' ? [{ name: 'entity_negative', selector: { entity: {} } }] : []),
      ...(kind === 'storage' ? [{ name: 'soc_entity', selector: { entity: {} } }] : []),
      ...(kind === 'source' || kind === 'storage'
        ? [
            grid([
              { name: 'voltage_entity', selector: { entity: {} } },
              { name: 'current_entity', selector: { entity: {} } },
            ]),
          ]
        : []),
      ...(kind === 'load' ? [{ name: 'available_entity', selector: { entity: {} } }] : []),
      ...(kind === 'grid'
        ? [
            grid([
              { name: 'connected_entity', selector: { entity: {} } },
              { name: 'connected_state', selector: { text: {} } },
            ]),
          ]
        : []),
    ];
  }
}
