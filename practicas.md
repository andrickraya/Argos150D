---
layout: default
title: Prácticas
nav_order: 2
---

<div class="practicas">

<style>
.practicas .practicas-intro {
  max-width: 640px;
  margin-bottom: 3rem;
}

.practicas .practice-block {
  padding: 2.5rem 0;
  border-top: 1px solid #e5e5ea;
}

.practicas .practicas-intro + .practice-block {
  border-top: none;
  padding-top: 0;
}

.practicas .practice-block__label {
  display: inline-block;
  font-size: 0.85rem;
  color: #0066cc;
  margin-bottom: 0.5rem;
}

.practicas .practice-block video {
  width: 100%;
  border-radius: 12px;
  margin: 1.5rem 0;
  display: block;
}

.practicas .practice-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-top: 1.5rem;
}

.practicas .practice-col__label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #6e6e73;
  margin: 0 0 0.4rem;
}

.practicas .practice-col p {
  margin: 0;
}

@media (max-width: 640px) {
  .practicas .practice-columns {
    grid-template-columns: 1fr;
    gap: 1.25rem;
  }
}
</style>

<div class="practicas-intro reveal">
  <h1>Del Animator a la primera línea de código</h1>
  <p class="hero__subtitle">Dos prácticas del curso, hechas antes de tocar el corredor 150D: la primera resuelve movimiento sin programar nada; la segunda ya combina física, C# y una interfaz de usuario.</p>
</div>

<div class="practice-block reveal">
  <span class="practice-block__label">Práctica · Sin programación</span>
  <h2>Rueda de la fortuna animada</h2>
  <video class="hero-video" controls preload="metadata">
    <source src="{{ '/assets/videos/practica-rueda.webm' | relative_url }}" type="video/webm">
    Tu navegador no soporta la reproducción de video.
  </video>
  <div class="practice-columns">
    <div class="practice-col">
      <p class="practice-col__label">Qué hice</p>
      <p>Animé una rueda de la fortuna con giro continuo usando solo las herramientas de animación de Unity —Animation Window y Animator— sin escribir código.</p>
    </div>
    <div class="practice-col">
      <p class="practice-col__label">Qué aprendí</p>
      <p>Que Unity resuelve movimientos cíclicos completos con keyframes y curvas de animación. El movimiento no siempre necesita vivir en un script.</p>
    </div>
  </div>
</div>

<div class="practice-block reveal">
  <span class="practice-block__label">Prácticas 3 y 4 · Con programación</span>
  <h2>Cañón autónomo + interfaz de control</h2>
  <video class="hero-video" controls preload="metadata">
    <source src="{{ '/assets/videos/practica-canon.webm' | relative_url }}" type="video/webm">
    Tu navegador no soporta la reproducción de video.
  </video>
  <div class="practice-columns">
    <div class="practice-col">
      <p class="practice-col__label">Qué hice</p>
      <p>Programé en C# un cañón que dispara balas físicas: una esfera con Rigidbody que se autodestruye a los 3 segundos, y un script ControlCañon que la instancia y le aplica fuerza. Después agregué un Canvas con contador de munición en TextMeshPro y un botón "¡FUEGO!" conectado a la función Disparar().</p>
    </div>
    <div class="practice-col">
      <p class="practice-col__label">Qué aprendí</p>
      <p>A conectar la escena (el cañón, la física) con la interfaz de usuario (el Canvas), arrastrando referencias en el Inspector y usando eventos como OnClick(), sin acoplar el código de uno con el otro.</p>
    </div>
  </div>
</div>

</div>
