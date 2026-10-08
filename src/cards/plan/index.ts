import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsPlanCard, AvionicsLegCard, AvionicsDayProfileCard, AvionicsTasksCard, AvionicsDayPlanCard } from './cards';
import {
  AvionicsPlanCardEditor,
  AvionicsLegCardEditor,
  AvionicsDayProfileCardEditor,
  AvionicsTasksCardEditor,
  AvionicsDayPlanCardEditor,
} from './editors';

const editors: Array<[string, CustomElementConstructor]> = [
  ['avionics-plan-card-editor', AvionicsPlanCardEditor],
  ['avionics-leg-card-editor', AvionicsLegCardEditor],
  ['avionics-day-profile-card-editor', AvionicsDayProfileCardEditor],
  ['avionics-tasks-card-editor', AvionicsTasksCardEditor],
  ['avionics-day-plan-card-editor', AvionicsDayPlanCardEditor],
];
for (const [tag, cls] of editors) if (!customElements.get(tag)) customElements.define(tag, cls);

const lang = getLanguage();
const reg = (tag: string, cls: CustomElementConstructor, key: string) =>
  registerCard(tag, cls, { name: localize(lang, `card.${key}.name`), description: localize(lang, `card.${key}.description`) });
reg('avionics-plan-card', AvionicsPlanCard, 'plan');
reg('avionics-leg-card', AvionicsLegCard, 'leg');
reg('avionics-day-profile-card', AvionicsDayProfileCard, 'dayprofile');
reg('avionics-tasks-card', AvionicsTasksCard, 'tasks');
reg('avionics-day-plan-card', AvionicsDayPlanCard, 'dayplan');
