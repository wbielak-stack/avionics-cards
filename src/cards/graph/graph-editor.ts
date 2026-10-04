import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection, numberSel as n } from '../../core/row-list-editor';
import type { GraphCardConfig } from './config';

export class AvionicsGraphCardEditor extends FormEditor<GraphCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'graph.editor.';

  protected formDefaults() {
    return {
      ranges: '12, 24, 48',
      default_range: 24,
      scale: 'auto' as const,
      span: 20,
      multiplier: 1,
      graph_style: 'mono' as const,
    };
  }

  protected schema(c: GraphCardConfig) {
    return [
      { name: 'entity', required: true, selector: { entity: {} } },
      { name: 'name', selector: { text: {} } },
      grid([
        { name: 'ranges', selector: { text: {} } },
        { name: 'default_range', selector: { number: { min: 1, max: 168, step: 1, mode: 'box' } } },
      ]),
      grid([
        {
          name: 'scale',
          selector: {
            select: {
              mode: 'dropdown',
              options: ['auto', 'fixed'].map((v) => ({ value: v, label: this.t(`graph.editor.scale.${v}`) })),
            },
          },
        },
        ...(c.scale === 'fixed' ? [{ name: 'span', selector: n() }] : []),
      ]),
      schemaSection(this.t('graph.editor.section.more'), [
        grid([
          { name: 'reference', selector: n() },
          { name: 'reference_label', selector: { text: {} } },
        ]),
        grid([
          { name: 'unit', selector: { text: {} } },
          { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
        ]),
        grid([
          {
            name: 'graph_style',
            selector: {
              select: {
                mode: 'dropdown',
                options: ['mono', 'temperature'].map((v) => ({ value: v, label: this.t(`graph.editor.graph_style.${v}`) })),
              },
            },
          },
          ...(c.graph_style !== 'temperature' ? [{ name: 'color', selector: { text: {} } }] : []),
        ]),
        { name: 'multiplier', selector: { number: { step: 0.001, mode: 'box' } } },
      ]),
    ];
  }
}
