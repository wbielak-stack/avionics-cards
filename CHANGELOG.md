# Changelog

## Unreleased

### New cards

- **Avionics Energy Balance** — did the house run on its own production, cover a shortfall from storage
  or need the grid, said in plain words. The house split into PV, storage and grid; storage content
  traced to PV or grid energy; trading and inverter losses apart; production coverage (production /
  house use), energy traced from PV and Home Assistant's self-sufficiency side by side.
  **PLN mode:** the grid account (energy and distribution together or apart) and installation gains as
  a table — PV at home instead of selling, storage to the house instead of the grid, storage sale and
  the cost of storage energy. Storage works as a tank with an average purchase price, reconciled hourly
  with SoC × capacity so losses raise the cost. Day, week and month; hourly or daily purchase / sale.
- **Avionics Devices** — device energy with fixed colours derived from the entity id, bars or pie, one or
  two columns, kWh or PLN, *Other* = house minus devices.

### Energy cards

- Sources from the Energy dashboard settings; prices from a zone tariff in the card (e.g. G12: peak /
  off-peak prices for energy and distribution, off-peak hours, summer hours, weekends), from price
  entities or from the Energy dashboard, with purchase and net-billing multipliers.
- Sync group (`sync`) and two-way sync with the Energy dashboard's date selection card (`energy_sync`).
- Optional inverted bar chart (`invert_chart`): purchase up, sale down, like the Energy dashboard.

## 0.2.1

### New cards

- **Day plan:** Avionics Flight Plan, Current Leg, Day Profile, Tasks and Day Plan — calendars and to-do
  lists read like a flight: the active leg, the next waypoint with ETE / ETA, NOTAMs for all-day
  events, routines that yield to other events, conflicts in amber, free windows, daylight in the
  profile.
- Flight Plan columns CAL, WAYPOINT, ETA (arrival at the waypoint — the start), ETE, DUR, UNTIL; 24 hours
  from now by default; ◀ ▶ move the view by a day and a `sync` group moves the Day Profile with it.
- Routines are recognised from daily or Monday–Friday recurring events, a keyword or a list of names.

## 0.2.0

Ten new cards, a shared header, grid-aligned heights and a theme. Configurations from 0.1 keep working.

### New cards

- **Avionics Endurance** — fuel computer for an energy storage: endurance and ETA without / with PV,
  SoC gauge with the forecast low, SoC profile.
- **Avionics Goal** — progress to a goal like a flight (DIS / GS / ETE / ETA) or wear to a limit like
  engine TBO; targets beyond payback with waypoints and an end-of-life forecast.
- **Avionics Forecast** — hourly Open-Meteo forecast from the sky to the ground: cloud layers and fog,
  precipitation in radar colours, temperature, pressure, wind and gusts, optional PV.
- **Avionics Radar** — precipitation radar like NEXRAD on an MFD: RainViewer reflectivity decoded to
  dBZ, interpolated and painted in the cockpit palette, vector map, range rings, distance to the
  nearest precipitation, panning.
- **Avionics METAR** — current METAR decoded in the card, flight category, report age.
- **Avionics Astro** — sun and moon computed from the home location: day profile with twilight,
  sunrise / sunset, civil twilight, day length, moon phase and times.
- **Avionics Tank** — a level like a fuel gauge (battery SoC, water, pellets): horizontal bar or
  vertical tank, stock and time, zones in both directions.
- **Avionics Cylinders** — similar values side by side like the LEAN page: cells, rooms, phases.
- **Avionics Synoptic** — electrical synoptic: DC bus, inverter, AC bus, grid contactor, EPS,
  string and bus details.
- **Avionics Frame** — the avionics header and frame around any other card (e.g. Sankey Chart).

### Changes to existing cards

- **Softkeys:** active state from a template, armed (waiting) state, hold action, labels from
  templates, active colour (green / amber / red).
- **All graphs:** grid lines (off / automatic / round numbers / fixed step) and fixed axis ranges.
- **Zones:** thresholds from entities; optional static inverse for warning values.
- **Headers:** one header in all cards (centred title, line, extras on the sides).
- **Sections view:** auto-height cards rounded up to the grid; fixed rows fill the height.
- **Direction colours:** a negative direction (e.g. battery discharge) is white, not amber.
- **Forecast:** wind direction arrows no longer cover the speed values.

### Theme

- `themes/avionics.yaml`: **Avionics** (muted, default) and **Avionics Contrast**, both with a dark
  mode, amber accent, avionics variables and an optional card-mod block.

### Data

- `data/europe.json` — vector map for the radar (Natural Earth, public domain).
