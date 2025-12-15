# 📁 Models (Modelos de Datos)

## Propósito

Esta carpeta contiene todos los **modelos de datos de Mongoose** que definen la estructura de la base de datos MongoDB del proyecto. Cada modelo representa una colección en la base de datos y define su esquema, validaciones, métodos de instancia e índices.

---

## 📦 Estructura de Archivos

```
models/
├── Card.js            # Tarjetas RFID físicas del sistema
├── GameMechanic.js    # Mecánicas de juego disponibles (asociación, secuencia, memoria)
├── GameContext.js     # Contextos temáticos para las mecánicas (geografía, historia, ciencia)
├── GameSession.js     # Configuración de sesiones de juego (creadas por profesores)
├── GamePlay.js        # Partidas individuales de estudiantes
├── User.js            # Usuarios del sistema (profesores y alumnos)
└── README.md          # Este archivo
```

---

## 🔗 Diagrama de Relaciones

```
┌─────────────────────────────────────────────────────────────────────┐
│                          SISTEMA COMPLETO                            │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────┐
│    User     │  (Profesores y Alumnos)
├─────────────┤
│ - name      │
│ - email*    │  * Solo profesores tienen email/password
│ - password* │
│ - role      │  'teacher' | 'student'
│ - profile   │
│ - metrics   │  Solo para alumnos (estadísticas acumuladas)
└─────┬───────┘
      │
      │ createdBy (1:N)
      │ ┌─────────────────────────────────────┐
      │ │                                     │
      ├─►  GameSession (Configuración)       │
      │    ├───────────────────────────┐     │
      │    │ - mechanicId    ─────┐    │     │
      │    │ - contextId     ────┐│    │     │
      │    │ - config            ││    │     │
      │    │ - cardMappings ─┐   ││    │     │
      │    │ - status        │   ││    │     │
      │    │ - createdBy     │   ││    │     │
      │    └─────────────────┼───┼┼────┘     │
      │                      │   ││           │
      │                      │   ││           │
      │                      │   ││           │
      │ playerId (1:N)       │   ││           │
      │ ┌───────────────────┐│   ││           │
      └─►  GamePlay         ││   ││           │
         (Partida)          ││   ││           │
         ├────────────────┐ ││   ││           │
         │ - sessionId ───┼─┘│   ││           │
         │ - playerId     │  │   ││           │
         │ - score        │  │   ││           │
         │ - currentRound │  │   ││           │
         │ - events[]     │  │   ││           │
         │ - metrics      │  │   ││           │
         │ - status       │  │   ││           │
         └────────────────┘  │   ││           │
                             │   ││           │
         ┌───────────────┐   │   ││           │
         │     Card      │◄──┘   ││           │
         ├───────────────┤       ││           │
         │ - uid         │       ││           │
         │ - type        │       ││           │
         │ - status      │       ││           │
         │ - metadata    │       ││           │
         └───────────────┘       ││           │
                                 ││           │
         ┌──────────────────┐    ││           │
         │  GameContext     │◄───┘│           │
         ├──────────────────┤     │           │
         │ - contextId      │     │           │
         │ - name           │     │           │
         │ - assets[]       │     │           │
         │   * key          │     │           │
         │   * display      │     │           │
         │   * value        │     │           │
         │   * audioUrl     │     │           │
         │   * imageUrl     │     │           │
         └──────────────────┘     │           │
                                  │           │
         ┌──────────────────┐     │           │
         │  GameMechanic    │◄────┘           │
         ├──────────────────┤                 │
         │ - name           │                 │
         │ - displayName    │                 │
         │ - description    │                 │
         │ - icon           │                 │
         │ - rules          │                 │
         │ - isActive       │                 │
         └──────────────────┘                 │
                                              │
└─────────────────────────────────────────────┘

LEYENDA:
─►  : Referencia (ObjectId)
1:N : Relación uno a muchos
*   : Campo requerido solo bajo ciertas condiciones
```

---

## 📚 Descripción de Modelos

### 1. **User** (Usuario)

**Colección:** `users`

**Propósito:** Gestiona los usuarios del sistema con dos roles diferenciados:
- **Profesores (`role: 'teacher'`):** Usuarios con credenciales que gestionan la aplicación
- **Alumnos (`role: 'student'`):** Usuarios sin credenciales creados por profesores (4-6 años)

