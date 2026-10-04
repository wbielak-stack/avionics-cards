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
