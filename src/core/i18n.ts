import type { HomeAssistant } from '../types';

type Dict = Record<string, string>;

const en: Dict = {
  'status.off_ac': 'A/C OFF',
  'status.off_mat': 'MAT OFF',
  'status.heat': 'HEATING',
  'status.cool': 'COOLING',
  'status.dry': 'DRYING',
  'status.fan_only': 'FAN',
  'status.auto': 'AUTO',
  'status.unavailable': 'OFFLINE',
  'status.unknown': 'NO DATA',
  'status.reference': 'REFERENCE',

  'label.unit': 'UNIT',
  'label.floor': 'FLOOR',
  'label.set': 'SET',
  'label.min': 'MIN',
  'label.max': 'MAX',
  'label.hum': 'HUM %',

  'badge.comfort': 'COMFORT',
  'badge.cold': 'COLD',
  'badge.hot': 'HOT',
  'badge.humid': 'HUMID',
  'badge.dry': 'DRY',
  'badge.stuffy': 'CO₂ HIGH',
  'badge.dust': 'DUST',

  'error.no_entity': 'Set a temperature sensor or a climate entity',

  'card.climate.name': 'Avionics Climate',
  'card.climate.description': 'Room tile with background graph and climate/heating-mat control',

  'editor.name': 'Name',
  'editor.mode': 'Tile type',
  'editor.mode.room': 'Room',
  'editor.mode.outdoor': 'Reference (outdoor)',
  'editor.temperature_entity': 'Temperature sensor',
  'editor.humidity_entity': 'Humidity sensor',
  'editor.climate_entity': 'Climate / heating mat',
  'editor.co2_entity': 'CO₂ sensor (optional)',
  'editor.pm25_entity': 'PM2.5 sensor (optional)',
  'editor.device_label': 'Device type',
  'editor.device_label.auto': 'Automatic',
  'editor.device_label.ac': 'Air conditioner',
  'editor.device_label.mat': 'Heating mat',
  'editor.section.comfort': 'Comfort thresholds',
  'editor.section.graph': 'Graph',
  'editor.t_min': 'Cold below [°C]',
  'editor.t_max': 'Hot above [°C]',
  'editor.h_min': 'Dry below [%]',
  'editor.h_max': 'Humid above [%]',
  'editor.co2_max': 'Stuffy above [ppm CO₂]',
  'editor.pm25_max': 'Dust above [µg/m³ PM2.5]',
  'editor.hours_to_show': 'Graph range [h]',
  'editor.px_per_degree': 'Max px per 1 °C',
  'editor.graph_style': 'Graph style',
  'editor.graph_style.color': 'Color (temperature thresholds)',
  'editor.graph_style.mono': 'Mono',
  'editor.graph_color': 'Mono graph color (hex)',
};

const pl: Dict = {
  'status.off_ac': 'KLIMA WYŁ',
  'status.off_mat': 'MATA WYŁ',
  'status.heat': 'GRZANIE',
  'status.cool': 'CHŁODZENIE',
  'status.dry': 'OSUSZANIE',
  'status.fan_only': 'WENTYLACJA',
  'status.auto': 'AUTO',
  'status.unavailable': 'BRAK ŁĄCZN.',
  'status.unknown': 'BRAK DANYCH',
  'status.reference': 'ODNIESIENIE',

  'label.unit': 'JEDN',
  'label.floor': 'PODŁ',
  'label.set': 'ZAD',
  'label.min': 'MIN',
  'label.max': 'MAX',
  'label.hum': 'WILG %',

  'badge.comfort': 'KOMFORT',
  'badge.cold': 'ZIMNO',
  'badge.hot': 'GORĄCO',
  'badge.humid': 'WILGOTNO',
  'badge.dry': 'SUCHO',
  'badge.stuffy': 'DUSZNO',
  'badge.dust': 'PYŁ',

  'error.no_entity': 'Podaj czujnik temperatury albo klimatyzator/matę',

  'card.climate.name': 'Avionics Klimat',
  'card.climate.description': 'Kafel pomieszczenia z wykresem w tle i sterowaniem klimatyzatorem/matą',

  'editor.name': 'Nazwa',
  'editor.mode': 'Rodzaj kafla',
  'editor.mode.room': 'Pomieszczenie',
  'editor.mode.outdoor': 'Odniesienie (zewnątrz)',
  'editor.temperature_entity': 'Czujnik temperatury',
  'editor.humidity_entity': 'Czujnik wilgotności',
  'editor.climate_entity': 'Klimatyzator / mata',
  'editor.co2_entity': 'Czujnik CO₂ (opcjonalnie)',
  'editor.pm25_entity': 'Czujnik PM2.5 (opcjonalnie)',
  'editor.device_label': 'Typ urządzenia',
  'editor.device_label.auto': 'Automatycznie',
  'editor.device_label.ac': 'Klimatyzator',
  'editor.device_label.mat': 'Mata grzewcza',
  'editor.section.comfort': 'Progi komfortu',
  'editor.section.graph': 'Wykres',
  'editor.t_min': 'Zimno poniżej [°C]',
  'editor.t_max': 'Gorąco powyżej [°C]',
  'editor.h_min': 'Sucho poniżej [%]',
  'editor.h_max': 'Wilgotno powyżej [%]',
  'editor.co2_max': 'Duszno powyżej [ppm CO₂]',
  'editor.pm25_max': 'Pył powyżej [µg/m³ PM2.5]',
  'editor.hours_to_show': 'Zakres wykresu [h]',
  'editor.px_per_degree': 'Maks. px na 1 °C',
  'editor.graph_style': 'Styl wykresu',
  'editor.graph_style.color': 'Kolorowy (progi temperatury)',
  'editor.graph_style.mono': 'Mono',
  'editor.graph_color': 'Kolor wykresu mono (hex)',
};

const DICTS: Record<string, Dict> = { en, pl };

/** Jezyk z obiektu hass, a gdy go nie ma (np. statyczny formularz edytora) - z frontendu HA. */
export function getLanguage(hass?: HomeAssistant): string {
  const h = hass ?? (document.querySelector('home-assistant') as any)?.hass;
  const lang: string = h?.locale?.language ?? h?.language ?? navigator.language ?? 'en';
  return lang.toLowerCase().split('-')[0];
}

/** Tlumaczenie; brak klucza w danym jezyku -> angielski -> sam klucz. */
export function localize(lang: string, key: string): string {
  return DICTS[lang]?.[key] ?? en[key] ?? key;
}
