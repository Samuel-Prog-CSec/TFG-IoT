
# 📁 Models (Modelos de Datos)

## Propósito

Esta carpeta contiene los **modelos Mongoose** que definen la estructura de MongoDB del proyecto: entidades principales, validaciones a nivel de BD, métodos de instancia e índices.

---

## 📦 Estructura de Archivos

```
models/
├── Card.js            # Tarjetas RFID físicas del sistema
├── CardDeck.js        # Mazos reutilizables (con mapeos tarjeta→valor)
├── GameMechanic.js    # Mecánicas de juego disponibles
├── GameContext.js     # Contextos temáticos + assets (compatibles con todas las mecánicas)
├── GameSession.js     # Configuración de sesiones (usa un mazo + reglas)
├── GamePlay.js        # Partidas individuales de estudiantes
├── User.js            # Usuarios (super_admin, teacher, student)
└── README.md          # Este archivo
```

---

## 🔗 Diagrama de Relaciones (alto nivel)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                               SISTEMA                                    │
└──────────────────────────────────────────────────────────────────────────┘

  ┌────────────────┐
  │      User      │  (super_admin / teacher / student)
  ├────────────────┤
  │ - name         │
  │ - email*       │  * Solo roles con login: teacher/super_admin
  │ - password*    │
  │ - role         │
  │ - accountStatus*│ * pending_approval/approved/rejected (solo login)
  │ - createdBy    │  (solo student) -> User (teacher)
  │ - assignedTeacher│ (solo student) -> User (teacher)
  └───────┬────────┘
          │ createdBy (1:N)
          v

  ┌───────────────────────┐        ┌───────────────────────┐
  │       CardDeck         │        │      GameContext      │
  ├───────────────────────┤        ├───────────────────────┤
  │ - contextId  ──────────┼───────►│ - contextId           │
  │ - cardMappings[]       │        │ - assets[]            │
  │ - createdBy ──────────►│        └───────────────────────┘
  └───────────┬───────────┘
              │ deckId (1:N)
              v

  ┌───────────────────────┐        ┌───────────────────────┐
  │      GameSession       │        │     GameMechanic      │
  ├───────────────────────┤        ├───────────────────────┤
  │ - deckId     ──────────┼───────►│ - name / rules        │
  │ - mechanicId ──────────┼───────►└───────────────────────┘
  │ - contextId  ──────────┼───────► GameContext
  │ - config               │
  │ - cardMappings[]       │  (cardId + uid + assignedValue)
  │ - createdBy ──────────► User (teacher)
  └───────────┬───────────┘
              │ sessionId (1:N)
              v

  ┌───────────────────────┐
  │       GamePlay         │
  ├───────────────────────┤
  │ - sessionId  ─────────► GameSession
  │ - playerId   ─────────► User (student)
  │ - events[] / metrics   │
  │ - pausedAt / remainingTime │
  └───────────────────────┘

