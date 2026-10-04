import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsEisCard } from './eis-card';
import { AvionicsEisCardEditor } from './eis-editor';

if (!customElements.get('avionics-eis-card-editor')) {
  customElements.define('avionics-eis-card-editor', AvionicsEisCardEditor);
}

const lang = getLanguage();
registerCard('avionics-eis-card', AvionicsEisCard, {
  name: localize(lang, 'card.eis.name'),
  description: localize(lang, 'card.eis.description'),
});
