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

  // ---- Lugares NUEVOS dados de alta en campo (Edificios A–W, restaurantes…) ----
  // Se guardan en el celular y al arrancar se agregan como nodos normales, unidos al nodo más cercano.
  // Con "📤 Enviar resultados" viajan en el CSV y tools/aplicar_pines.js los pasa a campus_data.js.
  const CLAVE_LUGARES_NUEVOS = "argos_lugares_nuevos_v1";
  function leerLugaresNuevos() {
    try { const v = JSON.parse(localStorage.getItem(CLAVE_LUGARES_NUEVOS) || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }
  function guardarLugaresNuevos(lista) {
    try { localStorage.setItem(CLAVE_LUGARES_NUEVOS, JSON.stringify(lista)); } catch (_) {}
  }
  (function inyectarLugaresNuevos() {
    const lat0 = datos.origen ? datos.origen.lat : 19.37024335;
    const lon0 = datos.origen ? datos.origen.lon : -99.26414455;
    const r = Math.PI / 180;
    const originales = datos.nodes.slice();
    datos.edges = datos.edges.slice();
    leerLugaresNuevos().forEach((l) => {
      if (!l || !l.id || !Number.isFinite(l.lat) || !Number.isFinite(l.lon)) return;
      if (datos.nodes.some((x) => x.id === l.id)) return; // ya viene en campus_data.js
      const x = 6378137.0 * (l.lon - lon0) * r * Math.cos(lat0 * r);
      const z = 6378137.0 * (l.lat - lat0) * r;
      let cerca = null, dMin = Infinity;
      originales.forEach((o) => { const d = Math.hypot(o.x - x, o.z - z); if (d < dMin) { dMin = d; cerca = o; } });
      datos.nodes.push({ id: l.id, name: l.name, nombre: l.name, category: l.category || "Referencia", categoria: l.category || "Referencia",
        x, z, lat: l.lat, lon: l.lon, piso: "PB", desc: "Lugar agregado en campo", nuevo: true, acc: l.acc });
      if (cerca) datos.edges.push([l.id, cerca.id]);
      const b = datos.bounds;
      b.minX = Math.min(b.minX, x - 25); b.maxX = Math.max(b.maxX, x + 25);
      b.minZ = Math.min(b.minZ, z - 25); b.maxZ = Math.max(b.maxZ, z + 25);
    });
  })();
  function crearLugarNuevo(nombre, categoria, lat, lon, acc) {
    const lista = leerLugaresNuevos();
    let num = 1;
    const usados = new Set(datos.nodes.map((x) => x.id).concat(lista.map((x) => x.id)));
    while (usados.has("N" + String(num).padStart(2, "0"))) num++;
    const id = "N" + String(num).padStart(2, "0");
    lista.push({ id, name: nombre, category: categoria, lat, lon, acc });
    guardarLugaresNuevos(lista);
    try { sessionStorage.setItem("argos_aviso", `✅ ${id} ${nombre} agregado: ya puedes elegirlo como destino`); } catch (_) {}
    location.reload();
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
  function metrosALatLon(x, z) {
    const r = 180 / Math.PI;
    return {
      lat: Number((LAT0 + (z / RADIO_TIERRA) * r).toFixed(7)),
      lon: Number((LON0 + (x / (RADIO_TIERRA * Math.cos((LAT0 * Math.PI) / 180))) * r).toFixed(7))
    };
  }

  // Pines personalizados (GPS o toque en Mapa 2D): se usa v2 para limpiar pines de prueba viejos
  const CLAVE_PINES = "argos_pines_v2";
  try { localStorage.removeItem("argos_pines_v1"); } catch (_) {}
  // 2026-11-11: Puerta 3, Escultura de Lobos y Salón C se recolocaron con los puntos reales de la ruta.
  // Un pin viejo guardado en el celular los regresaría a su lugar anterior: se borra UNA sola vez.
  try {
    if (localStorage.getItem("argos_limpieza_pines") !== "2026-11-11") {
      const guardados = JSON.parse(localStorage.getItem(CLAVE_PINES) || "{}") || {};
      ["N01", "N03", "N07"].forEach((id) => { delete guardados[id]; });
      localStorage.setItem(CLAVE_PINES, JSON.stringify(guardados));
      localStorage.setItem("argos_limpieza_pines", "2026-11-11");
    }
  } catch (_) {}
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
  // Avisos que el usuario debe alcanzar a leer: durante 6 s el mensaje de "toca para activar la cámara" no los tapa
  let avisoProtegidoHastaMs = 0;
  function avisarImportante(texto) {
    locationModeBadge.textContent = texto;
    avisoProtegidoHastaMs = performance.now() + 6000;
  }

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
      ? "🔼 Cambiar Origen / Destino"
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

  // ---- Posición libre: el usuario puede estar A MEDIO pasillo, no sólo parado en un nodo ----
  // estado.puntoInicio = null  → estás parado en el nodo estado.origenId
  //                    = { x, z, a, b } → estás sobre el pasillo que une los nodos a y b
  // Se usa al cambiar de destino a media ruta y al ubicarte con GPS.
  function proyectarEnSegmento(px, pz, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z;
    const l2 = dx * dx + dz * dz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / l2)) : 0;
    const x = a.x + dx * t, z = a.z + dz * t;
    return { x, z, t, d: Math.hypot(px - x, pz - z) };
  }

  // Punto de la red de pasillos más cercano a una posición cualquiera (p. ej. la del GPS)
  function puntoMasCercanoEnGrafo(px, pz) {
    let mejor = null;
    datos.edges.forEach(([u, v]) => {
      const a = nodosPorId.get(u), b = nodosPorId.get(v);
      if (!a || !b) return;
      const p = proyectarEnSegmento(px, pz, a, b);
      if (!mejor || p.d < mejor.d) mejor = { x: p.x, z: p.z, t: p.t, d: p.d, a: a.id, b: b.id };
    });
    return mejor;
  }

  // Ruta más corta desde un punto a medio pasillo: sale por el extremo que convenga
  function rutaDesdePunto(punto, destinoId) {
    const a = nodosPorId.get(punto.a), b = nodosPorId.get(punto.b);
    if (!a || !b) return calcularRutaDijkstra(estado.origenId, destinoId);
    const dA = Math.hypot(punto.x - a.x, punto.z - a.z);
    const dB = Math.hypot(punto.x - b.x, punto.z - b.z);
    if (dA < 1.5) return calcularRutaDijkstra(a.id, destinoId); // prácticamente parado en el nodo
    if (dB < 1.5) return calcularRutaDijkstra(b.id, destinoId);
    const rA = calcularRutaDijkstra(a.id, destinoId);
    const rB = calcularRutaDijkstra(b.id, destinoId);
    const okA = rA.ruta.length > 0, okB = rB.ruta.length > 0;
    if (!okA && !okB) return { ruta: [], distanciaTotal: 0 };
    const porA = okA && (!okB || dA + rA.distanciaTotal <= dB + rB.distanciaTotal);
    const r = porA ? rA : rB;
    const yo = { id: "📍", name: "Tu ubicación", nombre: "Tu ubicación", category: "Ubicación", x: punto.x, z: punto.z, virtual: true };
    return { ruta: [yo, ...r.ruta], distanciaTotal: (porA ? dA : dB) + r.distanciaTotal };
  }

  // Convierte "donde voy ahorita" en el nuevo punto de partida (al elegir otro destino a media ruta).
  // Antes la app regresaba al usuario al origen original aunque ya hubiera caminado o llegado.
  function tomarPosicionActualComoInicio() {
    const n = estado.ruta.length;
    if (n === 0) return;
    const ultimo = estado.ruta[n - 1];
    if (n === 1 || estado.indiceActual >= n - 1) { // ya llegaste: estás parado en ese nodo
      estado.puntoInicio = null;
      if (!ultimo.virtual) estado.origenId = ultimo.id;
      return;
    }
    const a = estado.ruta[estado.indiceActual];
    const b = estado.ruta[estado.indiceActual + 1];
    const t = estado.progresoTramo;
    if (!a.virtual && t < 0.02) { estado.puntoInicio = null; estado.origenId = a.id; return; }
    if (t > 0.98) { estado.puntoInicio = null; estado.origenId = b.id; return; }
    // A medio pasillo. Si este tramo salía de "Tu ubicación", el pasillo real es el del punto anterior.
    const extremos = a.virtual
      ? (estado.puntoInicio ? [estado.puntoInicio.a, estado.puntoInicio.b] : null)
      : [a.id, b.id];
    if (!extremos) { estado.puntoInicio = null; estado.origenId = b.id; return; }
    estado.puntoInicio = { x: estado.usuarioX, z: estado.usuarioZ, a: extremos[0], b: extremos[1] };
    const na = nodosPorId.get(extremos[0]), nb = nodosPorId.get(extremos[1]);
    estado.origenId =
      Math.hypot(na.x - estado.usuarioX, na.z - estado.usuarioZ) <= Math.hypot(nb.x - estado.usuarioX, nb.z - estado.usuarioZ)
        ? na.id : nb.id;
  }

  // ---- Distancia recorrida sobre la ruta ("arco"), para comparar con el GPS ----
  function largoTramoRuta(i) {
    return Math.max(0.1, distanciaMetros(estado.ruta[i], estado.ruta[i + 1]));
  }
  function arcoActual() {
    const ult = estado.ruta.length - 1;
    let s = 0;
    for (let i = 0; i < Math.min(estado.indiceActual, ult); i++) s += largoTramoRuta(i);
    if (estado.indiceActual < ult) s += estado.progresoTramo * largoTramoRuta(estado.indiceActual);
    return s;
  }

  // ---- Avance suave ----
  // Los pasos, la demo y las correcciones del GPS NO mueven al usuario de golpe: dejan metros en esta cola
  // (positivos = adelante, negativos = atrás) y el bucle de dibujo los gasta poco a poco, a velocidad de persona.
  // Así la alfombra de flechas se desliza en vez de brincar.
  let colaAvanceMetros = 0;
  let ultimoRefrescoAvanceMs = 0;
  function gastarColaAvance(dtSeg) {
    if (colaAvanceMetros === 0) return;
    if (!estado.navegando && !estado.caminandoSim && !estado.gpsActivo) { colaAvanceMetros = 0; return; }
    const pendiente = Math.abs(colaAvanceMetros);
    if (pendiente < 1e-4) { colaAvanceMetros = 0; return; }
    // Mientras más atrasado va el dibujo, más rápido alcanza: entre 0.6 y 2.4 m/s al caminar;
    // si la diferencia es grande (corrección del GPS de más de ~3 m) se pone al día en un par de segundos.
    const velocidad = Math.min(Math.max(0.6, pendiente * 2.5), Math.max(2.4, pendiente * 0.8));
    const metros = Math.min(pendiente, velocidad * dtSeg);
    if (colaAvanceMetros > 0) {
      colaAvanceMetros -= metros;
      avanzarMetrosEnRuta(metros, true);
    } else {
      colaAvanceMetros += metros;
      retrocederMetrosEnRuta(metros);
    }
  }

  // Sólo lo usa la corrección del GPS, cuando los pasos contados te adelantaron de más
  function retrocederMetrosEnRuta(metros) {
    const ult = estado.ruta.length - 1;
    if (ult < 1 || estado.indiceActual >= ult) { colaAvanceMetros = 0; return; } // ya llegaste: no se regresa
    let resto = metros;
    while (resto > 0) {
      const largo = largoTramoRuta(estado.indiceActual);
      const hecho = estado.progresoTramo * largo;
      if (resto <= hecho) { estado.progresoTramo -= resto / largo; break; }
      resto -= hecho;
      if (estado.indiceActual === 0) { estado.progresoTramo = 0; colaAvanceMetros = 0; break; }
      estado.indiceActual -= 1;
      estado.progresoTramo = 1;
    }
    sincronizarCoordenadasUsuarioConProgreso();
    const ahoraMs = performance.now();
    if (ahoraMs - ultimoRefrescoAvanceMs > 200) {
      ultimoRefrescoAvanceMs = ahoraMs;
      actualizarHUD();
      dibujarMapa2D();
      dibujarMinimapa();
    }
  }

  // ligero = true: llamada cuadro a cuadro; el HUD y los mapas se redibujan sólo 5 veces por segundo
  function avanzarMetrosEnRuta(metros, ligero) {
    // Ya en el destino: un paso de más NO debe regresarte al origen
    if (estado.ruta.length < 2 || estado.indiceActual >= estado.ruta.length - 1) { colaAvanceMetros = 0; return; }
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
    const cambioNodo = estado.indiceActual !== indiceAntes;
    const ahoraMs = performance.now();
    if (!ligero || cambioNodo || ahoraMs - ultimoRefrescoAvanceMs > 200) {
      ultimoRefrescoAvanceMs = ahoraMs;
      actualizarHUD();
      dibujarMapa2D();
      dibujarMinimapa();
    }

    if (cambioNodo && navigator.vibrate) navigator.vibrate(120);
    if (estado.indiceActual >= estado.ruta.length - 1) {
      colaAvanceMetros = 0;
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
  // (sólo SIN brújula, p. ej. en la PC; con brújula real un toque accidental desalinearía el mundo)
  let arrastrandoAR = false;
  let ultimoXAR = 0;
  arFloorCanvas.addEventListener("pointerdown", (e) => {
    if (estado.brujulaReal || estado.hayGiroscopio) return;
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
  let betaObjetivo = 60;
  // Suavizado de inclinación y giro, en segundos (ajustable con ?suave=0.2). Chico = las flechas siguen
  // a la cámara sin retraso; grande = más amortiguado. Sin zonas muertas: nada se mueve a saltitos.
  const SUAVIZADO_SEG = limitar(Number(parametrosURL.get("suave")) || 0.1, 0.02, 1);
  let rumboVistaGrados = null; // rumbo con el que se DIBUJA (sigue suavemente a estado.rumboUsuarioGrados)

  function registrarInclinacion(beta) {
    if (!Number.isFinite(beta)) return;
    betaObjetivo = limitar(beta, 25, 95);
  }

  // Se llama una vez por cuadro: acerca la inclinación y el rumbo dibujados a los valores del sensor
  function suavizarSensores(dtSeg) {
    const k = 1 - Math.exp(-dtSeg / SUAVIZADO_SEG);
    betaFiltrada += k * (betaObjetivo - betaFiltrada);
    const r = (betaFiltrada * Math.PI) / 180;
    estado.arribaDispositivo = [0, Math.sin(r), Math.cos(r)];
    if (estado.rumboUsuarioGrados === null) { rumboVistaGrados = null; return; }
    if (rumboVistaGrados === null) { rumboVistaGrados = estado.rumboUsuarioGrados; return; }
    const error = diferenciaAngularGrados(estado.rumboUsuarioGrados, rumboVistaGrados);
    // El giro se suaviza 3 veces menos que la inclinación: si se retrasa, las flechas "nadan" al voltear
    const kGiro = 1 - Math.exp(-dtSeg / (SUAVIZADO_SEG * 0.3));
    rumboVistaGrados = (rumboVistaGrados + kGiro * error + 360) % 360;
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

    // Escaleras (nodos con escaleras: true en campus_data.js): se avisa al acercarse y al pasar por ellas
    const metrosDesdeActual = tramoVista.distTramo - distRestanteTramo;
    let avisoEscaleras = "";
    if (siguiente.escaleras && distRestanteTramo <= 15) avisoEscaleras = `🪜 Escaleras en ${mTramo} m`;
    else if (actual.escaleras && metrosDesdeActual <= 10) avisoEscaleras = "🪜 Aquí hay escaleras, con cuidado";
    if (avisoEscaleras && arSignDist) arSignDist.textContent = `${avisoEscaleras} · ${arSignDist.textContent}`;
  }

  // ============================================================================
  // IÑAKI: el lobo guía. Camina sobre la ruta unos metros adelante de ti y te va hablando.
  //   - Sin configurar nada usa frases locales (funciona sin internet).
  //   - Con ?inaki=https://TU-SERVIDOR/inaki  manda el contexto (dónde estás, a dónde vas, qué hay cerca)
  //     a tools/inaki_server.js, que le pregunta a un modelo local (Ollama) y regresa la frase.
  //   - ?inaki=off borra el servidor guardado.  ?lobo=0 oculta a Iñaki.
  // ============================================================================
  const inaki = {
    activo: parametrosURL.get("lobo") !== "0",
    servidor: null,
    texto: "",
    textoMs: 0,
    claveRuta: null,
    indice: -1,
    llego: false,
    avisados: new Set(),
    pedido: 0,
    ultimoEvento: null
  };
  (function configurarServidorInaki() {
    const p = parametrosURL.get("inaki");
    try {
      if (p === "off") localStorage.removeItem("argos_inaki_url");
      else if (p && /^https?:\/\//.test(p)) localStorage.setItem("argos_inaki_url", p);
      inaki.servidor = localStorage.getItem("argos_inaki_url");
    } catch (_) {
      inaki.servidor = p && /^https?:\/\//.test(p) ? p : null;
    }
  })();

  // Todo lo que Iñaki sabe en este instante (esto es lo que recibe el modelo)
  function contextoInaki() {
    const tramo = obtenerTramoActivo();
    const giro = obtenerGiroEnSiguienteNodo();
    const destino = estado.ruta[estado.ruta.length - 1];
    const cerca = datos.nodes
      .map((n) => ({ n, d: Math.hypot(n.x - estado.usuarioX, n.z - estado.usuarioZ) }))
      .filter((c) => c.d <= 40)
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map((c) => ({ id: c.n.id, nombre: c.n.name, categoria: c.n.category, metros: Math.round(c.d) }));
    return {
      origen: estado.ruta[0] ? estado.ruta[0].name : null,
      destino: destino ? destino.name : null,
      nodoActual: tramo.actual.name,
      siguienteNodo: tramo.siguiente.name,
      metrosAlSiguiente: Math.round(tramo.distRestanteTramo),
      metrosAlDestino: Math.round(calcularDistanciaTotalRestante()),
      giroEnSiguienteNodo: giro ? giro.textoCorto.replace(/[^\p{L}\p{N} ()°]/gu, "").trim() : "ninguno",
      rumboUsuarioGrados: estado.rumboUsuarioGrados === null ? null : Math.round(estado.rumboUsuarioGrados),
      desfaseConCaminoGrados: Math.round(estado.desfaseMiradaGrados || 0),
      lugaresCerca: cerca,
      ruta: estado.ruta.map((n) => n.name)
    };
  }

  // ---- Voz de Iñaki (la del propio celular, en español). Se enciende con el botón 🔇/🔊 ----
  // El celular sólo deja hablar después de un toque del usuario: por eso el botón dice una frase al encenderse.
  try { inaki.voz = localStorage.getItem("argos_inaki_voz") === "1"; } catch (_) { inaki.voz = false; }
  function hablarInaki(texto, forzar) {
    if ((!inaki.voz && !forzar) || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance !== "function") return;
    try {
      // Sin emojis ni flechas: el lector los diría en voz alta
      const limpio = String(texto).replace(/[^\p{L}\p{N}\p{P}\p{Zs}°]/gu, " ").replace(/\s+/g, " ").trim();
      if (!limpio) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(limpio);
      u.lang = "es-MX";
      const voces = window.speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang));
      const voz = voces.find((v) => /es[-_]MX/i.test(v.lang)) || voces.find((v) => /es[-_](US|419)/i.test(v.lang)) || voces[0];
      if (voz) u.voice = voz;
      u.rate = 1.05;
      u.pitch = 0.9;
      window.speechSynthesis.speak(u);
    } catch (_) {}
  }
  (function crearBotonVozInaki() {
    if (!inaki.activo || !("speechSynthesis" in window) || !btnAlignArrows || !btnAlignArrows.parentNode) return;
    const btn = document.createElement("button");
    btn.id = "btnVozInaki";
    btn.type = "button";
    btn.className = btnAlignArrows.className;
    const pintar = () => { btn.textContent = inaki.voz ? "🔊 Iñaki" : "🔇 Iñaki"; };
    pintar();
    btn.addEventListener("click", () => {
      inaki.voz = !inaki.voz;
      try { localStorage.setItem("argos_inaki_voz", inaki.voz ? "1" : "0"); } catch (_) {}
      pintar();
      if (inaki.voz) hablarInaki(inaki.texto || "Hola, soy Iñaki. Ya te puedo hablar.", true);
      else if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    });
    btnAlignArrows.insertAdjacentElement("afterend", btn);
  })();

  function decirInaki(evento, textoLocal) {
    inaki.texto = textoLocal;
    inaki.textoMs = performance.now();
    inaki.ultimoEvento = evento;
    if (!inaki.servidor) { hablarInaki(textoLocal); return; }
    const miPedido = ++inaki.pedido;
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const corte = setTimeout(() => ctl && ctl.abort(), 8000);
    fetch(inaki.servidor, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento, sugerencia: textoLocal, contexto: contextoInaki() }),
      signal: ctl ? ctl.signal : undefined
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // Si mientras tanto pasó otra cosa, la respuesta vieja ya no se muestra
        if (miPedido !== inaki.pedido) return;
        if (!j || typeof j.texto !== "string" || !j.texto.trim()) { hablarInaki(textoLocal); return; }
        inaki.texto = j.texto.trim().slice(0, 220);
        inaki.textoMs = performance.now();
        hablarInaki(inaki.texto);
      })
      .catch(() => { if (miPedido === inaki.pedido) hablarInaki(textoLocal); }) // sin servidor o sin red: se queda la frase local
      .finally(() => clearTimeout(corte));
  }

  // Revisa una vez por segundo qué cambió (ruta nueva, nodo nuevo, restaurante cerca, llegada)
  function pensarInaki() {
    if (!inaki.activo || !estado.ruta || estado.ruta.length < 2) return;
    const destino = estado.ruta[estado.ruta.length - 1];
    const clave = estado.ruta[0].id + ">" + destino.id;
    const restante = calcularDistanciaTotalRestante();
    const tramo = obtenerTramoActivo();

    if (clave !== inaki.claveRuta) {
      inaki.claveRuta = clave;
      inaki.indice = estado.indiceActual;
      inaki.llego = false;
      inaki.avisados = new Set();
      decirInaki("inicio", `¡Auuu! Soy Iñaki. Vamos a ${destino.name}: son ${Math.round(restante)} m. Sígueme.`);
      return;
    }
    if (!inaki.llego && (restante < 0.8 || tramo.actual.id === tramo.siguiente.id)) {
      inaki.llego = true;
      decirInaki("llegada", `¡Llegamos a ${destino.name}! Bien hecho.`);
      return;
    }
    if (inaki.llego) return;
    if (estado.indiceActual !== inaki.indice) {
      inaki.indice = estado.indiceActual;
      const giro = obtenerGiroEnSiguienteNodo();
      decirInaki("nodo", giro
        ? `Pasamos ${tramo.actual.name}. En ${Math.round(tramo.distRestanteTramo)} m, al llegar a ${tramo.siguiente.name}: ${giro.textoCorto}.`
        : `Pasamos ${tramo.actual.name}. Faltan ${Math.round(restante)} m para ${destino.name}.`);
      return;
    }
    const comida = datos.nodes.find((n) =>
      /cafeter|restaur|comida/i.test(n.category || "") && n.id !== destino.id && !inaki.avisados.has(n.id) &&
      Math.hypot(n.x - estado.usuarioX, n.z - estado.usuarioZ) <= 25);
    if (comida) {
      inaki.avisados.add(comida.id);
      decirInaki("restaurante", `Mira, aquí cerca está ${comida.name}. ¿Se te antoja algo?`);
    }
  }
  setInterval(pensarInaki, 1000);

  function dibujarGloboInaki(cx, yBase, w) {
    if (!inaki.texto || performance.now() - inaki.textoMs > 12000) return;
    arCtx.save();
    arCtx.font = "600 15px system-ui, -apple-system, sans-serif";
    const anchoMax = Math.min(w - 32, 300);
    const lineas = [];
    let linea = "";
    inaki.texto.split(/\s+/).forEach((palabra) => {
      const prueba = linea ? linea + " " + palabra : palabra;
      if (arCtx.measureText(prueba).width > anchoMax - 24 && linea) { lineas.push(linea); linea = palabra; } else { linea = prueba; }
    });
    if (linea) lineas.push(linea);
    const ancho = Math.min(anchoMax, Math.max(...lineas.map((l) => arCtx.measureText(l).width)) + 24);
    const alto = lineas.length * 19 + 16;
    const x = limitar(cx - ancho / 2, 16, w - 16 - ancho);
    const y = Math.max(96, yBase - alto - 10);
    arCtx.beginPath();
    if (arCtx.roundRect) arCtx.roundRect(x, y, ancho, alto, 12); else arCtx.rect(x, y, ancho, alto);
    arCtx.fillStyle = "rgba(15, 23, 42, 0.86)";
    arCtx.fill();
    arCtx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    arCtx.lineWidth = 1.5;
    arCtx.stroke();
    arCtx.fillStyle = "#ffffff";
    arCtx.textAlign = "left";
    arCtx.textBaseline = "top";
    lineas.forEach((l, i) => arCtx.fillText(l, x + 12, y + 9 + i * 19));
    arCtx.restore();
  }

  // Dibuja a Iñaki parado sobre el camino, ~3 m adelante (fijo en el mundo igual que las flechas)
  function dibujarInaki(P, camino, largoVisible, t, enDestino, w, h) {
    if (!inaki.activo) return;
    const s = enDestino ? 1.6 : Math.min(3, Math.max(1.2, largoVisible - 0.5));
    const c = puntoEnCamino(camino.pts, s);
    const salto = Math.abs(Math.sin(t * 5)) * (enDestino ? 0.22 : 0.07);
    const piso = P(c.x, 0.02, c.z);
    const cuerpo = P(c.x, 0.42 + salto, c.z);
    const visible = piso && cuerpo && cuerpo.sx > -40 && cuerpo.sx < w + 40 && cuerpo.sy > 0 && cuerpo.sy < h + 40;
    if (!visible) {
      // Iñaki quedó fuera de la pantalla (estás mirando a otro lado): su globo se queda abajo al centro
      dibujarGloboInaki(w / 2, h * 0.62, w);
      return;
    }
    const tam = limitar(0.85 * cuerpo.escala, 22, 150);
    arCtx.save();
    arCtx.beginPath();
    arCtx.ellipse(piso.sx, piso.sy, tam * 0.38, tam * 0.12, 0, 0, Math.PI * 2);
    arCtx.fillStyle = "rgba(0, 0, 0, 0.35)";
    arCtx.fill();
    arCtx.font = `${Math.round(tam)}px serif`;
    arCtx.textAlign = "center";
    arCtx.textBaseline = "middle";
    arCtx.fillText("🐺", cuerpo.sx, cuerpo.sy);
    arCtx.restore();
    dibujarGloboInaki(cuerpo.sx, cuerpo.sy - tam * 0.55, w);
  }

  // Sólo lectura, para las pruebas automáticas (tools/prueba_rumbo.js)
  window.ARGOS_DEBUG = () => ({
    x: estado.usuarioX, z: estado.usuarioZ, cola: colaAvanceMetros, pasos: estado.pasosDetectados,
    origen: estado.origenId, destino: estado.destinoId, indice: estado.indiceActual, progreso: estado.progresoTramo,
    ruta: estado.ruta.map((n) => n.id), total: estado.distanciaTotal, arco: estado.ruta.length > 1 ? arcoActual() : 0,
    punto: estado.puntoInicio, gps: estado.gps, navegando: estado.navegando
  });
  let ultimoCuadroMs = 0;
  function renderizarBucleAR(tiempoMs) {
    requestAnimationFrame(renderizarBucleAR);
    const dtSeg = Math.min(0.1, Math.max(0, (tiempoMs - ultimoCuadroMs) / 1000));
    ultimoCuadroMs = tiempoMs;
    gastarColaAvance(dtSeg);
    suavizarSensores(dtSeg);
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
    const rumboMirada = rumboVistaGrados !== null ? rumboVistaGrados : estado.rumboUsuarioGrados;
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

    // 2b. Iñaki, el lobo guía, caminando sobre la ruta
    dibujarInaki(P, camino, largoVisible, t, enDestino, w, h);

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

    // Lectura cruda del GPS (círculo = su margen de error), para comparar con donde te coloca la app
    if (estado.gpsActivo && estado.gps) {
      const g = mundoACanvas(estado.gps.x, estado.gps.z);
      const borde = mundoACanvas(estado.gps.x + estado.gps.acc, estado.gps.z);
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, Math.max(6, borde.cx - g.cx), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(245, 158, 11, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "rgba(217, 119, 6, 0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#d97706";
      ctx.fill();
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
    // Norte arriba fijo: el cono verde apunta a donde realmente miras
    const rumboMirada = estado.rumboUsuarioGrados !== null ? estado.rumboUsuarioGrados : rumboTramo;
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
    // Mapa con Norte arriba FIJO (como Google Maps): sólo gira el cono según tu rumbo real
    const rumboMirada = estado.rumboUsuarioGrados !== null ? estado.rumboUsuarioGrados : rumboTramo;
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

    // Indicador de Norte fijo arriba (el minimapa nunca gira)
    miniCtx.font = "800 12px Inter, sans-serif";
    miniCtx.textAlign = "center";
    miniCtx.fillStyle = "#ef4444";
    miniCtx.fillText("N", w / 2, 14);
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
  // conservarPunto = true sólo cuando quien llama acaba de fijar estado.puntoInicio (a medio pasillo o GPS).
  // En cualquier otro caso (QR, lista, pines…) el usuario está parado en el nodo estado.origenId.
  function recalcularRutaCompleta(conservarPunto) {
    if (!conservarPunto) estado.puntoInicio = null;
    const res = estado.puntoInicio
      ? rutaDesdePunto(estado.puntoInicio, estado.destinoId)
      : calcularRutaDijkstra(estado.origenId, estado.destinoId);
    estado.ruta = res.ruta;
    estado.distanciaTotal = res.distanciaTotal;
    estado.indiceActual = 0;
    estado.progresoTramo = 0;
    colaAvanceMetros = 0;

    sincronizarCoordenadasUsuarioConProgreso();
    const tramoInicial = obtenerTramoActivo();
    // Con brújula real tu rumbo NO cambia al elegir otra ruta (el mundo no gira); sin ella se asume el pasillo
    fijarRumboSiSinBrujula(tramoInicial.rumboTramo);
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
      if (nodo.escaleras) detalle += " · 🪜 Escaleras";
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
          fijarRumboSiSinBrujula(calcularRumboGrados(ant.x, ant.z, nodo.x, nodo.z));
        } else {
          fijarRumboSiSinBrujula(obtenerTramoActivo().rumboTramo);
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
    idIntervaloCaminata = setInterval(() => { colaAvanceMetros += 0.13; }, 100);
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
      colaAvanceMetros += nuevos * PASO_METROS; // el bucle de dibujo lo avanza suave
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

  // ---- Rumbo del usuario: mantiene las flechas QUIETAS en el mundo real ----
  // estado.rumboUsuarioGrados = hacia dónde mira la cámara (0° = Norte, 90° = Este).
  // Tres piezas:
  //   1. GIRO (giroscopio): cada cambio de orientación se SUMA al rumbo. Así, si giras, las flechas
  //      se quedan donde estaban en el mundo. No se descarta ningún giro, por lento que sea.
  //   2. BRÚJULA (Norte real): corrige poco a poco el rumbo mientras no hayas centrado a mano.
  //   3. "🎯 Centrar flechas" (SÓLO en celulares SIN brújula; con brújula el botón se oculta): tú apuntas el celular a lo largo del camino y tocas el botón.
  //      Desde ese momento manda SOLO el giroscopio (la brújula ya no mueve nada), de modo que
  //      las flechas quedan fijas en el mundo aunque gires o haya fierros cerca.
  const K_CORRECCION_BRUJULA = 0.02; // fracción del error que se corrige por lectura de brújula
  const SALTO_MAX_BRUJULA = 60;      // lecturas que brincan más de esto se ignoran (fierros, laptops)
  const SALTO_MAX_GIRO = 55;         // un giro mayor a esto en una sola lectura es un error del sensor
  const UMBRAL_TEMBLOR = 0.5;        // grados de giro acumulados antes de repintar el minimapa
  const DECLINACION_MAGNETICA = 4;   // CDMX: el Norte real está ~4° al este del Norte magnético

  estado.brujulaReal = false;        // true cuando el celular entrega Norte (brújula)
  estado.hayGiroscopio = false;      // true cuando llegan lecturas de orientación
  estado.rumboManual = false;        // true después de tocar "Centrar flechas"
  estado.ultimaBrujula = null;       // último rumbo de brújula (grados, Norte real)
  estado.ultimaBrujulaMs = 0;
  estado.precisionBrujula = null;    // iOS: ± grados (webkitCompassAccuracy)
  estado.calibrado = false;

  let giroPendiente = 0;
  const ultimoRumboFuente = { rel: null, abs: null };
  let ultimaLecturaRelMs = -1e9;

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

  // Sólo se usa SIN ningún sensor (PC): sin giroscopio ni brújula no hay otra referencia que el pasillo.
  function fijarRumboSiSinBrujula(grados) {
    if (estado.brujulaReal || estado.hayGiroscopio || estado.rumboManual) return;
    estado.rumboUsuarioGrados = grados;
    rumboVistaGrados = grados; // sin sensores no hay nada que suavizar
  }

  // 1. GIRO: fuente "rel" = giroscopio puro (preferida); "abs" = orientación con brújula (respaldo).
  function registrarGiro(rumboSensor, fuente) {
    if (!Number.isFinite(rumboSensor)) return;
    const ahora = performance.now();
    estado.hayGiroscopio = true;
    if (fuente === "rel") ultimaLecturaRelMs = ahora;
    const anterior = ultimoRumboFuente[fuente];
    ultimoRumboFuente[fuente] = rumboSensor;
    if (anterior === null) return;
    // Si hay giroscopio puro reciente, la fuente absoluta no se usa para girar (evita contar doble)
    if (fuente === "abs" && ahora - ultimaLecturaRelMs < 500) return;

    const delta = diferenciaAngularGrados(rumboSensor, anterior);
    if (Math.abs(delta) > SALTO_MAX_GIRO) return;
    // Cada giro se suma completo al rumbo (sin umbral: un umbral hacía que las flechas se movieran a saltitos).
    // El temblor de la mano lo absorbe el suavizado por cuadro (suavizarSensores).
    if (estado.rumboUsuarioGrados === null) {
      estado.rumboUsuarioGrados = obtenerTramoActivo().rumboTramo;
    }
    estado.rumboUsuarioGrados = (estado.rumboUsuarioGrados + delta + 360) % 360;
    // El minimapa es caro de dibujar: sólo se repinta cuando el giro acumulado ya se nota
    giroPendiente += delta;
    if (Math.abs(giroPendiente) < UMBRAL_TEMBLOR) return;
    giroPendiente = 0;
    dibujarMinimapa();
  }

  // 2. BRÚJULA: rumboMagnetico viene del celular (0° = Norte magnético).
  function registrarBrujula(rumboMagnetico, precision) {
    if (!Number.isFinite(rumboMagnetico)) return;
    const rumboAbs = (rumboMagnetico + DECLINACION_MAGNETICA + 360) % 360;
    const salto = estado.ultimaBrujula === null ? 0 : Math.abs(diferenciaAngularGrados(rumboAbs, estado.ultimaBrujula));
    const primera = !estado.brujulaReal;
    estado.brujulaReal = true;
    // Con brújula el mundo ya está orientado: se quita el botón para que NADA pueda girar las flechas
    if (primera) { btnAlignArrows.style.display = "none"; estado.rumboManual = false; }
    estado.ultimaBrujula = rumboAbs;
    estado.ultimaBrujulaMs = performance.now();
    if (Number.isFinite(precision)) estado.precisionBrujula = precision;

    if (estado.rumboManual) return; // Ya centraste a mano: la brújula no mueve las flechas
    if (primera || estado.rumboUsuarioGrados === null) {
      estado.rumboUsuarioGrados = rumboAbs; // Primera lectura: tu rumbo es el Norte real, NO el pasillo
      giroPendiente = 0;
      return;
    }
    if (salto > SALTO_MAX_BRUJULA) return;
    const error = diferenciaAngularGrados(rumboAbs, estado.rumboUsuarioGrados);
    estado.rumboUsuarioGrados = (estado.rumboUsuarioGrados + error * K_CORRECCION_BRUJULA + 360) % 360;
  }

  function manejarOrientacion(e, esEventoAbsoluto) {
    if (typeof e.beta === "number") registrarInclinacion(e.beta);
    if (typeof e.alpha !== "number" || e.alpha === null) return;
    const rumbo = rumboCamaraDesdeEuler(e.alpha, e.beta || 0, e.gamma || 0);

    if (typeof e.webkitCompassHeading === "number" && e.webkitCompassHeading >= 0) {
      // iPhone: alpha es giroscopio puro; la brújula llega aparte en webkitCompassHeading
      // (no considera si la pantalla está girada → se suma el ángulo de pantalla)
      registrarGiro(rumbo, "rel");
      const angPantalla = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      const precision = typeof e.webkitCompassAccuracy === "number" && e.webkitCompassAccuracy >= 0
        ? e.webkitCompassAccuracy : null;
      registrarBrujula((e.webkitCompassHeading + angPantalla + 360) % 360, precision);
    } else if (esEventoAbsoluto || e.absolute === true) {
      // Android: el alpha del evento absoluto ya está referido al Norte magnético
      registrarGiro(rumbo, "abs");
      registrarBrujula(rumbo, null);
    } else {
      registrarGiro(rumbo, "rel");
    }
  }

  const listenerOrientacionAbs = (e) => manejarOrientacion(e, true);
  const listenerOrientacionRel = (e) => manejarOrientacion(e, false);
  window.addEventListener("deviceorientationabsolute", listenerOrientacionAbs, true);
  window.addEventListener("deviceorientation", listenerOrientacionRel, true);

  // 3. "🎯 Centrar flechas": apunta el celular a lo largo del camino y toca el botón UNA vez.
  // Las flechas quedan al frente en ese instante y después se quedan fijas en el mundo:
  // si giras, ya NO giran contigo (verás "Gira a la derecha/izquierda" o "Da media vuelta").
  btnAlignArrows.textContent = "🎯 Centrar flechas";
  btnAlignArrows.addEventListener("click", () => {
    if (estado.brujulaReal) return; // Con brújula las flechas NUNCA se mueven por un toque
    estado.rumboUsuarioGrados = obtenerTramoActivo().rumboTramo;
    giroPendiente = 0;
    estado.rumboManual = true;
    estado.calibrado = true;
    locationModeBadge.textContent = estado.hayGiroscopio
      ? "🎯 Flechas centradas: ya quedan fijas aunque gires"
      : "⚠️ Sin sensor de giro: las flechas no pueden quedarse fijas";
    actualizarHUD();
    dibujarMinimapa();
  });

  // ---- GPS: ubicarte en la red de pasillos y corregir el avance ----
  // El GPS del celular tiene ±5 a ±15 m, así que NUNCA mueve al usuario directo (las flechas bailarían).
  // Se usa de tres formas:
  //   1. Al encenderlo: te coloca en el punto de la red de pasillos más cercano a ti y recalcula la ruta.
  //   2. Al caminar: la lectura se proyecta sobre la ruta; si los pasos contados se atrasaron o adelantaron
  //      más que la precisión del GPS, el avance se corrige poco a poco.
  //   3. Si te sales de la ruta (4 lecturas seguidas lejos), vuelve a ubicarte y recalcula.
  // Los QR siguen mandando: escanear uno te coloca exacto en ese nodo.
  const GPS_PRECISION_MAX = 35;   // lecturas peores que ±35 m se ignoran
  estado.gps = null;              // última lectura { x, z, acc, ms }
  let gpsUbicado = false;
  let gpsFueraDeRuta = 0;

  // Punto de la ruta activa más cercano a (px, pz). Prefiere los tramos cercanos a donde ya vas.
  function proyectarEnRuta(px, pz) {
    const sAhora = arcoActual();
    let mejor = null;
    let acumulado = 0;
    for (let i = 0; i < estado.ruta.length - 1; i++) {
      const largo = largoTramoRuta(i);
      const p = proyectarEnSegmento(px, pz, estado.ruta[i], estado.ruta[i + 1]);
      const s = acumulado + p.t * largo;
      const costo = p.d + 0.15 * Math.abs(s - sAhora);
      if (!mejor || costo < mejor.costo) mejor = { s, d: p.d, costo };
      acumulado += largo;
    }
    if (mejor) mejor.total = acumulado;
    return mejor;
  }

  function ubicarConGPS(g) {
    const p = puntoMasCercanoEnGrafo(g.x, g.z);
    if (!p) return false;
    if (p.d > Math.max(40, 2.5 * g.acc)) {
      locationModeBadge.textContent = `🛰️ Estás a ${Math.round(p.d)} m de los caminos: usa QR`;
      return false;
    }
    detenerSimulacionCaminata();
    estado.puntoInicio = { x: p.x, z: p.z, a: p.a, b: p.b };
    estado.origenId = p.t < 0.5 ? p.a : p.b;
    selectOrigen.value = estado.origenId;
    recalcularRutaCompleta(true);
    return true;
  }

  function manejarLecturaGPS(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    const m = latLonAMetros(latitude, longitude);
    const acc = Math.max(3, Number.isFinite(accuracy) ? accuracy : 50);
    estado.gps = { x: m.x, z: m.z, acc, ms: performance.now() };
    const redibujar = () => { dibujarMapa2D(); dibujarMinimapa(); };
    const b = datos.bounds;
    if (m.x < b.minX - 150 || m.x > b.maxX + 150 || m.z < b.minZ - 150 || m.z > b.maxZ + 150) {
      locationModeBadge.textContent = "📍 Fuera de IBERO (usa QR)";
      return;
    }
    if (acc > GPS_PRECISION_MAX) {
      locationModeBadge.textContent = `🛰️ GPS impreciso (±${Math.round(acc)} m)`;
      redibujar();
      return;
    }
    const precision = `🛰️ GPS ±${Math.round(acc)} m`;

    if (!gpsUbicado) {
      gpsUbicado = ubicarConGPS(estado.gps);
      if (gpsUbicado) locationModeBadge.textContent = `${precision} · junto a ${nodosPorId.get(estado.origenId).name}`;
      redibujar();
      return;
    }

    const ultimo = estado.ruta.length - 1;
    if (ultimo < 1 || estado.indiceActual >= ultimo) { // sin ruta o ya llegaste: nada que corregir
      locationModeBadge.textContent = precision;
      redibujar();
      return;
    }

    const pr = proyectarEnRuta(m.x, m.z);
    if (pr.d > Math.max(30, 2.5 * acc)) {
      gpsFueraDeRuta += 1;
      locationModeBadge.textContent = `${precision} · a ${Math.round(pr.d)} m de la ruta`;
      if (gpsFueraDeRuta >= 4) {
        gpsFueraDeRuta = 0;
        if (ubicarConGPS(estado.gps)) locationModeBadge.textContent = "🔄 Ruta recalculada con GPS";
      }
      redibujar();
      return;
    }
    gpsFueraDeRuta = 0;

    // Diferencia entre donde el GPS dice que vas y donde la app cree (pasos contados + lo que falta por dibujar)
    const holgura = Math.max(3, acc * 0.5);
    const error = pr.s - (arcoActual() + colaAvanceMetros);
    if (Math.abs(error) > holgura) {
      colaAvanceMetros += 0.5 * (error - Math.sign(error) * holgura);
    }
    // Llegada: el GPS ya te pone prácticamente en el destino
    const destino = estado.ruta[ultimo];
    if (Math.hypot(m.x - destino.x, m.z - destino.z) < Math.max(5, acc * 0.6)) {
      colaAvanceMetros = Math.max(colaAvanceMetros, pr.total - arcoActual() + 0.2); // +0.2: que el redondeo no te deje a un pelo
    }
    locationModeBadge.textContent = estado.navegando ? `${precision} · ${estado.pasosDetectados} pasos` : precision;
    redibujar();
  }

  function apagarGPS() {
    if (estado.gpsWatchId !== null) navigator.geolocation.clearWatch(estado.gpsWatchId);
    estado.gpsWatchId = null;
    estado.gpsActivo = false;
    estado.gps = null;
    btnToggleGps.textContent = "🛰️ Activar GPS Real";
    dibujarMapa2D();
    dibujarMinimapa();
  }

  btnToggleGps.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      alert("Tu navegador no soporta geolocalización GPS.");
      return;
    }
    if (estado.gpsActivo) {
      apagarGPS();
      locationModeBadge.textContent = "📍 Modo: QR + Pasos";
      return;
    }

    estado.gpsActivo = true;
    gpsFueraDeRuta = 0;
    // Si ya vas caminando una ruta, el GPS sólo la corrige; si no, primero te ubica.
    gpsUbicado = estado.navegando || estado.indiceActual > 0 || estado.progresoTramo > 0.02;
    btnToggleGps.textContent = "🛰️ GPS Activo (Apagar)";
    locationModeBadge.textContent = "🛰️ Buscando GPS...";
    fijarEstadoMenu(true);

    estado.gpsWatchId = navigator.geolocation.watchPosition(
      manejarLecturaGPS,
      (err) => {
        locationModeBadge.textContent = err && err.code === 1
          ? "📍 Permite la ubicación en Ajustes"
          : "📍 Sin señal GPS (usa QR)";
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 }
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
      if (err && err.name === "NotAllowedError") locationModeBadge.textContent = "📷 Permite la cámara en el navegador y recarga";
      else if (performance.now() > avisoProtegidoHastaMs) locationModeBadge.textContent = "📷 Toca la pantalla para activar la cámara";
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
    // Si a los 3 s no llegó Norte real, avisar que las flechas son aproximadas
    setTimeout(() => {
      if (!estado.brujulaReal) locationModeBadge.textContent = "⚠️ Sin brújula: modo aproximado";
    }, 3000);
    // Reintentar la cámara si el navegador exigía un gesto del usuario para reproducir el video
    const v = document.getElementById("arVideo");
    if (v && (!v.srcObject || v.paused)) activarCamara(v);
  }
  document.addEventListener("click", solicitarPermisosSensores, { once: true, capture: true });
  document.addEventListener("touchend", solicitarPermisosSensores, { once: true, capture: true });

  // Texto de un QR → id de nodo. Acepta el link de la app ("…/app/?qr=N07"), "ARGOS:N07" o "N07" a secas.
  function idDeTextoQR(texto) {
    const m = texto.match(/[?&]qr=(N\d{2})(?!\d)/i) || texto.match(/ARGOS:\s*(N\d{2})(?!\d)/i) || texto.match(/^(N\d{2})$/i);
    return m ? m[1].toUpperCase() : null;
  }
  const ultimoQR = { id: null, ms: -1e9 };
  function estoyParadoEnOrigen() {
    return !estado.puntoInicio && estado.indiceActual === 0 && estado.progresoTramo < 0.02;
  }

  // El destino se recuerda 3 horas: si escaneas un QR con la cámara del celular (la página se vuelve a abrir),
  // sigues yendo al mismo lugar.
  const CLAVE_DESTINO = "argos_destino";
  function guardarDestino() {
    try { localStorage.setItem(CLAVE_DESTINO, JSON.stringify({ id: estado.destinoId, t: Date.now() })); } catch (_) {}
  }
  function leerDestinoGuardado() {
    try {
      const v = JSON.parse(localStorage.getItem(CLAVE_DESTINO) || "null");
      return v && nodosPorId.has(v.id) && Date.now() - v.t < 3 * 3600 * 1000 ? v.id : null;
    } catch (_) { return null; }
  }

  function fijarUbicacionPorNodo(idNodo, fuente = "QR") {
    if (!nodosPorId.has(idNodo)) return;
    detenerSimulacionCaminata();
    estado.origenId = idNodo;
    selectOrigen.value = idNodo;
    const nodo = nodosPorId.get(idNodo);
    locationModeBadge.textContent = `📍 ${fuente}: ${nodo.id} ${nodo.name}`;
    if (estado.destinoId === idNodo) {
      // Estás parado en tu destino (p. ej. escaneaste su QR): llegaste. Antes aquí se cambiaba el destino solo.
      if (estado.navegando) detenerNavegacion("🏁 Llegaste a tu destino");
      else locationModeBadge.textContent = `🏁 Estás en ${nodo.name}: elige a dónde ir`;
    }
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
        const idDetectado = idDeTextoQR(leido.trim());
        const ahora = performance.now();
        // El mismo QR sigue a la vista varios segundos: sólo se aplica una vez cada 6 s.
        // (Antes se ignoraba si era tu origen, y volver a escanearlo a media ruta no te reubicaba.)
        const repetido = ultimoQR.id === idDetectado && ahora - ultimoQR.ms < 6000;
        if (idDetectado && nodosPorId.has(idDetectado)) {
          ultimoQR.ms = ahora;
          if (!repetido && !(idDetectado === estado.origenId && estoyParadoEnOrigen())) {
            ultimoQR.id = idDetectado;
            fijarUbicacionPorNodo(idDetectado, "QR Escaneado");
            if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
          }
          ultimoQR.id = idDetectado;
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
      // El nuevo destino se calcula desde donde ESTÁS (ya caminaste o ya llegaste), no desde el origen viejo
      tomarPosicionActualComoInicio();
      selectOrigen.value = estado.origenId;
      estado.destinoId = selectDestino.value;
      guardarDestino();
      recalcularRutaCompleta(true);
      if (estado.ruta.length === 1) {
        locationModeBadge.textContent = `🏁 Ya estás en ${estado.ruta[0].name}`;
      } else if (estado.ruta.length === 0) {
        locationModeBadge.textContent = "⚠️ No hay camino registrado hasta ese lugar";
      }
      fijarEstadoMenu(true);
    });

    btnInvert.addEventListener("click", () => {
      const temp = estado.origenId;
      estado.origenId = estado.destinoId;
      estado.destinoId = temp;
      selectOrigen.value = estado.origenId;
      selectDestino.value = estado.destinoId;
      guardarDestino();
      recalcularRutaCompleta();
      fijarEstadoMenu(true);
    });

    btnNextNode.addEventListener("click", () => {
      if (estado.indiceActual < estado.ruta.length - 1) {
        const a = estado.ruta[estado.indiceActual];
        const b = estado.ruta[estado.indiceActual + 1];
        // Conservar el rumbo del tramo que acabas de caminar para que el siguiente nodo NO gire solo
        // y la app te indique "➡️ Gira a la derecha" o "⬅️ Gira a la izquierda".
        fijarRumboSiSinBrujula(calcularRumboGrados(a.x, a.z, b.x, b.z));
        estado.indiceActual += 1;
        estado.progresoTramo = 0;
      } else {
        estado.indiceActual = 0;
        estado.progresoTramo = 0;
        sincronizarCoordenadasUsuarioConProgreso();
        fijarRumboSiSinBrujula(obtenerTramoActivo().rumboTramo);
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
        guardarDestino();
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
    // Lugares que todavía NO existen: se dan de alta parándote en su puerta (o tocando el Mapa 2D)
    const PREFIJO_NUEVO = "NUEVO:";
    const yaExiste = (nombre) => datos.nodes.some((x) => x.name.toLowerCase() === nombre.toLowerCase());
    const agregarOpcionNueva = (valor, texto) => {
      const o = document.createElement("option");
      o.value = PREFIJO_NUEVO + valor;
      o.textContent = texto;
      selectPin.appendChild(o);
    };
    agregarOpcionNueva("?", "➕ Lugar nuevo (restaurante, salón…): escribir nombre");
    "ABCDEFGHIJKLMNOPQRSTUVW".split("").forEach((letra) => {
      if (!yaExiste("Edificio " + letra)) agregarOpcionNueva("Edificio " + letra, "➕ Edificio " + letra + " (dar de alta)");
    });
    let lugarNuevo = null; // { nombre, categoria } mientras se ubica un lugar que aún no existe
    function prepararLugarNuevo() {
      lugarNuevo = null;
      if (!selectPin.value.startsWith(PREFIJO_NUEVO)) return true;
      let nombre = selectPin.value.slice(PREFIJO_NUEVO.length);
      let categoria = "Académico";
      if (nombre === "?") {
        nombre = (window.prompt("Nombre del lugar nuevo (ej. Cafetería Capeltic):") || "").trim().replace(/,/g, " ");
        if (!nombre) return false;
        if (yaExiste(nombre)) { txtEstado.textContent = "⚠️ Ya existe un lugar con ese nombre: elígelo en la lista."; return false; }
        categoria = window.confirm("¿Es restaurante o cafetería?\n\nAceptar = Sí · Cancelar = No") ? "Cafetería" : "Referencia";
      }
      lugarNuevo = { nombre, categoria };
      return true;
    }

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
        ? `⏳ Midiendo ${lugarNuevo ? lugarNuevo.nombre : idMidiendo}… ${seg}/${SEGUNDOS} s · ${muestras.length} lecturas · mejor ±${mejor} m. No te muevas.`
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
      if (lugarNuevo) {
        const nuevo = lugarNuevo;
        lugarNuevo = null;
        crearLugarNuevo(nuevo.nombre, nuevo.categoria, Number((slat / sw).toFixed(7)), Number((slon / sw).toFixed(7)), Math.round(mejor));
        return;
      }
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

    // Permitir también colocar/mover cualquier pin tocando directamente el Mapa 2D (sin caminar con GPS)
    let nodoPorUbicarEnMapa = null;
    const btnMapaPin = document.createElement("button");
    btnMapaPin.type = "button";
    btnMapaPin.className = "action-btn btn-primary";
    btnMapaPin.style.width = "100%";
    btnMapaPin.style.marginTop = "6px";
    btnMapaPin.textContent = "🗺️ O elegir punto tocando el Mapa 2D";
    btnGuardar.insertAdjacentElement("afterend", btnMapaPin);

    btnMapaPin.addEventListener("click", () => {
      if (!prepararLugarNuevo()) return;
      nodoPorUbicarEnMapa = selectPin.value;
      if (dlg.open) dlg.close();
      document.getElementById("tabMap")?.click();
      const n = nodosPorId.get(nodoPorUbicarEnMapa);
      locationModeBadge.textContent = `📌 Toca el Mapa 2D donde va ${lugarNuevo ? lugarNuevo.nombre : n.id}`;
    });

    campusCanvas.addEventListener("click", (e) => {
      if (!nodoPorUbicarEnMapa) return;
      const rect = campusCanvas.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * campusCanvas.width;
      const cy = ((e.clientY - rect.top) / rect.height) * campusCanvas.height;
      const b = datos.bounds;
      const pad = 70;
      const w = campusCanvas.width - pad * 2;
      const h = campusCanvas.height - pad * 2;
      const x = b.minX + ((cx - pad) / w) * (b.maxX - b.minX);
      const z = b.maxZ - ((cy - pad) / h) * (b.maxZ - b.minZ);
      const { lat, lon } = metrosALatLon(x, z);
      if (lugarNuevo) {
        const nuevo = lugarNuevo;
        lugarNuevo = null;
        nodoPorUbicarEnMapa = null;
        crearLugarNuevo(nuevo.nombre, nuevo.categoria, lat, lon, 1);
        return;
      }
      const pines = leerPines();
      pines[nodoPorUbicarEnMapa] = { lat, lon, acc: 1, n: 1, t: new Date().toISOString() };
      const idMovido = nodoPorUbicarEnMapa;
      nodoPorUbicarEnMapa = null;
      guardarPinesLocal(pines);
      aplicarPines();
      reconstruirGrafo();
      recalcularRutaCompleta();
      const n = nodosPorId.get(idMovido);
      locationModeBadge.textContent = `✅ ${n.id} movido en Mapa 2D`;
      txtEstado.textContent = `✅ ${n.id} ${n.name} actualizado desde el Mapa 2D.`;
      pintarLista();
    });

    btnGuardar.addEventListener("click", () => {
      if (idWatch !== null) { terminarCaptura(); return; } // tocar otra vez = terminar antes
      if (!("geolocation" in navigator)) {
        txtEstado.textContent = "❌ Este navegador no da ubicación GPS.";
        return;
      }
      if (!prepararLugarNuevo()) return;
      muestras = [];
      idMidiendo = selectPin.value;
      t0 = Date.now();
      btnGuardar.textContent = "⏹️ Terminar ya";
      mostrarProgreso();
      reloj = setInterval(mostrarProgreso, 1000);
      idWatch = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
          muestras.push({ lat: latitude, lon: longitude, acc: Math.max(1, Number.isFinite(accuracy) ? accuracy : 25) });
          mostrarProgreso();
        },
        (err) => {
          txtEstado.textContent = err && err.code === 1
            ? "❌ Permite la ubicación: Ajustes › Privacidad › Localización › Safari → Mientras se usa."
            : "⚠️ Sin señal GPS todavía… o usa '🗺️ O elegir punto tocando el Mapa 2D'.";
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
        if (n.nuevo) { filas.push(`${n.name},${lat},${lon},${n.category},${n.id},${p ? p.acc : (n.acc || "")},nuevo`); return; }
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
      if (leerLugaresNuevos().length && window.confirm("¿Borrar TAMBIÉN los lugares nuevos que diste de alta (edificios, restaurantes)?")) {
        guardarLugaresNuevos([]);
        location.reload();
        return;
      }
      aplicarPines();
      reconstruirGrafo();
      recalcularRutaCompleta();
      txtEstado.textContent = "🗑️ Pines borrados: se usan las posiciones del mapa original.";
      pintarLista();
    });

    pintarLista();
    try {
      const aviso = sessionStorage.getItem("argos_aviso");
      if (aviso) { sessionStorage.removeItem("argos_aviso"); avisarImportante(aviso); }
    } catch (_) {}
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
  // Link de un QR impreso: .../app/?qr=N01  (opcional &a=N07 para fijar también el destino).
  // Al escanearlo con la cámara normal del celular, la app abre ya ubicada en ese nodo.
  const qrInicial = idDeTextoQR("?qr=" + (parametrosURL.get("qr") || ""));
  const destinoInicial = idDeTextoQR("?qr=" + (parametrosURL.get("a") || "")) || leerDestinoGuardado();
  if (qrInicial && nodosPorId.has(qrInicial)) estado.origenId = qrInicial;
  if (destinoInicial && nodosPorId.has(destinoInicial) && destinoInicial !== estado.origenId) {
    estado.destinoId = destinoInicial;
  } else if (estado.destinoId === estado.origenId) {
    estado.destinoId = estado.origenId === "N10" ? "N07" : "N10";
  }

  inicializarControles();
  configurarFallbacksWebModernos();
  configurarPines();
  recalcularRutaCompleta();
  if (qrInicial && nodosPorId.has(qrInicial)) {
    avisarImportante(`📍 QR: ${qrInicial} ${nodosPorId.get(qrInicial).name}`);
  }
  activarCamara(document.getElementById("arVideo"));
  requestAnimationFrame(renderizarBucleAR);
})();
