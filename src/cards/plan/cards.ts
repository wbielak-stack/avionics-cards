import { html, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { tokens, tileBase } from '../../core/styles';
import { cardHeader } from '../../core/header';
import { buildPlan, planWindow, hhmm } from '../../core/plan/model';
import { toggleTodo } from '../../core/plan/data';
import { getOffset, setOffset, subscribe } from '../../core/plan/sync';
import { notamTpl, planListTpl, legTpl, profileTpl, tasksTpl, daysTpl, dayBarTpl, planStyles, dayLabel, plural } from '../../core/plan/render';
import { PlanBase, type PlanBaseConfig } from './base';

const STYLES = [
  tokens,
  tileBase,
  planStyles,
  css`
    ha-card {
      padding: 10px 14px 10px;
    }
    .btns {
      display: inline-flex;
      gap: 4px;
    }
    .btns button {
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      padding: 1px 6px;
      background: transparent;
      color: var(--av-dim);
      border: 1px solid transparent;
      cursor: pointer;
    }
    .btns button.on {
      color: var(--av-label);
      border-color: var(--av-label);
    }
    ha-card.leg-on {
      border-color: var(--av-forecast);
    }
    .empty {
      color: var(--av-dim);
      padding: 8px 0;
    }
  `,
];

// ============ PLAN LOTU ============
export interface PlanCardConfig extends PlanBaseConfig {
  view?: 'today' | 'today_tomorrow' | 'hours';
  hours?: number;
  show_buttons?: boolean;
  show_past?: boolean;
  /** grupa synchronizacji z profilem dnia (ta sama nazwa w obu kartach) */
  sync?: string;
}

export class AvionicsPlanCard extends PlanBase<PlanCardConfig> {
  @state() private _view?: PlanCardConfig['view'];
  static getConfigElement() {
    return document.createElement('avionics-plan-card-editor');
  }
  static getStubConfig() {
    return { calendars: [] };
  }
  getCardSize() {
    return 8;
  }
  @state() private _offset = 0;
  private _unsub?: () => void;
  private get view() {
    return this._view ?? this._config?.view ?? 'hours';
  }
  /** okno widoku przesuniete o pelne doby (strzalki) */
  protected range(now: number) {
    const w = planWindow(this.view!, this._config?.hours ?? 24, now);
    const d = this._offset * 86400e3;
    return { from: w.from + d, to: w.to + d };
  }
  connectedCallback(): void {
    super.connectedCallback();
    this._offset = getOffset(this._config?.sync);
    this._unsub = subscribe(this._config?.sync, (o) => {
      this._offset = o;
      this.refresh();
    });
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
  }
  private _shift(o: number) {
    this._offset = o;
    setOffset(this._config?.sync, o);
    this.refresh();
  }
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = this.t;
    const now = Date.now();
    const plan = buildPlan(this._events, now, this.rules(), this.range(now), {
      minGapMin: c.min_gap,
      dayFrom: c.day_start,
      dayTo: c.day_end,
    });
    const open = this._todos.filter((x) => x.status !== 'completed').length;
    const title = c.title ?? `${t('plan.title')} · ${dayLabel(this.range(now).from + (this.view === 'hours' ? 3600e3 : 0), this.uiLang)}`;
    const btn = (v: PlanCardConfig['view'], l: string) =>
      html`<button class=${this.view === v ? 'on' : ''} @click=${() => {
        this._view = v;
        this.refresh();
      }}>${l}</button>`;
    const remaining = plan.items.filter((i) => !i.skipped && i.state !== 'done').length;
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
      ${cardHeader(
        title,
        html`<span class="btns">
          <button @click=${() => this._shift(this._offset - 1)}>◀</button>
          ${this._offset
            ? html`<button class="on" @click=${() => this._shift(0)}>${this._offset > 0 ? '+' : '−'}${Math.abs(this._offset)} D</button>`
            : nothing}
          <button @click=${() => this._shift(this._offset + 1)}>▶</button>
          ${c.show_buttons !== false
            ? html`${btn('today', t('plan.btn.today'))}${btn('today_tomorrow', t('plan.btn.tomorrow'))}${btn('hours', `${c.hours ?? 24} h`)}`
            : nothing}
        </span>`,
      )}
      ${notamTpl(plan, now, t)}
      ${plan.items.length || plan.gaps.length
        ? planListTpl(plan, now, t, {
            // "pokazuj minione" dotyczy biezacego widoku; inny dzien (strzalki) - wszystkie jego wydarzenia
            showPast: c.show_past !== false || this._offset !== 0,
            keyword: this.rules().keyword!,
            lang: this.uiLang,
            todoOpen: open || undefined,
          })
        : html`<div class="empty">${t('plan.empty')}</div>`}
      <div class="pl-foot">
        <span><span class="lbl">${t('plan.remaining')}</span> ${remaining} ${t('plan.pts')}${plan.conflicts.length ? html` · <span class="am">${plural(plan.conflicts.length, 'plan.conflicts', t, this.uiLang)}</span>` : nothing}</span>
        ${plan.gaps[0] ? html`<span><span class="lbl">${t('plan.free')}</span> ${hhmm(plan.gaps[0].from)}–${hhmm(plan.gaps[0].to)}</span>` : nothing}
        <span class="sp"></span>
        ${this.lists().length ? html`<span><span class="lbl">${t('plan.tasks')}</span> ${open}</span>` : nothing}
      </div>
    </ha-card>`;
  }
  static styles = STYLES;
}

// ============ BIEZACY ODCINEK ============
export interface LegCardConfig extends PlanBaseConfig {
  layout?: 'full' | 'strip';
}
export class AvionicsLegCard extends PlanBase<LegCardConfig> {
  static getConfigElement() {
    return document.createElement('avionics-leg-card-editor');
  }
  static getStubConfig() {
    return { calendars: [] };
  }
  getCardSize() {
    return this._config?.layout === 'strip' ? 1 : 4;
  }
  protected range(now: number) {
    const d0 = new Date(now).setHours(0, 0, 0, 0);
    return { from: d0, to: d0 + 2 * 86400e3 };
  }
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const now = Date.now();
    const plan = buildPlan(this._events, now, this.rules(), this.range(now), { dayFrom: c.day_start, dayTo: c.day_end, minGapMin: c.min_gap });
    const strip = c.layout === 'strip';
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true', 'leg-on': !strip && !!plan.active })}>
      ${!strip && c.title ? cardHeader(c.title) : nothing}
      ${legTpl(plan, now, this.t, strip ? 'strip' : 'full', this.rules().keyword!)}
    </ha-card>`;
  }
  static styles = STYLES;
}

