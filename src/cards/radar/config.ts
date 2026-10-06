import { clean } from '../eis/config';

export interface RadarCardConfig {
  type: string;
  title?: string;
  latitude?: number;
  longitude?: number;
  /** przyblizenie mapy; dane radaru do 7 (kafle 512 = rozdzielczosc 8), wyzej - interpolacja pola dBZ */
  zoom?: number;
  /** wysokosc mapy [px] */
  height?: number;
  /** g1000 = przemalowanie wg dBZ (zielony / zolty / czerwony / magenta), orig = paleta RainViewer */
  style?: 'g1000' | 'orig';
  opacity?: number;
  /** okregi odleglosci, np. "25, 50, 100" */
  rings?: string;
  distance_unit?: 'km' | 'nm';
  /** odleglosc do najblizszego opadu (echo / umiarkowany / silny) pod mapa */
  show_distances?: boolean;
  frame_ms?: number;
  autoplay?: boolean;
  /** jasnosc podkladu mapy (0-1) */
  map_brightness?: number;
  /**
   * podklad: vector (domyslnie - mapa wektorowa jak na MFD, z Natural Earth, jak w wallboardzie),
   * esri_dark, osm (przyciemniona), custom (basemap_url), none
   */
  basemap?: 'vector' | 'esri_dark' | 'osm' | 'custom' | 'none';
  /** plik mapy wektorowej (granice, wybrzeza, rzeki, jeziora, miasta) */
  vector_url?: string;
  /** adres kafli podkladu z {z} {x} {y} (dla custom) */
  basemap_url?: string;
}

export const RADAR_DEFAULTS: Partial<RadarCardConfig> = {
  zoom: 8,
  height: 320,
  style: 'g1000',
  opacity: 0.85,
  rings: '25, 50, 100',
  distance_unit: 'km',
  show_distances: true,
  frame_ms: 600,
  autoplay: true,
  map_brightness: 0.8,
  basemap: 'vector',
  vector_url: 'https://raw.githubusercontent.com/wbielak-stack/avionics-cards/main/data/europe.json',
};

export function normalizeRadar(c: RadarCardConfig): RadarCardConfig {
  return { ...RADAR_DEFAULTS, ...clean(c) } as RadarCardConfig;
}
