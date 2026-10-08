import type { HomeAssistant } from '../../types';

/** Kalendarz w konfiguracji kart planu. */
export interface PlanCalendar {
  entity: string;
  /** znacznik w ramce, np. PRYW, FKPB */
  tag?: string;
  /** wyzszy wygrywa przy kolizji (informacyjnie: kolejnosc w kolizji) */
  priority?: number;
  /** wszystkie wydarzenia tego kalendarza sa rutyna */
  routine?: boolean;
}

/** Lista zadan (todo) w konfiguracji. */
export interface PlanTodo {
  entity: string;
  tag?: string;
}

/** Wydarzenie po normalizacji. */
export interface PlanEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: number; // ms
  end: number; // ms
  allDay: boolean;
  /** cykliczne codziennie (FREQ=DAILY) albo w co najmniej 5 dni tygodnia (np. pn-pt) */
  daily: boolean;
  calendar: string;
  tag: string;
  priority: number;
  routineCal: boolean;
}

export interface TodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
  due?: number; // ms (dzien albo chwila)
  dueDateOnly: boolean;
  list: string;
  tag: string;
}

interface RawEvent {
  uid?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  rrule?: string;
  recurrence_id?: string;
}

const CACHE_MS = 5 * 60 * 1000;

/** Codzienne albo tygodniowe w co najmniej 5 dni (BYDAY=MO,TU,WE,TH,FR) - typowa rutyna. */
function isDailyish(rrule?: string): boolean {
  if (!rrule) return false;
  if (/FREQ=DAILY/i.test(rrule)) return true;
  const m = rrule.match(/FREQ=WEEKLY.*BYDAY=([A-Z0-9,+-]+)/i) ?? rrule.match(/BYDAY=([A-Z0-9,+-]+).*FREQ=WEEKLY/i);
  return !!m && m[1].split(',').filter(Boolean).length >= 5;
}
const evCache = new Map<string, { t: number; p: Promise<PlanEvent[]> }>();
const todoCache = new Map<string, { t: number; key: string; p: Promise<TodoItem[]> }>();

/** Data lokalna "YYYY-MM-DD" -> poczatek dnia (ms, czas lokalny przegladarki). */
function localDay(s: string): number {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

function tagOf(c: { entity: string; tag?: string }, hass: HomeAssistant): string {
  if (c.tag) return c.tag;
  const n = String(hass.states[c.entity]?.attributes?.friendly_name ?? c.entity.split('.')[1] ?? '');
  return n.slice(0, 4).toUpperCase();
}

/**
 * Wydarzenia z kalendarzy HA (REST /api/calendars/<encja>) w oknie [start, end).
 * Wspolna pamiec podreczna na 5 min - kilka kart na dashboardzie nie pyta HA osobno.
 * `stamp` (np. last_updated encji kalendarza) uniewaznia pamiec po zmianie.
 */
export async function fetchEvents(hass: HomeAssistant, cals: PlanCalendar[], start: number, end: number): Promise<PlanEvent[]> {
  const all = await Promise.all(
    cals.map(async (c) => {
      const stamp = hass.states[c.entity]?.last_updated ?? '';
      const key = `${c.entity}|${start}|${end}|${stamp}`;
      const hit = evCache.get(key);
      if (hit && Date.now() - hit.t < CACHE_MS) return hit.p;
      const p = (async () => {
        if (!hass.callApi) return [];
        try {
          const raw = await hass.callApi<RawEvent[]>(
            'GET',
            `calendars/${c.entity}?start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`,
          );
          return (raw ?? []).map((e, i): PlanEvent => {
            const allDay = !!e.start.date && !e.start.dateTime;
            const s = allDay ? localDay(e.start.date!) : Date.parse(e.start.dateTime!);
            const en = allDay ? localDay(e.end.date!) : Date.parse(e.end.dateTime!);
            return {
              uid: `${c.entity}:${e.uid ?? i}:${e.recurrence_id ?? s}`,
              summary: e.summary ?? '',
              description: e.description,
              location: e.location,
              start: s,
              end: en,
              allDay,
              daily: isDailyish(e.rrule),
              calendar: c.entity,
              tag: tagOf(c, hass),
              priority: c.priority ?? 0,
              routineCal: !!c.routine,
            };
          });
        } catch {
          return [];
        }
      })();
      evCache.set(key, { t: Date.now(), p });
      return p;
    }),
  );
  return all.flat();
}

/** Zadania z list todo (WS todo/item/list); pamiec 1 min, uniewazniana zmiana stanu listy. */
export async function fetchTodos(hass: HomeAssistant, lists: PlanTodo[]): Promise<TodoItem[]> {
  const all = await Promise.all(
    lists.map(async (l) => {
      const key = hass.states[l.entity]?.last_updated ?? '';
      const hit = todoCache.get(l.entity);
      if (hit && hit.key === key && Date.now() - hit.t < 60000) return hit.p;
      const p = (async () => {
        try {
          const res = await hass.callWS<{ items: Array<{ uid: string; summary: string; status: string; due?: string }> }>({
            type: 'todo/item/list',
            entity_id: l.entity,
          });
          return (res?.items ?? []).map(
            (it): TodoItem => ({
              uid: it.uid,
              summary: it.summary,
              status: it.status === 'completed' ? 'completed' : 'needs_action',
              due: it.due ? (it.due.length <= 10 ? localDay(it.due) : Date.parse(it.due)) : undefined,
              dueDateOnly: !!it.due && it.due.length <= 10,
              list: l.entity,
              tag: tagOf(l, hass),
            }),
          );
        } catch {
          return [];
        }
      })();
      todoCache.set(l.entity, { t: Date.now(), key, p });
      return p;
    }),
  );
  return all.flat();
}

/** Odhaczenie / przywrocenie zadania (todo.update_item). */
export function toggleTodo(hass: HomeAssistant, it: TodoItem): Promise<unknown> {
  todoCache.delete(it.list);
  return hass.callService('todo', 'update_item', {
    entity_id: it.list,
    item: it.uid,
    status: it.status === 'completed' ? 'needs_action' : 'completed',
  });
}
