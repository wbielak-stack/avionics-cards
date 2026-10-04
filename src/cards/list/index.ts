import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsListCard } from './list-card';
import { AvionicsListCardEditor } from './list-editor';

if (!customElements.get('avionics-list-card-editor')) {
  customElements.define('avionics-list-card-editor', AvionicsListCardEditor);
}

const lang = getLanguage();
registerCard('avionics-list-card', AvionicsListCard, {
  name: localize(lang, 'card.list.name'),
  description: localize(lang, 'card.list.description'),
});
