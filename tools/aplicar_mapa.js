// Aplica el archivo del editor de caminos (app/editor.html → "💾 Descargar mis cambios") a app/campus_data.js.
//
// Uso (desde la raíz del repo):
//   node tools/aplicar_mapa.js argos_mapa.json --seco   -> sólo muestra qué cambiaría
//   node tools/aplicar_mapa.js argos_mapa.json          -> reescribe nodos y aristas de app/campus_data.js
//   node tools/aplicar_mapa.js argos_mapa.json --datos otra/campus_data.js   (para pruebas)
//   después:  node tools/build_app.js   y correr las pruebas
//
// El archivo trae TODOS los nodos y TODAS las aristas tal como quedaron en el editor.
// origen y poligonos de campus_data.js no se tocan.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const args = process.argv.slice(2);
const seco = args.includes("--seco");
const iDatos = args.indexOf("--datos");
const rutaDatos = iDatos >= 0 ? args[iDatos + 1] : path.join(__dirname, "..", "app", "campus_data.js");
const rutaMapa = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--datos");
if (!rutaMapa) { console.error("Falta el archivo. Uso: node tools/aplicar_mapa.js argos_mapa.json [--seco]"); process.exit(1); }

const mapa = JSON.parse(fs.readFileSync(rutaMapa, "utf8").replace(/^﻿/, ""));
if (!Array.isArray(mapa.nodos) || !Array.isArray(mapa.aristas)) { console.error("El archivo no trae 'nodos' y 'aristas'."); process.exit(1); }

let texto = fs.readFileSync(rutaDatos, "utf8");
const crlf = texto.includes("\r\n");
if (crlf) texto = texto.replace(/\r\n/g, "\n");
const w = {};
vm.runInNewContext(texto, { window: w });
const actual = w.ARGOS_CAMPUS_DATA;
const LAT0 = actual.origen.lat, LON0 = actual.origen.lon, R = 6378137, RAD = Math.PI / 180;
const aMetros = (lat, lon) => ({ x: R * (lon - LON0) * RAD * Math.cos(LAT0 * RAD), z: R * (lat - LAT0) * RAD });
const viejos = new Map(actual.nodos.map((n) => [n.id, n]));
const clave = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ---- validar
const errores = [];
const ids = new Set();
for (const n of mapa.nodos) {
  if (!/^N\d{2,3}$/.test(n.id || "")) errores.push(`id inválido: ${JSON.stringify(n.id)}`);
  if (ids.has(n.id)) errores.push(`id repetido: ${n.id}`);
  ids.add(n.id);
  if (!Number.isFinite(n.lat) || !Number.isFinite(n.lon)) errores.push(`${n.id}: coordenadas inválidas`);
  else { const m = aMetros(n.lat, n.lon); if (Math.hypot(m.x, m.z) > 1500) errores.push(`${n.id}: queda a ${Math.round(Math.hypot(m.x, m.z))} m del campus`); }
  if (!String(n.nombre || "").trim()) errores.push(`${n.id}: sin nombre`);
}
const aristas = new Set();
for (const ar of mapa.aristas) {
  if (!Array.isArray(ar) || ar.length !== 2 || !ids.has(ar[0]) || !ids.has(ar[1]) || ar[0] === ar[1]) { errores.push(`arista inválida: ${JSON.stringify(ar)}`); continue; }
  aristas.add(clave(ar[0], ar[1]));
}
if (errores.length) { console.error("❌ El archivo tiene problemas y NO se aplicó:\n  " + errores.join("\n  ")); process.exit(1); }

