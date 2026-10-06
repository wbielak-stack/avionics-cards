import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsForecastCard } from './forecast-card';
import { AvionicsForecastCardEditor } from './forecast-editor';

if (!customElements.get('avionics-forecast-card-editor')) {
  customElements.define('avionics-forecast-card-editor', AvionicsForecastCardEditor);
}

const lang = getLanguage();
registerCard('avionics-forecast-card', AvionicsForecastCard, {
  name: localize(lang, 'card.forecast.name'),
  description: localize(lang, 'card.forecast.description'),
});
