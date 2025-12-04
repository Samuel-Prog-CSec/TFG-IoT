# Requisitos Funcionales - Sistema de Juegos

## RF-JGO: Sistema de Juegos Educativos

---

## Mecánicas de Juego (RF-JGO-001 a RF-JGO-005)

### RF-JGO-001: Gestión de Mecánicas de Juego ✅

**Descripción:** El sistema debe permitir gestionar las mecánicas de juego disponibles (Asociación, Secuencia, Memoria).

**Criterios de Aceptación:**

- CRUD completo de mecánicas
- Campos: name (único, lowercase), displayName, description, icon, rules, isActive
- Las mecánicas son independientes de los contextos (compatibilidad absoluta)

**Endpoints:**

- `GET /api/mechanics` - Listar mecánicas
- `GET /api/mechanics/active` - Listar mecánicas activas (público)
- `GET /api/mechanics/:id` - Obtener mecánica
- `POST /api/mechanics` - Crear mecánica
- `PUT /api/mechanics/:id` - Actualizar mecánica
- `DELETE /api/mechanics/:id` - Desactivar mecánica

---

### RF-JGO-002: Mecánica de Asociación ✅

**Descripción:** El sistema debe soportar la mecánica de "Asociación" donde el jugador empareja elementos.

**Criterios de Aceptación:**

- El sistema muestra un elemento (ej: bandera)
- El jugador debe escanear la tarjeta que corresponde al valor asociado (ej: país)
- Validación inmediata de respuesta correcta/incorrecta

**Reglas:**

```json
{
  "name": "association",
  "displayName": "Asociación",
  "rules": {
    "type": "match",
    "showElement": "display",
    "expectResponse": "value"
  }
}
```

---

### RF-JGO-003: Mecánica de Secuencia 📋

**Descripción:** El sistema debe soportar la mecánica de "Secuencia" donde el jugador ordena elementos.

**Criterios de Aceptación:**

- El sistema muestra un conjunto de elementos desordenados
- El jugador debe escanear tarjetas en el orden correcto
- Validación por cada paso de la secuencia

**Estado:** Planificado para implementación futura

---

### RF-JGO-004: Mecánica de Memoria 📋

**Descripción:** El sistema debe soportar la mecánica de "Memoria" donde el jugador recuerda patrones.

**Criterios de Aceptación:**

- El sistema muestra un patrón de elementos
- El patrón desaparece
- El jugador debe recrear el patrón escaneando tarjetas

**Estado:** Planificado para implementación futura

---

### RF-JGO-005: Extensibilidad de Mecánicas ✅

**Descripción:** El sistema debe permitir añadir nuevas mecánicas sin modificar el código existente.

**Criterios de Aceptación:**

- Estructura de datos flexible con campo `rules` de tipo Mixed
- Patrón Open/Closed aplicado
- Nuevas mecánicas se añaden vía seeders o API

---

## Contextos de Juego (RF-JGO-006 a RF-JGO-012)

### RF-JGO-006: Gestión de Contextos Temáticos ✅

**Descripción:** El sistema debe permitir gestionar contextos temáticos para los juegos.

**Criterios de Aceptación:**

- CRUD completo de contextos
- Campos: contextId (único), name, isActive, assets[]
- Los contextos son compatibles con TODAS las mecánicas

**Endpoints:**

- `GET /api/contexts` - Listar contextos
- `GET /api/contexts/:id` - Obtener contexto
- `POST /api/contexts` - Crear contexto
- `PUT /api/contexts/:id` - Actualizar contexto
- `DELETE /api/contexts/:id` - Eliminar contexto

---

### RF-JGO-007: Assets de Contexto ✅

**Descripción:** Cada contexto debe contener un array de assets (elementos del tema).

**Estructura de Asset:**

```json
{
  "key": "spain",
  "display": "🇪🇸",
  "value": "España",
  "audioUrl": "https://supabase.../spain.mp3",
  "imageUrl": "https://supabase.../spain.png"
}
```

**Criterios de Aceptación:**

- Campo `key` único dentro del contexto (lowercase)
- Campo `value` requerido (texto descriptivo)
- Campos `display`, `audioUrl`, `imageUrl` opcionales
- El array de assets no puede estar vacío

---

### RF-JGO-008: Contextos Predefinidos ✅

