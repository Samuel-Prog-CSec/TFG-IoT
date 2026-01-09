# Sprint 3 - Plan de Tareas

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Duración:** 3-4 semanas (Enero 2026)  
**Versión objetivo:** 0.3.0  
**Última actualización:** 09-01-2026

---

## Resumen del Sprint

Este sprint representa un salto de calidad significativo ("Hardening") además de la integración final del Frontend. Se introducen capas de arquitectura profesional (DTOs, Validadores Zod Centralizados) y se resuelven dudas funcionales críticas de Diciembre.

---

## P0 - Prioridad Crítica (Bloqueantes)

### T-021: Integración Frontend con API REST 📋

**Prioridad:** P0 | **Tamaño:** XL | **Dependencias:** Sprint 2
**Descripción:** Conectar la UI con el backend real, eliminando `mockApi.js`.
**Sub-tareas:**

1. Configurar cliente Axios (`services/api.js`) con manejo de errores y tokens.
2. Login/Logout real con persistencia y redirecciones.
3. CRUD real de Alumnos, Tarjetas y Sesiones en el frontend.
4. Manejo elegante de estados `loading`/`error`.

### T-032: Hardening de Validación con Zod (Audit #01) 📋

**Prioridad:** P0 | **Tamaño:** L | **Dependencias:** Ninguna
**Descripción:** Implementar validación estricta en **todos** los endpoints.
**Sub-tareas:**

1. Crear `middlewares/validation.js` genérico.
2. Completar esquemas en `validators/`.
3. Aplicar middleware en rutas `plays.js`, `sessions.js`, `cards.js`.

### T-041: Capa de Transformación DTOs (Audit #04) 📋

**Prioridad:** P0 | **Tamaño:** M | **Dependencias:** Ninguna
**Descripción:** Evitar la exposición de datos sensibles mediante Data Transfer Objects.
**Sub-tareas:**

1. Crear `utils/dtos.js`.
2. Refactorizar controllers para devolver DTOs (no Mongoose docs).
3. Asegurar eliminación de `password` y `__v`.

---

## P1 - Prioridad Alta (Seguridad & Funcionalidad Core)

### T-042: Aprobación de Profesores (Super Admin) (Frontend) (Duda #51) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** Ninguna
**Descripción:** Los nuevos profesores se registran con estado `pending_approval` y requieren validación de un Super Admin para acceder.
**Sub-tareas:**

1. Cambiar default `accountStatus` a `pending_approval`.
2. Bloquear Login si `accountStatus !== 'approved'`.
3. Endpoint `GET /api/admin/pending` (Super Admin).
4. Endpoint `POST /api/admin/approve/:id` (Super Admin).
5. UI para mostrar lista de profesores pendientes.
6. UI para aprobar/denegar profesores.

**Criterios de aceptación:**

1. Login bloqueado para profesores con `accountStatus !== 'approved'`.
2. Endpoint `GET /api/admin/pending` devuelve lista de profesores pendientes.
3. Endpoint `POST /api/admin/approve/:id` cambia estado a `approved`.
4. UI muestra lista de profesores pendientes con botones para aprobar/denegar.

### T-043: Sesión Única por Usuario (Frontend) (Duda #48) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-005 (Redis)
**Descripción:** Invalidar sesiones anteriores al hacer login en un nuevo dispositivo.
**Sub-tareas:**

1. Almacenar `socketId` o token familiar en Redis por `userId`.
2. Al hacer login, emitir evento `session_invalidated` a la conexión anterior.
3. Frontend redirige a login si recibe evento de invalidación.

### T-031: Migración a PinoJS (Logging) 📋

**Prioridad:** P1 | **Tamaño:** S | **Dependencias:** Ninguna
**Descripción:** Migrar logs a formato JSON estructurado.

### T-033: Dockerización Profesional (Audit #04-03) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** Ninguna
**Descripción:** Dockerfile Multi-stage y orquestación segura.

### T-009: Multi-Sensor RFID 📋

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-005
**Descripción:** Soporte para múltiples lectores independizados por `sensorId`.

### T-035: Gestión de Mazos (Frontend) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-021
**Descripción:** UI para crear/editar mazos de cartas.

### T-036: Asistente de Sesión Mejorado 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-035
**Descripción:** Wizard de creación de sesión usando Mazos y Contextos.

### T-038: E2E Tests (Frontend) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-021
**Descripción:** Tests Cypress/Playwright para flujos críticos.

---

## P2 - Prioridad Media (Mejoras)

### T-027: Orden Aleatorio de Rondas - Duda #28 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Sprint 2
**Descripción:** Asegurar que las rondas se presentan en orden aleatorio y no secuencial.
**Sub-tareas:**

1. Implementar función `shuffle` en `GameEngine` al iniciar partida.
2. Verificar que el algoritmo de aleatoriedad es robusto.

### T-034: Swagger API Docs 📋

**Prioridad:** P2 | **Tamaño:** L | **Dependencias:** T-032
**Descripción:** Documentación OpenAPI 3.0 interactiva.

### T-037: Replicar Sesión 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** T-021
**Descripción:** Botón "Volver a jugar" para clonar configuración.

### T-007: GDPR Anonimización 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** Ninguna
**Descripción:** Endpoint para anonimizar alumnos (Derecho al olvido).

### T-039: Sentry Setup Completo 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Ninguna
**Descripción:** Error Boundary en Frontend y Tracing.

### T-010: Modos RFID (Control Flujo) 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** T-009
**Descripción:** Prevenir lecturas accidentales fuera de juego.

---

## P3 - Prioridad Baja

### T-040: UI/UX Polish 📋

Mejoras visuales y feedback.

### T-023: Staging Environment 📋

Documentación de despliegue pre-prod.

---

## Checklist de Calidad

- [ ] Todos los endpoints públicos validados con Zod
- [ ] Ningún endpoint devuelve `password` o `__v`
- [ ] Logs en formato JSON
- [ ] Teachers nuevos requieren aprobación manual
- [ ] Login invalida sesiones anteriores del mismo usuario