// ---- armar nodos (los que no se movieron conservan su x, z y descripción tal cual)
const limpio = (s) => String(s || "").replace(/["\\\r\n]/g, " ").trim();
let nuevos = 0, movidos = 0, editados = 0;
const nodos = mapa.nodos.map((n) => {
  const v = viejos.get(n.id);
  const mismoLugar = v && Math.abs(v.lat - n.lat) < 1e-7 && Math.abs(v.lon - n.lon) < 1e-7;
  const m = mismoLugar ? { x: v.x, z: v.z } : aMetros(n.lat, n.lon);
  if (!v) { nuevos++; console.log(`➕ ${n.id} ${n.nombre} (${n.categoria})`); }
  else if (!mismoLugar) { movidos++; console.log(`↔️  ${n.id} ${n.nombre}: se mueve ${Math.hypot(m.x - v.x, m.z - v.z).toFixed(1)} m`); }
  else if (v.nombre !== n.nombre || v.categoria !== n.categoria || !!v.escaleras !== !!n.escaleras) { editados++; console.log(`✏️  ${n.id}: ${v.nombre} [${v.categoria}] → ${n.nombre} [${n.categoria}]${n.escaleras ? " 🪜" : ""}`); }
  const desc = v && mismoLugar ? v.desc : (v ? `${limpio(v.desc)} (movido en el editor)`.replace(/( \(movido en el editor\))+$/, " (movido en el editor)") : limpio(n.desc) || "Agregado en el editor de caminos");
  return { id: n.id, nombre: limpio(n.nombre), categoria: limpio(n.categoria) || "Referencia", x: m.x, z: m.z, lat: n.lat, lon: n.lon, piso: limpio(n.piso) || "PB", desc: limpio(desc), escaleras: !!n.escaleras };
});
nodos.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
const borrados = [...viejos.keys()].filter((id) => !ids.has(id));
borrados.forEach((id) => console.log(`🗑️  ${id} ${viejos.get(id).nombre}`));

const aristasViejas = new Set(actual.aristas.map(([a, b]) => clave(a, b)));
const aristasNuevas = [...aristas].filter((k) => !aristasViejas.has(k));
const aristasBorradas = [...aristasViejas].filter((k) => !aristas.has(k));
if (aristasNuevas.length) console.log(`➕ caminos: ${aristasNuevas.map((k) => k.replace("|", "–")).join(", ")}`);
if (aristasBorradas.length) console.log(`🗑️  caminos: ${aristasBorradas.map((k) => k.replace("|", "–")).join(", ")}`);

// ---- avisos: puntos sueltos, grupos sin conexión, caminos muy largos
const porId = new Map(nodos.map((n) => [n.id, n]));
const vecinos = new Map(nodos.map((n) => [n.id, []]));
aristas.forEach((k) => { const [a, b] = k.split("|"); vecinos.get(a).push(b); vecinos.get(b).push(a); });
const grupo = new Map();
let grupos = 0;
for (const n of nodos) {
  if (grupo.has(n.id)) continue;
  grupos++;
  const pila = [n.id];
  while (pila.length) { const u = pila.pop(); if (grupo.has(u)) continue; grupo.set(u, grupos); vecinos.get(u).forEach((v) => pila.push(v)); }
}
const tam = new Map();
grupo.forEach((g) => tam.set(g, (tam.get(g) || 0) + 1));
const principal = [...tam.entries()].sort((a, b) => b[1] - a[1])[0][0];
const aislados = nodos.filter((n) => grupo.get(n.id) !== principal).map((n) => n.id);
if (aislados.length) console.log(`⚠️  ${aislados.length} punto(s) no conectados con el resto (la app no puede rutear hasta ellos): ${aislados.join(", ")}`);
aristas.forEach((k) => {
  const [a, b] = k.split("|").map((id) => porId.get(id));
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  if (d > 150) console.log(`⚠️  camino ${a.id}–${b.id} mide ${Math.round(d)} m en línea recta: ¿le faltan cruces intermedios?`);
});

console.log(`\nResumen: ${nodos.length} nodos (${nuevos} nuevos, ${movidos} movidos, ${editados} editados, ${borrados.length} borrados) · ${aristas.size} caminos (+${aristasNuevas.length} / -${aristasBorradas.length}).`);
if (seco) { console.log("--seco: no se escribió nada."); process.exit(0); }

// ---- escribir
const lineaNodo = (n) =>
  `    { id: "${n.id}", nombre: "${n.nombre}", categoria: "${n.categoria}", x: ${n.x.toFixed(2)}, z: ${n.z.toFixed(2)}, lat: ${n.lat.toFixed(7)}, lon: ${n.lon.toFixed(7)}, piso: "${n.piso}", desc: "${n.desc}"${n.escaleras ? ", escaleras: true" : ""} }`;
const pares = [...aristas].map((k) => k.split("|")).sort((p, q) => p[0].localeCompare(q[0]) || p[1].localeCompare(q[1]));
const lineasAristas = [];
for (let i = 0; i < pares.length; i += 5) lineasAristas.push("    " + pares.slice(i, i + 5).map(([a, b]) => `["${a}", "${b}"]`).join(", "));

const iNodos = texto.indexOf("  nodos: [");
const iAristas = texto.indexOf("\n  ],\n  aristas: [");
const iPoligonos = texto.indexOf("\n  ],\n  poligonos:");
if (iNodos < 0 || iAristas < iNodos || iPoligonos < iAristas) { console.error("No reconocí la estructura de campus_data.js (nodos / aristas / poligonos)."); process.exit(1); }
let salida =
  texto.slice(0, iNodos) +
  "  nodos: [\n" + nodos.map(lineaNodo).join(",\n") +
  "\n  ],\n  aristas: [\n" + lineasAristas.join(",\n") +
  texto.slice(iPoligonos);

// Comprobación: el archivo nuevo debe cargar y traer exactamente lo esperado
const w2 = {};
vm.runInNewContext(salida, { window: w2 });
const d2 = w2.ARGOS_CAMPUS_DATA;
if (d2.nodos.length !== nodos.length || d2.aristas.length !== aristas.size || !Array.isArray(d2.poligonos)) { console.error("El archivo generado no pasó la comprobación; no se escribió."); process.exit(1); }

fs.writeFileSync(rutaDatos + ".bak", crlf ? texto.replace(/\n/g, "\r\n") : texto, "utf8");
fs.writeFileSync(rutaDatos, crlf ? salida.replace(/\n/g, "\r\n") : salida, "utf8");
console.log(`OK: ${rutaDatos} actualizado (copia anterior en .bak).\nSiguiente: node tools/build_app.js, correr las pruebas, commit y push.`);