LEYENDA:
─►      : Referencia (ObjectId)
1:N     : Relación uno a muchos
*       : Campo requerido solo bajo ciertas condiciones
```

---

## 📚 Descripción de Modelos

### 1. **User** (Usuario)

**Colección:** `users`

**Roles soportados:**
- `super_admin`: puede aprobar/rechazar profesores y acceder al panel.
- `teacher`: usuario con credenciales que gestiona el sistema.
- `student`: alumno (sin credenciales) que solo juega usando RFID.

**Campos clave:**
- `email` + `password`: solo para `teacher` y `super_admin`.
- `accountStatus`: solo para roles con login (`pending_approval` | `approved` | `rejected`).
- `createdBy`: referencia al profesor creador del alumno (requerido al crear `student`).
- `assignedTeacher`: referencia opcional a un profesor asignado (además del creador).

**Validación a nivel de modelo (hook pre-save):**
- `teacher/super_admin` requieren `email` y `password` (password se hashea con bcrypt si cambia).
- `student` prohíbe `email/password` y exige `createdBy` al crear.

---

### 2. **Card** (Tarjeta RFID)

**Colección:** `cards`

Representa una tarjeta física identificada por `uid` (8 o 14 hex, uppercase). El significado contextual no vive en `Card`, sino en los mapeos (`assignedValue`) dentro de mazos/sesiones.

---

### 3. **CardDeck** (Mazo de tarjetas)

**Colección:** `card_decks`

Un mazo es una plantilla reutilizable para preparar sesiones rápidamente.

**Campos principales:**
- `name`: único por profesor (`createdBy` + `name` unique).
- `contextId`: el contexto del que provienen los valores (`GameContext`).
- `cardMappings[]`: subdocumentos con `{ cardId, uid, assignedValue, displayData }`.
- `status`: `active` | `archived`.
- `createdBy`: profesor propietario.

**Validaciones:**
- `cardMappings` debe tener entre 2 y 30 elementos.

**Relaciones:**
- `createdBy` → `User (teacher)`.
- `contextId` → `GameContext`.
- `cardMappings.cardId` → `Card`.
- Es referenciado desde `GameSession.deckId`.

---

### 4. **GameMechanic** (Mecánica de Juego)

**Colección:** `game_mechanics`

Define reglas/estructura de una mecánica (asociación, secuencia, memoria, etc.). No referencia contextos: los contextos son compatibles con todas las mecánicas.

---

### 5. **GameContext** (Contexto temático)

**Colección:** `game_contexts`

Define colecciones de assets reutilizables por cualquier mecánica. Un contexto agrupa elementos multimedia bajo una misma temática (ej. "Animales", "Geografía").

**Estructura del Asset:**
Cada asset en el array `assets` contiene:
- `key`: Identificador único en minúsculas (ej. "dog").
- `value`: Nombre visible o valor textual (ej. "Perro").
- `display`: Representación visual rápida, típicamente un emoji (ej. "🐶").
- `imageUrl` / `thumbnailUrl`: URLs apuntando a **Supabase Storage** (archivos `.webp` optimizados).
- `audioUrl`: URL apuntando a **Supabase Storage** (archivos de audio validados).

**Validaciones y Estrategia:**
- `assets` no puede estar vacío y tiene un máximo de `MAX_ASSETS_PER_CONTEXT` (por defecto 30).
- Cada `key` debe ser único dentro del mismo contexto para evitar colisiones en las lógicas de juego.
- Los archivos multimedia no se guardan en base de datos. El servidor procesa la subida (`ImageProcessingService` / `AudioValidationService`), envía el binario a Supabase, y solo almacena las URLs públicas.

---

### 6. **GameSession** (Sesión de juego)

**Colección:** `game_sessions`

Representa la configuración de una “sala” creada por un profesor.

**Campos principales:**
- `mechanicId` → `GameMechanic`.
- `deckId` → `CardDeck` (requerido).
- `contextId` → `GameContext`.
- `config.numberOfCards`: 2-30.
- `cardMappings[]`: mapeos efectivos usados por el motor.
- `createdBy` → `User (teacher)`.

**Nota:** aunque existe `deckId`, la sesión mantiene sus propios `cardMappings` (snapshot/instancia concreta de la configuración).

---

### 7. **GamePlay** (Partida individual)

**Colección:** `gameplays`

Una partida pertenece a un alumno y a una sesión:
- `sessionId` → `GameSession`
- `playerId` → `User (student)`

Registra `events[]`, `metrics`, estado (`in-progress/paused/completed/abandoned`) y tiempos.
Incluye campos para gestión de pausas: `pausedAt` y `remainingTime`.

---

## 🔄 Ejemplo de flujo de datos (mínimo)

```javascript
// 1) Profesor crea/elige un mazo (CardDeck)
const deck = await CardDeck.create({
  name: 'Banderas - Aula A',
  contextId,
  cardMappings: [
    { cardId, uid: '32B8FA05', assignedValue: 'España', displayData: { display: '🇪🇸' } },
    { cardId, uid: 'A1B2C3D4', assignedValue: 'Francia', displayData: { display: '🇫🇷' } }
  ],
  createdBy: teacherId
});

// 2) Profesor crea una sesión desde ese mazo
const session = await GameSession.create({
  mechanicId,
  deckId: deck._id,
  contextId,
  config: { numberOfCards: 2, numberOfRounds: 5, timeLimit: 15 },
  cardMappings: deck.cardMappings,
  createdBy: teacherId
});

// 3) Profesor crea una partida por alumno
await GamePlay.create({ sessionId: session._id, playerId: studentId });
```

---

## 🛡️ Validaciones y rangos (resumen)

- **User**: roles con login requieren `email/password`; `student` no puede tener credenciales.
- **Card**: `uid` debe ser 8 o 14 hex (uppercase).
- **CardDeck**: `cardMappings` entre 2 y 30.
- **GameContext**: `assets` entre 1 y 30.
- **GameSession**: `config.numberOfCards` entre 2 y 30 y `cardMappings.length` debe coincidir.

---

## 📊 Índices y rendimiento (puntos clave)

- `Card.uid` unique (lookup O(1) al escanear RFID).
- `GamePlay` índice compuesto `{ sessionId, playerId, status }` para localizar partidas activas rápido.
- `CardDeck` índices por `createdBy`, `contextId`, `status` y unique `{ createdBy, name }`.

---

**Última Actualización:** Enero 04, 2026
**Estado:** Alineado con el código actual ✅
