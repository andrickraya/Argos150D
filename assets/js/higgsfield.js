// Piezas visuales hechas con Higgsfield: portada con paralaje suave,
// película de la ruta real (se reproduce al verse y marca la parada actual)
// y la maqueta girando (se pausa fuera de pantalla).
(function () {
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reproduce un video solo mientras está en pantalla
  function alVerse(video, alEntrar) {
    if (!("IntersectionObserver" in window)) { video.play().catch(() => {}); return; }
    new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) { if (!quieto) video.play().catch(() => {}); if (alEntrar) alEntrar(); }
        else video.pause();
      });
    }, { threshold: 0.35 }).observe(video);
  }

  // Portada: la foto aérea se desplaza más lento que la página
  const portada = document.querySelector("[data-portada]");
  const img = portada && portada.querySelector(".portada__img");
  if (img && !quieto) {
    let pendiente = false;
    const mover = () => {
      pendiente = false;
      const r = portada.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const t = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1..1 aprox.
      img.style.transform = `translate3d(0, ${(t * -5).toFixed(2)}%, 0) scale(1.04)`;
    };
    addEventListener("scroll", () => { if (!pendiente) { pendiente = true; requestAnimationFrame(mover); } }, { passive: true });
    mover();
  }

  // Ruta real: barra de avance y parada activa según el tiempo del video
  const ruta = document.querySelector("[data-ruta]");
  if (ruta) {
    const video = ruta.querySelector("[data-ruta-video]");
    const barra = ruta.querySelector("[data-ruta-barra]");
    const paradas = [...ruta.querySelectorAll("[data-desde]")];
    const marcar = () => {
      const t = video.currentTime, d = video.duration || 15;
      if (barra) barra.style.width = `${(t / d) * 100}%`;
      let actual = 0;
      paradas.forEach((p, i) => { if (t >= parseFloat(p.dataset.desde)) actual = i; });
      paradas.forEach((p, i) => p.classList.toggle("activa", i === actual));
    };
    video.addEventListener("timeupdate", marcar);
    // Tocar una parada salta a ese tramo
    paradas.forEach((p) => {
      p.style.cursor = "pointer";
      p.tabIndex = 0;
      const ir = () => { video.currentTime = parseFloat(p.dataset.desde) + 0.05; video.play().catch(() => {}); marcar(); };
      p.addEventListener("click", ir);
      p.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } });
    });
    if (quieto) video.controls = true;
    alVerse(video);
    marcar();
  }

  // Maqueta girando
  document.querySelectorAll(".diorama video").forEach((v) => {
    if (quieto) { v.removeAttribute("autoplay"); v.pause(); v.controls = true; }
    alVerse(v);
  });
})();
