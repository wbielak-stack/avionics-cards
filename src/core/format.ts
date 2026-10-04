/** Liczba z encji albo NaN. */
export const num = (s: unknown): number => {
  const n = parseFloat(String(s));
  return Number.isFinite(n) ? n : NaN;
};

/** Format z przecinkiem dziesietnym (styl kokpitu), brak wartosci -> "--,-". */
export const fmt = (v: number, digits = 1): string =>
  Number.isFinite(v) ? v.toFixed(digits).replace('.', ',') : '--,-';

/** Liczba calkowita albo "--". */
export const fmtInt = (v: number): string => (Number.isFinite(v) ? String(Math.round(v)) : '--');

/** Separator pary wartosci a / b - ze spacjami, zeby liczby sie nie zlewaly. */
export const PAIR_SEP = ' / ';