**Descripción:** El sistema debe incluir contextos predefinidos mediante seeders.

**Contextos Base:**

- Geografía (países, banderas, capitales)
- Historia (eventos, fechas, personajes)
- Ciencias (elementos, fórmulas, procesos)
- Números (1-10 con representación visual)

---

### RF-JGO-009: Creación de Contextos por Profesor ✅

**Descripción:** Los profesores deben poder crear contextos personalizados.

**Criterios de Aceptación:**

- Interfaz para definir contextId y name
- Añadir assets con todos los campos
- Subir archivos multimedia a Supabase

---

### RF-JGO-010: Gestión de Assets Individual ✅

**Descripción:** El sistema debe permitir añadir y eliminar assets de un contexto.

**Endpoints:**

- `POST /api/contexts/:id/assets` - Añadir asset
- `DELETE /api/contexts/:id/assets/:key` - Eliminar asset
- `GET /api/contexts/:id/assets` - Listar assets

---

### RF-JGO-011: Almacenamiento de Multimedia ✅

**Descripción:** Los archivos multimedia deben almacenarse en Supabase Storage.

**Criterios de Aceptación:**

- Bucket: `game-assets`
- Nomenclatura: `{folder}/{timestamp}-{filename}`
- Tipos permitidos: imágenes (png, jpg, gif), audio (mp3, wav)
- Tamaño máximo: 5MB por archivo
- URLs públicas retornadas

**Endpoint:** `POST /api/assets/upload`

---

### RF-JGO-012: Validación de Assets ✅

**Descripción:** El sistema debe validar los assets antes de guardarlos.

**Criterios de Aceptación:**

- Validar tipo MIME de archivos
- Validar tamaño máximo
- Sanitizar nombres de archivo
- Verificar URLs de Supabase válidas

---

## Sesiones de Juego (RF-JGO-013 a RF-JGO-020)

### RF-JGO-013: Creación de Sesión de Juego ✅

**Descripción:** Un profesor debe poder crear una sesión de juego configurada.

**Criterios de Aceptación:**

- Seleccionar mecánica existente
- Seleccionar contexto existente
- Configurar reglas (rondas, tiempo, puntos)
- Asignar tarjetas RFID a valores del contexto
- Estado inicial: "created"

**Endpoint:** `POST /api/sessions`

**Datos de Entrada:**

```json
{
  "mechanicId": "ObjectId",
  "contextId": "ObjectId",
  "config": {
    "numberOfCards": 5,
    "numberOfRounds": 10,
    "timeLimit": 15,
    "pointsPerCorrect": 10,
    "penaltyPerError": -2
  },
  "cardMappings": [
    {
      "cardId": "ObjectId",
      "uid": "32B8FA05",
      "assignedValue": "España",
      "displayData": { "display": "🇪🇸" }
    }
  ]
}
```

---

### RF-JGO-014: Validación de Sesión ✅

**Descripción:** El sistema debe validar la configuración de la sesión antes de crearla.

**Criterios de Aceptación:**

- `numberOfCards` debe coincidir con `cardMappings.length`
- Todas las tarjetas deben existir y estar activas
- `assignedValue` debe corresponder a un asset del contexto
- Valores de config dentro de rangos permitidos

**Rangos:**

- numberOfCards: 2-30
- numberOfRounds: 1-20
- timeLimit: 3-60 segundos
- pointsPerCorrect: entero positivo
- penaltyPerError: entero negativo

---

### RF-JGO-015: Cálculo Automático de Dificultad ✅

**Descripción:** El sistema debe calcular automáticamente la dificultad basándose en numberOfCards.

**Reglas:**

- Easy: 2-5 tarjetas
- Medium: 6-12 tarjetas
- Hard: 13-30 tarjetas

---

### RF-JGO-016: Estados de Sesión ✅

**Descripción:** Las sesiones deben tener estados que controlen su ciclo de vida.

**Estados:**

- `created`: Sesión configurada, no iniciada
- `active`: Sesión en curso, partidas pueden jugarse
- `paused`: Sesión pausada temporalmente
- `completed`: Sesión finalizada

**Métodos:**

- `session.start()` - Cambiar a active, registrar startedAt
- `session.pause()` - Cambiar a paused
- `session.end()` - Cambiar a completed, registrar endedAt

---

