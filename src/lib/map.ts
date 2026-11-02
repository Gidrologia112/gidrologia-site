// Карта «От Невы до Урала»: та же проекция, что у подложки public/img/map.svg (scripts/build-map.mjs).
// Город на карту ставится по широте и долготе — их можно взять в Яндекс Картах.
import { geoConicConformal } from 'd3-geo';

export const MAP_W = 1000, MAP_H = 640;
const box = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[25.5, 49.6], [63.5, 49.6], [63.5, 62.6], [25.5, 62.6], [25.5, 49.6]].reverse()] } };
const proj = geoConicConformal().parallels([52, 60]).rotate([-44, 0]).fitExtent([[0, 0], [MAP_W, MAP_H]], box as any);

/** Положение точки на карте в процентах: [слева, сверху] */
export function mapPos(lat: number, lon: number): [number, number] {
  const p = proj([lon, lat]) ?? [0, 0];
  return [+(p[0] / MAP_W * 100).toFixed(2), +(p[1] / MAP_H * 100).toFixed(2)];
}

// Подписи стран, морей, озёр и рек: k = c (страна), big (Россия), w (вода)
export const mapLabels: { t: string; k: 'c' | 'big' | 'w'; lat: number; lon: number }[] = [
  { t: 'ФИНЛЯНДИЯ', k: 'c', lat: 61.9, lon: 27.6 }, { t: 'ЭСТОНИЯ', k: 'c', lat: 58.75, lon: 26.2 },
  { t: 'ЛАТВИЯ', k: 'c', lat: 56.95, lon: 26.6 }, { t: 'БЕЛАРУСЬ', k: 'c', lat: 53.0, lon: 28.6 },
  { t: 'УКРАИНА', k: 'c', lat: 50.25, lon: 33.0 }, { t: 'КАЗАХСТАН', k: 'c', lat: 50.4, lon: 56.5 },
  { t: 'РОССИЯ', k: 'big', lat: 59.6, lon: 43.5 },
  { t: 'Финский залив', k: 'w', lat: 59.72, lon: 26.4 }, { t: 'Ладожское оз.', k: 'w', lat: 60.62, lon: 31.0 },
  { t: 'Онежское оз.', k: 'w', lat: 61.55, lon: 37.3 }, { t: 'Волга', k: 'w', lat: 53.7, lon: 48.6 }, { t: 'Кама', k: 'w', lat: 57.25, lon: 54.4 },
];

// Где ставить подпись города, если справа она наезжает на соседей
export const labelSide: Record<string, 'up' | 'down' | 'lft'> = {
  'Нижний Новгород': 'up', 'Казань': 'down', 'Калуга': 'lft', 'Екатеринбург': 'lft', 'Челябинск': 'lft',
};
