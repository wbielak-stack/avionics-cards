import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsRadarCard } from './radar-card';
import { AvionicsRadarCardEditor } from './radar-editor';

if (!customElements.get('avionics-radar-card-editor')) {
  customElements.define('avionics-radar-card-editor', AvionicsRadarCardEditor);
}

const lang = getLanguage();
registerCard('avionics-radar-card', AvionicsRadarCard, {
  name: localize(lang, 'card.radar.name'),
  description: localize(lang, 'card.radar.description'),
});
