// Uso: node prueba_qr.js <carpeta app> [salida.pdf] [ids separados por coma | *]
// 1. Comprueba que cada QR de app/qr.html (hojas para imprimir) se lee con jsQR y lleva al link correcto.
// 2. Comprueba los QR chicos de la app (botón 🖨️, texto "ARGOS:N01").
// 3. Comprueba que el escáner de la app reconoce una hoja impresa y te ubica en ese nodo.
// 4. Si se da [salida.pdf], guarda las hojas en PDF tamaño carta.
// Necesita puppeteer-core (instálalo en una carpeta temporal y corre este archivo desde ahí).
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require("puppeteer-core");
const dir = process.argv[2], salidaPdf = process.argv[3], soloIds = process.argv[4] || "N01,N03,N60,N61,N07,N10";
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css" };
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  fs.readFile(path.join(dir, f), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": tipos[path.extname(f)] || "application/octet-stream" }); r.end(d); } });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra !== undefined ? "  → " + extra : "")); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const base = `http://localhost:${srv.address().port}`;

  // ---- 1. Hojas para imprimir ----
  let p = await b.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${base}/qr.html?solo=*`, { waitUntil: "load" });
  await p.addScriptTag({ url: `${base}/vendor/jsQR.js` });
  const hojas = await p.evaluate(() => [...document.querySelectorAll(".hoja")].map((h) => {
    const c = h.querySelector("canvas");
    // Se lee como lo vería la cámara: reducido a 300 px de lado
    const chico = document.createElement("canvas"); chico.width = chico.height = 300;
    const x = chico.getContext("2d"); x.drawImage(c, 0, 0, 300, 300);
    const img = x.getImageData(0, 0, 300, 300);
    const leido = window.jsQR(img.data, 300, 300);
    return { id: h.dataset.id, link: h.dataset.link, leido: leido ? leido.data : null, modulos: c.width / 12 - 8 };
  }));
  const malas = hojas.filter((h) => h.leido !== h.link || !new RegExp(`[?&]qr=${h.id}$`).test(h.link));
  ok(hojas.length > 40 && malas.length === 0, `1a las ${hojas.length} hojas se leen y llevan a su nodo`, malas.length ? JSON.stringify(malas.slice(0, 3)) : hojas[0].link);
  ok(hojas.every((h) => h.link.startsWith("https://andrickraya.github.io/Argos150D/app/?qr=")), "1b el link apunta a la app publicada");
  console.log(`     (cada QR mide ${hojas[0].modulos}×${hojas[0].modulos} cuadritos)`);
  ok(errs.length === 0, "1c sin errores JS en qr.html", errs.join(" | "));

  if (salidaPdf) {
    await p.goto(`${base}/qr.html?solo=${encodeURIComponent(soloIds)}`, { waitUntil: "load" });
    await p.pdf({ path: salidaPdf, format: "Letter", printBackground: true, preferCSSPageSize: true });
    const n = await p.evaluate(() => document.querySelectorAll(".hoja").length);
    console.log(`     PDF guardado: ${salidaPdf} (${n} hojas, ${Math.round(fs.statSync(salidaPdf).size / 1024)} KB)`);
  }
  // Imagen de una hoja, para usarla como "lo que ve la cámara" en el paso 3
  await p.goto(`${base}/qr.html?solo=N61`, { waitUntil: "load" });
  const pngHoja = await p.evaluate(() => document.querySelector(".hoja canvas").toDataURL("image/png"));
  await p.close();

  // ---- 2 y 3. Dentro de la app ----
  p = await b.newPage();
  await p.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true });
  const errs2 = []; p.on("pageerror", (e) => errs2.push(e.message));
  await p.goto(`${base}/index.html`, { waitUntil: "load" });
  await p.addScriptTag({ url: `${base}/vendor/jsQR.js` });
  await espera(300);
  const chicos = await p.evaluate(async () => {
    const res = [];
    for (const card of document.querySelectorAll("#qrCardsGrid .qr-card-item")) {
      const svg = card.querySelector("svg"), esperado = card.querySelector("code").textContent;
      const img = new Image();
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.outerHTML.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" '));
      await img.decode();
      const c = document.createElement("canvas"); c.width = c.height = 250;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 250, 250); x.drawImage(img, 0, 0, 250, 250);
      const d = x.getImageData(0, 0, 250, 250);
      const leido = window.jsQR(d.data, 250, 250);
      res.push({ esperado, leido: leido ? leido.data : null });
    }
    return res;
  });
  const chicosMal = chicos.filter((c) => c.leido !== c.esperado);
  ok(chicos.length > 40 && chicosMal.length === 0, `2 los ${chicos.length} QR chicos de la app (ARGOS:Nxx) se leen bien`, chicosMal.length ? JSON.stringify(chicosMal.slice(0, 3)) : chicos[0].leido);

  // 3. El escáner de la app ve una hoja impresa: se sustituye el video por un lienzo con la foto de la hoja
  const antes = await p.evaluate(() => window.ARGOS_DEBUG().origen);
  await p.evaluate(async (png) => {
    const img = new Image(); img.src = png; await img.decode();
    const lienzo = document.createElement("canvas"); lienzo.width = 1280; lienzo.height = 720;
    const x = lienzo.getContext("2d"); x.fillStyle = "#777"; x.fillRect(0, 0, 1280, 720); x.drawImage(img, 480, 200, 320, 320);
    const video = document.getElementById("arVideo");
    video.srcObject = lienzo.captureStream(10);
    await video.play();
    setInterval(() => { x.fillStyle = "#777"; x.fillRect(0, 0, 4, 4); }, 100); // mantiene vivo el video
  }, pngHoja);
  let despues = antes;
  for (let i = 0; i < 12 && despues !== "N61"; i++) { await espera(700); despues = await p.evaluate(() => window.ARGOS_DEBUG().origen); }
  ok(antes !== "N61" && despues === "N61", "3 la app reconoce la hoja impresa de la Explanada y te ubica ahí", `${antes} → ${despues}`);
  ok(errs2.length === 0, "4 sin errores JS en la app", errs2.join(" | "));
  await p.close();

  await b.close(); srv.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
