# Flujo de Usuarios: Super Admin vs Profesores vs Alumnos

## 📋 Resumen Ejecutivo

El sistema contempla **tres roles** con interacción distinta:

| Aspecto | Super Admin (`super_admin`) | Profesores (`teacher`) | Alumnos (`student`) |
| --- | --- | --- | --- |
| **Acceso a la app** | ✅ Sí (email/password) | ✅ Sí (email/password) | ❌ No |
| **Registro** | Seeder / alta inicial | Auto-registro en `/api/auth/register` (queda pendiente) | Creados por profesores en `/api/users` |
| **Login** | ✅ Sí (`/api/auth/login`) | ✅ Sí (`/api/auth/login`) **solo si aprobado** | ❌ No |
| **Estado adicional** | `accountStatus` (normalmente `approved`) | `accountStatus`: `pending_approval` → `approved`/`rejected` | No aplica |
| **Responsabilidad** | Aprobar/rechazar profesores | Gestionar juego (sesiones, mazos, alumnos, partidas) | Jugar con RFID |

Clave del flujo actual:

- El registro de profesor crea una cuenta con `accountStatus: 'pending_approval'`.
- El profesor **no puede iniciar sesión** hasta que un Super Admin lo apruebe.

---

## 🧑‍⚖️ Flujo de Super Admin

### 1. Login de Super Admin

**Endpoint**: `POST /api/auth/login`

**Body**:

```json
{
  "email": "admin@test.com",
  "password": "Admin1234!"
}
```

**Validación (alto nivel)**:

- ✅ Usuario existe
- ✅ `role` es `super_admin`
- ✅ `status` es `active`
- ✅ `accountStatus` es `approved`
- ✅ Password correcta

**Respuesta** (200):

```json
{
  "success": true,
  "message": "Login exitoso",
  "data": {
    "user": {
      "id": "...",
      "name": "...",
      "email": "admin@test.com",
      "role": "super_admin",
      "status": "active",
      "accountStatus": "approved"
    },
    "accessToken": "...",
    "accessTokenExpiry": "..."
  }
}
```

**Nota:** el `refreshToken` se entrega únicamente vía cookie `httpOnly` y no se expone en el body.

### 2. Aprobar / Rechazar profesores

**Endpoints (solo Super Admin)**:

- `POST /api/admin/users/:id/approve`
- `POST /api/admin/users/:id/reject`

**Headers**:

```text
Authorization: Bearer <accessToken>
```

**Reglas**:

- ✅ Solo se pueden aprobar/rechazar usuarios con `role: 'teacher'`.
- ✅ Cambia `accountStatus` a `approved` o `rejected`.

---

## 🎓 Flujo de Profesores

### 1. Registro de Profesor (público, queda pendiente)

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

**Resultado**:

- ✅ Se crea `role: 'teacher'`, `status: 'active'`.
- ✅ Se crea `accountStatus: 'pending_approval'`.
- ❌ NO se emiten tokens en el registro.

**Respuesta** (201):

```json
{
  "success": true,
  "message": "Profesor registrado. Cuenta pendiente de aprobación por Super Admin.",
  "data": {
    "user": {
      "id": "...",
      "name": "María García",
      "email": "maria.garcia@colegio.es",
      "role": "teacher",
      "status": "active",
      "accountStatus": "pending_approval"
    }
  }
}
```

### 2. Login de Profesor (solo si aprobado)

**Endpoint**: `POST /api/auth/login`

**Body**:

```json
{
  "email": "maria.garcia@colegio.es",
  "password": "Secure123"
}
```

**Reglas de autenticación**:

- ✅ Solo pueden iniciar sesión `teacher` y `super_admin`.
- ✅ `status` debe ser `active`.
- ✅ Para roles con login: `accountStatus` debe ser `approved`.

**Errores canónicos usados en el proyecto**:

- `401 Unauthorized`: credenciales inválidas o usuario inactivo.
- `403 Forbidden`: credenciales correctas pero cuenta `pending_approval` o `rejected`.

**Ejemplo de cuenta pendiente** (403):

```json
{
  "success": false,
  "message": "Cuenta pendiente de aprobación"
}
```

### 3. Gestión de la aplicación (tras login)

Con `Authorization: Bearer <accessToken>`, un profesor puede:

- ✅ Crear alumnos (`POST /api/users`)
- ✅ Crear/gestionar mazos (`/api/decks`)
- ✅ Crear sesiones (`POST /api/sessions`) y asignar partidas (`POST /api/plays`)
- ✅ Ver estadísticas de alumnos (`GET /api/users/:id/stats`)

---

## 👶 Flujo de Alumnos (sin login)

### 1. Creación de Alumno por Profesor

**Endpoint**: `POST /api/users` (requiere autenticación como profesor)

**Headers**:

```text
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

**Reglas**:

- ✅ Se fuerza `role: 'student'`.
- ✅ Se asigna `createdBy` al profesor autenticado.
- ❌ Un alumno NO puede tener `email` ni `password`.

### 2. Juego del alumno

El alumno NO usa la app web. El flujo es:

1. Profesor prepara sesión y partida.
2. Alumno escanea RFID.
3. Backend valida y emite eventos por WebSocket.
4. Se registran eventos/métricas y se actualiza `studentMetrics`.

---

## 🔒 Validaciones Implementadas (resumen)

### Nivel 1: Validación de entrada (Zod)

- `registerTeacherSchema`: permite `name/email/password/profile` y rechaza campos extra.
- `createStudentSchema`: permite `name/profile` y rechaza `email/password/role`.

### Nivel 2: Controllers (lógica)

- `authController.register`: crea `teacher` con `accountStatus: 'pending_approval'`.
- `authController.login`: solo `teacher/super_admin` y exige `accountStatus: 'approved'`.
- `adminController`: solo `super_admin` puede aprobar/rechazar `teacher`.

### Nivel 3: Modelo (Mongoose)

- `teacher/super_admin`: requieren `email/password` (password hasheada por hook).
- `student`: prohíbe `email/password` y exige `createdBy` al crear.

---

## 📊 Diagrama de Flujo (alto nivel)

```text
┌─────────────────────────────────────────────────────────────────┐
│                        REGISTRO PROFESOR                         │
├─────────────────────────────────────────────────────────────────┤
│ POST /api/auth/register                                          │
│ { name, email, password, profile? }                              │
│   ↓                                                              │
│ ✅ teacher creado con accountStatus='pending_approval'            │
│ ❌ sin tokens                                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          APROBACIÓN                              │
├─────────────────────────────────────────────────────────────────┤
│ Super Admin: POST /api/admin/users/:id/approve|reject            │
│   ↓                                                              │
│ ✅ teacher pasa a 'approved' o 'rejected'                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                           LOGIN                                  │
├─────────────────────────────────────────────────────────────────┤
│ POST /api/auth/login                                             │
│ { email, password }                                              │
│   ↓                                                              │
│ ✅ tokens si accountStatus='approved'                             │
│ ❌ 403 si pending/rejected                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Conclusión

- ✅ No existe login para alumnos.
- ✅ Los profesores no pueden acceder hasta ser aprobados.
- ✅ El Super Admin es el único que puede aprobar/rechazar profesores.
<!-- (línea residual eliminada) -->
