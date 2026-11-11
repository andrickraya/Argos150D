// Hornea los datos del modelo 3D del campus para la sección "Campus en 3D" del sitio.
// Fuentes reales: ../proyecto/data/map.osm (edificios con height / building:levels, calles, árboles)
//                 y app/campus_data.js (verdes, nodos, aristas para la ruta).
// Uso:  node tools/campus_3d.js            -> escribe assets/data/campus3d.json
// El sitio lee SOLO ese JSON (no lee app/), así que cambiar la app no rompe el sitio.
// Unidades = metros. x = Este, y = Sur (y = -Norte), igual que tools/dibujar_ibero.js.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const OSM = process.argv[2] || path.join(RAIZ, "..", "proyecto", "data", "map.osm");
const SALIDA = path.join(RAIZ, "assets", "data", "campus3d.json");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "app", "campus_data.js"), "utf8"), ctx);
const datos = ctx.window.ARGOS_CAMPUS_DATA;
const { lat: LAT0, lon: LON0 } = datos.origen;
const M = 111320;
const aXY = (lat, lon) => [(lon - LON0) * Math.cos((LAT0 * Math.PI) / 180) * M, -((lat - LAT0) * M)];

// Área del modelo (un poco mayor que el dibujo, para que el horizonte no se vea cortado)
const VB = { x: -520, y: -300, w: 1080, h: 640 };
const dentro = ([x, y], m = 0) => x > VB.x - m && x < VB.x + VB.w + m && y > VB.y - m && y < VB.y + VB.h + m;
const f1 = (n) => Math.round(n * 10) / 10;
const redondear = (pts) => pts.map(([x, y]) => [f1(x), f1(y)]);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(150);
const r = (a, b) => a + (b - a) * rnd();

function dentroPoligono([x, y], pts) {
  let ok = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
const centroide = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
function remuestrear(pts, paso) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / paso));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

// ---------- OSM ----------
const xml = fs.readFileSync(OSM, "utf8");
const nodosOSM = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodosOSM.set(m[1], aXY(+m[2], +m[3]));
const vias = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const refs = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map((x) => x[1]);
  const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map((x) => [x[1], x[2]]));
  const pts = refs.map((id) => nodosOSM.get(id)).filter(Boolean);
  if (pts.length >= 2) vias.push({ id: m[1], tags, pts, cerrado: refs.length > 3 && refs[0] === refs[refs.length - 1] });
}
const arbolesOSM = [];
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/node>/g))
  if (/k="natural" v="tree"/.test(m[4])) arbolesOSM.push(aXY(+m[2], +m[3]));

const recinto = vias.find((v) => v.tags.amenity === "university" && /Iberoamericana/.test(v.tags.name || ""));
if (!recinto) throw new Error("No encontré el recinto de la Ibero (amenity=university) en map.osm");
const enIbero = (pt) => dentroPoligono(pt, recinto.pts);

// ---------- Edificios (altura real de OSM cuando existe) ----------
const stats = { conAltura: 0, conPisos: 0, sinDato: 0 };
const edificios = [];
for (const v of vias) {
  const t = v.tags;
  if (!t.building || !v.cerrado) continue;
  const pts = v.pts.slice(0, -1);
  const c = centroide(pts);
  if (!dentro(c)) continue;
  let h = parseFloat(t.height), hReal = true;
  if (h > 0) stats.conAltura++;
  else if (parseFloat(t["building:levels"]) > 0) { h = parseFloat(t["building:levels"]) * 3.4; stats.conPisos++; }
  else { h = t.building === "university" ? 10 : 8; hReal = false; stats.sinDato++; }
  edificios.push({ id: v.id, nombre: t.name || "", h: f1(Math.min(h, 60)), hReal, ibero: enIbero(c), pts: redondear(pts) });
}

// ---------- Suelo: verdes de campus_data + parques OSM ----------
const polis = datos.poligonos.map((p) => ({ ...p, pts: p.pts.map(([x, z]) => [x, -z]) }));
const verdes = [];
for (const p of polis) if (["pasto", "cancha"].includes(p.tipo)) verdes.push({ tipo: p.tipo, pts: redondear(p.pts) });
for (const v of vias) {
  const t = v.tags;
  if (!v.cerrado || !dentro(centroide(v.pts))) continue;
  if (["park", "garden", "pitch"].includes(t.leisure) || t.landuse === "grass")
    verdes.push({ tipo: t.leisure === "pitch" ? "cancha" : "pasto", pts: redondear(v.pts.slice(0, -1)) });
}

