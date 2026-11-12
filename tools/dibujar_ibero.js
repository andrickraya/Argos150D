// Dibuja el campus IBERO "a mano" (tinta + acuarela) como SVG vectorial para la intro del sitio.
// Fuentes reales: app/campus_data.js (polígonos, nodos, aristas) y ../proyecto/data/map.osm (calles, árboles).
// Uso:  node tools/dibujar_ibero.js            -> escribe assets/img/ibero-dibujo.svg
// Es determinista (semilla fija): correrlo dos veces da el mismo dibujo.
// Unidades del SVG = metros. x = Este, y = -Norte (mismo origen que campus_data.js).

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const OSM = process.argv[2] || path.join(RAIZ, "..", "proyecto", "data", "map.osm");
const SALIDA = path.join(RAIZ, "assets", "img", "ibero-dibujo.svg");

// ---------- Datos ----------
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "app", "campus_data.js"), "utf8"), ctx);
const datos = ctx.window.ARGOS_CAMPUS_DATA;
const { lat: LAT0, lon: LON0 } = datos.origen;
const M = 111320; // misma conversión que osm_a_unity.py (verificada con N01)
const aXY = (lat, lon) => [(lon - LON0) * Math.cos((LAT0 * Math.PI) / 180) * M, -((lat - LAT0) * M)];

// Encuadre 16:9 que contiene todo el campus (en metros)
const VB = { x: -455, y: -247, w: 950, h: 534 };
const dentroVB = ([x, y], m = 60) => x > VB.x - m && x < VB.x + VB.w + m && y > VB.y - m && y < VB.y + VB.h + m;

// ---------- Aleatorio determinista ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(150);
const r = (a, b) => a + (b - a) * rnd();
const f1 = (n) => Math.round(n * 10) / 10;

// ---------- Geometría ----------
function dentroPoligono([x, y], pts) {
  let ok = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ok = !ok;
  }
  return ok;
}
const centroide = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);

