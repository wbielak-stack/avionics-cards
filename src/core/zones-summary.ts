export interface ZoneThresholds {
  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;
}

const has = (x?: number): x is number => typeof x === 'number' && Number.isFinite(x);
const f = (x: number) => String(x).replace('.', ',');

/**
 * Opis stref slowami, np. "< 0 alarm · 0–3 ostrzeżenie · > 3 norma",
 * oraz informacja, czy progi sa w poprawnej kolejnosci.
 */
export function zonesSummary(
  r: ZoneThresholds,
  t: (k: string) => string,
): { summary?: string; orderError: boolean } {
  const { warning_low: wl, caution_low: cl, caution_high: ch, warning_high: wh } = r;
  const defined = [wl, cl, ch, wh].filter(has);
  if (!defined.length) return { orderError: false };
  const orderError = defined.some((v, i) => i > 0 && v <= defined[i - 1]);
  if (orderError) return { orderError };

  const W = t('zones.warning');
  const C = t('zones.caution');
  const N = t('zones.normal');
  const parts: string[] = [];
  if (has(wl)) parts.push(`< ${f(wl)} ${W}`);
  if (has(cl)) parts.push(has(wl) ? `${f(wl)}–${f(cl)} ${C}` : `< ${f(cl)} ${C}`);
  const lo = has(cl) ? cl : has(wl) ? wl : undefined;
  const hi = has(ch) ? ch : has(wh) ? wh : undefined;
  if (lo !== undefined && hi !== undefined) parts.push(`${f(lo)}–${f(hi)} ${N}`);
  else if (lo !== undefined) parts.push(`> ${f(lo)} ${N}`);
  else if (hi !== undefined) parts.push(`< ${f(hi)} ${N}`);
  if (has(ch)) parts.push(has(wh) ? `${f(ch)}–${f(wh)} ${C}` : `> ${f(ch)} ${C}`);
  if (has(wh)) parts.push(`> ${f(wh)} ${W}`);
  return { summary: parts.join(' · '), orderError };
}
