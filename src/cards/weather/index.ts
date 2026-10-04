import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsWeatherCard } from './weather-card';
import { AvionicsWeatherCardEditor } from './weather-editor';

if (!customElements.get('avionics-weather-card-editor')) {
  customElements.define('avionics-weather-card-editor', AvionicsWeatherCardEditor);
}

const lang = getLanguage();
registerCard('avionics-weather-card', AvionicsWeatherCard, {
  name: localize(lang, 'card.weather.name'),
  description: localize(lang, 'card.weather.description'),
});