### RF-JGO-017: Denormalización de UID ✅

**Descripción:** El UID de las tarjetas debe estar denormalizado en cardMappings para búsquedas O(1).

**Criterios de Aceptación:**

- Campo `uid` incluido en cada cardMapping
- Permite búsqueda directa sin JOIN a colección de cards
- Sincronizado con el cardId referenciado

---

### RF-JGO-018: CRUD de Sesiones ✅

**Descripción:** El sistema debe proporcionar operaciones CRUD completas para sesiones.

**Endpoints:**

- `GET /api/sessions` - Listar sesiones
- `GET /api/sessions/:id` - Obtener sesión
- `POST /api/sessions` - Crear sesión
- `PUT /api/sessions/:id` - Actualizar sesión
- `DELETE /api/sessions/:id` - Eliminar sesión
- `POST /api/sessions/:id/start` - Iniciar sesión
- `POST /api/sessions/:id/pause` - Pausar sesión
- `POST /api/sessions/:id/end` - Finalizar sesión

---

### RF-JGO-019: Múltiples Partidas por Sesión ✅

**Descripción:** Una sesión puede tener múltiples partidas asociadas (una por alumno).

**Criterios de Aceptación:**

- Varios alumnos pueden jugar la misma sesión
- Cada alumno tiene su propia partida (GamePlay)
- Las partidas son independientes entre sí
- Los alumnos juegan a su propio ritmo

---

### RF-JGO-020: Propiedad de Sesiones ✅

**Descripción:** Las sesiones deben estar asociadas al profesor que las creó.

**Criterios de Aceptación:**

- Campo `createdBy` referencia al profesor
- Solo el creador puede modificar/eliminar la sesión
- Profesores pueden ver sesiones de otros profesores (lectura)

---

## Partidas Individuales (RF-JGO-021 a RF-JGO-025)

### RF-JGO-021: Creación de Partida ✅

**Descripción:** Un profesor debe poder crear partidas asignando alumnos a sesiones.

**Criterios de Aceptación:**

- Asociar sessionId y playerId
- playerId debe ser un usuario con role='student'
- Estado inicial: "in-progress"
- Registrar startedAt automáticamente

**Endpoint:** `POST /api/plays`

---

### RF-JGO-022: Registro de Eventos ✅

**Descripción:** El sistema debe registrar todos los eventos durante una partida.

**Tipos de Eventos:**

- `round_start`: Inicio de ronda
- `card_scanned`: Tarjeta escaneada
- `correct`: Respuesta correcta
- `error`: Respuesta incorrecta
- `timeout`: Tiempo agotado
- `round_end`: Fin de ronda

**Datos del Evento:**

```json
{
  "timestamp": "Date",
  "eventType": "string",
  "cardUid": "string (opcional)",
  "expectedValue": "string",
  "actualValue": "string",
  "pointsAwarded": "number",
  "timeElapsed": "number (ms)",
  "roundNumber": "number"
}
```

---

### RF-JGO-023: Métricas de Partida ✅

**Descripción:** El sistema debe calcular y mantener métricas de cada partida.

**Métricas:**

- totalAttempts: Total de intentos
- correctAttempts: Respuestas correctas
- errorAttempts: Respuestas incorrectas
- timeoutAttempts: Timeouts
- averageResponseTime: Tiempo medio de respuesta (ms)
- completionTime: Duración total de la partida (ms)

---

### RF-JGO-024: Estados de Partida ✅

**Descripción:** Las partidas deben tener estados que controlen su ciclo de vida.

**Estados:**

- `in-progress`: Partida en curso
- `completed`: Partida finalizada exitosamente
- `abandoned`: Partida abandonada/cancelada

**Método:** `play.complete()` - Cambiar a completed, calcular métricas finales

---

### RF-JGO-025: CRUD de Partidas ✅

**Descripción:** El sistema debe proporcionar operaciones para gestionar partidas.

**Endpoints:**

- `GET /api/plays` - Listar partidas
- `GET /api/plays/:id` - Obtener partida
- `POST /api/plays` - Crear partida
- `POST /api/plays/:id/events` - Añadir evento
- `POST /api/plays/:id/complete` - Completar partida
- `POST /api/plays/:id/abandon` - Abandonar partida
- `GET /api/plays/stats/:playerId` - Estadísticas del jugador

