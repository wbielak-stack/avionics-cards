/**
 * Wysokosc karty dociagana do siatki widoku sekcji HA (wiersz 56 px, odstep 8 px - ze zmiennych
 * --row-height / --row-gap sekcji). Karta z wysokoscia "auto" dostaje dopelnienie od dolu do najblizszej
 * linii siatki, wiec jej krawedz zgadza sie z sasiadami. Poza siatka (widok kolumnowy) nic nie robi;
 * przy stalej liczbie wierszy karta i tak ma wysokosc siatki, wiec dopelnienie wynosi 0.
 */
export class GridSnap {
  private ro?: ResizeObserver;
  private card?: HTMLElement;
  private base = NaN;
  private extra = 0;

  attach(host: HTMLElement): void {
    const card = host.shadowRoot?.querySelector('ha-card') as HTMLElement | null;
    if (!card || card === this.card) return;
    this.detach();
    this.card = card;
    this.base = NaN;
    this.extra = 0;
    // zmiana dopelnienia w nastepnej klatce - bez petli obserwatora rozmiaru
    this.ro = new ResizeObserver(() => requestAnimationFrame(() => this.snap(host)));
    this.ro.observe(card);
  }

  detach(): void {
    this.ro?.disconnect();
    this.ro = undefined;
    this.card = undefined;
  }

  private snap(host: HTMLElement): void {
    const card = this.card;
    if (!card) return;
    const cs = getComputedStyle(host);
    const row = parseFloat(cs.getPropertyValue('--row-height'));
    const gapRaw = parseFloat(cs.getPropertyValue('--row-gap'));
    if (Number.isNaN(this.base)) this.base = parseFloat(getComputedStyle(card).paddingBottom) || 0;
    if (!(row > 0)) {
      // poza siatka - usun ewentualne dopelnienie
      if (this.extra) {
        this.extra = 0;
        card.style.paddingBottom = '';
      }
      return;
    }
    const gap = gapRaw >= 0 ? gapRaw : 8;
    const natural = card.offsetHeight - this.extra;
    const unit = row + gap;
    const n = Math.max(1, Math.ceil((natural + gap - 0.5) / unit));
    const extra = Math.max(0, n * unit - gap - natural);
    if (Math.abs(extra - this.extra) > 0.5) {
      this.extra = extra;
      card.style.paddingBottom = extra ? `${this.base + extra}px` : '';
    }
  }
}
