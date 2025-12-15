# Flujo de Usuarios: Profesores vs Alumnos

## 📋 Resumen Ejecutivo

El sistema contempla **dos roles de usuario completamente diferentes** en cuanto a su interacción con la plataforma:

| Aspecto | Profesores (teacher) | Alumnos (student) |
|---------|----------------------|-------------------|
| **Edad** | Adultos | 4-6 años |
| **Acceso a la app** | ✅ Sí (email/password) | ❌ No |
| **Registro** | Auto-registro en `/api/auth/register` | Creados por profesores en `/api/users` |
| **Credenciales** | Email + Password | ❌ Ninguna |
| **Login** | ✅ Sí (`/api/auth/login`) | ❌ No |
| **Interacción** | Aplicación web (React) | Solo sensor RFID durante partidas |
| **Gestión** | Autogestionada | Gestionada por profesores |

---

## 🎓 Flujo de Profesores

### 1. Registro de Profesor (Público)

**Endpoint**: `POST /api/auth/register`

**Body**:
```json
{
  "name": "María García",
  "email": "maria.garcia@colegio.es",
  "password": "Secure123",
  "profile": {
    "avatar": "https://example.com/avatar.jpg"
  }
}
```

**Validación** (Zod - `registerTeacherSchema`):
- ✅ `name`: 2-100 caracteres
- ✅ `email`: Formato válido, único en BD
- ✅ `password`: Mínimo 8 caracteres, mayúscula, minúscula, número
- ❌ NO acepta campo `role` (se fuerza a 'teacher' en el controller)

**Respuesta** (201):
```json
{
  "success": true,
  "message": "Profesor registrado exitosamente",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "name": "María García",
      "email": "maria.garcia@colegio.es",
      "role": "teacher",
      "status": "active",
      "createdAt": "2025-11-24T10:00:00Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "accessTokenExpiry": "2025-11-24T10:15:00Z",
    "refreshTokenExpiry": "2025-12-24T10:00:00Z"
  }
}
```

### 2. Login de Profesor

**Endpoint**: `POST /api/auth/login`

**Body**:
```json
{
  "email": "maria.garcia@colegio.es",
  "password": "Secure123"
}
```

**Validación**:
- ✅ Usuario existe con ese email
- ✅ Usuario tiene `role: 'teacher'` (alumnos no pueden hacer login)
- ✅ Usuario tiene `status: 'active'`
- ✅ Password coincide con el hash almacenado

**Respuesta** (200):
```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "user": { ... },
    "accessToken": "...",
    "refreshToken": "...",
    "accessTokenExpiry": "...",
    "refreshTokenExpiry": "..."
  }
}
```

### 3. Gestión de la Aplicación

Con el `accessToken` en el header `Authorization: Bearer <token>`, el profesor puede:

- ✅ Crear alumnos (`POST /api/users`)
- ✅ Crear sesiones de juego (`POST /api/sessions`)
- ✅ Asignar partidas a alumnos (`POST /api/plays`)
- ✅ Ver estadísticas de alumnos (`GET /api/users/:id/stats`)
- ✅ Gestionar contextos y mecánicas
- ✅ Analizar tendencias de aprendizaje

---

## 👶 Flujo de Alumnos

### 1. Creación de Alumno por Profesor

**Endpoint**: `POST /api/users` (requiere autenticación como profesor)

**Headers**:
```
Authorization: Bearer <accessToken>
```

**Body**:
```json
{
  "name": "Lucas Martínez",
  "profile": {
    "age": 5,
    "classroom": "Aula A",
    "birthdate": "2020-03-15"
  }
}
```

**Validación** (Zod - `createStudentSchema`):
- ✅ `name`: 2-100 caracteres
- ✅ `profile.age`: 3-99 años (opcional)
- ✅ `profile.classroom`: Máximo 50 caracteres (opcional)
- ❌ NO acepta `email` (rechazado por `.strict()`)
- ❌ NO acepta `password` (rechazado por `.strict()`)
- ❌ NO acepta `role` (se fuerza a 'student' en el controller)

**Lógica del Controller** (`userController.createUser`):
1. Verificar que `req.user.role === 'teacher'`
2. Crear alumno con:
   - `role: 'student'` (hardcoded)
   - `createdBy: req.user._id` (profesor autenticado)
   - `status: 'active'`
   - **SIN email ni password**

