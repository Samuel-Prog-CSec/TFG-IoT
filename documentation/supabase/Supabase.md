# 🏗️ Arquitectura del Flujo de Subida
El Frontend nunca hablará directamente con Supabase (por seguridad y control). Todo pasará por tu API.
1. **Frontend:** Envía un `FormData` (archivo + datos) al Backend (`POST /api/assets`).
2. **Backend (Multer):** Intercepta el archivo y lo guarda temporalmente en la memoria RAM.
3. **Backend (StorageService):** Toma ese archivo de la RAM y lo sube a Supabase Storage.
4. **Supabase:** Devuelve la **URL Pública** (ej. `https://xyz.supabase.co/storage/.../imagen.png`).
5. **Backend (Controller):** Guarda esa URL dentro del array `assets` de tu documento `GameContext` en MongoDB.

---

# Paso 1: Configuración del `StorageService`
Este servicio encapsula toda la lógica de Supabase. Si mañana cambias a AWS S3, solo tocas este archivo.

**Instalar dependencias:**
```Bash
npm install @supabase/supabase-js multer
```

**`src/services/storageService.js`**
```JavaScript
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

// Variables de entorno (¡Añádelas a tu .env!)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // Usa la Service Key para permisos de escritura backend
const BUCKET_NAME = 'game-assets';

class StorageService {
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  /**
   * Sube un archivo a Supabase y devuelve la URL pública
   * @param {Object} file - Objeto file de Multer (buffer, mimetype, originalname)
   * @param {String} folder - Carpeta de destino (ej. 'context-id')
   */
  async uploadFile(file, folder = 'general') {
    try {
      // 1. Generar nombre único para evitar colisiones
      // Ej: 1715629123-mi-imagen.png
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
      const filePath = `${folder}/${timestamp}-${sanitizedName}`;

      // 2. Subir el archivo (Buffer)
      const { data, error } = await this.supabase
        .storage
        .from(BUCKET_NAME)
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) throw error;

      // 3. Obtener la URL pública
      const { data: publicUrlData } = this.supabase
        .storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      logger.info(`Archivo subido exitosamente: ${filePath}`);
      return publicUrlData.publicUrl;

    } catch (error) {
      logger.error(`Error subiendo a Supabase: ${error.message}`);
      throw new Error('Fallo en la subida del archivo');
    }
  }

  /**
   * (Opcional) Borrar archivo si eliminamos el asset del juego
   */
  async deleteFile(url) {
    // Lógica para extraer el path de la URL y llamar a .remove()
  }
}

module.exports = new StorageService();
```

---

# Paso 2: El Controlador (`AssetController`)
Aquí es donde unimos el mundo de los archivos con el mundo de MongoDB.

**`src/controllers/assetController.js`**
```JavaScript
const GameContext = require('../models/GameContext');
const storageService = require('../services/storageService');

exports.uploadAsset = async (req, res) => {
  try {
    const { contextId } = req.params;
    const { key, value, type } = req.body; // type puede ser 'image' o 'audio'
    const file = req.file; // Viene gracias a Multer

    if (!file) {
      return res.status(400).json({ success: false, error: 'No se ha subido ningún archivo' });
    }

    // 1. Verificar que el contexto existe
    const context = await GameContext.findById(contextId); // O busca por contextId string si usas ese campo
    if (!context) {
      return res.status(404).json({ success: false, error: 'Contexto no encontrado' });
    }

    // 2. Subir a Supabase (usando el ID del contexto como carpeta)
    const publicUrl = await storageService.uploadFile(file, `ctx-${contextId}`);

    // 3. Construir el nuevo objeto Asset
    const newAsset = {
      key: key,             // ej. "lion"
      value: value,         // ej. "León"
      display: value,       // Por defecto
      [type === 'audio' ? 'audioUrl' : 'imageUrl']: publicUrl // Asignación dinámica
    };

    // 4. Guardar en MongoDB
    context.assets.push(newAsset);
    await context.save();

    res.status(201).json({
      success: true,
      data: newAsset,
      message: 'Asset subido y vinculado correctamente'
    });

  } catch (error) {
    // Si falla MongoDB, idealmente deberíamos borrar la imagen de Supabase (Rollback)
    res.status(500).json({ success: false, error: error.message });
  }
};
```

---

# Paso 3: La Ruta (con Middleware Multer)
Multer es necesario para procesar peticiones `multipart/form-data`.

**`src/routes/assets.js`** (o añádelo a `contextRoutes.js`)
```JavaScript
const express = require('express');
const router = express.Router();
const multer = require('multer');
const assetController = require('../controllers/assetController');

// Configuración de Multer: Guardar en memoria (RAM) para pasar a Supabase
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // Límite de 5MB
  }
});

// POST /api/contexts/:contextId/assets
// 'file' es el nombre del campo en el formulario del frontend
router.post(
  '/:contextId/assets',
  upload.single('file'), 
  assetController.uploadAsset
);

module.exports = router;
```

---

# 🧱 Cómo consultarlos (Frontend)
Aquí está la belleza de esta arquitectura. **No necesitas consultar Supabase**.

Para usar los assets en tu App React (ya sea el profesor o el alumno), simplemente consultas tu API de siempre:
1. **Frontend:** `GET /api/contexts` (o `/api/contexts/:id`).
2. **Backend:** Devuelve el JSON del contexto, que ya incluye el array `assets` con las URLs definitivas.
```JSON
// Respuesta de tu API
{
  "contextId": "animals",
  "assets": [
    {
      "key": "lion",
      "value": "León",
      "imageUrl": "https://xyz.supabase.co/storage/v1/object/public/game-assets/ctx-123/1715...lion.png"
    }
  ]
}
```

