import { html, svg, nothing, css, type TemplateResult } from 'lit';
import type { HomeAssistant } from '../../types';
import type { PlanEvent, TodoItem } from './data';
import { type Plan, type PlanItem, hhmm, dur, cleanName } from './model';
import { sunTimes } from '../astro';

type T = (k: string) => string;

export const tagTpl = (s: string, dim = false) => html`<span class="pl-tag ${dim ? 'dim' : ''}">${s}</span>`;

/** Skrot dnia jak w kokpicie / wallboardzie: SR 07.10 (pl - dwie litery), WED 07.10 (inne jezyki). */
export const dayLabel = (t: number, lang: string) => {
  const d = new Date(t);
  const dm = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  // polskie skroty wprost (pierwsze litery nazw daja PO / NI zamiast PN / ND)
  if (lang.startsWith('pl')) return `${['ND', 'PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO'][d.getDay()]} ${dm}`;
  return `${d.toLocaleDateString(lang, { weekday: 'short' }).replace('.', '').toUpperCase().slice(0, 3)} ${dm}`;
};

/** Liczba z odmiana: klucz.one / .few / .many (pl: 1, 2-4, 5+; inne: 1 i reszta). */
export function plural(n: number, key: string, t: T, lang: string): string {
  let f = 'many';
  if (n === 1) f = 'one';
  else if (lang.startsWith('pl') && [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) f = 'few';
  else if (!lang.startsWith('pl')) f = 'many';
  return `${n} ${t(`${key}.${f}`)}`;
}

/** Pasek NOTAM: wydarzenia calodzienne (z licznikiem dni dla wielodniowych). */
export function notamTpl(plan: Plan, now: number, t: T): TemplateResult | typeof nothing {
  if (!plan.notams.length) return nothing;
  return html`<div class="pl-notam">
    <span class="pl-nl">NOTAM</span>
    ${plan.notams.map((n) => {
      const days = Math.round((n.end - n.start) / 86400e3);
      const k = Math.floor((new Date(now).setHours(0, 0, 0, 0) - n.start) / 86400e3) + 1;
      return html`<span class="pl-ni">${n.summary}${days > 1 ? html` <small>${t('plan.day')} ${k}/${days}</small>` : nothing}
        ${tagTpl(n.tag)}</span>`;
    })}
  </div>`;
}

interface RowOpts {
  showPast: boolean;
  keyword: string;
  lang: string;
  todoOpen?: number;
}

/**
 * Lista planu lotu: GODZ, PUNKT, CZAS, ETE (do poczatku / do konca aktywnego), ETA (koniec), KAL.
 * Podpunkty rutyn z wcieciem, kolizje w bursztynowej ramce z linia czasu kolizji, wolne okna, separatory dni.
 */
export function planListTpl(plan: Plan, now: number, t: T, o: RowOpts): TemplateResult {
  type Row = { at: number; tpl: TemplateResult; conf?: string; note?: TemplateResult };
  const rows: Row[] = [];
  const today = new Date(now).setHours(0, 0, 0, 0);
  for (const it of plan.items) {
    if (!o.showPast && it.state === 'done') continue;
    rows.push({ at: it.ev.start, tpl: rowTpl(it, now, t, o), conf: it.conflict ? confKey(it) : undefined });
  }
  for (const g of plan.gaps) {
    rows.push({
      at: g.from + 1,
      tpl: html`<div class="pl-row gap">
        <span></span><span></span>
        <span class="c-name">${t('plan.free')}${o.todoOpen ? html` · ${plural(o.todoOpen, 'plan.tasks_fit', t, o.lang)}` : nothing}</span>
        <span class="c-time">${hhmm(g.from)}</span><span></span><span class="c-dur">${dur(g.to - g.from)}</span><span class="c-eta">${hhmm(g.to)}</span>
      </div>`,
    });
  }
  rows.sort((a, b) => a.at - b.at);
  // grupowanie kolejnych wierszy tej samej kolizji w ramke
  const out: TemplateResult[] = [];
  // separator przy kazdej zmianie dnia (takze przy przegladaniu przeszlosci)
  let lastDay = rows.length ? new Date(rows[0].at).setHours(0, 0, 0, 0) : today;
  for (let i = 0; i < rows.length; i++) {
    const day = new Date(rows[i].at).setHours(0, 0, 0, 0);
    if (day !== lastDay) {
      out.push(html`<div class="pl-day">${dayLabel(day, o.lang)}</div>`);
      lastDay = day;
    }
    if (rows[i].conf) {
      const key = rows[i].conf;
      const grp: Row[] = [];
      while (i < rows.length && rows[i].conf === key) grp.push(rows[i++]);
      i--;
      const it = plan.items.find((x) => x.conflict && confKey(x) === key)!;
      const names = [it, ...it.conflict!.with].map((x) => `${cleanName(x.ev.summary, o.keyword).toUpperCase()} ${x.ev.tag}`).join(' ↔ ');
      out.push(html`<div class="pl-conf">
        ${grp.map((g) => g.tpl)}
        <div class="pl-cnote">⚠ ${t('plan.conflict')} ${hhmm(it.conflict!.from)}–${hhmm(it.conflict!.to)} · ${names}</div>
      </div>`);
    } else out.push(rows[i].tpl);
  }
  return html`<div class="pl-list">
    <div class="pl-row head">
      <span></span><span class="c-tag">${t('plan.col.cal')}</span><span class="c-name">${t('plan.col.point')}</span>
      <span class="c-time">ETA</span><span class="c-ete">ETE</span><span class="c-dur">${t('plan.col.dur')}</span><span class="c-eta">${t('plan.col.until')}</span>
    </div>
    ${out}
  </div>`;
}

const confKey = (it: PlanItem) =>
  [it, ...(it.conflict?.with ?? [])]
    .map((x) => x.ev.uid)
    .sort()
    .join('|');

function rowTpl(it: PlanItem, now: number, t: T, o: RowOpts): TemplateResult {
  const s = it.skipped ? it.ev.start : it.effStart;
  const e = it.skipped ? it.ev.end : it.effEnd;
  const cls = it.skipped ? 'skip' : it.conflict && it.state !== 'done' ? 'conf' : it.state;
  const sym = it.parent ? '↳' : it.skipped ? '–' : it.state === 'done' ? '✓' : it.state === 'active' ? '▸' : it.state === 'next' ? '→' : '○';
  const ete =
    it.skipped ? t('plan.skipped') : it.state === 'done' ? (it.shortened ? t('plan.shortened') : '—') : it.state === 'active' ? `${t('plan.now')} ${dur(e - now)}` : dur(s - now);
  return html`<div class="pl-row ${cls} ${it.parent ? 'child' : ''}">
    <span class="c-sym">${it.parent ? '' : sym}</span>
    <span class="c-tag">${tagTpl(it.ev.tag, it.state === 'done' || it.skipped)}</span>
    <span class="c-name">${it.parent ? html`<b class="arrow">↳</b>` : nothing}${cleanName(it.ev.summary, o.keyword)}</span>
    <span class="c-time">${hhmm(s)}</span>
    <span class="c-ete">${ete}</span>
    <span class="c-dur">${dur(e - s)}</span>
    <span class="c-eta">${it.skipped ? '' : hhmm(e)}</span>
  </div>`;
}

/** Bieżacy odcinek: pelny (TRWA + postep + nastepny) albo jedna linia. */
export function legTpl(plan: Plan, now: number, t: T, mode: 'full' | 'strip', keyword: string): TemplateResult {
  const a = plan.active;
  const n = plan.next;
  const conf = plan.conflicts.filter((c) => c.to > now).sort((x, y) => x.from - y.from)[0];
  const nm = (x?: PlanItem) => (x ? cleanName(x.ev.summary, keyword) : '');
  if (mode === 'strip') {
    return html`<div class="pl-strip">
      ${a
        ? html`<span class="mg">▸ ${nm(a)}</span><span class="dim">${t('plan.to_end')}</span><b>${dur(a.effEnd - now)}</b>`
        : html`<span class="dim">${t('plan.idle')}</span>`}
      ${n ? html`<span>→ ${nm(n)}</span><span class="dim">ETA</span><b>${hhmm(n.effStart)}</b><span class="dim">ETE ${dur(n.effStart - now)}</span>` : nothing}
      <span class="sp"></span>
      ${plan.notams.length ? html`<span class="am">NOTAM ${plan.notams.length}</span>` : nothing}
      ${conf ? html`<span class="am">⚠ ${t('plan.conflict')} ${hhmm(conf.from)}</span>` : nothing}
    </div>`;
  }
  const f = a ? Math.min(Math.max((now - a.effStart) / (a.effEnd - a.effStart), 0), 1) : 0;
  return html`<div class="pl-leg ${a ? 'on' : ''}">
    <div class="lg-h"><span class="lbl">${a ? t('plan.active') : t('plan.idle')}</span>${a ? tagTpl(a.ev.tag) : nothing}</div>
    ${a
      ? html`<div class="lg-name">${nm(a)}</div>
          <div class="lg-rem"><span class="lbl">${t('plan.to_end')}</span><span class="big">${dur(a.effEnd - now)}</span></div>
          <div class="lg-bar"><i style="width:${f * 100}%"></i><b style="left:${f * 100}%"></b></div>
          <div class="lg-ends"><span>${hhmm(a.effStart)}</span><span>${hhmm(a.effEnd)}</span></div>`
      : html`<div class="lg-name dimname">${n ? `${t('plan.free_until')} ${hhmm(n.effStart)}` : t('plan.free_day')}</div>`}
    <div class="lg-next">
      <span class="lbl">${t('plan.next')}</span><span class="nn">${n ? nm(n) : '—'}</span>${n ? tagTpl(n.ev.tag) : nothing}
    </div>
    ${n
      ? html`<div class="lg-eta">
          <span class="lbl">ETE</span><b>${dur(n.effStart - now)}</b><span class="lbl">ETA</span><b>${hhmm(n.effStart)}</b>
          ${conf ? html`<span class="am">⚠ ${t('plan.conflict')} ${hhmm(conf.from)}</span>` : nothing}
        </div>`
      : nothing}
  </div>`;
}

/**
 * Profil dnia: tory kalendarzy (wg znacznika) + tor NOTAM, tlo pory dnia (slonce), linia "teraz",
 * rutyna jako obrys, wydarzenia w jej trakcie jako paski w srodku, kolizje w bursztynowej ramce.
 */
export function profileTpl(
  plan: Plan,
  now: number,
  opts: { from: number; to: number; hass?: HomeAssistant; astro: boolean; laneOrder: string[]; keyword: string },
  t: T,
): TemplateResult {
  const { from, to } = opts;
  const X = (ms: number) => ((Math.min(Math.max(ms, from), to) - from) / (to - from)) * 100;
  const lanes = [...(plan.notams.length ? ['NOTAM'] : []), ...opts.laneOrder];
  const laneOf = (it: PlanItem) => lanes.indexOf(it.ev.tag);
  // tlo pory dnia
  let bands: TemplateResult[] = [];
  const lat = opts.hass?.config?.latitude;
  const lon = opts.hass?.config?.longitude;
  if (opts.astro && typeof lat === 'number' && typeof lon === 'number') {
    const st = sunTimes(new Date((from + to) / 2), lat, lon);
    const seg: Array<[number | undefined, number | undefined, string]> = [
      [from, st.nauticalDawn?.valueOf(), 'night'],
      [st.nauticalDawn?.valueOf(), st.dawn?.valueOf(), 'naut'],
      [st.dawn?.valueOf(), st.sunrise?.valueOf(), 'civil'],
      [st.sunset?.valueOf(), st.dusk?.valueOf(), 'civil'],
      [st.dusk?.valueOf(), st.nauticalDusk?.valueOf(), 'naut'],
      [st.nauticalDusk?.valueOf(), to, 'night'],
    ];
    bands = seg
      .filter(([a, b]) => a !== undefined && b !== undefined && b! > from && a! < to)
      .map(([a, b, c]) => html`<i class="pf-band ${c}" style="left:${X(a!)}%;width:${X(b!) - X(a!)}%"></i>`);
  }
  const hours: number[] = [];
  for (let h = new Date(from).getHours(); h <= new Date(to).getHours() + (new Date(to).getDate() !== new Date(from).getDate() ? 24 : 0); h += 2) hours.push(h);
  const blocks = plan.items
    .filter((it) => laneOf(it) >= 0 && it.ev.end > from && it.ev.start < to)
    .map((it) => {
      const l = laneOf(it);
      const s = it.skipped ? it.ev.start : it.effStart;
      const e = it.skipped ? it.ev.end : it.effEnd;
      const cls = [
        'pf-blk',
        it.routine ? 'routine' : '',
        it.parent && laneOf(it.parent) === l ? 'inner' : '',
        it.skipped ? 'skip' : '',
        it.state,
      ].join(' ');
      return html`<div class=${cls} style="top:calc(${l} * var(--lane));left:${X(s)}%;width:${X(e) - X(s)}%" title="${hhmm(s)}–${hhmm(e)} ${it.ev.summary}">
        <span>${cleanName(it.ev.summary, opts.keyword)}</span>
      </div>`;
    });
  const confs = plan.conflicts
    .filter((c) => c.to > from && c.from < to)
    .map((c) => {
      const la = Math.min(laneOf(c.a), laneOf(c.b));
      const lb = Math.max(laneOf(c.a), laneOf(c.b));
      return html`<div class="pf-conf" style="top:calc(${la} * var(--lane) - 3px);height:calc(${lb - la + 1} * var(--lane) - 2px);left:${X(c.from)}%;width:${X(c.to) - X(c.from)}%">
        <span>${t('plan.conflict')}</span>
      </div>`;
    });
  const notam = plan.notams.length
    ? html`<div class="pf-notam" style="top:0">${plan.notams.map((n) => n.summary).join(' · ')}</div>`
    : nothing;
  return html`<div class="pf" style="--lanes:${lanes.length}">
    <div class="pf-labels">${lanes.map((l) => html`<span class=${l === 'NOTAM' ? 'am' : ''}>${l}</span>`)}</div>
    <div class="pf-area">
      ${bands} ${lanes.map((_, i) => html`<i class="pf-lane" style="top:calc(${i + 1} * var(--lane) - 4px)"></i>`)}
      ${notam} ${blocks} ${confs}
      ${now > from && now < to ? html`<i class="pf-now" style="left:${X(now)}%"></i>` : nothing}
      <div class="pf-hours">${hours.map((h) => html`<span style="left:${X(new Date(from).setHours(h, 0, 0, 0))}%">${String(h % 24).padStart(2, '0')}</span>`)}</div>
    </div>
  </div>`;
}

/** Zadania: po terminie (czerwone), dzis (bursztyn), bez terminu, zrobione na dole; dotkniecie odhacza. */
export function tasksTpl(items: TodoItem[], now: number, t: T, onToggle: (it: TodoItem) => void, maxDone = 3): TemplateResult {
  const today = new Date(now).setHours(0, 0, 0, 0);
  const days = (it: TodoItem) => (it.due === undefined ? Infinity : Math.round((new Date(it.due).setHours(0, 0, 0, 0) - today) / 86400e3));
  const open = items.filter((i) => i.status !== 'completed').sort((a, b) => days(a) - days(b) || a.summary.localeCompare(b.summary));
  const done = items.filter((i) => i.status === 'completed').slice(0, maxDone);
  const row = (it: TodoItem) => {
    const d = days(it);
    const isDone = it.status === 'completed';
    const cls = isDone ? 'done' : d < 0 ? 'late' : d === 0 ? 'today' : '';
    const due = isDone ? '✓' : d === Infinity ? '' : d < 0 ? `−${-d} D` : d === 0 ? t('plan.today') : `+${d} D`;
    return html`<div class="tk-row ${cls}" @click=${() => onToggle(it)}>
      <span class="tk-box">${isDone ? '■' : '□'}</span><span class="tk-name">${it.summary}</span>${tagTpl(it.tag, isDone)}<span class="tk-due">${due}</span>
    </div>`;
  };
  return html`<div class="tk">${open.map(row)}${done.map(row)}</div>`;
}

/** Przeglad dni (jak TAF): punkty, zakres godzin, najwieksze wolne okno, kolizje, NOTAM-y. */
export function daysTpl(plans: Array<{ day: number; plan: Plan }>, t: T, lang: string, keyword: string): TemplateResult {
  return html`<div class="dy">
    <div class="dy-row head"><span>${t('plan.col.day')}</span><span>${t('plan.col.points')}</span><span>${t('plan.col.span')}</span><span>${t('plan.col.free')}</span><span>${t('plan.col.notes')}</span></div>
    ${plans.map(({ day, plan }, i) => {
      const its = plan.items.filter((x) => !x.skipped);
      const span = its.length ? `${hhmm(Math.min(...its.map((x) => x.effStart)))}–${hhmm(Math.max(...its.map((x) => x.effEnd)))}` : '—';
      const big = plan.gaps.sort((a, b) => b.to - b.from - (a.to - a.from))[0];
      const notes = [
        plan.conflicts.length ? `⚠ ${plural(plan.conflicts.length, 'plan.conflicts', t, lang)}` : '',
        plan.notams.length ? `NOTAM: ${plan.notams.map((n) => n.summary).join(', ')}` : '',
      ].filter(Boolean);
      void keyword;
      return html`<div class="dy-row ${i === 0 ? 'cur' : ''} ${its.length ? '' : 'empty'}">
        <span>${dayLabel(day, lang)}</span><span>${its.length}</span><span>${span}</span>
        <span>${big ? `${hhmm(big.from)}–${hhmm(big.to)}` : its.length ? '—' : t('plan.all_day')}</span>
        <span class=${notes.length ? 'am' : ''}>${notes.join(' · ')}</span>
      </div>`;
    })}
  </div>`;
}

/** Jeden tor dnia (naglowek karty z widokami): wszystkie kalendarze w jednym pasku. */
export function dayBarTpl(plan: Plan, now: number, from: number, to: number): TemplateResult {
  const X = (ms: number) => ((Math.min(Math.max(ms, from), to) - from) / (to - from)) * 100;
  const hours: number[] = [];
  for (let h = new Date(from).getHours(); h <= new Date(to).getHours(); h += 4) hours.push(h);
  return html`<div class="db">
    ${plan.items
      .filter((i) => !i.parent)
      .map((i) => {
        const s = i.skipped ? i.ev.start : i.effStart;
        const e = i.skipped ? i.ev.end : i.effEnd;
        return html`<i class="db-b ${i.skipped ? 'skip' : i.state}" style="left:${X(s)}%;width:${X(e) - X(s)}%"></i>`;
      })}
    ${plan.conflicts.map((c) => html`<i class="db-c" style="left:${X(c.from)}%;width:${X(c.to) - X(c.from)}%"></i>`)}
    ${now > from && now < to ? html`<i class="db-now" style="left:${X(now)}%"></i>` : nothing}
    <div class="db-h">${hours.map((h) => html`<span style="left:${X(new Date(from).setHours(h, 0, 0, 0))}%">${String(h).padStart(2, '0')}</span>`)}</div>
  </div>`;
}

export const planStyles = css`
  .lbl {
    color: var(--av-label);
    font-weight: 700;
    font-size: 12px;
    text-transform: uppercase;
  }
  .am {
    color: var(--av-caution);
    font-weight: 700;
  }
  .mg {
    color: var(--av-forecast);
    font-weight: 700;
  }
  .dim {
    color: var(--av-dim);
  }
  .pl-tag {
    display: inline-block;
    border: 1px solid var(--av-label);
    color: var(--av-label);
    font-size: 10px;
    font-weight: 700;
    padding: 0 4px;
    line-height: 14px;
    white-space: nowrap;
  }
  .pl-tag.dim {
    border-color: var(--av-dim);
    color: var(--av-dim);
  }
  .pl-notam {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 14px;
    padding: 2px 0 8px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--av-frame);
    font-size: 13px;
    font-weight: 700;
  }
  .pl-nl {
    color: var(--av-caution);
    font-size: 11px;
  }
  .pl-ni {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .pl-ni small {
    color: var(--av-dim);
    font-weight: 400;
  }
  .pl-row {
    display: grid;
    grid-template-columns: 18px 56px minmax(0, 1fr) 52px 88px 44px 48px;
    gap: 6px;
    align-items: baseline;
    padding: 4px 0;
    border-bottom: 1px solid rgba(140, 140, 140, 0.18);
    font-size: 15px;
    font-weight: 700;
  }
  .pl-row.head {
    font-size: 11px;
    color: var(--av-label);
    border-bottom: 1px solid var(--av-frame);
  }
  .pl-row > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .c-dur,
  .c-ete,
  .c-eta,
  .c-time {
    text-align: right;
  }
  .c-eta {
    color: var(--av-dim);
  }
  .pl-row.done,
  .pl-row.skip {
    color: var(--av-dim);
  }
  .pl-row.done .c-sym {
    color: var(--av-ok);
  }
  .pl-row.skip .c-name {
    text-decoration: line-through;
    color: #5a5a5a;
  }
  .pl-row.skip .c-ete,
  .pl-row.done .c-ete {
    font-size: 10px;
  }
  .pl-row.active {
    color: var(--av-forecast);
    font-size: 16px;
  }
  .pl-row.next {
    font-size: 16px;
  }
  .pl-row.conf {
    color: var(--av-caution);
  }
  .pl-row.child .c-name {
    padding-left: 14px;
  }
  .arrow {
    margin-right: 6px;
  }
  .pl-row.gap {
    color: var(--av-dim);
    font-weight: 400;
    background: rgba(255, 255, 255, 0.025);
  }
  .pl-conf {
    border: 1px solid var(--av-caution);
    margin: 2px 0;
  }
  .pl-cnote {
    color: var(--av-caution);
    font-size: 11px;
    font-weight: 700;
    padding: 3px 0 4px 82px;
  }
  .pl-day {
    color: var(--av-label);
    font-weight: 700;
    font-size: 13px;
    padding: 8px 0 3px;
    border-bottom: 1px solid var(--av-frame);
  }
  /* biezacy odcinek */
  .pl-leg {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .lg-h,
  .lg-next,
  .lg-eta,
  .lg-rem {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .lg-h {
    justify-content: space-between;
  }
  .lg-name {
    color: var(--av-forecast);
    font-size: 22px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg-name.dimname {
    color: var(--av-dim);
    font-size: 16px;
  }
  .lg-rem {
    justify-content: space-between;
  }
  .lg-rem .big {
    font-size: 40px;
    font-weight: 700;
    line-height: 1;
  }
  .lg-bar {
    position: relative;
    height: 4px;
    background: var(--av-forecast);
    margin-top: 8px;
  }
  .lg-bar i {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: var(--av-dim);
  }
  .lg-bar b {
    position: absolute;
    top: -9px;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 8px solid var(--av-value);
    transform: translateX(-5px);
  }
  .lg-ends {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: var(--av-dim);
  }
  .lg-next {
    border-top: 1px solid var(--av-frame);
    padding-top: 6px;
    margin-top: 4px;
  }
  .lg-next .nn {
    flex: 1;
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg-eta b {
    font-size: 15px;
    margin-right: 10px;
  }
  .lg-eta .am {
    margin-left: auto;
    font-size: 12px;
  }
  .pl-strip {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
  }
  .pl-strip .dim {
    font-weight: 400;
    font-size: 12px;
  }
  .pl-strip .sp {
    flex: 1;
  }
  /* profil */
  .pf {
    --lane: 34px;
    display: grid;
    grid-template-columns: 56px 1fr;
    gap: 6px;
  }
  .pf-labels {
    display: flex;
    flex-direction: column;
  }
  .pf-labels span {
    height: var(--lane);
    line-height: var(--lane);
    color: var(--av-label);
    font-size: 12px;
    font-weight: 700;
  }
  .pf-area {
    position: relative;
    height: calc(var(--lanes) * var(--lane) + 18px);
  }
  .pf-band {
    position: absolute;
    top: 0;
    height: calc(var(--lanes) * var(--lane));
  }
  .pf-band.civil {
    background: #17324f;
  }
  .pf-band.naut {
    background: #0e2036;
  }
  .pf-band.night {
    background: #07101c;
  }
  .pf-lane {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px solid rgba(140, 140, 140, 0.25);
  }
  .pf-notam {
    position: absolute;
    left: 0;
    right: 0;
    height: calc(var(--lane) - 8px);
    border: 1px dashed var(--av-caution);
    color: var(--av-caution);
    font-size: 11px;
    font-weight: 700;
    padding: 0 6px;
    display: flex;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
  }
  .pf-blk,
  .pf-blk span,
  .pf-conf span,
  .pf-notam,
  .db {
    text-shadow: none;
  }
  .pf-blk {
    position: absolute;
    height: calc(var(--lane) - 8px);
    background: var(--av-value);
    color: #000;
    font-size: 11px;
    font-weight: 700;
    overflow: hidden;
    box-sizing: border-box;
  }
  .pf-blk span {
    padding: 0 4px;
    line-height: calc(var(--lane) - 8px);
    white-space: nowrap;
  }
  .pf-blk.done {
    background: var(--av-dim);
  }
  .pf-blk.active {
    background: var(--av-forecast);
  }
  .pf-blk.routine {
    background: transparent;
    border: 1px solid var(--av-value);
    color: var(--av-value);
  }
  .pf-blk.routine span {
    line-height: 12px;
    display: block;
  }
  .pf-blk.routine.done {
    border-color: var(--av-dim);
    color: var(--av-dim);
  }
  .pf-blk.routine.active {
    border-color: var(--av-forecast);
    color: var(--av-forecast);
  }
  .pf-blk.skip {
    background: transparent;
    border: 1px dashed #5a5a5a;
    color: #5a5a5a;
  }
  .pf-blk.inner {
    height: calc(var(--lane) - 22px);
    margin-top: 12px;
  }
  .pf-conf {
    position: absolute;
    border: 2px solid var(--av-caution);
    box-sizing: border-box;
  }
  .pf-conf span {
    position: absolute;
    top: -13px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 9px;
    font-weight: 700;
    color: var(--av-caution);
  }
  .pf-now {
    position: absolute;
    top: -4px;
    height: calc(var(--lanes) * var(--lane));
    border-left: 2px solid var(--av-setpoint);
  }
  .pf-hours {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 14px;
  }
  .pf-hours span,
  .db-h span {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--av-dim);
  }
  /* zadania */
  .tk-row {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto 42px;
    gap: 8px;
    align-items: baseline;
    padding: 5px 0;
    border-bottom: 1px solid rgba(140, 140, 140, 0.18);
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
  .tk-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tk-due {
    text-align: right;
    font-size: 13px;
  }
  .tk-row.late .tk-due,
  .tk-row.late .tk-box {
    color: var(--av-warning);
  }
  .tk-row.today .tk-due,
  .tk-row.today .tk-box {
    color: var(--av-caution);
  }
  .tk-row.done {
    color: var(--av-dim);
  }
  .tk-row.done .tk-name {
    text-decoration: line-through;
  }
  .tk-row.done .tk-due {
    color: var(--av-ok);
  }
  /* dni */
  .dy-row {
    display: grid;
    grid-template-columns: 92px 50px 110px 110px minmax(0, 1fr);
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid rgba(140, 140, 140, 0.18);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
  }
  .dy-row span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dy-row.head {
    color: var(--av-label);
    font-size: 11px;
    border-bottom: 1px solid var(--av-frame);
  }
  .dy-row.cur {
    color: var(--av-forecast);
  }
  .dy-row.empty {
    color: var(--av-dim);
  }
  .dy-row span.am {
    font-size: 12px;
  }
  /* pasek dnia */
  .db {
    position: relative;
    height: 30px;
    margin: 6px 0 4px;
  }
  .db::before {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 10px;
    background: #1a1d21;
  }
  .db-b {
    position: absolute;
    top: 0;
    height: 10px;
    background: var(--av-value);
  }
  .db-b.done {
    background: var(--av-dim);
  }
  .db-b.skip {
    background: #3a3a3a;
  }
  .db-b.active {
    background: var(--av-forecast);
  }
  .db-c {
    position: absolute;
    top: -3px;
    height: 16px;
    border: 1.5px solid var(--av-caution);
    box-sizing: border-box;
  }
  .db-now {
    position: absolute;
    top: -5px;
    height: 20px;
    border-left: 2px solid var(--av-setpoint);
  }
  .db-h {
    position: absolute;
    left: 0;
    right: 0;
    top: 14px;
  }
  .pl-foot {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    font-weight: 700;
    padding-top: 8px;
  }
  .pl-foot .sp {
    flex: 1;
  }
  .late {
    color: var(--av-warning);
  }
`;
