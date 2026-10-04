import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsWindCard } from './wind-card';
import { AvionicsWindGraphCard } from './wind-graph-card';
import { AvionicsWindCardEditor, AvionicsWindGraphCardEditor } from './wind-editors';

if (!customElements.get('avionics-wind-card-editor')) {
  customElements.define('avionics-wind-card-editor', AvionicsWindCardEditor);
}
if (!customElements.get('avionics-wind-graph-card-editor')) {
  customElements.define('avionics-wind-graph-card-editor', AvionicsWindGraphCardEditor);
}

const lang = getLanguage();
registerCard('avionics-wind-card', AvionicsWindCard, {
  name: localize(lang, 'card.wind.name'),
  description: localize(lang, 'card.wind.description'),
});
registerCard('avionics-wind-graph-card', AvionicsWindGraphCard, {
  name: localize(lang, 'card.windgraph.name'),
  description: localize(lang, 'card.windgraph.description'),
});
