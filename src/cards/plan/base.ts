import { LitElement } from 'lit';
import { state } from 'lit/decorators.js';
import type { HomeAssistant } from '../../types';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { localize, getLanguage } from '../../core/i18n';
import { fetchEvents, fetchTodos, type PlanCalendar, type PlanEvent, type PlanTodo, type TodoItem } from '../../core/plan/data';
import type { RoutineRules } from '../../core/plan/model';

/** Wspolna konfiguracja kart planu. */
export interface PlanBaseConfig {
  type: string;
  title?: string;
  calendars?: Array<PlanCalendar | string>;
  todos?: Array<PlanTodo | string>;
  /** znaczniki list zadan po przecinku (w kolejnosci list) */
  todo_tags?: string;
  routine_daily?: boolean;
  routine_keyword?: string;
  routine_names?: string;
  day_start?: number;
  day_end?: number;
  min_gap?: number;
}

const asCal = (c: PlanCalendar | string): PlanCalendar => (typeof c === 'string' ? { entity: c } : c);

/**
 * Baza kart planu: pobieranie wydarzen i zadan (wspolna pamiec podreczna), odswiezanie co minute,
 * reguly rutyny z konfiguracji.
 */
export abstract class PlanBase<C extends PlanBaseConfig> extends LitElement {
  @state() protected _config?: C;
  @state() protected _styleMode: StyleMode = 'look';
  @state() protected _events: PlanEvent[] = [];
  @state() protected _todos: TodoItem[] = [];
  @state() protected _tick = 0;
  protected _hass?: HomeAssistant;
  private _key = '';
  private _timer?: number;

  /** okno pobierania wydarzen */
  protected abstract range(now: number): { from: number; to: number };
  protected wantsTodos(): boolean {
    return (this._config?.todos?.length ?? 0) > 0;
  }

  setConfig(config: C): void {
    this._config = config;
    this._key = '';
  }

  getGridOptions() {
    return { columns: 12, min_columns: 4 };
  }

  protected cals(): PlanCalendar[] {
    return (this._config?.calendars ?? []).map(asCal).filter((c) => c.entity);
  }

  protected lists(): PlanTodo[] {
    const tags = (this._config?.todo_tags ?? '').split(',').map((s) => s.trim());
    return (this._config?.todos ?? [])
      .map((x, i) => (typeof x === 'string' ? { entity: x, tag: tags[i] || undefined } : x))
      .filter((l) => l.entity);
  }

  protected rules(): RoutineRules {
    const c = this._config!;
    return {
      daily: c.routine_daily !== false,
      keyword: c.routine_keyword ?? '#rutyna',
      names: (c.routine_names ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    };
  }

  protected t = (k: string) => localize(getLanguage(this._hass), k);
  protected get uiLang(): string {
    return getLanguage(this._hass);
  }

  connectedCallback(): void {
    super.connectedCallback();
    // ETE / ETA i "teraz" przesuwaja sie z czasem
    this._timer = window.setInterval(() => {
      this._tick++;
      this._key = '';
      if (this._hass) this.hass = this._hass;
    }, 60000);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    const ids = [...this.cals().map((c) => c.entity), ...this.lists().map((l) => l.entity)];
    const mode = readStyleMode(this);
    const key = ids.map((id) => hass.states[id]?.last_updated ?? '').join('|') + `|${mode}|${this._tick}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    void this._load(hass);
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Ponowne pobranie danych dla biezacego okna (np. po przesunieciu widoku). */
  protected refresh(): void {
    this._key = '';
    if (this._hass) this.hass = this._hass;
  }

  private async _load(hass: HomeAssistant): Promise<void> {
    const r = this.range(Date.now());
    const [ev, td] = await Promise.all([
      fetchEvents(hass, this.cals(), r.from, r.to),
      this.wantsTodos() ? fetchTodos(hass, this.lists()) : Promise.resolve([] as TodoItem[]),
    ]);
    this._events = ev;
    this._todos = td;
  }

  /** dzien w godzinach dnia z konfiguracji */
  protected dayWindow(now: number, offsetDays = 0) {
    const d0 = new Date(now).setHours(0, 0, 0, 0) + offsetDays * 86400e3;
    return { from: d0 + (this._config?.day_start ?? 6) * 3600e3, to: d0 + (this._config?.day_end ?? 22) * 3600e3 };
  }
}