**Validación del Modelo** (`User.js` pre-save hook):
```javascript
if (this.role === 'student') {
  // ✅ VALIDACIÓN ESTRICTA: Los alumnos NO deben tener email ni password
  if (this.email) {
    return next(new Error('Los alumnos NO deben tener email...'));
  }
  if (this.password) {
    return next(new Error('Los alumnos NO deben tener contraseña...'));
  }

  // ✅ Validar que tenga un creador (profesor)
  if (!this.createdBy && this.isNew) {
    return next(new Error('Los alumnos deben ser creados por un profesor...'));
  }
}
```

**Respuesta** (201):
```json
{
  "success": true,
  "message": "Alumno creado exitosamente",
  "data": {
    "user": {
      "_id": "507f1f77bcf86cd799439022",
      "name": "Lucas Martínez",
      "role": "student",
      "profile": {
        "age": 5,
        "classroom": "Aula A",
        "birthdate": "2020-03-15T00:00:00Z"
      },
      "studentMetrics": {
        "totalGamesPlayed": 0,
        "totalScore": 0,
        "averageScore": 0,
        "bestScore": 0,
        "totalCorrectAnswers": 0,
        "totalErrors": 0,
        "averageResponseTime": 0
      },
      "status": "active",
      "createdBy": "507f1f77bcf86cd799439011",
      "createdAt": "2025-11-24T10:30:00Z"
    }
  }
}
```

### 2. Asignación de Partida al Alumno

**Endpoint**: `POST /api/plays` (requiere autenticación como profesor)

**Body**:
```json
{
  "sessionId": "507f1f77bcf86cd799439033",
  "playerId": "507f1f77bcf86cd799439022"
}
```

El profesor crea una `GamePlay` asociada a:
- Una `GameSession` (configuración del juego)
- Un alumno (`playerId`)

### 3. Juego del Alumno (Sin Login)

**El alumno NO usa la aplicación web**. Solo interactúa con el sensor RFID:

1. **Profesor inicia la partida** en la aplicación web
2. **Sistema muestra desafío** en la pantalla
3. **Alumno escanea tarjeta RFID** con su respuesta
4. **Sensor envía UID** vía Serial → `rfidService` → `gameEngine`
5. **gameEngine valida** la respuesta automáticamente
6. **WebSocket emite resultado** → Frontend actualiza en tiempo real
7. **Alumno ve feedback visual/sonoro** (sin interactuar con la app)

### 4. Actualización de Métricas

Al finalizar la partida, el sistema llama automáticamente:

```javascript
// gameEngine.endPlay() → gamePlay.complete() → User.updateStudentMetrics()
await student.updateStudentMetrics({
  score: 50,
  correctAttempts: 8,
  errorAttempts: 2,
  averageResponseTime: 3500
});
```

**Métricas actualizadas**:
- `totalGamesPlayed`: +1
- `totalScore`: +50
- `averageScore`: Recalculado
- `bestScore`: Si es mayor que el anterior
- `totalCorrectAnswers`: +8
- `totalErrors`: +2
- `averageResponseTime`: Promedio ponderado
- `lastPlayedAt`: Fecha actual

---

## 🔒 Validaciones Implementadas

### Nivel 1: Zod Validators (Entrada)

```javascript
// validators/userValidator.js

registerTeacherSchema
  ✅ name, email, password obligatorios
  ✅ .strict() rechaza campos como role, createdBy

createStudentSchema
  ✅ name obligatorio, profile opcional
  ✅ .strict() rechaza campos como email, password, role
```

### Nivel 2: Controllers (Lógica)

```javascript
// authController.register()
const teacher = await User.create({
  role: 'teacher', // ✅ HARDCODED
  // ...
});

// userController.createUser()
if (req.user.role !== 'teacher') {
  throw new ForbiddenError('Solo los profesores pueden crear alumnos');
}
const student = await User.create({
  role: 'student', // ✅ HARDCODED
  createdBy: req.user._id, // ✅ AUTO-ASIGNADO
  // ...
});
```

### Nivel 3: Modelo Mongoose (Base de Datos)

