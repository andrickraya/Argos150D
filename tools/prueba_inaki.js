// Uso: node prueba_inaki.js <carpeta app> <ruta a tools/inaki_server.js>
// Prueba a Iñaki con frases locales y con el servidor (con un Ollama de mentira).
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const puppeteer = require("puppeteer-core");
const dir = process.argv[2], rutaServidor = process.argv[3];
const srv = http.createServer((q, r) => {
  let f = decodeURIComponent(q.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
  fs.readFile(path.join(dir, f), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { "Content-Type": f.endsWith(".html") ? "text/html; charset=utf-8" : "text/css" }); r.end(d); } });
}).listen(0);
// Ollama de mentira: contesta con el evento que recibió
let recibido = null;
const ollama = http.createServer((q, r) => {
  let c = ""; q.on("data", (d) => (c += d)); q.on("end", () => {
    recibido = JSON.parse(c);
    r.writeHead(200, { "Content-Type": "application/json" });
    r.end(JSON.stringify({ message: { content: "MODELO: " + recibido.messages[1].content.split("\n")[0] } }));
  });
}).listen(0);
let fallos = 0;
const ok = (c, m, extra) => { if (!c) fallos++; console.log((c ? "OK   " : "FALLO") + " " + m + (extra ? "  → " + extra : "")); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const hijo = spawn(process.execPath, [rutaServidor], { env: { ...process.env, PUERTO: "8791", OLLAMA_URL: `http://127.0.0.1:${ollama.address().port}` }, stdio: "ignore" });
  await espera(900);
  const b = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: "new",
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const base = `http://localhost:${srv.address().port}/index.html`;

  async function abrir(query) {
    const p = await b.newPage();
    await p.setViewport({ width: 393, height: 851, isMobile: true, hasTouch: true });
    p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
    // Espía del canvas: guarda todo texto que se dibuja (el globo y el lobo se pintan en el canvas AR)
    await p.evaluateOnNewDocument(() => {
      window.__txt = [];
      window.__voz = [];
      if (window.speechSynthesis) { window.speechSynthesis.speak = (u) => window.__voz.push(u.lang + "|" + u.text); window.speechSynthesis.cancel = () => {}; }
      const orig = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { window.__txt.push(String(t)); if (window.__txt.length > 400) window.__txt.shift(); return orig.call(this, t, ...r); };
    });
    await p.goto(base + query, { waitUntil: "load" });
    return p;
  }
  const ruta = (p, o, d) => p.evaluate((o, d) => {
    const so = document.getElementById("selectOrigen"), sd = document.getElementById("selectDestino");
    so.value = o; so.dispatchEvent(new Event("change", { bubbles: true }));
    sd.value = d; sd.dispatchEvent(new Event("change", { bubbles: true }));
  }, o, d);
  const dibujado = async (p) => { await p.evaluate(() => { window.__txt.length = 0; }); await espera(500); return p.evaluate(() => window.__txt.join(" ")); };

  // ---- A. Frases locales ----
  let p = await abrir("");
  await ruta(p, "N07", "N10"); await espera(1600);
  let t = await dibujado(p);
  ok(t.includes("🐺"), "A1 el lobo se dibuja sobre el camino");
  ok(/Soy Iñaki/.test(t) && /Cafetería El Cubo/.test(t), "A2 saluda y dice el destino", t.replace(/🐺/g, "").replace(/\s+/g, " ").slice(0, 110));
  await ruta(p, "N01", "N07"); await espera(1500);
  await p.evaluate(() => document.getElementById("btnNextNode").click()); await espera(1600);
  t = await dibujado(p);
  ok(/Pasamos Escultura de Lobos/.test(t) && /Gira/.test(t), "A3 al pasar un nodo avisa el giro que sigue", t.replace(/🐺/g, "").replace(/\s+/g, " ").slice(0, 140));
  ok(p.errs.length === 0, "A4 sin errores JS", p.errs.join(" | "));
  await p.close();

  // ---- B. ?lobo=0 lo apaga ----
  p = await abrir("?lobo=0");
  await ruta(p, "N07", "N10"); await espera(1600);
  t = await dibujado(p);
  ok(!t.includes("🐺") && !/Iñaki/.test(t), "B1 con ?lobo=0 no aparece");
  await p.close();

  // ---- C. Con servidor: la frase la pone el modelo ----
  p = await abrir("?inaki=" + encodeURIComponent("http://localhost:8791/inaki"));
  await ruta(p, "N07", "N10"); await espera(2200);
  t = await dibujado(p);
  ok(/MODELO: EVENTO: inicio/.test(t), "C1 la app muestra la respuesta del modelo", t.replace(/🐺/g, "").replace(/\s+/g, " ").slice(0, 80));
  const ctx = recibido ? recibido.messages[1].content : "";
  ok(/"destino":"Cafetería El Cubo"/.test(ctx) && /"lugaresCerca":\[/.test(ctx) && /Iñaki/.test(recibido.messages[0].content), "C2 el modelo recibe destino, lugares cercanos y el papel de Iñaki");
  ok(p.errs.length === 0, "C3 sin errores JS", p.errs.join(" | "));
  await p.close();

  // ---- D. Servidor caído: se queda la frase local ----
  hijo.kill(); await espera(400);
  p = await abrir("");
  await ruta(p, "N07", "N10"); await espera(2200);
  t = await dibujado(p);
  ok(/Soy Iñaki/.test(t), "D1 sin servidor Iñaki sigue hablando con frases locales");
  ok(p.errs.length === 0, "D2 sin errores JS", p.errs.join(" | "));

  await p.close();

  // ---- E. Voz: apagada por omisión; con el botón habla en español y sin emojis ----
  p = await abrir("");
  await ruta(p, "N01", "N07"); await espera(1600);
  let voz = await p.evaluate(() => window.__voz.slice());
  ok(voz.length === 0, "E1 con la voz apagada Iñaki no habla", voz.join(" / "));
  await p.evaluate(() => document.getElementById("btnVozInaki").click()); await espera(200);
  voz = await p.evaluate(() => window.__voz.slice());
  ok(voz.length === 1 && /^es-MX\|.*Soy Iñaki/.test(voz[0]), "E2 al encender dice la frase actual en es-MX", voz[0]);
  await p.evaluate(() => document.getElementById("btnNextNode").click()); await espera(1600);
  voz = await p.evaluate(() => window.__voz.slice());
  ok(voz.length === 2 && /Gira a la (derecha|izquierda)/.test(voz[1]) && !/[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u.test(voz[1]), "E3 al pasar un nodo dice el giro, sin emojis ni flechas", voz[1]);
  ok(p.errs.length === 0, "E4 sin errores JS", p.errs.join(" | "));

  await b.close(); srv.close(); ollama.close();
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODO OK");
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
