# Arquitectura y Estrategia de Contextos & Assets

## Descripción General

El sistema de **Contextos y Assets** es la base para proveer el contenido temático (educativo, visual, y auditivo) a todos los mazos y sesiones de juego. Un _Contexto_ agrupa un conjunto de _Assets_ (ej. "Inglés - Opuestos").

Esta estrategia rige cómo se gestionan y muestran estos recursos dentro del frontend, integrándose transparentemente con **Supabase Storage** para la persistencia de medios (imágenes/audios).

---

## Arquitectura del Servicio de Assets

---

## Patrones de Nombrado y Creación

Para mantener la consistencia en el ecosistema, se deben seguir las siguientes convenciones al crear Contextos y Assets:

### 1. Nomenclatura de Contextos

Los Contextos agrupan temáticas completas. Sus nombres deben ser descriptivos y legibles:

- **Formato recomendado:** `Title Case` o `Sentence case`.
- **Ejemplos correctos:** "Animales del Bosque", "Verbos en Inglés", "Geografía Europa".
- **Antipatrones:** "test1", "contexto_animales", "cosas_varias".

### 2. Nomenclatura de Assets

Dentro de un contexto, cada Asset es una entidad identificable.

- **Campo `key`:**
  - **Uso:** Identificador único interno para la validación y el motor del juego.
  - **Formato:** `kebab-case` o `snake_case`, siempre en **minúsculas** y sin caracteres especiales o espacios.
  - **Ejemplos:** `perro`, `gato-salvaje`, `verbo_correr`.
- **Campo `value`:**
  - **Uso:** La palabra visible para educadores y (dependiendo de la mecánica) para alumnos.
  - **Formato:** `Title Case` o capitalizado correctamente.
  - **Ejemplos:** "Perro", "Gato Salvaje", "Correr".
- **Campo `display`:**
  - **Uso:** Previsualización textual rápida. Si es una palabra muy larga, se recomienda un solo **Emoji** que represente fielmente el Asset (ej. 🐶, 🏃‍♂️).

### 3. Patrones de Creación de Contenido Multimedia

- **Imágenes:** Se deben evitar imágenes con mucho texto o resoluciones masivas. El backend procesará las subidas a `.webp` (optimizadas) y generará miniaturas (`thumbnailUrl`) centradas (object-cover cuadrado) para que se vean bien dentro de las tarjetas del juego.
- **Audios:** Deben ser claros, cortos (idealmente < 5 segundos) y grabados sin ruido de fondo, permitiendo a los alumnos escuchar la instrucción de forma repetida sin demoras.

---

### Diagrama de Relación de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                          Frontend                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐   │
│  │ ContextsPage │   │ ContextDetail│   │ DeckCreation/   │   │
│  │   (Listado)  │   │    (CRUD)    │   │ Edit (Wizards)  │   │
│  └──────┬───────┘   └──────┬───────┘   └───────┬─────────┘   │
│         │                  │                   │             │
│  ┌──────┴──────────────────┴───────────────────┴─────────┐   │
│  │                    UI Components                      │   │
│  │  - AssetSelector (Componente base para asignar)         │   │
│  │  - UploadAssetModal (Formulario multipart)            │   │
│  │  - AssetCard (Visualización visual/audio)             │   │
│  └───────────────────────┬───────────────────────────────┘   │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐   │
│  │                    API Strategy                       │   │
│  │  - contextsAPI.getContexts()                          │   │
│  │  - contextsAPI.uploadImage (multipart/form-data)      │   │
│  │  - contextsAPI.uploadAudio (multipart/form-data)      │   │
│  └───────────────────────────────────────────────────────┘   │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP
┌───────────────────────────┴──────────────────────────────────┐
│                           Backend                            │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│ │  Controllers   ├──►  Middlewares  ├──► Services (Upload) │ │
│ │ (asset & ctx)  │  │(Multer Memory)│  │ (Image / Audio)   │ │
│ └───────┬────────┘  └───────────────┘  └─────────┬─────────┘ │
│         │                                        │           │
│ ┌───────┴────────┐                     ┌─────────┴─────────┐ │
│ │    MongoDB     │                     │     Supabase      │ │
│ │(URLs y Textos) │                     │ (Image y Audio)   │ │
│ └────────────────┘                     └───────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Estrategia de Mapeo y Consulta (Lookup Logic)

