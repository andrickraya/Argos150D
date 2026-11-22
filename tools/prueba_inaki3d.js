// Uso (desde la raíz del repo): node tools/prueba_inaki3d.js [ruta_captura.png]
// Prueba a Iñaki 3D (assets/models/inaki.glb): carga, animaciones, gestos y que reemplaza al 🐺.
// Necesita internet (three.js viene del CDN, igual que en la app publicada).
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const raiz = path.join(__dirname, "..");
const captura = process.argv[2];
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".glb": "model/gltf-binary", ".json": "application/json" };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  fs.readFile(path.join(raiz, f), (e, d) => {
    if (e) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { "Content-Type": tipos[path.extname(f)] || "application/octet-stream" }); r.end(d);
  });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra ? "  → " + extra : "")); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
  async function abrir(query) {
    const p = await b.newPage();
    await p.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true });
    p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
    await p.evaluateOnNewDocument(() => {
      window.__txt = []; window.__img = 0;
      const t = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (s, ...r) { window.__txt.push(String(s)); if (window.__txt.length > 400) window.__txt.shift(); return t.call(this, s, ...r); };
      const d = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, ...r) { if (img && img.width === 288 && img.height === 384) window.__img++; return d.call(this, img, ...r); };
    });
    await p.goto(`http://localhost:${srv.address().port}/app/index.html${query}`, { waitUntil: "load" });
    return p;
  }
  const ruta = (p, o, d) => p.evaluate((o, d) => {
    const so = document.getElementById("selectOrigen"), sd = document.getElementById("selectDestino");
    so.value = o; so.dispatchEvent(new Event("change", { bubbles: true }));
    sd.value = d; sd.dispatchEvent(new Event("change", { bubbles: true }));
  }, o, d);

  let p = await abrir("");
  await ruta(p, "N01", "N07");
  let info = null;
  for (let i = 0; i < 40; i++) { info = await p.evaluate(() => window.ARGOS_INAKI3D()); if (info.listo || info.error) break; await espera(500); }
  ok(info.listo, "1 el modelo inaki.glb carga con three.js", info.error || "");
  const esperadas = ["idle", "saludar", "senalar", "presentar", "celebrar", "pensar", "caminar"];
  ok(esperadas.every((a) => info.animaciones.includes(a)), "2 trae las 7 animaciones", info.animaciones.join(", "));
  await p.evaluate(() => { window.__txt.length = 0; window.__img = 0; }); await espera(800);
  const dib = await p.evaluate(() => ({ img: window.__img, lobo: window.__txt.some((t) => t.includes("🐺")) }));
  ok(dib.img > 5 && !dib.lobo, "3 se dibuja el 3D en el AR en lugar del 🐺", `cuadros 3D: ${dib.img}, 🐺: ${dib.lobo}`);
  info = await p.evaluate(() => window.ARGOS_INAKI3D());
  ok(info.ultimoGesto === "saludar", "4 al iniciar la ruta saluda", "último gesto: " + info.ultimoGesto);
  if (captura) {
    await espera(600); await p.screenshot({ path: captura });
    const cuadro = await p.evaluate(() => window.ARGOS_INAKI3D_CUADRO());
    if (cuadro) fs.writeFileSync(captura.replace(/\.png$/, "_cuadro.png"), Buffer.from(cuadro.split(",")[1], "base64"));
    console.log("captura: " + captura + "  estado: " + JSON.stringify(await p.evaluate(() => window.ARGOS_INAKI3D())));
  }
  ok(p.errs.length === 0, "5 sin errores JS", p.errs.join(" | "));
  await p.close();

  p = await abrir("?inaki3d=0");
  await ruta(p, "N01", "N07"); await espera(1500);
  const lobo = await p.evaluate(() => window.__txt.some((t) => t.includes("🐺")));
  ok(lobo, "6 con ?inaki3d=0 vuelve el 🐺");
  await p.close();

  await b.close(); srv.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
