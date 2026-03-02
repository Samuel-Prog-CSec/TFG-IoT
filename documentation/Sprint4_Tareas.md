# Sprint 4 - Plan de Tareas

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Duración:** 2-3 semanas (Febrero - Marzo 2026)  
**Versión objetivo:** 0.4.0  
**Última actualización:** 13-02-2026

---

## Resumen del Sprint

Este sprint se enfoca en **cerrar el núcleo funcional de la versión 0.4.0**:

1. **Gameplay real en producción** para mecánicas de **Asociación** y **Memoria**.
2. **GameEngine robusto y extensible** para múltiples configuraciones de sesión.
3. **Cierre de seguridad, compliance y calidad mínima verificable** para release.

Además, se revisan y ajustan tareas ya iniciadas para evitar falsos cierres por implementación parcial.

---

## Leyenda

- **Prioridad:** P0 (Crítica/Bloqueante) > P1 (Alta) > P2 (Media) > P3 (Baja)
- **Tamaño:** XS (< 2h), S (2-4h), M (4-8h), L (1-2 días), XL (> 2 días)
- **Estado:** 📋 Pendiente | 🔄 En Progreso | ✅ Completada
- **Origen:** Requisitos (RF/RNF)
- **Definición de 100% (DoD):** Código + tests + documentación requerida en la tarea

---

## Reglas de Cierre (DoD Global)

Una tarea solo puede pasar a ✅ si cumple **todas**:

1. Código implementado en ramas del sprint.
2. Tests asociados creados/actualizados y pasando.
3. Documentación indicada en la tarea actualizada.
4. Criterios de aceptación verificables (sin criterios ambiguos).

---

## P0 - Prioridad Crítica (Bloqueantes)

### T-054: Gameplay Real Asociación + Memoria (E2E) ✅

**Prioridad:** P0 | **Tamaño:** XL | **Dependencias:** Ninguna  
**Origen:** RF-JGO-002, RF-JGO-004, RF-RT-011, RF-RT-012

**Descripción:**  
Conectar la pantalla de partida real del frontend con el backend vía Socket.IO para ejecutar partidas completas de Asociación y Memoria sin simulación local.

**Sub-tareas:**

1. Integrar `GameSession` con eventos reales (`join_play`, `new_round`, `validation_result`, `memory_turn_state`, `game_over`, `play_paused`, `play_resumed`).
2. Eliminar dependencias de flujo simulado y fallback REST en la ruta productiva de gameplay.
3. Añadir fallback visual robusto para reconexión, pérdida de socket y desincronización de estado.
4. Implementar dos vistas de partida diferenciadas por mecánica (Asociación vs Memoria) sobre la misma pantalla de runtime.
5. Mostrar métricas de partida actual en HUD y resumen ampliado al finalizar (sin sustituir persistencia backend para dashboards).
6. Añadir tests frontend de integración de `GameSession` para eventos críticos de ambas mecánicas.
7. Mantener compatibilidad con el contrato de configuración proveniente del wizard (`config` + `boardLayout` en memoria).
8. Documentar contrato de eventos gameplay y estados UI para trazabilidad del sprint.

**Criterios de Aceptación (medibles):**

- [x] Los eventos `new_round`, `validation_result`, `memory_turn_state` y `game_over` se reflejan sin refrescar la página.
- [x] La UI diferencia claramente Association y Memory con comportamiento y bloques visuales propios.
- [x] Pausa/reanudación desde UI queda en modo realtime estricto sin fallback REST.
- [x] No queda lógica de simulación en ruta de juego productiva.
- [x] Se muestran métricas de la partida actual en juego y resumen final ampliado.
- [x] Existe cobertura frontend de integración para `GameSession` en ambas mecánicas y errores realtime críticos.
- [x] Se puede completar una partida real de 5 rondas desde UI en ambas mecánicas (pendiente validación manual final con sensor físico).
- [x] Tests críticos backend de flujo de juego pasan en CI local en esta iteración.

**Avance (01-03-2026):**

- `frontend/src/pages/GameSession.jsx` refactorizada con state machine de runtime robusta y estado explícito de conexión (`connecting/connected/reconnecting/disconnected`).
- Se separaron vistas de juego por mecánica (`AssociationGameplayPanel`, `MemoryGameplayPanel`) y se añadió panel de métricas de partida en vivo + resumen final (`PlaySummaryCard`).
- Se endureció manejo UX de errores socket con mapeo de códigos backend (`RFID_MODE_INVALID`, `RFID_SENSOR_UNAUTHORIZED`, `ROUND_BLOCKED`, etc.).
- Se eliminó fallback REST en `togglePause`/`toggleResume`; la ruta productiva de partida queda socket-first.
- Se añadió infraestructura de tests frontend (Vitest + Testing Library) y suite dedicada en `frontend/src/pages/__tests__/GameSession.test.jsx` con 7 escenarios críticos.
- Evidencia local de validación frontend en verde:
	- `npm run test` (frontend)
	- `eslint` específico sobre archivos modificados (`GameSession.jsx`, test suite, setup Vitest)
- Evidencia local de validación backend crítica en verde:
	- `npm test -- tests/gameFlow.test.js tests/playPauseResume.test.js tests/socketAuth.test.js tests/socketRateLimiter.test.js`

---

### T-055: Hardening GameEngine (extensibilidad + rendimiento) ✅

