export type StyleMode = 'true' | 'look';

/**
 * Centralny przelacznik stylu calego zestawu - zmienna motywu HA:
 *   avionics-style: "true"  -> scisle wg kokpitu (etykiety biale, cyjan = nastawy)
 *   avionics-style: "look"  -> cyjanowe etykiety (domyslnie)
 * Stara nazwa g1000-style jest czytana jako zapas.
 */
export function readStyleMode(el: Element): StyleMode {
  const cs = getComputedStyle(el);
  const raw = (cs.getPropertyValue('--avionics-style') || cs.getPropertyValue('--g1000-style'))
    .trim()
    .replace(/["']/g, '');
  return raw === 'true' ? 'true' : 'look';
}
