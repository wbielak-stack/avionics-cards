import { LitElement, html, svg, nothing, css, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { HomeAssistant } from '../../types';
import { tokens, tileBase } from '../../core/styles';
import { num } from '../../core/format';
import { entityPrecision } from '../../core/entity-format';
import { localize, getLanguage } from '../../core/i18n';
import { fireMoreInfo } from '../../core/actions';
import { readStyleMode, type StyleMode } from '../../core/style-mode';
import { ObservedHistory } from '../../core/observed';
import { type WeatherCardConfig, normalizeWeather } from './config';
import { type Field, FIELDS, WEATHER_ATTR, detectFromDevice, compassPoint } from './fields';
import { parseRanges } from '../graph/config';
import '../graph/graph-el';
import '../wind/wind-rose-el';
import './wind-graph-el';

interface Reading {
  value: number;
  unit: string;
  entity?: string;
}

/** Pozycja do wyswietlenia - wspolna dla ukladu listy i okienek. */
interface Item {
  /** klucz pola albo id dodatkowej encji - do kolejnosci i ukrywania */
  key: string;
  label: string;
  main: string;
  unit?: string;
  color?: string;
  sub?: string;
  subColor?: string;
  entity?: string;
}

/** Spadek cisnienia, od ktorego trend jest ostrzezeniem [hPa / okres]. */
const FAST_FALL = 3;
const STEADY = 0.5;
/** Roznica temperatura - punkt rosy, ponizej ktorej grozi mgla [°C]. */
const FOG_SPREAD = 2.5;

export class AvionicsWeatherCard extends LitElement {
  @state() private _config?: WeatherCardConfig;
  @state() private _styleMode: StyleMode = 'look';

  private _hass?: HomeAssistant;
  private _key = '';
  private _map: Partial<Record<Field, string>> = {};
  private _observed = new ObservedHistory();

  static getConfigElement() {
    return document.createElement('avionics-weather-card-editor');
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config: WeatherCardConfig): void {
    this._config = normalizeWeather(config);
    this._map = {};
    this._observed.reset();
    this._key = '';
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 6, min_columns: 4 };
  }

  set hass(hass: HomeAssistant) {
    const first = !this._hass;
    this._hass = hass;
    const c = this._config;
    if (!c) return;
    if (first || !Object.keys(this._map).length) this._resolveMap();
    this._observed.update(hass, () => this.requestUpdate());
    const mode = readStyleMode(this);
    const ids = [...Object.values(this._map), c.weather_entity, ...(c.extra ?? [])].filter(Boolean) as string[];
    const key = ids.map((e) => hass.states[e]?.last_updated ?? '').join('|') + `|${mode}|${getLanguage(hass)}`;
    if (key === this._key) return;
    this._key = key;
    this._styleMode = mode;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  /** Encje pol: jawne z konfiguracji > wykryte z urzadzenia. Sledzenie historii dla trendu i min/max. */
  private _resolveMap(): void {
    const c = this._config!;
    const detected = detectFromDevice(this._hass!, c.device);
    const map: Partial<Record<Field, string>> = {};
    for (const f of FIELDS) {
      const id = c[f] || detected[f];
      if (id) map[f] = id;
    }
    this._map = map;
    this._observed.reset();
    this._observed.track(map.pressure, (c.pressure_trend_hours ?? 3) * 60 + 5);
    this._observed.track(map.temperature, 24 * 60);
  }

  /** Odczyt pola: encja, a gdy brak - atrybut encji weather.*. */
  private _read(f: Field): Reading | undefined {
    const st = this._hass!.states;
    const id = this._map[f];
    if (id) {
      const s = st[id];
      const v = num(s?.state);
      if (Number.isFinite(v)) return { value: v, unit: s?.attributes?.unit_of_measurement ?? '', entity: id };
      return undefined;
    }
    const w = this._config!.weather_entity ? st[this._config!.weather_entity] : undefined;
    const spec = WEATHER_ATTR[f];
    if (!w || !spec) return undefined;
    const v = num(w.attributes?.[spec.attr]);
    if (!Number.isFinite(v)) return undefined;
    return { value: v, unit: spec.unit ?? (spec.unitAttr ? w.attributes?.[spec.unitAttr] ?? '' : ''), entity: w.entity_id };
  }

  private _fmt(r: Reading | undefined, digits?: number): string {
    if (!r) return '--';
    const d = digits ?? (r.entity && r.entity.startsWith('sensor.') ? entityPrecision(this._hass, r.entity) : 1);
    return r.value.toFixed(d).replace('.', ',');
  }

  // ---------------- render ----------------
  protected render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c || !this._hass) return nothing;
    const t = (k: string) => localize(getLanguage(this._hass), k);

    const r = Object.fromEntries(FIELDS.map((f) => [f, this._read(f)])) as Record<Field, Reading | undefined>;
    const hasWind = !!(r.wind_speed || r.wind_direction);
    const items = this._items(r, t);

    if (!hasWind && !items.length) {
      return html`<ha-card><div class="empty">${t('weather.no_data')}</div></ha-card>`;
    }
    const boxes = c.layout === 'boxes';
    // 0 = automatycznie: tyle kolumn, ile zmiesci sie okienek o min. szerokosci
    const autoCols = (c.columns ?? 2) === 0;
    const cols = Math.min(Math.max(c.columns ?? 2, 1), 4);
    // wykresy: kazdy pod roza (recznie albo automatycznie wg szerokosci karty) albo na dole;
    // przy tym samym miejscu decyduje kolejnosc z konfiguracji
    const graphs = this._graphs(r, t, boxes, hasWind);
    const underG = graphs.filter((g) => g.under);
    const bottomG = graphs.filter((g) => !g.under);

    return html`
      <ha-card class=${classMap({ 'true-style': this._styleMode === 'true' })}>
        ${c.name ? html`<div class="title">${c.name}</div>` : nothing}
        ${boxes
          ? html`<div
              class=${classMap({ boxes: true, autocols: autoCols })}
              style=${autoCols ? '' : `grid-template-columns: repeat(${cols}, minmax(0, 1fr))`}
            >
              ${hasWind ? html`<div class="box windbox">${this._renderWind(r, t)}</div>` : nothing}
              ${underG.map((g) => g.tpl)}
              ${items.map((i) => this._box(i))}
              ${bottomG.map((g) => g.tpl)}
            </div>`
          : html`<div class=${classMap({ wrap: true, nowind: !hasWind })}>
                ${hasWind ? this._renderWind(r, t) : nothing}
                ${items.length ? html`<div class="rows">${items.map((i) => this._row(i))}</div>` : nothing}
              </div>
              ${graphs.map((g) => g.tpl)}`}
      </ha-card>
    `;
  }

  private _valueTpl(i: Item) {
    return html`<span style=${i.color ? `color:${i.color}` : ''}>${i.main}</span>${i.unit
      ? html`<span class="u">${i.unit}</span>`
      : nothing}`;
  }

  private _row(i: Item) {
    return html`<div class="row" @click=${() => i.entity && fireMoreInfo(this, i.entity)}>
      <span class="lbl">${i.label}</span>
      <span class="val"
        >${this._valueTpl(i)}${i.sub
          ? html`<span class="sub" style=${i.subColor ? `color:${i.subColor}` : ''}>${i.sub}</span>`
          : nothing}</span
      >
    </div>`;
  }

  private _box(i: Item) {
    return html`<div class="box" @click=${() => i.entity && fireMoreInfo(this, i.entity)}>
      <div class="blbl">${i.label}</div>
      <div class="bval">${this._valueTpl(i)}</div>
      ${i.sub ? html`<div class="bsub" style=${i.subColor ? `color:${i.subColor}` : ''}>${i.sub}</div>` : nothing}
    </div>`;
  }

  /** Pozycje do wyswietlenia - tylko te, dla ktorych sa dane. */
  private _items(r: Record<Field, Reading | undefined>, t: (k: string) => string): Item[] {
    const out: Item[] = [];
    const fmt = (x: Reading, d?: number) => this._fmt(x, d);
    const lvl = (v: number, caution: number, warning: number) =>
      v >= warning ? 'var(--av-warning)' : v >= caution ? 'var(--av-caution)' : undefined;

    if (r.temperature) {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const mm = this._map.temperature
        ? this._observed.range(this._map.temperature, (Date.now() - from.getTime()) / 60000)
        : undefined;
      const d = this._map.temperature ? entityPrecision(this._hass, this._map.temperature) : 1;
      out.push({
        key: 'temperature',
        label: t('weather.temp'),
        main: fmt(r.temperature),
        unit: r.temperature.unit,
        sub: mm ? `↓${mm.min.toFixed(d).replace('.', ',')} ↑${mm.max.toFixed(d).replace('.', ',')}` : undefined,
        entity: r.temperature.entity,
      });
    }
    if (r.feels_like) {
      out.push({ key: 'feels_like', label: t('weather.feels'), main: fmt(r.feels_like), unit: r.feels_like.unit, entity: r.feels_like.entity });
    }
    if (r.dew_point) {
      // roznica temperatura - punkt rosy; ponizej 2,5 °C ryzyko mgly (jak w METAR)
      const spread = r.temperature ? r.temperature.value - r.dew_point.value : NaN;
      const fog = Number.isFinite(spread) && spread < FOG_SPREAD;
      out.push({
        key: 'dew_point',
        label: t('weather.dew'),
        main: fmt(r.dew_point),
        unit: r.dew_point.unit,
        sub: Number.isFinite(spread) ? `Δ ${spread.toFixed(1).replace('.', ',')}${fog ? ` · ${t('weather.fog')}` : ''}` : undefined,
        subColor: fog ? 'var(--av-caution)' : undefined,
        entity: r.dew_point.entity,
      });
    }
    if (r.humidity) {
      out.push({ key: 'humidity', label: t('weather.hum'), main: fmt(r.humidity, 0), unit: '%', entity: r.humidity.entity });
    }
    if (r.pressure) {
      const tr = this._trendInfo(r.pressure);
      out.push({
        key: 'pressure',
        label: t('weather.baro'),
        main: fmt(r.pressure, 0),
        unit: r.pressure.unit,
        sub: tr?.text,
        subColor: tr?.color,
        entity: r.pressure.entity,
      });
    }
    if (r.rain_today || r.rain_rate) {
      const main = r.rain_today ?? r.rain_rate!;
      out.push({
        key: 'rain',
        label: t('weather.rain'),
        main: fmt(main),
        unit: main.unit,
        sub: r.rain_today && r.rain_rate ? `${fmt(r.rain_rate)} ${r.rain_rate.unit}` : undefined,
        entity: main.entity,
      });
    }
    if (r.uv) {
      const v = r.uv.value;
      const [cat, col] =
        v < 3
          ? ['low', undefined]
          : v < 6
            ? ['moderate', 'var(--av-caution)']
            : v < 8
              ? ['high', 'var(--av-caution)']
              : v < 11
                ? ['very_high', 'var(--av-warning)']
                : ['extreme', 'var(--av-warning)'];
      out.push({ key: 'uv', label: 'UV', main: fmt(r.uv, 1), color: col, sub: t(`weather.uv.${cat}`), entity: r.uv.entity });
    }
    if (r.solar) {
      out.push({ key: 'solar', label: t('weather.solar'), main: fmt(r.solar, 0), unit: r.solar.unit, entity: r.solar.entity });
    }
    if (r.illuminance) {
      const v = r.illuminance.value;
      out.push({
        key: 'illuminance',
        label: t('weather.light'),
        main: v >= 10000 ? `${Math.round(v / 1000)}k` : fmt(r.illuminance, 0),
        unit: r.illuminance.unit,
        entity: r.illuminance.entity,
      });
    }
    if (r.pm25) {
      out.push({ key: 'pm25', label: 'PM2.5', main: fmt(r.pm25, 0), unit: r.pm25.unit, color: lvl(r.pm25.value, 25, 50), entity: r.pm25.entity });
    }
    if (r.pm10) {
      out.push({ key: 'pm10', label: 'PM10', main: fmt(r.pm10, 0), unit: r.pm10.unit, color: lvl(r.pm10.value, 50, 100), entity: r.pm10.entity });
    }
    if (r.radiation) {
      const usv = r.radiation.value * (r.radiation.unit === 'nSv/h' ? 0.001 : 1);
      out.push({
        key: 'radiation',
        label: t('weather.radiation'),
        main: fmt(r.radiation, 2),
        unit: r.radiation.unit,
        color: lvl(usv, 0.3, 1),
        entity: r.radiation.entity,
      });
    }
    // dowolne dodatkowe czujniki
    for (const id of this._config!.extra ?? []) {
      const s = this._hass!.states[id];
      if (!s) continue;
      const v = num(s.state);
      out.push({
        key: id,
        label: String(s.attributes?.friendly_name ?? id).toUpperCase(),
        main: Number.isFinite(v) ? v.toFixed(entityPrecision(this._hass, id)).replace('.', ',') : String(s.state),
        unit: Number.isFinite(v) ? s.attributes?.unit_of_measurement : undefined,
        entity: id,
      });
    }
    return this._arrange(out);
  }

  /** Ukrycie i kolejnosc z konfiguracji; pozycje spoza listy zostaja na koncu w kolejnosci domyslnej. */
  private _arrange(items: Item[]): Item[] {
    const c = this._config!;
    const hidden = new Set(c.hidden ?? []);
    const order = c.order ?? [];
    const pos = (k: string) => {
      const i = order.indexOf(k);
      return i < 0 ? order.length : i;
    };
    return items
      .filter((i) => !hidden.has(i.key))
      .map((i, idx) => ({ i, idx }))
      .sort((a, b) => pos(a.i.key) - pos(b.i.key) || a.idx - b.idx)
      .map((x) => x.i);
  }

  /** Klucze i etykiety wszystkich pozycji z danymi (przed ukryciem) - dla edytora. */
  availableItems(hass: HomeAssistant): Array<{ key: string; label: string }> {
    this._hass = hass;
    if (!this._config) return [];
    this._resolveMap();
    const t = (k: string) => localize(getLanguage(this._hass), k);
    const r = Object.fromEntries(FIELDS.map((f) => [f, this._read(f)])) as Record<Field, Reading | undefined>;
    const saved = this._config.hidden;
    this._config = { ...this._config, hidden: [] };
    const all = this._items(r, t);
    this._config = { ...this._config, hidden: saved };
    return all.map((i) => ({ key: i.key, label: i.label }));
  }

  /** Lista wykresow w kolejnosci z konfiguracji, z informacja o polozeniu. */
  private _graphs(r: Record<Field, Reading | undefined>, t: (k: string) => string, boxes: boolean, hasWind: boolean) {
    const c = this._config!;
    const place = (pos?: string) => ({
      under: boxes && hasWind && pos !== 'bottom',
      auto: (pos ?? 'auto') === 'auto',
    });
    const list: Array<{ key: string; under: boolean; tpl: unknown }> = [];
    const p = place(c.pressure_graph_position);
    const pg = this._pressureGraph(r, t, boxes, p.under, p.auto);
    if (pg !== nothing) list.push({ key: 'pressure', under: p.under, tpl: pg });
    const w = place(c.wind_graph_position);
    const wg = this._windGraph(r, t, boxes, w.under, w.auto);
    if (wg !== nothing) list.push({ key: 'wind', under: w.under, tpl: wg });
    if (c.graph_order === 'wind_first') list.reverse();
    return list;
  }

  /** Slupki wiatru: pomiary + prognoza godzinowa (magenta). */
  private _windGraph(
    r: Record<Field, Reading | undefined>,
    t: (k: string) => string,
    boxed: boolean,
    under = false,
    auto = false,
  ) {
    const c = this._config!;
    if (!c.wind_graph || !this._map.wind_speed) return nothing;
    const fcEntity = c.wind_forecast_entity || c.weather_entity;
    return html`<div class=${boxed ? `box graphbox${under ? ' under' : ''}${auto ? ' auto' : ''}` : 'graphrow'}>
      <div class="glbl">${t('weather.wind')} · ${r.wind_speed?.unit ?? ''}</div>
      <avionics-wind-graph-el
        .hass=${this._hass}
        .speedEntity=${this._map.wind_speed}
        .gustEntity=${this._map.wind_gust}
        .dirEntity=${this._map.wind_direction}
        .forecastEntity=${fcEntity}
        .hoursBack=${c.wind_graph_hours_back ?? 12}
        .hoursForward=${fcEntity ? c.wind_graph_hours_forward ?? 12 : 0}
        .caution=${num(c.wind_caution)}
        .warning=${num(c.wind_warning)}
        .arrowTo=${(c.wind_arrow ?? 'from') === 'to'}
        .rotation=${c.rotation ?? 0}
        .unit=${r.wind_speed?.unit ?? ''}
      ></avionics-wind-graph-el>
    </div>`;
  }

  /** Wykres cisnienia z przelacznikiem zakresu (opcjonalnie, na dole karty). */
  private _pressureGraph(
    r: Record<Field, Reading | undefined>,
    t: (k: string) => string,
    boxed: boolean,
    under = false,
    auto = false,
  ) {
    const c = this._config!;
    const id = this._map.pressure;
    if (!c.pressure_graph || !id || !r.pressure) return nothing;
    const hpa = /hpa|mbar/i.test(r.pressure.unit);
    return html`<div class=${boxed ? `box graphbox${under ? ' under' : ''}${auto ? ' auto' : ''}` : 'graphrow'}>
      <div class="glbl">${t('weather.baro')} · ${r.pressure.unit}</div>
      <avionics-graph-el
        .hass=${this._hass}
        .entity=${id}
        .ranges=${parseRanges(c.pressure_graph_ranges)}
        .defaultRange=${parseRanges(c.pressure_graph_ranges)[1] ?? 24}
        .scale=${c.pressure_graph_scale ?? 'fixed'}
        .span=${c.pressure_graph_span ?? 20}
        .reference=${c.pressure_graph_reference && hpa ? 1013.25 : NaN}
        .referenceLabel=${'1013'}
        .digits=${0}
      ></avionics-graph-el>
    </div>`;
  }

  /** Trend cisnienia: magenta (wartosc wyliczona); szybki spadek - ostrzezenie. */
  private _trendInfo(p: Reading): { text: string; color: string } | undefined {
    const id = this._map.pressure;
    if (!id) return undefined;
    const hours = this._config!.pressure_trend_hours ?? 3;
    const past = this._observed.valueAt(id, Date.now() - hours * 3600e3);
    if (!Number.isFinite(past)) return undefined;
    const d = p.value - past;
    const arrow = d >= STEADY ? '▲' : d <= -STEADY ? '▼' : '►';
    return {
      text: `${arrow} ${d > 0 ? '+' : ''}${d.toFixed(1).replace('.', ',')}/${hours}h`,
      color: d <= -FAST_FALL ? 'var(--av-caution)' : 'var(--av-forecast)',
    };
  }

  /** Roza wiatru - wspolny element (tez w karcie Avionics Wiatr). */
  private _renderWind(r: Record<Field, Reading | undefined>, t: (k: string) => string) {
    const c = this._config!;
    const spd = r.wind_speed;
    const gust = r.wind_gust;
    const target = spd?.entity || r.wind_direction?.entity;
    // prognoza: wiatr z encji weather.*, gdy stacja ma wlasne czujniki wiatru
    const w = c.weather_entity ? this._hass!.states[c.weather_entity] : undefined;
    const fcDir = num(w?.attributes?.wind_bearing);
    const fcSpd = num(w?.attributes?.wind_speed);
    const showFc =
      c.wind_forecast !== false && !!w && !!(this._map.wind_direction || this._map.wind_speed) && Number.isFinite(fcDir);
    const fcText = showFc
      ? `${t('weather.forecast_short')} ${compassPoint(fcDir)}${
          Number.isFinite(fcSpd) ? ` ${fcSpd.toFixed(1).replace('.', ',')} ${w?.attributes?.wind_speed_unit ?? ''}` : ''
        }`
      : '';
    return html`<div class="wind" @click=${() => target && fireMoreInfo(this, target)}>
      <avionics-wind-rose-el
        .bearing=${r.wind_direction ? r.wind_direction.value : NaN}
        .speedText=${spd ? this._fmt(spd) : '--'}
        .unit=${spd?.unit ?? ''}
        .gustText=${gust ? this._fmt(gust) : ''}
        .fcDir=${showFc ? fcDir : NaN}
        .fcText=${fcText}
        .arrowTo=${(c.wind_arrow ?? 'from') === 'to'}
        .rotation=${c.rotation ?? 0}
        .noDirLabel=${t('weather.wind')}
      ></avionics-wind-rose-el>
    </div>`;
  }

  static styles = [
    tokens,
    tileBase,
    css`
      ha-card {
        padding: 10px 14px 10px;
        container-type: inline-size;
      }
      .empty {
        color: var(--av-dim);
        padding: 8px 0;
      }
      .title {
        color: var(--av-label);
        font-size: 17px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        text-align: center;
        padding-bottom: 6px;
        margin-bottom: 6px;
        border-bottom: 1px solid var(--av-frame);
      }
      /* --- uklad listy --- */
      .wrap {
        display: grid;
        grid-template-columns: minmax(120px, 160px) 1fr;
        gap: 6px 16px;
        align-items: center;
      }
      .wrap.nowind {
        grid-template-columns: 1fr;
      }
      @container (max-width: 330px) {
        .wrap {
          grid-template-columns: 1fr;
        }
        .wind avionics-wind-rose-el {
          max-width: 170px;
          margin: 0 auto;
        }
      }
      .rows {
        min-width: 0;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
        padding: 5px 0;
        cursor: pointer;
      }
      .row + .row {
        border-top: 1px solid rgba(140, 140, 140, 0.35);
      }
      .lbl {
        font-size: 14px;
        letter-spacing: 0.3px;
        white-space: nowrap;
      }
      .val {
        font-size: 20px;
        font-weight: 700;
        white-space: nowrap;
        text-align: right;
      }
      .u {
        font-size: 12px;
        color: var(--av-unit);
        margin-left: 3px;
      }
      .sub {
        display: block;
        font-size: 11px;
        font-weight: 400;
        color: var(--av-dim);
        line-height: 1.1;
      }
      /* --- uklad okienek: kazdy parametr we wlasnej ramce --- */
      .boxes {
        display: grid;
        gap: 6px;
        grid-auto-flow: row dense;
      }
      .boxes.autocols {
        grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      }
      /* za waska karta na wybrana liczbe kolumn: 2 kolumny, wykres na dol */
      @container (max-width: 440px) {
        .boxes {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }
        .graphbox.under {
          grid-column: 1 / -1;
          order: 99;
        }
      }
      /* zwarte okienko: etykieta i wartosc w jednym wierszu, dopisek pod wartoscia */
      .box {
        border: 1px solid var(--av-frame);
        padding: 4px 8px 5px;
        min-width: 0;
        cursor: pointer;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas: 'lbl val' 'sub sub';
        column-gap: 8px;
        align-items: baseline;
      }
      .windbox {
        grid-column: 1;
        grid-row: span 4;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: stretch;
      }
      /* roza wysrodkowana w swoim okienku niezaleznie od wyrownania okienka */
      .windbox .wind {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .windbox .wind avionics-wind-rose-el {
        width: 100%;
        max-width: 170px;
      }
      .blbl {
        grid-area: lbl;
        color: var(--av-label);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bval {
        grid-area: val;
        font-size: 22px;
        font-weight: 700;
        line-height: 1.15;
        text-align: right;
        white-space: nowrap;
      }
      .bsub {
        grid-area: sub;
        font-size: 11px;
        color: var(--av-dim);
        text-align: right;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      /* --- wykres cisnienia --- */
      .graphbox {
        grid-column: 1 / -1;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        cursor: default;
      }
      .graphrow {
        margin-top: 8px;
        padding-top: 6px;
        border-top: 1px solid var(--av-frame);
        display: flex;
        flex-direction: column;
        align-items: stretch;
      }
      /* etykieta w jednej linii z przyciskami zakresu (te sa po prawej) */
      .glbl {
        color: var(--av-label);
        font-size: 12px;
        font-weight: 700;
        height: 0;
        overflow: visible;
        line-height: 18px;
      }
      /* wykres pod roza: pierwsza kolumna, wysokosc ok. trzech okienek */
      .graphbox.under {
        grid-column: 1;
        grid-row: span 3;
      }
      /* polozenie automatyczne: waska karta - na dol, szeroka (od ~640 px) - pod roza */
      .graphbox.under.auto {
        grid-column: 1 / -1;
        grid-row: auto;
        order: 99;
      }
      @container (min-width: 640px) {
        .graphbox.under.auto {
          grid-column: 1;
          grid-row: span 3;
          order: 0;
        }
      }
      .graphbox avionics-wind-graph-el,
      .graphrow avionics-wind-graph-el {
        width: 100%;
        height: 150px;
      }
      .graphbox avionics-graph-el,
      .graphrow avionics-graph-el {
        width: 100%;
        height: 140px;
      }
      /* --- roza wiatru (rysunek we wspolnym elemencie) --- */
      .wind {
        cursor: pointer;
      }
      .wind avionics-wind-rose-el {
        width: 100%;
      }
    `,
  ];
}
