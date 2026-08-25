---
layout: default
title: Inicio
nav_order: 1
---

<div class="hero">
  <span class="hero__eyebrow">C4-XR · Proyecto integrador — Ciencia de Datos + XR</span>

  <!-- Aquí fuera de los div sí podemos usar Markdown -->
  # De la sala de control al parabrisas, en tiempo real

  <p class="hero__subtitle">
    Ciencia de Datos y Realidad Mixta para llevar las alertas del C4 Carretero
    directo al campo de visión de un patrullero en movimiento, en el corredor
    federal México&nbsp;–&nbsp;Puebla (150D).
  </p>

  <div class="hero__actions">
    <a href="#vision" class="btn-cta btn-primary">Ver cómo funciona</a>
    <!-- TODO: cambia "#" por la URL real de tu repositorio en GitHub -->
    <a href="#" class="btn-cta btn-secondary">Ver repositorio</a>
  </div>

  <video class="hero-video" controls preload="metadata">
    <source src="{{ '/assets/video/Practica1.mp4' | relative_url }}" type="video/mp4">
    Tu navegador no soporta la reproducción de video.
  </video>
</div>

<div class="card-minimal reveal" id="vision">
  <h2>Visión del proyecto</h2>
  <p>Cuando ocurre un incidente crítico en la autopista México–Puebla —bloqueo, robo, persecución—, el sistema analiza en tiempo real datos simulados de la infraestructura del C4 Carretero: cámaras de monitoreo, sensores de flujo y arcos lectores de placas.</p>
  <p>A través de un visor XR, el patrullero recibe instrucciones dinámicas directamente en su campo de visión: rutas óptimas de llegada, alertas de tráfico en tiempo real y guiado direccional mediante flechas holográficas ancladas al mundo real.</p>
</div>

<div class="card-minimal reveal">
  <h2>Por qué es distinto</h2>
  <p>No es un escenario inventado: el corredor 150D y una infraestructura de videovigilancia y arcos ANPR muy similar ya están en operación. Lo que no existe todavía es la capa que conecta ese monitoreo centralizado con quien va manejando hacia el incidente — ese es exactamente el hueco que este proyecto llena con XR.</p>
  <p>Es, además, un sistema explícitamente de <strong>apoyo a la navegación y a la decisión</strong>: calcula rutas, detecta anomalías y estima tiempos, pero no automatiza el uso de la fuerza ni decide nada por el usuario.</p>
</div>

<div class="reveal" id="arquitectura">
  <h2>Módulos del sistema</h2>
  <div class="module-grid">
    <div class="module-card">
      <span class="module-card__label">Backend · Ruteo</span>
      <h3>Motor de ruteo dinámico</h3>
      <p>Dijkstra como línea base y A* con heurística Haversine sobre un grafo cuyos pesos se recalculan con cada lectura nueva de tráfico o incidente.</p>
    </div>
    <div class="module-card">
      <span class="module-card__label">Backend · ML</span>
      <h3>Detección de anomalías</h3>
      <p>Umbral estadístico (z-score / EWMA) como primer nivel, e Isolation Forest sobre variables tabulares para detectar patrones atípicos de tráfico.</p>
    </div>
    <div class="module-card">
      <span class="module-card__label">Backend · ML</span>
      <h3>Predicción de ETA</h3>
      <p>Gradient Boosting sobre features de tramo, hora, clima simulado y nivel de congestión para estimar el tiempo de llegada a la intercepción.</p>
    </div>
    <div class="module-card">
      <span class="module-card__label">Frontend · Unity XR</span>
      <h3>HUD holográfico</h3>
      <p>XR Origin + Canvas en World Space: flecha 3D de dirección, ETA en TextMeshPro y alertas ancladas al campo de visión del patrullero.</p>
    </div>
  </div>
</div>

<div class="card-minimal reveal">
  <h2>Estado del proyecto</h2>
  <p>Actualmente en la fase de estructuración teórica y primera entrega: arquitectura de datos definida, dataset sintético en diseño sobre la topología real del corredor (vía OSMnx), y el entorno base de Unity en construcción — escenario de carretera, configuración de XR Origin y placeholders de datos.</p>
</div>

<div class="cta-band reveal">
  <h2>¿Quieres saber más?</h2>
  <p class="hero__subtitle" style="margin-bottom: 1.5rem;">
    El detalle técnico completo —arquitectura, dataset y roadmap— está en las siguientes secciones.
  </p>
  <div class="hero__actions">
    <!-- TODO: cambia "#" por tu correo, LinkedIn o el link que prefieras -->
    <a href="#" class="btn-cta btn-primary">Contactar</a>
    <a href="#" class="btn-cta btn-secondary">Ver repositorio</a>
  </div>
</div>