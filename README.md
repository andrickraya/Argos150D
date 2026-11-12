# Argos150D
ARGOS150D

## App web AR (`app/`) — estado de las rutas (2026-11-12)

Alcance acordado con el profesor: los **lugares** (edificios y restaurantes) deben quedar bien ubicados, y solo
se pulen en campo **tres rutas**. Las demás quedan trazadas pero pendientes de verificar.

| Ruta | Distancia | Estado |
|---|---|---|
| Puerta 3 (N01) → Salón C (N07) | 247 m | Recorrida a pie; falta centrar unos puntos junto a la Escultura de Lobos y la Explanada |
| Salón C (N07) → Cafetería El Cubo (N10) | 50 m | Recorrida a pie |
| Salón C (N07) → Camellia (N64) | 23 m | Trazada; falta recorrerla con la app |
| Todas las demás | — | Pendientes: trazadas en el editor sobre foto satelital, sin verificar en campo |

Cómo continuar una ruta pendiente:

1. **Trazar o corregir el camino** en `app/editor.html` (foto satelital), descargar `argos_mapa.json` y aplicarlo con
   `node tools/aplicar_mapa.js argos_mapa.json` y `node tools/build_app.js`.
2. **Recorrerla a pie** con la app. Donde las flechas queden cargadas a un lado del andador: menú →
   **↔️ Ajustar camino aquí**, mover el punto amarillo de 0.5 m en 0.5 m y tocar **✔ Listo**.
3. **Mandar los ajustes**: menú → **📍 Poner pines con GPS** → **📤 Enviar resultados** (CSV). Se aplican con
   `node tools/aplicar_pines.js pines.csv` y `node tools/build_app.js`.

Al tocar **▶️ Caminar** el GPS se enciende solo: corrige el avance y, si la persona toma otro camino o un atajo
(más de 12 m fuera de la ruta durante 3 lecturas), recalcula la ruta desde donde está. Ajustes por URL:
`?desvio=15` (metros de tolerancia) y `?gps=0` (sin GPS automático).

Pruebas (necesitan `puppeteer-core` y Edge): `node tools/prueba_ubicacion.js app`, `prueba_rumbo.js`, `prueba_qr.js`,
`prueba_lugares.js`, `prueba_editor.js app tools/aplicar_mapa.js`, `prueba_inaki.js app tools/inaki_server.js`.
