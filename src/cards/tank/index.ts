import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsTankCard } from './tank-card';
import { AvionicsTankCardEditor } from './tank-editor';

if (!customElements.get('avionics-tank-card-editor')) {
  customElements.define('avionics-tank-card-editor', AvionicsTankCardEditor);
}

const lang = getLanguage();
registerCard('avionics-tank-card', AvionicsTankCard, {
  name: localize(lang, 'card.tank.name'),
  description: localize(lang, 'card.tank.description'),
});
