import { css } from 'lit';

/**
 * Tokeny wizualne zestawu. Kazdy mozna nadpisac zmienna motywu
 * (np. avionics-label-color), a styl "true" zmienia wartosci domyslne.
 *
 * Semantyka kolorow wg kokpitu:
 *   bialy    - wartosci, skale
 *   cyjan    - nastawy (w stylu "look" takze etykiety)
 *   magenta  - prognozy / wartosci wyliczone
 *   zielony  - norma, element aktywny
 *   bursztyn - ostrzezenie
 *   czerwony - alarm
 */
export const tokens = css`
  ha-card {
    --av-bg: var(--avionics-background, #000);
    --av-frame: var(--avionics-frame-color, #8c8c8c);
    --av-value: var(--avionics-value-color, #ffffff);
    --av-label: var(--avionics-label-color, #00e5ff);
    --av-unit: var(--avionics-unit-color, #00e5ff);
    --av-setpoint: var(--avionics-setpoint-color, #00e5ff);
    --av-setpoint-value: var(--av-value);
    --av-forecast: var(--avionics-forecast-color, #ff00ff);
    --av-ok: var(--avionics-ok-color, #00e676);
    --av-caution: var(--avionics-caution-color, #ffb300);
    --av-warning: var(--avionics-warning-color, #ff3b30);
    --av-dim: var(--avionics-dim-color, #9a9a9a);
    --av-status: var(--avionics-status-color, #c8c8c8);
    --av-font: var(--avionics-font-family, 'Roboto Condensed', 'Arial Narrow', 'DejaVu Sans Condensed', sans-serif);
  }
  ha-card.true-style {
    --av-label: var(--avionics-label-color, #ffffff);
    --av-unit: var(--avionics-unit-color, #c8c8c8);
    --av-setpoint-value: var(--av-setpoint);
  }
`;

/** Wspolna rama kafla. */
export const tileBase = css`
  :host {
    display: block;
    height: 100%;
  }
  ha-card {
    position: relative;
    height: 100%;
    box-sizing: border-box;
    background: var(--av-bg);
    border: 1.5px solid var(--av-frame);
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
    cursor: default;
    user-select: none;
    color: var(--av-value);
    font-family: var(--av-font);
    font-variant-numeric: tabular-nums;
    text-shadow: 0 0 3px #000, 0 0 6px #000;
  }
  ha-card.clickable {
    cursor: pointer;
  }
  .lbl {
    color: var(--av-label);
    font-weight: 700;
  }
  .hidden {
    visibility: hidden;
  }
`;