3. **React:**
```JSON
<img src={asset.imageUrl} alt={asset.value} />
```

---

# 💡 Buenas Prácticas de Ingeniería (Para tu memoria)
1. **Independencia de la Base de Datos:** MongoDB solo guarda _referencias_ (URLs), no archivos binarios (BLOBs). Guardar archivos dentro de MongoDB es una mala práctica (los hace lentos y pesados).
2. **Abstracción (Service Pattern):** Tu controlador no sabe que usas Supabase. Solo llama a `storageService.uploadFile`. Si cambias a Google Drive mañana, el controlador no se entera.
3. **Seguridad:** Las claves de API de Supabase se quedan en el servidor (`.env`). El cliente React no necesita tener permisos de escritura en tu bucket.
4. **Organización:** Usar carpetas dentro del bucket (`ctx-ID/...`) mantiene el almacenamiento ordenado.

---

Para organizar los archivos en **Supabase Storage** de la manera más eficiente, escalable y fácil de mantener para tu TFG, la regla de oro es: **Organizar por "Ciclo de Vida" y "Pertenencia"**.

Es decir, los archivos deben estar guardados en carpetas que correspondan a la **entidad de la base de datos** (MongoDB) a la que pertenecen. Si borras un "Contexto de Juego" en MongoDB, debería ser fácil saber qué carpeta borrar en Supabase.

Aquí tienes la propuesta de estructura ideal para tu proyecto:

# 1. 🗂️ Estructura de Directorios (El Árbol)
Recomiendo crear un único **Bucket Público** llamado `game-assets`. Dentro de él, usaremos carpetas virtuales.
```Plaintext
game-assets/  (Bucket Público)
│
├── contexts/                 <-- Carpeta raíz para los contextos de juego
│   ├── {context_id_mongo}/   <-- Una carpeta por cada Documento de Contexto
│   │   ├── 17099201_lion.png
│   │   ├── 17099202_roar.mp3
│   │   └── 17099203_spain_flag.png
│   │
│   └── {otro_context_id}/
│       ├── ...
│
├── mechanics/                <-- Iconos para las mecánicas (si son dinámicos)
│   ├── association_icon.svg
│   └── sequence_icon.svg
│
└── users/                    <-- (Opcional) Avatares de profesores/alumnos
    └── {user_id}/
        └── avatar.jpg
```

---

# 2. 🏷️ Estrategia de Naming (Nombre de los archivos)
Nunca guardes el archivo con el nombre original que sube el usuario (ej. `imagen.jpg`). Si dos usuarios suben `imagen.jpg` en la misma carpeta, uno sobrescribirá al otro.

**Formato recomendado:** `{timestamp}-{nombre_sanitizado}.{ext}`
- **Timestamp:** (`Date.now()`) Garantiza unicidad temporal y evita problemas de caché del navegador si se actualiza la imagen.
- **Sanitizado:** Elimina espacios, ñ, tildes y caracteres raros que rompen las URLs.

**Ejemplo en código:**
```JavaScript
const timestamp = Date.now(); // 1715629123456
const extension = path.extname(file.originalname); // .png
const name = path.basename(file.originalname, extension)
                 .replace(/[^a-zA-Z0-9]/g, '_'); // "foto_espana"

const finalName = `${timestamp}-${name}${extension}`;
// Resultado: 1715629123456-foto_espana.png
```

---

# 3. 🛡️ ¿Por qué esta estructura es la "Mejor"?
Aquí tienes los argumentos técnicos (Ingeniería del Software) para tu memoria:

1. **Limpieza Atómica (Cascading Deletes):** Si un profesor elimina el Contexto "Animales" (`DELETE /api/contexts/:id`), tu backend solo tiene que ordenar a Supabase: _"Borra recursivamente la carpeta `contexts/:id`"_. Si tuvieras todas las imágenes mezcladas en una sola carpeta, sería imposible saber cuáles borrar sin dejar basura.
2. **Prevención de Colisiones:** Si tienes un contexto "Animales" con una imagen `lion.png` y creas otro contexto "Zoológico" que también tiene un `lion.png`, al estar en carpetas diferentes (`contexts/id_A/` vs `contexts/id_B/`), no hay conflicto.
3. **Seguridad y Caché:** Al agrupar por entidad, puedes aplicar políticas de caché más agresivas. Además, visualmente es mucho más fácil de depurar entrando al panel de Supabase.

---

# 4. ⚙️ Implementación en tu `AssetController`
Cuando implementes el `uploadAsset` que vimos antes, construirás el `path` así:
```JavaScript
// ... dentro del controlador ...

// 1. Definir la carpeta basada en la entidad padre (GameContext)
const folderPath = `contexts/${contextId}`; 

// 2. Usar el servicio para subir a esa ruta específica
const publicUrl = await storageService.uploadFile(file, folderPath);

// ...
```

---

# 5. 🔒 Políticas de Seguridad (RLS) en Supabase
En el dashboard de Supabase, deberás configurar las políticas del bucket `game-assets`:
1. **SELECT (Read):** `Public` (Cualquier persona con el link puede ver la imagen. Necesario para que el juego funcione en el navegador del niño).
2. **INSERT/UPDATE/DELETE (Write):** `Authenticated` (Solo usuarios logueados, es decir, tu Backend con la _Service Role Key_ o el profesor logueado).

Esta estructura es profesional, ordenada y te ahorrará muchos dolores de cabeza cuando el proyecto crezca.