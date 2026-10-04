import type { Point } from './history';

export interface Spark {
  line: string;
  area: string;
  /** y linii zera w ukladzie 0..40, gdy zero lezy w zakresie wykresu */
  zeroY?: number;
}

/**
 * Sciezka wykresu w viewBox 0..100 x 0..40: usrednianie do `buckets` przedzialow,
 * luki = ostatnia znana wartosc, skala automatyczna z zapasem 10%
 * i minimalnym zakresem `minRange` (zeby szum nie wygladal dramatycznie).
 */
export function buildSpark(points: Point[], start: number, end: number, minRange: number, buckets = 96): Spark | undefined {
  const pts = points.filter((p) => p[0] >= start);
  if (pts.length < 2) return undefined;
  const step = (end - start) / buckets;
  const raw: Array<number | null> = [];
  let i = 0;
  for (let b = 0; b < buckets; b++) {
    const bEnd = start + (b + 1) * step;
    let sum = 0;
    let n = 0;
    while (i < pts.length && pts[i][0] < bEnd) {
      sum += pts[i][1];
      n++;
      i++;
    }
    raw.push(n ? sum / n : null);
  }
  let last = pts[0][1];
  const vals = raw.map((v) => (v === null ? last : (last = v)));

  const dMin = Math.min(...vals);
  const dMax = Math.max(...vals);
  const range = Math.max(minRange, (dMax - dMin) * 1.2, 1e-9);
  const lo = dMin - (range - (dMax - dMin)) / 2;
  const y = (v: number) => 40 - ((v - lo) / range) * 40;
  const x = (k: number) => (k / (buckets - 1)) * 100;

  let line = `M 0 ${y(vals[0]).toFixed(2)}`;
  for (let k = 1; k < buckets; k++) line += ` L ${x(k).toFixed(2)} ${y(vals[k]).toFixed(2)}`;
  const zero = y(0);
  return {
    line,
    area: `${line} L 100 40 L 0 40 Z`,
    zeroY: zero > 0 && zero < 40 ? zero : undefined,
  };
}
