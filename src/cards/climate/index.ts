import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsClimateCard } from './climate-card';

const lang = getLanguage();
registerCard(
  'avionics-climate-card',
  AvionicsClimateCard,
  {
    name: localize(lang, 'card.climate.name'),
    description: localize(lang, 'card.climate.description'),
  },
  ['g1000-climate-card'], // zgodnosc z wczesniejsza wersja
);
