// Карта «От Невы до Урала»: настоящая география (границы, озёра, реки) для главной.
// Однократная генерация, результат лежит в репозитории: public/img/map.svg.
// Проекция должна совпадать с src/lib/map.ts (там ставятся города по широте/долготе).
// Перегенерировать (например, добавить город):
//   npm i --no-save d3-geo@3 topojson-client@3 world-atlas@2 @geo-maps/earth-lakes-10km@0.6.0 @geo-maps/earth-rivers-1km@0.6.0
//   node scripts/build-map.mjs public/img/map.svg
// Данные: Natural Earth (world-atlas), реки и озёра — geo-maps (ODbL/Natural Earth).
import { geoConicConformal, geoPath, geoGraticule } from 'd3-geo';
import { feature } from 'topojson-client';
import { readFileSync, writeFileSync } from 'node:fs';
const NM = process.env.NM || 'node_modules/';
const W = 1000, H = 640;
const topo = JSON.parse(readFileSync(NM + 'world-atlas/countries-50m.json'));
const countries = feature(topo, topo.objects.countries).features;
const lakes = JSON.parse(readFileSync(NM + '@geo-maps/earth-lakes-10km/map.geo.json'));
const rivers = JSON.parse(readFileSync(NM + '@geo-maps/earth-rivers-1km/map.geo.json'));
const box = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[25.5, 49.6], [63.5, 49.6], [63.5, 62.6], [25.5, 62.6], [25.5, 49.6]].reverse()] } };
const proj = geoConicConformal().parallels([52, 60]).rotate([-44, 0]).fitExtent([[0, 0], [W, H]], box);
proj.clipExtent([[-2, -2], [W + 2, H + 2]]);
const path = geoPath(proj);
const r = (s) => (s || '').replace(/(\d+\.\d{1})\d+/g, '$1');
const ri = (s) => (s || '').replace(/(-?\d+)\.\d+/g, '$1');
// реки: только заметные отрезки, координаты до целых
function thin(d, min) {
  return d.split('M').filter(Boolean).map((seg) => {
    const n = seg.match(/-?\d+(\.\d+)?/g).map(Number); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
    return Math.hypot(x1 - x0, y1 - y0) >= min ? 'M' + ri(seg).replace(/L(-?\d+),(-?\d+)(?=L\1,\2)/g, '') : '';
  }).join('');
}
const out = { w: W, h: H, countries: [], lakes: '', rivers: '' };
for (const f of countries) {
  const d = r(path(f)); if (!d) continue;
  if (['Antarctica','France'].includes(f.properties.name)) continue;
  out.countries.push({ name: f.properties.name, d: ri(d) });
}
out.lakes = ri(path(lakes));
out.rivers = thin(path(rivers), 0);
const cities = { 'Санкт-Петербург': [30.32, 59.94], 'Москва': [37.62, 55.75], 'Нижний Новгород': [44.0, 56.33], 'Казань': [49.11, 55.79], 'Киров': [49.67, 58.6], 'Уфа': [55.96, 54.73], 'Екатеринбург': [60.6, 56.84], 'Валдай': [33.24, 57.98], 'Псков': [28.33, 57.82], 'Кортела': [32.0, 61.42], 'Калуга': [36.26, 54.51], 'Рязань': [39.74, 54.63], 'Белгород': [36.59, 50.6], 'Челябинск': [61.4, 55.16], 'Беларусь, Германия': [27.56, 53.9] };
out.cities = Object.fromEntries(Object.entries(cities).map(([k, v]) => { const [x, y] = proj(v); return [k, [+(x / W * 100).toFixed(2), +(y / H * 100).toFixed(2)]]; }));
out.grat = ri(path(geoGraticule().step([5, 5])()));
const P = (lonlat) => { const [x, y] = proj(lonlat); return [+(x / W * 100).toFixed(2), +(y / H * 100).toFixed(2)]; };
out.labels = [
  ['ФИНЛЯНДИЯ', [27.6, 61.9], 'c'], ['ЭСТОНИЯ', [26.2, 58.75], 'c'], ['ЛАТВИЯ', [26.6, 56.95], 'c'], ['БЕЛАРУСЬ', [28.6, 53.0], 'c'],
  ['УКРАИНА', [33.0, 50.25], 'c'], ['КАЗАХСТАН', [56.5, 50.4], 'c'], ['РОССИЯ', [43.5, 59.6], 'big'],
  ['Финский залив', [27.0, 59.95], 'w'], ['Ладожское оз.', [31.4, 60.75], 'w'], ['Онежское оз.', [35.6, 62.15], 'w'],
  ['Волга', [48.6, 53.7], 'w'], ['Кама', [53.0, 56.05], 'w'],
].map(([t, ll, k]) => ({ t, k, p: P(ll) }));
delete out.cities['Беларусь, Германия']; out.cities['Беларусь, Германия'] = P([27.56, 53.9]);
// SVG-подложка (география) — отдельным файлом, чтобы кэшировалась
const SEA = '#071C25';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${SEA}"/>`
  + `<path d="${out.grat}" fill="none" stroke="#9FD3E8" stroke-opacity=".07" stroke-width="1"/>`
  + out.countries.map((c) => `<path d="${c.d}" fill="${c.name === 'Russia' ? '#0E3442' : '#0A2632'}" stroke="#9FD3E8" stroke-opacity="${c.name === 'Russia' ? '.45' : '.16'}" stroke-width="1" stroke-linejoin="round"/>`).join('')
  + `<path d="${out.lakes}" fill="${SEA}" stroke="#0083C3" stroke-opacity=".7" stroke-width=".8"/>`
  + `<path d="${out.rivers}" fill="none" stroke="#0083C3" stroke-opacity=".8" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`
  + `</svg>`;
writeFileSync(process.argv[2] || 'map.svg', svg);
console.log('svg', Math.round(svg.length / 1024), 'КБ');
console.log(out.countries.map(c => c.name).join(', '), JSON.stringify(out).length, out.rivers.length, out.lakes.length);
