import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsGoalCard } from './goal-card';
import { AvionicsGoalCardEditor } from './goal-editor';

if (!customElements.get('avionics-goal-card-editor')) {
  customElements.define('avionics-goal-card-editor', AvionicsGoalCardEditor);
}

const lang = getLanguage();
registerCard('avionics-goal-card', AvionicsGoalCard, {
  name: localize(lang, 'card.goal.name'),
  description: localize(lang, 'card.goal.description'),
});
