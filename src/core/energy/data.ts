import type { HomeAssistant } from '../../types';

/** Zrodla z ustawien panelu Energia (nowy i stary format sieci). */
export interface EnergySources {
  gridFrom: string[];
  gridTo: string[];
  costFrom: string[]; // statystyki kosztu zakupu (stat_cost albo z energy/info)
  compTo: string[]; // statystyki rekompensaty za eksport
  solar: string[];
  batIn: string[];
  batOut: string[];
  soc?: string;
  capacity?: number;
  devices: Array<{ stat: string; name?: string; parent?: string }>;
}

let prefsCache: { t: number; p: Promise<EnergySources> } | undefined;

export function energySources(hass: HomeAssistant): Promise<EnergySources> {
  if (prefsCache && Date.now() - prefsCache.t < 10 * 60e3) return prefsCache.p;
  const p = (async () => {
    const out: EnergySources = { gridFrom: [], gridTo: [], costFrom: [], compTo: [], solar: [], batIn: [], batOut: [], devices: [] };
    try {
      const [prefs, info] = await Promise.all([
        hass.callWS<any>({ type: 'energy/get_prefs' }),
        hass.callWS<any>({ type: 'energy/info' }).catch(() => ({ cost_sensors: {} })),
      ]);
      const cs: Record<string, string> = info?.cost_sensors ?? {};
      for (const s of prefs?.energy_sources ?? []) {
        if (s.type === 'solar' && s.stat_energy_from) out.solar.push(s.stat_energy_from);
        if (s.type === 'battery') {
          if (s.stat_energy_to) out.batIn.push(s.stat_energy_to);
          if (s.stat_energy_from) out.batOut.push(s.stat_energy_from);
          if (s.stat_soc && !out.soc) out.soc = s.stat_soc;
          if (typeof s.capacity === 'number' && !out.capacity) out.capacity = s.capacity;
        }
        if (s.type === 'grid') {
          // nowy format: import / eksport w jednym obiekcie; stary: listy flow_from / flow_to
          const froms = s.stat_energy_from ? [{ stat_energy_from: s.stat_energy_from, stat_cost: s.stat_cost }] : s.flow_from ?? [];
          const tos = s.stat_energy_to ? [{ stat_energy_to: s.stat_energy_to, stat_compensation: s.stat_compensation }] : s.flow_to ?? [];
          for (const f of froms) {
            out.gridFrom.push(f.stat_energy_from);
            const c = f.stat_cost ?? cs[f.stat_energy_from];
            if (c) out.costFrom.push(c);
          }
          for (const f of tos) {
            out.gridTo.push(f.stat_energy_to);
            const c = f.stat_compensation ?? cs[f.stat_energy_to];
            if (c) out.compTo.push(c);
          }
        }
      }
      out.devices = (prefs?.device_consumption ?? []).map((d: any) => ({ stat: d.stat_consumption, name: d.name, parent: d.included_in_stat }));
    } catch {
      /* brak panelu Energia - karta uzyje encji z konfiguracji */
    }
    return out;
  })();
  prefsCache = { t: Date.now(), p };
  return p;
}

export type Series = Map<number, number>; // poczatek godziny (ms) -> wartosc

const statCache = new Map<string, { t: number; p: Promise<Record<string, Series>> }>();

/** Godzinowe zmiany licznikow (kWh, zl) albo srednie (ceny, SoC) ze statystyk HA. */
export async function hourly(
  hass: HomeAssistant,
  ids: string[],
  from: number,
  to: number,
  kind: 'change' | 'mean',
): Promise<Record<string, Series>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const key = `${kind}|${uniq.join(',')}|${from}|${to}`;
  const hit = statCache.get(key);
  if (hit && Date.now() - hit.t < 5 * 60e3) return hit.p;
  const p = (async () => {
    const out: Record<string, Series> = {};
    try {
      const res = await hass.callWS<Record<string, Array<{ start: number | string; change?: number; mean?: number; state?: number }>>>({
        type: 'recorder/statistics_during_period',
        start_time: new Date(from).toISOString(),
        end_time: new Date(to).toISOString(),
        statistic_ids: uniq,
        period: 'hour',
        types: kind === 'change' ? ['change'] : ['mean', 'state'],
      });
      for (const id of uniq) {
        const m: Series = new Map();
        for (const r of res?.[id] ?? []) {
          const t = typeof r.start === 'number' ? r.start : Date.parse(r.start);
          const v = kind === 'change' ? r.change : r.mean ?? r.state;
          if (typeof v === 'number' && Number.isFinite(v)) m.set(t, v);
        }
        out[id] = m;
      }
    } catch {
      /* brak statystyk */
    }
    // ceny bez statystyk (np. bez state_class): wartosc z historii stanow na kazda godzine
    if (kind === 'mean') {
      const missing = uniq.filter((id) => !out[id]?.size && id.includes('.'));
      if (missing.length) Object.assign(out, await hourlyFromHistory(hass, missing, from, to));
    }
    return out;
  })();
  statCache.set(key, { t: Date.now(), p });
  return p;
}

async function hourlyFromHistory(hass: HomeAssistant, ids: string[], from: number, to: number): Promise<Record<string, Series>> {
  const out: Record<string, Series> = {};
  try {
    const res = await hass.callWS<Record<string, Array<{ s: string; lu?: number; lc?: number }>>>({
      type: 'history/history_during_period',
      start_time: new Date(from - 86400e3).toISOString(),
      end_time: new Date(to).toISOString(),
      entity_ids: ids,
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    });
    for (const id of ids) {
      const pts = (res?.[id] ?? [])
        .map((p) => [((p.lu ?? p.lc) || 0) * 1000, parseFloat(p.s)] as [number, number])
        .filter((p) => Number.isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
      const m: Series = new Map();
      let i = 0;
      let cur = NaN;
      for (let h = from; h < to; h += 3600e3) {
        // wartosc obowiazujaca w polowie godziny
        while (i < pts.length && pts[i][0] <= h + 1800e3) cur = pts[i++][1];
        if (Number.isFinite(cur)) m.set(h, cur);
      }
      out[id] = m;
    }
  } catch {
    /* brak historii */
  }
  return out;
}

/** Suma serii kilku statystyk w danej godzinie. */
export const at = (all: Record<string, Series>, ids: string[], h: number) => ids.reduce((s, id) => s + (all[id]?.get(h) ?? 0), 0);

/** Cena w zl/kWh (encje w zl/MWh przeliczane). */
export function priceScale(hass: HomeAssistant, id?: string): number {
  if (!id) return 1;
  const u = String(hass.states[id]?.attributes?.unit_of_measurement ?? '');
  return /MWh/i.test(u) ? 0.001 : 1;
}
