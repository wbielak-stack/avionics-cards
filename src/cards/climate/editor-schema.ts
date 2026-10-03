import { localize } from '../../core/i18n';

/** Formularz edytora UI (getConfigForm) - etykiety w jezyku frontendu. */
export function buildClimateSchema(lang: string) {
  const t = (k: string) => localize(lang, k);
  const num = (min: number, max: number, step: number) => ({ number: { min, max, step, mode: 'box' } });
  const select = (keys: string[], prefix: string) => ({
    select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: t(`${prefix}.${v}`) })) },
  });

  return {
    schema: [
      { name: 'name', selector: { text: {} } },
      { name: 'mode', selector: select(['room', 'outdoor'], 'editor.mode') },
      { name: 'temperature_entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'temperature' }] } } },
      { name: 'humidity_entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'humidity' }] } } },
      { name: 'climate_entity', selector: { entity: { filter: [{ domain: 'climate' }] } } },
      { name: 'co2_entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'carbon_dioxide' }] } } },
      { name: 'pm25_entity', selector: { entity: { filter: [{ domain: 'sensor', device_class: 'pm25' }] } } },
      { name: 'device_label', selector: select(['auto', 'ac', 'mat'], 'editor.device_label') },
      {
        type: 'expandable',
        flatten: true,
        name: '',
        title: t('editor.section.comfort'),
        schema: [
          { name: 't_min', selector: num(-10, 30, 0.5) },
          { name: 't_max', selector: num(10, 40, 0.5) },
          { name: 'h_min', selector: num(0, 100, 1) },
          { name: 'h_max', selector: num(0, 100, 1) },
          { name: 'co2_max', selector: num(400, 5000, 50) },
          { name: 'pm25_max', selector: num(1, 500, 1) },
        ],
      },
      {
        type: 'expandable',
        flatten: true,
        name: '',
        title: t('editor.section.graph'),
        schema: [
          { name: 'hours_to_show', selector: num(1, 168, 1) },
          { name: 'px_per_degree', selector: num(2, 60, 1) },
          { name: 'graph_style', selector: select(['color', 'mono'], 'editor.graph_style') },
          { name: 'graph_color', selector: { text: {} } },
        ],
      },
    ],
    computeLabel: (s: { name: string }) => t(`editor.${s.name}`),
  };
}
