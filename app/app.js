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
    gpsActivo: false,
    gpsWatchId: null,
    pasosDetectados: 0,
    desfaseMiradaGrados: 0,
    brjSensorBase: null,
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

  const imgMapa = new Image();
  let mapaCargado = false;
  imgMapa.onload = () => {
    mapaCargado = true;
    dibujarMapa2D();
  };
  imgMapa.src = "campus_map.png";

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
    if (estado.ruta.length < 2) return;
    if (estado.indiceActual >= estado.ruta.length - 1) {
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
        estado.desfaseMiradaGrados = 0;
        estado.brjSensorBase = estado.brjSensorActual;
      }
    }

    sincronizarCoordenadasUsuarioConProgreso();
    actualizarHUD();
    dibujarMapa2D();
    dibujarMinimapa();

    if (estado.indiceActual >= estado.ruta.length - 1 && estado.caminandoSim) {
      detenerSimulacionCaminata();
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
    estado.desfaseMiradaGrados = ((estado.desfaseMiradaGrados - dx * 0.35 + 540) % 360) - 180;
    dibujarMinimapa();
  });
  window.addEventListener("pointerup", () => {
    arrastrandoAR = false;
  });

  // Proyecta un punto 3D del piso (xMetros lateral, yMetros altura, zMetros distancia hacia adelante)
  // a coordenadas de pantalla (sx, sy) ubicadas entre el 40% y el 82% de la altura (arriba del menú compacto)
  function proyectarPuntoPiso3D(xMetros, yMetros, zMetros, w, h, yawRad) {
    // Rotar según el giro de la cámara (yawRad)
    const cosY = Math.cos(yawRad);
    const sinY = Math.sin(yawRad);
    const rx = xMetros * cosY - zMetros * sinY;
    const rz = xMetros * sinY + zMetros * cosY;

    if (rz <= 0.45) return null; // Detrás de la cámara

    const horizonteY = h * 0.39;
    const alturaCamara = 1.55;
    const fovEscala = Math.min(w, h) * 0.78;

    const sx = w * 0.5 + (rx / rz) * fovEscala;
    const sy = horizonteY + ((alturaCamara - yMetros) / rz) * (h * 0.46);
    const escala = fovEscala / rz;

    return { sx, sy, rz, escala };
  }

  function renderizarBucleAR(tiempoMs) {
    requestAnimationFrame(renderizarBucleAR);
    if (estado.modoVista !== "ar") return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    arCtx.clearRect(0, 0, w, h);

    // Sincronizar giroscopio/brújula si está disponible
    if (estado.brjSensorActual !== null && estado.brjSensorBase !== null && !arrastrandoAR) {
      estado.desfaseMiradaGrados = diferenciaAngularGrados(
        estado.brjSensorActual,
        estado.brjSensorBase
      );
    }

    const yawRad = (-estado.desfaseMiradaGrados * Math.PI) / 180;

    // Aviso si el usuario giró más de 38° lejos del pasillo
    if (arTurnHint && arTurnHintText) {
      if (Math.abs(estado.desfaseMiradaGrados) > 38) {
        arTurnHint.hidden = false;
        arTurnHintText.textContent =
          estado.desfaseMiradaGrados > 0
            ? "⬅️ Gira a la izquierda o toca '🎯 Centrar flechas'"
            : "➡️ Gira a la derecha o toca '🎯 Centrar flechas'";
      } else {
        arTurnHint.hidden = true;
      }
    }

    const { actual, siguiente, distRestanteTramo } = obtenerTramoActivo();
    const enDestino = actual.id === siguiente.id || distRestanteTramo < 0.8;

    // 1. Dibujar la alfombra 3D perspectiva del pasillo (de z = 1.1m a z = 12.5m)
    const zCerca = 1.1;
    const zLejos = 12.5;
    const anchoMedio = 0.62;

    const pIzqCerca = proyectarPuntoPiso3D(-anchoMedio, 0, zCerca, w, h, yawRad);
    const pDerCerca = proyectarPuntoPiso3D(anchoMedio, 0, zCerca, w, h, yawRad);
    const pDerLejos = proyectarPuntoPiso3D(anchoMedio, 0, zLejos, w, h, yawRad);
    const pIzqLejos = proyectarPuntoPiso3D(-anchoMedio, 0, zLejos, w, h, yawRad);

    if (pIzqCerca && pDerCerca && pDerLejos && pIzqLejos) {
      const gradCinta = arCtx.createLinearGradient(0, pIzqCerca.sy, 0, pIzqLejos.sy);
      if (enDestino) {
        gradCinta.addColorStop(0, "rgba(52, 199, 89, 0.55)");
        gradCinta.addColorStop(1, "rgba(52, 199, 89, 0.08)");
      } else {
        gradCinta.addColorStop(0, "rgba(0, 113, 227, 0.62)");
        gradCinta.addColorStop(0.7, "rgba(0, 198, 255, 0.35)");
        gradCinta.addColorStop(1, "rgba(0, 198, 255, 0.05)");
      }

      arCtx.beginPath();
      arCtx.moveTo(pIzqCerca.sx, pIzqCerca.sy);
      arCtx.lineTo(pDerCerca.sx, pDerCerca.sy);
      arCtx.lineTo(pDerLejos.sx, pDerLejos.sy);
      arCtx.lineTo(pIzqLejos.sx, pIzqLejos.sy);
      arCtx.closePath();
      arCtx.fillStyle = gradCinta;
      arCtx.fill();

      // Rieles laterales luminosos
      arCtx.strokeStyle = enDestino ? "#4ade80" : "#38bdf8";
      arCtx.lineWidth = 3.5;
      arCtx.beginPath();
      arCtx.moveTo(pIzqCerca.sx, pIzqCerca.sy);
      arCtx.lineTo(pIzqLejos.sx, pIzqLejos.sy);
      arCtx.moveTo(pDerCerca.sx, pDerCerca.sy);
      arCtx.lineTo(pDerLejos.sx, pDerLejos.sy);
      arCtx.stroke();
    }

    // 2. Dibujar 7 Flechas Chevron 3D grandes y extruidas que avanzan por el piso
    const t = tiempoMs * 0.001;
    const velocidad = estado.caminandoSim ? 2.6 : 1.25;
    const numFlechas = 7;

    // Dibujar de atrás hacia adelante para superposición 3D correcta
    for (let i = numFlechas - 1; i >= 0; i--) {
      const avanceCiclo = ((t * velocidad + (numFlechas - 1 - i) * 0.16) % 1);
      const zCentro = 1.35 + i * 1.45 + avanceCiclo * 1.45;
      if (zCentro > 11.8) continue;

      // Vértices 3D del Chevron sobre el piso (y = 0) y su cara superior extruida (y = 0.06)
      const punta = proyectarPuntoPiso3D(0, 0.05, zCentro + 0.45, w, h, yawRad);
      const alaDer = proyectarPuntoPiso3D(0.46, 0.05, zCentro - 0.16, w, h, yawRad);
      const intDer = proyectarPuntoPiso3D(0.28, 0.05, zCentro - 0.34, w, h, yawRad);
      const centroInt = proyectarPuntoPiso3D(0, 0.05, zCentro + 0.08, w, h, yawRad);
      const intIzq = proyectarPuntoPiso3D(-0.28, 0.05, zCentro - 0.34, w, h, yawRad);
      const alaIzq = proyectarPuntoPiso3D(-0.46, 0.05, zCentro - 0.16, w, h, yawRad);

      if (!punta || !alaDer || !intDer || !centroInt || !intIzq || !alaIzq) continue;

      const pulso = (Math.sin(t * 4.5 - i * 0.7) + 1) * 0.5;
      const alpha = Math.min(1, Math.max(0.35, 1.15 - zCentro / 12.5));

      // Sombra 3D bajo la flecha para darle volumen sobre el piso real
      arCtx.save();
      arCtx.translate(0, 5);
      arCtx.beginPath();
      arCtx.moveTo(punta.sx, punta.sy);
      arCtx.lineTo(alaDer.sx, alaDer.sy);
      arCtx.lineTo(intDer.sx, intDer.sy);
      arCtx.lineTo(centroInt.sx, centroInt.sy);
      arCtx.lineTo(intIzq.sx, intIzq.sy);
      arCtx.lineTo(alaIzq.sx, alaIzq.sy);
      arCtx.closePath();
      arCtx.fillStyle = `rgba(0, 20, 60, ${0.45 * alpha})`;
      arCtx.fill();
      arCtx.restore();

      // Cara superior brillante de la flecha 3D
      arCtx.beginPath();
      arCtx.moveTo(punta.sx, punta.sy);
      arCtx.lineTo(alaDer.sx, alaDer.sy);
      arCtx.lineTo(intDer.sx, intDer.sy);
      arCtx.lineTo(centroInt.sx, centroInt.sy);
      arCtx.lineTo(intIzq.sx, intIzq.sy);
      arCtx.lineTo(alaIzq.sx, alaIzq.sy);
      arCtx.closePath();

      if (enDestino) {
        arCtx.fillStyle = `rgba(74, 222, 128, ${alpha})`;
        arCtx.strokeStyle = "#ffffff";
      } else {
        const r = Math.round(0 + pulso * 90);
        const g = Math.round(205 + pulso * 50);
        arCtx.fillStyle = `rgba(${r}, ${g}, 255, ${alpha})`;
        arCtx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      }
      arCtx.lineWidth = Math.max(1.5, 3.2 - zCentro * 0.2);
      arCtx.fill();
      arCtx.stroke();
    }

    // 3. Pin 3D de Destino/Parada al final del corredor
    const zPin = Math.max(2.6, Math.min(10.8, distRestanteTramo));
    const reboteY = Math.sin(t * 3.5) * 0.12;
    const pPinBase = proyectarPuntoPiso3D(0, 0, zPin, w, h, yawRad);
    const pPinAlto = proyectarPuntoPiso3D(0, 1.15 + reboteY, zPin, w, h, yawRad);

    if (pPinBase && pPinAlto) {
      // Anillo pulsante en el suelo
      const radioAnillo = Math.max(14, 46 / (zPin * 0.25));
      arCtx.beginPath();
      arCtx.ellipse(
        pPinBase.sx,
        pPinBase.sy,
        radioAnillo,
        radioAnillo * 0.38,
        0,
        0,
        Math.PI * 2
      );
      arCtx.strokeStyle = enDestino ? "#4ade80" : "#38bdf8";
      arCtx.lineWidth = 3;
      arCtx.stroke();

      // Poste de luz vertical
      arCtx.beginPath();
      arCtx.moveTo(pPinBase.sx, pPinBase.sy);
      arCtx.lineTo(pPinAlto.sx, pPinAlto.sy);
      arCtx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      arCtx.lineWidth = 2.5;
      arCtx.stroke();

      // Rombo 3D flotante
      const tamRombo = Math.max(12, 26 / (zPin * 0.28));
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

      // Etiqueta flotante sobre el pin 3D
      const textoPin = `${siguiente.id} · ${siguiente.name} (${Math.round(distRestanteTramo)} m)`;
      arCtx.font = "800 12px Inter, -apple-system, sans-serif";
      const tw = arCtx.measureText(textoPin).width;
      const bx = pPinAlto.sx - tw / 2 - 10;
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
      arCtx.fillText(textoPin, pPinAlto.sx, by + 16);
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

  function dibujarMapa2D() {
    ctx.clearRect(0, 0, campusCanvas.width, campusCanvas.height);

    ctx.fillStyle = "#f4f3ee";
    ctx.fillRect(0, 0, campusCanvas.width, campusCanvas.height);

    if (mapaCargado) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.drawImage(imgMapa, 0, 0, campusCanvas.width, campusCanvas.height);
      ctx.restore();
    }

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
    estado.desfaseMiradaGrados = 0;
    estado.brjSensorBase = estado.brjSensorActual;

    sincronizarCoordenadasUsuarioConProgreso();
    actualizarHUD();
    dibujarMapa2D();
    dibujarMinimapa();
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
      hudSub.textContent = `${Math.round(distTotalRestante)} m restantes · ~${minutos} min`;
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
        fijarEstadoMenu(true);
      });
      stepsList.appendChild(li);
    });
  }

  // ============================================================================
  // 8. SIMULACIÓN DE CAMINATA EN VIVO ("▶️ CAMINAR") + PODÓMETRO + GPS
  // ============================================================================
  let idIntervaloCaminata = null;

  function iniciarSimulacionCaminata() {
    if (estado.caminandoSim) return;
    if (estado.indiceActual >= estado.ruta.length - 1) {
      estado.indiceActual = 0;
      estado.progresoTramo = 0;
      sincronizarCoordenadasUsuarioConProgreso();
    }
    // Bajar automáticamente el menú al caminar para que se vea todo el piso AR
    fijarEstadoMenu(true);
    estado.caminandoSim = true;
    btnWalkSim.classList.add("is-walking");
    btnWalkSimText.textContent = "⏸️ Pausar";
    locationModeBadge.textContent = "🏃 Caminando en vivo";

    idIntervaloCaminata = setInterval(() => {
      avanzarMetrosEnRuta(0.65);
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
      : `📍 ${estado.origenId} (QR + Pasos)`;
  }

  btnWalkSim.addEventListener("click", () => {
    if (estado.caminandoSim) {
      detenerSimulacionCaminata();
    } else {
      iniciarSimulacionCaminata();
    }
  });

  // Podómetro con acelerómetro del celular
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
        locationModeBadge.textContent = `👣 Paso #${estado.pasosDetectados}`;
        avanzarMetrosEnRuta(0.85);
      }
    }
  });

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

  btnAlignArrows.addEventListener("click", () => {
    estado.desfaseMiradaGrados = 0;
    estado.brjSensorBase = estado.brjSensorActual;
    if (arTurnHint) arTurnHint.hidden = true;
    dibujarMinimapa();
  });

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
    btnToggleGps.textContent = "🛰️ GPS Activo (Apagar)";
    locationModeBadge.textContent = "🛰️ Buscando GPS...";

    estado.gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dxMetros = (longitude - IBERO_LON0) * 111320 * Math.cos((IBERO_LAT0 * Math.PI) / 180);
        const dzMetros = (latitude - IBERO_LAT0) * 110540;

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
    } catch (_) {}
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
    fijarEstadoMenu(true);

    const dlg = document.getElementById("dialogQrScanner");
    if (dlg && dlg.open) dlg.close();
  }

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

    const chipsContainer = document.getElementById("simulatedQrChips");
    datos.nodes.forEach((nodo) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-pill";
      chip.textContent = `${nodo.id} · ${nodo.name}`;
      chip.addEventListener("click", () => fijarUbicacionPorNodo(nodo.id, "QR"));
      chipsContainer.appendChild(chip);
    });

    const qrGrid = document.getElementById("qrCardsGrid");
    datos.nodes.forEach((nodo) => {
      const card = document.createElement("div");
      card.className = "qr-card-item";
      const qrBox = document.createElement("div");
      qrBox.style.minHeight = "100px";
      qrBox.style.display = "flex";
      qrBox.style.alignItems = "center";
      qrBox.style.justifyContent = "center";
      qrBox.innerHTML = `<code style="font-size:0.75rem;padding:8px;background:#fff;border-radius:8px;border:1px solid #cbd5e1;">ARGOS:${nodo.id}</code>`;

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

      // Si la librería opcional QRCode ya cargó o cuando cargue, dibuja el QR gráfico
      const intentarDibujarQR = () => {
        if (typeof window.QRCode !== "undefined") {
          qrBox.innerHTML = "";
          new window.QRCode(qrBox, {
            text: `ARGOS:${nodo.id}`,
            width: 100,
            height: 100,
            colorDark: "#1c1c1e",
            colorLight: "#ffffff"
          });
          return true;
        }
        return false;
      };
      if (!intentarDibujarQR()) {
        window.addEventListener("load", intentarDibujarQR, { once: true });
      }
    });

    document.getElementById("btnPrintCards")?.addEventListener("click", () => window.print());
  }

  // ============================================================================
  // 11. FALLBACKS WEB MODERNOS (DECLARATIVE DIALOG, LIGHT DISMISS, 2D PANNING)
  // ============================================================================
  function configurarFallbacksWebModernos() {
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
  recalcularRutaCompleta();
  activarCamara(document.getElementById("arVideo"));
  requestAnimationFrame(renderizarBucleAR);
})();
