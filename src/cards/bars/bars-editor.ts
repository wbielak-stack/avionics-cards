import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection, numberSel as n, zoneFields } from '../../core/row-list-editor';
import { resolveZones } from '../../core/zone-extras';
import { zonesSummary } from '../../core/zones-summary';
import { type BarsCardConfig, parseHoursDetailed } from './config';
import { gridSchema } from '../../core/grid';

export class AvionicsBarsCardEditor extends FormEditor<BarsCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'bars.editor.';

  protected formDefaults() {
    return {
      preset: 'pse_rce' as const,
      hours_back: 2,
      hours_forward: 22,
      multiplier: 1,
      offset: 0,
      final_multiplier: 1,
      good_direction: 'off' as const,
      show_midnight: true,
      grid: 'nice' as const,
    };
  }

  protected notes(c: BarsCardConfig) {
    const out: Array<{ type: 'info' | 'warning'; text: string }> = [];
    // wzor przeliczenia z wpisanymi liczbami
    const m = c.multiplier ?? 1;
    const off = c.offset ?? 0;
    const fm = c.final_multiplier ?? 1;
    if (m !== 1 || off !== 0 || fm !== 1) {
      const f = (x: number) => String(x).replace('.', ',');
      let expr = this.t('bars.formula.raw');
      if (m !== 1) expr = `${expr} × ${f(m)}`;
      if (off !== 0) expr = `${expr} ${off > 0 ? '+' : '−'} ${f(Math.abs(off))}`;
      if (fm !== 1) expr = off !== 0 ? `(${expr}) × ${f(fm)}` : `${expr} × ${f(fm)}`;
      out.push({ type: 'info', text: `${this.t('bars.formula.value')} = ${expr}` });
    }
    const { invalid } = parseHoursDetailed(c.band_hours);
    if (invalid.length) out.push({ type: 'warning', text: `${this.t('bars.band_invalid')} ${invalid.join(', ')}` });
    const { summary, orderError } = zonesSummary(resolveZones(this.hass, c as any), (k) => this.t(k));
    if (orderError) out.push({ type: 'warning', text: this.t('zones.order_error') });
    else if (summary) out.push({ type: 'info', text: summary });
    return out;
  }

  protected schema(c: BarsCardConfig) {
    const section = (title: string, schema: unknown[]) => schemaSection(this.t(title), schema);
    const line = (i: number) =>
      grid([
        { name: `line${i}`, selector: n() },
        { name: `line${i}_entity`, selector: { entity: {} } },
        { name: `line${i}_label`, selector: { text: {} } },
      ]);
    return [
      { name: 'entity', required: true, selector: { entity: {} } },
      { name: 'entity_next', selector: { entity: {} } },
      { name: 'name', selector: { text: {} } },
      {
        name: 'preset',
        selector: {
          select: {
            mode: 'dropdown',
            options: ['pse_rce', 'nordpool', 'entsoe', 'custom'].map((v) => ({
              value: v,
              label: this.t(`bars.editor.preset.${v}`),
            })),
          },
        },
      },
      ...(c.preset === 'custom'
        ? [
            { name: 'attribute', selector: { text: {} } },
            grid([
              { name: 'time_field', selector: { text: {} } },
              { name: 'value_field', selector: { text: {} } },
            ]),
            { name: 'time_is_end', selector: { boolean: {} } },
          ]
        : []),
      grid([
        { name: 'hours_back', selector: { number: { min: 0, max: 48, step: 1, mode: 'box' } } },
        { name: 'hours_forward', selector: { number: { min: 1, max: 48, step: 1, mode: 'box' } } },
        { name: 'show_midnight', selector: { boolean: {} } },
      ]),
      grid([
        { name: 'multiplier', selector: { number: { step: 0.00001, mode: 'box' } } },
        { name: 'offset', selector: { number: { step: 0.001, mode: 'box' } } },
        { name: 'final_multiplier', selector: { number: { step: 0.01, mode: 'box' } } },
      ]),
      grid([
        { name: 'unit', selector: { text: {} } },
        { name: 'precision', selector: { number: { min: 0, max: 4, step: 1, mode: 'box' } } },
      ]),
      grid(gridSchema('grid', 'grid_step', (k) => this.t(k), c.grid)),
      grid([
        { name: 'y_min', selector: n() },
        { name: 'y_max', selector: n() },
      ]),
      section('bars.editor.section.lines', [line(1), line(2), line(3)]),
      section('bars.editor.section.good', [
        {
          name: 'good_direction',
          selector: {
            select: {
              mode: 'dropdown',
              options: ['off', 'above', 'below'].map((v) => ({ value: v, label: this.t(`bars.editor.good_direction.${v}`) })),
            },
          },
        },
        ...(c.good_direction && c.good_direction !== 'off'
          ? [
              grid([
                { name: 'good_value', selector: n() },
                { name: 'good_entity', selector: { entity: {} } },
              ]),
            ]
          : []),
      ]),
      section('bars.editor.section.band', [{ name: 'band_hours', selector: { text: {} } }]),
      section('eis.editor.section.zones', zoneFields(!!(c as any).zones_from_entities)),
    ];
  }
}
