---
layout: default
title: Inicio
nav_order: 1
---

# C4-XR: Consciencia Situacional Inmersiva

Un proyecto integrador de **Ciencia de Datos** y **Realidad Mixta (Unity 3D / XR)** para transformar la respuesta táctica de la Guardia Nacional.

<!-- Contenedor del Video -->
<video width="100%" controls style="border-radius: 18px; box-shadow: 0 4px 24px rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05); margin: 20px 0 40px 0; background-color: #000;">
  <source src="assets/video/Practica1.mp4" type="video/mp4">
  Tu navegador no soporta la reproducción de video.
</video>

<div class="card-minimal">
  <h2 class="text-blue-apple">Visión del Proyecto</h2>
  <p>Al ocurrir un incidente crítico en la autopista <b>México - Puebla</b>, el sistema analiza en tiempo real datos provenientes de la infraestructura del C4 Carretero (cámaras de monitoreo, sensores de flujo y arcos lectores de placas)[cite: 1].</p>
  <p>A través de un visor XR, el patrullero recibe instrucciones dinámicas directamente en su campo de visión: rutas óptimas de llegada, alertas de tráfico en tiempo real y guiado direccional mediante flechas holográficas proyectadas en el asfalto.</p>
</div>

<div class="card-minimal">
  <h2 class="text-blue-apple">Arquitectura Tecnológica</h2>
  <ul>
    <li><strong>Backend (Ciencia de Datos):</strong> Procesamiento de alertas en tiempo real y modelos predictivos de tráfico utilizando algoritmos de optimización de rutas (como Dijkstra ponderado) integrados vía FastAPI[cite: 1, 2].</li>
    <li><strong>Frontend (Unity 3D XR):</strong> Interfaz táctica (HUD) que proyecta recuadros de detección sobre vehículos de interés, alertas de distancia ("Giro en 100 m") y velocímetros dinámicos para una intercepción segura[cite: 1, 2].</li>
  </ul>
</div>

---
*Materia: Tecnologías Emergentes | Análisis de Datos + Motores 3D*