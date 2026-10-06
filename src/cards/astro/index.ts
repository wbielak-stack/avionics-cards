import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsAstroCard } from './astro-card';
import { AvionicsAstroCardEditor } from './astro-editor';

if (!customElements.get('avionics-astro-card-editor')) {
  customElements.define('avionics-astro-card-editor', AvionicsAstroCardEditor);
}

const lang = getLanguage();
registerCard('avionics-astro-card', AvionicsAstroCard, {
  name: localize(lang, 'card.astro.name'),
  description: localize(lang, 'card.astro.description'),
});
