import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsEnduranceCard } from './endurance-card';
import { AvionicsEnduranceCardEditor } from './endurance-editor';

if (!customElements.get('avionics-endurance-card-editor')) {
  customElements.define('avionics-endurance-card-editor', AvionicsEnduranceCardEditor);
}

const lang = getLanguage();
registerCard('avionics-endurance-card', AvionicsEnduranceCard, {
  name: localize(lang, 'card.endurance.name'),
  description: localize(lang, 'card.endurance.description'),
});
