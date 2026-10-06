import { LitElement, html, svg, nothing, css, type TemplateResult, type PropertyValues } from 'lit';
import { state, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { localize, getLanguage } from '../../core/i18n';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { type RadarCardConfig, normalizeRadar } from './config';
import { DATA_TILE, DATA_ZOOM, dataZoomFor, loadField, colorOf, type Field } from './field';
import { G1000_PALETTE } from './palette';
import { loadVector, drawVector, type VectorMap } from './vector';

const TILE = 256;
const REFRESH_MS = 5 * 60 * 1000;
const NM = 1.852;
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** Progi odleglosci do opadu (jak w backendzie wallboardu): echo / umiarkowany / silny [dBZ]. */
const DIST_THR: Array<[string, number]> = [
  ['echo', 15],
  ['moderate', 30],
  ['heavy', 40],
];
const pad = (n: number) => String(n).padStart(2, '0');

interface Frame {
  time: number;
  path: string;
}

/** Wspolrzedne swiata w pikselach (Web Mercator, kafel 256) na danym przyblizeniu. */
function project(lat: number, lon: number, z: number): [number, number] {
  const s = TILE * 2 ** z;
  const r = (lat * Math.PI) / 180;
  return [((lon + 180) / 360) * s, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * s];
}

/** Piksele swiata -> wspolrzedne geograficzne (odwrotnosc project). */
function unproject(x: number, y: number, z: number): [number, number] {
  const s = TILE * 2 ** z;
  return [(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / s))) * 180) / Math.PI, (x / s) * 360 - 180];
}

/**
 * Radar jak NEXRAD na MFD. Kafle RainViewer (Universal Blue, 512 px) dekodowane w przegladarce do dBZ,
 * pole interpolowane dwuliniowo do pikseli widoku i malowane paleta G1000 (zielony / zolty / czerwony / magenta).
 * Gdy serwer nie pozwala odczytac pikseli (CORS) - oryginalne kafle.
 */
export class AvionicsRadarCard extends LitElement {
  @state() private _config?: RadarCardConfig;
  @state() private _styleMode: StyleMode = 'look';
  @state() private _frames: Frame[] = [];
  @state() private _host = '';
  @state() private _idx = 0;
  @state() private _playing = true;
  @state() private _zoom = 8;
  @state() private _width = 400;
  @state() private _error = '';
  @state() private _cors = true;
  @state() private _ready = 0;
  @state() private _dist: Record<string, { km: number; dir: string } | undefined> = {};
  @query('canvas.rad') private _canvas?: HTMLCanvasElement;
  @query('canvas.vec') private _vecCanvas?: HTMLCanvasElement;
  @state() private _vector?: VectorMap | null;
  /** srodek widoku po przesunieciu mapy (brak = dom) */
  @state() private _center?: [number, number];
  /** przesuniecie w trakcie przeciagania [px] */
  @state() private _drag: [number, number] = [0, 0];
  private _dragStart?: [number, number];
  private _vecKey = '';
  private _hass?: HomeAssistant;
  private _lastFetch = 0;
  private _timer?: number;
  private _ro?: ResizeObserver;
  private _fields = new Map<string, Promise<Field>>();
  private _images: Array<ImageData | undefined> = [];
  private _build = 0;
  private _builtKey = '';

