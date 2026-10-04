import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsGraphCard } from './graph-card';
import { AvionicsGraphCardEditor } from './graph-editor';

if (!customElements.get('avionics-graph-card-editor')) {
  customElements.define('avionics-graph-card-editor', AvionicsGraphCardEditor);
}

const lang = getLanguage();
registerCard('avionics-graph-card', AvionicsGraphCard, {
  name: localize(lang, 'card.graph.name'),
  description: localize(lang, 'card.graph.description'),
});