// ---------- Calles ----------
const ANCHO = { motorway: 20, motorway_link: 9, trunk: 16, primary: 14, secondary: 13, secondary_link: 7, tertiary: 10, residential: 7, unclassified: 7, service: 4.5, pedestrian: 5, footway: 2.4, path: 2, steps: 2.4 };
const calles = [];
const peatonales = [];
for (const v of vias) {
  const w = ANCHO[v.tags.highway];
  if (!w || !v.pts.some((p) => dentro(p, 40))) continue;
  const peaton = ["footway", "pedestrian", "path", "steps"].includes(v.tags.highway);
  calles.push({ w, peaton, pts: redondear(v.pts) });
  if (peaton || v.tags.highway === "service") peatonales.push(v.pts);
}

// ---------- Árboles (OSM + verdes + bordes de andadores dentro de la Ibero) ----------
const libre = (pt) => dentro(pt) && !edificios.some((e) => dentroPoligono(pt, e.pts));
const arboles = [];
const separado = (pt, d) => arboles.every(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) > d);
for (const pt of arbolesOSM) if (libre(pt) && separado(pt, 3.5)) arboles.push(pt);
for (const p of polis.filter((p) => p.tipo === "pasto")) {
  const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
  for (let i = 0; i < 420; i++) {
    const pt = [r(Math.min(...xs), Math.max(...xs)), r(Math.min(...ys), Math.max(...ys))];
    if (dentroPoligono(pt, p.pts) && libre(pt) && separado(pt, 5.2)) arboles.push(pt);
  }
}
for (const pts of peatonales) {
  const s = remuestrear(pts, 9);
  for (let i = 1; i < s.length; i++) {
    const [x0, y0] = s[i - 1], [x1, y1] = s[i];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
    for (const lado of [-1, 1]) {
      const pt = [x1 + nx * 4.6 * lado + r(-0.8, 0.8), y1 + ny * 4.6 * lado + r(-0.8, 0.8)];
      if (enIbero(pt) && libre(pt) && separado(pt, 5.5)) arboles.push(pt);
    }
  }
}
// x, y, escala (variación de tamaño fija para que el modelo sea determinista)
const arbolesOut = arboles.map(([x, y]) => [f1(x), f1(y), Math.round(r(0.8, 1.25) * 100) / 100]);
const nArbolesOSM = arbolesOSM.filter((pt) => dentro(pt)).length;

// ---------- Ruta ARGOS Puerta 3 -> Salón C (Dijkstra sobre las aristas reales) ----------
const nodo = Object.fromEntries(datos.nodos.map((n) => [n.id, [n.x, -n.z]]));
function rutaMasCorta(a, b) {
  const dist = { [a]: 0 }, prev = {}, pend = new Set(Object.keys(nodo));
  while (pend.size) {
    let u = null;
    for (const k of pend) if (dist[k] !== undefined && (u === null || dist[k] < dist[u])) u = k;
    if (u === null || u === b) break;
    pend.delete(u);
    for (const [p, q] of datos.aristas) {
      const v = p === u ? q : q === u ? p : null;
      if (!v || !pend.has(v)) continue;
      const d = dist[u] + Math.hypot(nodo[u][0] - nodo[v][0], nodo[u][1] - nodo[v][1]);
      if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  const camino = [b];
  while (camino[0] !== a) camino.unshift(prev[camino[0]]);
  return camino;
}
const camino = rutaMasCorta("N01", "N07");
const largo = camino.slice(1).reduce((s, id, i) => s + Math.hypot(nodo[id][0] - nodo[camino[i]][0], nodo[id][1] - nodo[camino[i]][1]), 0);

const salida = {
  fuente: "map.osm (© colaboradores de OpenStreetMap, ODbL) + app/campus_data.js · generado por tools/campus_3d.js",
  area: VB,
  // Lo que muestra el sitio en las cifras (se recalcula en cada corrida)
  resumen: {
    edificiosIbero: edificios.filter((e) => e.ibero).length,
    iberoConAltura: edificios.filter((e) => e.ibero && e.hReal).length,
    edificiosTotal: edificios.length,
    arbolesOSM: nArbolesOSM
  },
  recinto: redondear(recinto.pts.slice(0, -1)),
  edificios,
  verdes,
  calles,
  arboles: arbolesOut,
  ruta: { ids: camino, metros: Math.round(largo), pts: redondear(camino.map((id) => nodo[id])) },
  nodos: datos.nodos.map((n) => ({ id: n.id, nombre: n.nombre, x: f1(n.x), y: f1(-n.z) }))
};

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
const json = JSON.stringify(salida);
fs.writeFileSync(SALIDA, json, "utf8");
console.log(
  `OK: ${path.relative(RAIZ, SALIDA)} (${(json.length / 1024).toFixed(0)} KB) · ${edificios.length} edificios ` +
  `(${salida.resumen.edificiosIbero} Ibero, ${salida.resumen.iberoConAltura} de ellos con altura real; altura OSM ${stats.conAltura}, por pisos ${stats.conPisos}, supuesta ${stats.sinDato}) · ` +
  `${verdes.length} verdes · ${calles.length} calles · ${arbolesOut.length} árboles · ruta ${camino.join("→")} (${Math.round(largo)} m)`
);
