import { html, svg, nothing } from 'lit';
import { niceStep } from '../cards/eis/config';

/**
 * Podzialka wykresow:
 *  off   - brak
 *  auto  - zakres danych na 4 rowne czesci
 *  nice  - rowne liczby (1 / 2 / 2,5 / 5 x 10^n)
 *  fixed - zadany krok (z opcjonalnym zakresem osi y_min / y_max)
 */
export type GridMode = 'off' | 'auto' | 'nice' | 'fixed';

export interface GridConfig {
  mode?: GridMode;
  step?: number;
}

/** Krok dla trybu nice / fixed (NaN dla off / auto). */
export function gridStep(lo: number, hi: number, g: GridConfig): number {
  if (g.mode === 'fixed' && g.step && g.step > 0) return g.step;
  if (g.mode === 'nice' || g.mode === 'fixed') return niceStep(hi - lo);
  return NaN;
}

/**
 * Dociagniecie zakresu do wielokrotnosci kroku (tryb nice / fixed) -
 * krawedzie wykresu wypadaja wtedy na liniach podzialki.
 */
export function snapRange(lo: number, hi: number, g: GridConfig): [number, number] {
  const st = gridStep(lo, hi, g);
  if (!Number.isFinite(st) || !(hi > lo)) return [lo, hi];
  return [Math.floor(lo / st + 1e-9) * st, Math.ceil(hi / st - 1e-9) * st];
}

/** Zakres osi z y_min / y_max: stale granice, rozszerzane tylko, gdy dane wychodza poza nie. */
export function fixedRange(lo: number, hi: number, yMin?: number, yMax?: number): [number, number] {
  const a = typeof yMin === 'number' && Number.isFinite(yMin) ? Math.min(yMin, lo) : lo;
  const b = typeof yMax === 'number' && Number.isFinite(yMax) ? Math.max(yMax, hi) : hi;
  return [a, b];
}

/** Wartosci linii podzialki wewnatrz (lo, hi). */
export function gridValues(lo: number, hi: number, g: GridConfig): number[] {
  if (!g.mode || g.mode === 'off' || !(hi > lo)) return [];
  if (g.mode === 'auto') return [1, 2, 3].map((k) => lo + ((hi - lo) * k) / 4);
  const st = gridStep(lo, hi, g);
  if (!(st > 0) || (hi - lo) / st > 40) return [];
  const out: number[] = [];
  for (let v = Math.ceil(lo / st - 1e-9) * st; v <= hi + 1e-9; v += st) {
    if (v > lo + 1e-9 && v < hi - 1e-9) out.push(Math.round(v / st) * st);
  }
  return out;
}

/** Podpis wartosci linii (bez zbednych zer). */
export function gridLabel(v: number, g: GridConfig, lo: number, hi: number): string {
  const st = gridStep(lo, hi, g);
  const d = Number.isFinite(st) ? Math.max(0, Math.min(3, -Math.floor(Math.log10(st) + 1e-9))) : 1;
  const dd = Number.isFinite(st) && st % 1 !== 0 ? Math.max(d, String(st).split('.')[1]?.length ?? 0) : d;
  return v.toFixed(Math.min(dd, 3)).replace('.', ',');
}

/** Linie w SVG (uklad wspolrzednych wykresu); y(v) -> wspolrzedna, width - szerokosc viewBox. */
export function gridSvg(values: number[], y: (v: number) => number, width: number) {
  return values.map(
    (v) => svg`<line class="grid-line" x1="0" x2=${width} y1=${y(v)} y2=${y(v)} vector-effect="non-scaling-stroke"
      stroke="rgba(255,255,255,0.13)" stroke-width="1"></line>`,
  );
}

/** Podpisy linii (HTML nad SVG); top w % wysokosci obszaru wykresu. */
export function gridLabels(
  values: number[],
  topPct: (v: number) => number,
  g: GridConfig,
  lo: number,
  hi: number,
  side: 'left' | 'right' = 'left',
) {
  if (!g.mode || g.mode === 'off' || g.mode === 'auto') return nothing;
  return values.map(
    (v) => html`<span
      class="grid-lbl"
      style="position:absolute;${side}:2px;top:${topPct(v)}%;transform:translateY(-50%);font-size:calc(var(--s, 1) * 9px);line-height:1;color:var(--avionics-dim-color,#9a9a9a);opacity:0.8;pointer-events:none"
      >${gridLabel(v, g, lo, hi)}</span
    >`,
  );
}

/** Pola edytora dla podzialki (wspolne dla kart). */
export function gridSchema(prefixName: string, stepName: string, t: (k: string) => string, mode?: string) {
  return [
    {
      name: prefixName,
      selector: {
        select: {
          mode: 'dropdown',
          options: ['off', 'auto', 'nice', 'fixed'].map((v) => ({ value: v, label: t(`grid.${v}`) })),
        },
      },
    },
    ...(mode === 'fixed' ? [{ name: stepName, selector: { number: { step: 0.1, mode: 'box' } } }] : []),
  ];
}