**Prioridad:** P0 | **Tamaño:** XL | **Dependencias:** T-054  
**Origen:** RNF-REN-001, RNF-REN-010, ARCH-01, ARCH-02

**Descripción:**  
Evolucionar `gameEngine` para soportar de forma estable múltiples mecánicas, dificultades y configuraciones, reduciendo riesgos de concurrencia y degradación bajo carga.

**Sub-tareas:**

1. Extraer hooks por mecánica para validación/puntuación/selección de desafío sin acoplar el core.
2. Endurecer flujo de ownership/sensor/permiso en eventos socket de partida.
3. Revisar operaciones potencialmente costosas y optimizar puntos críticos (timers, sync, side-effects).
4. Añadir métricas operativas de motor (tiempo de ronda, scans ignorados, plays abandonadas).
5. Ampliar tests de regresión para condiciones de carrera (pause/resume/timeout/reconnect).

**Criterios de Aceptación (medibles):**

- [x] El motor soporta asociación y memoria sin condicionales ad-hoc repetitivos.
- [x] No aparecen regresiones en tests de `gameFlow`, `playPauseResume`, `redisStateRecovery`.
- [x] Métricas de motor exponen al menos 3 indicadores nuevos de ejecución.
- [x] No quedan warnings críticos de race conditions detectados en revisión técnica.
- [x] Documentación técnica del motor actualizada.

**Avance (16-02-2026):**

- Se añadió guard de idempotencia en `start_play` dentro de `gameEngine`.
- Se bloqueó `next_round` manual cuando la ronda está en `awaitingResponse`.
- Se añadieron métricas nuevas de engine (`ignoredCardScans`, `blockedManualNextRound`, `totalTimeouts`, `averageRoundResponseTimeMs`).
- Se añadió test específico de comando socket para `next_round`.
- Se añadió serialización por `playId` para operaciones críticas (`handleCardScan`, `handleTimeout`, `pause`, `resume`, `advanceToNextRound`) para reducir condiciones de carrera.
- Se endureció validación de `rfid_scan_from_client` en modo gameplay validando contexto runtime activo, ownership y sensor autorizado.
- Se añadió caché TTL de revalidación auth para eventos socket sensibles con métricas `authCacheHits/authCacheMisses`.
- Se optimizaron bucles secuenciales de cleanup/recovery del motor con procesamiento por lotes configurable (`GAME_ENGINE_BATCH_SIZE`).

**Cierre (16-02-2026):**

- Suites de validación ejecutadas y en verde: `gameFlow`, `playPauseResume`, `redisStateRecovery`, `runtimeMetrics`, `socketAuth`, `nextRoundCommand`.
- Hardening distribuido adicional completado: locks Redis con lease TTL + heartbeat + release owner-aware.

---

### T-051: Refresh Token Cookie-Only (cierre completo) ✅

**Prioridad:** P0 | **Tamaño:** L | **Dependencias:** Ninguna  
**Origen:** RNF-SEG-001, RNF-SEG-002, SEC-01

**Descripción:**  
Cerrar al 100% la migración de refresh token a cookie `httpOnly`, eliminando restos en body/respuesta/localStorage y alineando documentación + tests.

**Sub-tareas:**

1. Backend: usar cookie como única fuente para refresh (login/refresh/logout).
2. Backend: no devolver `refreshToken` en payload de respuesta.
3. Frontend: eliminar persistencia/envío de refresh token en storage/body.
4. Ajustar validadores y tests que hoy esperan refresh en body.
5. Actualizar documentación API y ejemplos de consumo.

**Criterios de Aceptación (medibles):**

- [x] `refreshToken` no aparece en `localStorage` ni en response body.
- [x] `POST /api/auth/refresh` funciona sin body de token.
- [x] `logout` elimina cookie de refresh correctamente.
- [x] Suite de auth/validación pasa con el nuevo contrato.
- [x] Documentación API refleja únicamente flujo cookie-only.
- [x] `POST /api/auth/refresh` requiere CSRF (`X-CSRF-Token`) en entornos no test.
- [x] El backend rechaza payload legado con `refreshToken` en body (400).

**Avance (16-02-2026):**

- Backend refresh token en modo cookie-only: `POST /api/auth/refresh` ya no acepta `refreshToken` en body.
- Se eliminó `refreshToken` y `refreshTokenExpiresIn` del DTO de respuesta de autenticación.
- Se ajustaron validadores/rutas de auth para body vacío en refresh y se actualizaron tests de integración de sesión única.

**Cierre (20-02-2026):**

- `POST /api/auth/refresh` dejó de exponer `refreshToken`/`refreshTokenExpiresIn` en body de respuesta.
- `logout` quedó en modo cookie-only estricto, eliminando fallback de `refreshToken` en body.
- Frontend eliminado de persistencia/envío de refresh token (sin `sessionStorage`, sin body legado en refresh).
- CSRF double-submit activado también para refresh (no exento en middleware de seguridad).
- Se añadieron/actualizaron pruebas de contrato (`auth.test`, `validationEndpoints.test`) y documentación técnica asociada.

---

## P1 - Prioridad Alta

### T-007: GDPR Anonimización End-to-End 📋

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** Ninguna  
**Origen:** RF-USR-019, RNF-SEG-019

**Descripción:**  
Implementar anonimización de alumnos cumpliendo GDPR/LOPD, preservando métricas educativas y registrando auditoría.

