import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsSoftkeysCard } from './softkeys-card';
import { AvionicsSoftkeysCardEditor } from './softkeys-editor';

if (!customElements.get('avionics-softkeys-card-editor')) {
  customElements.define('avionics-softkeys-card-editor', AvionicsSoftkeysCardEditor);
}

const lang = getLanguage();
registerCard('avionics-softkeys-card', AvionicsSoftkeysCard, {
  name: localize(lang, 'card.softkeys.name'),
  description: localize(lang, 'card.softkeys.description'),
});
