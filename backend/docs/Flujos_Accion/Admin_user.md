# Flujo Super Admin (Aprobación de Profesores)

## Roles

- `super_admin`: valida (aprueba/rechaza) profesores.
- `teacher`: profesor con login (requiere aprobación).
- `student`: alumno (sin login).

## Estado de cuenta (`accountStatus`)

Campo aplicable a usuarios con login (`teacher`, `super_admin`):

- `pending_approval`: pendiente de aprobación.
- `approved`: aprobado.
- `rejected`: rechazado.

## Flujo implementado

1. El profesor se registra en `POST /api/auth/register`.
2. El backend crea el usuario con `role=teacher` y `accountStatus=pending_approval`.
3. El profesor NO puede iniciar sesión hasta ser aprobado.
4. El super admin lista pendientes con `GET /api/admin/pending` (paginado + búsqueda).
5. El super admin aprueba o rechaza:
	- `POST /api/admin/users/:id/approve` → `accountStatus=approved`
	- `POST /api/admin/users/:id/reject` → `accountStatus=rejected`
6. El backend exige que el profesor esté en estado `pending_approval` para ejecutar la transición.
7. Una vez aprobado, el profesor puede hacer login normalmente en `POST /api/auth/login`.

## Notas

- Los endpoints `/api/admin/*` están protegidos con autenticación + rol `super_admin`.
- Solo se permite aprobar/rechazar usuarios con `role=teacher`.
- No se permiten transiciones redundantes (`approved→approved`, `rejected→rejected`, etc.).
- Racional de seguridad: evitar mutaciones de estado no idempotentes semánticamente ambiguas y mantener trazabilidad clara del proceso de alta docente.