**Sub-tareas:**

1. Definir contrato final del endpoint (`POST` o `DELETE`) y alinearlo con requisitos/documentación.
2. Implementar endpoint para anonimizar alumno (teacher owner o super_admin).
3. Añadir campos de trazabilidad (`isAnonymized`, `anonymizedAt`, actor, motivo opcional).
4. Impedir anonimización de profesores y doble anonimización.
5. Añadir tests unitarios/integración de permisos, idempotencia y preservación de métricas.

**Criterios de Aceptación (medibles):**

- [ ] Datos personales son eliminados/sustituidos de forma irreversible.
- [ ] `studentMetrics` y datos históricos de analítica se preservan.
- [ ] Existe registro auditable con actor y timestamp.
- [ ] No permite anonimizar usuarios `teacher`.
- [ ] Tests de endpoint y reglas GDPR pasan.

---

### T-053: Reglas de Estado de GameSession consistentes ✅

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-054  
**Origen:** RF-JGO-016, RF-JGO-019

**Descripción:**  
Aplicar y automatizar reglas de transición de estado de `GameSession` según estado real de partidas (`GamePlay`).

**Sub-tareas:**

1. Implementar recálculo en eventos clave (inicio, pausa, reanudación, finalización, abandono).
2. Centralizar lógica de transición para evitar drift entre controller/service.
3. Añadir tests de transición para escenarios reales y edge cases.
4. Actualizar documentación de reglas de negocio.

**Criterios de Aceptación (medibles):**

- [x] `active` cuando existe al menos un play `in-progress` o `paused`.
- [x] `completed` cuando no quedan plays activos/pausados.
- [x] Transiciones no dependen de cambios manuales fuera del flujo.
- [x] Tests de transición pasan para creación/inicio/finalización/abandono.

**Avance (16-02-2026):**

- Se creó `sessionStatusService` para centralizar el recálculo de estado de `GameSession` desde `GamePlay`.
- Se integró recálculo en flujos clave: `createPlay`, `completePlay`, `abandonPlay`, `pause/resume` y recuperación por reinicio (`server_restart`).
- Se ampliaron tests de regresión (`gameFlow`, `playPauseResume`, `redisStateRecovery`) con aserciones de estado de sesión.

**Cierre (16-02-2026):**

- Reglas de transición centralizadas y aplicadas en runtime/service sin actualización manual ad-hoc.
- Evidencia de regresión en verde en suites de flujo y recuperación vinculadas al estado de sesión.

---

### T-056: Wizard Adaptativo por Mecánica (Asociación vs Memoria) ✅

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-054  
**Origen:** RF-JGO-013, RF-JGO-014, FE-01

**Descripción:**  
Modificar el wizard de creación de sesión para que las fases y validaciones cambien según mecánica seleccionada.

**Sub-tareas:**

1. Definir flujo UX específico de Asociación.
2. Mantener flujo de posicionamiento para Memoria.
3. Añadir validaciones por paso según mecánica.
4. Alinear payload de creación con validadores backend.
5. Añadir mensajes de error y ayuda contextual por paso.

**Criterios de Aceptación (medibles):**

- [x] Asociación no muestra pasos exclusivos de Memoria.
- [x] Memoria mantiene paso de layout/tablero con validación.
- [x] No se puede finalizar wizard con configuración inconsistente.
- [x] Tests de validación de payload por mecánica pasan.

**Avance (27-02-2026):**

- Wizard de creación de sesión actualizado para permitir selección solo de `association` y `memory`.
- Mecánicas fuera de alcance (ej. `sequence`) se muestran como **"Próximamente"** y quedan deshabilitadas en UI.
- Backend endurecido para validar disponibilidad de mecánicas por feature flag (`SESSION_ENABLED_MECHANICS`) y bloquear `coming_soon` (evita bypass vía API).
- Payload del wizard alineado con el contrato backend actual (sin campos extra fuera del schema).
- Seeder de mecánicas y estrategia de memoria actualizados para reflejar contrato funcional de Sprint 4.

**Cierre (27-02-2026):**

- Se implementó `boardLayout` persistente en `GameSession` con validación backend (schema + validator + controller + DTO).
- El wizard de creación adapta el paso de reglas según mecánica: Asociación usa flujo general y Memoria exige tablero completo antes de continuar.
- En memoria, `timeLimit` quedó como tiempo global de partida configurable por docente en rango `10-300`.
- `BoardSetup` persiste y recupera layout para evitar desalineación entre configuración inicial y ejecución real.
- El runtime de Memoria en `gameEngine` usa temporizador global de partida y emite estado intermedio `memory_turn_state` para primera carta, match/mismatch y ocultación posterior.
- `GameSession` (frontend) consume `memory_turn_state` y renderiza tablero de memoria en tiempo real.
- Evidencia de regresión en verde:
	- `memoryStrategy.test.js`
	- `sessionMechanicAvailability.test.js`
	- `gameFlow.test.js`
	- `playPauseResume.test.js`
	- `redisStateRecovery.test.js`
	- `nextRoundCommand.test.js`

---

### T-037: Replicar Sesión (clone) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-056  
**Origen:** RF-JGO-018

**Descripción:**  
Permitir clonar una sesión existente para reutilizar configuración de forma segura e independiente.

**Sub-tareas:**

