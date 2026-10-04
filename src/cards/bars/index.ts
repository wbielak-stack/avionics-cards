import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsBarsCard } from './bars-card';
import { AvionicsBarsCardEditor } from './bars-editor';

if (!customElements.get('avionics-bars-card-editor')) {
  customElements.define('avionics-bars-card-editor', AvionicsBarsCardEditor);
}

const lang = getLanguage();
registerCard('avionics-bars-card', AvionicsBarsCard, {
  name: localize(lang, 'card.bars.name'),
  description: localize(lang, 'card.bars.description'),
});
