/**
 * Astronomia slonca i ksiezyca - wzory jak w bibliotece SunCalc (V. Agafonkin, BSD),
 * oparte na "Astronomy Answers" (aa.quae.nl). Dokladnosc rzedu minuty - wystarczy do dashboardu.
 */
const PI = Math.PI;
const rad = PI / 180;
const DAY = 86400e3;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // nachylenie ekliptyki

const toJulian = (d: Date) => d.valueOf() / DAY - 0.5 + J1970;
const fromJulian = (j: number) => new Date((j + 0.5 - J1970) * DAY);
const toDays = (d: Date) => toJulian(d) - J2000;

const rightAscension = (l: number, b: number) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l: number, b: number) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const azimuth = (H: number, phi: number, dec: number) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H: number, phi: number, dec: number) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d: number, lw: number) => rad * (280.16 + 360.9856235 * d) - lw;
const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);
function eclipticLongitude(M: number): number {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + C + rad * 102.9372 + PI;
}
function sunCoords(d: number) {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

/** Polozenie slonca: wysokosc i azymut (od polnocy, zgodnie z ruchem wskazowek) w stopniach. */
export function sunPosition(date: Date, lat: number, lng: number): { alt: number; az: number } {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = sunCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  return { alt: altitude(H, phi, c.dec) / rad, az: (azimuth(H, phi, c.dec) / rad + 180) % 360 };
}

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * PI));
const approxTransit = (Ht: number, lw: number, n: number) => J0 + (Ht + lw) / (2 * PI) + n;
const solarTransitJ = (ds: number, M: number, L: number) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
const hourAngle = (h: number, phi: number, d: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));

export interface SunTimes {
  noon: Date;
  sunrise?: Date;
  sunset?: Date;
  dawn?: Date; // cywilny (-6°)
  dusk?: Date;
  nauticalDawn?: Date; // -12°
  nauticalDusk?: Date;
}

/** Czasy slonca dla dnia zawierajacego `date` (brak = slonce nie przechodzi przez dany kat). */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const Jnoon = solarTransitJ(ds, M, L);
  const pair = (h: number): [Date | undefined, Date | undefined] => {
    const w = hourAngle(h * rad, phi, dec);
    if (!Number.isFinite(w)) return [undefined, undefined];
    const Jset = solarTransitJ(approxTransit(w, lw, n), M, L);
    return [fromJulian(Jnoon - (Jset - Jnoon)), fromJulian(Jset)];
  };
  const [sunrise, sunset] = pair(-0.833);
  const [dawn, dusk] = pair(-6);
  const [nauticalDawn, nauticalDusk] = pair(-12);
  return { noon: fromJulian(Jnoon), sunrise, sunset, dawn, dusk, nauticalDawn, nauticalDusk };
}

function moonCoords(d: number) {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Wysokosc ksiezyca [°] (z refrakcja). */
export function moonAltitude(date: Date, lat: number, lng: number): number {
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const c = moonCoords(d);
  const H = siderealTime(d, lw) - c.ra;
  let h = altitude(H, phi, c.dec);
  // refrakcja
  if (h < 0) h = 0.0002967 / Math.tan(0.00002 + h);
  else h += 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
  return h / rad;
}

/** Oswietlenie ksiezyca: fraction 0..1, phase 0 = now, 0.5 = pelnia; waxing = przybywa. */
export function moonIllumination(date: Date): { fraction: number; phase: number } {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / PI };
}

/** Wschod i zachod ksiezyca w dobie od `start` (skan co 10 min, interpolacja liniowa). */
export function moonTimes(start: Date, lat: number, lng: number): { rise?: Date; set?: Date } {
  const h0 = 0.133;
  const step = 10 * 60e3;
  let prev = moonAltitude(start, lat, lng) - h0;
  const out: { rise?: Date; set?: Date } = {};
  for (let t = start.valueOf() + step; t <= start.valueOf() + DAY; t += step) {
    const cur = moonAltitude(new Date(t), lat, lng) - h0;
    if (prev < 0 && cur >= 0 && !out.rise) out.rise = new Date(t - step * (cur / (cur - prev)));
    if (prev >= 0 && cur < 0 && !out.set) out.set = new Date(t - step * (cur / (cur - prev)));
    prev = cur;
  }
  return out;
}

/** Najblizsza chwila fazy (0 = now, 0.5 = pelnia) po `from` - przeszukanie co 6 h + dokladnie co 10 min. */
export function nextPhase(from: Date, target: 0 | 0.5): Date {
  const dist = (p: number) => {
    let x = p - target;
    x -= Math.round(x);
    return x; // ujemne przed faza, dodatnie po
  };
  let t = from.valueOf();
  let prev = dist(moonIllumination(from).phase);
  for (let k = 0; k < 140; k++) {
    const t2 = t + 6 * 3600e3;
    const cur = dist(moonIllumination(new Date(t2)).phase);
    if (prev < 0 && cur >= 0 && cur - prev < 0.5) {
      // zawezenie
      let a = t;
      let b = t2;
      for (let i = 0; i < 20; i++) {
        const mid = (a + b) / 2;
        if (dist(moonIllumination(new Date(mid)).phase) < 0) a = mid;
        else b = mid;
      }
      return new Date((a + b) / 2);
    }
    t = t2;
    prev = cur;
  }
  return new Date(NaN);
}
