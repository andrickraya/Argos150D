# Modelo 3D de Iñaki (`assets/models/inaki.glb`)

Modelo 3D animado de **Iñaki** (mascota lobo de la IBERO), listo para cargar con **three.js 0.160.0 (`GLTFLoader`)** en la app web AR **ARGOS**.

---

## 1. Servicios usados y licencia

| Etapa | Servicio / Herramienta | Licencia / Términos |
|---|---|---|
| **Imagen multivista → 3D** (usando `frente.jpeg`, `lado.jpeg` y `atras.png`) | **Microsoft TRELLIS** en Hugging Face Spaces (`trellis-community/TRELLIS`) | **MIT License** (open-source). Permite uso académico, personal y comercial sin restricciones ni atribución obligatoria de pago. |
| **Auto-Rigging y Animaciones** | **Adobe Mixamo** (`mixamo.com`, plan gratuito sin tarjeta) | Uso **gratuito** permitido en proyectos académicos, personales y comerciales (apps web/juegos), siempre que no se redistribuyan las animaciones como paquete/librería independiente. |
| **Conversión, ensamblaje y optimización** | `fbx2gltf` + `@gltf-transform/core` v4.5.1 (Node.js local) | Open-source (BSD / MIT). |

---

## 2. Especificaciones técnicas verificadas

Verificado con `@gltf-transform/cli inspect assets/models/inaki.glb`:

- **Archivo:** `assets/models/inaki.glb` (glTF 2.0 binario, texturas incrustadas)
- **Tamaño:** **1.95 MB** *(límite: ideal < 5 MB, máx. 10 MB)*
- **Geometría:** **8,568 triángulos** · 6,526 vértices *(límite: < 25,000 triángulos; sin decimate para preservar la cara y el logo)*
- **Meshes / Skins / Materiales:**
  - `1` mesh con esqueleto (`inaki`, skinned con **46 joints** tipo `mixamorig:*`)
  - `1` material PBR estándar (`inaki_material`: `metallicFactor = 0.0`, `roughnessFactor = 0.85`, opaco, sin reflejo metálico artificial)
- **Texturas:** `1` textura embebida **`1024×1024`** en formato **`image/png`** (`1.26 MB`)
- **Extensiones glTF:** **Ninguna** (`extensionsUsed: none`, `extensionsRequired: none`) — libre de `KHR_draco_mesh_compression`, `EXT_meshopt_compression`, `KHR_texture_basisu` y `EXT_texture_webp`.
- **Escala y orientación:**
  - **Altura total:** **1.65 m** (`Y: 0.000 → 1.650 m`)
  - **Ancho:** `1.36 m` (`X: -0.680 → +0.680 m`, centrado en `X = 0`)
  - **Profundidad:** `Z: -0.650 → +0.240 m` (hocico orientado hacia **`+Z`**, cola hacia **`-Z`**)
  - **Origen `(0, 0, 0)`:** al nivel de los **pies**, centrado, **`+Y` arriba**.
  - **Escala de nodo raíz:** `[1, 1, 1]` (escala horneada directamente en vértices, esqueleto e `inverseBindMatrices`; error de identidad en bind pose `1.54e-7`).

---

## 3. Animaciones incluidas (7/7)

Todas con los nombres exactos en minúsculas y sin acentos:

| Nombre en GLB | Duración | Tipo | Origen / Notas |
|---|---:|---|---|
| `idle` *(obligatoria)* | **3.00 s** | Bucle (0.04° cierre) | Respiración natural sintetizada a partir de la pose neutra de pie de Mixamo (pecho, hombros, cabeza y balanceo sutil). |
| `saludar` *(obligatoria)* | **1.80 s** | Gesto / Bucle | Mixamo `Waving` (3 ciclos suavizados con cierre continuo, brazo derecho). |
| `senalar` *(obligatoria)* | **2.75 s** | Gesto | Mixamo `Pointing` (señala con el brazo derecho). |
| `presentar` | **3.38 s** | Gesto | Mixamo `Arm Gesture` (gesto amplio mostrando/presentando). |
| `celebrar` | **3.50 s** | Gesto | Mixamo `Golf Putt Victory` (recortado al tramo de festejo `4.5–8.0 s`, recentrado en `(0, 0)` y alineado a `+Z`). |
| `pensar` | **3.00 s** | Gesto | Mixamo `Thankful` (mano derecha hacia el pecho/barbilla con inclinación pensativa de cabeza). |
| `caminar` | **1.04 s** | Bucle en el lugar | Mixamo `Walking` (desplazamiento lineal XZ eliminado por script para caminar estrictamente `In Place`, con cierre de bucle a 0.04°). |

---

## 4. Problemas conocidos y notas para integración (three.js 0.160.0)

1. **`pensar` usa el clip `Thankful` de Mixamo:** el gesto lleva la mano derecha hacia el pecho/barbilla y asiente; si más adelante quieren una pose estricta de "dedo en la barbilla", basta reemplazar `Thankful.fbx` y volver a empaquetar.
2. **`celebrar` no es de bucle:** está pensada para reproducirse una sola vez (`THREE.LoopOnce`) y volver con `crossFadeTo(idle, 0.3)` al terminar. En `celebrar` las caderas bajan ligeramente (`Y ≈ 0.61–0.73 m`) por la flexión de rodillas del festejo.
3. **Cola sin huesos dedicados:** Mixamo usa esqueleto humanoide, por lo que la cola está pesada a la zona de la cadera/piernas inferiores y se mueve acompañando el torso; no tiene animación independiente.
4. **Huesos de dedos:** el auto-rig se exportó con la plantilla completa de Mixamo (46 joints incluyendo dedos); funciona sin problema con `GLTFLoader` + `AnimationMixer` en móvil.
5. **Iluminación recomendada en three.js:** el material es `MeshStandardMaterial` mate (`roughness: 0.85, metalness: 0.0`). Con una `HemisphereLight` + `DirectionalLight` (o `AmbientLight` suave) los colores rojos de la playera IBERO y el pelaje gris/blanco se ven nítidos.
6. **Archivos auxiliares en `assets/models/`:** se conservaron `iñaki_base.glb` y `mixamo_anims/` como respaldo editable local; para producción/deploy solo se necesita `assets/models/inaki.glb` (y esta documentación).
