/** Mapa wektorowa (Natural Earth, przycieta do Europy) - jak podklad w wallboardzie. */
export interface VectorMap {
  borders: number[][][];
  coast: number[][][];
  rivers: number[][][];
  lakes: number[][][];
  /** nazwa, dl., szer., liczba mieszkancow, stolica (1/0) - starsze pliki maja tylko 3 pola */
  cities: Array<[string, number, number, number?, number?]>;
}

const cache = new Map<string, Promise<VectorMap | null>>();

/** Pobranie raz na adres (wspolne dla wszystkich kart na stronie). */
export function loadVector(url: string): Promise<VectorMap | null> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    cache.set(url, p);
  }
  return p;
}

/**
 * Rysowanie jak w wallboardzie: rzeki i jeziora ciemnoszare, wybrzeza i granice jasnoszare,
 * miasta - bialy kwadracik i podpis z czarna obwodka.
 */
export function drawVector(
  ctx: CanvasRenderingContext2D,
  map: VectorMap,
  toView: (lat: number, lon: number) => [number, number],
  W: number,
  H: number,
  font: string,
): void {
  ctx.clearRect(0, 0, W, H);
  const line = (list: number[][][], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const l of list) {
      l.forEach(([lon, lat], k) => {
        const [x, y] = toView(lat, lon);
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
    }
    ctx.stroke();
  };
  line(map.rivers, '#606060');
  line(map.lakes, '#606060');
  line(map.coast, '#C8C8C8');
  line(map.borders, '#C8C8C8');
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // bez nakladania: od najwiekszych (stolice x1,5), pomijane podpisy zachodzace na juz narysowane
  const ranked = [...map.cities].sort((a, b) => (b[3] ?? 0) * (b[4] ? 1.5 : 1) - (a[3] ?? 0) * (a[4] ? 1.5 : 1));
  const placed: Array<[number, number, number, number]> = [];
  // limit gestosci: ok. jeden podpis na 10 000 px² mapy
  const maxLabels = Math.max(6, Math.round((W * H) / 10000));
  const hit = (r: [number, number, number, number]) =>
    placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
  for (const [name, lon, lat] of ranked) {
    const [px, py] = toView(lat, lon);
    if (px < -50 || py < -20 || px > W + 50 || py > H + 20) continue;
    const w = ctx.measureText(name).width;
    const box: [number, number, number, number] = [px - 5, py - 8, px + 9 + w, py + 8];
    if (hit(box)) continue;
    if (placed.length >= maxLabels) break;
    placed.push(box);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(px - 3, py - 3, 6, 6);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    ctx.strokeText(name, px + 7, py);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, px + 7, py);
  }
}
