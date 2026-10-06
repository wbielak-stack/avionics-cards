import type { HomeAssistant } from '../types';
import { num } from './format';
import { attrNum } from './attr';
import { TemplateSubscriptions, isTemplate } from './templates';

/** Zrodlo liczby: stala, encja, atrybut encji albo szablon (wyliczany przez HA). */
export interface NumberSource {
  value?: number;
  entity?: string;
  attribute?: string;
  template?: string;
}

/** Zarejestruj szablon zrodla w subskrypcjach (gdy jest). */
export function trackSource(
  hass: HomeAssistant,
  tpl: TemplateSubscriptions,
  key: string,
  src: NumberSource,
  onChange: () => void,
): void {
  tpl.ensure(hass, key, src.template, onChange);
}

/** Liczba ze zrodla; kolejnosc: szablon > atrybut > encja > stala. */
export function readSource(hass: HomeAssistant | undefined, tpl: TemplateSubscriptions, key: string, src: NumberSource): number {
  if (isTemplate(src.template)) return num(tpl.results.get(key));
  if (src.entity && src.attribute) return attrNum(hass, src.entity, src.attribute);
  if (src.entity) return num(hass?.states[src.entity]?.state);
  return typeof src.value === 'number' ? src.value : NaN;
}
