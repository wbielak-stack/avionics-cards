import type { ListRowConfig } from './config';
import {
  RowListEditor,
  schemaGrid as grid,
  schemaSection,
  zoneFields,
} from '../../core/row-list-editor';
import { zonesSummary } from '../../core/zones-summary';

/** Edytor listy: tylko to, co potrzebne do wiersza z wartoscia. */
export class AvionicsListCardEditor extends RowListEditor<ListRowConfig> {
  protected rowNotes(row: ListRowConfig) {
    const { summary, orderError } = zonesSummary(row, (k) => this.t(k));
    if (orderError) return [{ type: 'warning' as const, text: this.t('zones.order_error') }];
    return summary ? [{ type: 'info' as const, text: summary }] : [];
  }

  protected labelPrefix = 'list.editor.';

  protected cardSchema() {
    return [{ name: 'title', selector: { text: {} } }];
  }

  protected rowSchema() {
    return [
      { name: 'entity', required: true, selector: { entity: {} } },
      { name: 'name', selector: { text: {} } },
      grid([
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
      ]),
      grid([
        { name: 'show_sign', selector: { boolean: {} } },
        { name: 'separator', selector: { boolean: {} } },
      ]),
      schemaSection(this.t('list.editor.section.more'), [
        { name: 'entity2', selector: { entity: {} } },
        ...zoneFields(),
      ]),
    ];
  }
}