// ============ PROFIL DNIA ============
export interface ProfileCardConfig extends PlanBaseConfig {
  astro?: boolean;
  /** grupa synchronizacji z planem lotu */
  sync?: string;
}
export class AvionicsDayProfileCard extends PlanBase<ProfileCardConfig> {
  static getConfigElement() {
    return document.createElement('avionics-day-profile-card-editor');
  }
  static getStubConfig() {
    return { calendars: [] };
  }
  getCardSize() {
    return 4;
  }
  @state() private _offset = 0;
  private _unsub?: () => void;
  connectedCallback(): void {
    super.connectedCallback();
    this._offset = getOffset(this._config?.sync);
    this._unsub = subscribe(this._config?.sync, (o) => {
      this._offset = o;
      this.refresh();
    });
  }
  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
  }
  protected range(now: number) {
    const d0 = new Date(now).setHours(0, 0, 0, 0) + this._offset * 86400e3;
    return { from: d0, to: d0 + 86400e3 };
  }
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const now = Date.now();
    const w = this.dayWindow(now, this._offset);
    const plan = buildPlan(this._events, now, this.rules(), this.range(now), { dayFrom: c.day_start, dayTo: c.day_end });
    // tory: znaczniki w kolejnosci kalendarzy
    const tags: string[] = [];
    for (const ev of this._events) if (!tags.includes(ev.tag)) tags.push(ev.tag);
    const order = this.cals().map((cal) => this._events.find((e) => e.calendar === cal.entity)?.tag ?? cal.tag ?? '').filter(Boolean);
    const lanes = [...new Set([...order, ...tags])];
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
      ${cardHeader(
        c.title ?? this.t('plan.profile'),
        html`<span class="dim">${this._offset ? `${dayLabel(w.from, this.uiLang)} · ` : ''}${hhmm(w.from)} — ${hhmm(w.to)}</span>`,
      )}
      ${profileTpl(plan, now, { from: w.from, to: w.to, hass: this._hass, astro: c.astro !== false, laneOrder: lanes, keyword: this.rules().keyword! }, this.t)}
    </ha-card>`;
  }
  static styles = STYLES;
}

// ============ ZADANIA ============
export interface TasksCardConfig extends PlanBaseConfig {
  max_done?: number;
}
export class AvionicsTasksCard extends PlanBase<TasksCardConfig> {
  static getConfigElement() {
    return document.createElement('avionics-tasks-card-editor');
  }
  static getStubConfig() {
    return { todos: [] };
  }
  getCardSize() {
    return 4;
  }
  protected range(now: number) {
    return { from: now, to: now };
  }
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const open = this._todos.filter((x) => x.status !== 'completed').length;
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
      ${cardHeader(c.title ?? this.t('plan.tasks'), html`<span class="dim">${open} ${this.t('plan.open')}</span>`)}
      ${tasksTpl(this._todos, Date.now(), this.t, (it) => void toggleTodo(this._hass!, it).then(() => this.refresh()), c.max_done ?? 3)}
    </ha-card>`;
  }
  static styles = STYLES;
}