**Campos Principales:**
- `name` (String, requerido): Nombre completo
- `email` (String, único, sparse): Email para login (solo profesores)
- `password` (String): Contraseña encriptada con bcrypt (solo profesores)
- `role` (Enum): 'teacher' | 'student'
- `profile` (Object): Información adicional (avatar, edad, aula, fecha de nacimiento)
- `studentMetrics` (Object): Métricas acumuladas solo para alumnos
- `status` (Enum): 'active' | 'inactive'
- `createdBy` (ObjectId → User): Profesor que creó al alumno

**Métodos de Instancia:**
- `comparePassword(candidatePassword)`: Valida contraseñas (profesores)
- `updateLastLogin()`: Actualiza fecha de último login (profesores)
- `updateStudentMetrics(playResults)`: Actualiza métricas post-partida (alumnos)
- `toSafeObject()`: Retorna objeto sin campos sensibles
- `isTeacher()`: Verifica si es profesor
- `isStudent()`: Verifica si es alumno

**Índices:**
- `{ email: 1 }` (único, sparse)
- `{ role: 1 }`
- `{ status: 1 }`
- `{ role: 1, 'profile.classroom': 1 }`
- `{ createdBy: 1 }`

**Relaciones:**
- **1:N con GameSession**: Un profesor crea múltiples sesiones (`createdBy`)
- **1:N con GamePlay**: Un alumno juega múltiples partidas (`playerId`)

---

### 2. **Card** (Tarjeta RFID)

**Colección:** `cards`

**Propósito:** Representa las tarjetas RFID físicas que los estudiantes escanean durante las partidas.

**Campos Principales:**
- `uid` (String, único, uppercase): Identificador único de 8 o 14 caracteres hexadecimales
- `type` (Enum): 'MIFARE 1KB' | 'MIFARE 4KB' | 'NTAG' | 'UNKNOWN'
- `status` (Enum): 'active' | 'inactive' | 'lost'
- `metadata.color` (String): Color para identificación visual
- `metadata.icon` (String): Icono asociado
- `metadata.lastUsed` (Date): Última fecha de uso

**Métodos de Instancia:**
- `updateLastUsed()`: Actualiza la fecha del último escaneo

**Índices:**
- `{ uid: 1 }` (único)
- `{ status: 1 }`

**Relaciones:**
- **N:M con GameSession**: Múltiples tarjetas se usan en múltiples sesiones (a través de `cardMappings`)

