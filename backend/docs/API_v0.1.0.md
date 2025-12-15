# Documentación de la API ("RFID Games Backend") - v0.1.0

Este documento detalla los endpoints de la API REST para el Backend de Juegos Educativos RFID.

**URL Base:** `/api`
**Versión:** 0.1.0

## Autenticación y Seguridad

### Cabeceras (Headers)
*   **Authorization:** `Bearer <token>` (Requerido para rutas protegidas)
*   **X-CSRF-Token:** Requerido para métodos POST/PUT/DELETE.
*   **Límites de Velocidad (Rate Limits):**
    *   **Global:** 100 peticiones / 15 min
    *   **Auth:** 5 peticiones / 15 min
    *   **Creación:** 10 creaciones / 1 min (Sesiones, Contextos, etc.)

---

## Endpoints

### 1. Autenticación (`/auth`)

| Método | Endpoint          | Descripción | Acceso | Rate Limit |
|:-------|:------------------|:------------|:-------|:-----------|
| `POST` | `/register`       | Registrar nuevo profesor | Público | 5/15m |
| `POST` | `/login`          | Login de profesor | Público | 5/15m |
| `POST` | `/refresh`        | Refrescar access token | Público | - |
| `POST` | `/logout`         | Cerrar sesión y revocar tokens | Privado | - |
| `GET`  | `/me`             | Obtener perfil actual | Privado | - |
| `PUT`  | `/me`             | Actualizar perfil actual | Privado | - |
| `PUT`  | `/change-password`| Cambiar contraseña | Privado | - |

**Cuerpo de la Petición (Registro):**
```json
{
  "name": "Nombre Profesor",
  "email": "profesor@email.com",
  "password": "contraseñaSegura123"
}
```

---

### 2. Usuarios (`/users`)

| Método | Endpoint | Descripción | Acceso |
|:-------|:---------|:------------|:-------|
| `GET` | `/` | Obtener lista de usuarios | Profesor |
| `GET` | `/:id` | Obtener usuario por ID | Privado |
| `POST` | `/` | Crear usuario ALUMNO | Profesor |
| `PUT` | `/:id` | Actualizar usuario | Privado |
| `DELETE` | `/:id` | Eliminar usuario (soft delete, borrado lógico) | Profesor |
| `GET` | `/:id/stats` | Obtener estadísticas del alumno | Privado |
| `GET` | `/teacher/:id/students` | Obtener alumnos de un profesor | Profesor |

**Cuerpo de la Petición (Crear Alumno):**
```json
{
  "name": "Nombre Alumno",
  "role": "student"
}
```

---

### 3. Tarjetas RFID (`/cards`)

| Método | Endpoint | Descripción | Acceso |
|:-------|:---------|:------------|:-------|
| `GET` | `/` | Listar todas las tarjetas | Profesor |
| `GET` | `/:id` | Obtener detalles de tarjeta | Profesor |
| `POST` | `/` | Registrar nueva tarjeta | Profesor |
| `POST` | `/batch` | Registrar tarjetas en lote | Profesor |
| `PUT` | `/:id` | Actualizar info de tarjeta | Profesor |
| `DELETE` | `/:id` | Eliminar tarjeta | Profesor |
| `GET` | `/stats` | Obtener estadísticas de uso | Profesor |

---

### 4. Mecánicas de Juego (`/mechanics`)

| Método | Endpoint | Descripción | Acceso |
|:-------|:---------|:------------|:-------|
| `GET` | `/` | Listar todas las mecánicas | Profesor |
| `GET` | `/active` | Listar mecánicas habilitadas | Público/Auth |
| `GET` | `/:id` | Obtener detalles de mecánica | Profesor |
| `POST` | `/` | Crear nueva mecánica | Profesor |
| `PUT` | `/:id` | Actualizar mecánica | Profesor |
| `DELETE` | `/:id` | Eliminar mecánica | Profesor |

---

### 5. Contextos de Juego (`/contexts`)

| Método | Endpoint | Descripción | Acceso |
|:-------|:---------|:------------|:-------|
| `GET` | `/` | Listar contextos | Profesor |
| `GET` | `/:id` | Obtener detalles de contexto | Profesor |
| `GET` | `/:id/assets` | Obtener recursos (assets) del contexto | Profesor |
| `POST` | `/` | Crear nuevo contexto | Profesor |
| `POST` | `/:id/assets` | Añadir recurso al contexto | Profesor |
| `PUT` | `/:id` | Actualizar contexto | Profesor |
| `DELETE` | `/:id` | Eliminar contexto | Profesor |
| `DELETE` | `/:id/assets/:key` | Eliminar recurso | Profesor |

**Estructura (Crear Contexto):**
```json
{
  "name": "Conceptos Básicos",
  "description": "Sumas sencillas",
  "mechanicId": "...",
  "assets": [...]
}
```

---

### 6. Sesiones de Juego (`/sessions`)

| Método | Endpoint | Descripción | Acceso |
|:-------|:---------|:------------|:-------|
| `GET` | `/` | Listar sesiones | Profesor |
| `GET` | `/:id` | Obtener detalles de sesión | Profesor |
| `POST` | `/` | Crear sesión | Profesor |
| `PUT` | `/:id` | Actualizar sesión | Profesor |
| `DELETE` | `/:id` | Eliminar sesión | Profesor |
| `POST` | `/:id/start` | Iniciar sesión | Profesor |
| `POST` | `/:id/pause` | Pausar sesión | Profesor |
| `POST` | `/:id/end` | Finalizar sesión | Profesor |

**Ciclo de Vida de la Sesión:**
1. **Crear:** Define el mapeo (Tarjetas <-> Recursos/Valores) y Configuración (Rondas, Tiempo).
2. **Iniciar:** Inicializa el `GameEngine` para esta sesión.
3. **Finalizar:** Cierra métricas y libera recursos.

---

### 7. Partidas (`/plays`)

| Método | Endpoint | Descripción | Acceso |
|:-------|:---------|:------------|:-------|
| `GET` | `/` | Listar historial de partidas | Privado |
| `GET` | `/:id` | Obtener partida específica | Privado |
| `GET` | `/stats/:playerId` | Obtener estadísticas de jugador | Privado |
| `POST` | `/` | Iniciar nueva instancia de partida | Profesor |
| `POST` | `/:id/events` | Registrar evento de juego | Privado |
| `POST` | `/:id/complete` | Marcar partida como completada | Privado |
| `POST` | `/:id/abandon` | Marcar partida como abandonada | Privado |

---

## Eventos WebSocket (Socket.IO)

**Namespace:** `/`

| Evento | Dirección | Descripción | Datos |
|:-------|:----------|:------------|:-----|
| `join_play` | Cliente -> Servidor | Unirse a la sala de juego | `{ playId }` |
| `start_play` | Cliente -> Servidor | Comenzar partida | `{ playId }` |
| `play_state` | Servidor -> Cliente | Estado inicial | `{ currentRound, score }` |
| `new_round` | Servidor -> Cliente | Nuevo desafío | `{ challenge, timeLimit }` |
| `validation_result` | Servidor -> Cliente | Resultado respuesta | `{ isCorrect, points, newScore }` |
| `rfid_event` | Servidor -> Cliente | Tarjeta escaneada | `{ uid, type }` |

---
*Generado: 15-12-2025*
