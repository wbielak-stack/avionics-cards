import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import { FORECAST_DEFAULTS, type ForecastCardConfig } from './config';

export class AvionicsForecastCardEditor extends FormEditor<ForecastCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'fc.editor.';

  protected formDefaults() {
    return { ...FORECAST_DEFAULTS };
  }

  protected schema(c: ForecastCardConfig) {
    const sel = (keys: string[], prefix: string) => ({
      select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`${prefix}.${v}`) })) },
    });
    const n = (step = 1) => ({ number: { step, mode: 'box' } });
    const b = (name: string) => ({ name, selector: { boolean: {} } });
    return [
      { name: 'title', selector: { text: {} } },
      grid([
        { name: 'view', selector: sel(['next', 'tomorrow'], 'fc.editor.view') },
        { name: 'hours', selector: { number: { min: 6, max: 60, step: 1, mode: 'box' } } },
        { name: 'offset_hours', selector: { number: { min: 0, max: 48, step: 1, mode: 'box' } } },
      ]),
      grid([
        b('show_buttons'),
        { name: 'size', selector: sel(['auto', 'compact', 'normal', 'large'], 'fc.editor.size') },
      ]),
      schemaSection(this.t('fc.editor.section.rows'), [
        grid([b('show_clouds'), b('show_fog'), b('show_precip')]),
        grid([b('show_temperature'), b('show_pressure'), b('show_wind')]),
        b('show_pv'),
      ]),
      schemaSection(this.t('fc.editor.section.units'), [
        grid([
          { name: 'cloud_mode', selector: sel(['okta', 'percent'], 'fc.editor.cloud_mode') },
          { name: 'wind_unit', selector: sel(['kn', 'kmh', 'ms', 'mph'], 'fc.unit') },
        ]),
        grid([
          { name: 'gust_caution', selector: n() },
          { name: 'gust_warning', selector: n() },
        ]),
      ]),
      ...(c.show_pv
        ? [
            schemaSection(this.t('fc.editor.section.pv'), [
              { name: 'pv_source', selector: sel(['calculated', 'entity'], 'fc.editor.pv_source') },
              ...(c.pv_source === 'entity'
                ? [
                    grid([
                      { name: 'pv_entity', selector: { entity: {} } },
                      { name: 'pv_preset', selector: sel(['solcast', 'open_meteo_solar', 'custom'], 'fc.editor.pv_preset') },
                    ]),
                    ...(c.pv_preset === 'custom'
                      ? [
                          grid([
                            { name: 'pv_attribute', selector: { text: {} } },
                            { name: 'pv_time_field', selector: { text: {} } },
                            { name: 'pv_value_field', selector: { text: {} } },
                          ]),
                          { name: 'pv_multiplier', selector: n(0.001) },
                        ]
                      : []),
                  ]
                : [
                    grid([
                      { name: 'pv_kwp', selector: n(0.1) },
                      { name: 'pv_efficiency', selector: n(0.01) },
                    ]),
                    grid([
                      { name: 'pv_tilt', selector: n() },
                      { name: 'pv_azimuth', selector: n() },
                    ]),
                  ]),
            ]),
          ]
        : []),
      schemaSection(this.t('fc.editor.section.location'), [
        grid([
          { name: 'latitude', selector: n(0.0001) },
          { name: 'longitude', selector: n(0.0001) },
        ]),
      ]),
    ];
  }
}