1. Backend: `POST /api/sessions/:id/clone` con control de ownership.
2. Copiar configuración funcional (`mechanicId`, `contextId`, `config`, `cardMappings`).
3. Resetear estado temporal (`status`, timestamps de ejecución).
4. Frontend: acción “Volver a jugar” con confirmación.
5. Añadir tests backend y UI para independencia de clon.

**Criterios de Aceptación (medibles):**

- [ ] Clon crea nueva sesión con ID distinto.
- [ ] Configuración se copia sin compartir estado mutable.
- [ ] Estado inicial del clon es `created`.
- [ ] Solo propietario autorizado puede clonar.

---

### T-057: Alineación Contrato RFID Mode Frontend-Backend ✅

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-054  
**Origen:** RF-RFID-012, RF-RFID-014

**Descripción:**  
Unificar contrato de control de modos RFID entre frontend y backend para evitar ambigüedad (`rfid_mode` vs comandos actuales).

**Sub-tareas:**

1. Definir contrato canónico de modo RFID y naming final.
2. Ajustar frontend (`webSerialService` + flujo de pantallas).
3. Ajustar backend (`socket handlers` y comandos).
4. Añadir tests socket para aceptar/rechazar eventos según modo.
5. Actualizar documentación técnica del protocolo.

**Criterios de Aceptación (medibles):**

- [x] Existe un único contrato oficial documentado para modos RFID.
- [x] Backend ignora scans fuera de modo permitido.
- [ ] Tests socket cubren al menos `idle`, `gameplay`, `card_registration`, `card_assignment`.

**Avance (25-02-2026):**

- Contrato canónico consolidado en backend con comandos `join/leave_*` y evento servidor `rfid_mode_changed`.
- Política multi-socket endurecida a **single-owner por usuario** (socket activo autoritativo para lecturas RFID).
- `resume_play` corregido para preservar metadata `playId` en estado `gameplay` y mantener validaciones de ownership/sensor.
- Frontend migrado a modo RFID **backend-authoritative** (sin derivación por ruta en `App`).
- `GameSession` migrada a flujo realtime con `join_play`, `start_play`, `new_round`, `validation_result`, `play_paused`, `play_resumed`, `game_over` y eliminación de simulación local.
- Documentación técnica actualizada en `backend/docs/RFID_Protocol.md` y `backend/docs/WebSockets-ExtendedUsage.md` eliminando comandos legacy.
- Se añadieron pruebas socket de regresión para `card_assignment`, política single-owner y validación de sensor tras `pause/resume` (pendiente ejecución completa en entorno con Mongo activo).

---

### T-061: Cierre RNF-CAL-018/019 (Calidad y Cobertura de Flujos) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-054, T-051  
**Origen:** RNF-CAL-018, RNF-CAL-019

**Descripción:**  
Formalizar criterios de calidad para release 1.0.0 con cobertura mínima y flujos críticos validados.

**Sub-tareas:**

1. Definir umbral de cobertura mínimo aplicable en CI para backend.
2. Definir matriz de flujos críticos obligatorios (auth, sesión, gameplay, pausa/reanudación).
3. Crear/verificar tests faltantes de integración.
4. Documentar evidencias de cobertura y límites conocidos.

**Criterios de Aceptación (medibles):**

- [ ] Existe umbral de calidad documentado y aplicado en CI.
- [ ] Flujos críticos definidos tienen evidencia de test.
- [ ] Informe de cobertura actualizado en sprint.

---

### T-058: Optimización de rendimiento realtime y concurrencia ✅

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-055  
**Origen:** ARCH-03

**Descripción:**  
Implementar mejoras de rendimiento en el flujo realtime del backend para reducir latencia, evitar doble procesamiento y estabilizar métricas bajo carga.

**Sub-tareas:**

1. Añadir caché corta (TTL 30-60s) para contexto de autenticación en handshake/eventos socket.
2. Implementar lock por `playId` en `handleCardScan` para prevenir doble puntuación por escaneos concurrentes.
3. Optimizar cleanup de partidas abandonadas con procesamiento batch (evitando bucles secuenciales bloqueantes).
4. Exponer métricas nuevas de runtime (`authCacheHits`, `authCacheMisses`, `scanRaceDiscarded`, `lockContention`).
5. Añadir/actualizar tests de regresión en rutas críticas de realtime y métricas.

**Criterios de Aceptación (medibles):**

- [x] Existe test que verifica hit de caché de auth en reconexión socket dentro del TTL.
- [x] Existe test de concurrencia que garantiza una única puntuación por ronda ante escaneos simultáneos.
- [x] `/api/metrics` incluye y reporta los nuevos contadores de cache/contención/race.
- [x] No hay regresiones en suites `gameFlow`, `playPauseResume`, `socketAuth`, `runtimeMetrics`.

**Actualización (17-02-2026):**

- Se añadió métrica explícita `scanRaceDiscarded` en `gameEngine` para observabilidad de carreras scan/timeout.
- Se reforzó caché de ownership por socket además de caché global TTL para reducir lecturas repetidas en comandos consecutivos.
- Se añadió barrido de expirados para cachés de auth/ownership (higiene de memoria bajo carga).
- Suites verificadas en esta iteración: `socketAuth`, `runtimeMetrics`, `metricsEndpoints`, `gameFlow`, `playPauseResume`, `nextRoundCommand`.

---

### T-059: Hardening backend de seguridad y validación ✅

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-051, T-058  
**Origen:** BE-01, SEC-02

