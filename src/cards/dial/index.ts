import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsDialCard } from './dial-card';
import { AvionicsDialCardEditor } from './dial-editor';

if (!customElements.get('avionics-dial-card-editor')) {
  customElements.define('avionics-dial-card-editor', AvionicsDialCardEditor);
}

const lang = getLanguage();
registerCard('avionics-dial-card', AvionicsDialCard, {
  name: localize(lang, 'card.dial.name'),
  description: localize(lang, 'card.dial.description'),
});
