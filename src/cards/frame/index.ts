import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsFrameCard } from './frame-card';
import { AvionicsFrameCardEditor } from './frame-editor';

if (!customElements.get('avionics-frame-card-editor')) {
  customElements.define('avionics-frame-card-editor', AvionicsFrameCardEditor);
}

const lang = getLanguage();
registerCard('avionics-frame-card', AvionicsFrameCard, {
  name: localize(lang, 'card.frame.name'),
  description: localize(lang, 'card.frame.description'),
});
