# Película de la Ibero con Higgsfield (gratis desde Claude chat)

Las generaciones ilimitadas de tu prueba **no funcionan desde Claude Code** (la terminal).
Solo funcionan en **claude.ai (Claude chat)**, en Claude Cowork y en ChatGPT, con Higgsfield conectado.
La prueba termina el **jueves 13 de noviembre de 2026 a las 13:29 (hora CDMX)**.

## Paso A: Storyboard (una imagen)
1. Abre https://claude.ai y empieza un chat nuevo. Revisa que Higgsfield esté conectado: ícono de herramientas / conectores.
2. Adjunta estas imágenes:
   - `C:\Users\Andri\Documents\ARGOS\ibero-dibujo-inicio.jpg` (el dibujo, primer cuadro)
   - Tus fotos reales de la Ibero (andador de ladrillo, Puerta 3, Biblioteca, Salón C), si ya las tienes.
3. Pega este mensaje:

> Usa Higgsfield con mis generaciones ilimitadas (use_unlim: true). Genera UNA imagen con nano_banana_pro, resolución 2k, formato 16:9, usando las imágenes adjuntas como image_references. Prompt:
> "A cinematic storyboard sheet: a 3x2 grid of six 16:9 keyframes showing ONE continuous camera move, NOT six different scenes. Frame 1: exactly the first reference image, a hand-drawn ink-and-watercolor top-down map of a Mexican university campus with terracotta red-brick diagonal buildings, a round library, trees and lawns. Frame 2: the camera descends and the drawing comes alive, watercolor turning into a photoreal aerial view of the same layout. Frame 3: photoreal drone shot lower over the red-brick buildings and tree canopies, golden late-afternoon light. Frame 4: low flight along a wide red-brick pedestrian walkway lined with tall trees, like the reference photos. Frame 5: gliding forward at eye level down the brick corridor toward a building entrance. Frame 6: final calm wide shot in front of a red-brick academic building. Consistent palette, lens and exposure. Thin dark gutters. Absolutely no text, numbers, labels, logos or watermarks."

## Paso B: Película (15 segundos)
Cuando el storyboard te guste, en el mismo chat pega:

> Ahora genera un video con seedance_2_5, usando mis generaciones ilimitadas (use_unlim: true): mode omni_reference, duration 15, resolution 1080p, aspect_ratio 16:9, generate_audio false. Medias: el dibujo como start_image; el storyboard y mis fotos como image_references. Prompt:
> "One single continuous camera take, no cuts. It starts exactly on the hand-drawn watercolor top-down campus map, then the camera slowly descends while the drawing comes alive into a photoreal Mexican university campus of terracotta red brick, flies low over the tree canopies, and glides forward along the wide red-brick pedestrian walkway between tall trees toward a brick building entrance, ending in a calm wide shot. Slow, steady, constant speed, gentle ease only at start and end. No camera shake, locked exposure and white balance, no flicker, minimal motion blur. Golden late-afternoon light. No text, no logos, no people close to camera."

Si te dice que la configuración no entra en lo ilimitado, prueba con `resolution 720p` o con `duration 10`.

## Paso 3D (gratis): imágenes y video con aspecto 3D para el sitio
Ojo: Higgsfield **no** incluye los modelos 3D de verdad (archivos .glb) en lo ilimitado, ni siquiera en claude.ai.
Cada .glb cuesta créditos: tripo_3d = 5 y te quedan 10, o sea 2 como máximo. El modelo 3D del campus ya lo hice yo con three.js, gratis.
Lo que **sí** sale gratis son imágenes y videos que se ven 3D. Hazlos en el mismo chat de claude.ai.

**Antes del primer prompt, pega esta regla en el chat** (cuida tus 10 créditos):
> Regla para toda esta conversación: usa SOLO mis generaciones ilimitadas. Si una configuración no entra en lo ilimitado, NO gastes créditos: baja a resolución 1k, quality medium o video 720p, y si aun así no entra, avísame sin generar.

**3D-1. Diorama del campus.** Adjunta `ibero-dibujo-inicio.jpg` y tus fotos de `C:\Users\Andri\Documents\ARGOS\fotos_ibero\` (explanada, lobos, puerta3, salonC). Pega:
> Usa Higgsfield con mis generaciones ilimitadas (use_unlim: true). Genera UNA imagen con nano_banana_pro, resolución 2k, formato 16:9, con las imágenes adjuntas como image_references. Prompt:
> "Isometric 3D diorama of a Mexican university campus on a floating square base, soft clay render, terracotta red-brick buildings with flat roofs, a round library, tall trees, brick walkways and lawns, matching the layout of the first reference map and the materials of the reference photos. A glowing blue path with small chevron arrows runs from the west gate to a long brick building. Warm cream background, soft studio lighting, gentle shadows, tilt-shift. Absolutely no text, no logos, no watermarks."

**3D-2. Video girando el diorama.** Cuando te guste el diorama:
> Ahora genera un video con seedance_2_5 (use_unlim: true): mode omni_reference, duration 10, resolution 1080p, aspect_ratio 16:9, generate_audio false. El diorama como start_image. Prompt:
> "Slow 360-degree turntable orbit around the same isometric clay campus diorama, one continuous take, constant speed, locked exposure, no cuts, no shake, the blue arrows gently pulse along the path. Cream background. No text."

**3D-3. Objetos 3D sueltos con fondo transparente (para las tarjetas del sitio).** Un mensaje por imagen:
> Genera UNA imagen con gpt_image_2_6 (use_unlim: true), quality high, resolution 2k, background transparent, aspect_ratio 1:1. Prompt: "<OBJETO>, 3D clay render, soft studio light, centered, isolated, no text, no logo."

Cambia `<OBJETO>` por cada uno de estos:
- `a white mixed-reality headset with a dark front visor, three-quarter view`
- `three glossy blue chevron navigation arrows floating in a row`
- `a printed QR code sign on a small terracotta brick stand`
- `a smartphone showing a blue arrow over a camera view of a brick walkway`

**Dónde guardarlos:** crea la carpeta `C:\Users\Andri\Documents\ARGOS\higgsfield_3d\` y nombra los archivos `diorama.png`, `diorama_giro.mp4`, `visor.png`, `flechas.png`, `qr.png` y `celular.png`. Luego escríbeme: **"ya están los 3D"**.

## Paso C: Pásamelo
1. Descarga el video (.mp4).
2. Guárdalo en `C:\Users\Andri\Documents\ARGOS\` con el nombre `pelicula_ibero.mp4`.
3. Escríbeme en Claude Code: **"ya está la película"**. Yo lo codifico y lo pongo en tu sitio.
