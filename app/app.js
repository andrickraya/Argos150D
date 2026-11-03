(() => {
  const datos = window.CAMPUS_DATA;
  if (!datos) {
    console.error("No se encontró window.CAMPUS_DATA.");
    return;
  }

  // ============================================================================
  // 1. GRAFO DE LOS 20 NODOS CAMINABLES DEL CAMPUS IBERO (DIJKSTRA)
  // ============================================================================
  const nodosPorId = new Map(datos.nodes.map((n) => [n.id, n]));
  const adyacencia = new Map();
  datos.nodes.forEach((n) => adyacencia.set(n.id, []));

  function distanciaMetros(a, b) {
    return Math.hypot(b.x - a.x, b.z - a.z);
  }

  datos.edges.forEach(([u, v]) => {
    const na = nodosPorId.get(u);
    const nb = nodosPorId.get(v);
    if (!na || !nb) return;
    const peso = distanciaMetros(na, nb);
    adyacencia.get(u).push({ Vecino: v, Peso: peso });
    adyacencia.get(v).push({ Vecino: u, Peso: peso });
  });

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

  // Rumbo en grados (0° = Norte/+Z, 90° = Este/+X)
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
  // 2. ESTADO REACTIVO DE NAVEGACIÓN Y POSICIÓN CONTINUA (usuarioX, usuarioZ)
  // ============================================================================
  const estado = {
    origenId: "N07",     // Salón C (Aulas B/C)
    destinoId: "N10",    // Cafetería El Cubo
    indiceActual: 0,     // Índice del tramo actual dentro de estado.ruta
    progresoTramo: 0,    // 0.0 a 1.0 a lo largo del tramo actual
    usuarioX: -88.24,    // Coordenada X continua en metros del usuario
    usuarioZ: -9.85,     // Coordenada Z continua en metros del usuario
    ruta: [],
    distanciaTotal: 0,
    mostrarEtiquetas: true,
    modoVista: "ar",     // "ar" por defecto para ver las flechas 3D de inmediato
    caminandoSim: false, // Botón "▶️ Caminar" activo
    gpsActivo: false,
    gpsWatchId: null,
    pasosDetectados: 0,
    // Orientación de la cámara AR:
    // desfaseMiradaGrados = cuánto ha girado el usuario respecto al pasillo activo (0° = mirando directo a las flechas)
    desfaseMiradaGrados: 0,
    brjSensorBase: null,
    brjSensorActual: null
  };

  // Referencias DOM
  const tabAR = document.getElementById("tabAR");
  const tabMap = document.getElementById("tabMap");
  const viewAR = document.getElementById("viewAR");
  const viewMap = document.getElementById("viewMap");
  const locationModeBadge = document.getElementById("locationModeBadge");

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

  const campusCanvas = document.getElementById("campusCanvas");
  const ctx = campusCanvas.getContext("2d");
  const minimapCanvas = document.getElementById("minimapCanvas");
  const miniCtx = minimapCanvas.getContext("2d");
  const mapViewport = document.getElementById("mapViewport");

  // Imagen satelital/mapa 2D opcional de fondo
  const imgMapa = new Image();
  let mapaCargado = false;
  imgMapa.onload = () => {
    mapaCargado = true;
    dibujarMapa2D();
    dibujarMinimapa();
  };
  imgMapa.src = "campus_map.png";

  // ============================================================================
  // 3. CÁLCULO DE POSICIÓN Y TRAMO ACTIVO
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

  // Avanza a lo largo del pasillo actual una cantidad de metros (por botón Caminar o por Podómetro)
  function avanzarMetrosEnRuta(metros) {
    if (estado.ruta.length < 2) return;
    if (estado.indiceActual >= estado.ruta.length - 1) {
      // Ya estaba en el destino: reiniciar desde el origen para volver a recorrer
      estado.indiceActual = 0;
      estado.progresoTramo = 0;
    }

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
        restantePorAvanzar -= metrosEnTramo;
        estado.indiceActual += 1;
        estado.progresoTramo = 0;
        // Al doblar una esquina hacia un nuevo nodo, alineamos suavemente las flechas al nuevo pasillo
        estado.desfaseMiradaGrados = 0;
        estado.brjSensorBase = estado.brjSensorActual;
      }
    }

    sincronizarCoordenadasUsuarioConProgreso();
    actualizarHUD();
    dibujarMapa2D();
    dibujarMinimapa();
    actualizarGeometriaFlechas3D();

    if (estado.indiceActual >= estado.ruta.length - 1 && estado.caminandoSim) {
      detenerSimulacionCaminata();
    }
  }

  // ============================================================================
  // 4. ESCENA 3D THREE.JS: CINTA DE PISO + FLECHAS 3D ANIMADAS FRENTE AL USUARIO
  // ============================================================================
  let arScene = null;
  let arCamera = null;
  let arRenderer = null;
  let arCorridorGroup = null;
  let arChevrons = [];
  let arBeaconMesh = null;
  let arBeaconRing = null;

  function inicializarEscena3DAR() {
    const contenedor = document.getElementById("arThreeContainer");
    if (!contenedor || typeof THREE === "undefined") return;

    arScene = new THREE.Scene();

    // Cámara a 1.55 m de altura (celular en mano) mirando ligeramente hacia el piso frente a los pies
    arCamera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      150
    );
    arCamera.position.set(0, 1.55, 0);
    arCamera.rotation.order = "YXZ";
    arCamera.rotation.x = -0.22; // ~12.5° hacia el suelo para ver las flechas desde 1.4m de distancia

    arRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    arRenderer.setSize(window.innerWidth, window.innerHeight);
    arRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    arRenderer.setClearColor(0x000000, 0);
    contenedor.innerHTML = "";
    contenedor.appendChild(arRenderer.domElement);

    const luzAmbiente = new THREE.AmbientLight(0xffffff, 1.0);
    arScene.add(luzAmbiente);

    const luzDir = new THREE.DirectionalLight(0xffffff, 0.9);
    luzDir.position.set(3, 12, 5);
    arScene.add(luzDir);

    // Grupo del pasillo activo que apunta hacia -Z cuando desfaseMiradaGrados === 0
    arCorridorGroup = new THREE.Group();
    arScene.add(arCorridorGroup);

    construirGeometriaCorredor3D();

    window.addEventListener("resize", () => {
      if (!arCamera || !arRenderer) return;
      arCamera.aspect = window.innerWidth / window.innerHeight;
      arCamera.updateProjectionMatrix();
      arRenderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Permitir girar la vista en 3D arrastrando con el dedo/mouse sobre la cámara AR
    let arrastrandoAR = false;
    let ultimoX = 0;
    viewAR.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("#arMinimap")) return;
      arrastrandoAR = true;
      ultimoX = e.clientX;
    });
    window.addEventListener("pointermove", (e) => {
      if (!arrastrandoAR) return;
      const dx = e.clientX - ultimoX;
      ultimoX = e.clientX;
      estado.desfaseMiradaGrados = ((estado.desfaseMiradaGrados - dx * 0.35 + 540) % 360) - 180;
    });
    window.addEventListener("pointerup", () => {
      arrastrandoAR = false;
    });

    requestAnimationFrame(animarEscena3DAR);
  }

  // Crea la alfombra luminosa y 8 flechas Chevron 3D grandes desde 1.4m hasta 12.6m frente al usuario
  function construirGeometriaCorredor3D() {
    if (!arCorridorGroup) return;
    while (arCorridorGroup.children.length > 0) {
      arCorridorGroup.remove(arCorridorGroup.children[0]);
    }
    arChevrons = [];

    // 1. Cinta/alfombra azul translúcida en el piso
    const largoCinta = 13.5;
    const geomCinta = new THREE.PlaneGeometry(1.15, largoCinta);
    geomCinta.rotateX(-Math.PI / 2);
    const matCinta = new THREE.MeshBasicMaterial({
      color: 0x0071e3,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    const mallaCinta = new THREE.Mesh(geomCinta, matCinta);
    mallaCinta.position.set(0, 0.01, -largoCinta / 2 - 0.8);
    arCorridorGroup.add(mallaCinta);

    // Bordes laterales brillantes cian de la cinta
    const geomBorde = new THREE.PlaneGeometry(0.06, largoCinta);
    geomBorde.rotateX(-Math.PI / 2);
    const matBorde = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const bordeIzq = new THREE.Mesh(geomBorde, matBorde);
    bordeIzq.position.set(-0.56, 0.02, -largoCinta / 2 - 0.8);
    const bordeDer = new THREE.Mesh(geomBorde, matBorde);
    bordeDer.position.set(0.56, 0.02, -largoCinta / 2 - 0.8);
    arCorridorGroup.add(bordeIzq, bordeDer);

    // 2. Molde extruido de Flecha Chevron 3D (>) apuntando hacia adelante (-Z)
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.42);       // Punta delantera
    shape.lineTo(0.46, -0.18);   // Ala derecha exterior
    shape.lineTo(0.30, -0.32);   // Ala derecha interior
    shape.lineTo(0, 0.08);       // Centro interior
    shape.lineTo(-0.30, -0.32);  // Ala izquierda interior
    shape.lineTo(-0.46, -0.18);  // Ala izquierda exterior
    shape.closePath();

    const extrudeOpts = {
      depth: 0.07,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.015,
      bevelThickness: 0.015
    };
    const geomFlecha = new THREE.ExtrudeGeometry(shape, extrudeOpts);
    geomFlecha.rotateX(-Math.PI / 2); // Acostada sobre el piso XZ apuntando hacia -Z

    const numFlechas = 8;
    for (let i = 0; i < numFlechas; i++) {
      const matFlecha = new THREE.MeshStandardMaterial({
        color: 0x00d2ff,
        emissive: 0x0066ff,
        emissiveIntensity: 0.75,
        roughness: 0.2,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(geomFlecha, matFlecha);
      const zBase = -(1.4 + i * 1.45); // Desde 1.4m frente a los pies hasta ~11.6m
      mesh.position.set(0, 0.04, zBase);
      mesh.userData = { indice: i, zBase };
      arCorridorGroup.add(mesh);
      arChevrons.push(mesh);
    }

    // 3. Pin 3D flotante al final del corredor visible indicando el siguiente nodo
    const geomPin = new THREE.OctahedronGeometry(0.32, 0);
    const matPin = new THREE.MeshStandardMaterial({
      color: 0x34c759,
      emissive: 0x15803d,
      emissiveIntensity: 0.7
    });
    arBeaconMesh = new THREE.Mesh(geomPin, matPin);
    arBeaconMesh.position.set(0, 1.1, -11.5);
    arCorridorGroup.add(arBeaconMesh);

    const geomAnillo = new THREE.RingGeometry(0.45, 0.62, 32);
    geomAnillo.rotateX(-Math.PI / 2);
    const matAnillo = new THREE.MeshBasicMaterial({
      color: 0x34c759,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    arBeaconRing = new THREE.Mesh(geomAnillo, matAnillo);
    arBeaconRing.position.set(0, 0.03, -11.5);
    arCorridorGroup.add(arBeaconRing);
  }

  function actualizarGeometriaFlechas3D() {
    if (!arCorridorGroup) return;
    const { actual, siguiente, distRestanteTramo } = obtenerTramoActivo();
    const enDestino = actual.id === siguiente.id || distRestanteTramo < 0.5;

    // Color verde esmeralda si ya estamos llegando al destino final, azul cian en ruta
    const colorPunta = enDestino ? 0x34c759 : 0x00e5ff;
    const colorEmisivo = enDestino ? 0x16a34a : 0x0066ff;

    arChevrons.forEach((mesh) => {
      mesh.material.color.setHex(colorPunta);
      mesh.material.emissive.setHex(colorEmisivo);
    });

    // Acercar el pin 3D si el nodo está a menos de 11.5 m
    const zPin = -Math.max(2.2, Math.min(11.5, distRestanteTramo));
    if (arBeaconMesh && arBeaconRing) {
      arBeaconMesh.position.z = zPin;
      arBeaconRing.position.z = zPin;
      const esDestinoFinal = estado.indiceActual >= estado.ruta.length - 2;
      arBeaconMesh.material.color.setHex(esDestinoFinal ? 0xc8102e : 0x34c759);
      arBeaconRing.material.color.setHex(esDestinoFinal ? 0xc8102e : 0x34c759);
    }
  }

  function animarEscena3DAR(tiempoMs) {
    requestAnimationFrame(animarEscena3DAR);
    if (!arRenderer || !arScene || !arCamera) return;

    const t = tiempoMs * 0.001;
    const velocidadOnda = estado.caminandoSim ? 5.5 : 3.0;

    // Si el sensor del teléfono está enviando rumbo, calculamos cuánto ha girado respecto al momento de alinear
    if (estado.brjSensorActual !== null && estado.brjSensorBase !== null) {
      estado.desfaseMiradaGrados = diferenciaAngularGrados(
        estado.brjSensorActual,
        estado.brjSensorBase
      );
    }

    // Rotar el corredor 3D según el giro del usuario (0° = corredor justo frente a la cámara)
    if (arCorridorGroup) {
      const radGiro = THREE.MathUtils.degToRad(estado.desfaseMiradaGrados);
      arCorridorGroup.rotation.y = radGiro;
    }

    // Avisar si el usuario giró más de 35° lejos del corredor de flechas
    if (arTurnHint && arTurnHintText) {
      if (Math.abs(estado.desfaseMiradaGrados) > 35) {
        arTurnHint.hidden = false;
        arTurnHintText.textContent =
          estado.desfaseMiradaGrados > 0
            ? "⬅️ Gira a la izquierda o toca '🎯 Centrar flechas'"
            : "➡️ Gira a la derecha o toca '🎯 Centrar flechas'";
      } else {
        arTurnHint.hidden = true;
      }
    }

    // Onda luminosa tipo "carril de aterrizaje" que avanza hacia adelante (-Z)
    arChevrons.forEach((mesh, idx) => {
      // Deslizamiento continuo hacia adelante
      const desplazamiento = ((t * (estado.caminandoSim ? 2.4 : 1.1) + idx * 0.18) % 1) * 1.45;
      mesh.position.z = -(1.2 + idx * 1.35 + desplazamiento);

      const pulso = (Math.sin(t * velocidadOnda - idx * 0.7) + 1) * 0.5;
      const escala = 0.92 + pulso * 0.28;
      mesh.scale.set(escala, escala, escala);
      mesh.material.emissiveIntensity = 0.45 + pulso * 0.95;
      mesh.material.opacity = 0.65 + pulso * 0.35;
    });

    if (arBeaconMesh && arBeaconRing) {
      arBeaconMesh.position.y = 1.05 + Math.sin(t * 3.2) * 0.15;
      arBeaconMesh.rotation.y = t * 1.8;
      const sAnillo = 0.85 + ((t * 1.4) % 1) * 0.75;
      arBeaconRing.scale.set(sAnillo, sAnillo, 1);
      arBeaconRing.material.opacity = 1 - ((t * 1.4) % 1);
    }

    arRenderer.render(arScene, arCamera);
  }

  // ============================================================================
  // 5. MAPA 2D INTERACTIVO Y MINIMAPA EN VIVO (CON PUNTO DEL USUARIO EN MOVIMIENTO)
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

  function dibujarMapa2D() {
    ctx.clearRect(0, 0, campusCanvas.width, campusCanvas.height);

    // Fondo arquitectónico limpio
    ctx.fillStyle = "#f4f3ee";
    ctx.fillRect(0, 0, campusCanvas.width, campusCanvas.height);

    if (mapaCargado) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(imgMapa, 0, 0, campusCanvas.width, campusCanvas.height);
      ctx.restore();
    }

    // Cuadrícula métrica sutil
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

    // 1. Pasillos caminables base
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

    // 2. Ruta activa desde la posición actual del usuario hasta el destino
    if (estado.ruta.length >= 2) {
      const posUsuario = mundoACanvas(estado.usuarioX, estado.usuarioZ);

      // Sombra de la ruta
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

      // Línea principal azul
      ctx.strokeStyle = "#0071e3";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(posUsuario.cx, posUsuario.cy);
      for (let i = estado.indiceActual + 1; i < estado.ruta.length; i++) {
        const p = mundoACanvas(estado.ruta[i].x, estado.ruta[i].z);
        ctx.lineTo(p.cx, p.cy);
      }
      ctx.stroke();

      // Chevrons blancos sobre el tramo activo
      const sigNodo = estado.ruta[Math.min(estado.indiceActual + 1, estado.ruta.length - 1)];
      const pSig = mundoACanvas(sigNodo.x, sigNodo.z);
      const ang = Math.atan2(pSig.cy - posUsuario.cy, pSig.cx - posUsuario.cx);
      const distPx = Math.hypot(pSig.cx - posUsuario.cx, pSig.cy - posUsuario.cy);
      const pasos = Math.max(1, Math.floor(distPx / 32));
      for (let s = 1; s <= pasos; s++) {
        const t = s / (pasos + 1);
        const mx = posUsuario.cx + (pSig.cx - posUsuario.cx) * t;
        const my = posUsuario.cy + (pSig.cy - posUsuario.cy) * t;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(ang);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-5, -5);
        ctx.lineTo(4, 0);
        ctx.lineTo(-5, 5);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 3. Dibujar los 20 Nodos del Campus
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
        ctx.beginPath();
        ctx.roundRect(cx - tw / 2 - 6, cy - radio - 24, tw + 12, 18, 6);
        ctx.fill();
        ctx.fillStyle = esDestino ? "#c8102e" : enRuta ? "#0071e3" : "#1c1c1e";
        ctx.textAlign = "center";
        ctx.fillText(texto, cx, cy - radio - 11);
      }
    });

    // 4. Marcador en vivo del USUARIO ("TÚ") con cono de visión
    const posU = mundoACanvas(estado.usuarioX, estado.usuarioZ);
    const { rumboTramo } = obtenerTramoActivo();
    const rumboMirada = (rumboTramo + estado.desfaseMiradaGrados + 360) % 360;
    const radCanvas = ((rumboMirada - 90) * Math.PI) / 180;

    // Cono de visión en el mapa 2D
    ctx.save();
    ctx.translate(posU.cx, posU.cy);
    ctx.rotate(radCanvas);
    ctx.fillStyle = "rgba(52, 199, 89, 0.25)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 38, -0.45, 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Halo verde pulsante del usuario
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

  // Minimapa tipo Radar que sigue en vivo la coordenada (usuarioX, usuarioZ)
  function dibujarMinimapa() {
    if (!miniCtx) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    miniCtx.clearRect(0, 0, w, h);

    miniCtx.fillStyle = "#0f172a";
    miniCtx.fillRect(0, 0, w, h);

    // Anillos de radar concéntricos alrededor del usuario
    miniCtx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    miniCtx.lineWidth = 1;
    [28, 56, 82].forEach((r) => {
      miniCtx.beginPath();
      miniCtx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      miniCtx.stroke();
    });

    // Escala: 1 metro del campus = 0.65 px en el minimapa centrado en (usuarioX, usuarioZ)
    const escala = 0.65;
    const aMini = (x, z) => ({
      mx: w / 2 + (x - estado.usuarioX) * escala,
      my: h / 2 - (z - estado.usuarioZ) * escala
    });

    // Pasillos cercanos en gris
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

    // Ruta activa en azul brillante desde el centro (usuario)
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

    // Nodos en el minimapa
    datos.nodes.forEach((n) => {
      const p = aMini(n.x, n.z);
      if (p.mx < -10 || p.mx > w + 10 || p.my < -10 || p.my > h + 10) return;
      miniCtx.beginPath();
      miniCtx.arc(p.mx, p.my, n.id === estado.destinoId ? 5.5 : 3.5, 0, Math.PI * 2);
      miniCtx.fillStyle = n.id === estado.destinoId ? "#ef4444" : "#cbd5e1";
      miniCtx.fill();
    });

    // Cono de hacia dónde mira el celular
    const { rumboTramo } = obtenerTramoActivo();
    const rumboMirada = (rumboTramo + estado.desfaseMiradaGrados + 360) % 360;
    const radMini = ((rumboMirada - 90) * Math.PI) / 180;

    miniCtx.save();
    miniCtx.translate(w / 2, h / 2);
    miniCtx.rotate(radMini);
    miniCtx.fillStyle = "rgba(56, 189, 248, 0.32)";
    miniCtx.beginPath();
    miniCtx.moveTo(0, 0);
    miniCtx.arc(0, 0, 34, -0.5, 0.5);
    miniCtx.closePath();
    miniCtx.fill();
    miniCtx.restore();

    // Punto verde del usuario en el centro exacto del minimapa
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

  // Permitir tocar cualquier nodo en el Mapa 2D para seleccionarlo como ubicación actual ("Estoy aquí")
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
  // 6. ACTUALIZACIÓN DE INTERFAZ Y RECALCULAR RUTA
  // ============================================================================
  function recalcularRutaCompleta() {
    const res = calcularRutaDijkstra(estado.origenId, estado.destinoId);
    estado.ruta = res.ruta;
    estado.distanciaTotal = res.distanciaTotal;
    estado.indiceActual = 0;
    estado.progresoTramo = 0;

    // Alinear las flechas 3D justo frente al usuario al iniciar o cambiar ruta
    estado.desfaseMiradaGrados = 0;
    estado.brjSensorBase = estado.brjSensorActual;

    sincronizarCoordenadasUsuarioConProgreso();
    actualizarHUD();
    dibujarMapa2D();
    dibujarMinimapa();
    actualizarGeometriaFlechas3D();
    publicarEventoMQTT();
  }

  function actualizarHUD() {
    const { actual, siguiente, distRestanteTramo, rumboTramo } = obtenerTramoActivo();
    const distTotalRestante = calcularDistanciaTotalRestante();
    const minutos = Math.max(0.2, distTotalRestante / 80).toFixed(1);
    const cardinal = nombrePuntoCardinal(rumboTramo);

    const nodoDestinoFinal = nodosPorId.get(estado.destinoId);
    hudStepBadge.textContent = `${actual.id} ${actual.name} ➔ ${nodoDestinoFinal ? nodoDestinoFinal.name : estado.destinoId}`;

    if (actual.id === siguiente.id || distTotalRestante < 0.8) {
      hudInstruction.textContent = `🎉 ¡Llegaste a ${actual.name}!`;
      hudSub.textContent = `Destino alcanzado · 0 m restantes`;
      if (arSignTurnIcon) arSignTurnIcon.textContent = "🏁";
      if (arSignTitle) arSignTitle.textContent = `¡Llegaste a ${actual.name}!`;
      if (arSignDist) arSignDist.textContent = `Has completado el recorrido`;
    } else {
      const mTramo = Math.round(distRestanteTramo);
      hudInstruction.textContent = `Camina ${mTramo} m hacia ${siguiente.name}`;
      hudSub.textContent = `${Math.round(distTotalRestante)} m restantes en total · ~${minutos} min`;
      if (arSignTurnIcon) arSignTurnIcon.textContent = "⬆️";
      if (arSignTitle) arSignTitle.textContent = `Sigue hacia ${siguiente.name}`;
      if (arSignDist) {
        arSignDist.textContent = `${mTramo} m al ${cardinal} (${Math.round(rumboTramo)}°) · Sigue las flechas en el piso`;
      }
    }

    if (hudCompass) {
      hudCompass.style.transform = `rotate(${rumboTramo}deg)`;
    }
    if (arHeadingText) {
      arHeadingText.textContent = `🧭 Pasillo: ${Math.round(rumboTramo)}° ${cardinal}`;
    }

    kpiNodesCount.textContent = String(estado.ruta.length);
    kpiDistanceMeters.textContent = `${Math.round(estado.distanciaTotal)} m totales`;

    // Lista de paradas
    stepsList.innerHTML = "";
    estado.ruta.forEach((nodo, idx) => {
      const li = document.createElement("li");
      li.className = `itinerary-item ${idx === estado.indiceActual ? "is-current" : ""}`;
      let detalle = "Origen";
      if (idx === estado.ruta.length - 1) detalle = "🎯 Destino";
      else if (idx > 0) {
        const d = Math.round(distanciaMetros(estado.ruta[idx - 1], nodo));
        detalle = `+${d} m`;
      }
      li.innerHTML = `
        <div><span class="itinerary-code">${nodo.id}</span><span>${nodo.name}</span></div>
        <span>${detalle}</span>
      `;
      li.addEventListener("click", () => {
        estado.indiceActual = idx;
        estado.progresoTramo = 0;
        estado.desfaseMiradaGrados = 0;
        sincronizarCoordenadasUsuarioConProgreso();
        actualizarHUD();
        dibujarMapa2D();
        dibujarMinimapa();
        actualizarGeometriaFlechas3D();
      });
      stepsList.appendChild(li);
    });
  }

  // ============================================================================
  // 7. SIMULACIÓN DE CAMINATA EN VIVO ("▶️ CAMINAR") + PODÓMETRO + GPS REAL
  // ============================================================================
  let idIntervaloCaminata = null;

  function iniciarSimulacionCaminata() {
    if (estado.caminandoSim) return;
    if (estado.indiceActual >= estado.ruta.length - 1) {
      estado.indiceActual = 0;
      estado.progresoTramo = 0;
      sincronizarCoordenadasUsuarioConProgreso();
    }
    estado.caminandoSim = true;
    btnWalkSim.classList.add("is-walking");
    btnWalkSimText.textContent = "⏸️ Pausar";
    locationModeBadge.textContent = "🏃 Caminando en vivo (Simulación)";

    // Avanza suavemente cada 80ms (~7.5 metros por segundo para demostración ágil)
    idIntervaloCaminata = setInterval(() => {
      avanzarMetrosEnRuta(0.6);
    }, 80);
  }

  function detenerSimulacionCaminata() {
    estado.caminandoSim = false;
    if (idIntervaloCaminata) {
      clearInterval(idIntervaloCaminata);
      idIntervaloCaminata = null;
    }
    btnWalkSim.classList.remove("is-walking");
    btnWalkSimText.textContent = "▶️ Caminar";
    locationModeBadge.textContent = estado.gpsActivo
      ? "🛰️ Ubicación: GPS Activo"
      : `📍 En ${estado.origenId} (QR + Pasos)`;
  }

  btnWalkSim.addEventListener("click", () => {
    if (estado.caminandoSim) {
      detenerSimulacionCaminata();
    } else {
      iniciarSimulacionCaminata();
    }
  });

  // Podómetro con acelerómetro del celular (avanza 0.85 m por cada paso real detectado)
  let ultimoPasoMs = 0;
  window.addEventListener("devicemotion", (e) => {
    const acc = e.accelerationIncludingGravity;
    if (!acc) return;
    const magnitud = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
    const ahora = performance.now();
    if (magnitud > 13.2 && ahora - ultimoPasoMs > 420) {
      ultimoPasoMs = ahora;
      estado.pasosDetectados += 1;
      if (!estado.caminandoSim) {
        locationModeBadge.textContent = `👣 Paso #${estado.pasosDetectados} detectado`;
        avanzarMetrosEnRuta(0.85);
      }
    }
  });

  // Brújula / Giroscopio relativo
  window.addEventListener(
    "deviceorientation",
    (e) => {
      let rumbo = null;
      if (typeof e.webkitCompassHeading === "number") {
        rumbo = e.webkitCompassHeading;
      } else if (typeof e.alpha === "number") {
        rumbo = (360 - e.alpha) % 360;
      }
      if (rumbo !== null) {
        if (estado.brjSensorBase === null) {
          estado.brjSensorBase = rumbo;
        }
        estado.brjSensorActual = rumbo;
      }
    },
    true
  );

  // Botón "🎯 Centrar flechas frente a mí"
  btnAlignArrows.addEventListener("click", () => {
    estado.desfaseMiradaGrados = 0;
    estado.brjSensorBase = estado.brjSensorActual;
    if (arTurnHint) arTurnHint.hidden = true;
  });

  // GPS Real opcional para cuando el usuario está físicamente dentro del campus IBERO Santa Fe
  // Coordenadas centrales aproximadas de la IBERO CDMX: Lat 19.3705, Lon -99.2636
  const IBERO_LAT0 = 19.3705;
  const IBERO_LON0 = -99.2636;
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
    btnToggleGps.textContent = "🛰️ GPS Activo (Toca para apagar)";
    locationModeBadge.textContent = "🛰️ Buscando señal GPS...";

    estado.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Convertir diferencia de lat/lon a metros respecto al centro de la IBERO
        const dxMetros = (longitude - IBERO_LON0) * 111320 * Math.cos((IBERO_LAT0 * Math.PI) / 180);
        const dzMetros = (latitude - IBERO_LAT0) * 110540;

        // Verificar si está dentro de un radio razonable (600 m) del campus IBERO
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
  // 8. CÁMARA WEB Y ESCÁNER DE CÓDIGOS QR EN VIVO
  // ============================================================================
  let streamCamara = null;
  let detectorQR = null;
  if ("BarcodeDetector" in window) {
    try {
      detectorQR = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch (_) {
      detectorQR = null;
    }
  }

  async function activarCamara(videoEl) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      if (!streamCamara) {
        streamCamara = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false
        });
      }
      videoEl.srcObject = streamCamara;
      await videoEl.play();
    } catch (err) {
      console.warn("Cámara en modo simulado (sin permiso o en PC sin webcam):", err);
    }
  }

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

    const dlg = document.getElementById("dialogQrScanner");
    if (dlg && dlg.open) dlg.close();
  }

  // Escaneo automático periódico sobre el video activo si el navegador soporta BarcodeDetector
  setInterval(async () => {
    if (!detectorQR || !streamCamara) return;
    const videoActivo = document.getElementById("dialogQrScanner")?.open
      ? document.getElementById("qrScannerVideo")
      : document.getElementById("arVideo");
    if (!videoActivo || videoActivo.readyState < 2) return;
    try {
      const codigos = await detectorQR.detect(videoActivo);
      if (codigos && codigos.length > 0) {
        const texto = (codigos[0].rawValue || "").trim();
        const match = texto.match(/N\d{2}/i);
        if (match) {
          const idDetectado = match[0].toUpperCase();
          if (nodosPorId.has(idDetectado) && idDetectado !== estado.origenId) {
            fijarUbicacionPorNodo(idDetectado, "QR Escaneado");
          }
        }
      }
    } catch (_) {}
  }, 900);

  // ============================================================================
  // 9. POBLAR SELECTORES, TARJETAS QR Y EVENTOS DE INTERFAZ
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
      fijarUbicacionPorNodo(selectOrigen.value, "Selector");
    });

    selectDestino.addEventListener("change", () => {
      estado.destinoId = selectDestino.value;
      recalcularRutaCompleta();
    });

    btnInvert.addEventListener("click", () => {
      const temp = estado.origenId;
      estado.origenId = estado.destinoId;
      estado.destinoId = temp;
      selectOrigen.value = estado.origenId;
      selectDestino.value = estado.destinoId;
      recalcularRutaCompleta();
    });

    btnNextNode.addEventListener("click", () => {
      if (estado.indiceActual < estado.ruta.length - 1) {
        estado.indiceActual += 1;
        estado.progresoTramo = 0;
        estado.desfaseMiradaGrados = 0;
      } else {
        estado.indiceActual = 0;
        estado.progresoTramo = 0;
      }
      sincronizarCoordenadasUsuarioConProgreso();
      actualizarHUD();
      dibujarMapa2D();
      dibujarMinimapa();
      actualizarGeometriaFlechas3D();
    });

    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const [o, d] = btn.dataset.preset.split(",");
        estado.origenId = o;
        estado.destinoId = d;
        selectOrigen.value = o;
        selectDestino.value = d;
        recalcularRutaCompleta();
      });
    });

    // Cambiar entre pestaña Cámara AR y Mapa 2D
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
        estado.desfaseMiradaGrados = 0;
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

    // Poblar los 20 chips de simulación QR ("Estoy aquí")
    const chipsContainer = document.getElementById("simulatedQrChips");
    datos.nodes.forEach((nodo) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-pill";
      chip.textContent = `${nodo.id} · ${nodo.name}`;
      chip.addEventListener("click", () => fijarUbicacionPorNodo(nodo.id, "QR"));
      chipsContainer.appendChild(chip);
    });

    // Poblar las 20 tarjetas QR imprimibles
    const qrGrid = document.getElementById("qrCardsGrid");
    datos.nodes.forEach((nodo) => {
      const card = document.createElement("div");
      card.className = "qr-card-item";
      const qrBox = document.createElement("div");
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

      if (typeof QRCode !== "undefined") {
        new QRCode(qrBox, {
          text: `ARGOS:${nodo.id}`,
          width: 100,
          height: 100,
          colorDark: "#1c1c1e",
          colorLight: "#ffffff"
        });
      }
    });

    document.getElementById("btnPrintCards")?.addEventListener("click", () => window.print());

    // Colapsar/expandir detalles de la tarjeta inferior tocando la barra superior
    const sheetDetails = document.getElementById("sheetDetails");
    document.getElementById("sheetHandle")?.addEventListener("click", () => {
      const oculto = sheetDetails.style.display === "none";
      sheetDetails.style.display = oculto ? "flex" : "none";
    });
  }

  // ============================================================================
  // 10. FALLBACKS WEB MODERNOS (DECLARATIVE DIALOG, LIGHT DISMISS, 2D PANNING)
  // ============================================================================
  function configurarFallbacksWebModernos() {
    // 1. Fallback para commandfor / command en navegadores sin Invoker Commands nativo
    if (!("commandForElement" in HTMLButtonElement.prototype)) {
      document.querySelectorAll("[commandfor]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const target = document.getElementById(btn.getAttribute("commandfor"));
          const cmd = btn.getAttribute("command");
          if (!target) return;
          if (cmd === "show-modal" && typeof target.showModal === "function") {
            target.showModal();
            if (target.id === "dialogQrScanner") {
              activarCamara(document.getElementById("qrScannerVideo"));
            }
          } else if (cmd === "close" && typeof target.close === "function") {
            target.close();
          }
        });
      });
    } else {
      document.getElementById("btnOpenQrModal")?.addEventListener("click", () => {
        activarCamara(document.getElementById("qrScannerVideo"));
      });
      document.getElementById("btnScanOrigin")?.addEventListener("click", () => {
        activarCamara(document.getElementById("qrScannerVideo"));
      });
    }

    // 2. Fallback para closedby="any" (light-dismiss-a-dialog)
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      document.querySelectorAll('dialog[closedby="any"]').forEach((dlg) => {
        dlg.addEventListener("click", (e) => {
          if (e.target === dlg) dlg.close();
        });
      });
    }

    // 3. Arrastre 2D (2d-panning) con puntero sobre el contenedor del mapa
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
  // 11. TELEMETRÍA MQTT OPCIONAL (SINCRONIZACIÓN CON META QUEST 3S / PRÁCTICA 6)
  // ============================================================================
  let clienteMqtt = null;
  function publicarEventoMQTT() {
    if (typeof mqtt === "undefined") return;
    try {
      if (!clienteMqtt) {
        clienteMqtt = mqtt.connect("wss://broker.emqx.io:8084/mqtt");
      }
      if (clienteMqtt && clienteMqtt.connected) {
        clienteMqtt.publish(
          "ibero/argos/navegacion",
          JSON.stringify({
            origen: estado.origenId,
            destino: estado.destinoId,
            usuarioX: Math.round(estado.usuarioX * 10) / 10,
            usuarioZ: Math.round(estado.usuarioZ * 10) / 10,
            distanciaRestante: Math.round(calcularDistanciaTotalRestante()),
            timestamp: Date.now()
          })
        );
      }
    } catch (_) {}
  }

  // ============================================================================
  // 12. ARRANQUE INMEDIATO EN MODO CÁMARA AR CON FLECHAS 3D VISIBLES
  // ============================================================================
  inicializarControles();
  configurarFallbacksWebModernos();
  inicializarEscena3DAR();
  recalcularRutaCompleta();
  activarCamara(document.getElementById("arVideo"));
})();
