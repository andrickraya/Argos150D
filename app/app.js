(() => {
  // Adaptador: campus_data.js (generado por osm_a_unity.py) publica window.ARGOS_CAMPUS_DATA
  // con nombres en español (nodos/nombre/aristas). La app usa nodes/name/edges/bounds.
  function adaptarDatosCampus(fuente) {
    if (!fuente) return null;
    if (Array.isArray(fuente.nodes) && Array.isArray(fuente.edges) && fuente.bounds) return fuente;
    const nodes = (fuente.nodes || fuente.nodos || []).map((n) => ({
      ...n,
      name: n.name || n.nombre || n.id,
      category: n.category || n.categoria || ""
    }));
    if (nodes.length === 0) return null;
    const margen = 25;
    const xs = nodes.map((n) => n.x);
    const zs = nodes.map((n) => n.z);
    return {
      ...fuente,
      nodes,
      edges: fuente.edges || fuente.aristas || [],
      origen: fuente.origen || null,
      bounds: fuente.bounds || {
        minX: Math.min(...xs) - margen,
        maxX: Math.max(...xs) + margen,
        minZ: Math.min(...zs) - margen,
        maxZ: Math.max(...zs) + margen
      }
    };
  }

  const datos = adaptarDatosCampus(window.CAMPUS_DATA || window.ARGOS_CAMPUS_DATA);
  if (!datos) {
    console.error("ARGOS: no se encontraron datos del campus (window.ARGOS_CAMPUS_DATA).");
    const aviso = document.getElementById("locationModeBadge");
    if (aviso) aviso.textContent = "⚠️ Error: no cargaron los datos del campus";
    return;
  }

  // ============================================================================
  // 1. GRAFO DE LOS 20 NODOS CAMINABLES DEL CAMPUS IBERO (DIJKSTRA)
  // ============================================================================
  const nodosPorId = new Map(datos.nodes.map((n) => [n.id, n]));
  const adyacencia = new Map();

  function distanciaMetros(a, b) {
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  // lat/lon -> metros (X = Este, Z = Norte). MISMA fórmula que proyecto/tools/osm_a_unity.py,
  // así un punto GPS cae igual en la app y en Unity.
  const LAT0 = datos.origen ? datos.origen.lat : 19.37024335;
  const LON0 = datos.origen ? datos.origen.lon : -99.26414455;
  const RADIO_TIERRA = 6378137.0;
  function latLonAMetros(lat, lon) {
    const r = Math.PI / 180;
    return {
      x: RADIO_TIERRA * (lon - LON0) * r * Math.cos(LAT0 * r),
      z: RADIO_TIERRA * (lat - LAT0) * r
    };
  }

  // Pines puestos en campo con GPS (ver "📍 Poner pines con GPS"): reemplazan la posición del nodo
  const CLAVE_PINES = "argos_pines_v1";
  function leerPines() {
    try { return JSON.parse(localStorage.getItem(CLAVE_PINES) || "{}") || {}; } catch (_) { return {}; }
  }
  function guardarPinesLocal(pines) {
    try { localStorage.setItem(CLAVE_PINES, JSON.stringify(pines)); } catch (_) {}
  }
  const posicionOriginal = new Map(datos.nodes.map((n) => [n.id, { x: n.x, z: n.z, lat: n.lat, lon: n.lon }]));
  function aplicarPines() {
    const pines = leerPines();
    datos.nodes.forEach((n) => {
      const p = pines[n.id];
      const o = posicionOriginal.get(n.id);
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
        const m = latLonAMetros(p.lat, p.lon);
        Object.assign(n, { x: m.x, z: m.z, lat: p.lat, lon: p.lon });
      } else {
        Object.assign(n, o);
      }
    });
  }

  function reconstruirGrafo() {
    adyacencia.clear();
    datos.nodes.forEach((n) => adyacencia.set(n.id, []));
    datos.edges.forEach(([u, v]) => {
      const na = nodosPorId.get(u);
      const nb = nodosPorId.get(v);
      if (!na || !nb) return;
      const peso = distanciaMetros(na, nb);
      adyacencia.get(u).push({ Vecino: v, Peso: peso });
      adyacencia.get(v).push({ Vecino: u, Peso: peso });
    });
    const margen = 25;
    const xs = datos.nodes.map((n) => n.x);
    const zs = datos.nodes.map((n) => n.z);
    datos.bounds = {
      minX: Math.min(...xs) - margen,
      maxX: Math.max(...xs) + margen,
      minZ: Math.min(...zs) - margen,
      maxZ: Math.max(...zs) + margen
    };
  }

  aplicarPines();
  reconstruirGrafo();

  function calcularRutaDijkstra(origenId, destinoId) {
    const dist = new Map();
    const previo = new Map();
    const visitados = new Set();

    datos.nodes.forEach((n) => dist.set(n.id, Infinity));
    dist.set(origenId, 0);

    while (visitados.size < datos.nodes.length) {
      let actual = null;
      let mejor = Infinity;
      for (const [id, d] of dist.entries()) {
        if (!visitados.has(id) && d < mejor) {
          mejor = d;
          actual = id;
        }
      }
      if (actual === null || actual === destinoId) break;
      visitados.add(actual);

      for (const arista of adyacencia.get(actual) || []) {
        if (visitados.has(arista.Vecino)) continue;
        const nuevo = dist.get(actual) + arista.Peso;
        if (nuevo < dist.get(arista.Vecino)) {
          dist.set(arista.Vecino, nuevo);
          previo.set(arista.Vecino, actual);
        }
      }
    }

    const ruta = [];
    let cursor = destinoId;
    if (previo.has(cursor) || cursor === origenId) {
      while (cursor) {
        ruta.unshift(nodosPorId.get(cursor));
        cursor = previo.get(cursor);
      }
    }
    return {
      ruta,
      distanciaTotal: dist.get(destinoId) || 0
    };
  }

  function calcularRumboGrados(ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const rad = Math.atan2(dx, dz);
    return (rad * (180 / Math.PI) + 360) % 360;
  }

  function nombrePuntoCardinal(grados) {
    const dirs = ["Norte", "Noreste", "Este", "Sureste", "Sur", "Suroeste", "Oeste", "Noroeste"];
    return dirs[Math.round(grados / 45) % 8];
  }

  function diferenciaAngularGrados(a, b) {
    return ((a - b + 540) % 360) - 180;
  }

  // ============================================================================
  // 2. ESTADO REACTIVO DE NAVEGACIÓN Y UBICACIÓN CONTINUA
  // ============================================================================
  const estado = {
    origenId: "N07",     // Salón C (Aulas B/C)
    destinoId: "N10",    // Cafetería El Cubo
    indiceActual: 0,
    progresoTramo: 0,
    usuarioX: -88.24,
    usuarioZ: -9.85,
    ruta: [],
    distanciaTotal: 0,
    mostrarEtiquetas: true,
    modoVista: "ar",
    caminandoSim: false,
    navegando: false,    // true = "Caminar" activo: tus pasos reales te mueven en la ruta
    gpsActivo: false,
    gpsWatchId: null,
    pasosDetectados: 0,
    desfaseMiradaGrados: 0,
    rumboUsuarioGrados: null, // Dirección real en el mundo hacia donde mira el usuario (0°=Norte, 90°=Este)
    ultimoRumboGyro: null,    // Último ángulo del giroscopio para integrar giros suaves sin saltos magnéticos
    brjSensorActual: null,
    menuColapsado: true  // Inicia colapsado para que las flechas 3D se vean completas en el celular
  };

  // Referencias DOM
  const tabAR = document.getElementById("tabAR");
  const tabMap = document.getElementById("tabMap");
  const viewAR = document.getElementById("viewAR");
  const viewMap = document.getElementById("viewMap");
  const locationModeBadge = document.getElementById("locationModeBadge");

  const bottomSheet = document.getElementById("bottomSheet");
  const btnToggleSheet = document.getElementById("btnToggleSheet");
  const sheetToggleLabel = document.getElementById("sheetToggleLabel");

  const selectOrigen = document.getElementById("selectOrigen");
  const selectDestino = document.getElementById("selectDestino");
  const btnInvert = document.getElementById("btnInvert");
  const btnNextNode = document.getElementById("btnNextNode");
  const btnWalkSim = document.getElementById("btnWalkSim");
  const btnWalkSimText = document.getElementById("btnWalkSimText");
  const btnToggleGps = document.getElementById("btnToggleGps");
  const btnCenterRoute = document.getElementById("btnCenterRoute");
  const btnToggleLabels = document.getElementById("btnToggleLabels");
  const btnAlignArrows = document.getElementById("btnAlignArrows");

  const hudStepBadge = document.getElementById("hudStepBadge");
  const hudInstruction = document.getElementById("hudInstruction");
  const hudSub = document.getElementById("hudSub");
  const hudCompass = document.getElementById("hudCompass");
  const arHeadingText = document.getElementById("arHeadingText");
  const arSignTurnIcon = document.getElementById("arSignTurnIcon");
  const arSignTitle = document.getElementById("arSignTitle");
  const arSignDist = document.getElementById("arSignDist");
  const arTurnHint = document.getElementById("arTurnHint");
  const arTurnHintText = document.getElementById("arTurnHintText");

  const kpiNodesCount = document.getElementById("kpiNodesCount");
  const kpiDistanceMeters = document.getElementById("kpiDistanceMeters");
  const stepsList = document.getElementById("stepsList");

  const arFloorCanvas = document.getElementById("arFloorCanvas");
  const arCtx = arFloorCanvas.getContext("2d");
  const campusCanvas = document.getElementById("campusCanvas");
  const ctx = campusCanvas.getContext("2d");
  const minimapCanvas = document.getElementById("minimapCanvas");
  const miniCtx = minimapCanvas.getContext("2d");
  const mapViewport = document.getElementById("mapViewport");

  // ============================================================================
  // 3. CONTROL DEL MENÚ INFERIOR (ABRIR / BAJAR CON BOTÓN O DESLIZANDO EL DEDO)
  // ============================================================================
  function fijarEstadoMenu(colapsado) {
    estado.menuColapsado = colapsado;
    bottomSheet.classList.toggle("is-collapsed", colapsado);
    btnToggleSheet.setAttribute("aria-expanded", String(!colapsado));
    sheetToggleLabel.textContent = colapsado
      ? "🔼 Cambiar Origen / Destino (20 Nodos)"
      : "🔽 Bajar Menú (Ver Piso AR)";
  }

  btnToggleSheet.addEventListener("click", () => {
    fijarEstadoMenu(!estado.menuColapsado);
  });

  // Soporte táctil para deslizar el menú hacia abajo o hacia arriba con el dedo
  let touchInicioY = null;
  bottomSheet.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches && e.touches.length === 1) {
        touchInicioY = e.touches[0].clientY;
      }
    },
    { passive: true }
  );

  bottomSheet.addEventListener(
    "touchend",
    (e) => {
      if (touchInicioY === null || !e.changedTouches || e.changedTouches.length === 0) return;
      const dy = e.changedTouches[0].clientY - touchInicioY;
      if (dy > 35 && !estado.menuColapsado) {
        fijarEstadoMenu(true); // Deslizó hacia abajo -> ocultar detalles
      } else if (dy < -35 && estado.menuColapsado) {
        fijarEstadoMenu(false); // Deslizó hacia arriba -> abrir detalles
      }
      touchInicioY = null;
    },
    { passive: true }
  );

  // ============================================================================
  // 4. CÁLCULO DE POSICIÓN CONTINUA Y AVANCE EN LA RUTA
  // ============================================================================
  function obtenerTramoActivo() {
    if (estado.ruta.length === 0) {
      const n = nodosPorId.get(estado.origenId) || datos.nodes[0];
      return { actual: n, siguiente: n, distTramo: 0, distRestanteTramo: 0, rumboTramo: 0 };
    }
    const idx = Math.min(estado.indiceActual, estado.ruta.length - 1);
    const actual = estado.ruta[idx];
    const siguiente = estado.ruta[Math.min(idx + 1, estado.ruta.length - 1)];
    const distTramo = distanciaMetros(actual, siguiente);
    const distRestanteTramo = Math.max(0, distTramo * (1 - estado.progresoTramo));
    const rumboTramo = distTramo > 0.01
      ? calcularRumboGrados(estado.usuarioX, estado.usuarioZ, siguiente.x, siguiente.z)
      : 0;
    return { actual, siguiente, distTramo, distRestanteTramo, rumboTramo };
  }

  function calcularDistanciaTotalRestante() {
    if (estado.ruta.length < 2 || estado.indiceActual >= estado.ruta.length - 1) return 0;
    const { distRestanteTramo } = obtenerTramoActivo();
    let total = distRestanteTramo;
    for (let i = estado.indiceActual + 1; i < estado.ruta.length - 1; i++) {
      total += distanciaMetros(estado.ruta[i], estado.ruta[i + 1]);
    }
    return total;
  }

  function sincronizarCoordenadasUsuarioConProgreso() {
    if (estado.ruta.length === 0) return;
    const actual = estado.ruta[Math.min(estado.indiceActual, estado.ruta.length - 1)];
    const siguiente = estado.ruta[Math.min(estado.indiceActual + 1, estado.ruta.length - 1)];
    const t = Math.max(0, Math.min(1, estado.progresoTramo));
    estado.usuarioX = actual.x + (siguiente.x - actual.x) * t;
    estado.usuarioZ = actual.z + (siguiente.z - actual.z) * t;
  }

  function avanzarMetrosEnRuta(metros) {
    // Ya en el destino: un paso de más NO debe regresarte al origen
    if (estado.ruta.length < 2 || estado.indiceActual >= estado.ruta.length - 1) return;
    const indiceAntes = estado.indiceActual;

    let restantePorAvanzar = metros;
    while (restantePorAvanzar > 0 && estado.indiceActual < estado.ruta.length - 1) {
      const a = estado.ruta[estado.indiceActual];
      const b = estado.ruta[estado.indiceActual + 1];
      const longTramo = Math.max(0.1, distanciaMetros(a, b));
      const metrosEnTramo = (1 - estado.progresoTramo) * longTramo;

      if (restantePorAvanzar < metrosEnTramo) {
        estado.progresoTramo += restantePorAvanzar / longTramo;
        restantePorAvanzar = 0;
      } else {
        // Antes de pasar al nuevo tramo, conservar hacia dónde venía caminando el usuario
        // para que el nuevo nodo NO gire solo al frente, sino que quede quieto en su dirección real
        // y la app indique "➡️ Gira a la derecha" o "⬅️ Gira a la izquierda".
        if (estado.rumboUsuarioGrados === null) {
          estado.rumboUsuarioGrados = calcularRumboGrados(a.x, a.z, b.x, b.z);
        }
        restantePorAvanzar -= metrosEnTramo;
        estado.indiceActual += 1;
        estado.progresoTramo = 0;
      }
    }

    sincronizarCoordenadasUsuarioConProgreso();
    actualizarHUD();
    dibujarMapa2D();
    dibujarMinimapa();

    if (estado.indiceActual !== indiceAntes && navigator.vibrate) navigator.vibrate(120);
    if (estado.indiceActual >= estado.ruta.length - 1) {
      if (estado.caminandoSim) detenerSimulacionCaminata();
      if (estado.navegando) detenerNavegacion("🏁 Llegaste a tu destino");
    }
  }

  // ============================================================================
  // 5. MOTOR 3D NATIVO DE ALTA VISIBILIDAD EN EL PISO (#arFloorCanvas)
  //    Funciona al 100% en cualquier navegador móvil o PC sin depender de CDNs externos
  // ============================================================================
  function ajustarTamanoCanvasAR() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    arFloorCanvas.width = Math.round(w * dpr);
    arFloorCanvas.height = Math.round(h * dpr);
    arCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  window.addEventListener("resize", ajustarTamanoCanvasAR);
  ajustarTamanoCanvasAR();

  // Permitir girar la cámara 3D arrastrando horizontalmente sobre la vista AR
  let arrastrandoAR = false;
  let ultimoXAR = 0;
  arFloorCanvas.addEventListener("pointerdown", (e) => {
    arrastrandoAR = true;
    ultimoXAR = e.clientX;
  });
  window.addEventListener("pointermove", (e) => {
    if (!arrastrandoAR) return;
    const dx = e.clientX - ultimoXAR;
    ultimoXAR = e.clientX;
    if (estado.rumboUsuarioGrados === null) {
      estado.rumboUsuarioGrados = obtenerTramoActivo().rumboTramo;
    }
    estado.rumboUsuarioGrados = (estado.rumboUsuarioGrados - dx * 0.35 + 360) % 360;
    estado.calibrado = true;
    dibujarMinimapa();
  });
  window.addEventListener("pointerup", () => {
    arrastrandoAR = false;
  });

  // ---- Cámara virtual = cámara real del celular ----
  // Ajustables desde la URL sin volver a publicar:  ?fov=67&h=1.4
  //   fov = campo de visión (grados) del lado LARGO de la cámara trasera (iPhone principal ≈ 67°)
  //   h   = altura del celular sobre el piso en metros (en la mano ≈ 1.4)
  const parametrosURL = new URLSearchParams(location.search);
  const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
  const FOV_LARGO_GRADOS = limitar(Number(parametrosURL.get("fov")) || 67, 30, 120);
  const ALTURA_CAMARA = limitar(Number(parametrosURL.get("h")) || 1.4, 0.5, 2.5);
  const videoAR = document.getElementById("arVideo");

  // "Arriba del mundo" medido en ejes del celular (x = derecha de la pantalla, y = arriba, z = hacia ti).
  // Se ignora el alabeo lateral de muñeca (gamma = 0) y se filtra el temblor para que el nodo se quede QUIETO.
  // Sin sensor (PC): celular inclinado 30° hacia el piso (beta = 60°).
  estado.arribaDispositivo = [0, Math.sin((60 * Math.PI) / 180), Math.cos((60 * Math.PI) / 180)];
  let betaFiltrada = 60;

  function registrarInclinacion(beta) {
    if (!Number.isFinite(beta)) return;
    const betaSegura = limitar(beta, 25, 95);
    if (Math.abs(betaSegura - betaFiltrada) < 0.8) return; // Zona muerta anti-temblor de mano
    betaFiltrada = betaFiltrada + 0.14 * (betaSegura - betaFiltrada);
    const r = (betaFiltrada * Math.PI) / 180;
    estado.arribaDispositivo = [0, Math.sin(r), Math.cos(r)];
  }

  // Ejes del mundo (Este, Norte, Arriba) expresados en ejes del celular.
  // "Norte" aquí = hacia donde mira el usuario (dirección de la cámara + parte de arriba del celular).
  function ejesMundoEnDispositivo() {
    const u = estado.arribaDispositivo;
    let f = [0, 1, -1];
    const pu = f[0] * u[0] + f[1] * u[1] + f[2] * u[2];
    f = [f[0] - pu * u[0], f[1] - pu * u[1], f[2] - pu * u[2]];
    let nf = Math.hypot(f[0], f[1], f[2]);
    if (nf < 1e-3) { f = [0, 1, 0]; nf = 1; }
    f = [f[0] / nf, f[1] / nf, f[2] / nf];
    const e = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]]; // f × u
    return { e, f, u };
  }

  // Distancia focal en píxeles CSS: el video usa object-fit: cover, así que se escala y se recorta.
  function distanciaFocalPx(w, h) {
    const vw = videoAR && videoAR.videoWidth;
    const vh = videoAR && videoAR.videoHeight;
    const tanMedio = Math.tan((FOV_LARGO_GRADOS * Math.PI) / 360);
    if (vw && vh) {
      const escala = Math.max(w / vw, h / vh);
      return (escala * Math.max(vw, vh)) / 2 / tanMedio;
    }
    return Math.max(w, h) / 2 / tanMedio;
  }

  // Prepara la cámara de este cuadro. yawRad = desfase (la cámara mira yawRad a la derecha del pasillo).
  function crearCamara(w, h, yawRad) {
    const ang = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * (Math.PI / 180);
    return {
      w, h,
      ejes: ejesMundoEnDispositivo(),
      foco: distanciaFocalPx(w, h),
      cosY: Math.cos(yawRad), sinY: Math.sin(yawRad),
      cosP: Math.cos(ang), sinP: Math.sin(ang)
    };
  }

  // Proyecta un punto del marco del pasillo (x = metros a la derecha, z = metros hacia adelante,
  // y = altura sobre el piso) a pantalla. Devuelve null si queda detrás o demasiado cerca de la cámara.
  function proyectarPuntoPiso3D(xMetros, yMetros, zMetros, cam) {
    const lat = xMetros * cam.cosY - zMetros * cam.sinY;
    const fwd = xMetros * cam.sinY + zMetros * cam.cosY;
    const alt = yMetros - ALTURA_CAMARA;
    const { e, f, u } = cam.ejes;
    const dx = lat * e[0] + fwd * f[0] + alt * u[0];
    const dy = lat * e[1] + fwd * f[1] + alt * u[1];
    const dz = lat * e[2] + fwd * f[2] + alt * u[2];
    const prof = -dz; // la cámara trasera mira hacia -z
    if (prof < 0.25) return null;
    const px = dx * cam.cosP - dy * cam.sinP;
    const py = dx * cam.sinP + dy * cam.cosP;
    const sx = cam.w / 2 + (cam.foco * px) / prof;
    const sy = cam.h / 2 - (cam.foco * py) / prof;
    if (Math.abs(sx) > cam.w * 6 || Math.abs(sy) > cam.h * 6) return null;
    return { sx, sy, rz: prof, escala: cam.foco / prof };
  }

  // Camino que falta por recorrer, en el marco del pasillo actual (usuario en 0,0; pasillo hacia +z).
  function caminoLocal(maxMetros) {
    const { rumboTramo } = obtenerTramoActivo();
    const th = (rumboTramo * Math.PI) / 180;
    const s = Math.sin(th), c = Math.cos(th);
    const pts = [{ x: 0, z: 0 }];
    let largo = 0;
    for (let i = estado.indiceActual + 1; i < estado.ruta.length && largo < maxMetros; i++) {
      const dE = estado.ruta[i].x - estado.usuarioX;
      const dN = estado.ruta[i].z - estado.usuarioZ;
      const p = { x: dE * c - dN * s, z: dE * s + dN * c };
      const ant = pts[pts.length - 1];
      const seg = Math.hypot(p.x - ant.x, p.z - ant.z);
      if (seg < 0.05) continue;
      largo += seg;
      pts.push(p);
    }
    return { pts, largo };
  }

  // Punto y dirección a "s" metros sobre el camino
  function puntoEnCamino(pts, s) {
    let resto = s;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (resto <= seg || i === pts.length - 1) {
        const t = seg > 0 ? Math.min(1, resto / seg) : 0;
        return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
      }
      resto -= seg;
    }
    return { x: 0, z: 0, dx: 0, dz: 1 };
  }

  // Calcula si en el siguiente nodo de la ruta habrá que dar vuelta a la derecha o a la izquierda
  function obtenerGiroEnSiguienteNodo() {
    if (estado.ruta.length < 3 || estado.indiceActual + 2 >= estado.ruta.length) return null;
    const nA = estado.ruta[estado.indiceActual];
    const nB = estado.ruta[estado.indiceActual + 1];
    const nC = estado.ruta[estado.indiceActual + 2];
    const r1 = calcularRumboGrados(nA.x, nA.z, nB.x, nB.z);
    const r2 = calcularRumboGrados(nB.x, nB.z, nC.x, nC.z);
    const giro = diferenciaAngularGrados(r2, r1); // > 0 = vuelta a la derecha, < 0 = vuelta a la izquierda
    if (Math.abs(giro) < 20) return null;
    const derecha = giro > 0;
    const grados = Math.round(Math.abs(giro));
    return {
      derecha,
      grados,
      nodoGiro: nB,
      nodoSiguiente: nC,
      icono: derecha ? "➡️" : "⬅️",
      textoCorto: derecha ? `➡️ Gira a la derecha (${grados}°)` : `⬅️ Gira a la izquierda (${grados}°)`
    };
  }

  // Actualiza en vivo los letreros superiores para decir claramente "Gira a la derecha / izquierda"
  function actualizarIndicacionesGiroEnVivo(tramoVista, llegoAlFinal) {
    const { actual, siguiente, distRestanteTramo, rumboTramo } = tramoVista;
    const distTotalRestante = calcularDistanciaTotalRestante();
    const enDestino = llegoAlFinal || distTotalRestante < 0.8;
    const desfase = estado.desfaseMiradaGrados; // < 0: el nodo queda a la DERECHA; > 0: queda a la IZQUIERDA
    const absDesfase = Math.round(Math.abs(desfase));
    const mTramo = Math.round(distRestanteTramo);
    const cardinal = nombrePuntoCardinal(rumboTramo);
    const proximoGiro = obtenerGiroEnSiguienteNodo();

    if (hudCompass) {
      // La aguja apunta hacia el nodo respecto a la mirada actual del usuario
      hudCompass.style.transform = `rotate(${-desfase}deg)`;
    }
    if (arHeadingText) {
      arHeadingText.textContent = absDesfase > 18
        ? (desfase < 0 ? `➡️ Gira ${absDesfase}° a la derecha` : `⬅️ Gira ${absDesfase}° a la izquierda`)
        : `🧭 De frente (${Math.round(rumboTramo)}° ${cardinal})`;
    }

    if (enDestino) {
      if (arSignTurnIcon) arSignTurnIcon.textContent = "🏁";
      if (arSignTitle) arSignTitle.textContent = `¡Llegaste a ${actual.name}!`;
      if (arSignDist) arSignDist.textContent = `Destino alcanzado · 0 m restantes`;
      return;
    }

    if (absDesfase > 135) {
      if (arSignTurnIcon) arSignTurnIcon.textContent = "🔄";
      if (arSignTitle) arSignTitle.textContent = `Da media vuelta (${absDesfase}°)`;
      if (arSignDist) arSignDist.textContent = `El nodo ${siguiente.id} (${siguiente.name}) está detrás de ti a ${mTramo} m`;
      hudInstruction.textContent = `🔄 Da media vuelta hacia ${siguiente.name}`;
    } else if (desfase < -18) {
      if (arSignTurnIcon) arSignTurnIcon.textContent = "➡️";
      if (arSignTitle) arSignTitle.textContent = `Gira a la derecha (${absDesfase}°)`;
      if (arSignDist) arSignDist.textContent = `Apunta hacia ${siguiente.id} · ${siguiente.name} (${mTramo} m)`;
      hudInstruction.textContent = `➡️ Gira a la derecha (${absDesfase}°) hacia ${siguiente.name}`;
    } else if (desfase > 18) {
      if (arSignTurnIcon) arSignTurnIcon.textContent = "⬅️";
      if (arSignTitle) arSignTitle.textContent = `Gira a la izquierda (${absDesfase}°)`;
      if (arSignDist) arSignDist.textContent = `Apunta hacia ${siguiente.id} · ${siguiente.name} (${mTramo} m)`;
      hudInstruction.textContent = `⬅️ Gira a la izquierda (${absDesfase}°) hacia ${siguiente.name}`;
    } else {
      // El usuario ya está alineado mirando al nodo quieto frente a él
      if (proximoGiro && distRestanteTramo <= 8) {
        if (arSignTurnIcon) arSignTurnIcon.textContent = proximoGiro.icono;
        if (arSignTitle) arSignTitle.textContent = `En ${mTramo} m: ${proximoGiro.textoCorto}`;
        if (arSignDist) arSignDist.textContent = `Al llegar a ${siguiente.name}, dobla hacia ${proximoGiro.nodoSiguiente.name}`;
        hudInstruction.textContent = `${proximoGiro.textoCorto} en ${siguiente.name}`;
      } else {
        if (arSignTurnIcon) arSignTurnIcon.textContent = "⬆️";
        if (arSignTitle) arSignTitle.textContent = `Camina de frente hacia ${siguiente.name}`;
        if (arSignDist) {
          arSignDist.textContent = proximoGiro
            ? `${mTramo} m de frente · En ${siguiente.id}: ${proximoGiro.textoCorto}`
            : `${mTramo} m de frente (${cardinal}) · El nodo está fijo frente a ti`;
        }
        hudInstruction.textContent = `⬆️ Camina ${mTramo} m de frente hacia ${siguiente.name}`;
      }
    }
  }

  function renderizarBucleAR(tiempoMs) {
    requestAnimationFrame(renderizarBucleAR);
    if (estado.modoVista !== "ar") return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    arCtx.clearRect(0, 0, w, h);

    // El nodo se queda QUIETO en el mundo real: rumboMirada es la dirección física del usuario
    // (estado.rumboUsuarioGrados), NO gira pegado al celular ni salta solo al cambiar de tramo.
    const tramoVista = obtenerTramoActivo();
    const rumboPasillo = tramoVista.rumboTramo;
    const llegoAlFinal = tramoVista.actual.id === tramoVista.siguiente.id;
    if (estado.rumboUsuarioGrados === null) {
      estado.rumboUsuarioGrados = rumboPasillo;
    }
    const rumboMirada = estado.rumboUsuarioGrados;
    // desfaseMiradaGrados < 0 significa que el nodo está a tu DERECHA; > 0 significa a tu IZQUIERDA
    estado.desfaseMiradaGrados = llegoAlFinal ? 0 : diferenciaAngularGrados(rumboMirada, rumboPasillo);

    actualizarIndicacionesGiroEnVivo(tramoVista, llegoAlFinal);

    const cam = crearCamara(w, h, (estado.desfaseMiradaGrados * Math.PI) / 180);
    const miraArriba = -estado.arribaDispositivo[2] > 0.05; // la cámara apunta arriba del horizonte

    if (arTurnHint && arTurnHintText) {
      const absD = Math.round(Math.abs(estado.desfaseMiradaGrados));
      if (miraArriba) {
        arTurnHint.hidden = false;
        arTurnHintText.textContent = "📱 Inclina un poco el celular hacia el piso para ver el camino";
      } else if (!llegoAlFinal && absD > 18) {
        arTurnHint.hidden = false;
        arTurnHintText.textContent =
          estado.desfaseMiradaGrados < 0
            ? `➡️ Gira a la derecha (${absD}°) hacia ${tramoVista.siguiente.name}`
            : `⬅️ Gira a la izquierda (${absD}°) hacia ${tramoVista.siguiente.name}`;
      } else {
        arTurnHint.hidden = true;
      }
    }

    const { siguiente, distRestanteTramo } = tramoVista;
    const enDestino = llegoAlFinal || distRestanteTramo < 0.8;
    const P = (x, y, z) => proyectarPuntoPiso3D(x, y, z, cam);

    // 1. Alfombra sobre el piso que sigue la ruta real (incluye la vuelta en el siguiente nodo)
    const camino = enDestino ? { pts: [{ x: 0, z: 0 }, { x: 0, z: 3 }], largo: 3 } : caminoLocal(18);
    const largoVisible = Math.min(18, camino.largo);
    const anchoMedio = 0.6;
    const paso = 0.6;
    const bordeIzq = [];
    const bordeDer = [];
    for (let s = 0.4; s < largoVisible - 0.01; s += paso) {
      const s2 = Math.min(largoVisible, s + paso);
      const a = puntoEnCamino(camino.pts, s);
      const b = puntoEnCamino(camino.pts, s2);
      // vector a la derecha de la dirección de avance: (dz, -dx)
      const aI = P(a.x - anchoMedio * a.dz, 0, a.z + anchoMedio * a.dx);
      const aD = P(a.x + anchoMedio * a.dz, 0, a.z - anchoMedio * a.dx);
      const bD = P(b.x + anchoMedio * a.dz, 0, b.z - anchoMedio * a.dx);
      const bI = P(b.x - anchoMedio * a.dz, 0, b.z + anchoMedio * a.dx);
      bordeIzq.push(aI); bordeDer.push(aD);
      if (!aI || !aD || !bD || !bI) continue;
      const alfa = Math.max(0.06, 0.6 * (1 - s / 18));
      arCtx.beginPath();
      arCtx.moveTo(aI.sx, aI.sy);
      arCtx.lineTo(aD.sx, aD.sy);
      arCtx.lineTo(bD.sx, bD.sy);
      arCtx.lineTo(bI.sx, bI.sy);
      arCtx.closePath();
      arCtx.fillStyle = enDestino ? `rgba(52, 199, 89, ${alfa})` : `rgba(0, 150, 255, ${alfa})`;
      arCtx.fill();
    }
    // Rieles laterales luminosos (se cortan donde un punto no es visible)
    arCtx.strokeStyle = enDestino ? "#4ade80" : "#38bdf8";
    arCtx.lineWidth = 3;
    [bordeIzq, bordeDer].forEach((borde) => {
      arCtx.beginPath();
      let abierto = false;
      borde.forEach((p) => {
        if (!p) { abierto = false; return; }
        if (abierto) arCtx.lineTo(p.sx, p.sy); else arCtx.moveTo(p.sx, p.sy);
        abierto = true;
      });
      arCtx.stroke();
    });

    // 2. Flechas chevron pegadas al piso que avanzan sobre la ruta
    const t = tiempoMs * 0.001;
    const velocidad = estado.caminandoSim || estado.navegando ? 0.9 : 0.55;
    const separacion = 1.5;
    const numFlechas = Math.max(1, Math.floor((largoVisible - 0.8) / separacion));
    const chevron = [[0, 0.45], [0.46, -0.16], [0.28, -0.34], [0, 0.08], [-0.28, -0.34], [-0.46, -0.16]];
    // De lejos a cerca para que las cercanas queden encima
    for (let i = numFlechas - 1; i >= 0; i--) {
      const s = 1.0 + ((i + t * velocidad) % numFlechas) * separacion;
      if (s > largoVisible - 0.3) continue;
      const c = puntoEnCamino(camino.pts, s);
      const rx = c.dz, rz = -c.dx; // derecha
      const vertices = chevron.map(([lado, frente]) =>
        P(c.x + lado * rx + frente * c.dx, 0.02, c.z + lado * rz + frente * c.dz)
      );
      if (vertices.some((v) => !v)) continue;

      const pulso = (Math.sin(t * 4.5 - i * 0.7) + 1) * 0.5;
      const alpha = Math.min(1, Math.max(0.3, 1.1 - s / 16));
      arCtx.beginPath();
      vertices.forEach((v, k) => (k === 0 ? arCtx.moveTo(v.sx, v.sy) : arCtx.lineTo(v.sx, v.sy)));
      arCtx.closePath();
      if (enDestino) {
        arCtx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
        arCtx.strokeStyle = "#ffffff";
      } else {
        const r = Math.round(pulso * 90);
        const g = Math.round(205 + pulso * 50);
        arCtx.fillStyle = `rgba(${r}, ${g}, 255, ${alpha})`;
        arCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      }
      arCtx.lineWidth = Math.max(1.2, 3 - s * 0.15);
      arCtx.fill();
      arCtx.stroke();
    }

    // 3. Pin QUIETO en la posición REAL del siguiente nodo (sin rebote ni giro con la cámara)
    const zPin = Math.max(1.5, distRestanteTramo);
    const pPinBase = P(0, 0, zPin);
    const pPinAlto = P(0, 1.6, zPin);

    const pinDentroDePantalla =
      pPinAlto && pPinAlto.sx >= 24 && pPinAlto.sx <= w - 24 && pPinAlto.sy >= 24 && pPinAlto.sy <= h - 24;

    if (pPinBase && pPinAlto) {
      const radioAnillo = limitar(0.5 * pPinBase.escala, 6, 60);
      arCtx.beginPath();
      arCtx.ellipse(pPinBase.sx, pPinBase.sy, radioAnillo, radioAnillo * 0.35, 0, 0, Math.PI * 2);
      arCtx.strokeStyle = enDestino ? "#4ade80" : "#38bdf8";
      arCtx.lineWidth = 3;
      arCtx.stroke();

      arCtx.beginPath();
      arCtx.moveTo(pPinBase.sx, pPinBase.sy);
      arCtx.lineTo(pPinAlto.sx, pPinAlto.sy);
      arCtx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      arCtx.lineWidth = 2.5;
      arCtx.stroke();

      const tamRombo = limitar(0.22 * pPinAlto.escala, 9, 30);
      arCtx.beginPath();
      arCtx.moveTo(pPinAlto.sx, pPinAlto.sy - tamRombo);
      arCtx.lineTo(pPinAlto.sx + tamRombo * 0.8, pPinAlto.sy);
      arCtx.lineTo(pPinAlto.sx, pPinAlto.sy + tamRombo);
      arCtx.lineTo(pPinAlto.sx - tamRombo * 0.8, pPinAlto.sy);
      arCtx.closePath();
      arCtx.fillStyle = estado.indiceActual >= estado.ruta.length - 2 ? "#ef4444" : "#34c759";
      arCtx.fill();
      arCtx.lineWidth = 2.5;
      arCtx.strokeStyle = "#ffffff";
      arCtx.stroke();

      const textoPin = `${siguiente.id} · ${siguiente.name} (${Math.round(distRestanteTramo)} m)`;
      arCtx.font = "800 12px Inter, -apple-system, sans-serif";
      const tw = arCtx.measureText(textoPin).width;
      const bx = limitar(pPinAlto.sx - tw / 2 - 10, 6, w - tw - 26);
      const by = pPinAlto.sy - tamRombo - 30;
      arCtx.fillStyle = "rgba(15, 23, 42, 0.88)";
      arCtx.beginPath();
      if (arCtx.roundRect) {
        arCtx.roundRect(bx, by, tw + 20, 24, 12);
      } else {
        arCtx.rect(bx, by, tw + 20, 24);
      }
      arCtx.fill();
      arCtx.strokeStyle = "#38bdf8";
      arCtx.lineWidth = 1.5;
      arCtx.stroke();

      arCtx.fillStyle = "#ffffff";
      arCtx.textAlign = "center";
      arCtx.fillText(textoPin, bx + (tw + 20) / 2, by + 16);
    }

    // 4. Indicador lateral grande cuando el nodo quieto queda a tu derecha o izquierda
    if (!enDestino && (!pinDentroDePantalla || Math.abs(estado.desfaseMiradaGrados) > 22)) {
      const haciaDerecha = estado.desfaseMiradaGrados < 0;
      const absGrados = Math.round(Math.abs(estado.desfaseMiradaGrados));
      const etiquetaGiro = haciaDerecha
        ? `Gira a la derecha (${absGrados}°) ➡️`
        : `⬅️ Gira a la izquierda (${absGrados}°)`;
      const subEtiqueta = `${siguiente.id} · ${siguiente.name} (${Math.round(distRestanteTramo)} m)`;

      arCtx.font = "800 14px Inter, -apple-system, sans-serif";
      const w1 = arCtx.measureText(etiquetaGiro).width;
      arCtx.font = "600 12px Inter, -apple-system, sans-serif";
      const w2 = arCtx.measureText(subEtiqueta).width;
      const boxW = Math.max(w1, w2) + 28;
      const boxH = 50;
      const boxX = haciaDerecha ? Math.max(12, w - boxW - 14) : 14;
      const boxY = Math.round(h * 0.44);

      arCtx.fillStyle = "rgba(15, 23, 42, 0.92)";
      arCtx.beginPath();
      if (arCtx.roundRect) {
        arCtx.roundRect(boxX, boxY, boxW, boxH, 14);
      } else {
        arCtx.rect(boxX, boxY, boxW, boxH);
      }
      arCtx.fill();
      arCtx.strokeStyle = "#f59e0b";
      arCtx.lineWidth = 2.5;
      arCtx.stroke();

      arCtx.fillStyle = "#fbbf24";
      arCtx.font = "800 14px Inter, -apple-system, sans-serif";
      arCtx.textAlign = "center";
      arCtx.fillText(etiquetaGiro, boxX + boxW / 2, boxY + 22);

      arCtx.fillStyle = "#ffffff";
      arCtx.font = "600 12px Inter, -apple-system, sans-serif";
      arCtx.fillText(subEtiqueta, boxX + boxW / 2, boxY + 40);
    }
  }

  // ============================================================================
  // 6. MAPA 2D INTERACTIVO Y MINIMAPA EN VIVO
  // ============================================================================
  function mundoACanvas(x, z) {
    const b = datos.bounds;
    const pad = 70;
    const w = campusCanvas.width - pad * 2;
    const h = campusCanvas.height - pad * 2;
    const nx = (x - b.minX) / (b.maxX - b.minX);
    const nz = (b.maxZ - z) / (b.maxZ - b.minZ);
    return {
      cx: pad + nx * w,
      cy: pad + nz * h
    };
  }

  function dibujarPoligonosCampus(contexto, proyectarPunto, modoOscuro) {
    const poligonos = datos.poligonos || [];
    if (!poligonos.length) return;
    const estilos = modoOscuro
      ? {
          pasto: { fill: "rgba(34, 197, 94, 0.14)", stroke: "rgba(74, 222, 128, 0.25)" },
          estacionamiento: { fill: "rgba(100, 116, 139, 0.18)", stroke: "rgba(148, 163, 184, 0.25)" },
          cancha: { fill: "rgba(245, 158, 11, 0.16)", stroke: "rgba(251, 191, 36, 0.3)" },
          edificio: { fill: "rgba(148, 163, 184, 0.22)", stroke: "rgba(203, 213, 225, 0.35)" },
          ibero: { fill: "rgba(200, 16, 46, 0.22)", stroke: "rgba(248, 113, 113, 0.42)" }
        }
      : {
          pasto: { fill: "rgba(187, 247, 208, 0.55)", stroke: "rgba(34, 197, 94, 0.35)" },
          estacionamiento: { fill: "rgba(226, 232, 240, 0.7)", stroke: "rgba(148, 163, 184, 0.45)" },
          cancha: { fill: "rgba(254, 243, 199, 0.75)", stroke: "rgba(217, 119, 6, 0.35)" },
          edificio: { fill: "rgba(203, 213, 225, 0.65)", stroke: "rgba(100, 116, 139, 0.45)" },
          ibero: { fill: "rgba(225, 29, 72, 0.14)", stroke: "rgba(200, 16, 46, 0.38)" }
        };

    poligonos.forEach((pol) => {
      if (!pol.pts || pol.pts.length < 3) return;
      const est = estilos[pol.tipo] || estilos.edificio;
      contexto.beginPath();
      pol.pts.forEach(([px, pz], idx) => {
        const p = proyectarPunto(px, pz);
        if (idx === 0) contexto.moveTo(p.x, p.y);
        else contexto.lineTo(p.x, p.y);
      });
      contexto.closePath();
      contexto.fillStyle = est.fill;
      contexto.fill();
      contexto.lineWidth = modoOscuro ? 1 : 1.5;
      contexto.strokeStyle = est.stroke;
      contexto.stroke();
    });
  }

  function dibujarMapa2D() {
    ctx.clearRect(0, 0, campusCanvas.width, campusCanvas.height);

    ctx.fillStyle = "#f4f3ee";
    ctx.fillRect(0, 0, campusCanvas.width, campusCanvas.height);

    ctx.strokeStyle = "rgba(0, 0, 0, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < campusCanvas.width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, campusCanvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < campusCanvas.height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(campusCanvas.width, y);
      ctx.stroke();
    }

    // Edificios, canchas y áreas verdes reales del campus IBERO (desde map.osm)
    dibujarPoligonosCampus(
      ctx,
      (x, z) => {
        const p = mundoACanvas(x, z);
        return { x: p.cx, y: p.cy };
      },
      false
    );

    // Pasillos base
    ctx.strokeStyle = "rgba(100, 116, 139, 0.28)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    datos.edges.forEach(([u, v]) => {
      const a = nodosPorId.get(u);
      const b = nodosPorId.get(v);
      if (!a || !b) return;
      const pa = mundoACanvas(a.x, a.z);
      const pb = mundoACanvas(b.x, b.z);
      ctx.beginPath();
      ctx.moveTo(pa.cx, pa.cy);
      ctx.lineTo(pb.cx, pb.cy);
      ctx.stroke();
    });

    // Ruta activa desde (usuarioX, usuarioZ)
    if (estado.ruta.length >= 2) {
      const posUsuario = mundoACanvas(estado.usuarioX, estado.usuarioZ);

      ctx.strokeStyle = "rgba(0, 113, 227, 0.2)";
      ctx.lineWidth = 14;
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(posUsuario.cx, posUsuario.cy);
      for (let i = estado.indiceActual + 1; i < estado.ruta.length; i++) {
        const p = mundoACanvas(estado.ruta[i].x, estado.ruta[i].z);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.stroke();

      ctx.strokeStyle = "#0071e3";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(posUsuario.cx, posUsuario.cy);
      for (let i = estado.indiceActual + 1; i < estado.ruta.length; i++) {
        const p = mundoACanvas(estado.ruta[i].x, estado.ruta[i].z);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.stroke();
    }

    // Nodos
    const idsEnRuta = new Set(estado.ruta.map((n) => n.id));
    datos.nodes.forEach((nodo) => {
      const { cx, cy } = mundoACanvas(nodo.x, nodo.z);
      const esOrigen = nodo.id === estado.origenId;
      const esDestino = nodo.id === estado.destinoId;
      const enRuta = idsEnRuta.has(nodo.id);

      let radio = 7;
      let fill = "#ffffff";
      let stroke = "#94a3b8";

      if (esDestino) {
        radio = 11;
        fill = "#c8102e";
        stroke = "#ffffff";
      } else if (esOrigen) {
        radio = 9;
        fill = "#34c759";
        stroke = "#ffffff";
      } else if (enRuta) {
        radio = 8;
        fill = "#0071e3";
        stroke = "#ffffff";
      }

      ctx.beginPath();
      ctx.arc(cx, cy, radio, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = stroke;
      ctx.stroke();

      if (estado.mostrarEtiquetas || enRuta) {
        const texto = `${nodo.id} · ${nodo.name}`;
        ctx.font = enRuta ? "700 12px Inter, sans-serif" : "600 11px Inter, sans-serif";
        const tw = ctx.measureText(texto).width;
        ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
        ctx.fillRect(cx - tw / 2 - 6, cy - radio - 24, tw + 12, 18);
        ctx.fillStyle = esDestino ? "#c8102e" : enRuta ? "#0071e3" : "#1c1c1e";
        ctx.textAlign = "center";
        ctx.fillText(texto, cx, cy - radio - 11);
      }
    });

    // Marcador en vivo del USUARIO ("TÚ")
    const posU = mundoACanvas(estado.usuarioX, estado.usuarioZ);
    const { rumboTramo } = obtenerTramoActivo();
    const rumboMirada = (rumboTramo + estado.desfaseMiradaGrados + 360) % 360;
    const radCanvas = ((rumboMirada - 90) * Math.PI) / 180;

    ctx.save();
    ctx.translate(posU.cx, posU.cy);
    ctx.rotate(radCanvas);
    ctx.fillStyle = "rgba(52, 199, 89, 0.28)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 38, -0.45, 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(posU.cx, posU.cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(52, 199, 89, 0.28)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(posU.cx, posU.cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#34c759";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.font = "800 11px Inter, sans-serif";
    ctx.fillStyle = "#065f46";
    ctx.textAlign = "center";
    ctx.fillText("TÚ", posU.cx, posU.cy + 24);
  }

  function dibujarMinimapa() {
    if (!miniCtx) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    miniCtx.clearRect(0, 0, w, h);

    miniCtx.fillStyle = "#0f172a";
    miniCtx.fillRect(0, 0, w, h);

    miniCtx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    miniCtx.lineWidth = 1;
    [28, 56, 82].forEach((r) => {
      miniCtx.beginPath();
      miniCtx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      miniCtx.stroke();
    });

    const escala = 0.65;
    const aMini = (x, z) => ({
      mx: w / 2 + (x - estado.usuarioX) * escala,
      my: h / 2 - (z - estado.usuarioZ) * escala
    });

    dibujarPoligonosCampus(
      miniCtx,
      (x, z) => {
        const p = aMini(x, z);
        return { x: p.mx, y: p.my };
      },
      true
    );

    miniCtx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    miniCtx.lineWidth = 2.5;
    datos.edges.forEach(([u, v]) => {
      const na = nodosPorId.get(u);
      const nb = nodosPorId.get(v);
      if (!na || !nb) return;
      const pa = aMini(na.x, na.z);
      const pb = aMini(nb.x, nb.z);
      miniCtx.beginPath();
      miniCtx.moveTo(pa.mx, pa.my);
      miniCtx.lineTo(pb.mx, pb.my);
      miniCtx.stroke();
    });

    if (estado.ruta.length >= 2) {
      miniCtx.strokeStyle = "#38bdf8";
      miniCtx.lineWidth = 4.5;
      miniCtx.lineCap = "round";
      miniCtx.beginPath();
      miniCtx.moveTo(w / 2, h / 2);
      for (let i = estado.indiceActual + 1; i < estado.ruta.length; i++) {
        const p = aMini(estado.ruta[i].x, estado.ruta[i].z);
        miniCtx.lineTo(p.mx, p.my);
      }
      miniCtx.stroke();
    }

    datos.nodes.forEach((n) => {
      const p = aMini(n.x, n.z);
      if (p.mx < -10 || p.mx > w + 10 || p.my < -10 || p.my > h + 10) return;
      miniCtx.beginPath();
      miniCtx.arc(p.mx, p.my, n.id === estado.destinoId ? 5.5 : 3.5, 0, Math.PI * 2);
      miniCtx.fillStyle = n.id === estado.destinoId ? "#ef4444" : "#cbd5e1";
      miniCtx.fill();
    });

    const { rumboTramo } = obtenerTramoActivo();
    const rumboMirada = (rumboTramo + estado.desfaseMiradaGrados + 360) % 360;
    const radMini = ((rumboMirada - 90) * Math.PI) / 180;

    miniCtx.save();
    miniCtx.translate(w / 2, h / 2);
    miniCtx.rotate(radMini);
    miniCtx.fillStyle = "rgba(56, 189, 248, 0.34)";
    miniCtx.beginPath();
    miniCtx.moveTo(0, 0);
    miniCtx.arc(0, 0, 34, -0.5, 0.5);
    miniCtx.closePath();
    miniCtx.fill();
    miniCtx.restore();

    miniCtx.beginPath();
    miniCtx.arc(w / 2, h / 2, 6.5, 0, Math.PI * 2);
    miniCtx.fillStyle = "#34c759";
    miniCtx.fill();
    miniCtx.lineWidth = 2;
    miniCtx.strokeStyle = "#ffffff";
    miniCtx.stroke();
  }

  function centrarMapaEnUsuario() {
    const { cx, cy } = mundoACanvas(estado.usuarioX, estado.usuarioZ);
    mapViewport.scrollTo({
      left: Math.max(0, cx - mapViewport.clientWidth / 2),
      top: Math.max(0, cy - mapViewport.clientHeight / 2),
      behavior: "smooth"
    });
  }

  campusCanvas.addEventListener("click", (e) => {
    const rect = campusCanvas.getBoundingClientRect();
    const scaleX = campusCanvas.width / rect.width;
    const scaleY = campusCanvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    let mejorNodo = null;
    let mejorDist = 26;
    datos.nodes.forEach((nodo) => {
      const { cx, cy } = mundoACanvas(nodo.x, nodo.z);
      const d = Math.hypot(cx - clickX, cy - clickY);
      if (d < mejorDist) {
        mejorDist = d;
        mejorNodo = nodo;
      }
    });

    if (mejorNodo) {
      fijarUbicacionPorNodo(mejorNodo.id, "Mapa 2D");
    }
  });

  // ============================================================================
  // 7. ACTUALIZACIÓN DE INTERFAZ Y RECÁLCULO DE RUTA
  // ============================================================================
  function recalcularRutaCompleta() {
    const res = calcularRutaDijkstra(estado.origenId, estado.destinoId);
    estado.ruta = res.ruta;
    estado.distanciaTotal = res.distanciaTotal;
    estado.indiceActual = 0;
    estado.progresoTramo = 0;

    sincronizarCoordenadasUsuarioConProgreso();
    const tramoInicial = obtenerTramoActivo();
    estado.rumboUsuarioGrados = tramoInicial.rumboTramo;
    estado.desfaseMiradaGrados = 0;

    actualizarHUD();
    dibujarMapa2D();
    dibujarMinimapa();
  }

  function actualizarHUD() {
    const tramo = obtenerTramoActivo();
    const { actual, siguiente, distRestanteTramo, rumboTramo } = tramo;
    const distTotalRestante = calcularDistanciaTotalRestante();
    const minutos = Math.max(0.2, distTotalRestante / 80).toFixed(1);

    const nodoDestinoFinal = nodosPorId.get(estado.destinoId);
    hudStepBadge.textContent = `${actual.id} ${actual.name} ➔ ${nodoDestinoFinal ? nodoDestinoFinal.name : estado.destinoId}`;

    if (actual.id === siguiente.id || distTotalRestante < 0.8) {
      hudInstruction.textContent = `🎉 ¡Llegaste a ${actual.name}!`;
      hudSub.textContent = `Destino alcanzado · 0 m restantes`;
    } else {
      hudSub.textContent = `${Math.round(distTotalRestante)} m restantes · ~${minutos} min`;
    }

    if (estado.rumboUsuarioGrados === null) {
      estado.rumboUsuarioGrados = rumboTramo;
    }
    estado.desfaseMiradaGrados =
      actual.id === siguiente.id ? 0 : diferenciaAngularGrados(estado.rumboUsuarioGrados, rumboTramo);
    actualizarIndicacionesGiroEnVivo(tramo, actual.id === siguiente.id);

    kpiNodesCount.textContent = String(estado.ruta.length);
    kpiDistanceMeters.textContent = `${Math.round(estado.distanciaTotal)} m totales`;

    stepsList.innerHTML = "";
    estado.ruta.forEach((nodo, idx) => {
      const li = document.createElement("li");
      li.className = `itinerary-item ${idx === estado.indiceActual ? "is-current" : ""}`;
      let detalle = "📍 Origen";
      if (idx === estado.ruta.length - 1) {
        const dFin = idx > 0 ? Math.round(distanciaMetros(estado.ruta[idx - 1], nodo)) : 0;
        detalle = dFin > 0 ? `+${dFin} m · 🎯 Destino` : "🎯 Destino";
      } else if (idx > 0) {
        const d = Math.round(distanciaMetros(estado.ruta[idx - 1], nodo));
        const rEnt = calcularRumboGrados(estado.ruta[idx - 1].x, estado.ruta[idx - 1].z, nodo.x, nodo.z);
        const rSal = calcularRumboGrados(nodo.x, nodo.z, estado.ruta[idx + 1].x, estado.ruta[idx + 1].z);
        const giro = diferenciaAngularGrados(rSal, rEnt);
        let txtGiro = "⬆️ Sigue recto";
        if (giro >= 20) txtGiro = `➡️ Gira a la derecha (${Math.round(giro)}°)`;
        else if (giro <= -20) txtGiro = `⬅️ Gira a la izquierda (${Math.round(Math.abs(giro))}°)`;
        detalle = `+${d} m · ${txtGiro}`;
      }
      li.innerHTML = `
        <div><span class="itinerary-code">${nodo.id}</span><span>${nodo.name}</span></div>
        <span>${detalle}</span>
      `;
      li.addEventListener("click", () => {
        estado.indiceActual = idx;
        estado.progresoTramo = 0;
        sincronizarCoordenadasUsuarioConProgreso();
        if (idx > 0 && idx < estado.ruta.length - 1) {
          // Conserva el rumbo del pasillo del que venías para que veas el giro real ("Gira a la derecha/izquierda")
          const ant = estado.ruta[idx - 1];
          estado.rumboUsuarioGrados = calcularRumboGrados(ant.x, ant.z, nodo.x, nodo.z);
        } else {
          estado.rumboUsuarioGrados = obtenerTramoActivo().rumboTramo;
        }
        actualizarHUD();
        dibujarMapa2D();
        dibujarMinimapa();
        fijarEstadoMenu(true);
      });
      stepsList.appendChild(li);
    });
  }

  // ============================================================================
  // 8. NAVEGACIÓN REAL POR PASOS ("▶️ CAMINAR") + DEMO AUTOMÁTICA + GPS
  //    "Caminar" ya NO mueve al usuario solo: cuenta TUS pasos con el acelerómetro.
  //    La demo (avance automático a velocidad de persona) está en el menú: "🎬 Demo".
  // ============================================================================
  const PASO_METROS = limitar(Number(parametrosURL.get("paso")) || 0.7, 0.4, 1.1);
  const SENSIBILIDAD = limitar(Number(parametrosURL.get("sens")) || 1, 0.4, 2.5); // >1 = cuenta pasos más suaves
  const btnDemo = document.getElementById("btnDemo");
  let idIntervaloCaminata = null;

  function reiniciarSiYaLlego() {
    if (estado.indiceActual >= estado.ruta.length - 1) {
      estado.indiceActual = 0;
      estado.progresoTramo = 0;
      sincronizarCoordenadasUsuarioConProgreso();
      actualizarHUD();
      dibujarMapa2D();
      dibujarMinimapa();
    }
  }

  // ---- Demo automática (para presentar sin caminar): 1.3 m/s, como una persona ----
  function iniciarSimulacionCaminata() {
    if (estado.caminandoSim) return;
    if (estado.navegando) detenerNavegacion();
    reiniciarSiYaLlego();
    fijarEstadoMenu(true);
    estado.caminandoSim = true;
    if (btnDemo) btnDemo.textContent = "⏹️ Detener demo";
    locationModeBadge.textContent = "🎬 Demo: avanzando solo";
    idIntervaloCaminata = setInterval(() => avanzarMetrosEnRuta(0.13), 100);
  }

  function detenerSimulacionCaminata() {
    if (!estado.caminandoSim && !idIntervaloCaminata) return;
    estado.caminandoSim = false;
    if (idIntervaloCaminata) {
      clearInterval(idIntervaloCaminata);
      idIntervaloCaminata = null;
    }
    if (btnDemo) btnDemo.textContent = "🎬 Demo (avanza sola)";
    locationModeBadge.textContent = estado.gpsActivo
      ? "🛰️ Ubicación: GPS Activo"
      : `📍 ${estado.origenId} (QR + Pasos)`;
  }

  if (btnDemo) {
    btnDemo.addEventListener("click", () => {
      if (estado.caminandoSim) detenerSimulacionCaminata();
      else iniciarSimulacionCaminata();
    });
  }

  // ---- Navegación real: cada paso detectado avanza PASO_METROS sobre la ruta ----
  function iniciarNavegacion() {
    if (estado.navegando) return;
    detenerSimulacionCaminata();
    reiniciarSiYaLlego();
    estado.navegando = true;
    estado.pasosDetectados = 0;
    podometro.racha = 0;
    podometro.inicioNavMs = performance.now();
    fijarEstadoMenu(true);
    btnWalkSim.classList.add("is-walking");
    btnWalkSimText.textContent = "⏸️ Pausar";
    locationModeBadge.textContent = "👣 Camina con el celular al frente";
  }

  function detenerNavegacion(mensaje) {
    estado.navegando = false;
    btnWalkSim.classList.remove("is-walking");
    btnWalkSimText.textContent = "▶️ Caminar";
    locationModeBadge.textContent = mensaje || `⏸️ Pausado · ${estado.pasosDetectados} pasos`;
  }

  btnWalkSim.addEventListener("click", () => {
    if (estado.navegando) detenerNavegacion();
    else iniciarNavegacion();
  });

  // ---- Podómetro: detecta el "sube y baja" del cuerpo al caminar ----
  // 1) Se quita la gravedad (promedio lento) de la magnitud de la aceleración.
  // 2) Un paso = pico arriba seguido de valle abajo en menos de 0.8 s.
  // 3) Pasos separados entre 0.3 s y 2 s; solo cuentan tras 3 seguidos
  //    (así un movimiento de la mano o estar parado mirando NO te mueve en el mapa).
  const podometro = {
    gravedad: 9.81, suave: 0, fase: "abajo", picoMs: 0,
    ultimoPasoMs: -1e9, racha: 0, ultimaMuestraMs: 0, inicioNavMs: 0
  };

  function registrarPaso(ahora) {
    const dt = ahora - podometro.ultimoPasoMs;
    if (dt < 300) return; // demasiado rápido: sacudida
    podometro.racha = dt > 2000 ? 1 : podometro.racha + 1;
    podometro.ultimoPasoMs = ahora;
    if (podometro.racha < 3) return;
    const nuevos = podometro.racha === 3 ? 3 : 1; // al confirmar la racha se cuentan los 3
    estado.pasosDetectados += nuevos;
    if (estado.navegando) {
      avanzarMetrosEnRuta(nuevos * PASO_METROS);
      if (estado.navegando) {
        const aviso = Math.abs(estado.desfaseMiradaGrados) > 100 ? " · ⚠️ vas al revés" : "";
        locationModeBadge.textContent = `👣 ${estado.pasosDetectados} pasos${aviso}`;
      }
    }
  }

  window.addEventListener("devicemotion", (e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.x === undefined) return;
    const ahora = performance.now();
    podometro.ultimaMuestraMs = ahora;
    const mag = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    podometro.gravedad += 0.01 * (mag - podometro.gravedad);
    podometro.suave += 0.3 * (mag - podometro.gravedad - podometro.suave);
    const v = podometro.suave * SENSIBILIDAD;
    if (podometro.fase === "abajo" && v > 0.9) {
      podometro.fase = "arriba";
      podometro.picoMs = ahora;
    } else if (podometro.fase === "arriba" && v < -0.5) {
      podometro.fase = "abajo";
      if (ahora - podometro.picoMs < 800) registrarPaso(ahora);
    }
  });

  // Si el celular no manda datos de movimiento, avisar para usar "Siguiente"
  setInterval(() => {
    if (!estado.navegando) return;
    const ahora = performance.now();
    if (ahora - podometro.inicioNavMs > 3000 && ahora - podometro.ultimaMuestraMs > 3000) {
      locationModeBadge.textContent = "⚠️ Sin sensor de pasos: usa 'Siguiente'";
    }
  }, 1000);

  // ---- Giroscopio / Orientación: mantiene el nodo QUIETO en el mundo real ----
  // Se integra el giro horizontal del giroscopio (alpha/beta/gamma sin bloqueo de cardán)
  // sobre estado.rumboUsuarioGrados, ignorando el ruido magnético de interiores y el temblor de la mano.
  estado.calibracionGrados = 0;
  estado.brujulaAbsoluta = false;
  estado.calibrado = false;

  function rumboCamaraDesdeEuler(alpha, beta, gamma) {
    // Proyecta el eje de la cámara trasera (-Z inclinado 20° hacia +Y) al plano horizontal.
    // Así no hay singularidad (gimbal lock) ni cuando el celular está vertical (beta ≈ 90°)
    // ni cuando está plano (beta ≈ 0°).
    const r = Math.PI / 180;
    const cB = Math.cos(beta * r), sB = Math.sin(beta * r);
    const cG = Math.cos(gamma * r), sG = Math.sin(gamma * r) * 0.2;
    const cA = Math.cos(alpha * r), sA = Math.sin(alpha * r);
    const kY = 0.342, kZ = 0.940; // sin(20°), cos(20°)
    const pitchFactor = sB * kZ + cB * kY;
    const vx = -cA * sG * kZ - sA * pitchFactor * cG;
    const vy = -sA * sG * kZ + cA * pitchFactor * cG;
    return ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
  }

  function registrarRumboSensor(rumboGyro, absoluto) {
    if (!Number.isFinite(rumboGyro)) return;
    // Evitar doble lectura en Android cuando disparan tanto deviceorientationabsolute como deviceorientation
    if (estado.brujulaAbsoluta && !absoluto) return;
    if (absoluto) estado.brujulaAbsoluta = true;

    if (estado.ultimoRumboGyro === null) {
      estado.ultimoRumboGyro = rumboGyro;
      estado.brjSensorActual = rumboGyro;
      return;
    }

    const delta = diferenciaAngularGrados(rumboGyro, estado.ultimoRumboGyro);
    estado.ultimoRumboGyro = rumboGyro;
    estado.brjSensorActual = rumboGyro;

    // Zona muerta (< 0.45°) para que con el celular en la mano el nodo se quede 100% QUIETO,
    // y filtro de picos (> 55°) por si el sensor salta en un cuadro.
    if (Math.abs(delta) < 0.45 || Math.abs(delta) > 55) return;

    if (estado.rumboUsuarioGrados === null) {
      estado.rumboUsuarioGrados = obtenerTramoActivo().rumboTramo;
    }
    estado.rumboUsuarioGrados = (estado.rumboUsuarioGrados + delta * 0.85 + 360) % 360;
    dibujarMinimapa();
  }

  function manejarOrientacion(e, esEventoAbsoluto) {
    if (typeof e.beta === "number") registrarInclinacion(e.beta);
    if (typeof e.alpha !== "number" || e.alpha === null) return;
    const rumbo = rumboCamaraDesdeEuler(e.alpha, e.beta || 0, e.gamma || 0);
    registrarRumboSensor(rumbo, esEventoAbsoluto || e.absolute === true);
  }

  const listenerOrientacionAbs = (e) => manejarOrientacion(e, true);
  const listenerOrientacionRel = (e) => manejarOrientacion(e, false);
  window.addEventListener("deviceorientationabsolute", listenerOrientacionAbs, true);
  window.addEventListener("deviceorientation", listenerOrientacionRel, true);

  // "Centrar flechas": alinea la dirección actual del usuario con el pasillo hacia el siguiente nodo.
  btnAlignArrows.addEventListener("click", () => {
    const { rumboTramo } = obtenerTramoActivo();
    estado.rumboUsuarioGrados = rumboTramo;
    estado.calibrado = true;
    estado.desfaseMiradaGrados = 0;
    if (arTurnHint) arTurnHint.hidden = true;
    actualizarHUD();
    dibujarMinimapa();
  });

  // El GPS usa latLonAMetros (sección 1), igual que osm_a_unity.py
  btnToggleGps.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      alert("Tu navegador no soporta geolocalización GPS.");
      return;
    }
    if (estado.gpsActivo) {
      navigator.geolocation.clearWatch(estado.gpsWatchId);
      estado.gpsActivo = false;
      btnToggleGps.textContent = "🛰️ Activar GPS Real";
      locationModeBadge.textContent = "📍 Modo: QR + Pasos";
      return;
    }

    estado.gpsActivo = true;
    btnToggleGps.textContent = "🛰️ GPS Activo (Apagar)";
    locationModeBadge.textContent = "🛰️ Buscando GPS...";

    estado.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const { x: dxMetros, z: dzMetros } = latLonAMetros(latitude, longitude);

        if (Math.hypot(dxMetros, dzMetros) < 600) {
          estado.usuarioX = dxMetros;
          estado.usuarioZ = dzMetros;
          locationModeBadge.textContent = `🛰️ GPS IBERO (±${Math.round(pos.coords.accuracy)}m)`;
          dibujarMapa2D();
          dibujarMinimapa();
        } else {
          locationModeBadge.textContent = "📍 Fuera de IBERO (Usa QR o ▶️ Caminar)";
        }
      },
      () => {
        locationModeBadge.textContent = "📍 Sin GPS (Usa QR o ▶️ Caminar)";
      },
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
  });

  // ============================================================================
  // 9. CÁMARA WEB Y ESCÁNER DE CÓDIGOS QR
  // ============================================================================
  let streamCamara = null;
  let detectorQR = null;          // BarcodeDetector nativo (Chrome Android)
  let jsQRCargando = false;       // Respaldo jsQR (iPhone/Safari y navegadores sin BarcodeDetector)
  const lienzoQR = document.createElement("canvas");
  const ctxQR = lienzoQR.getContext("2d", { willReadFrequently: true });

  if ("BarcodeDetector" in window) {
    try {
      detectorQR = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch (_) {
      detectorQR = null;
    }
  }

  function cargarJsQRSiHaceFalta() {
    if (detectorQR || typeof window.jsQR === "function" || jsQRCargando) return;
    jsQRCargando = true;
    const s = document.createElement("script");
    s.src = "vendor/jsQR.js";
    s.async = true;
    s.onerror = () => {
      jsQRCargando = false;
      locationModeBadge.textContent = "⚠️ Lector QR no disponible: usa los botones de nodo";
    };
    document.head.appendChild(s);
  }

  async function leerQRDeVideo(video) {
    if (detectorQR) {
      const codigos = await detectorQR.detect(video);
      return codigos && codigos.length > 0 ? codigos[0].rawValue || "" : null;
    }
    if (typeof window.jsQR !== "function" || !video.videoWidth) return null;
    const escala = Math.min(1, 640 / video.videoWidth);
    lienzoQR.width = Math.round(video.videoWidth * escala);
    lienzoQR.height = Math.round(video.videoHeight * escala);
    ctxQR.drawImage(video, 0, 0, lienzoQR.width, lienzoQR.height);
    const img = ctxQR.getImageData(0, 0, lienzoQR.width, lienzoQR.height);
    const codigo = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
    return codigo ? codigo.data : null;
  }

  async function activarCamara(videoEl) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      locationModeBadge.textContent = window.isSecureContext
        ? "⚠️ Este navegador no permite usar la cámara"
        : "⚠️ La cámara requiere abrir la página con https://";
      return;
    }
    try {
      if (!streamCamara) {
        streamCamara = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
      }
      videoEl.srcObject = streamCamara;
      await videoEl.play();
      cargarJsQRSiHaceFalta();
    } catch (err) {
      console.warn("ARGOS cámara:", err);
      locationModeBadge.textContent =
        err && err.name === "NotAllowedError"
          ? "📷 Permite la cámara en el navegador y recarga"
          : "📷 Toca la pantalla para activar la cámara";
    }
  }

  // iPhone/iPad (iOS 13+): el giroscopio y el podómetro requieren permiso pedido dentro de un toque
  // y re-registrar los listeners DESPUÉS de que requestPermission() devuelva "granted".
  let permisosSensoresPedidos = false;
  async function solicitarPermisosSensores() {
    if (permisosSensoresPedidos) return;
    permisosSensoresPedidos = true;
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
        const resO = await DeviceOrientationEvent.requestPermission();
        if (resO === "granted") {
          window.removeEventListener("deviceorientationabsolute", listenerOrientacionAbs, true);
          window.removeEventListener("deviceorientation", listenerOrientacionRel, true);
          window.addEventListener("deviceorientationabsolute", listenerOrientacionAbs, true);
          window.addEventListener("deviceorientation", listenerOrientacionRel, true);
        }
      }
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === "function") {
        await DeviceMotionEvent.requestPermission();
      }
    } catch (err) {
      console.warn("ARGOS sensores:", err);
    }
    // Reintentar la cámara si el navegador exigía un gesto del usuario para reproducir el video
    const v = document.getElementById("arVideo");
    if (v && (!v.srcObject || v.paused)) activarCamara(v);
  }
  document.addEventListener("click", solicitarPermisosSensores, { once: true, capture: true });
  document.addEventListener("touchend", solicitarPermisosSensores, { once: true, capture: true });

  function fijarUbicacionPorNodo(idNodo, fuente = "QR") {
    if (!nodosPorId.has(idNodo)) return;
    detenerSimulacionCaminata();
    estado.origenId = idNodo;
    selectOrigen.value = idNodo;
    if (estado.destinoId === idNodo) {
      estado.destinoId = idNodo === "N10" ? "N07" : "N10";
      selectDestino.value = estado.destinoId;
    }
    const nodo = nodosPorId.get(idNodo);
    locationModeBadge.textContent = `📍 ${fuente}: ${nodo.id} ${nodo.name}`;
    recalcularRutaCompleta();
    centrarMapaEnUsuario();
    fijarEstadoMenu(true);

    const dlg = document.getElementById("dialogQrScanner");
    if (dlg && dlg.open) dlg.close();
  }

  let leyendoQR = false;
  setInterval(async () => {
    if (!streamCamara || leyendoQR) return;
    const videoActivo = document.getElementById("dialogQrScanner")?.open
      ? document.getElementById("qrScannerVideo")
      : document.getElementById("arVideo");
    if (!videoActivo || videoActivo.readyState < 2) return;
    leyendoQR = true;
    try {
      const leido = await leerQRDeVideo(videoActivo);
      if (leido) {
        const texto = leido.trim();
        const match = texto.match(/N\d{2}/i);
        if (match) {
          const idDetectado = match[0].toUpperCase();
          if (nodosPorId.has(idDetectado) && idDetectado !== estado.origenId) {
            fijarUbicacionPorNodo(idDetectado, "QR Escaneado");
          }
        }
      }
    } catch (_) {
    } finally {
      leyendoQR = false;
    }
  }, 700);

  // ============================================================================
  // 10. SELECTORES, TARJETAS QR Y EVENTOS
  // ============================================================================
  function inicializarControles() {
    datos.nodes.forEach((nodo) => {
      const optO = document.createElement("option");
      optO.value = nodo.id;
      optO.textContent = `${nodo.id} — ${nodo.name}`;
      selectOrigen.appendChild(optO);

      const optD = document.createElement("option");
      optD.value = nodo.id;
      optD.textContent = `${nodo.id} — ${nodo.name}`;
      selectDestino.appendChild(optD);
    });

    selectOrigen.value = estado.origenId;
    selectDestino.value = estado.destinoId;

    selectOrigen.addEventListener("change", () => {
      fijarUbicacionPorNodo(selectOrigen.value, "Origen");
    });

    selectDestino.addEventListener("change", () => {
      estado.destinoId = selectDestino.value;
      recalcularRutaCompleta();
      fijarEstadoMenu(true);
    });

    btnInvert.addEventListener("click", () => {
      const temp = estado.origenId;
      estado.origenId = estado.destinoId;
      estado.destinoId = temp;
      selectOrigen.value = estado.origenId;
      selectDestino.value = estado.destinoId;
      recalcularRutaCompleta();
      fijarEstadoMenu(true);
    });

    btnNextNode.addEventListener("click", () => {
      if (estado.indiceActual < estado.ruta.length - 1) {
        const a = estado.ruta[estado.indiceActual];
        const b = estado.ruta[estado.indiceActual + 1];
        // Conservar el rumbo del tramo que acabas de caminar para que el siguiente nodo NO gire solo
        // y la app te indique "➡️ Gira a la derecha" o "⬅️ Gira a la izquierda".
        estado.rumboUsuarioGrados = calcularRumboGrados(a.x, a.z, b.x, b.z);
        estado.indiceActual += 1;
        estado.progresoTramo = 0;
      } else {
        estado.indiceActual = 0;
        estado.progresoTramo = 0;
        sincronizarCoordenadasUsuarioConProgreso();
        estado.rumboUsuarioGrados = obtenerTramoActivo().rumboTramo;
      }
      sincronizarCoordenadasUsuarioConProgreso();
      actualizarHUD();
      dibujarMapa2D();
      dibujarMinimapa();
    });

    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [o, d] = btn.dataset.preset.split(",");
        estado.origenId = o;
        estado.destinoId = d;
        selectOrigen.value = o;
        selectDestino.value = d;
        recalcularRutaCompleta();
        fijarEstadoMenu(true);
      });
    });

    function cambiarVista(modo) {
      estado.modoVista = modo;
      const esAR = modo === "ar";
      tabAR.classList.toggle("is-active", esAR);
      tabMap.classList.toggle("is-active", !esAR);
      tabAR.setAttribute("aria-selected", String(esAR));
      tabMap.setAttribute("aria-selected", String(!esAR));
      viewAR.classList.toggle("is-visible", esAR);
      viewMap.classList.toggle("is-visible", !esAR);

      if (esAR) {
        activarCamara(document.getElementById("arVideo"));
      } else {
        setTimeout(centrarMapaEnUsuario, 80);
      }
    }

    tabAR.addEventListener("click", () => cambiarVista("ar"));
    tabMap.addEventListener("click", () => cambiarVista("map"));
    document.getElementById("arMinimap").addEventListener("click", () => cambiarVista("map"));

    btnCenterRoute.addEventListener("click", centrarMapaEnUsuario);
    btnToggleLabels.addEventListener("click", () => {
      estado.mostrarEtiquetas = !estado.mostrarEtiquetas;
      dibujarMapa2D();
    });

    const chipsContainer = document.getElementById("simulatedQrChips");
    datos.nodes.forEach((nodo) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-pill";
      chip.textContent = `${nodo.id} · ${nodo.name}`;
      chip.addEventListener("click", () => fijarUbicacionPorNodo(nodo.id, "QR"));
      chipsContainer.appendChild(chip);
    });

    // Generador QR nativo offline (ISO/IEC 18004 Versión 1-M, 21x21) para etiquetas tipo "ARGOS:N01"
    function generarSvgQR(texto) {
      const N = 21;
      const mat = Array.from({ length: N }, () => new Uint8Array(N));
      const res = Array.from({ length: N }, () => new Uint8Array(N));
      const fijar = (r, c, v) => {
        if (r >= 0 && r < N && c >= 0 && c < N) {
          mat[r][c] = v ? 1 : 0;
          res[r][c] = 1;
        }
      };
      // 1. Patrones de búsqueda (7x7) + separadores blancos
      const ponerFinder = (r0, c0) => {
        for (let dr = -1; dr <= 7; dr++) {
          for (let dc = -1; dc <= 7; dc++) {
            const en7 = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
            const borde = dr === 0 || dr === 6 || dc === 0 || dc === 6;
            const centro = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
            fijar(r0 + dr, c0 + dc, en7 && (borde || centro));
          }
        }
      };
      ponerFinder(0, 0);
      ponerFinder(0, 14);
      ponerFinder(14, 0);
      // 2. Patrones de sincronización (fila 6 y columna 6)
      for (let i = 8; i <= 12; i++) {
        fijar(6, i, i % 2 === 0);
        fijar(i, 6, i % 2 === 0);
      }
      // 3. Información de formato (Nivel M = 01, Máscara 0 = 000 -> BCH 0x5412) + módulo oscuro (13, 8)
      fijar(13, 8, 1);
      const fmt = 0x5412;
      const posTL = [
        [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [7, 8], [8, 8],
        [8, 7], [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0]
      ];
      for (let i = 0; i < 15; i++) {
        const bit = (fmt >> i) & 1;
        fijar(posTL[i][0], posTL[i][1], bit);
        if (i < 8) fijar(8, 20 - i, bit);
        else fijar(6 + i, 8, bit);
      }
      // 4. Codificación Byte Mode (16 bytes de datos + 10 bytes Reed-Solomon ECC en GF(256))
      const bytes = Array.from(texto).map((ch) => ch.charCodeAt(0) & 0xff);
      const bits = [];
      const pushBits = (val, len) => {
        for (let b = len - 1; b >= 0; b--) bits.push((val >> b) & 1);
      };
      pushBits(0b0100, 4);
      pushBits(bytes.length, 8);
      bytes.forEach((b) => pushBits(b, 8));
      pushBits(0, Math.min(4, 128 - bits.length));
      while (bits.length % 8 !== 0) bits.push(0);
      const data = [];
      for (let i = 0; i < bits.length; i += 8) {
        let v = 0;
        for (let b = 0; b < 8; b++) v = (v << 1) | bits[i + b];
        data.push(v);
      }
      const pads = [0xec, 0x11];
      while (data.length < 16) data.push(pads[data.length % 2]);
      // Tablas GF(256) con polinomio primitivo 0x11d y generador grado 10
      const exp = new Uint8Array(512);
      const log = new Uint8Array(256);
      let x = 1;
      for (let i = 0; i < 255; i++) {
        exp[i] = x;
        exp[i + 255] = x;
        log[x] = i;
        x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
      }
      const mul = (a, b) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);
      let gen = [1];
      for (let i = 0; i < 10; i++) {
        const next = new Array(gen.length + 1).fill(0);
        for (let j = 0; j < gen.length; j++) {
          next[j] ^= gen[j];
          next[j + 1] ^= mul(gen[j], exp[i]);
        }
        gen = next;
      }
      const ecc = new Uint8Array(10);
      for (const d of data) {
        const factor = d ^ ecc[0];
        ecc.copyWithin(0, 1);
        ecc[9] = 0;
        for (let j = 0; j < 10; j++) ecc[j] ^= mul(gen[j + 1], factor);
      }
      const todos = [...data, ...ecc];
      // 5. Colocación en zig-zag de 2 columnas + Máscara 0 ((r + c) % 2 === 0)
      let bitIdx = 0;
      let subiendo = true;
      for (let c = N - 1; c > 0; c -= 2) {
        if (c === 6) c--;
        for (let paso = 0; paso < N; paso++) {
          const r = subiendo ? N - 1 - paso : paso;
          for (let dc = 0; dc < 2; dc++) {
            const col = c - dc;
            if (res[r][col]) continue;
            const bit = bitIdx < todos.length * 8 ? (todos[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1 : 0;
            bitIdx++;
            mat[r][col] = bit ^ ((r + col) % 2 === 0 ? 1 : 0);
          }
        }
        subiendo = !subiendo;
      }
      let rects = "";
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          if (mat[r][c]) rects += `<rect x="${c}" y="${r}" width="1" height="1"/>`;
        }
      }
      return `<svg viewBox="-2 -2 25 25" width="108" height="108" shape-rendering="crispEdges" style="background:#fff;border-radius:8px;border:1px solid #cbd5e1;display:block;"><rect x="-2" y="-2" width="25" height="25" fill="#ffffff"/><g fill="#111827">${rects}</g></svg>`;
    }

    const qrGrid = document.getElementById("qrCardsGrid");
    datos.nodes.forEach((nodo) => {
      const card = document.createElement("div");
      card.className = "qr-card-item";
      const qrBox = document.createElement("div");
      qrBox.style.minHeight = "116px";
      qrBox.style.display = "flex";
      qrBox.style.flexDirection = "column";
      qrBox.style.alignItems = "center";
      qrBox.style.justifyContent = "center";
      qrBox.style.gap = "4px";
      qrBox.innerHTML = `${generarSvgQR(`ARGOS:${nodo.id}`)}<code style="font-size:0.7rem;color:#334155;">ARGOS:${nodo.id}</code>`;

      card.innerHTML = `
        <strong style="font-size:0.8rem;color:var(--accent);">${nodo.id}</strong>
        <span style="font-size:0.75rem;font-weight:600;">${nodo.name}</span>
      `;
      card.appendChild(qrBox);

      const btnAqui = document.createElement("button");
      btnAqui.type = "button";
      btnAqui.className = "preset-pill";
      btnAqui.style.fontSize = "0.7rem";
      btnAqui.textContent = "📍 Ubicarse aquí";
      btnAqui.addEventListener("click", () => {
        fijarUbicacionPorNodo(nodo.id, "Tarjeta QR");
        document.getElementById("dialogQrCards")?.close();
      });
      card.appendChild(btnAqui);
      qrGrid.appendChild(card);
    });

    document.getElementById("btnPrintCards")?.addEventListener("click", () => window.print());
  }

  // ============================================================================
  // 10b. PONER PINES CON GPS: corregir en campo la posición real de cada nodo
  //      Se promedian ~20 s de lecturas GPS (pesadas por precisión) y se guardan en el celular.
  //      "Enviar resultados" genera el CSV con el formato de proyecto/tools/lugares_propios.csv.
  // ============================================================================
  function configurarPines() {
    const dlg = document.getElementById("dialogPines");
    if (!dlg) return;
    const selectPin = document.getElementById("selectPin");
    const btnGuardar = document.getElementById("btnGuardarPin");
    const txtEstado = document.getElementById("pinEstado");
    const lista = document.getElementById("listaPines");
    const btnEnviar = document.getElementById("btnEnviarPines");
    const btnBorrar = document.getElementById("btnBorrarPines");
    const SEGUNDOS = 20;

    datos.nodes.forEach((n) => {
      const o = document.createElement("option");
      o.value = n.id;
      o.textContent = `${n.id} — ${n.name}`;
      selectPin.appendChild(o);
    });

    const movidoMetros = (id) => {
      const n = nodosPorId.get(id);
      const o = posicionOriginal.get(id);
      return Math.hypot(n.x - o.x, n.z - o.z);
    };

    function pintarLista() {
      const pines = leerPines();
      lista.innerHTML = "";
      let cuantos = 0;
      datos.nodes.forEach((n) => {
        const p = pines[n.id];
        if (!p) return;
        cuantos++;
        const li = document.createElement("li");
        li.style.padding = "3px 0";
        li.textContent = `✅ ${n.id} ${n.name} · ±${p.acc} m · se movió ${Math.round(movidoMetros(n.id))} m`;
        lista.appendChild(li);
      });
      btnEnviar.textContent = `📤 Enviar resultados (${cuantos}/${datos.nodes.length})`;
    }

    let idWatch = null;
    let temporizador = null;
    let reloj = null;
    let muestras = [];
    let idMidiendo = null;
    let t0 = 0;

    function detenerCaptura() {
      if (idWatch !== null) navigator.geolocation.clearWatch(idWatch);
      idWatch = null;
      clearTimeout(temporizador);
      clearInterval(reloj);
      btnGuardar.textContent = "📍 Guardar mi posición aquí";
    }

    function mostrarProgreso() {
      const seg = Math.round((Date.now() - t0) / 1000);
      const mejor = muestras.length ? Math.round(Math.min(...muestras.map((m) => m.acc))) : null;
      txtEstado.textContent = muestras.length
        ? `⏳ Midiendo ${idMidiendo}… ${seg}/${SEGUNDOS} s · ${muestras.length} lecturas · mejor ±${mejor} m. No te muevas.`
        : `⏳ Buscando señal GPS… ${seg} s`;
    }

    function terminarCaptura() {
      detenerCaptura();
      if (!muestras.length) {
        txtEstado.textContent = "❌ No llegó ninguna lectura buena. Sal a un lugar sin techo y vuelve a intentar.";
        return;
      }
      // Solo las lecturas cercanas a la mejor precisión, promediadas con peso 1/precisión²
      const mejor = Math.min(...muestras.map((m) => m.acc));
      const usar = muestras.filter((m) => m.acc <= Math.max(mejor * 1.5, mejor + 3));
      let sw = 0, slat = 0, slon = 0;
      usar.forEach((m) => {
        const wgt = 1 / (m.acc * m.acc);
        sw += wgt; slat += m.lat * wgt; slon += m.lon * wgt;
      });
      const pines = leerPines();
      pines[idMidiendo] = {
        lat: Number((slat / sw).toFixed(7)),
        lon: Number((slon / sw).toFixed(7)),
        acc: Math.round(mejor),
        n: usar.length,
        t: new Date().toISOString()
      };
      guardarPinesLocal(pines);
      aplicarPines();
      reconstruirGrafo();
      recalcularRutaCompleta();
      const n = nodosPorId.get(idMidiendo);
      txtEstado.textContent = `✅ ${n.id} ${n.name} guardado (±${Math.round(mejor)} m). Se movió ${Math.round(movidoMetros(n.id))} m respecto al mapa anterior.`;
      if (navigator.vibrate) navigator.vibrate(150);
      pintarLista();
    }

    btnGuardar.addEventListener("click", () => {
      if (idWatch !== null) { terminarCaptura(); return; } // tocar otra vez = terminar antes
      if (!("geolocation" in navigator)) {
        txtEstado.textContent = "❌ Este navegador no da ubicación GPS.";
        return;
      }
      muestras = [];
      idMidiendo = selectPin.value;
      t0 = Date.now();
      btnGuardar.textContent = "⏹️ Terminar ya";
      mostrarProgreso();
      reloj = setInterval(mostrarProgreso, 1000);
      idWatch = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (!Number.isFinite(accuracy) || accuracy > 60) return; // lectura muy mala: ignorar
          muestras.push({ lat: latitude, lon: longitude, acc: Math.max(1, accuracy) });
          mostrarProgreso();
        },
        (err) => {
          txtEstado.textContent = err && err.code === 1
            ? "❌ Permite la ubicación: Ajustes › Privacidad › Localización › Safari → Mientras se usa."
            : "⚠️ Sin señal GPS todavía… sigue quieto, de preferencia sin techo.";
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
      );
      temporizador = setTimeout(terminarCaptura, SEGUNDOS * 1000);
    });

    dlg.addEventListener("close", () => { if (idWatch !== null) terminarCaptura(); });
    const abrir = document.querySelector('[commandfor="dialogPines"][command="show-modal"]');
    if (abrir) abrir.addEventListener("click", () => {
      if (idWatch === null) selectPin.value = estado.origenId;
      pintarLista();
    });

    function textoCSV() {
      const pines = leerPines();
      const filas = ["nombre,lat,lon,tipo,id,precision_m,fuente"];
      datos.nodes.forEach((n) => {
        const p = pines[n.id];
        const o = posicionOriginal.get(n.id);
        const lat = p ? p.lat : o.lat;
        const lon = p ? p.lon : o.lon;
        filas.push(`${n.name},${lat},${lon},destino,${n.id},${p ? p.acc : ""},${p ? "gps" : "mapa"}`);
      });
      return filas.join("\n");
    }

    btnEnviar.addEventListener("click", async () => {
      const texto = textoCSV();
      try {
        if (navigator.share) {
          await navigator.share({ title: "ARGOS pines GPS", text: texto });
          return;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return; // el usuario cerró el menú de compartir
      }
      try {
        await navigator.clipboard.writeText(texto);
        txtEstado.textContent = "📋 Copiado. Pégalo en WhatsApp/Notas y mándamelo.";
      } catch (_) {
        window.prompt("Copia este texto y mándamelo:", texto);
      }
    });

    btnBorrar.addEventListener("click", () => {
      if (!window.confirm("¿Borrar TODOS los pines guardados en este celular?")) return;
      guardarPinesLocal({});
      aplicarPines();
      reconstruirGrafo();
      recalcularRutaCompleta();
      txtEstado.textContent = "🗑️ Pines borrados: se usan las posiciones del mapa original.";
      pintarLista();
    });

    pintarLista();
  }

  // ============================================================================
  // 11. FALLBACKS WEB MODERNOS (DECLARATIVE DIALOG, LIGHT DISMISS, 2D PANNING)
  // ============================================================================
  function configurarFallbacksWebModernos() {
    // Garantizar que commandfor / command funcione en el 100% de navegadores móviles y WebViews
    if (!("commandForElement" in HTMLButtonElement.prototype)) {
      // Polyfill / fallback obligatorio cuando commandForElement no existe
    }
    document.querySelectorAll("[commandfor]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = document.getElementById(btn.getAttribute("commandfor"));
        const cmd = btn.getAttribute("command");
        if (!target) return;
        if (cmd === "show-modal") {
          if (!target.open && typeof target.showModal === "function") {
            target.showModal();
          }
          if (target.id === "dialogQrScanner") {
            activarCamara(document.getElementById("qrScannerVideo"));
          }
        } else if (cmd === "close") {
          if (target.open && typeof target.close === "function") {
            target.close();
          }
        }
      });
    });

    if (!("closedBy" in HTMLDialogElement.prototype)) {
      document.querySelectorAll('dialog[closedby="any"]').forEach((dlg) => {
        dlg.addEventListener("click", (e) => {
          if (e.target === dlg) dlg.close();
        });
      });
    }

    let arrastrandoMapa = false;
    let inicioX = 0;
    let inicioY = 0;
    let scrollIzq = 0;
    let scrollArr = 0;

    mapViewport.addEventListener("pointerdown", (e) => {
      arrastrandoMapa = true;
      inicioX = e.clientX;
      inicioY = e.clientY;
      scrollIzq = mapViewport.scrollLeft;
      scrollArr = mapViewport.scrollTop;
    });

    window.addEventListener("pointermove", (e) => {
      if (!arrastrandoMapa) return;
      mapViewport.scrollLeft = scrollIzq - (e.clientX - inicioX);
      mapViewport.scrollTop = scrollArr - (e.clientY - inicioY);
    });

    window.addEventListener("pointerup", () => {
      arrastrandoMapa = false;
    });
  }

  // ============================================================================
  // 12. ARRANQUE INMEDIATO
  // ============================================================================
  inicializarControles();
  configurarFallbacksWebModernos();
  configurarPines();
  recalcularRutaCompleta();
  activarCamara(document.getElementById("arVideo"));
  requestAnimationFrame(renderizarBucleAR);
})();
