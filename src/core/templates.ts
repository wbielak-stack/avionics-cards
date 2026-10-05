import type { HomeAssistant } from '../types';

/** Czy tekst jest szablonem Jinja (wymaga wyliczenia przez HA). */
export const isTemplate = (s?: string): boolean => !!s && /\{\{|\{%/.test(s);

/**
 * Subskrypcje szablonow przez HA (`render_template`) - wynik wraca przy kazdej zmianie
 * encji uzytych w szablonie, tak jak w kartach mushroom.
 */
export class TemplateSubscriptions {
  private subs = new Map<string, { template: string; unsub?: () => void }>();
  readonly results = new Map<string, string>();

  /** Upewnij sie, ze `key` subskrybuje `template`; `onChange` po kazdym nowym wyniku. */
  ensure(hass: HomeAssistant, key: string, template: string | undefined, onChange: () => void): void {
    const cur = this.subs.get(key);
    if (!template || !isTemplate(template)) {
      if (cur) this.drop(key);
      return;
    }
    if (cur?.template === template) return;
    if (cur) this.drop(key);
    const entry: { template: string; unsub?: () => void } = { template };
    this.subs.set(key, entry);
    const conn = (hass as any).connection;
    if (!conn?.subscribeMessage) return;
    conn
      .subscribeMessage(
        (msg: { result?: unknown; error?: string }) => {
          this.results.set(key, msg.error ? '' : String(msg.result ?? ''));
          onChange();
        },
        { type: 'render_template', template, strict: false, report_errors: false },
      )
      .then((u: () => void) => {
        if (this.subs.get(key) === entry) entry.unsub = u;
        else u();
      })
      .catch(() => undefined);
  }

  private drop(key: string): void {
    this.subs.get(key)?.unsub?.();
    this.subs.delete(key);
    this.results.delete(key);
  }

  clear(): void {
    for (const k of [...this.subs.keys()]) this.drop(k);
  }
}
