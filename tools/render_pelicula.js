// Renderiza la "película provisional" de la intro: la cámara baja sobre el dibujo de la Ibero,
// se inclina como dron y sigue la ruta ARGOS de Puerta 3 a Salón C mientras la ruta se dibuja.
// Salida: cuadros JPG en <carpeta> (luego se codifican con ffmpeg).
// Uso:
//   set PUPPETEER_CORE=<ruta a node_modules/puppeteer-core>   (o tenerlo instalado)
//   node tools/render_pelicula.js <carpeta_salida> [escritorio|movil] [segundos] [fps]
const fs = require("fs");
const path = require("path");
const puppeteer = require(process.env.PUPPETEER_CORE || "puppeteer-core");

const RAIZ = path.join(__dirname, "..");
const [, , SALIDA, MODO = "escritorio", SEG = "12", FPS = "30"] = process.argv;
if (!SALIDA) throw new Error("Falta la carpeta de salida");
const W = MODO === "movil" ? 1080 : 1920;
const H = MODO === "movil" ? 1920 : 1080;
const N = Math.round(+SEG * +FPS);
const EDGE = process.env.EDGE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

let svg = fs.readFileSync(path.join(RAIZ, "assets", "img", "ibero-dibujo.svg"), "utf8");
svg = svg.replace(/<svg /, '<svg id="mapa" ');

const html = `<!doctype html><html><head><style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#f4ecdc}
#escena{position:absolute;inset:0;overflow:hidden;background:#f4ecdc}
#mapa{position:absolute;left:50%;top:50%;width:${Math.round(W * 1.9)}px;height:${Math.round(H * 1.9)}px;
  transform-origin:50% 50%;will-change:transform}
#vineta{position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse at 50% 55%,rgba(0,0,0,0) 55%,rgba(40,28,18,.28) 100%)}
#bruma{position:absolute;left:0;right:0;top:0;height:42%;pointer-events:none;opacity:0;
  background:linear-gradient(#f4ecdc 0%,rgba(244,236,220,.85) 35%,rgba(244,236,220,0) 100%)}
</style></head><body><div id="escena">${svg}<div id="bruma"></div><div id="vineta"></div></div></body></html>`;

const enPagina = (CFG) => {
  const mapa = document.getElementById("mapa");
  const ruta = document.getElementById("ruta-argos");
  const fin = document.getElementById("ruta-fin");
  const L = ruta.getTotalLength();
  const ASPECTO = mapa.clientWidth / mapa.clientHeight;
  // Halo de ruta (la línea ancha translúcida) = hermano anterior
  const halo = ruta.previousElementSibling;
  [ruta, halo].forEach((p) => { p.style.strokeDasharray = `${L} ${L}`; p.style.strokeDashoffset = L; });
  // Punto "tú": avanza en la punta de la ruta
  const ns = "http://www.w3.org/2000/svg";
  const yo = document.createElementNS(ns, "g");
  yo.innerHTML = '<circle r="5" fill="#C8102E" opacity=".22"/><circle r="2.2" fill="#fff" stroke="#C8102E" stroke-width="1.2"/>';
  ruta.parentNode.appendChild(yo);
  fin.style.opacity = 0;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const suave = (t) => t * t * (3 - 2 * t);
  const suave2 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;
  const p0 = ruta.getPointAtLength(0);
  const rumbo = (s) => {
    const a = ruta.getPointAtLength(clamp(s - 14, 0, L)), b = ruta.getPointAtLength(clamp(s + 14, 0, L));
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  const angDif = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const rumbo0 = rumbo(0);

  window.cuadro = (t) => {
    // Fases: 0–.42 descenso al punto de partida · .42–1 seguir la ruta
    const T1 = 0.42;
    let cx, cy, w, giro, incl;
    const giroRuta = (s) => -Math.PI / 2 - rumbo(s); // la dirección de avance apunta hacia arriba
    if (t < T1) {
      const u = suave2(t / T1);
      cx = lerp(20, p0.x, u); cy = lerp(20, p0.y, u);
      w = Math.exp(lerp(Math.log(CFG.w0), Math.log(CFG.w1), u));
      const g = suave(clamp((t - 0.12) / (T1 - 0.12)));
      giro = angDif(0, giroRuta(0)) * g * 0.6;
      incl = 44 * suave(clamp((t - 0.1) / (T1 - 0.1)));
    } else {
      const u = (t - T1) / (1 - T1);
      const s = suave2(u) * L;
      const p = ruta.getPointAtLength(s);
      cx = p.x; cy = p.y;
      w = lerp(CFG.w1, CFG.w2, u);
      giro = angDif(0, giroRuta(0)) * 0.6 + angDif(giroRuta(0), giroRuta(s)) * 0.6;
      incl = 44;
      [ruta, halo].forEach((q) => (q.style.strokeDashoffset = L - s));
      yo.setAttribute("transform", `translate(${p.x} ${p.y})`);
      fin.style.opacity = clamp((u - 0.82) / 0.12);
      yo.style.opacity = String(1 - clamp((u - 0.9) / 0.08));
    }
    // El centro de la cámara va un poco abajo del centro (se ve más "adelante")
    const h = w / ASPECTO;
    mapa.setAttribute("viewBox", `${cx - w / 2} ${cy - h / 2 - h * 0.08} ${w} ${h}`);
    mapa.style.transform = `translate(-50%,-50%) perspective(1600px) rotateX(${incl}deg) rotateZ(${(giro * 180) / Math.PI}deg)`;
    document.getElementById("bruma").style.opacity = String(incl / 44);
    if (t < T1) yo.setAttribute("transform", `translate(${p0.x} ${p0.y})`);
  };
};

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const nav = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--disable-gpu"] });
  const pag = await nav.newPage();
  await pag.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await pag.setContent(html, { waitUntil: "load" });
  await pag.evaluate(enPagina, MODO === "movil" ? { w0: 560, w1: 250, w2: 200 } : { w0: 1250, w1: 430, w2: 330 });
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await pag.evaluate((t) => window.cuadro(t), i / (N - 1));
    await pag.screenshot({ path: path.join(SALIDA, `c${String(i).padStart(4, "0")}.jpg`), type: "jpeg", quality: 92 });
    if (i % 60 === 0) console.log(`${MODO}: cuadro ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  await nav.close();
  console.log(`OK: ${N} cuadros ${W}x${H} en ${SALIDA}`);
})();
