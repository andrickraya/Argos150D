// Uso: node prueba_lugares.js <carpeta app>   → prueba dar de alta un lugar nuevo con GPS simulado
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const dir = process.argv[2];
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  fs.readFile(path.join(dir, f), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : f.endsWith(".css") ? "text/css" : "application/octet-stream" }); r.end(d); } });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra ? "  → " + extra : "")); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const origen = `http://localhost:${srv.address().port}`;
  await b.defaultBrowserContext().overridePermissions(origen, ["geolocation"]);
  const p = await b.newPage();
  await p.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true });
  const nombres = ["Salón Prueba", "Cafetería Prueba"];
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  p.on("dialog", (d) => d.type() === "prompt" ? d.accept(nombres.shift() || "Otro Lugar") : d.accept());
  await p.setGeolocation({ latitude: 19.3716, longitude: -99.2631, accuracy: 4 }); // ~30 m al este del Salón C
  await p.goto(origen + "/index.html", { waitUntil: "load" });

  const opciones = () => p.evaluate(() => [...document.getElementById("selectPin").options].map((o) => o.value));
  let ops = await opciones();
  ok(ops.includes("N21") && ops.includes("N43") && !ops.includes("NUEVO:Edificio A") && ops.includes("NUEVO:?"), "1 los Edificios A–W ya vienen como N21–N43 y se ofrece 'Lugar nuevo'", ops.filter((o) => o.startsWith("NUEVO")).length + " opciones nuevas");

  async function darDeAlta(valor) {
    await p.evaluate((v) => { document.getElementById("selectPin").value = v; document.getElementById("btnGuardarPin").click(); }, valor);
    await espera(2500);
    const nav = p.waitForNavigation({ waitUntil: "load" });
    await p.evaluate(() => document.getElementById("btnGuardarPin").click()); // "Terminar ya"
    await nav; await espera(400);
  }
  await darDeAlta("NUEVO:?");
  let dest = await p.evaluate(() => [...document.getElementById("selectDestino").options].map((o) => o.value + " " + o.textContent));
  ok(dest.some((d) => /N45.*Salón Prueba/.test(d)), "2 el lugar nuevo quedó como N45 y aparece como destino", dest.filter((d) => /N4[4-9]/.test(d)).join(" | "));
  const aviso = await p.evaluate(() => document.getElementById("locationModeBadge").textContent);
  ok(/N45 Salón Prueba agregado/.test(aviso), "3 aviso de lugar agregado", aviso);
  ops = await opciones();
  ok(ops.includes("N45"), "4 el lugar nuevo ya está en la lista de pines como N45");

  await p.setGeolocation({ latitude: 19.37128, longitude: -99.2636, accuracy: 5 });
  await darDeAlta("NUEVO:?");
  dest = await p.evaluate(() => [...document.getElementById("selectDestino").options].map((o) => o.value + " " + o.textContent));
  ok(dest.some((d) => /N46.*Cafetería Prueba/.test(d)), "5 segundo lugar con nombre libre quedó como N46", dest.filter((d) => /N4[4-9]/.test(d)).join(" | "));

  const ruta = await p.evaluate(() => {
    const so = document.getElementById("selectOrigen"), sd = document.getElementById("selectDestino");
    so.value = "N01"; so.dispatchEvent(new Event("change", { bubbles: true }));
    sd.value = "N45"; sd.dispatchEvent(new Event("change", { bubbles: true }));
    return [...document.querySelectorAll("li")].map((l) => l.innerText.replace(/\s+/g, " ").trim()).filter((x) => /^N\d\d/.test(x)).map((x) => x.slice(0, 3)).join(">");
  });
  ok(/^N01>.*N09>N45$/.test(ruta), "6 ruta Puerta 3 → lugar nuevo termina en su nodo más cercano (Patio El Cubo)", ruta);

  // CSV que se comparte: se captura sobrescribiendo navigator.share
  const csv = await p.evaluate(async () => {
    let t = ""; navigator.share = async (d) => { t = d.text; };
    document.getElementById("btnEnviarPines").click(); await new Promise((r) => setTimeout(r, 200)); return t;
  });
  const filasNuevas = csv.split("\n").filter((f) => /,nuevo$/.test(f));
  ok(filasNuevas.length === 2, "7 el CSV trae los 2 lugares nuevos", filasNuevas.join(" | "));
  fs.writeFileSync(path.join(__dirname, "pines_prueba.csv"), csv, "utf8");
  ok(errs.length === 0, "8 sin errores JS", errs.join(" | "));
  await b.close(); srv.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