Dado que las tarjetas de juego (RFID) no tienen valor por sí mismas, su significado depende completamente de los Contextos.

### Lógica de Lookup (Profesor)

1. El usuario navega a "Contextos" -> Llama a `useContexts({ autoLoad: true })`.
2. Para crear un mazo, se elige un Contexto pre-cargado.
3. El frontend pasa el array de `context.assets` al componente `AssetSelector`.
4. El profesor vincula un un asset (ej. `dog`) al `uid` de una tarjeta RFID.
5. El sistema guarda _solo_ una copia instantánea del asset dentro de la colección `CardDeck` en MongoDB para ese profesor, garantizando inmutabilidad.

---

## Estrategia de Subida de Medios (Upload Logic)

### Validaciones en el Cliente

Antes de procesar la subida, el **UploadAssetModal** realiza validaciones locales para mejorar la UX:

- **Tipos Permitidos de Imagen:** `image/*` (Se recomienda PNG/JPG/WEBP).
- **Tipos Permitidos de Audio:** `audio/*` (Se recomienda MP3/OGG).
- **Campos Requeridos:** `key` (el identificador interno único) y `value` (palabra visible).

### Live Preview y UX Optimista

1. Al seleccionar un archivo de imagen, se genera una URL temporal local ( `URL.createObjectURL` ) que brinda _feedback inmediato_ (Live Preview) al usuario antes de oprimir "Subir".
2. Una vez enviada la petición `multipart/form-data`, el frontend no inserta el asset manualmente. Se espera la respuesta de confirmación de Supabase a través del backend.
3. Finalizada la petición y confirmada por el Toast, se hace refetch local (`fetchContext()`) de los datos de MongoDB para que aparezca la miniatura oficial.

---

## UI Components y Visualización

### 1. `AssetSelector` y las Miniaturas

- Se prioriza fuertemente la lectura visual. Si el campo `thumbnailUrl` (o subsidiario `imageUrl`) existe, la interfaz omitirá los iconos genéricos 📎 y renderizará la imagen miniatura (`object-cover`).
- Si el asset es auditivo, se le añade un indicador con ícono superpuesto alertando que hay un sonido vinculado.

### 2. Controles de Reproducción Nativos

- Los audios no utilizan librerías complejas, se basan en `<audio>` nativo referenciado por React Hooks (`useRef`). Esto simplifica drásticamente la gestión del estado "Playing" evitando fugas de memoria y permitiendo múltiples tarjetas contiguas.

### 3. Unified Surface Layering

- Los modales utilizan un `backdrop-blur` de 60% opacidad negra para capturar el foco.
- Los Assets tienen "Surface Glows" sutiles tras la selección, y "Pulso Anaranjado" (`Amber`) simulando un estado inactivo si ese asset ya fue asignado a otra carta para evitar repeticiones.

## Glosario de Datos del Asset

```json
{
  "key": "cat", // Identificador único (Validación: letras minúsculas)
  "value": "Gatito", // Texto visible (Title Case recomendado)
  "display": "🐈", // Preview textual o emoji rápido
  "audioUrl": "https://[supabase]/bucket/assets/...mp3",
  "imageUrl": "https://[supabase]/bucket/assets/...webp",
  "thumbnailUrl": "https://[supabase]/bucket/assets/..._thumb.webp"
}
```

_`imageUrl` original y optimizada en 1920px. `thumbnailUrl` en 256px de calidad comprimida._