// Remuestrea una polilínea cada `paso` metros
function remuestrear(pts, paso) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(d / paso));
    for (let k = 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

// Trazo "a mano": desplazamiento perpendicular suave (ruido de valor) + pequeño exceso en las puntas
function trazoMano(pts, { cerrado = false, rugosidad = 0.5, paso = 3, exceso = 0.8 } = {}) {
  const base = cerrado ? [...pts, pts[0]] : pts.slice();
  const s = remuestrear(base, paso);
  const nodosRuido = Array.from({ length: Math.ceil(s.length / 4) + 2 }, () => r(-1, 1));
  const ruido = (i) => {
    const t = i / 4, k = Math.floor(t), u = t - k, w = u * u * (3 - 2 * u);
    return nodosRuido[k] * (1 - w) + nodosRuido[k + 1] * w;
  };
  const q = s.map(([x, y], i) => {
    const a = s[Math.max(0, i - 1)], b = s[Math.min(s.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    const o = ruido(i) * rugosidad;
    return [x + (nx / l) * o, y + (ny / l) * o];
  });
  if (!cerrado && q.length > 1 && exceso > 0) {
    const ext = (p, a) => {
      const dx = p[0] - a[0], dy = p[1] - a[1], l = Math.hypot(dx, dy) || 1, e = r(0, exceso);
      return [p[0] + (dx / l) * e, p[1] + (dy / l) * e];
    };
    q[0] = ext(q[0], q[1]);
    q[q.length - 1] = ext(q[q.length - 1], q[q.length - 2]);
  }
  return "M" + q.map(([x, y]) => `${f1(x)} ${f1(y)}`).join("L") + (cerrado ? "Z" : "");
}

// Contorno cerrado a mano (sin cerrar exacto: el segundo trazo se encima un poco, como en un boceto)
function contornoMano(pts, rug) {
  const extra = remuestrear([...pts, pts[0]], 4).slice(0, 2);
  return trazoMano([...pts, pts[0], ...extra.slice(1)], { rugosidad: rug, exceso: 0 });
}

// Círculo a mano (copa de árbol) con curvas Catmull-Rom
function circuloMano(cx, cy, radio) {
  const n = 8, p = [];
  const fase = r(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = fase + (i / n) * Math.PI * 2, rr = radio * r(0.82, 1.12);
    p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = `M${f1(p[0][0])} ${f1(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + "Z";
}

// ---------- OSM (parser mínimo con regex; el archivo es de confianza y local) ----------
const xml = fs.readFileSync(OSM, "utf8");
const nodosOSM = new Map();
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"/g)) nodosOSM.set(m[1], aXY(+m[2], +m[3]));
const viasOSM = [];
for (const m of xml.matchAll(/<way id="(\d+)"[^>]*>([\s\S]*?)<\/way>/g)) {
  const refs = [...m[2].matchAll(/<nd ref="(\d+)"/g)].map((x) => x[1]);
  const tags = Object.fromEntries([...m[2].matchAll(/<tag k="([^"]+)" v="([^"]*)"/g)].map((x) => [x[1], x[2]]));
  const pts = refs.map((id) => nodosOSM.get(id)).filter(Boolean);
  if (pts.length >= 2) viasOSM.push({ id: m[1], tags, pts });
}
const arbolesOSM = [];
for (const m of xml.matchAll(/<node id="(\d+)"[^>]*?lat="([-\d.]+)" lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/node>/g))
  if (/k="natural" v="tree"/.test(m[4])) arbolesOSM.push(aXY(+m[2], +m[3]));

// ---------- Polígonos de campus_data (y = -z) ----------
const polis = datos.poligonos.map((p) => ({ ...p, pts: p.pts.map(([x, z]) => [x, -z]) }));
const polisIbero = polis.filter((p) => p.tipo === "ibero" || p.tipo === "edificio");
const enPolisCampus = (pt) => polis.some((p) => dentroPoligono(pt, p.pts));

const recinto = viasOSM.find((v) => v.tags.amenity === "university" && /Iberoamericana/.test(v.tags.name || ""));

// ---------- Paleta ----------
const C = {
  papel: "#f4ecdc",
  tinta: "#3b2c24",
  grafito: "#6f6357",
  ladrillo: "#c4613f",
  ladrilloOsc: "#8c3a22",
  recinto: "#efdcc0",
  pasto: "#a9c48a",
  cancha: "#8fbf86",
  estac: "#e3d9c6",
  calle: "#fbf6ec",
  ciudad: "#d9d0c2",
  arboles: ["#6e9a59", "#81a866", "#5b8a4c", "#8fb071"],
  ruta: "#C8102E"
};

const capas = { suelo: [], verdes: [], calles: [], ciudad: [], ibero: [], arboles: [], ruta: [] };
const pathEl = (d, attrs) => `<path d="${d}" ${attrs}/>`;

// Recinto Ibero: suelo cálido + borde punteado
if (recinto) {
  capas.suelo.push(pathEl(trazoMano(recinto.pts, { cerrado: true, rugosidad: 1.2, paso: 6 }), `fill="${C.recinto}" opacity=".85"`));
  capas.suelo.push(pathEl(contornoMano(recinto.pts, 0.8), `fill="none" stroke="${C.ladrilloOsc}" stroke-width=".7" stroke-dasharray="3 2.2" opacity=".55"`));
}

// Verdes, canchas y estacionamientos del campus
for (const p of polis) {
  const estilos = {
    pasto: [C.pasto, "url(#h-pasto)"],
    cancha: [C.cancha, null],
    estacionamiento: [C.estac, "url(#h-estac)"]
  }[p.tipo];
  if (!estilos) continue;
  capas.verdes.push(pathEl(trazoMano(p.pts, { cerrado: true, rugosidad: 1, paso: 4 }), `fill="${estilos[0]}" opacity=".8"`));
  if (estilos[1]) capas.verdes.push(pathEl(trazoMano(p.pts, { cerrado: true, rugosidad: 0.6 }), `fill="${estilos[1]}"`));
  capas.verdes.push(pathEl(contornoMano(p.pts, 0.5), `fill="none" stroke="${C.grafito}" stroke-width=".35" opacity=".6"`));
  if (p.tipo === "cancha") {
    const [cx, cy] = centroide(p.pts);
    capas.verdes.push(pathEl(circuloMano(cx, cy, 3), `fill="none" stroke="#fff" stroke-width=".35" opacity=".8"`));
  }
}

// Verdes y edificios de la ciudad alrededor (fuera del campus), más tenues
for (const v of viasOSM) {
  const t = v.tags;
  const cerrado = v.pts.length > 3 && v.pts[0] === v.pts[v.pts.length - 1];
  if (!cerrado || !v.pts.some((p) => dentroVB(p))) continue;
  if (enPolisCampus(centroide(v.pts))) continue;
  if (t.building) {
    capas.ciudad.push(pathEl(trazoMano(v.pts, { cerrado: true, rugosidad: 0.6 }), `fill="${C.ciudad}" opacity=".75"`));
    capas.ciudad.push(pathEl(contornoMano(v.pts, 0.45), `fill="none" stroke="${C.grafito}" stroke-width=".4" opacity=".7"`));
  } else if (["park", "garden", "pitch", "track"].includes(t.leisure) || t.landuse === "grass") {
    capas.verdes.push(pathEl(trazoMano(v.pts, { cerrado: true, rugosidad: 1 }), `fill="${C.pasto}" opacity=".55"`));
    capas.verdes.push(pathEl(contornoMano(v.pts, 0.5), `fill="none" stroke="${C.grafito}" stroke-width=".3" opacity=".45"`));
  }
}

// Calles: casco de grafito + relleno claro
const ANCHO = { motorway: 20, motorway_link: 9, trunk: 16, primary: 14, secondary: 13, secondary_link: 7, tertiary: 10, residential: 7, unclassified: 7, service: 4.5, pedestrian: 5, footway: 2.4, path: 2, steps: 2.4 };
const callesOrd = viasOSM.filter((v) => ANCHO[v.tags.highway] && v.pts.some((p) => dentroVB(p))).sort((a, b) => ANCHO[a.tags.highway] - ANCHO[b.tags.highway]);
const peatonales = [];
for (const v of callesOrd) {
  const w = ANCHO[v.tags.highway];
  const d = trazoMano(v.pts, { rugosidad: Math.min(1.2, 0.45 + w * 0.04), paso: 4, exceso: 0 });
  capas.calles.push(pathEl(d, `fill="none" stroke="${C.grafito}" stroke-width="${f1(w + 1.1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".55"`));
  capas.calles.push(pathEl(d, `fill="none" stroke="${C.calle}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`));
  if (v.tags.highway === "motorway")
    capas.calles.push(pathEl(trazoMano(v.pts, { rugosidad: 0.3, paso: 5 }), `fill="none" stroke="${C.grafito}" stroke-width=".45" stroke-dasharray="4 4" opacity=".6"`));
  if (["footway", "pedestrian", "path", "service"].includes(v.tags.highway)) peatonales.push({ pts: v.pts, sep: v.tags.highway === "service" ? 4.8 : 4.5, paso: v.tags.highway === "service" ? 16 : 8 });
}

// Edificios IBERO (y vecinos de campus_data): acuarela de ladrillo en dos capas + rayado + tinta doble
for (const p of polisIbero) {
  const ibero = p.tipo === "ibero";
  const color = ibero ? C.ladrillo : C.ciudad;
  capas.ibero.push(pathEl(trazoMano(p.pts.map(([x, y]) => [x + 1.1, y + 1.3]), { cerrado: true, rugosidad: 0.4 }), `fill="${C.tinta}" opacity=".16"`)); // sombra
  capas.ibero.push(pathEl(trazoMano(p.pts, { cerrado: true, rugosidad: 1.1, paso: 4 }), `fill="${color}" opacity="${ibero ? ".55" : ".7"}"`));
  capas.ibero.push(pathEl(trazoMano(p.pts, { cerrado: true, rugosidad: 0.7, paso: 5 }), `fill="${color}" opacity="${ibero ? ".38" : ".3"}"`));
  if (ibero) capas.ibero.push(pathEl(trazoMano(p.pts, { cerrado: true, rugosidad: 0.4 }), `fill="url(#h-ladrillo)"`));
  capas.ibero.push(pathEl(contornoMano(p.pts, 0.6), `fill="none" stroke="${C.tinta}" stroke-width="${ibero ? ".55" : ".4"}" stroke-linejoin="round" opacity=".85"`));
  // Trazo de boceto: cada lado largo se dibuja suelto y se pasa de la esquina, como lápiz de arquitecto
  for (let i = 0; i < p.pts.length - 1; i++) {
    const a = p.pts[i], b = p.pts[i + 1];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 7) continue;
    const off = [r(-0.5, 0.5), r(-0.5, 0.5)];
    capas.ibero.push(pathEl(trazoMano([[a[0] + off[0], a[1] + off[1]], [b[0] + off[0], b[1] + off[1]]], { rugosidad: 0.6, exceso: 2.2 }), `fill="none" stroke="${C.tinta}" stroke-width=".28" stroke-linecap="round" opacity=".5"`));
  }
}

// Árboles: dentro de los verdes y a los lados de los andadores
const edificiosTodos = [...polisIbero.map((p) => p.pts)];
const libre = (pt) => dentroVB(pt, 0) && !edificiosTodos.some((pp) => dentroPoligono(pt, pp));
const arboles = [];
const separado = (pt, d) => arboles.every(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) > d);
for (const p of polis.filter((p) => p.tipo === "pasto")) {
  const xs = p.pts.map((q) => q[0]), ys = p.pts.map((q) => q[1]);
  for (let i = 0; i < 420; i++) {
    const pt = [r(Math.min(...xs), Math.max(...xs)), r(Math.min(...ys), Math.max(...ys))];
    if (dentroPoligono(pt, p.pts) && libre(pt) && separado(pt, 5.2)) arboles.push(pt);
  }
}
for (const { pts, sep, paso } of peatonales) {
  const s = remuestrear(pts, paso);
  for (let i = 1; i < s.length; i++) {
    const [x0, y0] = s[i - 1], [x1, y1] = s[i];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
    for (const lado of [-1, 1]) {
      const pt = [x1 + nx * sep * lado + r(-0.8, 0.8), y1 + ny * sep * lado + r(-0.8, 0.8)];
      if (recinto && dentroPoligono(pt, recinto.pts) && libre(pt) && separado(pt, 5.5)) arboles.push(pt);
    }
  }
}
for (const pt of arbolesOSM) if (libre(pt) && separado(pt, 4)) arboles.push(pt);
for (const [x, y] of arboles) {
  const rad = r(2.1, 3.4);
  capas.arboles.push(pathEl(circuloMano(x + 1.2, y + 1.4, rad), `fill="${C.tinta}" opacity=".16"`));
  capas.arboles.push(pathEl(circuloMano(x, y, rad), `fill="${C.arboles[Math.floor(r(0, C.arboles.length))]}" opacity=".9" stroke="#33502c" stroke-width=".25"`));
}

// Ruta ARGOS (Puerta 3 -> Salón C) por las aristas reales, más corta (Dijkstra)
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
const ptsRuta = camino.map((id) => nodo[id]);
rnd = mulberry32(7);
const dRuta = trazoMano(ptsRuta, { rugosidad: 0.35, paso: 3, exceso: 0 });
capas.ruta.push(pathEl(dRuta, `fill="none" stroke="${C.ruta}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".18"`));
capas.ruta.push(`<path id="ruta-argos" d="${dRuta}" fill="none" stroke="${C.ruta}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
const [ox, oy] = ptsRuta[0], [dx, dy] = ptsRuta[ptsRuta.length - 1];
capas.ruta.push(`<g id="ruta-inicio"><circle cx="${f1(ox)}" cy="${f1(oy)}" r="3.2" fill="#fff" stroke="${C.ruta}" stroke-width="1.2"/><circle cx="${f1(ox)}" cy="${f1(oy)}" r="1.4" fill="${C.ruta}"/></g>`);
capas.ruta.push(`<g id="ruta-fin"><circle cx="${f1(dx)}" cy="${f1(dy)}" r="6" fill="${C.ruta}" opacity=".18"/><path d="M${f1(dx)} ${f1(dy)}c-1.6-2.4-4.2-5-4.2-7.4a4.2 4.2 0 0 1 8.4 0c0 2.4-2.6 5-4.2 7.4z" fill="${C.ruta}" stroke="#fff" stroke-width=".6"/><circle cx="${f1(dx)}" cy="${f1(dy - 7.4)}" r="1.5" fill="#fff"/></g>`);

// ---------- Ensamblar ----------
const defs = `<defs>
<pattern id="h-ladrillo" width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 1.2H2.4" stroke="${C.ladrilloOsc}" stroke-width=".28" opacity=".55"/></pattern>
<pattern id="h-pasto" width="3.2" height="3.2" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M0 1.6H3.2" stroke="#5f7f45" stroke-width=".22" opacity=".45"/></pattern>
<pattern id="h-estac" width="2.6" height="2.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M1.3 0V2.6" stroke="${C.grafito}" stroke-width=".18" opacity=".45"/></pattern>
</defs>`;
const g = (id, arr) => `<g id="${id}">${arr.join("")}</g>`;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Dibujo a mano del campus de la Universidad Iberoamericana visto desde arriba">
<!-- Generado por tools/dibujar_ibero.js a partir de map.osm (© colaboradores de OpenStreetMap, ODbL) y campus_data.js -->
${defs}
${g("suelo", capas.suelo)}
${g("verdes", capas.verdes)}
${g("calles", capas.calles)}
${g("ciudad", capas.ciudad)}
${g("edificios-ibero", capas.ibero)}
${g("arboles", capas.arboles)}
${g("ruta", capas.ruta)}
</svg>
`;
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, svg, "utf8");
console.log(`OK: ${path.relative(RAIZ, SALIDA)} (${(svg.length / 1024).toFixed(0)} KB) · ${polis.length} polígonos campus · ${callesOrd.length} calles · ${arboles.length} árboles · ruta ${camino.join("→")}`);
