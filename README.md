# Avionics Cards

Glass-cockpit inspired dashboard cards for [Home Assistant](https://www.home-assistant.io/).
Black background, thin frames, condensed digits and a strict colour language borrowed
from aircraft avionics: white for values, cyan for set points, magenta for
forecasts, amber for cautions and red for warnings.

> **Status: work in progress (0.x).** Card configuration may still change between versions.

## Cards

| Card | Type | Status |
|---|---|---|
| Avionics Climate | `custom:avionics-climate-card` | available |
| Avionics EIS — engine-indication bars | `custom:avionics-eis-card` | available |
| Avionics List — compact value list | `custom:avionics-list-card` | available |
| Avionics Value — large value tile | `custom:avionics-value-card` | available |
| Avionics Dial — round gauges, single or grouped | `custom:avionics-dial-card` | available |
| Avionics Bars — hourly bar chart (prices, forecasts) | `custom:avionics-bars-card` | available |
| Avionics Weather — ready-made weather station | `custom:avionics-weather-card` | available |
| Avionics Graph — history graph with range buttons | `custom:avionics-graph-card` | available |
| Avionics Wind — wind compass | `custom:avionics-wind-card` | available |
| Avionics Wind Graph — hourly wind bars with forecast | `custom:avionics-wind-graph-card` | available |
| Dial gauge | — | planned |
| Bar chart | — | planned |
| Annunciator / alerts | — | planned |

## Installation

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories**
2. Repository: `https://github.com/<owner>/avionics-cards`, category **Dashboard**
3. Install **Avionics Cards** and reload the browser.

### Manual

1. Download `avionics-cards.js` from the latest [release](../../releases).
2. Copy it to `/config/www/`.
3. Settings → Dashboards → ⋮ → **Resources** → add `/local/avionics-cards.js` as a *JavaScript module*.

## Avionics Climate

![Avionics Climate](docs/climate.png)

Room tile with a background temperature graph, comfort indicator and one-tap control
of an air conditioner or heating mat. Fully configurable in the visual editor.

```yaml
type: custom:avionics-climate-card
name: Living room
temperature_entity: sensor.living_room_temperature
humidity_entity: sensor.living_room_humidity
climate_entity: climate.living_room
co2_entity: sensor.living_room_co2        # optional
pm25_entity: sensor.living_room_pm25      # optional
```

| Option | Default | Description |
|---|---|---|
| `name` | — | Tile title |
| `mode` | `room` | `room` or `outdoor` (reference tile: MIN/MAX of the last 24 h instead of unit/set point) |
| `temperature_entity` | — | Temperature sensor. If missing or unavailable, `current_temperature` of the climate entity is used |
| `humidity_entity` | — | Humidity sensor |
| `climate_entity` | — | Climate entity; tap toggles it, hold opens more-info |
| `co2_entity`, `pm25_entity` | — | Optional air quality sensors |
| `device_label` | `auto` | `auto`, `ac` or `mat` — wording of status/labels |
| `t_min` / `t_max` | `19` / `26` | Cold / hot thresholds [°C] |
| `h_min` / `h_max` | `30` / `60` | Dry / humid thresholds [%] |
| `co2_max` | `1200` | CO₂ threshold [ppm] |
| `pm25_max` | `25` | PM2.5 threshold [µg/m³] |
| `hours_to_show` | `24` | Graph range [h] |
| `px_per_degree` | `12` | Maximum graph height for 1 °C — keeps amplitudes comparable between tiles |
| `graph_style` | `color` | `color` (temperature thresholds) or `mono` |
| `graph_color` | `#00e5ff` | Line colour in `mono` style |

## Avionics EIS

![Avionics EIS](docs/eis.png)

Engine-indication style rows: label and digital value with a horizontal bar underneath.
Rows are added, removed and reordered in the visual editor. For plain values without
bars use [Avionics List](#avionics-list).

Bar convention (as on twin-engine cockpit gauges):

- **filled pointers = current values** — first entity ▼ above the band, second entity ▲ below;
  each turns amber/red in its own caution/warning zone
- **hollow pointers = observed values** — on the side of their entity, either the min/max over the row's
  `range_minutes`, or where the value was `range_minutes` ago (shows direction and rate of change)
- **cyan pointers = set points** — next to the value they belong to: first above the band, second below
- **magenta pointers = forecasts** — same placement as set points

```yaml
type: custom:avionics-eis-card
title: Battery
entities:
  - entity: sensor.battery_voltage
    name: VOLT
    min: 330
    max: 420
    warning_low: 340
    caution_low: 360
    caution_high: 410
    warning_high: 415
  - entity: sensor.cell_temp_min
    entity2: sensor.cell_temp_max     # second value: pointer below the bar, shown as a / b
    name: TEMP
    min: 0
    max: 50
    caution_high: 35
    warning_high: 45
  - entity: sensor.cell_delta
    name: Δ CELL
    min: 0
    max: 150
    caution_high: 30
    warning_high: 80
    show_range: true
    range_minutes: 30                  # observed window per row, in minutes
    range_markers: max                 # only the worst value matters here
  - entity: sensor.battery_current
    name: AMP
    min: -30
    max: 30
    show_range: true
    range_minutes: 5
    range_markers: ago                 # hollow pointer = where it was 5 min ago
  - entity: sensor.battery_soc
    name: SOC
    warning_low: 10
    caution_low: 20
    show_range: true                  # hollow markers: observed min/max (default 1440 min)
    setpoint_entity: input_number.target_soc
  - entity: sensor.remaining_energy    # list row without bar
    name: REM
    show_bar: false
```

| Row option | Default | Description |
|---|---|---|
| `entity` | — | Numeric entity (required) |
| `name` | friendly name | Row label |
| `unit` | entity unit | Unit override |
| `precision` | entity / state | Decimals |
| `show_bar` | `true` | Draw the EIS bar |
| `min` / `max` | `0` / `100` | Scale range |
| `warning_low`, `caution_low`, `caution_high`, `warning_high` | — | Zone thresholds → red / amber / green bands; pointer and value change colour |
| `setpoint` / `setpoint_entity` | — | Set point of the first value, cyan pointer above the band |
| `setpoint2` / `setpoint2_entity` | — | Set point of the second value, cyan pointer below the band |
| `forecast` / `forecast_entity`, `forecast2` / `forecast2_entity` | — | Forecast of the first / second value, magenta pointer above / below the band |
| `entity2` | — | Second value, filled pointer below the bar (e.g. max cell temperature) |
| `show_range` | `false` | Hollow markers at observed values |
| `range_minutes` | `1440` | Observed period for this row, in minutes |
| `range_markers` | `both` | `both`, `min`, `max` — extremes over the period; `ago` — value one period ago |
| `show_scale` | `false` | Scale numbers under the bar |
| `major_tick` | auto | Major tick step |

Card option: `title`. Unavailable entities are crossed out with a red X.
History is fetched once per entity (longest window) and then extended live, so short
windows stay accurate and several rows of the same entity cost a single query.

## Avionics List

![Avionics List](docs/list.png)

Compact list of values in the same style — label on the left, value on the right.
Numeric values can be coloured by the same zone thresholds as EIS bars; text states
are shown the way Home Assistant formats them.

```yaml
type: custom:avionics-list-card
title: Battery
entities:
  - entity: sensor.battery_remaining_energy
    name: REM
  - entity: sensor.battery_balance_today
    name: BAL TODAY
    show_sign: true                   # +7.4
  - entity: sensor.battery_charged_today
    entity2: sensor.battery_discharged_today
    name: CHG/DSG                     # 12.7/5.3
    separator: true                   # line above
  - entity: sensor.battery_temperature
    name: TEMP
    caution_high: 35
    warning_high: 45
```

| Row option | Default | Description |
|---|---|---|
| `entity` | — | Entity (required) |
| `name` | friendly name | Row label |
| `unit` | entity unit | Unit override |
| `precision` | entity / state | Decimals |
| `show_sign` | `false` | `+` before positive values |
| `separator` | `false` | Line above the row |
| `entity2` | — | Second value, shown as `a / b` |
| `warning_low`, `caution_low`, `caution_high`, `warning_high` | — | Value turns amber / red outside the thresholds |

## Avionics Value

![Avionics Value](docs/value.png)

Large value tile: name and direction status on top, big value, footer value under
the rule and an optional background graph (with a dashed zero line for signed values).

```yaml
type: custom:avionics-value-card
name: BAT
entity: sensor.battery_power          # W, positive = charging
multiplier: 0.001                     # W -> kW
unit: kW
abs_value: true                       # direction is shown by the status
status_positive: CHG                  # ▲ green
status_negative: DSG                  # ▼ amber
deadband: 0.05                        # "—" within ±0.05 kW
footer_name: TODAY CHG/DSG
footer_entity: sensor.battery_charged_today
footer_entity2: sensor.battery_discharged_today
```

| Option | Default | Description |
|---|---|---|
| `entity` | — | Main value (required) |
| `name` | friendly name | Tile title |
| `unit`, `precision` | entity | Unit and decimals (2 decimals by default when a multiplier is used) |
| `multiplier` | `1` | Scale the value, e.g. `0.001` for W → kW |
| `abs_value` | `false` | Show the absolute value |
| `show_sign` | `false` | `+` before positive values |
| `status_positive`, `status_negative` | — | Direction labels (▲ / ▼) by the sign of the value |
| `status_zero`, `deadband` | `—`, `0` | Label shown within ±deadband of zero |
| `show_footer` | `true` | `false` hides the rule and footer; the value stays in place |
| `footer_name`, `footer_entity`, `footer_entity2`, `footer_precision` | — | Footer label and value (`a / b` with two entities); the label alone works as a description |
| `caution_*`, `warning_*` | — | Zone thresholds colouring the value |
| `show_graph`, `hours_to_show`, `graph_min_range`, `graph_color` | `true`, `24`, `1`, `#00e5ff` | Background graph; `graph_min_range` keeps noise from looking dramatic |

## Avionics Dial

![Avionics Dial](docs/dial.png)

Round gauges. One dial is a single tile; several dials share one frame with an optional
group title and wrap automatically on narrow screens. Dials are added, removed and
reordered in the visual editor.

Two styles:

- **`trueAvionics`** (default) — cockpit engine gauge: thin scale with ticks, zone bands
  outside the scale, red line at `warning_high`, needle and digital readout that turn
  amber / red in caution / warning zones
- **`simplified`** — thick track filled up to the value, large number in the centre

![Avionics Dial — simplified](docs/dial2.png)

Markers use the same vocabulary as the EIS card: **cyan** arrow = set point,
**magenta** arrow = forecast (both outside the scale), **hollow** markers = observed values.

```yaml
type: custom:avionics-dial-card
title: Sources
dial_style: trueAvionics
entities:
  - entity: sensor.pv_power
    name: PV
    multiplier: 0.001                 # W -> kW
    unit: kW
    max: 10
    forecast_entity: sensor.pv_forecast_now   # magenta, in displayed units (kW)
    show_range: true
    range_minutes: 60
    range_markers: max                # hollow: max of the last hour
  - entity: sensor.grid_import
    name: IMPORT
    multiplier: 0.001
    unit: kW
    max: 35
    caution_high: 20
    warning_high: 30                  # red line
```

| Card option | Default | Description |
|---|---|---|
| `title` | — | Group title |
| `dial_style` | `trueAvionics` | `trueAvionics` or `simplified` |

| Dial option | Default | Description |
|---|---|---|
| `entity` | — | Entity (required) |
| `name` | friendly name | Label under the dial |
| `unit`, `precision` | entity | Unit and decimals (1 decimal by default when a multiplier is used) |
| `multiplier` | `1` | Scale the value, e.g. `0.001` for W → kW |
| `min` / `max` | `0` / `100` | Scale range |
| `caution_*`, `warning_*` | — | Zone thresholds; `warning_high` also draws the red line |
| `setpoint` / `setpoint_entity` | — | Cyan set-point arrow (displayed units) |
| `forecast` / `forecast_entity` | — | Magenta forecast arrow (displayed units) |
| `show_range`, `range_minutes`, `range_markers` | `false`, `60`, `max` | Hollow markers: `both`, `min`, `max` over the period, or `ago` |

## Avionics Bars

Hourly bar chart from a list in an entity attribute — typically energy prices or
forecasts. Periods shorter than an hour (e.g. 15-minute prices) are averaged per hour.

- current hour highlighted with ▼, past hours dimmed
- tap a bar to read its value in the header, tap again to return to the current hour
- negative values drawn below a zero line
- up to three **cyan threshold lines** (fixed value or entity) with labels
- optional **tariff band** under the bars: listed hours green, others amber
- bars coloured by the usual zone thresholds
- optional **opportunity** colouring: bars green above a threshold (e.g. selling) or below it
  (e.g. charging an EV); caution / warning zones take precedence
- dashed **midnight** line with a small date label (can be turned off)

```yaml
type: custom:avionics-bars-card
name: Sell price
entity: sensor.rce_pse_price
entity_next: sensor.rce_pse_price_tomorrow   # optional: rest of the series in another entity
preset: pse_rce                       # pse_rce, nordpool, entsoe or custom
multiplier: 0.00123                   # PLN/MWh -> PLN/kWh incl. VAT
unit: PLN/kWh
hours_back: 2
hours_forward: 22
line1: 0.64
line1_label: OFFPEAK
line2_entity: sensor.sell_threshold
line2_label: THRESHOLD
line3: 1.19
line3_label: PEAK
band_hours: 22-6, 13-15               # cheaper tariff hours
good_direction: above                 # green bars = worth selling
good_entity: sensor.sell_threshold
```

| Option | Default | Description |
|---|---|---|
| `entity` | — | Entity holding the series (required) |
| `entity_next` | — | Optional entity with the rest of the series (same layout), e.g. tomorrow's prices |
| `preset` | `pse_rce` | Known attribute layouts: `pse_rce`, `nordpool`, `entsoe`, or `custom` |
| `attribute`, `time_field`, `value_field`, `time_is_end` | — | For `custom`: attribute(s) with the list (comma separated), field names, and whether the time marks the end of a period |
| `hours_back` / `hours_forward` | `2` / `22` | Window around the current hour |
| `multiplier`, `unit`, `precision` | `1`, entity, auto | Value scaling and display |
| `lineN`, `lineN_entity`, `lineN_label` (N = 1–3) | — | Threshold lines |
| `band_hours` | — | Hours shown green in the tariff band, e.g. `22-6, 13-15` |
| `good_direction` | `off` | `above` or `below`: bars green on that side of the threshold |
| `good_value` / `good_entity` | — | Opportunity threshold (displayed units) |
| `show_midnight` | `true` | Dashed line between 23:00 and 0:00 |
| `caution_*`, `warning_*` | — | Zone thresholds colouring the bars |

## Avionics Weather

![Avionics Weather — three configurations](docs/wstyles.png)

A ready-made weather station card for people who just want their station on a dashboard.
Pick the station **device** and the card finds the sensors itself — outdoor (not indoor)
temperature, relative (not absolute) pressure, current gust (not the daily maximum),
daily rain (not weekly) and so on. Anything that is not available is simply not shown.

- **wind** as an HSI-style compass rose with speed and gust in the centre and the direction as
  `WNW 292°` (always where the wind comes from); the arrow shows where the wind comes **from**
  (meteorological, default) or blows **to**; the rose can be **rotated** so the
  direction you choose is at the top (e.g. a station display hung on an east-facing wall);
  hidden when there is no wind data; when the station has its own wind sensors, wind from the
  `weather.*` entity is shown as a **magenta forecast** arrow with `FCST WSW 9.0 km/h` below
- **temperature** with today's min / max
- **pressure** with a magenta trend arrow and change over 3 h; a fast fall (≥ 3 hPa / 3 h) turns amber
- **humidity**, **UV** with WHO category, **rain** today and current rate
- **dew point** with temperature spread — amber "fog risk" below 2.5 °C (as in aviation METARs)
- **feels like**, **solar radiation**, **illuminance**
- **PM2.5 / PM10** (amber above 25 / 50 µg/m³, red above 50 / 100) and **ionising radiation**
  (amber above 0.3 µSv/h, red above 1 µSv/h)
- any **additional sensors** as extra items
- **order and visibility** of all values set in the editor (↑ ↓ and show / hide), including
  auto-detected sensors
- optional **wind graph** — hourly bars: measured average with gust tick and direction arrow for past
  hours, hourly **forecast** in magenta outline for the next hours (from any `weather.*` entity, units
  converted), caution / warning thresholds colour bars and gusts — useful for paragliding, kiting,
  wind turbines
- optional **pressure graph** at the bottom with 12 / 24 / 48 h buttons, fixed or fitted scale
  and a dashed 1013 hPa reference line

Two layouts: **list** (compass next to a list of values) and **boxes** — every value in its own
frame, label and value on one line, in 1–4 columns; the compass takes a tall box in the first column.

Value sources, in order: sensors set in the card → sensors detected on the device →
attributes of a `weather.*` entity (fills gaps, e.g. UV from a forecast service).
The editor shows which sensor is used for each value and what is skipped.

```yaml
type: custom:avionics-weather-card
name: Weather
device: 0123456789abcdef          # weather station device (picked in the editor)
weather_entity: weather.home      # optional fallback
layout: boxes                     # list or boxes
columns: 2
pm25: sensor.airly_pm25           # sensors from other devices
extra:
  - sensor.lightning_counter
```

| Option | Description |
|---|---|
| `device` | Weather station device — sensors detected automatically |
| `weather_entity` | `weather.*` entity used for values without a sensor |
| `temperature`, `humidity`, `pressure`, `uv`, `wind_speed`, `wind_direction`, `wind_gust`, `rain_rate`, `rain_today`, `feels_like`, `dew_point`, `solar`, `illuminance`, `pm25`, `pm10`, `radiation` | Override detected sensors |
| `extra` | Additional sensors shown as extra items |
| `layout`, `columns` | `list` (default) or `boxes`; number of box columns (default `2`, `0` = as many as fit) |
| `pressure_trend_hours` | Pressure trend period, default `3` |
| `wind_arrow` | `from` (default) or `to` |
| `wind_forecast` | Forecast wind from `weather_entity` on the rose (default `true`) |
| `order` | Item order: field keys (`temperature`, `pressure`, `rain`, …) or entity ids of `extra` sensors; items not listed follow in default order |
| `hidden` | Items to hide, same keys as `order` |
| `rotation` | Direction shown at the top of the rose, degrees (default `0` = north) |
| `pressure_graph`, `pressure_graph_scale`, `pressure_graph_span`, `pressure_graph_ranges`, `pressure_graph_reference` | Pressure graph: on/off, `fixed` (default) or `auto`, height in hPa (default `20`), range buttons (default `12, 24, 48`), 1013 hPa line (default on) |
| `wind_graph`, `wind_graph_position` | Wind bars on/off; position like the pressure graph (`auto`, `under_wind`, `bottom`) |
| `wind_forecast_entity` | `weather.*` entity for the hourly wind forecast (default: `weather_entity`) |
| `wind_graph_hours_back`, `wind_graph_hours_forward` | Measured / forecast hours, default `12` / `12` |
| `wind_caution`, `wind_warning` | Wind thresholds in station units (e.g. `25` / `35` km/h) |
| `graph_order` | `pressure_first` (default) or `wind_first` — order when both graphs are in the same place |
| `pressure_graph_position` | Boxes layout: `auto` (default — under the compass on cards wider than ~640 px, otherwise at the bottom), `under_wind` or `bottom`; on narrow cards the graph always moves to the bottom and the grid drops to 2 columns |

## Avionics Wind and Avionics Wind Graph

![Weather dashboard built from separate cards](docs/wwidgets.png)

The compass and the wind bars from the weather card as separate cards, for building your own
dashboard (the screenshot combines them with Avionics Graph and Avionics List). Pick the station **device** (wind sensors are detected automatically) or set the
sensors; both cards share the arrow and rotation options so they stay consistent side by side.

```yaml
type: custom:avionics-wind-card
device: 0123456789abcdef            # or wind_speed / wind_direction / wind_gust
forecast_entity: weather.open_meteo # optional, magenta forecast arrow
wind_arrow: from                    # from (default) or to
rotation: 0
```

```yaml
type: custom:avionics-wind-graph-card
device: 0123456789abcdef
forecast_entity: weather.open_meteo # hourly forecast bars in magenta
hours_back: 12
hours_forward: 12
wind_caution: 25
wind_warning: 35
```

| Option | Cards | Description |
|---|---|---|
| `name` | both | Title |
| `device` / `wind_speed`, `wind_direction`, `wind_gust` | both | Station device or explicit sensors |
| `forecast_entity` | both | `weather.*` entity with the wind forecast |
| `wind_arrow`, `rotation` | both | Arrow convention and direction at the top |
| `hours_back`, `hours_forward` | graph | Measured / forecast hours (default `12` / `12`) |
| `wind_caution`, `wind_warning` | graph | Thresholds in station units |

## Avionics Graph

History graph of a single entity with range buttons on the card itself.

- **fit to height** — any change fills the graph (good for spotting small variations)
- **fixed height** — the graph always spans `span` units (e.g. 20 hPa), so a 2 hPa wave looks
  like 2 hPa; the scale only widens when the data does not fit
- optional dashed reference line (e.g. 1013 hPa), min / max values on the left, times below

```yaml
type: custom:avionics-graph-card
entity: sensor.relative_pressure
ranges: 12, 24, 48
default_range: 24
scale: fixed
span: 20
reference: 1013.25
reference_label: "1013"
```

| Option | Default | Description |
|---|---|---|
| `entity`, `name` | — | Entity and title |
| `ranges`, `default_range` | `12, 24, 48`, `24` | Range buttons and the initial range, hours |
| `scale`, `span` | `auto`, `20` | `auto` or `fixed`; graph height in units for `fixed` |
| `reference`, `reference_label` | — | Dashed reference line |
| `unit`, `precision`, `multiplier`, `color` | entity, entity, `1`, `#00e5ff` | Display options |

## Theme variables

All cards read optional variables from your Home Assistant theme:

```yaml
My theme:
  avionics-style: "true"   # "true" = strict cockpit colours (white labels, cyan = set points)
                           # "look" = cyan labels (default)
  # optional fine tuning:
  avionics-label-color: "#ffffff"
  avionics-setpoint-color: "#00e5ff"
  avionics-frame-color: "#8c8c8c"
  avionics-font-family: "Roboto Condensed, sans-serif"
```

Run `frontend.reload_themes` after a change — no restart needed.

## Development

```bash
npm ci
npm run build        # dist/avionics-cards.js
npm run watch        # rebuild on change

# copy every build straight to Home Assistant (e.g. a Samba share):
AVIONICS_DEPLOY_DIR=/path/to/ha/config/www npm run watch
```

Releases are built by GitHub Actions when a `vX.Y.Z` tag matching `package.json` is pushed.

## Migrating from `g1000-climate-card`

`custom:g1000-climate-card` is still registered as an alias, the `g1000-style` theme
variable is still read, and `device_label: KLIMA/MATA` is mapped to `ac/mat`.
Remove the old `/local/g1000-climate-card.js` resource after installing this bundle.

## License

MIT