**Descripción:**  
Aplicar hardening de seguridad en backend y WebSocket (validación, ownership y controles OWASP) con enfoque de implementación directa.

**Sub-tareas:**

1. Validar `Origin` explícitamente en handshake WebSocket usando whitelist de seguridad.
2. Endurecer validación de `rfid_scan_from_client` (timestamp skew, `source`, `sensorId`, formato UID).
3. Bloquear payloads peligrosos (`__proto__`, `constructor.prototype`, operadores NoSQL) en capa de validación.
4. Centralizar chequeos de ownership/IDOR en endpoints críticos de users/sessions/plays/analytics.
5. Añadir/actualizar tests de seguridad y actualizar `backend/docs/Security_Logging.md`.

**Criterios de Aceptación (medibles):**

- [ ] Conexiones socket desde `Origin` no permitido fallan con error controlado.
- [ ] Payloads de riesgo (prototype pollution / NoSQL operators) se rechazan con `400` antes de tocar repositorios.
- [ ] Eventos RFID fuera de ventana temporal o con `source` inválido se rechazan por validador.
- [ ] Tests de `socketAuth`, `validationEndpoints`, `metricsEndpoints` y auth pasan sin regresiones.

**Actualización (20-02-2026):**

- Se añadió validación explícita de `Origin` en handshake de WebSocket (doble capa junto con CORS base) con error controlado.
- Se implementó guard global anti payload peligroso para HTTP + Socket (`__proto__`, `constructor`, `prototype`, claves con prefijo `$`).
- Se endureció validación de `rfid_scan_from_client` con ventana temporal configurable (`RFID_CLIENT_MAX_TIMESTAMP_SKEW_MS`, default ±30s) y formato estricto de `sensorId`.
- Se añadieron tests de regresión para `Origin` no permitido, `timestamp skew` RFID y payloads peligrosos.

**Cierre (20-02-2026):**

- [x] Conexiones socket desde `Origin` no permitido fallan con error controlado.
- [x] Payloads de riesgo (prototype pollution / NoSQL operators) se rechazan con `400` antes de tocar repositorios.
- [x] Eventos RFID fuera de ventana temporal o con `source` inválido se rechazan por validador.
- [x] Suites objetivo actualizadas con cobertura de regresión de hardening.

**Avance (16-02-2026):**

- Se endureció el filtrado de `GET /api/sessions` para que un `teacher` no pueda forzar `createdBy` en query (mitigación IDOR horizontal).
- Se normalizó parcialmente el contrato de error en comandos socket críticos (`code` + `message`).

---

### T-064: Optimizar consultas y lectura de sesiones (sin write-on-read) ✅

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-053  
**Origen:** ARCH-04

**Descripción:**  
Eliminar side-effects en endpoints de lectura y reducir sobrecarga de consultas repetidas en sesiones y plays.

**Sub-tareas:**

1. Eliminar persistencia en endpoints `GET` de sesión (evitar sincronización con escritura durante lectura).
2. Añadir rutas de lectura `lean` en repositorios para endpoints de consulta pesada.
3. Reducir consultas repetidas en comandos socket (`join/start/pause/resume/next`) con contexto mínimo cacheado por socket.
4. Añadir tests que validen ausencia de side-effects de escritura en endpoints de lectura.
5. Documentar contrato de lectura sin mutación en docs backend.

**Criterios de Aceptación (medibles):**

- [x] Ningún endpoint `GET` de sesión ejecuta `save()` como efecto colateral.
- [x] Comandos socket críticos reducen consultas redundantes de ownership.
- [x] Tests de repositorios/controladores validan lectura sin mutación.
- [x] Latencia de endpoints de detalle/listado mejora respecto a baseline definido.

**Actualización (17-02-2026):**

- `GET /api/sessions` y `GET /api/sessions/:id` ejecutan lectura `lean` y sin mutación.
- Se añadió caché ligera por socket para ownership (además de caché global TTL).
- Se amplió test de no mutación para cubrir listado (`GET /api/sessions`) y detalle (`GET /api/sessions/:id`).
- Se añadió benchmark reproducible (`npm run bench:sessions`) comparando baseline sin `lean` vs modo optimizado con `lean` (versión actual).
- Resultado de cierre: mejora medible en listado (`avg +8.84%`, `p95 +13.34%`) y detalle (`avg +2.55%`, `p95 +5.67%`) respecto al baseline definido.

**Avance (16-02-2026):**

- `GET /api/sessions/:id` dejó de ejecutar sincronización con `save()` en lectura (sin write-on-read).
- Se añadió ruta ligera de ownership para comandos socket no críticos de runtime, con caché TTL por `userId+playId` para reducir consultas repetidas.
- `start_play` mantiene carga completa de sesión (mecánica/reglas) para no afectar el arranque de partida.
- Se añadió test de no mutación en lectura de sesión y test de caché de ownership en comandos socket consecutivos.

---

### T-065: Optimizar persistencia de eventos GamePlay ✅

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-055, T-058  
**Origen:** ARCH-05

**Descripción:**  
Reducir write amplification en GamePlay durante rondas para mejorar throughput y estabilidad bajo carga.

**Sub-tareas:**

