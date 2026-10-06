import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsCylinderCard } from './cylinder-card';
import { AvionicsCylinderCardEditor } from './cylinder-editor';

if (!customElements.get('avionics-cylinder-card-editor')) {
  customElements.define('avionics-cylinder-card-editor', AvionicsCylinderCardEditor);
}

const lang = getLanguage();
registerCard('avionics-cylinder-card', AvionicsCylinderCard, {
  name: localize(lang, 'card.cylinder.name'),
  description: localize(lang, 'card.cylinder.description'),
});
