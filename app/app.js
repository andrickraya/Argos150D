(() => {
  'use strict';

  const DATA = window.ARGOS_CAMPUS_DATA;
  const VELOCIDAD_CAMINATA = 1.4; // m/s

  // Mapeo de Nodos
  const nodosPorId = new Map();
  DATA.nodos.forEach((n) => nodosPorId.set(n.id, n));

  // Grafo con distancias euclidianas reales
  const grafo = new Map();
  DATA.nodos.forEach((n) => grafo.set(n.id, []));
  DATA.aristas.forEach(([u, v]) => {
    const nu = nodosPorId.get(u);
    const nv = nodosPorId.get(v);
    if (!nu || !nv) return;
    const dist = Math.hypot(nv.x - nu.x, nv.z - nu.z);
    grafo.get(u).push({ vecino: v, peso: dist });
    grafo.get(v).push({ vecino: u, peso: dist });
  });

  // Estado global de la aplicación
  const estado = {
    modoVista: 'mapa', // 'mapa' o 'ar'
    origenId: 'N07',   // Salón C por defecto
    destinoId: 'N10',  // Cafetería El Cubo por defecto
    ruta: [],
    mostrarNombres: false,
    offsetAnim: 0,
    rumboUsuarioDeg: 0,  // Ángulo de la brújula del usuario (0 = Norte)
    rumboManualDeg: 0,
    usandoSensores: false,
    cameraStream: null,
    scannerStream: null,
    scannerTimer: null,
    mqttClient: null
  };

  // Referencias DOM
  const tabMap = document.getElementById('tabMap');
  const tabAR = document.getElementById('tabAR');
  const viewMap = document.getElementById('viewMap');
  const viewAR = document.getElementById('viewAR');
  const arVideo = document.getElementById('arVideo');
  const arThreeContainer = document.getElementById('arThreeContainer');
  const arHeadingText = document.getElementById('arHeadingText');
  const btnCalibrateHeading = document.getElementById('btnCalibrateHeading');
  const arMinimap = document.getElementById('arMinimap');
  const minimapCanvas = document.getElementById('minimapCanvas');
  const miniCtx = minimapCanvas.getContext('2d');

  const selectOrigen = document.getElementById('selectOrigen');
  const selectDestino = document.getElementById('selectDestino');
  const hudStepBadge = document.getElementById('hudStepBadge');
  const hudInstruction = document.getElementById('hudInstruction');
  const hudSub = document.getElementById('hudSub');
  const hudCompass = document.getElementById('hudCompass');
  const btnNextNode = document.getElementById('btnNextNode');
  const btnInvert = document.getElementById('btnInvert');
  const btnScanOrigin = document.getElementById('btnScanOrigin');
  const stepsList = document.getElementById('stepsList');
  const kpiNodesCount = document.getElementById('kpiNodesCount');
  const kpiDistanceMeters = document.getElementById('kpiDistanceMeters');

  const canvasMap = document.getElementById('campusCanvas');
  const ctxMap = canvasMap.getContext('2d');
  const mapViewport = document.getElementById('mapViewport');
  const btnCenterRoute = document.getElementById('btnCenterRoute');
  const btnToggleLabels = document.getElementById('btnToggleLabels');

  // Modales
  const dialogQrScanner = document.getElementById('dialogQrScanner');
  const btnOpenQrModal = document.getElementById('btnOpenQrModal');
  const btnCloseQrDialog = document.getElementById('btnCloseQrDialog');
  const qrScannerVideo = document.getElementById('qrScannerVideo');
  const scannerStatusText = document.getElementById('scannerStatusText');
  const simulatedQrChips = document.getElementById('simulatedQrChips');

  const dialogQrCards = document.getElementById('dialogQrCards');
  const btnOpenPrintModal = document.getElementById('btnOpenPrintModal');
  const btnClosePrintDialog = document.getElementById('btnClosePrintDialog');
  const btnPrintCards = document.getElementById('btnPrintCards');
  const qrCardsGrid = document.getElementById('qrCardsGrid');

  // ---------------------------------------------------------------------------
  // 1. Algoritmo Dijkstra para encontrar la ruta más corta
  // ---------------------------------------------------------------------------
  function calcularRutaOptima(inicioId, finId) {
    if (inicioId === finId) return [inicioId];

    const dist = new Map();
    const prev = new Map();
    const visitados = new Set();
    DATA.nodos.forEach((n) => dist.set(n.id, Infinity));
    dist.set(inicioId, 0);

    while (visitados.size < DATA.nodos.length) {
      let actual = null;
      let mejorD = Infinity;
      for (const [id, d] of dist.entries()) {
        if (!visitados.has(id) && d < mejorD) {
          mejorD = d;
          actual = id;
        }
      }
      if (actual === null || actual === finId) break;
      visitados.add(actual);

      for (const arista of grafo.get(actual) || []) {
        const alt = dist.get(actual) + arista.peso;
        if (alt < dist.get(arista.vecino)) {
          dist.set(arista.vecino, alt);
          prev.set(arista.vecino, actual);
        }
      }
    }

    const camino = [];
    let curr = finId;
    while (curr) {
      camino.unshift(curr);
      curr = prev.get(curr);
    }
    return camino[0] === inicioId ? camino : [inicioId];
  }

  function calcularRumboGrados(a, b) {
    // 0° = Norte (+Z), 90° = Este (+X)
    const rad = Math.atan2(b.x - a.x, b.z - a.z);
    return ((rad * 180) / Math.PI + 360) % 360;
  }

  function rumboCardinal(grados) {
    const dirs = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
    const idx = Math.round((((grados % 360) + 360) % 360) / 45) % 8;
    return dirs[idx];
  }

  // ---------------------------------------------------------------------------
  // 2. Actualización de UI y Hoja de Ruta
  // ---------------------------------------------------------------------------
  function actualizarRuta() {
    estado.ruta = calcularRutaOptima(estado.origenId, estado.destinoId);
    selectOrigen.value = estado.origenId;
    selectDestino.value = estado.destinoId;

    let totalMetros = 0;
    for (let i = 1; i < estado.ruta.length; i++) {
      const a = nodosPorId.get(estado.ruta[i - 1]);
      const b = nodosPorId.get(estado.ruta[i]);
      totalMetros += Math.hypot(b.x - a.x, b.z - a.z);
    }

    const nodoActual = nodosPorId.get(estado.origenId);
    const nodoFinal = nodosPorId.get(estado.destinoId);

    kpiNodesCount.textContent = `${estado.ruta.length}`;
    kpiDistanceMeters.textContent = `${Math.round(totalMetros)} m totales`;

    if (estado.ruta.length <= 1) {
      hudStepBadge.textContent = '🎉 ¡Llegaste a tu destino!';
      hudInstruction.textContent = `Estás en ${nodoActual.nombre}`;
      hudSub.textContent = `${nodoActual.id} · ${nodoActual.desc}`;
      hudCompass.style.transform = 'rotate(0deg)';
      btnNextNode.style.display = 'none';
    } else {
      btnNextNode.style.display = 'flex';
      const sigNodo = nodosPorId.get(estado.ruta[1]);
      const distTramo = Math.round(Math.hypot(sigNodo.x - nodoActual.x, sigNodo.z - nodoActual.z));
      const rumbo = calcularRumboGrados(nodoActual, sigNodo);
      const cardinal = rumboCardinal(rumbo);

      hudStepBadge.textContent = `${nodoActual.nombre} ➔ ${nodoFinal.nombre}`;
      hudInstruction.textContent = `Avanza ${distTramo} m al ${cardinal} hacia ${sigNodo.nombre}`;
      const minutos = (totalMetros / VELOCIDAD_CAMINATA / 60).toFixed(1);
      hudSub.textContent = `${Math.round(totalMetros)} m restantes · ~${minutos} min caminando`;
      hudCompass.style.transform = `rotate(${rumbo}deg)`;
    }

    // Lista de pasos expandible
    stepsList.innerHTML = '';
    estado.ruta.forEach((id, idx) => {
      const n = nodosPorId.get(id);
      const li = document.createElement('li');
      li.className = `itinerary-item ${idx === 0 ? 'is-current' : ''}`;
      li.innerHTML = `
        <div>
          <span class="itinerary-code">${n.id}</span>
          <span>${n.nombre}</span>
        </div>
        <span style="font-size:0.75rem;color:var(--text-secondary);">${idx === 0 ? '📍 Inicio' : idx === estado.ruta.length - 1 ? '🎯 Meta' : `Paso ${idx}`}</span>
      `;
      li.addEventListener('click', () => {
        estado.origenId = id;
        actualizarRuta();
      });
      stepsList.appendChild(li);
    });

    // Actualizar escena 3D de Realidad Aumentada
    actualizarFlechas3DAR();
    publicarMqtt();
  }

  // ---------------------------------------------------------------------------
  // 3. Renderizado del Mapa 2D Elegante (Estilo Vectorial Limpio)
  // ---------------------------------------------------------------------------
  function mundoACanvas(x, z, w = canvasMap.width, h = canvasMap.height) {
    const cx = w * 0.48 + x * 2.3;
    const cy = h * 0.44 - z * 1.95;
    return [cx, cy];
  }

  function dibujarMapa2D() {
    ctxMap.clearRect(0, 0, canvasMap.width, canvasMap.height);

    // Fondo plano limpio
    ctxMap.fillStyle = '#f8f8f5';
    ctxMap.fillRect(0, 0, canvasMap.width, canvasMap.height);

    // Cuadrícula sutil
    ctxMap.strokeStyle = 'rgba(0,0,0,0.03)';
    ctxMap.lineWidth = 1;
    for (let x = 0; x < canvasMap.width; x += 60) {
      ctxMap.beginPath(); ctxMap.moveTo(x, 0); ctxMap.lineTo(x, canvasMap.height); ctxMap.stroke();
    }
    for (let y = 0; y < canvasMap.height; y += 60) {
      ctxMap.beginPath(); ctxMap.moveTo(0, y); ctxMap.lineTo(canvasMap.width, y); ctxMap.stroke();
    }

    // Polígonos de OpenStreetMap (edificios y áreas)
    const orden = { pasto: 1, estacionamiento: 2, cancha: 3, edificio: 4, ibero: 5 };
    const colores = {
      pasto: '#e2f0d9',
      estacionamiento: '#e5e7eb',
      cancha: '#d1fae5',
      edificio: '#e5e2da',
      ibero: '#d97d74'
    };

    const poligonos = [...DATA.poligonos].sort((a, b) => (orden[a.tipo] || 0) - (orden[b.tipo] || 0));
    poligonos.forEach((poly) => {
      if (!poly.pts || poly.pts.length < 3) return;
      ctxMap.beginPath();
      poly.pts.forEach(([x, z], idx) => {
        const [cx, cy] = mundoACanvas(x, z);
        if (idx === 0) ctxMap.moveTo(cx, cy);
        else ctxMap.lineTo(cx, cy);
      });
      ctxMap.closePath();
      ctxMap.fillStyle = colores[poly.tipo] || '#e5e5ea';
      ctxMap.fill();
      if (poly.tipo === 'ibero' || poly.tipo === 'edificio') {
        ctxMap.strokeStyle = poly.tipo === 'ibero' ? '#b54e44' : '#cdc8be';
        ctxMap.lineWidth = 1.2;
        ctxMap.stroke();
      }
    });

    // Pasillos peatonales (grafo completo en gris claro)
    ctxMap.save();
    ctxMap.strokeStyle = 'rgba(100, 116, 139, 0.25)';
    ctxMap.lineWidth = 2.5;
    ctxMap.setLineDash([4, 4]);
    DATA.aristas.forEach(([u, v]) => {
      const nu = nodosPorId.get(u);
      const nv = nodosPorId.get(v);
      if (!nu || !nv) return;
      const [x1, y1] = mundoACanvas(nu.x, nu.z);
      const [x2, y2] = mundoACanvas(nv.x, nv.z);
      ctxMap.beginPath(); ctxMap.moveTo(x1, y1); ctxMap.lineTo(x2, y2); ctxMap.stroke();
    });
    ctxMap.restore();

    // Ruta óptima con flechas animadas
    if (estado.ruta.length >= 2) {
      const pts = estado.ruta.map((id) => mundoACanvas(nodosPorId.get(id).x, nodosPorId.get(id).z));

      // Sombra exterior
      ctxMap.save();
      ctxMap.strokeStyle = 'rgba(0, 113, 227, 0.2)';
      ctxMap.lineWidth = 16;
      ctxMap.lineCap = 'round';
      ctxMap.lineJoin = 'round';
      ctxMap.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctxMap.moveTo(x, y) : ctxMap.lineTo(x, y)));
      ctxMap.stroke();

      // Línea azul principal
      ctxMap.strokeStyle = '#0071e3';
      ctxMap.lineWidth = 8;
      ctxMap.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctxMap.moveTo(x, y) : ctxMap.lineTo(x, y)));
      ctxMap.stroke();

      // Flechas chevron (>) blancas en movimiento
      const paso = 24;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[i + 1];
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const ang = Math.atan2(y2 - y1, x2 - x1);
        for (let d = (estado.offsetAnim % paso); d < dist; d += paso) {
          const fx = x1 + Math.cos(ang) * d;
          const fy = y1 + Math.sin(ang) * d;
          ctxMap.save();
          ctxMap.translate(fx, fy);
          ctxMap.rotate(ang);
          ctxMap.strokeStyle = '#ffffff';
          ctxMap.lineWidth = 2.2;
          ctxMap.beginPath();
          ctxMap.moveTo(-3.5, -4);
          ctxMap.lineTo(3.5, 0);
          ctxMap.lineTo(-3.5, 4);
          ctxMap.stroke();
          ctxMap.restore();
        }
      }
      ctxMap.restore();
    }

    // Nodos en el mapa
    const enRuta = new Set(estado.ruta);
    DATA.nodos.forEach((n) => {
      const [cx, cy] = mundoACanvas(n.x, n.z);
      const esOrigen = n.id === estado.origenId;
      const esDestino = n.id === estado.destinoId;
      const estaEnRuta = enRuta.has(n.id);

      if (esOrigen || esDestino) {
        ctxMap.beginPath();
        ctxMap.arc(cx, cy, 14, 0, Math.PI * 2);
        ctxMap.fillStyle = esOrigen ? 'rgba(52, 199, 89, 0.25)' : 'rgba(200, 16, 46, 0.25)';
        ctxMap.fill();
      }

      ctxMap.beginPath();
      ctxMap.arc(cx, cy, esOrigen || esDestino ? 8.5 : estaEnRuta ? 6.5 : 5, 0, Math.PI * 2);
      ctxMap.fillStyle = esOrigen ? '#34c759' : esDestino ? '#c8102e' : estaEnRuta ? '#0071e3' : '#64748b';
      ctxMap.fill();
      ctxMap.lineWidth = 2;
      ctxMap.strokeStyle = '#ffffff';
      ctxMap.stroke();

      // Etiquetas limpias
      if (esOrigen || esDestino || estado.mostrarNombres) {
        const texto = `${n.id} · ${n.nombre}`;
        ctxMap.font = esOrigen || esDestino ? 'bold 12px Inter, sans-serif' : '500 11px Inter, sans-serif';
        const tw = ctxMap.measureText(texto).width;
        ctxMap.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctxMap.beginPath();
        ctxMap.roundRect(cx + 8, cy - 9, tw + 8, 18, 5);
        ctxMap.fill();
        ctxMap.fillStyle = esOrigen ? '#1b5e20' : esDestino ? '#b71c1c' : '#1e293b';
        ctxMap.fillText(texto, cx + 12, cy + 4);
      }
    });

    estado.offsetAnim = (estado.offsetAnim + 0.4) % 240;
    if (estado.modoVista === 'mapa') requestAnimationFrame(dibujarMapa2D);
  }

  // ---------------------------------------------------------------------------
  // 4. Módulo de Realidad Aumentada (Three.js 3D sobre la Cámara del Celular)
  // ---------------------------------------------------------------------------
  let arScene, arCamera, arRenderer, arArrowGroup;

  function initThreeAR() {
    if (arScene) return;

    arScene = new THREE.Scene();
    arCamera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Posición del usuario a nivel de ojos (1.6 m sobre el piso)
    arCamera.position.set(0, 1.6, 0);

    arRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    arRenderer.setSize(window.innerWidth, window.innerHeight);
    arRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    arThreeContainer.appendChild(arRenderer.domElement);

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    arScene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(0, 10, 5);
    arScene.add(dirLight);

    // Contenedor de flechas holográficas pegadas al piso
    arArrowGroup = new THREE.Group();
    arScene.add(arArrowGroup);

    window.addEventListener('resize', () => {
      if (arCamera && arRenderer) {
        arCamera.aspect = window.innerWidth / window.innerHeight;
        arCamera.updateProjectionMatrix();
        arRenderer.setSize(window.innerWidth, window.innerHeight);
      }
    });

    // Control manual por arrastre si no hay brújula
    let isDragging = false;
    let prevX = 0;
    window.addEventListener('pointerdown', (e) => {
      if (estado.modoVista !== 'ar') return;
      isDragging = true;
      prevX = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (!isDragging || estado.usandoSensores) return;
      const deltaX = e.clientX - prevX;
      estado.rumboManualDeg += deltaX * 0.35;
      prevX = e.clientX;
      actualizarOrientacionAR();
    });
    window.addEventListener('pointerup', () => (isDragging = false));

    // Sensores de orientación del celular (DeviceOrientation)
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (e) => {
        let heading = null;
        if (e.webkitCompassHeading !== undefined) {
          heading = e.webkitCompassHeading; // iOS Safari
        } else if (e.alpha !== null) {
          heading = 360 - e.alpha; // Android Chrome
        }
        if (heading !== null) {
          estado.usandoSensores = true;
          estado.rumboUsuarioDeg = heading;
          actualizarOrientacionAR();
        }
      });
    }

    animateThreeAR();
  }

  function actualizarOrientacionAR() {
    const rumboFinal = (estado.usandoSensores ? estado.rumboUsuarioDeg : estado.rumboManualDeg) % 360;
    arHeadingText.textContent = `🧭 Rumbo: ${Math.round(rumboFinal)}° ${rumboCardinal(rumboFinal)}`;
    if (arCamera) {
      // Rotar cámara virtual en Y según la brújula
      arCamera.rotation.y = THREE.MathUtils.degToRad(-rumboFinal);
    }
  }

  function actualizarFlechas3DAR() {
    if (!arArrowGroup) return;

    // Limpiar flechas anteriores
    while (arArrowGroup.children.length > 0) {
      const obj = arArrowGroup.children[0];
      arArrowGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }

    if (estado.ruta.length < 2) return;

    const actual = nodosPorId.get(estado.origenId);
    const siguiente = nodosPorId.get(estado.ruta[1]);
    if (!actual || !siguiente) return;

    // Vector relativo desde el usuario (actual) hacia el siguiente nodo
    // En Three.js: X = Este, Y = Arriba, -Z = Norte
    const deltaX = siguiente.x - actual.x;
    const deltaZ = -(siguiente.z - actual.z);
    const distancia = Math.hypot(deltaX, deltaZ);
    const anguloRumbo = Math.atan2(deltaX, deltaZ);

    // Crear cinta de 5 flechas 3D holográficas que avanzan por el pasillo
    const numFlechas = Math.min(6, Math.max(3, Math.floor(distancia / 4)));
    const chevronGeo = new THREE.ConeGeometry(0.7, 1.4, 3);
    chevronGeo.rotateX(Math.PI / 2);

    for (let i = 1; i <= numFlechas; i++) {
      const t = i / (numFlechas + 1);
      const posX = deltaX * t;
      const posZ = deltaZ * t;

      // Color degradado azul brillante
      const mat = new THREE.MeshBasicMaterial({
        color: i === 1 ? 0x00d2ff : 0x0071e3,
        wireframe: false,
        transparent: true,
        opacity: 0.85
      });

      const arrowMesh = new THREE.Mesh(chevronGeo, mat);
      // Sobre el suelo (Y = 0)
      arrowMesh.position.set(posX, 0.08, posZ);
      arrowMesh.rotation.y = anguloRumbo + Math.PI;
      arArrowGroup.add(arrowMesh);

      // Anillo de brillo alrededor de la primera flecha
      if (i === 1) {
        const ringGeo = new THREE.RingGeometry(0.8, 1.0, 16);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(posX, 0.05, posZ);
        arArrowGroup.add(ring);
      }
    }

    // Poste holográfico de meta en el siguiente nodo
    const pinGeo = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x34c759, transparent: true, opacity: 0.8 });
    const pinMesh = new THREE.Mesh(pinGeo, pinMat);
    pinMesh.position.set(deltaX, 1.6, deltaZ);
    arArrowGroup.add(pinMesh);
  }

  function animateThreeAR() {
    requestAnimationFrame(animateThreeAR);

    // Animación sutil de pulso en las flechas
    if (arArrowGroup && arArrowGroup.children.length > 0) {
      const time = Date.now() * 0.003;
      arArrowGroup.children.forEach((child, idx) => {
        if (child.isMesh && child.geometry.type === 'ConeGeometry') {
          child.position.y = 0.08 + Math.sin(time + idx * 0.8) * 0.04;
        }
      });
    }

    if (arRenderer && arScene && arCamera) {
      arRenderer.render(arScene, arCamera);
    }

    if (estado.modoVista === 'ar') {
      dibujarMinimapa();
    }
  }

  function dibujarMinimapa() {
    miniCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    miniCtx.fillStyle = '#f8f8f5';
    miniCtx.fillRect(0, 0, minimapCanvas.width, minimapCanvas.height);

    // Dibujar edificios en miniatura
    DATA.poligonos.forEach((p) => {
      if (!p.pts || p.pts.length < 3 || p.tipo !== 'ibero') return;
      miniCtx.beginPath();
      p.pts.forEach(([x, z], idx) => {
        const [cx, cy] = mundoACanvas(x, z, minimapCanvas.width, minimapCanvas.height);
        if (idx === 0) miniCtx.moveTo(cx, cy);
        else miniCtx.lineTo(cx, cy);
      });
      miniCtx.closePath();
      miniCtx.fillStyle = '#d97d74';
      miniCtx.fill();
    });

    // Ruta en el minimapa
    if (estado.ruta.length >= 2) {
      miniCtx.strokeStyle = '#0071e3';
      miniCtx.lineWidth = 3.5;
      miniCtx.beginPath();
      estado.ruta.forEach((id, i) => {
        const n = nodosPorId.get(id);
        const [cx, cy] = mundoACanvas(n.x, n.z, minimapCanvas.width, minimapCanvas.height);
        if (i === 0) miniCtx.moveTo(cx, cy);
        else miniCtx.lineTo(cx, cy);
      });
      miniCtx.stroke();
    }

    // Usuario actual (punto verde)
    const actual = nodosPorId.get(estado.origenId);
    if (actual) {
      const [ux, uy] = mundoACanvas(actual.x, actual.z, minimapCanvas.width, minimapCanvas.height);
      miniCtx.beginPath();
      miniCtx.arc(ux, uy, 5.5, 0, Math.PI * 2);
      miniCtx.fillStyle = '#34c759';
      miniCtx.fill();
      miniCtx.strokeStyle = '#fff';
      miniCtx.lineWidth = 1.5;
      miniCtx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Control de Cámara y Cambio de Pestañas (Mapa 2D / Cámara AR)
  // ---------------------------------------------------------------------------
  async function activarModoAR() {
    estado.modoVista = 'ar';
    document.body.className = 'mode-ar';
    tabMap.classList.remove('is-active');
    tabMap.setAttribute('aria-selected', 'false');
    tabAR.classList.add('is-active');
    tabAR.setAttribute('aria-selected', 'true');

    viewMap.classList.remove('is-visible');
    viewAR.classList.add('is-visible');

    initThreeAR();

    // Encender la cámara trasera del celular
    try {
      if (!estado.cameraStream) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });
        estado.cameraStream = stream;
        arVideo.srcObject = stream;
      }
    } catch (err) {
      console.warn('Cámara trasera no disponible:', err);
      arHeadingText.textContent = 'Modo Simulación AR (Cámara apagada)';
    }

    actualizarOrientacionAR();
    actualizarFlechas3DAR();
  }

  function activarModoMapa() {
    estado.modoVista = 'mapa';
    document.body.className = 'mode-map';
    tabAR.classList.remove('is-active');
    tabAR.setAttribute('aria-selected', 'false');
    tabMap.classList.add('is-active');
    tabMap.setAttribute('aria-selected', 'true');

    viewAR.classList.remove('is-visible');
    viewMap.classList.add('is-visible');

    // Apagar cámara para ahorrar batería
    if (estado.cameraStream) {
      estado.cameraStream.getTracks().forEach((t) => t.stop());
      estado.cameraStream = null;
    }

    requestAnimationFrame(dibujarMapa2D);
    centrarMapaEnRuta();
  }

  function centrarMapaEnRuta() {
    const orig = nodosPorId.get(estado.origenId);
    const dest = nodosPorId.get(estado.destinoId);
    if (!orig || !dest) return;
    const [x1, y1] = mundoACanvas(orig.x, orig.z);
    const [x2, y2] = mundoACanvas(dest.x, dest.z);
    mapViewport.scrollTo({
      left: Math.max(0, (x1 + x2) / 2 - mapViewport.clientWidth / 2),
      top: Math.max(0, (y1 + y2) / 2 - mapViewport.clientHeight / 2),
      behavior: 'smooth'
    });
  }

  // ---------------------------------------------------------------------------
  // 6. Códigos QR (Lectura en Vivo y Tarjetas)
  // ---------------------------------------------------------------------------
  function procesarLecturaQr(texto) {
    if (!texto) return;
    let nodoId = texto.trim().toUpperCase();
    try {
      const u = new URL(texto, window.location.origin);
      const param = u.searchParams.get('nodo') || u.searchParams.get('origen');
      if (param) nodoId = param.toUpperCase();
    } catch (_) {
      const match = nodoId.match(/N\d{2}/);
      if (match) nodoId = match[0];
    }

    if (nodosPorId.has(nodoId)) {
      estado.origenId = nodoId;
      actualizarRuta();
      cerrarDialogoScanner();
      return true;
    }
    return false;
  }

  async function abrirDialogoScanner() {
    dialogQrScanner.showModal();
    generarChipsSimulacion();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } }
      });
      estado.scannerStream = stream;
      qrScannerVideo.srcObject = stream;
      scannerStatusText.textContent = 'Buscando código QR...';

      if ('BarcodeDetector' in window) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        estado.scannerTimer = setInterval(async () => {
          try {
            const codes = await detector.detect(qrScannerVideo);
            if (codes.length > 0 && codes[0].rawValue) {
              procesarLecturaQr(codes[0].rawValue);
            }
          } catch (_) {}
        }, 300);
      }
    } catch (_) {
      scannerStatusText.textContent = 'Cámara no disponible. Usa los botones rápidos abajo:';
    }
  }

  function cerrarDialogoScanner() {
    if (estado.scannerTimer) clearInterval(estado.scannerTimer);
    if (estado.scannerStream) {
      estado.scannerStream.getTracks().forEach((t) => t.stop());
      estado.scannerStream = null;
    }
    dialogQrScanner.close();
  }

  function generarChipsSimulacion() {
    simulatedQrChips.innerHTML = '';
    DATA.nodos.forEach((n) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-pill';
      btn.textContent = `${n.id} · ${n.nombre}`;
      btn.addEventListener('click', () => procesarLecturaQr(n.id));
      simulatedQrChips.appendChild(btn);
    });
  }

  function generarTarjetasImprimibles() {
    qrCardsGrid.innerHTML = '';
    const base = window.location.href.split('?')[0];

    DATA.nodos.forEach((n) => {
      const card = document.createElement('div');
      card.className = 'qr-card-item';
      const box = document.createElement('div');
      const url = `${base}?nodo=${n.id}`;

      card.innerHTML = `
        <strong style="color:var(--accent);font-size:0.85rem;">${n.id}</strong>
        <span style="font-size:0.75rem;font-weight:700;">${n.nombre}</span>
      `;
      card.appendChild(box);

      const btnTest = document.createElement('button');
      btnTest.className = 'chip-sm';
      btnTest.style.color = 'var(--text-primary)';
      btnTest.style.borderColor = 'var(--border)';
      btnTest.textContent = 'Probar';
      btnTest.addEventListener('click', () => {
        procesarLecturaQr(n.id);
        dialogQrCards.close();
      });
      card.appendChild(btnTest);
      qrCardsGrid.appendChild(card);

      if (window.QRCode) {
        new window.QRCode(box, { text: url, width: 100, height: 100, colorDark: '#000', colorLight: '#fff' });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 7. Sincronización MQTT con Meta Quest 3S (Opcional)
  // ---------------------------------------------------------------------------
  function publicarMqtt() {
    if (!estado.mqttClient) return;
    const actual = nodosPorId.get(estado.origenId);
    const destino = nodosPorId.get(estado.destinoId);
    const payload = {
      timestamp: Date.now(),
      estoyEn: actual.nombre,
      destino: destino.nombre,
      ruta: estado.ruta
    };
    try {
      estado.mqttClient.publish('argos/campus/navegacion', JSON.stringify(payload));
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // 8. Inicialización
  // ---------------------------------------------------------------------------
  function init() {
    // Poblar desplegables
    DATA.nodos.forEach((n) => {
      selectOrigen.add(new Option(`${n.id} — ${n.nombre}`, n.id));
      selectDestino.add(new Option(`${n.id} — ${n.nombre}`, n.id));
    });

    // Parámetros por URL
    const params = new URLSearchParams(window.location.search);
    const pNodo = (params.get('nodo') || params.get('origen') || '').toUpperCase();
    if (nodosPorId.has(pNodo)) estado.origenId = pNodo;

    // Listeners de interfaz
    tabMap.addEventListener('click', activarModoMapa);
    tabAR.addEventListener('click', activarModoAR);
    arMinimap.addEventListener('click', activarModoMapa);

    selectOrigen.addEventListener('change', () => {
      estado.origenId = selectOrigen.value;
      actualizarRuta();
    });

    selectDestino.addEventListener('change', () => {
      estado.destinoId = selectDestino.value;
      actualizarRuta();
    });

    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [orig, dest] = btn.getAttribute('data-preset').split(',');
        estado.origenId = orig;
        estado.destinoId = dest;
        actualizarRuta();
      });
    });

    btnNextNode.addEventListener('click', () => {
      if (estado.ruta.length > 1) {
        estado.origenId = estado.ruta[1];
        actualizarRuta();
      }
    });

    btnInvert.addEventListener('click', () => {
      const t = estado.origenId;
      estado.origenId = estado.destinoId;
      estado.destinoId = t;
      actualizarRuta();
    });

    btnCenterRoute.addEventListener('click', centrarMapaEnRuta);
    btnToggleLabels.addEventListener('click', () => {
      estado.mostrarNombres = !estado.mostrarNombres;
      dibujarMapa2D();
    });

    btnOpenQrModal.addEventListener('click', abrirDialogoScanner);
    btnScanOrigin.addEventListener('click', abrirDialogoScanner);
    btnCloseQrDialog.addEventListener('click', cerrarDialogoScanner);

    btnOpenPrintModal.addEventListener('click', () => {
      generarTarjetasImprimibles();
      dialogQrCards.showModal();
    });
    btnClosePrintDialog.addEventListener('click', () => dialogQrCards.close());
    btnPrintCards.addEventListener('click', () => window.print());

    btnCalibrateHeading.addEventListener('click', () => {
      estado.rumboManualDeg = (estado.rumboManualDeg + 45) % 360;
      actualizarOrientacionAR();
    });

    // Toque sobre el mapa 2D para cambiar nodo
    canvasMap.addEventListener('click', (e) => {
      const rect = canvasMap.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * canvasMap.width;
      const clickY = ((e.clientY - rect.top) / rect.height) * canvasMap.height;

      let mejor = null;
      let dMin = 22;
      DATA.nodos.forEach((n) => {
        const [cx, cy] = mundoACanvas(n.x, n.z);
        const d = Math.hypot(clickX - cx, clickY - cy);
        if (d < dMin) {
          dMin = d;
          mejor = n;
        }
      });

      if (mejor) {
        if (e.shiftKey) estado.destinoId = mejor.id;
        else estado.origenId = mejor.id;
        actualizarRuta();
      }
    });

    // Conectar MQTT silencioso si hay broker local
    try {
      if (window.mqtt) {
        estado.mqttClient = window.mqtt.connect('ws://localhost:9001', { reconnectPeriod: 5000 });
      }
    } catch (_) {}

    actualizarRuta();
    requestAnimationFrame(dibujarMapa2D);
    setTimeout(centrarMapaEnRuta, 200);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