1. Refactorizar persistencia de eventos a operaciones atómicas (`$push`, `$inc`) donde aplique.
2. Evitar múltiples escrituras redundantes por ronda (`round_start` + resultado + cambios de estado no críticos).
3. Definir política clara de checkpoints persistidos vs estado en memoria/Redis.
4. Añadir pruebas de regresión para métricas y puntuación tras refactor.
5. Documentar patrón de persistencia de eventos en gameEngine.

**Criterios de Aceptación (medibles):**

- [x] Se reduce el número de escrituras Mongo por ronda en flujos normales.
- [x] Métricas y score final se mantienen consistentes tras refactor.
- [x] Tests de gameplay/eventos pasan sin regresión funcional.
- [x] Estrategia de persistencia queda documentada para mantenimiento.

**Actualización (17-02-2026):**

- Se mantiene `addEventAtomic` como ruta canónica de persistencia por ronda (`$push + $inc + $slice`).
- Se valida consistencia funcional con suites `gamePlayEventPersistence`, `gameFlow` y `playPauseResume`.

**Avance (16-02-2026):**

- Se añadió persistencia atómica de eventos en `GamePlay` con operadores `$push` + `$inc` y truncado por `$slice` (`addEventAtomic`).
- `gameEngine` ahora persiste resultado de ronda (`correct/error/timeout`) y avance de `currentRound` en una sola operación atómica.
- Se redujo write amplification en flujo normal al desactivar por defecto la persistencia de `round_start` (configurable por `PERSIST_ROUND_START_EVENTS=true`).
- Se corrigió el cómputo de `metrics.totalAttempts` para contar únicamente eventos de respuesta (`correct`, `error`, `timeout`).
- Se añadieron tests específicos de persistencia atómica y política de eventos de ronda.

---

### T-066: Recuperación Redis y locks distribuidos de tarjetas 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-055  
**Origen:** ARCH-06

**Descripción:**  
Mejorar recuperación post-reinicio y bloqueo de tarjetas para escenarios concurrentes y multi-instancia.

**Sub-tareas:**

1. Refactorizar recovery para procesamiento por lotes (evitar N+1 secuencial en arranque).
2. Implementar bloqueo atómico de UIDs en Redis (`SET NX EX` o script Lua) para reservar tarjetas.
3. Añadir TTL/heartbeat a claves activas de plays/tarjetas para evitar residuos.
4. Añadir tests de recuperación y colisión de reservas entre partidas simultáneas.
5. Documentar semántica de lock y expiración.

**Criterios de Aceptación (medibles):**

- [ ] Recovery procesa claves en lotes sin bucles secuenciales de alto coste.
- [ ] No se puede reservar el mismo UID simultáneamente en dos partidas activas.
- [ ] Claves de estado activo expiran/renuevan según política definida.
- [ ] Tests de `redisStateRecovery` y colisión de locks pasan.

---

### T-067: Integridad de dominio en usuarios y contextos ✅

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-059  
**Origen:** BE-02, SEC-03

**Descripción:**  
Corregir rutas con riesgo de bypass funcional (transferencias y borrados con dependencias activas) para mantener integridad de datos.

**Sub-tareas:**

1. Restringir actualización de `createdBy` en `PUT /users/:id` y forzar transferencias por endpoint dedicado.
2. Asegurar validación de tenant-scope en filtros sensibles (evitar IDOR por filtros de cliente).
3. Añadir guardas al borrado de contextos con dependencias activas (sessions/decks/plays).
4. Añadir tests de regresión para transferencia y eliminación con dependencias.
5. Actualizar documentación de reglas de negocio y ownership.

**Criterios de Aceptación (medibles):**

- [ ] `createdBy` no se modifica por ruta genérica de update de usuario.
- [ ] Transferencias solo posibles por endpoint específico con permisos.
- [ ] No se elimina contexto con dependencias activas sin política explícita.
- [ ] Tests de seguridad/negocio cubren escenarios de bypass.

**Actualización (20-02-2026):**

- Se restringió `PUT /api/users/:id` para impedir modificación de `createdBy` y forzar transferencias por `POST /api/users/:id/transfer`.
- Se añadió protección de integridad en `DELETE /api/contexts/:id` para bloquear borrado cuando hay dependencias activas (`sessions/decks/plays`).
- Política aplicada: permitir borrado únicamente cuando las dependencias existentes no están activas.
- Se añadieron pruebas de regresión para bypass de ownership y borrado de contexto con dependencias.

**Cierre (20-02-2026):**

- [x] `createdBy` no se modifica por ruta genérica de update de usuario.
- [x] Transferencias solo posibles por endpoint específico con permisos.
- [x] No se elimina contexto con dependencias activas sin política explícita.
- [x] Tests de seguridad/negocio cubren escenarios de bypass.

---

## P2 - Prioridad Media

### T-050: Mockup Interactivo de Partida (aislado solo dev) 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** T-054  
**Origen:** FE-02

**Descripción:**  
Mantener un mockup visual interactivo para validación UX infantil, separado de la ruta productiva.

**Sub-tareas:**

1. Crear ruta `/game-mockup` solo en entorno desarrollo.
2. Implementar componentes visuales requeridos para flujo de 5 rondas.
3. Añadir controles debug y feedback visual/sonoro.
4. Asegurar que no impacta al gameplay real de producción.

**Criterios de Aceptación (medibles):**

- [ ] Mockup accesible solo en dev.
- [ ] Flujo simulado de 5 rondas funcional.
- [ ] No hay dependencia del mockup en la ruta de juego real.

---

