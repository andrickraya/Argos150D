/*
 * Intro cinematográfica: el scroll controla el tiempo de una película (scroll-scrub).
 * Porte a JavaScript sin frameworks del motor de referencia de Higgsfield (scroll-scrub.tsx),
 * reducido a una sola toma continua. Conserva lo que lo hace fluido:
 *  - el clip se descarga como Blob (adelantar/regresar sin pedir rangos a la red),
 *  - los saltos de tiempo se juntan en requestAnimationFrame con suavizado,
 *  - el póster (primer cuadro exacto del clip) se queda hasta que el video pinta,
 *  - clip ligero en celular y "cebado" del video con el primer toque (iPhone),
 *  - funciona igual de bajada y de subida,
 *  - con prefers-reduced-motion no descarga video y deja todo el texto visible.
 *
 * Marcado esperado (ver index.html, <section id="intro">):
 *   section[data-ss][data-clip][data-clip-movil]
 *     .ss__stage > .ss__layer (póster) · .ss__timecode · .ss__progress > span · .ss__route button[data-cap]
 *     .ss__story > article.ss__chapter[id]
 */
(function () {
  "use strict";

  var raiz = document.querySelector("[data-ss]");
  if (!raiz) return;

  var clamp = function (v, a, b) { return Math.min(b === undefined ? 1 : b, Math.max(a || 0, v)); };
  var suave = function (v) { var x = clamp(v); return x * x * (3 - 2 * x); };

  var capa = raiz.querySelector(".ss__layer");
  var codigo = raiz.querySelector(".ss__timecode");
  var barra = raiz.querySelector(".ss__progress span");
  var botones = Array.prototype.slice.call(raiz.querySelectorAll(".ss__route [data-cap]"));
  var capitulos = Array.prototype.slice.call(raiz.querySelectorAll(".ss__chapter"));
  var copias = capitulos.map(function (c) { return c.querySelector(".ss__copy"); });
  var cabecera = document.querySelector("header");

  var menosMov = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tactil = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  var angosto = window.matchMedia("(max-width: 860px)");
  var esMovil = function () { return tactil || angosto.matches; };
  var fuente = function () { return esMovil() && raiz.dataset.clipMovil ? raiz.dataset.clipMovil : raiz.dataset.clip; };
  var FPS = Number(raiz.dataset.fps || 30);

  var estado = {
    top: 0, total: 1, alto: window.innerHeight, ancho: window.innerWidth,
    objetivo: 0, actual: 0, sucio: true, activo: -1, listo: false, cargando: false,
    fuente: null, video: null, url: null, abort: null, gesto: false, ultimoCodigo: ""
  };

  if (menosMov) raiz.classList.add("ss--quieto");

  // ---------- Carga del clip como Blob ----------
  function descargar() {
    if (menosMov || estado.cargando || estado.listo) return;
    var src = fuente();
    if (!src) return;
    estado.cargando = true;
    estado.fuente = src;
    estado.abort = "AbortController" in window ? new AbortController() : null;
    fetch(src, estado.abort ? { signal: estado.abort.signal } : undefined)
      .then(function (r) { if (!r.ok) throw new Error("Clip " + r.status); return r.blob(); })
      .then(function (blob) {
        if (estado.fuente !== src) return;
        var url = URL.createObjectURL(blob);
        var v = document.createElement("video");
        v.className = "ss__video";
        v.muted = true; v.playsInline = true; v.preload = "auto";
        v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
        v.src = url;
        v.addEventListener("loadedmetadata", function () {
          if (estado.video !== v) return;
          estado.listo = true; estado.cargando = false; estado.sucio = true;
          estado.actual = estado.objetivo;
          try { v.currentTime = clamp(estado.actual, 0, 0.999) * v.duration; } catch (e) { /* espera */ }
        }, { once: true });
        v.addEventListener("seeked", function () {
          if (estado.video === v) capa.dataset.pintado = "true";
        }, { once: true });
        v.addEventListener("loadeddata", function () { if (estado.gesto) cebar(v); }, { once: true });
        v.addEventListener("error", function () {
          if (estado.video !== v) return;
          descargarFuera();
          capa.dataset.fallo = "true";
        }, { once: true });
        capa.appendChild(v);
        estado.video = v; estado.url = url;
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") return;
        estado.cargando = false;
        capa.dataset.fallo = "true";
      });
  }

  function descargarFuera() {
    if (estado.abort) estado.abort.abort();
    if (estado.video) estado.video.remove();
    if (estado.url) URL.revokeObjectURL(estado.url);
    estado.video = null; estado.url = null; estado.abort = null; estado.fuente = null;
    estado.listo = false; estado.cargando = false;
    delete capa.dataset.pintado;
  }

  function cebar(v) {
    if (!v || !esMovil()) return;
    var p = v.play();
    if (p && p.then) p.then(function () { v.pause(); }).catch(function () { /* se queda el póster */ });
    else v.pause();
  }

  // ---------- Medidas ----------
  function medir() {
    // La cabecera es sticky y ocupa lugar en el flujo: la intro sube por debajo de ella para llenar toda la pantalla
    if (cabecera) raiz.style.marginTop = -cabecera.offsetHeight + "px";
    var y = window.scrollY || window.pageYOffset;
    estado.top = raiz.getBoundingClientRect().top + y;
    estado.alto = window.innerHeight;
    estado.ancho = window.innerWidth;
    estado.total = Math.max(raiz.offsetHeight - estado.alto, 1);
    if (estado.fuente && estado.fuente !== fuente()) descargarFuera();
    estado.sucio = true;
  }

  // ---------- Lectura del scroll (solo cuando cambió) ----------
  function leerScroll() {
    var y = (window.scrollY || window.pageYOffset) - estado.top;
    var p = clamp(y / estado.total);
    estado.objetivo = p;
    raiz.style.setProperty("--ss-p", p.toFixed(4));
    if (barra) barra.style.transform = "scaleX(" + p.toFixed(4) + ")";

    // Capítulos: opacidad según qué tan cerca está su texto del centro de la pantalla
    var activo = 0;
    for (var i = 0; i < capitulos.length; i++) {
      var r = capitulos[i].getBoundingClientRect();
      if (r.top < estado.alto * 0.55) activo = i;
      if (menosMov || !copias[i]) continue;
      var c = copias[i].getBoundingClientRect();
      var centro = c.top + c.height / 2;
      // En celular el texto va en la parte baja de la pantalla: el punto de máxima opacidad baja con él
      var ancla = estado.alto * (esMovil() ? 0.66 : 0.5);
      var d = Math.abs(centro - ancla) / (estado.alto * (esMovil() ? 0.75 : 0.62));
      copias[i].style.opacity = String(suave(1 - d).toFixed(3));
      copias[i].style.transform = "translate3d(0," + ((centro - ancla) * 0.08).toFixed(1) + "px,0)";
    }
    if (activo !== estado.activo) {
      estado.activo = activo;
      raiz.dataset.capitulo = String(activo);
      botones.forEach(function (b, k) {
        if (k === activo) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
      });
    }

    // Cabecera oscura mientras la intro ocupa la pantalla
    if (cabecera) {
      var sobre = y < estado.total + estado.alto * 0.4;
      cabecera.classList.toggle("sobre-intro", sobre);
    }

    // Precarga: la intro está arriba de la página, así que se descarga casi de inmediato
    if (y < estado.total + estado.alto * 1.5) descargar();
  }

  // ---------- Video: acercarse al objetivo con suavizado ----------
  function actualizarVideo() {
    var v = estado.video;
    var dur = v && estado.listo ? v.duration || 1 : 0;
    // El código de tiempo avanza aunque el video aún no cargue (usa la duración declarada)
    var segundos = estado.actual * (dur || Number(raiz.dataset.duracion || 12));
    var txt = formatear(segundos);
    if (codigo && txt !== estado.ultimoCodigo) { codigo.textContent = txt; estado.ultimoCodigo = txt; }

    if (Math.abs(estado.objetivo - estado.actual) > 0.0004) estado.actual += (estado.objetivo - estado.actual) * 0.2;
    else estado.actual = estado.objetivo;
    if (!v || !estado.listo || v.seeking) return;
    var t = clamp(estado.actual, 0, 0.999) * dur;
    var eps = esMovil() ? 0.02 : 0.008;
    if (Math.abs(v.currentTime - t) > eps) {
      try { v.currentTime = t; } catch (e) { /* conserva el último cuadro pintado */ }
    }
  }

  function formatear(s) {
    var f = Math.floor((s % 1) * FPS);
    var seg = Math.floor(s) % 60, min = Math.floor(s / 60);
    var dos = function (n) { return (n < 10 ? "0" : "") + n; };
    return "00:" + dos(min) + ":" + dos(seg) + ":" + dos(f);
  }

  function tic() {
    if (estado.sucio) { estado.sucio = false; leerScroll(); }
    actualizarVideo();
    window.requestAnimationFrame(tic);
  }

  // ---------- Navegación por capítulos ----------
  botones.forEach(function (b) {
    b.addEventListener("click", function () {
      var destino = document.getElementById(b.dataset.cap);
      if (!destino) return;
      var y = destino.getBoundingClientRect().top + (window.scrollY || window.pageYOffset);
      window.scrollTo({ top: y, behavior: menosMov ? "auto" : "smooth" });
    });
  });

  // ---------- Eventos ----------
  window.addEventListener("scroll", function () { estado.sucio = true; }, { passive: true });
  window.addEventListener("resize", function () {
    if (tactil && window.innerWidth === estado.ancho) return; // la barra del navegador móvil no cuenta
    medir();
  });
  window.addEventListener("orientationchange", medir);
  window.addEventListener("load", medir);
  var alPrimerGesto = function () {
    if (estado.gesto) return;
    estado.gesto = true;
    cebar(estado.video);
  };
  window.addEventListener("pointerdown", alPrimerGesto, { once: true, passive: true });
  window.addEventListener("touchstart", alPrimerGesto, { once: true, passive: true });

  medir();
  window.requestAnimationFrame(tic);
})();
