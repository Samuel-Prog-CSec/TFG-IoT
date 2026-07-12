# Impresión de cartas de un mazo a PDF

Generación server-side de un PDF imprimible con las imágenes de un mazo, para que
el profesor las recorte y las pegue en sus tarjetas físicas (RFID). Decisión de
arquitectura: **ADR-234**.

## Por qué en el servidor

- **`.pdf` real descargable** y **server-authoritative**: las URLs de imagen ya
  están snapshotteadas por carta en `cardMappings[].displayData` (reconstruidas
  server-side, ADR-012), así que el PDF nunca depende de datos del cliente.
- **Sin problemas de CORS**: el backend descarga las imágenes de su URL pública de
  Supabase; el navegador no toca canvas ni bytes de imagen.
- **Reutiliza `sharp`**: las imágenes se almacenan en **WebP**, que `pdf-lib` **no**
  embebe. `sharp` convierte WebP → JPEG antes de incrustarlas.
- **Testeable** de punta a punta en Jest (la descarga de red se aísla y se mockea).

Dependencia nueva: `pdf-lib` (JS puro, sin binarios nativos, MIT).

## Endpoint

```
POST /api/decks/:id/print
```

- **Auth**: `authenticate` + `requireRole('teacher')` + `ensureResourceOwnership`.
- **Rate limit**: `createResourceRateLimiter` (la composición con `sharp` es
  CPU-intensiva; la acción es puntual).
- **Validación** (`printDeckSchema`, Zod): body en milímetros.

| Campo | Tipo | Rango / valores | Defecto |
|---|---|---|---|
| `cardWidthMm` | number | `20`–`190` | `55` |
| `cardHeightMm` | number | `20`–`277` | `85` |
| `cardUids` | string[] | UIDs (8/14 hex) del mazo | todas |
| `showLabel` | boolean | | `false` |
| `cropMarks` | boolean | | `true` |
| `orientation` | enum | `auto` \| `portrait` \| `landscape` | `auto` |

Los máximos garantizan que quepa al menos una tarjeta en un A4 vertical (ancho
útil 190 mm, alto útil 277 mm = A4 menos 10 mm de margen por lado). Constantes
compartidas con el validador en `src/constants/print.js`; el frontend mantiene un
espejo en `frontend/src/lib/printLayout.js`.

### Respuesta

- **200**: cuerpo binario `application/pdf` con
  `Content-Disposition: attachment; filename="<slug>-cartas.pdf"` (se salta
  `sendSuccess`, mismo patrón que el export RGPD `exportStudentData`).
- **422**: el mazo (o la selección) no tiene ninguna carta con imagen.
- **400**: tamaños fuera de rango (Zod). **403/404/401**: ownership / inexistente / sin auth.

Solo se imprimen cartas con imagen: el controlador filtra `displayData.imageUrl`
no nulo (las cartas solo-audio se excluyen).

## Algoritmo de maquetación (`deckPrintService`)

Funciones puras (testeables), en `src/services/deckPrintService.js`:

- **`computeGridLayout({ cardWidthMm, cardHeightMm, orientation, gapMm=4, marginMm=10 })`**
  Para cada orientación: `cols = floor((usableW + gap) / (cardW + gap))`, `rows`
  análogo, `perPage = cols·rows`. Con `orientation: 'auto'` evalúa vertical
  (210×297) y horizontal (297×210) y elige la de mayor `perPage` (empate →
  vertical), **aprovechando el papel**.
- **`fitInside(imgW, imgH, boxW, boxH)`** Escala por `min(boxW/imgW, boxH/imgH)`:
  la imagen cabe dentro del rectángulo **preservando el aspecto** (letterbox),
  **nunca se deforma**. Se centra en su celda.
- **`computeCellRects(layout)`** Rectángulos (mm, origen arriba-izquierda) de la
  rejilla **centrada** en la página.

El tamaño de tarjeta es una **cota máxima**, no un tamaño fijo: una imagen más
pequeña que la celda no se estira. Conversión mm → puntos PDF: `mm · 72 / 25,4`.

## Pipeline de imagen y resiliencia

Por cada carta imprimible:

1. `fetchImageBuffer(url)` — descarga los bytes (WebP) de Supabase. **Aislado como
   método** para mockearlo en los tests (sin red).
2. `prepareImage(buffer)` — `sharp(...).rotate().flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })`:
   respeta la orientación EXIF, aplana la transparencia sobre blanco (se imprime en
   papel) y devuelve el JPEG **y sus dimensiones reales** (para `fitInside`).
3. `pdfDoc.embedJpg(...)` + `page.drawImage(...)` centrado en la celda; guía de
   corte tenue (borde de celda) si `cropMarks`; etiqueta con el valor si `showLabel`.

**Resiliencia**: si una descarga falla, se dibuja un placeholder con el
`dominantColor` de la carta y el PDF **no** se aborta. La descarga+conversión se
hace con **concurrencia limitada a 4** para acotar el pico de RAM/CPU en el VPS
(`scale=1`); un mazo tiene como máximo 20 cartas.

## Tests

- `tests/deckPrintService.test.js` — geometría pura (layout/fit/rects) + pipeline
  completo con `fetchImageBuffer` mockeado y un PNG real de fixture; afirma que el
  buffer empieza por `%PDF` y el conteo de páginas cargando el PDF con `pdf-lib`.
- `tests/deckPrint.test.js` — integración (supertest): 200 `application/pdf` +
  `attachment`, page count por selección/tamaño, 422 sin imágenes, 400 guards,
  403/404/401.

Los tests corren contra el Mongo de Docker (host `27018`), no el Mongo local.

## Ficheros

| Propósito | Ruta |
|---|---|
| Constantes geométricas (validador ↔ servicio) | `src/constants/print.js` |
| Layout + pipeline + composición PDF | `src/services/deckPrintService.js` |
| Validador `printDeckSchema` | `src/validators/cardDeckValidator.js` |
| Controlador `printDeck` | `src/controllers/cardDeckController.js` |
| Ruta | `src/routes/decks.js` |
| Espejo de geometría (cliente, previsualización) | `frontend/src/lib/printLayout.js` |
