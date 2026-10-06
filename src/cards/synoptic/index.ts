import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsSynopticCard } from './synoptic-card';
import { AvionicsSynopticCardEditor } from './synoptic-editor';

if (!customElements.get('avionics-synoptic-card-editor')) {
  customElements.define('avionics-synoptic-card-editor', AvionicsSynopticCardEditor);
}

const lang = getLanguage();
registerCard('avionics-synoptic-card', AvionicsSynopticCard, {
  name: localize(lang, 'card.synoptic.name'),
  description: localize(lang, 'card.synoptic.description'),
});
