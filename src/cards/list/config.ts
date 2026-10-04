import { clean } from '../eis/config';

export interface ListRowConfig {
  entity?: string;
  /** Druga wartosc - wyswietlana jako "a/b". */
  entity2?: string;
  name?: string;
  unit?: string;
  precision?: number;
  /** "+" przed wartoscia dodatnia. */
  show_sign?: boolean;
  /** Linia oddzielajaca nad wierszem. */
  separator?: boolean;
  warning_low?: number;
  caution_low?: number;
  caution_high?: number;
  warning_high?: number;
}

export interface ListCardConfig {
  type: string;
  title?: string;
  entities: Array<ListRowConfig | string>;
}

export function normalizeListRow(row: ListRowConfig | string): ListRowConfig {
  const r = typeof row === 'string' ? { entity: row } : row;
  return clean(r) as ListRowConfig;
}
