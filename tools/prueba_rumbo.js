// Uso: node prueba.js <carpeta app>
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const dir = process.argv[2];
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  fs.readFile(path.join(dir, f), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : f.endsWith(".css") ? "text/css" : "application/octet-stream" }); r.end(d); } });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra ? "  → " + extra : "")); };

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const url = `http://localhost:${srv.address().port}/index.html`;

  async function nueva(origen, destino) {
    const p = await b.newPage();
    await p.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(url, { waitUntil: "load" });
    await p.evaluate((o, d) => {
      const so = document.getElementById("selectOrigen"), sd = document.getElementById("selectDestino");
      so.value = o; so.dispatchEvent(new Event("change", { bubbles: true }));
      sd.value = d; sd.dispatchEvent(new Event("change", { bubbles: true }));
      // tipo: "rel" (giroscopio), "abs" (Android con Norte), "ios" (con webkitCompassHeading)
      window.__ev = (tipo, rumboReal, brujula) => {
        const e = new Event(tipo === "abs" ? "deviceorientationabsolute" : "deviceorientation");
        const def = (k, v) => Object.defineProperty(e, k, { value: v });
        def("alpha", (((tipo === "abs" ? 360 - rumboReal : 137 - rumboReal) % 360) + 360) % 360); def("beta", 70); def("gamma", 0);
        def("absolute", tipo === "abs");
        if (tipo === "ios") { def("webkitCompassHeading", brujula); def("webkitCompassAccuracy", 10); }
        window.dispatchEvent(e);
      };
      // Gira despacio (0.2° por lectura: lo que el código viejo tiraba a la basura)
      window.__girar = (tipos, desde, hasta, brujulaFn) => {
        const n = Math.round(Math.abs(hasta - desde) / 0.2), s = Math.sign(hasta - desde) * 0.2;
        for (let i = 0; i <= n; i++) { const r = desde + s * i; for (const t of tipos) window.__ev(t, r, brujulaFn ? brujulaFn(r) : r); }
      };
    }, origen, destino);
    p.errs = errs;
    return p;
  }
  const leer = async (p) => { await new Promise((r) => setTimeout(r, 250)); return p.evaluate(() => ({
    rumbo: document.getElementById("arHeadingText").textContent, titulo: document.getElementById("arSignTitle").textContent,
    boton: document.getElementById("btnAlignArrows").textContent, badge: (document.getElementById("locationModeBadge") || {}).textContent })); };
  const mod = (x) => ((x % 360) + 360) % 360;

  // ---- A. Android SOLO giroscopio (el caso del bug: giro lento) ----
  let p = await nueva("N01", "N07");
  let t = await leer(p);
  ok(/Centrar flechas/.test(t.boton), "A0 botón dice Centrar flechas", t.boton);
  await p.evaluate(() => window.__girar(["rel"], 200, 200)); // primera lectura
  await p.click("#btnAlignArrows"); t = await leer(p);
  ok(/De frente/.test(t.rumbo), "A1 tras centrar: de frente", t.rumbo + " | " + t.badge);
  await p.evaluate(() => window.__girar(["rel"], 200, 290)); t = await leer(p);
  ok(/Gira 9[0-1]° a la izquierda/.test(t.rumbo), "A2 giro LENTO 90° a la derecha → camino queda a la izquierda (flechas fijas)", t.rumbo);
  await p.evaluate(() => window.__girar(["rel"], 290, 380)); t = await leer(p);
  ok(/media vuelta/.test(t.titulo), "A3 giro 180° → da media vuelta", t.titulo);
  await p.evaluate(() => window.__girar(["rel"], 380, 200)); t = await leer(p);
  ok(/De frente/.test(t.rumbo), "A4 regreso al rumbo original → de frente otra vez", t.rumbo);
  // temblor de mano: ±0.3° 200 veces no debe mover nada
  await p.evaluate(() => { for (let i = 0; i < 200; i++) window.__ev("rel", 200 + (i % 2 ? 0.3 : -0.3)); window.__ev("rel", 200); }); t = await leer(p);
  ok(/De frente/.test(t.rumbo), "A5 temblor de mano no mueve las flechas", t.rumbo);
  ok(p.errs.length === 0, "A6 sin errores JS", p.errs.join(" | "));
  await p.close();

  // ---- B. iPhone: brújula automática. Tramo N01→N03 va al Este (≈90°) ----
  p = await nueva("N01", "N07");
  await p.evaluate(() => window.__girar(["ios"], 0, 0, (r) => (r + 356) % 360)); t = await leer(p);
  ok(/Gira (8[5-9]|9[0-6])° a la derecha/.test(t.rumbo), "B1 mirando al Norte: camino (Este) a la derecha, sin centrar", t.rumbo);
  await p.evaluate(() => window.__girar(["ios"], 0, 90, (r) => (r + 356) % 360)); t = await leer(p);
  ok(/De frente/.test(t.rumbo), "B2 girar al Este → de frente", t.rumbo);
  // Brújula mala (fierros: marca 40° de más). El usuario mira al Este de verdad y centra.
  await p.evaluate(() => { for (let i = 0; i < 300; i++) window.__ev("ios", 90, 130); }); t = await leer(p);
  ok(/Gira/.test(t.rumbo), "B3 brújula con error de 40° desvía las flechas (esperado antes de centrar)", t.rumbo);
  await p.evaluate(() => window.__girar(["ios"], 90, 0, (r) => (r + 356) % 360)); t = await leer(p);
  const antes = t.rumbo;
  const oculto = await p.evaluate(() => getComputedStyle(document.getElementById("btnAlignArrows")).display === "none");
  ok(oculto, "B4 con brújula el botón Centrar flechas está oculto");
  await p.evaluate(() => document.getElementById("btnAlignArrows").click()); t = await leer(p);
  ok(/Gira (8[5-9]|9[0-6])° a la derecha/.test(t.rumbo) && t.rumbo === antes, "B5 con brújula, un toque al botón NO mueve las flechas", antes + " == " + t.rumbo);
  ok(p.errs.length === 0, "B6 sin errores JS", p.errs.join(" | "));
  await p.close();

  // ---- C. Android con ambos eventos (rel + abs) y sólo abs ----
  p = await nueva("N01", "N07");
  await p.evaluate(() => window.__girar(["rel", "abs"], 86, 86)); t = await leer(p);
  ok(/De frente/.test(t.rumbo), "C1 Android mirando al Este → de frente", t.rumbo);
  await p.evaluate(() => window.__girar(["rel", "abs"], 86, 176)); t = await leer(p);
  ok(/Gira (8[5-9]|9[0-6])° a la izquierda/.test(t.rumbo), "C2 rel+abs: giro 90° se cuenta UNA vez", t.rumbo);
  await p.close();
  p = await nueva("N01", "N07");
  await p.evaluate(() => window.__girar(["abs"], 86, 86));
  await p.evaluate(() => window.__girar(["abs"], 86, 176)); t = await leer(p);
  ok(/Gira (8[5-9]|9[0-6])° a la izquierda/.test(t.rumbo), "C3 sólo abs: giro 90°", t.rumbo);
  await p.evaluate(() => document.getElementById("btnAlignArrows").click()); t = await leer(p);
  ok(/Gira (8[5-9]|9[0-6])° a la izquierda/.test(t.rumbo), "C4 Android con brújula: el toque NO mueve las flechas", t.rumbo);
  await p.close();

  // ---- D. Rutas pedidas ----
  for (const [o, d] of [["N01", "N07"], ["N07", "N10"], ["N07", "N09"]]) {
    p = await nueva(o, d);
    const r = await p.evaluate(() => [...document.querySelectorAll("li")].map((l) => l.innerText.replace(/\s+/g, " ").trim()).filter((x) => /N\d\d/.test(x)).slice(0, 8).join("  >  ") + " || " + (document.getElementById("hudInstruction") || {}).textContent);
    console.log(`RUTA ${o}→${d}: ${r}`);
    ok(p.errs.length === 0, `D ${o}→${d} sin errores JS`, p.errs.join(" | "));
    await p.close();
  }
  await b.close(); srv.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
