/**
 * Paleta RainViewer "Universal Blue" (deszcz): dBZ -> RGBA, z rainviewer_api_colors_table.csv
 * (tabela z backendu wallboardu). Powyzej 64 dBZ paleta przechodzi w biel - grad, traktowany jako 65.
 */
export const UNIVERSAL_BLUE: Array<[number, number]> = [
  [-10, 0x63615914], [-9, 0x66635a19], [-8, 0x69665c1e], [-7, 0x6c685d24], [-6, 0x6f6b5f29], [-5, 0x726e612e],
  [-4, 0x75706234], [-3, 0x78736439], [-2, 0x7c75653e], [-1, 0x7f786744], [0, 0x827b6949], [1, 0x857d6a4e],
  [2, 0x88806c54], [3, 0x8b826d59], [4, 0x8e856f5e], [5, 0x92887164], [6, 0x9e93756e], [7, 0xaa9e7978],
  [8, 0xb6a97e82], [9, 0xc2b4828c], [10, 0xcec08796], [11, 0xd2c48ba0], [12, 0xd6c88faa], [13, 0xdacc93b4],
  [14, 0xded097be], [15, 0x88ddeeff], [16, 0x6cd1ebff], [17, 0x51c5e8ff], [18, 0x36bae5ff], [19, 0x1baee2ff],
  [20, 0x00a3e0ff], [21, 0x009ad5ff], [22, 0x0091caff], [23, 0x0088bfff], [24, 0x007fb4ff], [25, 0x0077aaff],
  [26, 0x0070a3ff], [27, 0x00699cff], [28, 0x006295ff], [29, 0x005b8eff], [30, 0x005588ff], [31, 0x005180ff],
  [32, 0x004e78ff], [33, 0x004a70ff], [34, 0x004768ff], [35, 0xffee00ff], [36, 0xffe000ff], [37, 0xffd200ff],
  [38, 0xffc500ff], [39, 0xffb700ff], [40, 0xffaa00ff], [41, 0xff9f00ff], [42, 0xff9500ff], [43, 0xff8b00ff],
  [44, 0xff8100ff], [45, 0xff4400ff], [46, 0xf23600ff], [47, 0xe62800ff], [48, 0xd91b00ff], [49, 0xcd0d00ff],
  [50, 0xc10000ff], [51, 0xa80000ff], [52, 0x8f0000ff], [53, 0x760000ff], [54, 0x5d0000ff], [55, 0xffaaffff],
  [56, 0xff9fffff], [57, 0xff95ffff], [58, 0xff8bffff], [59, 0xff81ffff], [60, 0xff77ffff], [61, 0xff6cffff],
  [62, 0xff62ffff], [63, 0xff58ffff], [64, 0xff4effff], [65, 0xffffffff],
];

/** Paleta wyjsciowa G1000 / NEXRAD: od dBZ -> kolor. Ponizej pierwszego progu - przezroczyste. */
export const G1000_PALETTE: Array<[number, [number, number, number]]> = [
  [15, [0, 255, 0]],
  [30, [255, 255, 0]],
  [40, [255, 0, 0]],
  [50, [255, 0, 255]],
];

/** Dekoder piksel RGBA -> dBZ (najblizszy kolor z tabeli; RGB wazniejsze od alfy), z pamiecia podreczna. */
export class UbDecoder {
  private cache = new Map<number, number>();
  private ref = UNIVERSAL_BLUE.map(([dbz, c]) => [dbz, (c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]);

  decode(r: number, g: number, b: number, a: number): number {
    if (a < 8) return NaN;
    const key = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    let best = NaN;
    let bd = Infinity;
    for (const [dbz, rr, gg, bb, aa] of this.ref) {
      const d = (rr - r) ** 2 + (gg - g) ** 2 + (bb - b) ** 2 + 0.25 * (aa - a) ** 2;
      if (d < bd) {
        bd = d;
        best = dbz;
      }
    }
    this.cache.set(key, best);
    return best;
  }
}
