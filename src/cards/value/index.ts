import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsValueCard } from './value-card';
import { AvionicsValueCardEditor } from './value-editor';

if (!customElements.get('avionics-value-card-editor')) {
  customElements.define('avionics-value-card-editor', AvionicsValueCardEditor);
}

const lang = getLanguage();
registerCard('avionics-value-card', AvionicsValueCard, {
  name: localize(lang, 'card.value.name'),
  description: localize(lang, 'card.value.description'),
});