// ============ PLAN DNIA (jedna karta z widokami) ============
export interface DayPlanCardConfig extends PlanBaseConfig {
  default_view?: 'plan' | 'profile' | 'tasks' | 'days';
  days?: number;
  astro?: boolean;
  max_done?: number;
}
export class AvionicsDayPlanCard extends PlanBase<DayPlanCardConfig> {
  @state() private _tab?: DayPlanCardConfig['default_view'];
  static getConfigElement() {
    return document.createElement('avionics-day-plan-card-editor');
  }
  static getStubConfig() {
    return { calendars: [], todos: [] };
  }
  getCardSize() {
    return 7;
  }
  protected range(now: number) {
    const d0 = new Date(now).setHours(0, 0, 0, 0);
    return { from: d0, to: d0 + Math.max(this._config?.days ?? 5, 2) * 86400e3 };
  }
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = this.t;
    const now = Date.now();
    const tab = this._tab ?? c.default_view ?? 'plan';
    const rules = this.rules();
    const opt = { minGapMin: c.min_gap, dayFrom: c.day_start, dayTo: c.day_end };
    const today = planWindow('today', 24, now);
    const plan = buildPlan(this._events, now, rules, today, opt);
    const w = this.dayWindow(now);
    const tabs = (['plan', 'profile', 'tasks', 'days'] as const).map(
      (k) => html`<button class=${tab === k ? 'on' : ''} @click=${() => (this._tab = k)}>${t(`plan.tab.${k}`)}</button>`,
    );
    let body: TemplateResult;
    if (tab === 'profile') {
      const lanes = [...new Set(this.cals().map((cal) => this._events.find((e) => e.calendar === cal.entity)?.tag ?? cal.tag ?? '').filter(Boolean))];
      body = profileTpl(plan, now, { from: w.from, to: w.to, hass: this._hass, astro: c.astro !== false, laneOrder: lanes, keyword: rules.keyword! }, t);
    } else if (tab === 'tasks') {
      body = tasksTpl(this._todos, now, t, (it) => void toggleTodo(this._hass!, it).then(() => this.refresh()), c.max_done ?? 3);
    } else if (tab === 'days') {
      const n = Math.max(c.days ?? 5, 1);
      const plans = Array.from({ length: n }, (_, i) => {
        const d = new Date(now).setHours(0, 0, 0, 0) + i * 86400e3;
        return { day: d, plan: buildPlan(this._events, now, rules, { from: d, to: d + 86400e3 }, opt) };
      });
      body = daysTpl(plans, t, this.uiLang, rules.keyword!);
    } else {
      body = html`${planListTpl(buildPlan(this._events, now, rules, planWindow('today_tomorrow', 24, now), opt), now, t, {
        showPast: false,
        keyword: rules.keyword!,
        lang: this.uiLang,
      })}${notamTpl(plan, now, t)}`;
    }
    const late = this._todos.filter((x) => x.status !== 'completed' && x.due !== undefined && x.due < new Date(now).setHours(0, 0, 0, 0)).length;
    return html`<ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
      ${cardHeader(c.title ?? t('plan.dayplan'), html`<span class="btns">${tabs}</span>`)}
      ${legTpl(plan, now, t, 'strip', rules.keyword!)} ${dayBarTpl(plan, now, w.from, w.to)}
      ${body}
      ${tab === 'plan' && this.lists().length
        ? html`<div class="pl-foot"><span class="sp"></span><span class=${late ? 'late' : ''}>${t('plan.tasks')} ${this._todos.filter((x) => x.status !== 'completed').length}${late ? ` · ${late} ${t('plan.overdue')}` : ''}</span></div>`
        : nothing}
    </ha-card>`;
  }
  static styles = STYLES;
}