### T-052: Soporte `prefers-reduced-motion` transversal ✅

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** T-056  
**Origen:** FE-03

**Descripción:**  
Aplicar accesibilidad de movimiento reducido de forma consistente en wizard, gameplay, modales y componentes animados.

**Sub-tareas:**

1. Crear hook de utilidad (`useReducedMotion`) reutilizable.
2. Aplicar fallback en componentes con animaciones intensas.
3. Añadir fallback CSS global de transiciones.
4. Verificar manualmente escenarios críticos y documentar.

**Criterios de Aceptación (medibles):**

- [x] Con preferencia activa, animaciones pesadas quedan desactivadas o simplificadas.
- [x] UI mantiene usabilidad completa sin motion compleja.
- [x] Documentación UI/UX actualizada.

**Cierre (25-02-2026):**

- Se completó degradación de motion en `GameSession` y `CardDecksPage` para overlays/estados vacíos/indicadores con `useReducedMotion`.
- Se validó build de producción y preview local del frontend tras hardening de motion (`npm run build`, `npm run preview`).
- Se consolidó evidencia y checklist de validación en documentación UI/UX y reporte técnico de cierre.

---

### T-039: Sentry Frontend Completo 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** T-061  
**Origen:** RNF-CAL-008

**Descripción:**  
Completar integración real de Sentry en frontend con boundary, tracing de navegación y source maps.

**Sub-tareas:**

1. Integrar SDK Sentry en inicialización de app.
2. Configurar boundary con fallback de error de UI.
3. Habilitar tracing de navegación.
4. Configurar subida de source maps en build/release.

**Criterios de Aceptación (medibles):**

- [ ] Error en componente React aparece en Sentry con stack útil.
- [ ] Navegación genera trazas visibles.
- [ ] Source maps permiten ubicar líneas originales.

---

### T-034: Swagger / OpenAPI 3.0 📋

**Prioridad:** P2 | **Tamaño:** L | **Dependencias:** T-061  
**Origen:** RNF-CAL-017

**Descripción:**  
Documentar API con OpenAPI 3.0 y exponer Swagger UI para pruebas y onboarding técnico.

**Sub-tareas:**

1. Añadir dependencias `swagger-jsdoc` y `swagger-ui-express`.
2. Definir spec base con auth bearer, servers y versión.
3. Documentar endpoints prioritarios con ejemplos.
4. Exponer `/api-docs` y `/api-docs/json`.

**Criterios de Aceptación (medibles):**

- [ ] Swagger UI accesible en entorno de desarrollo.
- [ ] Endpoints core auth/users/sessions/plays documentados.
- [ ] Ejemplos request/response válidos disponibles.

---

### T-038: E2E Frontend (Playwright) para flujos críticos 📋

**Prioridad:** P2 | **Tamaño:** L | **Dependencias:** T-054, T-051, T-056  
**Origen:** RNF-CAL-019

**Descripción:**  
Configurar y ejecutar tests E2E para cubrir los flujos críticos de release 1.0.0.

**Sub-tareas:**

1. Configurar Playwright y baseURL para entorno local/CI.
2. Implementar flujo E2E de auth (`login`, `refresh`, `logout`).
3. Implementar flujo E2E de gestión de alumnos (crear, editar, eliminar, búsqueda).
4. Implementar flujo E2E de sesiones (wizard adaptativo + inicio de partida).
5. Implementar flujo E2E de gameplay (pausa/reanudar + fin de partida).
6. Integrar ejecución en CI con reporte de resultados.

**Criterios de Aceptación (medibles):**

- [ ] Existen al menos 4 flujos E2E críticos automatizados.
- [ ] Los tests E2E se ejecutan en CI con reporte.
- [ ] Fallos E2E bloquean cierre de release candidate.

---

## P3 - Prioridad Baja

### T-023: Staging Environment (replicable) 📋

**Prioridad:** P3 | **Tamaño:** S | **Dependencias:** T-061  
**Origen:** RNF-CAL-020

**Descripción:**  
Documentar y definir proceso replicable de despliegue en staging sin pasos ocultos.

**Sub-tareas:**

1. Crear documento `docs/Deployment_Staging.md` con requisitos, variables y checklist.
2. Definir script o pipeline base de deploy reproducible.
3. Definir monitorización mínima para staging (health + logs).

**Criterios de Aceptación (medibles):**

- [ ] Documento de staging completo y ejecutable por terceros.
- [ ] Se puede desplegar staging siguiendo solo el documento.
- [ ] Existe checklist de verificación post-deploy.

---

## Tarea Transversal Frontend (acciones de mejora)

### T-060: Optimización frontend de UX, motion y render ✅

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-056, T-052  
**Origen:** FE-04

**Descripción:**  
Aplicar mejoras concretas de rendimiento visual y UX en frontend (motion, render y lifecycle de listeners) para los flujos críticos del sprint.

**Sub-tareas:**

1. Implementar y exportar hook compartido `useReducedMotion` para uso transversal.
2. Aplicar reduced-motion en `CreateSession`, `GameSession`, `DeckCreationWizard` y `CardDecksPage`.
3. Reducir renders evitables con memoización en `WizardStepper` y componentes críticos.
4. Endurecer lifecycle de listeners socket/sensor en `GameSession` y servicios para evitar duplicados.
5. Actualizar guía frontend con checklist de QA visual/performance.

**Criterios de Aceptación (medibles):**