  static getConfigElement() {
    return document.createElement('avionics-radar-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config: RadarCardConfig): void {
    this._config = normalizeRadar(config);
    this._zoom = this._config.zoom ?? 8;
    this._playing = this._config.autoplay !== false;
    this._lastFetch = 0;
    this._builtKey = '';
  }

  getCardSize(): number {
    return 7;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect.width;
      if (w && Math.abs(w - this._width) > 4) this._width = w;
    });
    this._ro.observe(this);
    this._schedule();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._ro?.disconnect();
    clearTimeout(this._timer);
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._config) return;
    if (Date.now() - this._lastFetch > REFRESH_MS) {
      this._lastFetch = Date.now();
      void this._loadFrames();
    }
    if ((this._config.basemap ?? 'vector') === 'vector' && this._vector === undefined && this._config.vector_url) {
      this._vector = null;
      void loadVector(this._config.vector_url).then((m) => (this._vector = m));
    }
    const mode = readStyleMode(this);
    if (mode !== this._styleMode) this._styleMode = mode;
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Srodek widoku: przesuniety przez uzytkownika albo dom. */
  private _view(): [number, number] | undefined {
    return this._center ?? this._loc();
  }

  private _loc(): [number, number] | undefined {
    const c = this._config!;
    const lat = c.latitude ?? (this._hass as any)?.config?.latitude;
    const lon = c.longitude ?? (this._hass as any)?.config?.longitude;
    return typeof lat === 'number' && typeof lon === 'number' ? [lat, lon] : undefined;
  }

  private async _loadFrames(): Promise<void> {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) throw new Error(`RainViewer ${res.status}`);
      const j = await res.json();
      this._host = j.host ?? 'https://tilecache.rainviewer.com';
      // darmowe API: tylko przeszlosc (~2 h)
      this._frames = (j.radar?.past ?? []).map((f: Frame) => ({ time: f.time, path: f.path }));
      this._idx = Math.max(this._frames.length - 1, 0);
      this._error = '';
      this._builtKey = '';
    } catch (e) {
      this._error = String((e as Error)?.message ?? e);
    }
  }

  /** Animacja: kolejne klatki, dluzsza pauza na ostatniej. */
  private _schedule(): void {
    clearTimeout(this._timer);
    const ms = this._config?.frame_ms ?? 600;
    const last = this._idx >= this._frames.length - 1;
    this._timer = window.setTimeout(() => {
      if (this._playing && this._frames.length) this._idx = (this._idx + 1) % this._frames.length;
      this._schedule();
    }, last ? ms * 3 : ms);
  }

  private _url(f: Frame, rz: number, x: number, y: number): string {
    // Universal Blue (2) - jedyna paleta darmowego API; wygladzanie 1, bez sniegu (jak w wallboardzie)
    const n = 2 ** rz;
    return `${this._host}${f.path}/${DATA_TILE}/${rz}/${((x % n) + n) % n}/${y}/2/1_0.png`;
  }

  private _field(f: Frame, rz: number, x: number, y: number): Promise<Field> {
    const url = this._url(f, rz, x, y);
    let p = this._fields.get(url);
    if (!p) {
      p = loadField(url);
      this._fields.set(url, p);
      // ograniczenie pamieci podrecznej
      if (this._fields.size > 260) this._fields.delete(this._fields.keys().next().value as string);
    }
    return p;
  }

  /** Przebudowa obrazow klatek dla biezacego widoku (rozmiar, przyblizenie, klatki). */
  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const c = this._config;
    const view = c ? this._view() : undefined;
    if (c && view && this._frames.length && c.style !== 'orig') {
      const key = `${this._frames.map((f) => f.path).join()}|${this._width}|${c.height}|${this._zoom}|${view}`;
      if (key !== this._builtKey) {
        this._builtKey = key;
        void this._rebuild(view);
      }
    }
    this._draw();
    this._drawVector();
  }

  /** Warstwa wektorowa nad radarem (granice zawsze widoczne), przerysowywana przy zmianie widoku. */
  private _drawVector(): void {
    const cv = this._vecCanvas;
    const map = this._vector;
    const loc = this._view();
    if (!cv || !map || !loc) return;
    const W = cv.width;
    const H = cv.height;
    const key = `${W}|${H}|${this._zoom}|${loc}`;
    if (key === this._vecKey) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    this._vecKey = key;
    const z = this._zoom;
    const [cx, cy] = project(loc[0], loc[1], z);
    drawVector(
      ctx,
      map,
      (lat, lon) => {
        const [x, y] = project(lat, lon, z);
        return [x - cx + W / 2, y - cy + H / 2];
      },
      W,
      H,
      `700 11px ${this._font()}`,
    );
  }

  /** Czcionka karty (zmienna --av-font jest zdefiniowana na ha-card wewnatrz komponentu). */
  private _font(): string {
    const card = this.shadowRoot?.querySelector('ha-card');
    const f = card ? getComputedStyle(card).getPropertyValue('--av-font').trim() : '';
    return f || "'Roboto Condensed', 'Arial Narrow', sans-serif";
  }

  private _draw(): void {
    const cv = this._canvas;
    // klatka jeszcze sie buduje - najblizsza gotowa (wczesniejsza, a gdy brak - pozniejsza)
    let img = this._images[this._idx];
    for (let i = this._idx; !img && i >= 0; i--) img = this._images[i];
    for (let i = this._idx; !img && i < this._images.length; i++) img = this._images[i];
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    if (img && cv.width === img.width && cv.height === img.height) ctx.putImageData(img, 0, 0);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  }

  private async _rebuild(loc: [number, number]): Promise<void> {
    const token = ++this._build;
    const c = this._config!;
    const W = Math.max(Math.round(this._width - 2), 200);
    const H = c.height ?? 320;
    const z = this._zoom;
    const [cx, cy] = project(loc[0], loc[1], z);
    // poziom danych wg widoku: kafel 512 o poziom nizej = natywna rozdzielczosc, malo zapytan
    const rz = dataZoomFor(z);
    const scale = 2 ** (z - rz) / (DATA_TILE / TILE); // pikseli widoku na piksel danych
    const gx0 = (cx - W / 2) / scale;
    const gy0 = (cy - H / 2) / scale;
    const tx0 = Math.floor(gx0 / DATA_TILE);
    const tx1 = Math.floor((gx0 + W / scale) / DATA_TILE);
    const ty0 = Math.floor(gy0 / DATA_TILE);
    const ty1 = Math.floor((gy0 + H / scale) / DATA_TILE);
    const alpha = Math.round((c.opacity ?? 0.85) * 255);
    const images: Array<ImageData | undefined> = new Array(this._frames.length);
    // nowy kadr - stary obraz radaru bylby w zlym miejscu
    this._images = images;
    this._draw();

    for (let fi = 0; fi < this._frames.length; fi++) {
      const f = this._frames[fi];
      const tiles = new Map<string, Float32Array>();
      const jobs: Array<Promise<void>> = [];
      for (let tx = tx0; tx <= tx1; tx++) {
        for (let ty = ty0; ty <= ty1; ty++) {
          jobs.push(
            this._field(f, rz, tx, ty).then((fld) => {
              if (fld === null) this._cors = false;
              else if (fld.length) tiles.set(`${tx},${ty}`, fld);
            }),
          );
        }
      }
      await Promise.all(jobs);
      if (token !== this._build) return;
      if (!this._cors) {
        this._images = [];
        this.requestUpdate();
        return;
      }
      // probka pola dBZ w pikselu danych (NaN -> -20, zeby krawedzie interpolowaly sie do zera)
      const at = (gx: number, gy: number): number => {
        const tx = Math.floor(gx / DATA_TILE);
        const ty = Math.floor(gy / DATA_TILE);
        const t = tiles.get(`${tx},${ty}`);
        if (!t) return -20;
        const v = t[(gy - ty * DATA_TILE) * DATA_TILE + (gx - tx * DATA_TILE)];
        return Number.isFinite(v) ? v : -20;
      };
      const img = new ImageData(W, H);
      const d = img.data;
      for (let py = 0; py < H; py++) {
        const fy = gy0 + (py + 0.5) / scale - 0.5;
        const y0 = Math.floor(fy);
        const wy = fy - y0;
        for (let px = 0; px < W; px++) {
          const fx = gx0 + (px + 0.5) / scale - 0.5;
          const x0 = Math.floor(fx);
          const wx = fx - x0;
          // interpolacja dwuliniowa pola dBZ, dopiero potem kolor
          const v =
            (at(x0, y0) * (1 - wx) + at(x0 + 1, y0) * wx) * (1 - wy) + (at(x0, y0 + 1) * (1 - wx) + at(x0 + 1, y0 + 1) * wx) * wy;
          const col = colorOf(v, alpha);
          if (col) {
            const k = (py * W + px) * 4;
            d[k] = col[0];
            d[k + 1] = col[1];
            d[k + 2] = col[2];
            d[k + 3] = col[3];
          }
        }
      }
      images[fi] = img;
      this._images = images;
      if (fi === this._idx) this._draw();
    }
    if (token !== this._build) return;
    this._ready++;
    const home = this._loc();
    if (home) void this._distances(home, token);
  }

  /** Odleglosc do najblizszego opadu (3 progi) z ostatniej klatki, 3 x 3 kafle wokol domu. */
  private async _distances(loc: [number, number], token: number): Promise<void> {
    const f = this._frames[this._frames.length - 1];
    if (!f) return;
    const [hx, hy] = project(loc[0], loc[1], DATA_ZOOM).map((v) => (v * DATA_TILE) / TILE);
    const ctx = Math.floor(hx / DATA_TILE);
    const cty = Math.floor(hy / DATA_TILE);
    // metry na piksel danych na szerokosci domu
    const mpp = (156543.03392 * Math.cos((loc[0] * Math.PI) / 180)) / 2 ** DATA_ZOOM / (DATA_TILE / TILE);
    const best: Record<string, { d2: number; dx: number; dy: number } | undefined> = {};
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const fld = await this._field(f, DATA_ZOOM, ctx + dx, cty + dy);
        if (!fld || !fld.length) continue;
        const ox = (ctx + dx) * DATA_TILE - hx;
        const oy = (cty + dy) * DATA_TILE - hy;
        for (let i = 0; i < fld.length; i++) {
          const v = fld[i];
          if (!(v >= 15)) continue;
          const px = ox + (i % DATA_TILE) + 0.5;
          const py = oy + Math.floor(i / DATA_TILE) + 0.5;
          const d2 = px * px + py * py;
          for (const [name, thr] of DIST_THR) {
            if (v >= thr && (!best[name] || d2 < best[name]!.d2)) best[name] = { d2, dx: px, dy: py };
          }
        }
      }
    }
    if (token !== this._build) return;
    const out: Record<string, { km: number; dir: string } | undefined> = {};
    for (const [name] of DIST_THR) {
      const b = best[name];
      out[name] = b
        ? {
            km: (Math.sqrt(b.d2) * mpp) / 1000,
            dir: DIRS[Math.round(((Math.atan2(b.dx, -b.dy) * 180) / Math.PI + 360) % 360 / 22.5) % 16],
          }
        : undefined;
    }
    this._dist = out;
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const loc = this._loc();
    const view = this._view();
    const W = Math.max(Math.round(this._width - 2), 200);
    const H = c.height ?? 320;
    const frame = this._frames[this._idx];
    const recolor = c.style !== 'orig' && this._cors;
    const [dx, dy] = this._drag;

    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        <div class="top">
          <span class="title">${c.title ?? t('radar.title')}</span>
          <span class="when">${frame ? this._time(frame) : ''}</span>
        </div>
        <div
          class="map"
          style="height:${H}px"
          @pointerdown=${this._down}
          @pointermove=${this._move}
          @pointerup=${this._up}
          @pointercancel=${this._up}
        >
          <div class="layers" style="transform:translate(${dx}px, ${dy}px)">
            ${view ? this._base(view, W, H) : nothing}
            ${recolor
              ? html`<canvas class="rad" width=${W} height=${H}></canvas>`
              : view && frame
                ? this._origTiles(view, W, H)
                : nothing}
            ${(c.basemap ?? 'vector') === 'vector' ? html`<canvas class="vec" width=${W} height=${H}></canvas>` : nothing}
            ${loc && view ? this._overlay(loc, view, W, H) : nothing}
          </div>
          ${this._compass(W)}
          ${this._error ? html`<div class="err">${t('radar.error')}: ${this._error}</div>` : nothing}
          ${!this._cors && c.style !== 'orig' ? html`<div class="note">${t('radar.no_cors')}</div>` : nothing}
          <div class="zoom">
            <button @click=${() => (this._zoom = Math.min(this._zoom + 1, 10))}>+</button>
            <button @click=${() => (this._zoom = Math.max(this._zoom - 1, 3))}>−</button>
            ${this._center ? html`<button title="⌂" @click=${() => (this._center = undefined)}>⌂</button>` : nothing}
          </div>
        </div>
        ${this._timeline()} ${c.show_distances !== false && recolor ? this._distRow(t) : nothing}
        <div class="foot">
          ${recolor ? this._legend(t) : html`<span></span>`}
          <span class="attr">${this._attribution()}</span>
        </div>
      </ha-card>
    `;
  }

  private _time(f: Frame): string {
    const d = new Date(f.time * 1000);
    const ago = Math.round((Date.now() / 1000 - f.time) / 60);
    return `${pad(d.getHours())}:${pad(d.getMinutes())} · −${ago} min`;
  }

  /** Adres kafla podkladu (zrodla bez klucza API; CARTO wymaga juz klucza). */
  private _baseUrl(z: number, x: number, y: number): string | undefined {
    const c = this._config!;
    switch (c.basemap ?? 'vector') {
      case 'none':
        return undefined;
      case 'osm':
        return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
      case 'custom':
        return (c.basemap_url ?? '').replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)) || undefined;
      default:
        return `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${z}/${y}/${x}`;
    }
  }

  private _attribution(): string {
    const b = this._config?.basemap ?? 'vector';
    const map = b === 'osm' ? '© OpenStreetMap' : b === 'esri_dark' ? '© Esri' : b === 'vector' ? 'Natural Earth' : '';
    return [map, 'RainViewer'].filter(Boolean).join(' · ');
  }

  private _base(loc: [number, number], W: number, H: number) {
    const c = this._config!;
    const z = this._zoom;
    const [cx, cy] = project(loc[0], loc[1], z);
    const n = 2 ** z;
    if (['none', 'vector'].includes(c.basemap ?? 'vector')) return nothing;
    const out: TemplateResult[] = [];
    for (let tx = Math.floor((cx - W / 2) / TILE); tx <= Math.floor((cx + W / 2) / TILE); tx++) {
      for (let ty = Math.floor((cy - H / 2) / TILE); ty <= Math.floor((cy + H / 2) / TILE); ty++) {
        if (ty < 0 || ty >= n) continue;
        const x = ((tx % n) + n) % n;
        const url = this._baseUrl(z, x, ty);
        if (!url) continue;
        out.push(
          html`<img src=${url} style="left:${tx * TILE - cx + W / 2}px;top:${ty * TILE - cy + H / 2}px" alt="" />`,
        );
      }
    }
    // OSM jest jasna - przyciemnienie filtrem (odwrocenie jasnosci z zachowaniem barw)
    const filter =
      c.basemap === 'osm'
        ? `invert(1) hue-rotate(180deg) grayscale(0.6) brightness(${(c.map_brightness ?? 0.8) * 0.75}) contrast(1.1)`
        : `brightness(${c.map_brightness ?? 0.8})`;
    return html`<div class="base" style="filter:${filter}">${out}</div>`;
  }

  /** Oryginalne kafle RainViewer (styl orig albo brak zgody CORS na przemalowanie). */
  private _origTiles(loc: [number, number], W: number, H: number) {
    const c = this._config!;
    const z = this._zoom;
    const rz = Math.min(z, DATA_ZOOM);
    const k = 2 ** (z - rz);
    void dataZoomFor;
    const [rcx, rcy] = project(loc[0], loc[1], rz);
    const rn = 2 ** rz;
    return html`${this._frames.map((f, i) => {
      const imgs: TemplateResult[] = [];
      for (let tx = Math.floor((rcx - W / 2 / k) / TILE); tx <= Math.floor((rcx + W / 2 / k) / TILE); tx++) {
        for (let ty = Math.floor((rcy - H / 2 / k) / TILE); ty <= Math.floor((rcy + H / 2 / k) / TILE); ty++) {
          if (ty < 0 || ty >= rn) continue;
          const x = ((tx % rn) + rn) % rn;
          imgs.push(html`<img
            src="${this._host}${f.path}/${DATA_TILE}/${rz}/${x}/${ty}/2/1_0.png"
            style="left:${(tx * TILE - rcx) * k + W / 2}px;top:${(ty * TILE - rcy) * k + H / 2}px;width:${TILE * k}px;height:${TILE * k}px"
            alt=""
          />`);
        }
      }
      return html`<div class="orig" style="opacity:${i === this._idx ? c.opacity ?? 0.85 : 0}">${imgs}</div>`;
    })}`;
  }

  /** Nakladka MFD: dom, okregi odleglosci, polnoc. */
  // ---------------- przesuwanie mapy ----------------
  private _down = (e: PointerEvent): void => {
    if ((e.target as HTMLElement).closest('button')) return;
    this._dragStart = [e.clientX, e.clientY];
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  private _move = (e: PointerEvent): void => {
    if (!this._dragStart) return;
    this._drag = [e.clientX - this._dragStart[0], e.clientY - this._dragStart[1]];
  };

  private _up = (): void => {
    if (!this._dragStart) return;
    const [dx, dy] = this._drag;
    this._dragStart = undefined;
    this._drag = [0, 0];
    const view = this._view();
    if (!view || Math.hypot(dx, dy) < 3) return;
    const [cx, cy] = project(view[0], view[1], this._zoom);
    this._center = unproject(cx - dx, cy - dy, this._zoom);
  };

  private _compass(W: number) {
    return html`<svg class="ovl" viewBox="0 0 ${W} 40" width=${W} height="40">
      <g transform="translate(${W - 18}, 18)">
        <polygon points="0,-10 5,6 0,3 -5,6" class="north"></polygon>
        <text x="0" y="18" class="nl">N</text>
      </g>
    </svg>`;
  }

  private _overlay(loc: [number, number], view: [number, number], W: number, H: number) {
    const c = this._config!;
    const unit = c.distance_unit ?? 'km';
    const mpp = (156543.03392 * Math.cos((loc[0] * Math.PI) / 180)) / 2 ** this._zoom;
    const rings = (c.rings ?? '')
      .split(/[,;\s]+/)
      .map((x) => parseFloat(x))
      .filter((x) => x > 0);
    // dom wzgledem srodka widoku (po przesunieciu mapy nie musi byc w srodku)
    const [hx, hy] = project(loc[0], loc[1], this._zoom);
    const [vx, vy] = project(view[0], view[1], this._zoom);
    const cx = hx - vx + W / 2;
    const cy = hy - vy + H / 2;
    return html`<svg class="ovl" viewBox="0 0 ${W} ${H}" width=${W} height=${H}>
      ${rings.map((r) => {
        const px = ((unit === 'nm' ? r * NM : r) * 1000) / mpp;
        // za maly (zlewa sie z domem przy oddaleniu) albo daleko poza kadrem
        if (px < 14 || px > Math.hypot(W, H) * 1.5) return nothing;
        return svg`<circle cx=${cx} cy=${cy} r=${px} class="ring"></circle>
          <text x=${cx + px * 0.707 + 4} y=${cy - px * 0.707} class="rl">${r}</text>`;
      })}
      <polygon points="${cx},${cy - 7} ${cx + 7},${cy} ${cx},${cy + 7} ${cx - 7},${cy}" class="home"></polygon>
    </svg>`;
  }

  private _timeline() {
    const fr = this._frames;
    if (!fr.length) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);
    return html`<div class="tl">
      <button class="play" @click=${() => (this._playing = !this._playing)}>${this._playing ? '❚❚' : '▶'}</button>
      <div class="steps">
        ${fr.map(
          (f, i) => html`<span
            class=${classMap({ st: true, on: i === this._idx })}
            title=${this._time(f)}
            @click=${() => {
              this._idx = i;
              this._playing = false;
            }}
          ></span>`,
        )}
      </div>
      <button
        @click=${() => {
          this._idx = fr.length - 1;
          this._playing = false;
        }}
      >
        ${t('radar.now')}
      </button>
    </div>`;
  }

  /** Odleglosc do najblizszego opadu: echo / umiarkowany / silny, z kierunkiem. */
  private _distRow(t: (k: string) => string) {
    const c = this._config!;
    const nm = c.distance_unit === 'nm';
    const col = ['#00ff00', '#ffff00', '#ff0000'];
    return html`<div class="dist">
      ${DIST_THR.map(([name], i) => {
        const d = this._dist[name];
        const v = d ? `${Math.round(nm ? d.km / NM : d.km)} ${nm ? 'NM' : 'km'} ${d.dir}` : '—';
        return html`<span class="dl" style="color:${col[i]}">${t(`radar.dist.${name}`)}</span><span class="dv">${v}</span>`;
      })}
    </div>`;
  }

  private _legend(t: (k: string) => string) {
    return html`<span class="lg"
      >${G1000_PALETTE.map(
        ([thr, rgb], i) => html`<span class="sw" style="background:rgb(${rgb.join(',')})"></span><span>${thr}${
          i === 0 ? ' dBZ' : ''
        }</span>`,
      )}<span class="lgt">${t('radar.legend')}</span></span
    >`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 0 6px;
      }
      .top {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 0 14px 6px;
      }
      .title {
        color: var(--av-label);
        font-size: 15px;
        font-weight: 700;
        text-transform: uppercase;
      }
      .when {
        font-size: 14px;
        font-weight: 700;
      }
      .map {
        position: relative;
        overflow: hidden;
        cursor: grab;
        touch-action: none;
        user-select: none;
        background: #000;
        border-top: 1px solid var(--av-frame);
        border-bottom: 1px solid var(--av-frame);
      }
      .base img,
      .orig img {
        position: absolute;
        width: 256px;
        height: 256px;
        user-select: none;
        pointer-events: none;
      }
      .layers {
        position: absolute;
        inset: 0;
      }
      .base,
      .orig {
        position: absolute;
        inset: 0;
      }
      canvas.rad {
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
      }
      .ovl {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      .ring {
        fill: none;
        stroke: var(--av-setpoint);
        stroke-width: 1.2;
        stroke-dasharray: 6 5;
      }
      .rl {
        fill: var(--av-setpoint);
        font-size: 11px;
        font-weight: 700;
        font-family: var(--av-font);
        dominant-baseline: middle;
        stroke: #000;
        stroke-width: 3;
        paint-order: stroke;
        stroke-linejoin: round;
      }
      .home {
        fill: var(--av-setpoint);
      }
      canvas.vec {
        position: absolute;
        left: 0;
        top: 0;
        pointer-events: none;
      }
      .north {
        fill: var(--av-value);
      }
      .nl {
        fill: var(--av-value);
        font-size: 10px;
        font-weight: 700;
        text-anchor: middle;
        font-family: var(--av-font);
      }
      .zoom {
        position: absolute;
        left: 8px;
        top: 8px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .zoom button,
      .tl button {
        font: inherit;
        font-weight: 700;
        background: rgba(0, 0, 0, 0.7);
        color: var(--av-value);
        border: 1px solid #5a5a5a;
        cursor: pointer;
      }
      .zoom button {
        width: 26px;
        height: 24px;
        font-size: 16px;
        line-height: 1;
        padding: 0;
      }
      .err,
      .note {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 6px;
        text-align: center;
        color: var(--av-dim);
        font-size: 11px;
      }
      .tl {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px 2px;
      }
      .tl button {
        font-size: 11px;
        padding: 2px 8px;
      }
      .steps {
        flex: 1 1 auto;
        display: flex;
        gap: 2px;
        align-items: flex-end;
        height: 16px;
      }
      .st {
        flex: 1 1 0;
        height: 8px;
        background: #5a5a5a;
        cursor: pointer;
      }
      .st.on {
        height: 16px;
        background: var(--av-value);
      }
      .dist {
        display: grid;
        grid-template-columns: repeat(3, auto 1fr);
        gap: 2px 8px;
        align-items: baseline;
        padding: 6px 14px 0;
        font-size: 12px;
      }
      .dl {
        font-weight: 700;
        font-size: 11px;
      }
      .dv {
        font-weight: 700;
        white-space: nowrap;
      }
      .foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        padding: 6px 14px 0;
        font-size: 10px;
      }
      .lg {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .sw {
        width: 12px;
        height: 8px;
        display: inline-block;
      }
      .lgt {
        color: var(--av-dim);
        margin-left: 4px;
      }
      .attr {
        color: var(--av-dim);
        font-size: 9px;
      }
    `,
  ];
}
