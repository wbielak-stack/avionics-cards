import { clean } from '../eis/config';

/** Akcja HA w standardowym formacie (perform-action, toggle, navigate, ...), z opcjonalnym potwierdzeniem. */
export type ActionConfig = Record<string, unknown>;

export interface SoftkeyConfig {
  name?: string;
  icon?: string;
  /** opis pod nazwa - tekst albo szablon Jinja */
  secondary?: string;
  tap_action?: ActionConfig;
  /** akcja po przytrzymaniu (w kazdym stanie) */
  hold_action?: ActionConfig;

  /** encja i stan, przy ktorych funkcja jest aktywna (trwa) */
  active_entity?: string;
  active_state?: string;
  /** kolor stanu aktywnego: ok (zielony, domyslnie), caution (bursztyn), warning (czerwony) */
  active_color?: 'ok' | 'caution' | 'warning';
  /** stan aktywny z szablonu (prawda/falsz) - pierwszenstwo przed active_entity */
  active_template?: string;
  /** stan uzbrojony (oczekiwanie): biala lampka i etykieta, jak uzbrojone tryby autopilota */
  armed_entity?: string;
  armed_state?: string;
  armed_template?: string;
  active_name?: string;
  active_secondary?: string;
  /** akcja podczas trwania (np. zatrzymanie) */
  active_tap_action?: ActionConfig;

  /** ustawiana wartosc: input_number / number */
  value_entity?: string;

  /**
   * postep na skali bezwzglednej (jak pasek EIS): bialy wskaznik = biezaca,
   * cyjanowy znacznik = cel, pusty = start. Encje albo liczby.
   */
  progress_start?: string | number;
  progress_current?: string | number;
  progress_target?: string | number;
  /** zakres skali paska (domyslnie 0-100) */
  progress_min?: number;
  progress_max?: number;
}

export interface SoftkeysCardConfig {
  type: string;
  title?: string;
  /** list = kafle jeden pod drugim, row = rzad softkeyow */
  layout?: 'list' | 'row';
  /** lamp = lampka jak klawisze autopilota (domyslnie), inverse = pasek naglowka w inwersji */
  key_style?: 'lamp' | 'inverse';
  entities: Array<SoftkeyConfig>;
}

export function normalizeKey(k: SoftkeyConfig): SoftkeyConfig {
  return { active_state: 'on', progress_min: 0, progress_max: 100, ...clean(k) } as SoftkeyConfig;
}