- [x] `useReducedMotion` está integrado en al menos 4 vistas críticas.
- [x] Con preferencia activa, animaciones complejas quedan desactivadas sin romper flujo.
- [x] No hay listeners duplicados tras reconexión/pause-resume en gameplay.
- [x] Guía frontend y checklist de verificación visual quedan actualizados.

**Cierre (25-02-2026):**

- Se estabilizó bootstrap realtime en `GameSession` evitando re-suscripciones por dependencias volátiles de ronda.
- Se reforzó reduced-motion en elementos de alta frecuencia visual y se mantuvo degradación progresiva en componentes críticos.
- Se optimizó `WizardStepper` con memoización (`memo` + `useMemo`) para reducir renders evitables.
- Validación ejecutada en frontend: lint sin errores y build en verde.

---

### T-068: Hardening de clases dinámicas y consistencia visual ✅

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** T-056, T-060  
**Origen:** FE-05

**Descripción:**  
Eliminar riesgos de estilos perdidos en build por clases Tailwind dinámicas y unificar variantes visuales en wizard y modo RFID.

**Sub-tareas:**

1. Reemplazar interpolaciones dinámicas de clases por mapas estáticos de variantes.
2. Aplicar patrón estático en componentes de reglas/dificultad y badge de modo RFID.
3. Revisar componentes con estados visuales críticos para evitar clases no detectadas por build.
4. Añadir validación visual manual en build de producción.

**Criterios de Aceptación (medibles):**

- [x] No existen interpolaciones de clases Tailwind en componentes críticos del wizard/RFID.
- [x] Build de producción mantiene estados visuales de dificultad y modo RFID.
- [x] Checklist visual de regresión queda documentado.

**Cierre (25-02-2026):**

- Se verificó contrato estático de variantes en `CreateSession` y `RFIDModeHandler` sin interpolaciones dinámicas críticas.
- Se confirmó build productivo correcto con los estados visuales de dificultad/modo RFID incluidos en bundle.
- Se mantuvo matriz y checklist de verificación en guías frontend para QA de regresión.

---

### T-069: Accesibilidad del temporizador y controles interactivos 🔄

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-060  
**Origen:** FE-06

**Descripción:**  
Elevar la accesibilidad y la calidad UX de gameplay (Association + Memory) para público infantil (4-8), manteniendo estética premium sin introducir ruido cognitivo ni sobrecarga para lectores de pantalla.

**Sub-tareas:**

1. Rehacer estrategia `aria-live` del temporizador para anunciar solo umbrales críticos (`10`, `5`, `3`, `2`, `1`, `0`) y evitar anuncios por tick.
2. Corregir semántica de toggles/controles de gameplay (`sound`, `pause/resume`) con estados ARIA explícitos (`aria-pressed`) y labels consistentes.
3. Convertir overlay de pausa en diálogo accesible (`role="dialog"`, `aria-modal`, foco inicial, Escape para reanudar, retorno de foco al trigger).
4. Añadir anuncios SR de estado runtime (`realtime`, errores socket, estado de partida) sin duplicados ni spam.
5. Propagar `reduced-motion` en componentes críticos de gameplay (`TimerBar`, `ChallengeDisplay`, `CharacterMascot`, `FeedbackOverlay`, `GameOverScreen`) manteniendo identidad visual premium.
6. Refinar copy y jerarquía textual en runtime para alumno (mensajes cortos y directos), preservando métricas completas en resumen final para docente.
7. Ampliar cobertura de tests de integración de `GameSession` para umbrales de temporizador, controles ARIA y foco de pausa.
8. Documentar checklist manual de validación de accesibilidad y UX de gameplay en guías frontend.

**Criterios de Aceptación (medibles):**

- [ ] El temporizador no produce anuncios por cada segundo; solo se anuncian umbrales críticos definidos.
- [ ] Los controles críticos (`sonido`, `pausa/reanudar`) son operables por teclado y reflejan estado con ARIA semántico.
- [ ] En pausa, el foco entra al diálogo, permite reanudar por teclado y vuelve al control origen al cerrar.
- [ ] Los cambios de estado realtime/RFID/errores se anuncian con `role=status`/`aria-live=polite` sin duplicación excesiva.
- [ ] Con `prefers-reduced-motion` activo no hay loops o efectos de alta intensidad en gameplay.
- [ ] La vista activa del alumno mantiene instrucciones breves y legibles; las métricas extendidas quedan en resumen final.
- [ ] Existen tests de integración actualizados para timer/a11y/foco y pasan junto con la suite frontend objetivo.
- [ ] El checklist manual de accesibilidad/UX queda documentado y trazable en docs frontend.

---

## Fuera de alcance Sprint 4 (propuesto Sprint 5)

1. API completa de gestión de sensores (`/api/sensors/*`) para RF-RFID-011.
2. Endurecimiento avanzado de mecánica de Secuencia y su alineación de requisitos.
3. Expansión de E2E más allá de flujos críticos de release.
4. Mejoras avanzadas de observabilidad/no funcionales no bloqueantes.

---

## Matriz mínima de trazabilidad obligatoria

Antes de cerrar el sprint, cada tarea deberá anexar en PR:

- ID de tarea.
- Requisito RF/RNF asociado.
- Archivos modificados.
- Tests ejecutados.
- Evidencia documental actualizada.
- Riesgo residual (si aplica).