**Nota Importante:** El campo `alias` fue eliminado (duda #2). Las tarjetas obtienen su significado contextual a través de `assignedValue` en `GameSession.cardMappings`.

---

### 3. **GameMechanic** (Mecánica de Juego)

**Colección:** `gamemechanics`

**Propósito:** Define las mecánicas de juego disponibles (asociación, secuencia, memoria, etc.).

**Campos Principales:**
- `name` (String, único, lowercase): Identificador interno ('association', 'sequence', 'memory')
- `displayName` (String): Nombre amigable para la UI
- `description` (String): Descripción de la mecánica
- `icon` (String): Emoji o URL del icono
- `rules` (Mixed): Reglas específicas de la mecánica (estructura flexible)
- `isActive` (Boolean): Si la mecánica está disponible

**Métodos de Instancia:**
- `activate()`: Activa la mecánica
- `deactivate()`: Desactiva la mecánica

**Índices:**
- `{ name: 1 }` (único)
- `{ isActive: 1 }`

**Relaciones:**
- **1:N con GameSession**: Una mecánica se usa en múltiples sesiones (`mechanicId`)

**Nota Importante (duda #8):** NO contiene referencia a contextos. Los contextos son independientes y tienen compatibilidad absoluta con todas las mecánicas.

---

### 4. **GameContext** (Contexto Temático)

**Colección:** `gamecontexts`

**Propósito:** Define los contextos temáticos con assets (geografía, historia, ciencia, etc.).

**Campos Principales:**
- `contextId` (String, único, lowercase): Identificador único ('geography', 'history', 'science')
- `name` (String): Nombre amigable
- `assets[]` (Array): Assets del contexto
  - `key` (String, único, lowercase): Identificador del asset
  - `display` (String): Representación visual (emoji, texto)
  - `value` (String): Valor textual del asset
  - `audioUrl` (String): URL en Supabase Storage
  - `imageUrl` (String): URL en Supabase Storage

**Métodos de Instancia:**
- `addAsset(assetData)`: Añade un nuevo asset
- `removeAsset(key)`: Elimina un asset por key
- `updateAsset(key, assetData)`: Actualiza un asset existente
- `getAssetByKey(key)`: Obtiene un asset por su key
- `getRandomAssets(count)`: Obtiene N assets aleatorios

**Índices:**
- `{ contextId: 1 }` (único)
- `{ 'assets.key': 1 }`

**Relaciones:**
- **1:N con GameSession**: Un contexto se usa en múltiples sesiones (`contextId`)

**Nota Importante (dudas #15, #15.1):** Compatibilidad ABSOLUTA con todas las mecánicas. No existe referencia a `mechanicId` - el contexto es independiente. Los contextos pueden ser predefinidos (seeders) o creados por profesores. Los archivos multimedia se almacenan en Supabase Storage.

---

### 5. **GameSession** (Sesión de Juego)

**Colección:** `gamesessions`

**Propósito:** Representa la CONFIGURACIÓN de una "sala de juego" creada por un profesor. Define qué mecánica, contexto, tarjetas y reglas se usarán.

**Campos Principales:**
- `mechanicId` (ObjectId → GameMechanic): Mecánica seleccionada
- `contextId` (ObjectId → GameContext): Contexto seleccionado
- `config` (Object): Configuración de reglas
  - `numberOfCards` (Number, 2-20): Cantidad de tarjetas usadas
  - `numberOfRounds` (Number, 1-20): Número de rondas
  - `timeLimit` (Number, 3-60): Tiempo límite por ronda en segundos
  - `pointsPerCorrect` (Number, ≥1): Puntos por respuesta correcta
  - `penaltyPerError` (Number, ≤-1): Puntos por respuesta incorrecta
- `cardMappings[]` (Array): Asignación de tarjetas a valores
  - `cardId` (ObjectId → Card): Referencia a la tarjeta
  - `uid` (String): UID denormalizado para búsqueda O(1)
  - `assignedValue` (String): Valor asignado del contexto
  - `displayData` (Mixed): Datos para el frontend
- `status` (Enum): 'created' | 'active' | 'paused' | 'completed'
- `difficulty` (Enum): 'easy' | 'medium' | 'hard'
- `startedAt` (Date): Fecha de inicio
- `endedAt` (Date): Fecha de finalización
- `createdBy` (ObjectId → User): Profesor que creó la sesión

**Métodos de Instancia:**
- `start()`: Inicia la sesión (status → 'active')
- `pause()`: Pausa la sesión (status → 'paused')
- `end()`: Finaliza la sesión (status → 'completed')
- `isActive()`: Verifica si está activa

**Índices:**
- `{ status: 1 }`
- `{ mechanicId: 1 }`
- `{ contextId: 1 }`

**Relaciones:**
- **N:1 con User**: Un profesor crea la sesión (`createdBy`)
- **N:1 con GameMechanic**: Una sesión usa una mecánica (`mechanicId`)
- **N:1 con GameContext**: Una sesión usa un contexto (`contextId`)
- **N:M con Card**: Una sesión usa múltiples tarjetas (a través de `cardMappings`)
- **1:N con GamePlay**: Una sesión puede tener múltiples partidas

**Validaciones:**
- `cardMappings.length` debe coincidir con `config.numberOfCards`

**Nota Importante (duda #16):** Una GameSession es la CONFIGURACIÓN compartida. Múltiples GamePlays pueden asociarse a una misma GameSession.

**Flujo de Creación (dudas #3-5, #10, #18):**
1. Profesor selecciona mecánica
2. Profesor selecciona contexto
3. Profesor consulta tarjetas disponibles
4. Profesor asigna valores del contexto a las tarjetas
5. Profesor configura reglas
6. Se crea GameSession con `status='created'`
7. Profesor crea GamePlays para cada alumno

---

### 6. **GamePlay** (Partida Individual)

**Colección:** `gameplays`

**Propósito:** Representa UNA PARTIDA INDIVIDUAL de un estudiante. Registra eventos, progreso y estadísticas en tiempo real.

**Campos Principales:**
- `sessionId` (ObjectId → GameSession): Referencia a la configuración
- `playerId` (ObjectId → User): Alumno que juega la partida
- `score` (Number): Puntuación acumulada
- `currentRound` (Number): Ronda actual
- `events[]` (Array): Log de eventos de la partida
  - `timestamp` (Date): Momento del evento
  - `eventType` (Enum): 'card_scanned' | 'correct' | 'error' | 'timeout' | 'round_start' | 'round_end'
  - `cardUid` (String): UID de la tarjeta escaneada
  - `expectedValue` (String): Valor esperado
  - `actualValue` (String): Valor real proporcionado
  - `pointsAwarded` (Number): Puntos otorgados/restados
  - `timeElapsed` (Number): Tiempo de respuesta en ms
  - `roundNumber` (Number): Número de ronda
- `metrics` (Object): Métricas de la partida
  - `totalAttempts` (Number): Total de intentos
  - `correctAttempts` (Number): Respuestas correctas
  - `errorAttempts` (Number): Respuestas incorrectas
  - `timeoutAttempts` (Number): Timeouts sin respuesta
  - `averageResponseTime` (Number): Tiempo medio de respuesta en ms
  - `completionTime` (Number): Duración total en ms
- `status` (Enum): 'in-progress' | 'completed' | 'abandoned'
- `startedAt` (Date): Fecha de inicio
- `completedAt` (Date): Fecha de finalización

**Métodos de Instancia:**
- `addEvent(eventData)`: Añade un evento y actualiza métricas
- `isInProgress()`: Verifica si está en progreso
- `complete()`: Marca como completada y calcula métricas finales

**Índices:**
- `{ sessionId: 1, playerId: 1, status: 1 }` (compuesto)
- `{ playerId: 1 }`

**Relaciones:**
- **N:1 con GameSession**: Múltiples partidas usan la misma configuración (`sessionId`)
- **N:1 con User**: Múltiples partidas pertenecen a un alumno (`playerId`)

**Nota Importante (dudas #6, #16, #18):** Una GamePlay es UNA PARTIDA INDIVIDUAL. Múltiples GamePlays pueden asociarse a la misma GameSession. Cada estudiante juega de forma independiente a su propio ritmo.

---

## 🔄 Flujo de Datos Completo

### Creación de una Sesión de Juego (Profesor)

```javascript
// 1. Profesor inicia sesión
const teacher = await User.findOne({ email: 'profesor@example.com', role: 'teacher' });
await teacher.updateLastLogin();

// 2. Consulta mecánicas disponibles
const mechanics = await GameMechanic.find({ isActive: true });

// 3. Consulta contextos disponibles
const contexts = await GameContext.find();

// 4. Consulta tarjetas activas
const cards = await Card.find({ status: 'active' });

// 5. Crea la sesión asignando valores de contexto a tarjetas
const session = await GameSession.create({
  mechanicId: mechanics[0]._id,
  contextId: contexts[0]._id,
  config: {
    numberOfCards: 5,
    numberOfRounds: 10,
    timeLimit: 15,
    pointsPerCorrect: 10,
    penaltyPerError: -2
  },
  cardMappings: [
    {
      cardId: cards[0]._id,
      uid: cards[0].uid,
      assignedValue: 'España',
      displayData: { display: '🇪🇸', value: 'España' }
    },
    // ... más tarjetas
  ],
  createdBy: teacher._id
});

// 6. Crea partidas para los alumnos
const students = await User.find({ role: 'student', 'profile.classroom': '1A' });
for (const student of students) {
  await GamePlay.create({
    sessionId: session._id,
    playerId: student._id
  });
}
```

### Ejecución de una Partida (Alumno)

```javascript
// 1. Iniciar la sesión
await session.start();

// 2. Alumno escanea tarjeta RFID
// (El sensor RFID envía el UID vía Serial → rfidService → gameEngine)

// 3. GameEngine valida la respuesta y actualiza GamePlay
const gamePlay = await GamePlay.findOne({
  sessionId: session._id,
  playerId: student._id,
  status: 'in-progress'
});

await gamePlay.addEvent({
  eventType: 'correct',
  cardUid: '32B8FA05',
  expectedValue: 'España',
  actualValue: 'España',
  pointsAwarded: 10,
  timeElapsed: 3500,
  roundNumber: 1
});

// 4. Al completar la partida
await gamePlay.complete();

// 5. Actualizar métricas del alumno
await student.updateStudentMetrics({
  score: gamePlay.score,
  correctAttempts: gamePlay.metrics.correctAttempts,
  errorAttempts: gamePlay.metrics.errorAttempts,
  averageResponseTime: gamePlay.metrics.averageResponseTime
});
```

### Consulta de Estadísticas (Profesor)

```javascript
// 1. Estadísticas de un alumno específico
const student = await User.findById(studentId);
console.log(student.studentMetrics);

// 2. Comparar con la media de la clase
const classStudents = await User.find({
  role: 'student',
  'profile.classroom': '1A'
});

const classAverage = classStudents.reduce((sum, s) =>
  sum + s.studentMetrics.averageScore, 0) / classStudents.length;

// 3. Historial de partidas de un alumno
const studentPlays = await GamePlay.find({ playerId: studentId })
  .populate('sessionId')
  .sort({ startedAt: -1 });

// 4. Rendimiento en una mecánica específica
const mechanicPlays = await GamePlay.find({ playerId: studentId })
  .populate({
    path: 'sessionId',
    match: { mechanicId: specificMechanicId }
  });
```

---

## 🛡️ Validaciones y Seguridad

### User
- **Profesores:** DEBEN tener email y password
- **Alumnos:** NO necesitan email ni password
- **Contraseñas:** Encriptadas con bcrypt (salt rounds: 10)
- **Email:** Validación con regex, único y sparse
- **Edad:** Rango de 3-99 años para alumnos

### Card
- **UID:** Debe ser 8 o 14 caracteres hexadecimales (uppercase)
- **Tipo:** Enum estricto de tipos RFID conocidos
- **Estado:** Solo 'active', 'inactive', 'lost'

### GameSession
- **cardMappings:** Longitud debe coincidir con `config.numberOfCards`
- **Puntos:** `pointsPerCorrect` ≥ 1, `penaltyPerError` ≤ -1, ambos enteros
- **Rondas:** 1-20
- **Tiempo límite:** 3-60 segundos
- **Tarjetas:** 2-20 tarjetas

### GameContext
- **assets:** No puede estar vacío
- **asset.key:** Único dentro del contexto
- **asset.value:** Campo requerido

---

## 📊 Índices y Rendimiento

Todos los modelos incluyen índices estratégicos para optimizar las consultas más frecuentes:

- **Búsquedas por ID:** ObjectId automáticamente indexado
- **Búsquedas por UID:** Índice en `Card.uid` para escaneos RFID O(1)
- **Filtros por estado:** Índices en campos `status` y `isActive`
- **Relaciones:** Índices en claves foráneas (`mechanicId`, `contextId`, `sessionId`, `playerId`, `createdBy`)
- **Consultas compuestas:** Índices compuestos para filtros combinados

**Ejemplo de optimización:**
```javascript
// Búsqueda rápida de partida activa de un jugador en una sesión
// Índice compuesto: { sessionId: 1, playerId: 1, status: 1 }
const activePlay = await GamePlay.findOne({
  sessionId: sessionId,
  playerId: playerId,
  status: 'in-progress'
}); // O(1) gracias al índice compuesto
```

---

## 🚀 Mejoras Futuras

1. **Modelo User:**
   - Añadir sistema de roles avanzado con permisos granulares
   - Implementar autenticación con JWT y refresh tokens
   - Añadir campo `avatar` con integración a almacenamiento de archivos
   - Implementar soft-delete (campo `deletedAt`)

2. **Modelo GamePlay:**
   - Añadir campo `replay` para almacenar grabaciones de partidas
   - Implementar sistema de logros y badges
   - Añadir soporte para partidas multijugador (array de `playerIds`)

3. **Modelo GameSession:**
   - Añadir campo `scheduledAt` para sesiones programadas
   - Implementar sistema de plantillas de sesión
   - Añadir soporte para sesiones recurrentes (daily, weekly)

4. **General:**
   - Implementar validaciones con JSON Schema
   - Añadir hooks post-save para notificaciones en tiempo real
   - Implementar versionado de documentos (plugin `mongoose-history`)
   - Añadir tests unitarios para todos los métodos de instancia
   - Implementar soft-delete global con plugin

---

## 📖 Recursos

- [Mongoose Documentation](https://mongoosejs.com/docs/guide.html)
- [MongoDB Schema Design Best Practices](https://www.mongodb.com/developer/products/mongodb/mongodb-schema-design-best-practices/)
- [Bcrypt Documentation](https://www.npmjs.com/package/bcrypt)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

**Última Actualización:** Noviembre 12, 2025
**Versión:** 1.0
**Estado:** Completo y Funcional ✅
