/** Rozkodowana depesza METAR (tylko to, co pokazuje karta). */
export interface Metar {
  raw: string;
  station?: string;
  /** czas obserwacji (ms) */
  time?: number;
  wind?: { dir: number | 'VRB'; speed: number; gust?: number; unit: 'KT' | 'MPS'; from?: number; to?: number };
  /** widzialnosc [m]; 9999 = 10 km lub wiecej */
  vis?: number;
  cavok: boolean;
  clouds: Array<{ cover: string; base: number; type?: string }>;
  /** podstawa: najnizsza warstwa BKN / OVC / VV [ft] */
  ceiling?: number;
  weather: string[];
  temp?: number;
  dew?: number;
  qnh?: number;
}

const t = (s: string) => (s.startsWith('M') ? -parseInt(s.slice(1), 10) : parseInt(s, 10));

/** Prosty parser METAR (ICAO, z obsluga A dla QNH w calach). */
export function parseMetar(raw: string): Metar {
  const m: Metar = { raw: raw.trim(), cavok: false, clouds: [], weather: [] };
  const parts = m.raw.replace(/=$/, '').split(/\s+/);
  let i = 0;
  if (/^(METAR|SPECI)$/.test(parts[i])) i++;
  if (/^[A-Z]{4}$/.test(parts[i] ?? '')) m.station = parts[i++];
  const tm = (parts[i] ?? '').match(/^(\d{2})(\d{2})(\d{2})Z$/);
  if (tm) {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), +tm[1], +tm[2], +tm[3]));
    // depesza z konca poprzedniego miesiaca
    if (d.getTime() - Date.now() > 2 * 86400e3) d.setUTCMonth(d.getUTCMonth() - 1);
    m.time = d.getTime();
    i++;
  }
  for (; i < parts.length; i++) {
    const p = parts[i];
    if (p === 'RMK' || p === 'TEMPO' || p === 'BECMG' || p === 'NOSIG') break;
    let x: RegExpMatchArray | null;
    if ((x = p.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/))) {
      m.wind = { dir: x[1] === 'VRB' ? 'VRB' : +x[1], speed: +x[2], gust: x[3] ? +x[3] : undefined, unit: x[4] as 'KT' | 'MPS' };
    } else if ((x = p.match(/^(\d{3})V(\d{3})$/)) && m.wind) {
      m.wind.from = +x[1];
      m.wind.to = +x[2];
    } else if (p === 'CAVOK') {
      m.cavok = true;
      m.vis = 9999;
    } else if (/^\d{4}$/.test(p) && m.vis === undefined) {
      m.vis = +p;
    } else if ((x = p.match(/^(\d+)SM$/))) {
      m.vis = Math.round(+x[1] * 1609);
    } else if ((x = p.match(/^(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(CB|TCU)?$/))) {
      const base = x[2] === '///' ? NaN : +x[2] * 100;
      m.clouds.push({ cover: x[1], base, type: x[3] });
      if ((x[1] === 'BKN' || x[1] === 'OVC' || x[1] === 'VV') && Number.isFinite(base) && (m.ceiling === undefined || base < m.ceiling))
        m.ceiling = base;
    } else if (/^(NSC|NCD|SKC|CLR)$/.test(p)) {
      // brak chmur istotnych
    } else if ((x = p.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
      m.temp = t(x[1]);
      if (x[2]) m.dew = t(x[2]);
    } else if ((x = p.match(/^Q(\d{4})$/))) {
      m.qnh = +x[1];
    } else if ((x = p.match(/^A(\d{4})$/))) {
      m.qnh = Math.round((+x[1] / 100) * 33.8639);
    } else if (/^(\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?(DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)+$/.test(p)) {
      m.weather.push(p);
    }
  }
  return m;
}

/** Kategoria lotu wg podstawy [ft] i widzialnosci [m] (kryteria FAA). */
export function flightCategory(m: Metar): 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | undefined {
  const ceil = m.ceiling ?? Infinity;
  const vis = m.vis ?? (m.cavok ? 9999 : undefined);
  if (vis === undefined && m.ceiling === undefined) return undefined;
  const sm = (vis ?? 9999) / 1609;
  if (ceil < 500 || sm < 1) return 'LIFR';
  if (ceil < 1000 || sm < 3) return 'IFR';
  if (ceil <= 3000 || sm <= 5) return 'MVFR';
  return 'VFR';
}
