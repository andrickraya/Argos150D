// Aplica los pines GPS medidos en campo (CSV de "📤 Enviar resultados" en la app) a los datos del campus.
//
// Uso (desde la raíz del repo):
//   node tools/aplicar_pines.js pines.csv --seco          -> solo muestra qué cambiaría (no escribe nada)
//   node tools/aplicar_pines.js pines.csv                 -> actualiza app/campus_data.js
//   node tools/aplicar_pines.js pines.csv --unity "<ruta>/Assets/campus/campus_pois.json" --csv "<ruta>/lugares_propios.csv"
//   después:  node tools/build_app.js   (regenera index.html y ar.html)
//
// El CSV trae: nombre,lat,lon,tipo,id,precision_m,fuente. Solo se aplican las filas con fuente=gps.
// x/z se recalculan con la misma proyección que app.js (latLonAMetros) y osm_a_unity.py.
// --unity y --csv dejan una copia .bak antes de escribir (esa carpeta no tiene git).
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const seco = args.includes("--seco");
const rutaPines = args.find((a, i) => !a.startsWith("--") && !["--unity", "--csv"].includes(args[i - 1]));
if (!rutaPines) { console.error("Falta el CSV de pines. Uso: node tools/aplicar_pines.js pines.csv [--seco] [--unity ruta] [--csv ruta]"); process.exit(1); }

const leer = (f) => fs.readFileSync(f, "utf8").replace(/^﻿/, "");
const R = 6378137.0;
const rutaDatos = path.join(__dirname, "..", "app", "campus_data.js");
let datosTxt = leer(rutaDatos);
const mo = datosTxt.match(/origen:\s*\{\s*lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)/);
if (!mo) throw new Error("No encontré 'origen' en campus_data.js");
const LAT0 = +mo[1], LON0 = +mo[2];
const aMetros = (lat, lon) => {
  const r = Math.PI / 180;
  return { x: R * (lon - LON0) * r * Math.cos(LAT0 * r), z: R * (lat - LAT0) * r };
};

// --- leer pines (el nombre va primero y podría traer comas: se toman las 6 columnas del final)
const pines = [];
leer(rutaPines).split(/\r?\n/).slice(1).forEach((linea, i) => {
  if (!linea.trim()) return;
  const c = linea.split(",");
  if (c.length < 7) { console.warn(`Línea ${i + 2} ignorada (columnas incompletas): ${linea}`); return; }
  const [lat, lon, , id, prec, fuente] = c.slice(-6).map((s) => s.trim());
  const nombre = c.slice(0, -6).join(",").trim();
  if (fuente !== "gps") return;
  if (!/^N\d{2}$/.test(id) || !Number.isFinite(+lat) || !Number.isFinite(+lon)) {
    console.warn(`Línea ${i + 2} ignorada (id o coordenadas inválidas): ${linea}`); return;
  }
  pines.push({ id, nombre, lat: +lat, lon: +lon, prec: prec === "" ? null : +prec });
});
if (!pines.length) { console.log("El CSV no trae ningún pin con fuente=gps. Nada que hacer."); process.exit(0); }

// --- web: app/campus_data.js (una línea por nodo: { id: "N01", ..., x: , z: , lat: , lon: , ... })
const cambios = [];
for (const p of pines) {
  const re = new RegExp(`(\\{ id: "${p.id}",[^\\n]*?x: )(-?[\\d.]+)(, z: )(-?[\\d.]+)(, lat: )(-?[\\d.]+)(, lon: )(-?[\\d.]+)`);
  const m = datosTxt.match(re);
  if (!m) { console.warn(`⚠️  ${p.id} no está en campus_data.js; lo salto.`); continue; }
  const { x, z } = aMetros(p.lat, p.lon);
  const movido = Math.hypot(x - +m[2], z - +m[4]);
  cambios.push({ ...p, x, z, movido });
  datosTxt = datosTxt.replace(re, `$1${x.toFixed(2)}$3${z.toFixed(2)}$5${p.lat.toFixed(7)}$7${p.lon.toFixed(7)}`);
}

console.log("id   | nombre                              | precisión | se mueve | nuevo x, z");
for (const c of cambios) {
  const aviso = (c.prec !== null && c.prec > 10 ? "  ⚠️ GPS impreciso" : "") + (c.movido > 60 ? "  ⚠️ se mueve mucho, revisar" : "");
  console.log(`${c.id}  | ${c.nombre.padEnd(35).slice(0, 35)} | ±${String(c.prec ?? "?").padStart(3)} m    | ${c.movido.toFixed(1).padStart(6)} m | ${c.x.toFixed(2)}, ${c.z.toFixed(2)}${aviso}`);
}
if (seco) { console.log("\n--seco: no se escribió nada."); process.exit(0); }

fs.writeFileSync(rutaDatos, datosTxt, "utf8");
console.log(`\nOK: app/campus_data.js actualizado (${cambios.length} nodos).`);

// --- Unity: Assets/campus/campus_pois.json (entradas "argos_N01"...), sin reformatear el archivo
const rutaUnity = opcion("--unity");
if (rutaUnity) {
  let txt = fs.readFileSync(rutaUnity, "utf8");
  fs.writeFileSync(rutaUnity + ".bak", txt, "utf8");
  let n = 0;
  for (const c of cambios) {
    const idsUnity = c.id === "N01" ? [`argos_${c.id}`, "w1354446212"] : [`argos_${c.id}`];
    for (const idU of idsUnity) {
      const ini = txt.search(new RegExp(`"id"\\s*:\\s*"${idU}"`));
      if (ini < 0) { if (idU.startsWith("argos_")) console.warn(`⚠️  ${idU} no está en campus_pois.json`); continue; }
      const fin = txt.indexOf("}", ini);
      const obj = txt.slice(ini, fin)
        .replace(/("x"\s*:\s*)-?[\d.]+/, `$1${c.x.toFixed(2)}`)
        .replace(/("z"\s*:\s*)-?[\d.]+/, `$1${c.z.toFixed(2)}`);
      txt = txt.slice(0, ini) + obj + txt.slice(fin);
    }
    n++;
  }
  JSON.parse(txt.replace(/^﻿/, "")); // si quedó mal formado, truena aquí antes de escribir
  fs.writeFileSync(rutaUnity, txt, "utf8");
  console.log(`OK: ${rutaUnity} actualizado (${n} lugares; copia en .bak).`);
}

// --- CSV fuente: proyecto/tools/lugares_propios.csv (nombre,lat,lon,tipo), se empata por nombre
const rutaCsv = opcion("--csv");
if (rutaCsv) {
  const orig = leer(rutaCsv);
  fs.writeFileSync(rutaCsv + ".bak", orig, "utf8");
  const porNombre = new Map(cambios.map((c) => [c.nombre, c]));
  let n = 0;
  const salida = orig.split(/\r?\n/).map((linea, i) => {
    if (i === 0 || !linea.trim()) return linea;
    const c = linea.split(",");
    const nombre = c.slice(0, -3).join(",");
    const p = porNombre.get(nombre);
    if (!p) return linea;
    n++;
    return `${nombre},${p.lat.toFixed(7)},${p.lon.toFixed(7)},${c[c.length - 1]}`;
  });
  fs.writeFileSync(rutaCsv, salida.join("\n"), "utf8");
  console.log(`OK: ${rutaCsv} actualizado (${n} filas; copia en .bak).`);
}
console.log("\nSiguiente: node tools/build_app.js  y luego probar, commit y push.");
