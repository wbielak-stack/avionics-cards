import { LitElement, html, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { entityPrecision } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { TemplateSubscriptions, isTemplate } from '../../core/templates';
import { type SoftkeysCardConfig, type SoftkeyConfig, type ActionConfig, normalizeKey } from './config';

/**
 * Przyciski funkcyjne w stylu softkeyow kokpitu: akcja z potwierdzeniem, stan aktywny
 * (inwersja cyjanowa), ustawiana wartosc (cyjan), postep w stylu paska EIS.
 */
export class AvionicsSoftkeysCard extends LitElement {
  @state() private _config?: SoftkeysCardConfig;
  @state() private _keys: SoftkeyConfig[] = [];
  @state() private _styleMode: StyleMode = 'look';
  private _hass?: HomeAssistant;
  private _key = '';
  private _tpl = new TemplateSubscriptions();

  static getConfigElement() {
    return document.createElement('avionics-softkeys-card-editor');
  }

  static getStubConfig() {
    return { entities: [{ name: 'ACTION' }] };
  }

  setConfig(config: SoftkeysCardConfig): void {
    if (!Array.isArray(config.entities) || !config.entities.length) {
      throw new Error(localize(getLanguage(), 'eis.error.no_entities'));
    }
    this._config = config;
    this._keys = config.entities.map(normalizeKey);
    this._tpl.clear();
    this._key = '';
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._tpl.clear();
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._key = '';
    if (this._hass) this.hass = this._hass;
  }

  getCardSize(): number {
    return this._config?.layout === 'row' ? 2 : 1 + this._keys.length * 2;
  }

  getGridOptions() {
    return { columns: this._config?.layout === 'row' ? 12 : 6, min_columns: 3 };
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    // szablony opisow - HA wylicza je i przysyla przy kazdej zmianie
    const upd = () => this.requestUpdate();
    this._keys.forEach((k, i) => {
      this._tpl.ensure(hass, `s${i}`, k.secondary, upd);
      this._tpl.ensure(hass, `a${i}`, k.active_secondary, upd);
      this._tpl.ensure(hass, `n${i}`, k.name, upd);
      this._tpl.ensure(hass, `an${i}`, k.active_name, upd);
      this._tpl.ensure(hass, `at${i}`, k.active_template, upd);
      this._tpl.ensure(hass, `ar${i}`, k.armed_template, upd);
    });
    const mode = readStyleMode(this);
    const ids = this._keys.flatMap((k) => [
      k.active_entity,
      k.armed_entity,
      k.value_entity,
      ...[k.progress_start, k.progress_current, k.progress_target].filter((x) => typeof x === 'string'),
    ]) as Array<string | undefined>;
    const key = ids.map((id) => (id ? hass.states[id]?.last_updated ?? '' : '')).join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // ---------------- logika ----------------
  /** Wynik szablonu jako prawda/falsz. */
  private _truthy(key: string): boolean {
    const v = (this._tpl.results.get(key) ?? '').trim().toLowerCase();
    return ['true', 'on', '1', 'yes', 'active', 'tak'].includes(v);
  }

  private _active(k: SoftkeyConfig, i = this._keys.indexOf(k)): boolean {
    if (isTemplate(k.active_template)) return this._truthy(`at${i}`);
    return !!k.active_entity && this._hass?.states[k.active_entity]?.state === k.active_state;
  }

  /** Uzbrojony (oczekuje) - tylko gdy nie aktywny. */
  private _armed(k: SoftkeyConfig, i: number): boolean {
    if (this._active(k, i)) return false;
    if (isTemplate(k.armed_template)) return this._truthy(`ar${i}`);
    return !!k.armed_entity && !!k.armed_state && this._hass?.states[k.armed_entity]?.state === k.armed_state;
  }

  /** Tekst, ktory moze byc szablonem (wynik z HA) albo zwyklym tekstem. */
  private _tplText(src: string | undefined, key: string): string {
    if (!src) return '';
    return isTemplate(src) ? (this._tpl.results.get(key) ?? '').trim() : src;
  }

  private _unavailable(k: SoftkeyConfig): boolean {
    const s = k.active_entity ? this._hass?.states[k.active_entity]?.state : undefined;
    return s === 'unavailable';
  }

  /** Liczba albo wartosc encji (pola postepu przyjmuja oba). */
  private _numOf(v: string | number | undefined): number {
    if (typeof v === 'number') return v;
    if (!v) return NaN;
    return /^[a-z_]+\.[a-z0-9_]+$/.test(v) ? num(this._hass?.states[v]?.state) : num(v);
  }

  private _text(k: SoftkeyConfig, i: number, active: boolean): string {
    const src = active ? k.active_secondary : k.secondary;
    if (!src) return '';
    return isTemplate(src) ? this._tpl.results.get(`${active ? 'a' : 's'}${i}`) ?? '' : src;
  }

  /** Akcja HA - potwierdzenie i wykonanie po stronie frontendu HA (jak w kazdej karcie). */
  private _run(action: ActionConfig | undefined, entity?: string): void {
    if (!action || (action as { action?: string }).action === 'none') return;
    const ev = new Event('hass-action', { bubbles: true, composed: true }) as Event & {
      detail: { config: Record<string, unknown>; action: string };
    };
    ev.detail = { config: { entity, tap_action: action }, action: 'tap' };
    this.dispatchEvent(ev);
  }

  private _tap(k: SoftkeyConfig): void {
    if (this._unavailable(k)) return;
    // po przytrzymaniu tego przycisku nie wykonuj juz zwyklego dotkniecia
    if (this._held === k) {
      this._held = undefined;
      return;
    }
    this._held = undefined;
    this._run(this._active(k) && k.active_tap_action ? k.active_tap_action : k.tap_action, k.active_entity);
  }

  // przytrzymanie: 500 ms bez puszczenia
  private _holdTimer?: number;
  /** przycisk, ktory wlasnie zostal przytrzymany (jego najblizsze klikniecie jest pomijane) */
  private _held?: SoftkeyConfig;

  private _down(k: SoftkeyConfig): void {
    // kazde wcisniecie kasuje znacznik - np. gdy po dlugim dotyku przegladarka nie wyslala klikniecia
    this._held = undefined;
    clearTimeout(this._holdTimer);
    if (!k.hold_action || this._unavailable(k)) return;
    this._holdTimer = window.setTimeout(() => {
      this._held = k;
      this._run(k.hold_action, k.active_entity);
    }, 500);
  }

  private _up(): void {
    clearTimeout(this._holdTimer);
  }

  private _step(k: SoftkeyConfig, dir: number, e: Event): void {
    e.stopPropagation();
    const id = k.value_entity!;
    const s = this._hass!.states[id];
    if (!s) return;
    const a = s.attributes ?? {};
    const step = num(a.step) || 1;
    const v = Math.min(Math.max(num(s.state) + dir * step, num(a.min) ?? -Infinity), num(a.max) ?? Infinity);
    const domain = id.split('.')[0];
    void this._hass!.callService(domain, 'set_value', { entity_id: id, value: Math.round(v / step) * step });
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this._hass) return nothing;
    const c = this._config;
    const row = c.layout === 'row';
    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${c.title ? html`<div class="title">${c.title}</div>` : nothing}
        <div class="keys ${row ? 'row' : 'list'} ${c.key_style === 'inverse' ? 'st-inverse' : 'st-lamp'}">
          ${this._keys.map((k, i) => this._renderKey(k, i, row, c.key_style === 'inverse'))}
        </div>
      </ha-card>
    `;
  }

  /**
   * Klawisz: ramka; aktywnosc - zielona lampka i etykieta (styl lamp, jak tryby autopilota)
   * albo naglowek w inwersji cyjanowej (styl inverse).
   */
  private _renderKey(k: SoftkeyConfig, i: number, row: boolean, inverse: boolean) {
    const active = this._active(k, i);
    const armed = this._armed(k, i);
    const off = this._unavailable(k);
    const name = (active && this._tplText(k.active_name, `an${i}`)) || this._tplText(k.name, `n${i}`);
    const text = this._text(k, i, active);
    const showValue = !!k.value_entity && !active;
    // stepper: w wierszu naglowka (lamp, lista) albo pod opisem (inverse / rzad)
    const valueInHead = showValue && !row && !inverse;
    return html`
      <div
        class=${classMap({
          key: true,
          active,
          armed,
          off,
          caution: k.active_color === 'caution',
          warning: k.active_color === 'warning',
        })}
        @click=${() => this._tap(k)}
        @pointerdown=${() => this._down(k)}
        @pointerup=${() => this._up()}
        @pointerleave=${() => this._up()}
        @contextmenu=${(e: Event) => k.hold_action && e.preventDefault()}
      >
        ${inverse ? nothing : html`<span class="lamp"></span>`}
        <div class="head">
          <span class="label">${k.icon ? html`<ha-icon icon=${k.icon}></ha-icon>` : nothing}<span>${name}</span></span>
          ${valueInHead ? this._renderValue(k) : nothing}
        </div>
        ${text && !row ? html`<div class="sub">${text}</div>` : nothing}
        ${showValue && !valueInHead ? html`<div class="vrow">${this._renderValue(k)}</div>` : nothing}
        ${active ? this._progress(k) ?? nothing : nothing}
      </div>
    `;
  }

  /** Nastawa: cyjanowa wartosc z malymi przyciskami - / + */
  private _renderValue(k: SoftkeyConfig) {
    const s = this._hass!.states[k.value_entity!];
    const v = num(s?.state);
    const unit = s?.attributes?.unit_of_measurement ?? '';
    const d = entityPrecision(this._hass, k.value_entity!);
    return html`<span class="value" @click=${(e: Event) => e.stopPropagation()}>
      <button @click=${(e: Event) => this._step(k, -1, e)}>−</button>
      <span class="set">${Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '--'}<span class="u">${unit}</span></span>
      <button @click=${(e: Event) => this._step(k, 1, e)}>+</button>
    </span>`;
  }

  /**
   * Postep na skali bezwzglednej (jak pasek EIS): bialy wskaznik biezacej wartosci zbliza sie
   * do cyjanowego znacznika celu; pusty znacznik = start; wypelnienie = przebyty odcinek.
   */
  private _progress(k: SoftkeyConfig) {
    const lo = k.progress_min ?? 0;
    const hi = k.progress_max ?? 100;
    const cur = this._numOf(k.progress_current);
    if (!Number.isFinite(cur) || !(hi > lo)) return undefined;
    const start = this._numOf(k.progress_start);
    const target = this._numOf(k.progress_target);
    const pos = (v: number) => Math.min(Math.max((v - lo) / (hi - lo), 0), 1) * 100;
    const at = (v: number) => `left:${pos(v)}%`;
    const unit = typeof k.progress_current === 'string' ? this._hass?.states[k.progress_current]?.attributes?.unit_of_measurement ?? '' : '';
    // jak plan lotu w kokpicie: odcinek przebyty szary, droga do celu magentowa (wartosc wyliczona)
    const pc = pos(cur);
    const done = Number.isFinite(start) ? [Math.min(pos(start), pc), Math.max(pos(start), pc)] : undefined;
    const togo = Number.isFinite(target) ? [Math.min(pos(target), pc), Math.max(pos(target), pc)] : undefined;
    return html`<div class="progress">
      <div class="scale">
        <div class="band"></div>
        ${done ? html`<div class="seg done" style="left:${done[0]}%;width:${done[1] - done[0]}%"></div>` : nothing}
        ${togo ? html`<div class="seg togo" style="left:${togo[0]}%;width:${togo[1] - togo[0]}%"></div>` : nothing}
        ${Number.isFinite(start) ? html`<div class="mk start" style=${at(start)}></div>` : nothing}
        ${Number.isFinite(target) ? html`<div class="mk tgt" style=${at(target)}></div>` : nothing}
        <div class="mk cur" style=${at(cur)}></div>
      </div>
      <span class="pv">${cur.toFixed(Math.abs(cur) < 100 ? 1 : 0).replace('.', ',')}<span class="u">${unit}</span></span>
    </div>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 12px;
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--av-frame);
      }
      .keys.list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .keys.row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
        gap: 6px;
      }
      /* klawisz: cienka, blada ramka; rowne wciecia */
      .key {
        position: relative;
        border: 1px solid #5a5a5a;
        padding: 9px 12px 9px 16px;
        cursor: pointer;
        min-width: 0;
        user-select: none;
      }
      .key:active {
        border-color: var(--av-value);
      }
      /* rzad: odstep krawedz-lampka rowny odstepowi napis-krawedz */
      .keys.row .key {
        padding: 19px 8px 9px;
        text-align: center;
      }
      .keys.row .label {
        line-height: 1;
      }
      .key.off {
        opacity: 0.4;
        cursor: default;
      }
      /* --- styl lamp: lampka jak w klawiszach autopilota --- */
      .lamp {
        position: absolute;
        background: #2c2c2c;
      }
      .keys.list .lamp {
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
      }
      .keys.row .lamp {
        top: 8px;
        left: 50%;
        width: 32px;
        height: 4px;
        transform: translateX(-50%);
      }
      /* kolor stanu aktywnego: zielony (domyslnie), bursztyn, czerwien */
      .key {
        --key-on: var(--av-ok);
      }
      .key.caution {
        --key-on: var(--av-caution);
      }
      .key.warning {
        --key-on: var(--av-warning);
      }
      .keys.st-lamp .key.active .lamp {
        background: var(--key-on);
        box-shadow: 0 0 6px var(--key-on);
      }
      .keys.st-lamp .key.active .label {
        color: var(--key-on);
      }
      /* uzbrojony (oczekuje): biala lampka - jak uzbrojone tryby autopilota */
      .keys.st-lamp .key.armed .lamp {
        background: var(--av-value);
        box-shadow: 0 0 5px rgba(255, 255, 255, 0.4);
      }
      /* --- styl inverse: pasek naglowka, aktywny w inwersji cyjanowej --- */
      .keys.st-inverse .key {
        padding: 0 0 9px;
      }
      .keys.st-inverse .head {
        background: #1a1a1a;
        padding: 3px 12px;
        margin-bottom: 6px;
      }
      .keys.st-inverse .key.active .head {
        background: var(--av-setpoint);
      }
      .keys.st-inverse .key.active.caution .head {
        background: var(--av-caution);
      }
      .keys.st-inverse .key.active.warning .head {
        background: var(--av-warning);
      }
      .keys.st-inverse .key.armed .head {
        background: #4a4a4a;
      }
      .keys.st-inverse .key.active .label {
        color: #000;
        text-shadow: none;
      }
      .keys.st-inverse .sub,
      .keys.st-inverse .vrow,
      .keys.st-inverse .progress {
        margin-left: 12px;
        margin-right: 12px;
      }
      .keys.st-inverse.row .key {
        padding: 0;
      }
      .keys.st-inverse.row .head {
        margin: 0;
        padding: 8px;
        background: transparent;
      }
      .keys.st-inverse.row .key.active {
        background: var(--av-setpoint);
        border-color: var(--av-setpoint);
      }
      .keys.st-inverse.row .key.active.caution {
        background: var(--av-caution);
        border-color: var(--av-caution);
      }
      .keys.st-inverse.row .key.active.warning {
        background: var(--av-warning);
        border-color: var(--av-warning);
      }
      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        min-height: 24px;
      }
      .keys.row .head {
        justify-content: center;
        min-height: 0;
      }
      .label {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--av-value);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        min-width: 0;
      }
      .label ha-icon {
        --mdc-icon-size: 16px;
        flex: none;
      }
      .sub {
        margin-top: 3px;
        font-size: 12px;
        color: var(--av-dim);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .vrow {
        display: flex;
        justify-content: flex-end;
        margin-top: 6px;
      }
      .keys.row .vrow {
        justify-content: center;
      }
      .value {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: none;
      }
      .keys.row .value {
        margin: 4px 0 6px;
      }
      .value button {
        font: inherit;
        font-size: 15px;
        font-weight: 700;
        line-height: 1;
        width: 24px;
        height: 22px;
        padding: 0;
        background: transparent;
        color: var(--av-value);
        border: 1px solid rgba(140, 140, 140, 0.6);
        cursor: pointer;
      }
      .set {
        min-width: 56px;
        text-align: center;
        color: var(--av-setpoint);
        font-size: 18px;
        font-weight: 700;
      }
      .set .u,
      .pv .u {
        font-size: 11px;
        margin-left: 3px;
      }
      /* postep jak pasek EIS */
      .progress {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 6px;
      }
      .keys.row .progress {
        margin: 2px 8px 6px;
      }
      .scale {
        position: relative;
        flex: 1 1 auto;
        height: 20px;
      }
      .band {
        position: absolute;
        left: 0;
        right: 0;
        top: 9px;
        height: 3px;
        background: #3a3a3a;
      }
      .seg {
        position: absolute;
        top: 9px;
        height: 3px;
      }
      .seg.done {
        background: var(--av-dim);
      }
      .seg.togo {
        background: var(--av-forecast);
      }
      .mk {
        position: absolute;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        transform: translateX(-5px);
      }
      .mk.cur {
        top: 0;
        border-top: 8px solid var(--av-value);
      }
      .mk.tgt {
        top: 0;
        border-top: 8px solid var(--av-setpoint);
      }
      /* start: pusty znacznik pod pasmem */
      .mk.start {
        top: 13px;
        border-bottom: 7px solid var(--av-dim);
      }
      .mk.start::after {
        content: '';
        position: absolute;
        left: -3px;
        top: 2px;
        border-left: 3px solid transparent;
        border-right: 3px solid transparent;
        border-bottom: 4px solid var(--av-bg);
      }
      .pv {
        flex: none;
        font-size: 14px;
        font-weight: 700;
        min-width: 48px;
        text-align: right;
      }
    `,
  ];
}
