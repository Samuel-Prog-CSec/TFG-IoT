# Requisitos Funcionales - Gestión de Usuarios

## RF-USR: Gestión de Usuarios del Sistema

---

### RF-USR-001: Registro de Profesores ✅

**Descripción:** El sistema debe permitir el registro de usuarios con rol "profesor" mediante email y contraseña.

**Criterios de Aceptación:**
- El email debe ser único en el sistema
- La contraseña debe tener mínimo 6 caracteres
- El nombre es obligatorio (2-100 caracteres)
- El sistema debe encriptar la contraseña con bcrypt (10 rounds)
- El rol se asigna automáticamente como "teacher"

**Endpoint:** `POST /api/auth/register`

**Datos de Entrada:**
```json
{
  "name": "string (2-100 chars)",
  "email": "string (email válido)",
  "password": "string (min 6 chars)"
}
```

**Datos de Salida:**
```json
{
  "success": true,
  "data": {
    "user": { "id", "name", "email", "role" },
    "accessToken": "string",
    "refreshToken": "string"
  }
}
```

---

### RF-USR-002: Inicio de Sesión de Profesores ✅

**Descripción:** El sistema debe permitir el inicio de sesión de profesores mediante email y contraseña.

**Criterios de Aceptación:**
- Validar credenciales contra la base de datos
- Generar par de tokens JWT (access + refresh)
- Actualizar campo `lastLoginAt` del usuario
- Implementar device fingerprinting para seguridad

**Endpoint:** `POST /api/auth/login`

---

### RF-USR-003: Cierre de Sesión ✅

**Descripción:** El sistema debe permitir cerrar sesión revocando los tokens activos.

**Criterios de Aceptación:**
- Añadir access token a blacklist
- Opcionalmente revocar refresh token si se proporciona
- Tokens revocados no pueden usarse hasta su expiración natural

**Endpoint:** `POST /api/auth/logout`

---

### RF-USR-004: Renovación de Token ✅

**Descripción:** El sistema debe permitir renovar el access token usando un refresh token válido.

**Criterios de Aceptación:**
- Verificar validez del refresh token
- Verificar fingerprint del dispositivo
- Generar nuevo par de tokens (rotación)
- Revocar el refresh token anterior

**Endpoint:** `POST /api/auth/refresh`

---

### RF-USR-005: Consulta de Perfil Propio ✅

**Descripción:** Un profesor autenticado debe poder consultar su información de perfil.

**Criterios de Aceptación:**
- Retornar datos del usuario sin contraseña
- Requiere autenticación JWT

**Endpoint:** `GET /api/auth/me`

---

### RF-USR-006: Actualización de Perfil Propio ✅

**Descripción:** Un profesor autenticado debe poder actualizar su información de perfil.

**Criterios de Aceptación:**
- Permitir actualizar nombre y avatar
- No permitir cambiar email ni rol
- Validar datos de entrada

**Endpoint:** `PUT /api/auth/me`

---

### RF-USR-007: Cambio de Contraseña ✅

**Descripción:** Un profesor autenticado debe poder cambiar su contraseña.

**Criterios de Aceptación:**
- Verificar contraseña actual
- Validar nueva contraseña (mínimo 6 caracteres)
- Encriptar y guardar nueva contraseña

**Endpoint:** `PUT /api/auth/change-password`

---

### RF-USR-008: Creación de Alumnos ✅

**Descripción:** Un profesor debe poder crear usuarios alumnos SIN credenciales de acceso.

**Criterios de Aceptación:**
- Los alumnos NO tienen email ni contraseña
- Campo `createdBy` se asigna automáticamente al profesor que crea
- Validar que no exista alumno activo con mismo nombre en la misma clase del mismo profesor
- Campos requeridos: nombre
- Campos opcionales: edad (3-99), aula, fecha de nacimiento

**Endpoint:** `POST /api/users`

**Datos de Entrada:**
```json
{
  "name": "string (2-100 chars)",
  "profile": {
    "age": "number (3-99, opcional)",
    "classroom": "string (opcional)",
    "birthdate": "date (opcional)"
  }
}
```

**Restricciones:**
- El email NO debe proporcionarse para alumnos
- La contraseña NO debe proporcionarse para alumnos
- El rol se asigna automáticamente como "student"

---

### RF-USR-009: Listado de Usuarios ✅

**Descripción:** Un profesor debe poder listar usuarios del sistema.

**Criterios de Aceptación:**
- Soportar filtros por rol, estado, aula
- Implementar paginación
- Solo accesible por profesores

**Endpoint:** `GET /api/users`

---

### RF-USR-010: Consulta de Usuario Individual ✅

**Descripción:** Un profesor debe poder consultar los detalles de un usuario específico.

**Criterios de Aceptación:**
- Retornar información completa del usuario (sin contraseña)
- Incluir métricas si es alumno

**Endpoint:** `GET /api/users/:id`

---

### RF-USR-011: Actualización de Alumno ✅

**Descripción:** Un profesor debe poder actualizar la información de un alumno.

**Criterios de Aceptación:**
- Permitir cambiar nombre, aula, edad, profesor asignado
- Validar duplicados de nombre en la misma clase
- No permitir añadir email/password a alumnos

**Endpoint:** `PUT /api/users/:id`

**Casos de Uso:**
- Cambio de clase: `{ "profile": { "classroom": "B" } }`
- Cambio de profesor: `{ "createdBy": "<nuevoProfesorId>" }`
- Corrección de nombre: `{ "name": "Nombre Correcto" }`

---

### RF-USR-012: Desactivación de Usuario ✅

**Descripción:** Un profesor debe poder desactivar un usuario (soft delete).

**Criterios de Aceptación:**
- Cambiar estado a "inactive"
- El usuario desactivado no puede participar en partidas
- Mantener historial de partidas anteriores

**Endpoint:** `DELETE /api/users/:id`

---

### RF-USR-013: Consulta de Estadísticas de Alumno ✅

**Descripción:** Un profesor debe poder consultar las métricas de aprendizaje de un alumno.

**Criterios de Aceptación:**
- Retornar: totalGamesPlayed, totalScore, averageScore, bestScore
- Retornar: totalCorrectAnswers, totalErrors, averageResponseTime
- Retornar: lastPlayedAt

**Endpoint:** `GET /api/users/:id/stats`

---

### RF-USR-014: Listado de Alumnos por Profesor ✅

**Descripción:** Un profesor debe poder listar todos los alumnos que ha creado.

**Criterios de Aceptación:**
- Filtrar por campo `createdBy`
- Soportar ordenamiento y paginación

**Endpoint:** `GET /api/users/teacher/:teacherId/students`

---

### RF-USR-015: Actualización Automática de Métricas ✅

**Descripción:** El sistema debe actualizar automáticamente las métricas del alumno al completar una partida.

**Criterios de Aceptación:**
- Incrementar totalGamesPlayed
- Actualizar totalScore, averageScore, bestScore
- Actualizar totalCorrectAnswers, totalErrors
- Recalcular averageResponseTime (promedio ponderado)
- Actualizar lastPlayedAt

**Método:** `User.updateStudentMetrics(playResults)`

**Datos de Entrada:**
```javascript
{
  score: Number,
  correctAttempts: Number,
  errorAttempts: Number,
  averageResponseTime: Number // en milisegundos
}
```

