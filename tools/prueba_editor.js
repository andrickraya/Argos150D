// Uso: node prueba_editor.js <carpeta app> <ruta a tools/aplicar_mapa.js> [captura.png]
// Prueba el editor de caminos (app/editor.html): trazar un camino, partir una línea, lugar nuevo,
// mover, borrar, deshacer, ruta de prueba y que el archivo exportado se aplique bien a campus_data.js.
// Necesita puppeteer-core (instálalo en una carpeta temporal y corre este archivo desde ahí).
const http = require("http"), fs = require("fs"), path = require("path"), os = require("os"), vm = require("vm");
const { execFileSync } = require("child_process");
const puppeteer = require("puppeteer-core");
const dir = process.argv[2], rutaAplicar = process.argv[3], captura = process.argv[4];
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png" };
const srv = http.createServer((q, r) => {
  const f = decodeURIComponent(q.url.split("?")[0]);
  fs.readFile(path.join(dir, f), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": tipos[path.extname(f)] || "application/octet-stream" }); r.end(d); } });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra !== undefined ? "  → " + extra : "")); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new" });
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  let avisos = 0; p.on("dialog", (d) => { avisos++; d.type() === "prompt" ? d.accept("Cafetería Prueba") : d.accept(); });
  // domcontentloaded: no esperar a que bajen las fotos satelitales (dependen de la red)
  await p.goto(`http://localhost:${srv.address().port}/editor.html`, { waitUntil: "domcontentloaded" });
  await espera(600);

  const est = () => p.evaluate(() => window.ARGOS_EDITOR.estado());
  const modo = (m) => p.click(`[data-modo="${m}"]`);
  // Posición en pantalla de un nodo o de un punto lat/lon
  const pantalla = (lat, lon) => p.evaluate((la, lo) => { const m = window.ARGOS_EDITOR.mapa; const q = m.latLngToContainerPoint([la, lo]); const r = m.getContainer().getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, lat, lon);
  const datos = () => p.evaluate(() => JSON.parse(window.ARGOS_EDITOR.texto()));
  const nodo = async (id) => (await datos()).nodos.find((n) => n.id === id);
  const clicEn = async (lat, lon) => { const q = await pantalla(lat, lon); await p.mouse.click(q.x, q.y); await espera(120); };
  const clicNodo = async (id) => { const n = await nodo(id); await clicEn(n.lat, n.lon); };

  let e = await est();
  const n0 = e.nodos, a0 = e.aristas;
  ok(n0 >= 49 && a0 >= 60 && e.cambios.total === 0, "1 carga el mapa publicado sin cambios", `${n0} puntos, ${a0} caminos`);

  // Acercar a la zona de la Explanada para tener precisión al hacer clic
  await p.evaluate(() => window.ARGOS_EDITOR.mapa.setView([19.37115, -99.26345], 19.5, { animate: false }));
  await espera(500);

  // 2. Trazar: de la Explanada (N61) → dos cruces nuevos → El Cubo (N10)
  const idsAntes = new Set((await datos()).nodos.map((n) => n.id)); // el mapa publicado ya puede traer cruces
  await modo("trazar");
  await clicNodo("N61");
  await clicEn(19.37108, -99.26355);
  await clicEn(19.37118, -99.26348);
  await clicNodo("N10");
  await p.keyboard.press("Escape");
  e = await est();
  ok(e.nodos === n0 + 2 && e.aristas === a0 + 3 && e.pendiente === null, "2 trazar un camino crea 2 cruces y 3 tramos", `${e.nodos} puntos, ${e.aristas} caminos`);
  let d = await datos();
  const cruces = d.nodos.filter((n) => !idsAntes.has(n.id)).map((n) => n.id);
  ok(cruces.length === 2 && cruces.every((id) => Number(id.slice(1)) >= 65) && d.nodos.filter((n) => cruces.includes(n.id)).every((n) => n.categoria === "Cruce"),
    "3 los cruces nuevos usan ids libres desde N65", cruces.join(", "));

  // 4. Ruta de prueba: ahora Explanada → El Cubo va directo por el camino nuevo
  await p.select("#rutaDe", "N61"); await p.select("#rutaA", "N10");
  const txtRuta = await p.$eval("#rutaTexto", (x) => x.textContent);
  ok(new RegExp(`N61 → ${cruces[0]} → ${cruces[1]} → N10`).test(txtRuta), "4 la ruta de prueba usa el camino recién trazado", txtRuta);

  // 5. Partir una línea: tocar a media arista crea un cruce ahí
  await modo("trazar");
  const c0 = await nodo(cruces[0]), c1 = await nodo(cruces[1]);
  await clicEn((c0.lat + c1.lat) / 2, (c0.lon + c1.lon) / 2);
  await p.keyboard.press("Escape");
  e = await est();
  ok(e.nodos === n0 + 3 && e.aristas === a0 + 4, "5 tocar una línea la parte en dos", `${e.nodos} puntos, ${e.aristas} caminos`);

  // 6. Deshacer regresa un paso
  await p.click("#btnDeshacer");
  e = await est();
  ok(e.nodos === n0 + 2 && e.aristas === a0 + 3, "6 deshacer quita el último cambio", `${e.nodos} puntos, ${e.aristas} caminos`);

  // 7. Lugar nuevo con nombre
  // Se toca un hueco del mapa: el punto de la vista más alejado de todo punto y camino existente
  d = await datos();
  const porId = Object.fromEntries(d.nodos.map((n) => [n.id, n]));
  const ocupados = d.nodos.map((n) => [n.lat, n.lon]);
  d.aristas.forEach(([a, b]) => { for (let i = 1; i < 8; i++) ocupados.push([porId[a].lat + (porId[b].lat - porId[a].lat) * i / 8, porId[a].lon + (porId[b].lon - porId[a].lon) * i / 8]); });
  let hueco = null, mejorHueco = -1;
  for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) {
    const lat = 19.37115 + i * 0.00004, lon = -99.26345 + j * 0.00004;
    const cerca = Math.min(...ocupados.map(([la, lo]) => Math.hypot(la - lat, lo - lon)));
    if (cerca > mejorHueco) { mejorHueco = cerca; hueco = { lat, lon }; }
  }
  await modo("lugar");
  await clicEn(hueco.lat, hueco.lon);
  e = await est();
  d = await datos();
  const lugar = d.nodos.find((n) => n.nombre === "Cafetería Prueba");
  ok(!!lugar && e.modo === "mover" && e.elegido === lugar.id, "7 'Lugar nuevo' pide nombre y deja el punto listo para editar", lugar && lugar.id);

  // 8. Editar: tipo y escaleras desde el panel
  await p.select("#puntoTipo", "Cafetería");
  await p.click("#puntoEscaleras");
  d = await datos();
  const lugar2 = d.nodos.find((n) => n.id === lugar.id);
  ok(lugar2.categoria === "Cafetería" && lugar2.escaleras === true, "8 el panel cambia tipo y escaleras");

  // 9. Mover arrastrando
  await p.keyboard.press("Escape");
  const antes = await nodo("N64");
  const desde = await pantalla(antes.lat, antes.lon);
  await p.mouse.move(desde.x, desde.y); await p.mouse.down(); await p.mouse.move(desde.x + 20, desde.y + 10, { steps: 6 }); await p.mouse.up(); await espera(200);
  const despues = await nodo("N64");
  ok(Math.abs(despues.lon - antes.lon) > 1e-6 && Math.abs(despues.lat - antes.lat) > 1e-6, "9 arrastrar un punto lo mueve", `${antes.lat},${antes.lon} → ${despues.lat},${despues.lon}`);

  // 10. Borrar un camino
  await p.keyboard.press("Escape");
  await modo("borrar");
  // Se borra el único camino de un punto del mapa publicado (el que tenga uno solo): debe quedar "sin camino"
  d = await datos();
  const grado = {};
  d.aristas.forEach(([a, b]) => { grado[a] = (grado[a] || 0) + 1; grado[b] = (grado[b] || 0) + 1; });
  const [hojaA, hojaB] = d.aristas.find(([a, b]) => [a, b].some((id) => grado[id] === 1 && idsAntes.has(id) && id !== "N64"));
  const hoja = grado[hojaA] === 1 ? hojaA : hojaB;
  const nA = await nodo(hojaA), nB = await nodo(hojaB);
  await p.evaluate((la, lo) => window.ARGOS_EDITOR.mapa.setView([la, lo], 20.5, { animate: false }), (nA.lat + nB.lat) / 2, (nA.lon + nB.lon) / 2);
  await espera(400);
  await clicEn((nA.lat + nB.lat) / 2, (nA.lon + nB.lon) / 2);
  e = await est();
  ok(e.aristas === a0 + 2 && e.cambios.caminosBorrados === 1, "10 borrar quita el camino tocado", `${hojaA}–${hojaB} ${JSON.stringify(e.cambios)}`);
  const aviso = await p.$eval("#avisos", (x) => x.textContent);
  ok(/sin camino/.test(aviso) && aviso.includes(hoja), "11 avisa de los puntos que quedaron sin camino", aviso);

  if (captura) { await modo("mover"); await espera(1500); await p.screenshot({ path: captura }); }

  // 12. Lo guardado sobrevive a recargar la página
  const texto = await p.evaluate(() => window.ARGOS_EDITOR.texto());
  await p.reload({ waitUntil: "domcontentloaded" }); await espera(500);
  e = await est();
  ok(e.nodos === n0 + 3 && e.cambios.total > 0, "12 al recargar la página siguen tus cambios", JSON.stringify(e.cambios));

  // 13. El archivo exportado se aplica a una COPIA de campus_data.js
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "argos-editor-"));
  const copia = path.join(tmp, "campus_data.js"), archivo = path.join(tmp, "argos_mapa.json");
  fs.copyFileSync(path.join(dir, "campus_data.js"), copia);
  fs.writeFileSync(archivo, texto, "utf8");
  const salida = execFileSync(process.execPath, [rutaAplicar, archivo, "--datos", copia], { encoding: "utf8" });
  const w = {}; vm.runInNewContext(fs.readFileSync(copia, "utf8"), { window: w });
  const D = w.ARGOS_CAMPUS_DATA;
  const nuevoLugar = D.nodos.find((n) => n.nombre === "Cafetería Prueba");
  ok(D.nodos.length === n0 + 3 && D.aristas.length === a0 + 2 && nuevoLugar && nuevoLugar.escaleras === true && Number.isFinite(nuevoLugar.x), "13 aplicar_mapa.js escribe los puntos y caminos nuevos", salida.split("\n").filter((l) => /Resumen/.test(l)).join(""));
  const n01a = D.nodos.find((n) => n.id === "N01");
  const w0 = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, "campus_data.js"), "utf8"), { window: w0 });
  const n01b = w0.ARGOS_CAMPUS_DATA.nodos.find((n) => n.id === "N01");
  ok(n01a.x === n01b.x && n01a.z === n01b.z && n01a.desc === n01b.desc && D.poligonos.length === w0.ARGOS_CAMPUS_DATA.poligonos.length, "14 lo que no tocaste queda idéntico (N01, polígonos)");
  ok(/no conectados/.test(salida) && salida.includes(hoja), "15 aplicar_mapa.js también avisa de puntos sin conexión");
  ok(errs.length === 0, "16 sin errores JS en el editor", errs.join(" | "));

  await b.close(); srv.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
