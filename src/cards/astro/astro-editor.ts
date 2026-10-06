import { FormEditor } from '../../core/form-editor';
import { schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import type { AstroCardConfig } from './astro-card';

export class AvionicsAstroCardEditor extends FormEditor<AstroCardConfig & Record<string, unknown>> {
  protected labelPrefix = 'astro.editor.';

  protected formDefaults() {
    return { show_profile: true, show_sun: true, show_moon: true };
  }

  protected schema() {
    const b = (name: string) => ({ name, selector: { boolean: {} } });
    const n = (min: number, max: number) => ({ number: { min, max, step: 0.0001, mode: 'box' } });
    return [
      { name: 'title', selector: { text: {} } },
      grid([b('show_profile'), b('show_sun'), b('show_moon')]),
      schemaSection(this.t('astro.editor.section.location'), [
        grid([
          { name: 'latitude', selector: n(-90, 90) },
          { name: 'longitude', selector: n(-180, 180) },
        ]),
      ]),
    ];
  }
}
