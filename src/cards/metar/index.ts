import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsMetarCard } from './metar-card';
import { AvionicsMetarCardEditor } from './metar-editor';

if (!customElements.get('avionics-metar-card-editor')) {
  customElements.define('avionics-metar-card-editor', AvionicsMetarCardEditor);
}

const lang = getLanguage();
registerCard('avionics-metar-card', AvionicsMetarCard, {
  name: localize(lang, 'card.metar.name'),
  description: localize(lang, 'card.metar.description'),
});
