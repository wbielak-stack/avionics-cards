import { RowListEditor, schemaGrid as grid, schemaSection } from '../../core/row-list-editor';
import { FormEditor } from '../../core/form-editor';
import type { PlanCalendar } from '../../core/plan/data';

type Kind = 'plan' | 'leg' | 'profile' | 'dayplan';

/**
 * Edytor kart planu: kalendarze jako wiersze (znacznik, priorytet, "caly kalendarz to rutyna"),
 * reguly rutyny i opcje karty. W YAML zapisuje `calendars`.
 */
abstract class PlanCalendarsEditor extends RowListEditor<PlanCalendar & { entity: string }> {
  protected labelPrefix = 'plan.editor.';
  protected abstract kind: Kind;

  setConfig(config: any): void {
    super.setConfig({ ...config, entities: (config.calendars ?? config.entities ?? []).map((c: any) => (typeof c === 'string' ? { entity: c } : c)) });
  }

  protected toCardConfig(config: any): object {
    const { entities, ...rest } = config;
    return { ...rest, calendars: entities };
  }

  protected cardSchema() {
    const tx = { text: {} };
    const n = (min: number, max: number) => ({ number: { min, max, step: 1, mode: 'box' } });
    const b = (name: string) => ({ name, selector: { boolean: {} } });
    const sel = (name: string, keys: string[]) => ({
      name,
      selector: { select: { mode: 'dropdown', options: keys.map((v) => ({ value: v, label: this.t(`plan.editor.${name}.${v}`) })) } },
    });
    const extra: unknown[] = [];
    if (this.kind === 'plan') {
      extra.push(grid([sel('view', ['today', 'today_tomorrow', 'hours']), { name: 'hours', selector: n(1, 72) }]));
      extra.push(grid([b('show_buttons'), b('show_past'), { name: 'sync', selector: tx }]));
      extra.push(grid([{ name: 'todos', selector: { entity: { domain: 'todo', multiple: true } } }, { name: 'todo_tags', selector: tx }]));
    }
    if (this.kind === 'leg') extra.push(sel('layout', ['full', 'strip']));
    if (this.kind === 'profile') extra.push(grid([b('astro'), { name: 'sync', selector: tx }]));
    if (this.kind === 'dayplan') {
      extra.push(grid([sel('default_view', ['plan', 'profile', 'tasks', 'days']), { name: 'days', selector: n(1, 14) }]));
      extra.push(grid([{ name: 'todos', selector: { entity: { domain: 'todo', multiple: true } } }, { name: 'todo_tags', selector: tx }]));
      extra.push(b('astro'));
    }
    return [
      { name: 'title', selector: tx },
      ...extra,
      schemaSection(this.t('plan.editor.section.routine'), [
        grid([b('routine_daily'), { name: 'routine_keyword', selector: tx }]),
        { name: 'routine_names', selector: tx },
      ]),
      schemaSection(this.t('plan.editor.section.day'), [
        grid([
          { name: 'day_start', selector: n(0, 23) },
          { name: 'day_end', selector: n(1, 24) },
          { name: 'min_gap', selector: n(5, 240) },
        ]),
      ]),
    ];
  }

  protected rowFormDefaults(): Partial<PlanCalendar> {
    return { priority: 0, routine: false };
  }

  protected rowSchema() {
    return [
      { name: 'entity', selector: { entity: { domain: 'calendar' } } },
      grid([
        { name: 'tag', selector: { text: {} } },
        { name: 'priority', selector: { number: { min: 0, max: 9, step: 1, mode: 'box' } } },
        { name: 'routine', selector: { boolean: {} } },
      ]),
    ];
  }
}

export class AvionicsPlanCardEditor extends PlanCalendarsEditor {
  protected kind: Kind = 'plan';
}
export class AvionicsLegCardEditor extends PlanCalendarsEditor {
  protected kind: Kind = 'leg';
}
export class AvionicsDayProfileCardEditor extends PlanCalendarsEditor {
  protected kind: Kind = 'profile';
}
export class AvionicsDayPlanCardEditor extends PlanCalendarsEditor {
  protected kind: Kind = 'dayplan';
}

/** Edytor zadan: listy todo i ich znaczniki. */
export class AvionicsTasksCardEditor extends FormEditor<Record<string, unknown> & { type: string }> {
  protected labelPrefix = 'plan.editor.';
  protected formDefaults() {
    return { max_done: 3 };
  }
  protected schema() {
    return [
      { name: 'title', selector: { text: {} } },
      { name: 'todos', selector: { entity: { domain: 'todo', multiple: true } } },
      { name: 'todo_tags', selector: { text: {} } },
      { name: 'max_done', selector: { number: { min: 0, max: 20, step: 1, mode: 'box' } } },
    ];
  }
}
