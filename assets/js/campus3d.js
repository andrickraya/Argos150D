// Sección "Campus en 3D": modelo three.js de la Ibero hecho con datos reales de OpenStreetMap.
// Datos: assets/data/campus3d.json (lo genera tools/campus_3d.js). No depende de app/.
// - Edificios extruidos con su altura de OSM (ladrillo = Ibero, gris = vecinos).
// - Ruta Puerta 3 -> Salón C con flechas animadas, como en la app.
// - Solo dibuja cuando la sección está en pantalla; sin WebGL muestra el dibujo SVG.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const raiz = document.querySelector("[data-campus3d]");
if (raiz) iniciar(raiz).catch((e) => falla(raiz, e));

function falla(raiz, e) {
  console.warn("[campus3d] uso el dibujo de respaldo:", e && e.message ? e.message : e);
  raiz.classList.add("c3d--sin-webgl");
}

function webglDisponible() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (_) {
    return false;
  }
}

async function iniciar(raiz) {
  if (!webglDisponible()) throw new Error("WebGL no disponible");
  const lienzo = raiz.querySelector(".c3d__canvas");
  const resp = await fetch(raiz.dataset.datos);
  if (!resp.ok) throw new Error("No pude leer " + raiz.dataset.datos);
  const D = await resp.json();

  const tactil = matchMedia("(hover: none) and (pointer: coarse)").matches;
  const sinMovimiento = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Cifras del texto: salen del JSON para que sigan correctas si cambian los nodos o el mapa
  const cifras = {
    alturas: D.resumen ? `${D.resumen.iberoConAltura} de ${D.resumen.edificiosIbero}` : null,
    ibero: D.resumen ? String(D.resumen.edificiosIbero) : null,
    metros: `${D.ruta.metros} m`,
    puntos: String(D.ruta.ids.length)
  };
  raiz.querySelectorAll("[data-stat]").forEach((el) => { if (cifras[el.dataset.stat]) el.textContent = cifras[el.dataset.stat]; });
  const pista = raiz.querySelector(".c3d__hint");
  if (pista && tactil) pista.textContent = "Toca «Recorrer la ruta»";
  const C = {
    cielo: 0xf3ebde, suelo: 0xe9dfcd, recinto: 0xf1e2c8, calle: 0xfbf7ef, andador: 0xe2c3a6,
    pasto: 0xa9c48a, cancha: 0x8fbf86, ladrillo: 0xc4613f, ladrilloTecho: 0xd9a487,
    vecino: 0xd8d0c4, vecinoTecho: 0xebe6de, ruta: 0xdc0235, tronco: 0x7a5a43,
    arboles: [0x6e9a59, 0x81a866, 0x5b8a4c, 0x8fb071]
  };

  // ---------- Motor ----------
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tactil ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(C.cielo);
  escena.fog = new THREE.Fog(C.cielo, 420, 900);

  const camara = new THREE.PerspectiveCamera(38, 1, 1, 3000);
  const controles = new OrbitControls(camara, lienzo);
  controles.enableDamping = true;
  controles.dampingFactor = 0.06;
  controles.enablePan = false;
  controles.minDistance = 90;
  controles.maxDistance = 800;
  controles.minPolarAngle = 0.25;
  controles.maxPolarAngle = 1.32;
  controles.autoRotate = !sinMovimiento;
  controles.autoRotateSpeed = 0.35;
  // En celular el dedo debe seguir haciendo scroll en la página: el modelo gira solo y con botones.
  controles.enabled = !tactil;
  controles.enableZoom = false; // la rueda del ratón sigue bajando la página

  // ---------- Luz ----------
  escena.add(new THREE.HemisphereLight(0xfff4e2, 0x8a7a66, 1.25));
  const sol = new THREE.DirectionalLight(0xffe2bd, 2.3);
  sol.position.set(-260, 340, 180);
  sol.castShadow = true;
  sol.shadow.mapSize.set(tactil ? 1024 : 2048, tactil ? 1024 : 2048);
  Object.assign(sol.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 50, far: 1200 });
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.6;
  escena.add(sol);

  // ---------- Utilidades de geometría ----------
  const forma = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, -y)));
  const plano = (pts, alto) => {
    const g = new THREE.ShapeGeometry(forma(pts));
    g.rotateX(-Math.PI / 2);
    g.translate(0, alto, 0);
    return g;
  };
  const colorear = (g, techo, muro, alto) => {
    const n = g.attributes.normal, p = g.attributes.position, col = new Float32Array(p.count * 3);
    const ct = new THREE.Color(techo), cm = new THREE.Color(muro), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      if (n.getY(i) > 0.5) c.copy(ct);
      else c.copy(cm).multiplyScalar(0.72 + 0.28 * Math.min(1, p.getY(i) / Math.max(alto, 1))); // oscurece abajo
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return g;
  };
  const cinta = (pts, ancho, alto) => {
    const v = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l, h = ancho / 2;
      v.push(pts[i][0] + nx * h, alto, pts[i][1] + ny * h, pts[i][0] - nx * h, alto, pts[i][1] - ny * h);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra });
  const unir = (lista) => (lista.length ? mergeGeometries(lista.map((g) => (g.index ? g.toNonIndexed() : g))) : null);
  const agregar = (geo, material, { sombra = false, recibe = true } = {}) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, material);
    m.castShadow = sombra;
    m.receiveShadow = recibe;
    escena.add(m);
    return m;
  };

  // ---------- Suelo ----------
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), mat(C.suelo));
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  escena.add(suelo);
  agregar(plano(D.recinto, 0.05), mat(C.recinto));
  agregar(unir(D.verdes.filter((v) => v.tipo === "pasto").map((v) => plano(v.pts, 0.12))), mat(C.pasto));
  agregar(unir(D.verdes.filter((v) => v.tipo === "cancha").map((v) => plano(v.pts, 0.14))), mat(C.cancha));
  agregar(unir(D.calles.filter((c) => !c.peaton).map((c) => cinta(c.pts, c.w, 0.18))), mat(C.calle));
  agregar(unir(D.calles.filter((c) => c.peaton).map((c) => cinta(c.pts, c.w, 0.22))), mat(C.andador));

  // ---------- Edificios ----------
  const extruir = (e) => {
    const g = new THREE.ExtrudeGeometry(forma(e.pts), { depth: e.h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return colorear(g.index ? g.toNonIndexed() : g, e.ibero ? C.ladrilloTecho : C.vecinoTecho, e.ibero ? C.ladrillo : C.vecino, e.h);
  };
  const matEdif = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  agregar(unir(D.edificios.filter((e) => e.ibero).map(extruir)), matEdif, { sombra: true });
  agregar(unir(D.edificios.filter((e) => !e.ibero).map(extruir)), matEdif, { sombra: true });

  // ---------- Árboles (instanciados, low poly) ----------
  const nA = D.arboles.length;
  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), nA);
  const troncos = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.4, 3.2, 5), mat(C.tronco), nA);
  copas.castShadow = troncos.castShadow = true;
  const o = new THREE.Object3D(), color = new THREE.Color();
  D.arboles.forEach(([x, y, s], i) => {
    o.position.set(x, 1.6 * s, y); o.rotation.set(0, i * 1.7, 0); o.scale.setScalar(s); o.updateMatrix();
    troncos.setMatrixAt(i, o.matrix);
    o.position.set(x, 4.6 * s, y); o.scale.set(s, s * 1.15, s); o.updateMatrix();
    copas.setMatrixAt(i, o.matrix);
    copas.setColorAt(i, color.setHex(C.arboles[i % C.arboles.length]));
  });
  escena.add(copas, troncos);

  // ---------- Ruta con flechas animadas ----------
  const pr = D.ruta.pts;
  agregar(cinta(pr, 10, 0.3), new THREE.MeshBasicMaterial({ color: C.ruta, transparent: true, opacity: 0.2, depthWrite: false }), { recibe: false });
  agregar(cinta(pr, 2.2, 0.34), new THREE.MeshBasicMaterial({ color: C.ruta }), { recibe: false });
  const tramos = [];
  let total = 0;
  for (let i = 1; i < pr.length; i++) {
    const l = Math.hypot(pr[i][0] - pr[i - 1][0], pr[i][1] - pr[i - 1][1]);
    tramos.push({ a: pr[i - 1], b: pr[i], ini: total, l });
    total += l;
  }
  const enRuta = (d) => {
    d = ((d % total) + total) % total;
    const t = tramos.find((s) => d <= s.ini + s.l) || tramos[tramos.length - 1];
    const u = (d - t.ini) / t.l;
    return { x: t.a[0] + (t.b[0] - t.a[0]) * u, y: t.a[1] + (t.b[1] - t.a[1]) * u, ang: Math.atan2(t.b[0] - t.a[0], t.b[1] - t.a[1]) };
  };
  const chevron = new THREE.Shape();
  chevron.moveTo(0, 1.6); chevron.lineTo(1.5, -0.4); chevron.lineTo(0.75, -0.4); chevron.lineTo(0, 0.6);
  chevron.lineTo(-0.75, -0.4); chevron.lineTo(-1.5, -0.4); chevron.closePath();
  const gFlecha = new THREE.ExtrudeGeometry(chevron, { depth: 0.35, bevelEnabled: false });
  gFlecha.rotateX(-Math.PI / 2); // la punta mira hacia -Z; se gira con ang
  const PASO = 7, nF = Math.floor(total / PASO);
  const flechas = new THREE.InstancedMesh(gFlecha, new THREE.MeshBasicMaterial({ color: 0xffffff }), nF);
  const cF = new THREE.Color(C.ruta);
  for (let i = 0; i < nF; i++) flechas.setColorAt(i, cF);
  escena.add(flechas);
  const ponerFlechas = (t) => {
    for (let i = 0; i < nF; i++) {
      const p = enRuta(i * PASO + t * 9);
      o.position.set(p.x, 1.1 + Math.sin(t * 3 + i * 0.6) * 0.25, p.y);
      o.rotation.set(0, p.ang + Math.PI, 0);
      o.scale.setScalar(1.9);
      o.updateMatrix();
      flechas.setMatrixAt(i, o.matrix);
    }
    flechas.instanceMatrix.needsUpdate = true;
  };

  // Pines de inicio y destino
  const pin = (x, y, alto) => {
    const g = new THREE.Group();
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, alto, 8), new THREE.MeshBasicMaterial({ color: C.ruta }));
    poste.position.y = alto / 2;
    const bola = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14), new THREE.MeshStandardMaterial({ color: C.ruta, roughness: 0.35, emissive: C.ruta, emissiveIntensity: 0.35 }));
    bola.position.y = alto;
    bola.castShadow = true;
    g.add(poste, bola);
    g.position.set(x, 0, y);
    escena.add(g);
    return g;
  };
  const ini = pr[0], fin = pr[pr.length - 1];
  pin(ini[0], ini[1], 16);
  pin(fin[0], fin[1], 22);
  const etiquetas = [
    { el: raiz.querySelector('[data-pin="inicio"]'), v: new THREE.Vector3(ini[0], 20, ini[1]) },
    { el: raiz.querySelector('[data-pin="fin"]'), v: new THREE.Vector3(fin[0], 26, fin[1]) }
  ].filter((e) => e.el);

  // ---------- Cámara: vista general y recorrido de la ruta ----------
  // Centro = punto medio entre la ruta y el centro del recinto, para que se vean las dos cosas
  const cr = D.recinto.reduce((a, p) => [a[0] + p[0] / D.recinto.length, a[1] + p[1] / D.recinto.length], [0, 0]);
  const centro = new THREE.Vector3((cr[0] + (ini[0] + fin[0]) / 2) / 2, 0, (cr[1] + (ini[1] + fin[1]) / 2) / 2);
  const vistaGeneral = () => ({ pos: new THREE.Vector3(centro.x - 300, 330, centro.z + 360), obj: centro.clone() });
  const v0 = vistaGeneral();
  camara.position.copy(v0.pos);
  controles.target.copy(v0.obj);
  let vuelo = null; // { desde, hasta, t0, dur } o recorrido de ruta
  const suave = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  const volarA = ({ pos, obj }, dur = 1.8) => {
    vuelo = { tipo: "punto", dp: camara.position.clone(), dt: controles.target.clone(), hp: pos, ht: obj, t0: reloj.getElapsedTime(), dur };
  };
  const recorrer = () => {
    vuelo = { tipo: "ruta", t0: reloj.getElapsedTime(), dur: sinMovimiento ? 0.01 : 14 };
    raiz.classList.add("c3d--recorriendo");
  };
  const camaraRuta = (u) => {
    const d = suave(u) * total;
    // Cámara de dron: atrás y arriba de las flechas (los edificios miden hasta ~33 m), mirando hacia adelante
    const p = enRuta(Math.max(0, d - 55)), q = enRuta(Math.min(total - 0.01, d + 25));
    return { pos: new THREE.Vector3(p.x - 20, 85, p.y + 30), obj: new THREE.Vector3(q.x, 0, q.y) };
  };
  raiz.querySelectorAll("[data-c3d]").forEach((b) =>
    b.addEventListener("click", () => {
      raiz.querySelectorAll("[data-c3d]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      if (b.dataset.c3d === "ruta") recorrer();
      else { raiz.classList.remove("c3d--recorriendo"); volarA(vistaGeneral()); }
    })
  );

  // ---------- Tamaño y ciclo de dibujo ----------
  const ajustar = () => {
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.fov = w / h < 0.8 ? 52 : 38; // en vertical se abre el lente para que quepa el campus
    // En pantalla ancha el texto ocupa la izquierda: corro el encuadre para que el campus quede a la derecha
    if (w > 860) camara.setViewOffset(w, h, -w * 0.16, 0, w, h);
    else camara.clearViewOffset();
    camara.updateProjectionMatrix();
  };
  new ResizeObserver(ajustar).observe(lienzo);
  ajustar();

  const reloj = new THREE.Clock();
  const tmp = new THREE.Vector3();
  let visible = false, corriendo = false;
  const cuadro = () => {
    if (!visible || document.hidden) { corriendo = false; return; }
    const t = reloj.getElapsedTime();
    ponerFlechas(sinMovimiento ? 0 : t);
    if (vuelo) {
      const u = Math.min(1, (t - vuelo.t0) / vuelo.dur);
      if (vuelo.tipo === "punto") {
        camara.position.lerpVectors(vuelo.dp, vuelo.hp, suave(u));
        controles.target.lerpVectors(vuelo.dt, vuelo.ht, suave(u));
      } else {
        const c = camaraRuta(u);
        camara.position.lerp(c.pos, u === 1 ? 1 : 0.08);
        controles.target.lerp(c.obj, u === 1 ? 1 : 0.08);
      }
      camara.lookAt(controles.target);
      if (u === 1) {
        if (vuelo.tipo === "ruta") { raiz.classList.remove("c3d--recorriendo"); raiz.classList.add("c3d--llegaste"); setTimeout(() => raiz.classList.remove("c3d--llegaste"), 2600); }
        vuelo = null;
      }
    } else {
      controles.update();
    }
    renderer.render(escena, camara);
    const w = lienzo.clientWidth, h = lienzo.clientHeight;
    for (const e of etiquetas) {
      tmp.copy(e.v).project(camara);
      const fuera = tmp.z > 1 || Math.abs(tmp.x) > 1.05 || Math.abs(tmp.y) > 1.05;
      e.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
      e.el.style.opacity = fuera ? "0" : "1";
    }
    requestAnimationFrame(cuadro);
  };
  const arrancar = () => { if (!corriendo && visible && !document.hidden) { corriendo = true; requestAnimationFrame(cuadro); } };
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; arrancar(); }, { rootMargin: "120px" }).observe(raiz);
  document.addEventListener("visibilitychange", arrancar);
  controles.addEventListener("start", () => { vuelo = null; raiz.classList.remove("c3d--recorriendo"); });

  // Primer cuadro aunque la sección aún no esté en pantalla (para que no aparezca vacía)
  ponerFlechas(0);
  renderer.render(escena, camara);
  raiz.classList.add("c3d--listo");
}
