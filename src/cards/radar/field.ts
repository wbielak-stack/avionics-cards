import { UbDecoder, G1000_PALETTE } from './palette';

/** Rozmiar kafla danych RainViewer (512 px na kafel = rozdzielczosc o poziom wyzsza). */
export const DATA_TILE = 512;
/** Darmowe API: dane do przyblizenia 7. */
export const DATA_ZOOM = 7;

/**
 * Poziom danych dla przyblizenia mapy: kafel 512 px o poziom nizej daje natywna rozdzielczosc,
 * wiec przy oddalonym widoku pobieramy kilka kafli zamiast kilkudziesieciu (limit zapytan RainViewer).
 */
export const dataZoomFor = (z: number) => Math.max(0, Math.min(DATA_ZOOM, z - 1));

const decoder = new UbDecoder();

/** Pole dBZ kafla (NaN = brak opadu) albo null, gdy nie da sie odczytac pikseli (CORS). */
export type Field = Float32Array | null;

/** Pobranie kafla i dekodowanie palety Universal Blue do dBZ (w przegladarce, na kanwie). */
export function loadField(url: string): Promise<Field> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = DATA_TILE;
        cv.height = DATA_TILE;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, DATA_TILE, DATA_TILE);
        const px = ctx.getImageData(0, 0, DATA_TILE, DATA_TILE).data;
        const out = new Float32Array(DATA_TILE * DATA_TILE);
        for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = decoder.decode(px[j], px[j + 1], px[j + 2], px[j + 3]);
        resolve(out);
      } catch {
        resolve(null); // brak zgody CORS na odczyt pikseli
      }
    };
    img.onerror = () => resolve(new Float32Array(0));
    img.src = url;
  });
}

/** Kolor wg palety G1000 (RGBA) albo 0 (przezroczysty). */
export function colorOf(dbz: number, alpha: number): [number, number, number, number] | undefined {
  if (!(dbz >= G1000_PALETTE[0][0])) return undefined;
  let c = G1000_PALETTE[0][1];
  for (const [thr, rgb] of G1000_PALETTE) if (dbz >= thr) c = rgb;
  return [c[0], c[1], c[2], alpha];
}
