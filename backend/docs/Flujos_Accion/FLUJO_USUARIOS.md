# Flujo de Usuarios y Gobierno de Identidades (2026)

## 1) Objetivo funcional y decisión de gobierno

Este módulo define cómo se gobierna la identidad en el sistema RFID para evitar escalada de privilegios y mantener trazabilidad administrativa.

### Decisión vigente

- El **super_admin** concentra las acciones críticas de identidad.
- El **teacher** opera el dominio pedagógico (mazos, sesiones, juego), pero no administra identidades críticas.
- El **student** no tiene login.

### ¿Por qué esta decisión?

1. **Separación de responsabilidades**: reduce riesgo operativo en colegios (quién enseña ≠ quién administra identidad global).
2. **Seguridad por diseño**: limita superficie de abuso en endpoints de usuarios.
3. **Auditoría del TFG**: las decisiones de alta/aprobación/transferencia quedan concentradas en un rol explícito y revisable.

---

## 2) Matriz de responsabilidades por rol

| Capacidad | super_admin | teacher | student |
| --- | --- | --- | --- |
| Login web | ✅ | ✅ (si aprobado) | ❌ |
| Aprobar/rechazar docentes | ✅ | ❌ | ❌ |
| Crear/editar/eliminar alumnos | ✅ | ❌ | ❌ |
| Transferir alumnos entre docentes | ✅ | ❌ | ❌ |
| Crear/gestionar mazos y sesiones | ✅ | ✅ | ❌ |
| Participar en juego RFID | ❌ | Supervisa | ✅ |

> Nota: `super_admin` puede operar endpoints de dominio cuando su rol está permitido en rutas (`requireRole('teacher', 'super_admin')`).

---

## 3) Flujo de alta docente (teacher)

1. Registro público por `POST /api/auth/register`.
2. Se crea usuario `teacher` con `accountStatus: pending_approval`.
3. No se emiten tokens en el registro.
4. `super_admin` revisa pendientes en `GET /api/admin/pending`.
5. `super_admin` aprueba o rechaza:
   - `POST /api/admin/users/:id/approve`
   - `POST /api/admin/users/:id/reject`
6. Solo tras `approved` el docente puede hacer login.

### Regla de hardening

- Solo se acepta transición desde `pending_approval`.
- Se bloquean transiciones redundantes/ambiguas (`approved→approved`, `rejected→rejected`, etc.).

### ¿Por qué?

Porque forzar transición explícita desde pendiente mejora consistencia del proceso administrativo y evita estados “tocados” sin significado de negocio.

---

## 4) Flujo de gestión de alumnos

### 4.1 Alta de alumno

**Endpoint**: `POST /api/users` (solo `super_admin`)

Contrato relevante:

- `teacherId` obligatorio.
- `profile.age` obligatorio (3-99).
- `email/password/role` no permitidos.

El backend fuerza `role='student'` y valida que `teacherId` apunte a un usuario con rol `teacher`.

### 4.2 Edición/Borrado de alumno

- `PUT /api/users/:id` y `DELETE /api/users/:id` son solo `super_admin`.
- `PUT` no permite reasignar ownership (`createdBy`).

### 4.3 Transferencia entre docentes

**Endpoint**: `POST /api/users/:id/transfer` (solo `super_admin`)

Requisitos:

- Alumno válido (`role='student'`).
- `newTeacherId` debe existir, ser `teacher` y `active`.
- `newClassroom` obligatorio.

### ¿Por qué separar update vs transfer?

Porque **cambio de datos** y **cambio de custodio pedagógico** son operaciones distintas con impacto distinto en auditoría. Mantener endpoint dedicado de transferencia evita modificaciones laterales de ownership por rutas genéricas.

---

## 5) Login y estado de cuenta

Para roles con login (`teacher`, `super_admin`):

- `status` debe estar activo.
- `accountStatus` debe estar aprobado para entrar en la plataforma.

Errores esperados:

- `401` para credenciales inválidas/estado no válido.
- `403` para cuenta pendiente o rechazada.

---

## 6) Validaciones por capas (resumen de arquitectura)

### Capa 1: Ruta + RBAC

- `requireRole(...)` restringe quién puede alcanzar cada operación.

### Capa 2: Esquemas Zod

- `createStudentSchema` exige contrato estricto de alta.
- `transferStudentSchema` exige body mínimo y consistente.

### Capa 3: Lógica de negocio (controllers/services)

- Verificación de rol objetivo (`teacher` en aprobación).
- Verificación de estado fuente (`pending_approval`).
- Verificación de existencia y estado del profesor destino.

### ¿Por qué defensa en profundidad?

Porque cada capa captura errores distintos: autorización temprana, contrato de entrada y reglas de negocio contextual. En conjunto disminuyen bypasses y regresiones.

---

## 7) Contrato de respuesta para frontend (evitar regresiones)

Los listados paginados responden con:

- `data`: array de recursos DTO.
- `pagination`: metadatos de página.

Este contrato se usa en:

- `GET /api/admin/pending`
- `GET /api/users`

### ¿Por qué se explicita aquí?

Porque la capa FE depende de esta estructura para tabla, contadores y navegación de página. Documentarlo evita errores típicos de parseo (ej. consumir `response.data.data` cuando se requiere también `pagination`).

---

## 8) Diagrama de flujo (alto nivel)

```text
┌─────────────────────────────────────────────────────────────────┐
│ REGISTRO DOCENTE                                                │
│ POST /api/auth/register                                         │
│ → teacher + accountStatus='pending_approval'                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ REVISIÓN ADMIN                                                  │
│ GET /api/admin/pending                                          │
│ POST /api/admin/users/:id/approve|reject                        │
│ (solo transición desde pending_approval)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ OPERACIÓN ACADÉMICA                                             │
│ teacher: mazos/sesiones/juego                                   │
│ super_admin: gestión de identidad de alumnos                    │
│  - POST/PUT/DELETE /api/users                                   │
│  - POST /api/users/:id/transfer                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9) Conclusión

- ✅ El gobierno de identidad está centralizado en `super_admin`.
- ✅ Se mantiene capacidad docente en dominio pedagógico sin privilegios críticos sobre usuarios.
- ✅ Las decisiones quedan justificadas por seguridad, trazabilidad y mantenibilidad del sistema para contexto TFG.