```javascript
// models/User.js pre-save hook

if (this.role === 'teacher') {
  if (!this.email || !this.password) {
    throw new Error('...');
  }
  // Encriptar password con bcrypt
}

if (this.role === 'student') {
  if (this.email || this.password) {
    throw new Error('Los alumnos NO deben tener email/password');
  }
  if (!this.createdBy) {
    throw new Error('Los alumnos deben tener createdBy');
  }
}
```

### Nivel 4: Middleware de Autenticación

```javascript
// authController.login()
if (user.role !== 'teacher') {
  throw new UnauthorizedError('Solo los profesores pueden iniciar sesión');
}
```

---

## 📊 Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────────────┐
│                         PROFESORES                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Registro Público                                             │
│     POST /api/auth/register                                      │
│     { name, email, password }                                    │
│     ↓                                                            │
│     ✅ Profesor creado con role='teacher'                        │
│     ✅ Tokens JWT generados                                      │
│                                                                   │
│  2. Login                                                        │
│     POST /api/auth/login                                         │
│     { email, password }                                          │
│     ↓                                                            │
│     ✅ Validar role='teacher'                                    │
│     ✅ Tokens JWT generados                                      │
│                                                                   │
│  3. Crear Alumnos                                                │
│     POST /api/users                                              │
│     Headers: Authorization: Bearer <token>                       │
│     { name, profile }                                            │
│     ↓                                                            │
│     ✅ Alumno creado con role='student'                          │
│     ✅ createdBy = profesor autenticado                          │
│     ❌ SIN email ni password                                     │
│                                                                   │
│  4. Asignar Partidas                                             │
│     POST /api/plays                                              │
│     { sessionId, playerId }                                      │
│     ↓                                                            │
│     ✅ GamePlay creada para el alumno                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          ALUMNOS                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ❌ NO se registran (son creados por profesores)                 │
│  ❌ NO tienen email ni password                                  │
│  ❌ NO pueden hacer login                                        │
│  ❌ NO acceden a la aplicación web                               │
│                                                                   │
│  ✅ Solo interactúan con sensor RFID durante partidas            │
│  ✅ Sistema actualiza métricas automáticamente                   │
│  ✅ Profesor ve estadísticas y análisis                          │
│                                                                   │
│  Flujo de Juego:                                                 │
│    1. Profesor inicia partida en app                             │
│    2. Pantalla muestra desafío                                   │
│    3. Alumno escanea tarjeta RFID                                │
│    4. Sistema valida automáticamente                             │
│    5. Feedback visual/sonoro en pantalla                         │
│    6. Métricas actualizadas en BD                                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Estado Actual del Código

### Cambios Implementados (24 Nov 2025)

1. **`authController.register()`**
   - ✅ Solo registra profesores (role='teacher' hardcoded)
   - ✅ Requiere email y password
   - ✅ Genera tokens automáticamente

2. **`authController.login()`**
   - ✅ Valida `role === 'teacher'` (alumnos no pueden hacer login)
   - ✅ Actualiza `lastLoginAt`

3. **`userController.createUser()`**
   - ✅ Solo crea alumnos (role='student' hardcoded)
   - ✅ Requiere autenticación como profesor
   - ✅ Asigna `createdBy` automáticamente
   - ❌ NO acepta email ni password

4. **`User.js` pre-save hook**
   - ✅ Validación estricta: profesores DEBEN tener email/password
   - ✅ Validación estricta: alumnos NO deben tener email/password
   - ✅ Validación: alumnos deben tener `createdBy`

5. **Validators (Zod)**
   - ✅ `registerTeacherSchema`: Solo para profesores (email/password obligatorios)
   - ✅ `createStudentSchema`: Solo para alumnos (SIN email/password, .strict())
   - ✅ Ambos usan `.strict()` para rechazar campos extra

6. **Rutas actualizadas**
   - ✅ `POST /api/auth/register` usa `registerTeacherSchema`
   - ✅ `POST /api/users` usa `createStudentSchema`

---

## 🎯 Conclusión

El código ahora respeta **completamente** el flujo de trabajo diseñado:

✅ **Profesores**: Auto-registro con credenciales, login, gestión completa
✅ **Alumnos**: Creados por profesores sin credenciales, solo RFID
✅ **Validación en 4 capas**: Zod → Controller → Modelo → Middleware
✅ **Separación clara**: Endpoints y schemas diferentes para cada rol

**No hay forma de que un alumno se registre o haga login en el sistema.**
