// Uso: node prueba_ubicacion.js <carpeta app>
// Prueba "dónde estoy": cambiar de destino después de llegar o a media ruta, links de QR (?qr=N01),
// destino recordado y GPS simulado (ubicarse, corregir el avance, salirse de la ruta, llegar).
// Necesita puppeteer-core (instálalo en una carpeta temporal y corre este archivo desde ahí).
const http = require("http"), fs = require("fs"), path = require("path"), vm = require("vm");
const puppeteer = require("puppeteer-core");
const dir = process.argv[2];
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  fs.readFile(path.join(dir, f), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" }); r.end(d); } });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra !== undefined ? "  → " + extra : "")); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Datos del campus (para saber dónde está cada nodo y convertir metros ↔ lat/lon)
const w = {};
vm.runInNewContext(fs.readFileSync(path.join(dir, "campus_data.js"), "utf8"), { window: w });
const D = w.ARGOS_CAMPUS_DATA;
const N = Object.fromEntries(D.nodos.map((n) => [n.id, n]));
const R = 6378137, rad = Math.PI / 180;
const aLatLon = (x, z) => ({ latitude: D.origen.lat + z / R / rad, longitude: D.origen.lon + x / (R * Math.cos(D.origen.lat * rad)) / rad });
const entre = (a, b, t, lado = 0) => { // punto a la fracción t del pasillo a→b, desplazado "lado" metros a la derecha
  const dx = N[b].x - N[a].x, dz = N[b].z - N[a].z, L = Math.hypot(dx, dz);
  return { x: N[a].x + dx * t + (dz / L) * lado, z: N[a].z + dz * t - (dx / L) * lado };
};

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const origenWeb = `http://localhost:${srv.address().port}`;
  await b.defaultBrowserContext().overridePermissions(origenWeb, ["geolocation"]);

  async function abrir(query = "", limpiar = true) {
    const p = await b.newPage();
    await p.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true });
    p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
    if (limpiar) await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem("__limpio")) { localStorage.clear(); sessionStorage.setItem("__limpio", "1"); } });
    await p.goto(origenWeb + "/index.html" + query, { waitUntil: "load" });
    await espera(300);
    return p;
  }
  const elegir = (p, id, valor) => p.evaluate((i, v) => { const s = document.getElementById(i); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, id, valor);
  const dbg = (p) => p.evaluate(() => window.ARGOS_DEBUG());
  const clic = (p, id) => p.evaluate((i) => document.getElementById(i).click(), id);
  const badge = (p) => p.evaluate(() => document.getElementById("locationModeBadge").textContent);
  const gps = async (p, punto, precision = 6) => { await p.setGeolocation({ ...aLatLon(punto.x, punto.z), accuracy: precision }); await espera(350); };

  // ---- A. El caso de Andrick: llegar al Cubo y pedir ir al Salón C ----
  let p = await abrir();
  await elegir(p, "selectOrigen", "N07"); await elegir(p, "selectDestino", "N10");
  let d = await dbg(p);
  ok(d.ruta.join(">") === "N07>N10", "A1 ruta Salón C → El Cubo", d.ruta.join(">"));
  await clic(p, "btnNextNode"); // llegó al Cubo
  await elegir(p, "selectDestino", "N07");
  d = await dbg(p);
  ok(d.origen === "N10" && d.ruta.join(">") === "N10>N07", "A2 al llegar al Cubo y pedir Salón C, la ruta sale DEL CUBO", `origen ${d.origen}, ruta ${d.ruta.join(">")}`);
  ok(Math.hypot(d.x - N.N10.x, d.z - N.N10.z) < 0.5, "A3 el usuario sigue parado en El Cubo (no brinca al Salón)", `${d.x.toFixed(1)}, ${d.z.toFixed(1)}`);
  ok(await p.evaluate(() => document.getElementById("selectOrigen").value) === "N10", "A4 la lista 'Estoy en' muestra El Cubo");
  ok(p.errs.length === 0, "A5 sin errores JS", p.errs.join(" | "));
  await p.close();

  // ---- B. Cambiar de destino a media ruta: se sigue desde donde vas ----
  p = await abrir();
  await elegir(p, "selectOrigen", "N01"); await elegir(p, "selectDestino", "N07");
  await clic(p, "btnDemo"); await espera(9000); await clic(p, "btnDemo"); await espera(900);
  let antes = await dbg(p);
  ok(antes.indice === 0 && antes.progreso > 0.1 && antes.progreso < 0.5, "B1 la demo avanzó unos metros por el primer pasillo", `${(antes.progreso * 100).toFixed(0)} %`);
  await elegir(p, "selectDestino", "N10");
  d = await dbg(p);
  ok(Math.hypot(d.x - antes.x, d.z - antes.z) < 0.3, "B2 al cambiar destino a media ruta NO regresa al origen", `se movió ${Math.hypot(d.x - antes.x, d.z - antes.z).toFixed(2)} m`);
  ok(d.ruta[0] === "📍" && d.ruta[d.ruta.length - 1] === "N10", "B3 la ruta nueva sale de 'Tu ubicación'", d.ruta.join(">"));
  await elegir(p, "selectDestino", "N02"); // otra vez, todavía sobre el mismo pasillo
  d = await dbg(p);
  ok(Math.hypot(d.x - antes.x, d.z - antes.z) < 0.3 && d.ruta[d.ruta.length - 1] === "N02", "B4 un segundo cambio de destino tampoco te mueve", d.ruta.join(">"));
  ok(p.errs.length === 0, "B5 sin errores JS", p.errs.join(" | "));
  await p.close();

  // ---- C. Origen = destino: ya no cambia el destino solo ----
  p = await abrir();
  await elegir(p, "selectOrigen", "N01"); await elegir(p, "selectDestino", "N07");
  await elegir(p, "selectOrigen", "N07");
  d = await dbg(p);
  ok(d.destino === "N07" && d.ruta.join(">") === "N07", "C1 ubicarte en tu destino = llegaste (antes te mandaba al Cubo)", `destino ${d.destino}, ruta ${d.ruta.join(">")}`);
  ok(/Llegaste/.test(await p.evaluate(() => document.getElementById("hudInstruction").textContent)), "C2 el letrero dice que llegaste");
  await p.close();

  // ---- D. Link de QR y destino recordado ----
  p = await abrir("?qr=N01&a=N07");
  d = await dbg(p);
  ok(d.origen === "N01" && d.destino === "N07" && d.ruta[0] === "N01", "D1 ?qr=N01&a=N07 abre ubicado en Puerta 3 rumbo al Salón C", d.ruta.join(">"));
  ok(/QR: N01/.test(await badge(p)), "D2 avisa que te ubicó por QR", await badge(p));
  await elegir(p, "selectDestino", "N15");
  await p.close();
  p = await abrir("?qr=N60", false); // mismo celular, otro QR: el destino se conserva
  d = await dbg(p);
  ok(d.origen === "N60" && d.destino === "N15", "D3 al abrir otro QR se conserva el destino elegido", `origen ${d.origen}, destino ${d.destino}`);
  await p.close();
  p = await abrir("?qr=N99"); // QR que no existe
  d = await dbg(p);
  ok(d.origen === "N07" && p.errs.length === 0, "D4 un QR desconocido no rompe nada", d.origen);
  await p.close();

  // ---- E. GPS simulado ----
  p = await abrir();
  await elegir(p, "selectOrigen", "N01"); await elegir(p, "selectDestino", "N07");
  await p.setGeolocation({ ...aLatLon(entre("N60", "N61", 0.5, 5).x, entre("N60", "N61", 0.5, 5).z), accuracy: 6 });
  await clic(p, "btnToggleGps"); await espera(900);
  d = await dbg(p);
  const medio = entre("N60", "N61", 0.5);
  ok(d.punto && [d.punto.a, d.punto.b].sort().join() === "N60,N61", "E1 el GPS te coloca sobre el pasillo más cercano (N60–N61)", JSON.stringify(d.punto && [d.punto.a, d.punto.b]));
  ok(Math.hypot(d.x - medio.x, d.z - medio.z) < 1, "E2 a 5 m del pasillo, quedas pegado al pasillo", `${Math.hypot(d.x - medio.x, d.z - medio.z).toFixed(1)} m`);
  ok(d.ruta.join(">") === "📍>N61>N07", "E3 la ruta sigue desde ahí", d.ruta.join(">"));

  // avanzar con puro GPS: 30 m adelante sobre N61→N07
  const adelante = entre("N61", "N07", 30 / Math.hypot(N.N07.x - N.N61.x, N.N07.z - N.N61.z), -4);
  for (let i = 0; i < 8; i++) { await gps(p, { x: adelante.x + (i % 2 ? 0.4 : -0.4), z: adelante.z }); await espera(500); } // ~1 lectura por segundo
  await espera(2500);
  d = await dbg(p);
  const dReal = Math.hypot(d.x - adelante.x, d.z - adelante.z);
  ok(d.ruta[d.indice] === "N61" && dReal < 9, "E4 al moverse el GPS, la app avanza sobre la ruta (dentro del margen del GPS)", `quedó a ${dReal.toFixed(1)} m de la lectura`);

  // temblor del GPS (±2 m) estando quieto: no debe mover al usuario
  await espera(2500); antes = await dbg(p);
  for (let i = 0; i < 6; i++) await gps(p, { x: adelante.x + (i % 2 ? 2 : -2), z: adelante.z + (i % 3 ? -1.5 : 1.5) });
  await espera(1200);
  d = await dbg(p);
  ok(Math.hypot(d.x - antes.x, d.z - antes.z) < 2.5, "E5 con el temblor normal del GPS (±2 m) la app se acomoda menos de 2.5 m, sin brincar", `${Math.hypot(d.x - antes.x, d.z - antes.z).toFixed(2)} m`);

  // salirse de la ruta: caminar hacia el Cubo (N10) en vez del Salón C
  const fuera = entre("N10", "N11", 0.6, 0);
  for (let i = 0; i < 5; i++) await gps(p, { x: fuera.x + i * 0.4, z: fuera.z });
  await espera(600);
  d = await dbg(p);
  ok(d.punto && [d.punto.a, d.punto.b].sort().join() === "N10,N11" && d.ruta[d.ruta.length - 1] === "N07", "E6 al salirte de la ruta, se recalcula desde donde estás", d.ruta.join(">"));

  // llegar: el GPS te pone en el Salón C
  await gps(p, { x: N.N07.x + 1, z: N.N07.z - 1 }); await gps(p, { x: N.N07.x, z: N.N07.z });
  for (let i = 0; i < 4 && (await dbg(p)).indice < (await dbg(p)).ruta.length - 1; i++) { await gps(p, { x: N.N07.x + 0.3 * i, z: N.N07.z }); await espera(900); }
  await espera(6000);
  d = await dbg(p);
  ok(d.indice === d.ruta.length - 1, "E7 con el GPS en el Salón C, la app marca la llegada", `índice ${d.indice}/${d.ruta.length - 1}, cola ${d.cola.toFixed(1)}`);

  // GPS muy impreciso: se ignora
  await elegir(p, "selectDestino", "N01");
  antes = await dbg(p);
  await gps(p, entre("N03", "N60", 0.5), 80); await espera(500);
  d = await dbg(p);
  ok(Math.hypot(d.x - antes.x, d.z - antes.z) < 0.3 && /impreciso/.test(await badge(p)), "E8 una lectura de ±80 m se ignora y se avisa", await badge(p));
  ok(p.errs.length === 0, "E9 sin errores JS", p.errs.join(" | "));
  await p.close();

  await b.close(); srv.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
