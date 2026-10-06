import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import { RADAR_DEFAULTS, type RadarCardConfig } from './config';

export class AvionicsRadarCardEditor extends FormEditor<RadarCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'radar.editor.';

  protected formDefaults() {
    return { ...RADAR_DEFAULTS };
  }

  protected schema() {
    const n = (min: number, max: number, step = 1) => ({ number: { min, max, step, mode: 'box' } });
    const b = (name: string) => ({ name, selector: { boolean: {} } });
    const sel = (keys: string[], prefix: string) => ({
      select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`${prefix}.${v}`) })) },
    });
    return [
      { name: 'title', selector: { text: {} } },
      grid([
        { name: 'zoom', selector: n(4, 10) },
        { name: 'height', selector: n(150, 900, 10) },
      ]),
      grid([
        { name: 'rings', selector: { text: {} } },
        { name: 'distance_unit', selector: sel(['km', 'nm'], 'radar.editor.distance_unit') },
      ]),
      grid([b('autoplay'), b('show_distances')]),
      schemaSection(this.t('radar.editor.section.more'), [
        grid([
          { name: 'basemap', selector: sel(['vector', 'esri_dark', 'osm', 'custom', 'none'], 'radar.editor.basemap') },
          { name: 'basemap_url', selector: { text: {} } },
        ]),
        grid([
          { name: 'vector_url', selector: { text: {} } },
        ]),
        grid([
          { name: 'style', selector: sel(['g1000', 'orig'], 'radar.editor.style') },
          { name: 'opacity', selector: n(0.1, 1, 0.05) },
        ]),
        grid([
          { name: 'map_brightness', selector: n(0.2, 1.5, 0.05) },
          { name: 'frame_ms', selector: n(200, 3000, 50) },
        ]),
        grid([
          { name: 'latitude', selector: n(-90, 90, 0.0001) },
          { name: 'longitude', selector: n(-180, 180, 0.0001) },
        ]),
      ]),
    ];
  }
}
