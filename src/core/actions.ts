const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;

/**
 * Klik / przytrzymanie z ochrona przed przewijaniem na tablecie:
 * ruch > 10 px anuluje klik.
 */
export function attachTapHold(el: HTMLElement, onTap: () => void, onHold: () => void): () => void {
  let timer: number | undefined;
  let long = false;
  let moved = false;
  let x0 = 0;
  let y0 = 0;

  const down = (e: PointerEvent) => {
    long = false;
    moved = false;
    x0 = e.clientX;
    y0 = e.clientY;
    timer = window.setTimeout(() => {
      if (!moved) {
        long = true;
        onHold();
      }
    }, HOLD_MS);
  };
  const move = (e: PointerEvent) => {
    if (Math.abs(e.clientX - x0) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - y0) > MOVE_TOLERANCE_PX) {
      moved = true;
      clearTimeout(timer);
    }
  };
  const cancel = () => {
    moved = true;
    clearTimeout(timer);
  };
  const up = () => {
    clearTimeout(timer);
    if (!long && !moved) onTap();
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerup', up);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', cancel);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('pointerup', up);
  };
}

/** Okno szczegolow encji HA. */
export function fireMoreInfo(node: HTMLElement, entityId: string): void {
  const ev = new Event('hass-more-info', { bubbles: true, composed: true }) as Event & {
    detail: { entityId: string };
  };
  ev.detail = { entityId };
  node.dispatchEvent(ev);
}
