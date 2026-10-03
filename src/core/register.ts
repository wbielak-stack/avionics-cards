import type { CustomCardEntry } from '../types';

/**
 * Rejestracja karty + wpis do okna "Dodaj karte".
 * `aliases` - stare nazwy typu, zeby istniejace dashboardy dalej dzialaly.
 */
export function registerCard(
  tag: string,
  cls: CustomElementConstructor,
  entry: Omit<CustomCardEntry, 'type'>,
  aliases: string[] = [],
): void {
  if (!customElements.get(tag)) customElements.define(tag, cls);
  for (const alias of aliases) {
    // ta sama klasa nie moze byc zarejestrowana dwa razy - alias to podklasa
    if (!customElements.get(alias)) {
      const Alias = class extends (cls as typeof HTMLElement) {} as CustomElementConstructor;
      customElements.define(alias, Alias);
    }
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === tag)) {
    window.customCards.push({ type: tag, preview: true, ...entry });
  }
}
