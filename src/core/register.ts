import type { CustomCardEntry } from '../types';
import { GridSnap } from './grid-snap';

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
  attachGridSnap(cls);
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

/** Dociaganie wysokosci do siatki sekcji - dopiete do kazdej karty przy rejestracji. */
function attachGridSnap(cls: CustomElementConstructor): void {
  const proto = cls.prototype as any;
  if (proto.__gridSnap) return;
  proto.__gridSnap = true;
  const updated = proto.updated;
  proto.updated = function (this: any, changed: unknown) {
    updated?.call(this, changed);
    (this.__snap ??= new GridSnap()).attach(this);
  };
  const disconnected = proto.disconnectedCallback;
  proto.disconnectedCallback = function (this: any) {
    disconnected?.call(this);
    this.__snap?.detach();
  };
}
