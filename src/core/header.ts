import { html, nothing, type TemplateResult } from 'lit';

/**
 * Wspolny naglowek kart (jak tytul okna w G1000): tytul zawsze na srodku, cyjanowy, wersaliki,
 * kreska pod spodem; dodatki (godzina, przyciski, kategoria) po lewej / prawej w tej samej linii.
 * Kolor, rozmiar i czcionka ze zmiennych motywu (avionics-title-color / -size / -font-family).
 */
export function cardHeader(
  title?: string,
  right?: TemplateResult | typeof nothing | string,
  left?: TemplateResult | typeof nothing | string,
): TemplateResult | typeof nothing {
  if (!title && !right && !left) return nothing;
  return html`<div class="av-head">
    <span class="av-side av-left">${left ?? nothing}</span>
    <span class="av-title">${title ?? ''}</span>
    <span class="av-side av-right">${right ?? nothing}</span>
  </div>`;
}
