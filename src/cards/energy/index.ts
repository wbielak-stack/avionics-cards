import { registerCard } from '../../core/register';
import { getLanguage, localize } from '../../core/i18n';
import { AvionicsEnergyBalanceCard, AvionicsDevicesCard } from './cards';
import { AvionicsEnergyBalanceCardEditor, AvionicsDevicesCardEditor } from './editors';

if (!customElements.get('avionics-energy-balance-card-editor')) customElements.define('avionics-energy-balance-card-editor', AvionicsEnergyBalanceCardEditor);
if (!customElements.get('avionics-devices-card-editor')) customElements.define('avionics-devices-card-editor', AvionicsDevicesCardEditor);

const lang = getLanguage();
registerCard('avionics-energy-balance-card', AvionicsEnergyBalanceCard, {
  name: localize(lang, 'card.balance.name'),
  description: localize(lang, 'card.balance.description'),
});
registerCard('avionics-devices-card', AvionicsDevicesCard, {
  name: localize(lang, 'card.devices.name'),
  description: localize(lang, 'card.devices.description'),
});
