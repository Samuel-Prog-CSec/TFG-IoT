# Sprint 4 - Avance de Documentacion

Este documento convierte los puntos del Sprint 4 en tareas accionables con sub-tareas y criterios de aceptacion.

---

## T-023: Staging Environment

**Prioridad:** P3 | **Tamano:** S | **Dependencias:** T-033

**Descripcion:**
Documentacion y proceso replicable para desplegar en entorno de staging.

**Sub-tareas:**
1. Crear documento `docs/Deployment_Staging.md` con requisitos, variables, proceso y checklist.
2. Definir script de deploy (shell o CI) con pasos reproducibles.
3. Definir monitorizacion minima (health checks y logs centralizados).

**Criterios de aceptacion:**
- [ ] Documento completo y claro.
- [ ] Proceso de deploy replicable siguiendo la documentacion.
- [ ] Staging desplegable sin pasos ocultos.

---

## T-007: GDPR Anonimizacion (Duda #31)

**Prioridad:** P2 | **Tamano:** M | **Dependencias:** Ninguna

**Descripcion:**
Endpoint para anonimizar datos de alumnos respetando GDPR, preservando metricas.

**Sub-tareas:**
1. Crear endpoint `DELETE /api/users/:id/anonymize` (teacher owner o super_admin).
2. Implementar proceso:
   - `name` -> `Alumno Anonimo #XXXX` (ultimos 6 chars del ID).
   - `profile` -> `{}`.
   - `email` -> `null`.
   - `status` -> `anonymized`.
   - Mantener: `studentMetrics`, `createdAt`.
3. Validaciones:
   - No anonimizar profesores.
   - No anonimizar usuarios ya anonimos.
4. Log de auditoria con actor, fecha y motivo opcional.
5. Tests unitarios e integracion basica.

**Criterios de aceptacion:**
- [ ] Datos personales eliminados o reemplazados.
- [ ] Metricas preservadas para analiticas agregadas.
- [ ] Log de auditoria registrado.
- [ ] La anonimización no es reversible.

---

## T-050: Mockup interactivo de pantalla de partida

**Prioridad:** P2 | **Tamano:** M | **Dependencias:** Ninguna

**Descripcion:**
Mockup visual e interactivo de GamePlay sin backend para validar UX infantil.

**Sub-tareas:**
1. Crear pagina `GamePlayMockup.jsx` con ruta `/game-mockup` (solo dev).
2. Componentes visuales:
   - `ChallengeDisplay.jsx`.
   - `ScoreBoard.jsx`.
   - `TimerBar.jsx`.
   - `FeedbackOverlay.jsx`.
   - `RFIDWaitingIndicator.jsx`.
   - `GameOverScreen.jsx`.
3. Flujo simulado completo de 5 rondas con botones debug.
4. Sistema de sonidos con `useSound.js` y boton mute.
5. Animaciones con Framer Motion o CSS, respetando `prefers-reduced-motion`.
6. Responsive y accesibilidad basica para tablet (landscape preferido).

**Criterios de aceptacion:**
- [ ] Mockup accesible en `/game-mockup`.
- [ ] Flujo completo de 5 rondas simulable sin backend.
- [ ] Feedback visual y sonoro diferenciado por estado.
- [ ] Temporizador visual con cambio de color.
- [ ] Pantalla final con estrellas y celebracion.
- [ ] Diseno apto para ninos 4-6 anos.

---

## T-034: Swagger API Docs

**Prioridad:** P2 | **Tamano:** L | **Dependencias:** T-032

**Descripcion:**
Documentacion OpenAPI 3.0 con Swagger UI para la API.

**Sub-tareas:**
1. Instalar `swagger-jsdoc` y `swagger-ui-express`.
2. Configurar spec base con servers, version, seguridad Bearer.
3. Documentar endpoints con JSDoc `@openapi` y ejemplos.
4. Montar UI en `/api-docs` y spec raw en `/api-docs/json`.
5. (Opcional) Proteger en produccion con basic auth.

**Criterios de aceptacion:**
- [ ] Swagger UI accesible.
- [ ] Endpoints documentados con request/response.
- [ ] Ejemplos disponibles.
- [ ] UI permite probar endpoints.

---

## T-039: Sentry setup completo

**Prioridad:** P2 | **Tamano:** S | **Dependencias:** Ninguna

**Descripcion:**
Completar integracion de Sentry en frontend con Error Boundary y tracing.

**Sub-tareas:**
1. Envolver app con `Sentry.ErrorBoundary` + fallback UI.
2. Habilitar `BrowserTracing` con tracking de navegacion.
3. Subir source maps en build de Vite.
4. Configurar alertas basicas (email y opcional Slack/Discord).

**Criterios de aceptacion:**
- [ ] Errores React capturados en Sentry.
- [ ] Tracing visible por navegacion.
- [ ] Source maps funcionales.
- [ ] Alertas activas.

---

## T-037: Replicar sesion

**Prioridad:** P2 | **Tamano:** S | **Dependencias:** T-021

**Descripcion:**
Clonar una sesion existente para reutilizar configuracion.

**Sub-tareas:**
1. Backend: `POST /api/sessions/:id/clone`.
2. Copiar `mechanicId`, `contextId`, `config`, `cardMappings`.
3. Resetear `status`, `startedAt`, `endedAt`, `createdAt`.
4. Frontend: boton "Volver a jugar" con modal de confirmacion.
5. Tests basicos para clonacion.

**Criterios de aceptacion:**
- [ ] Sesion clonada con un clic.
- [ ] Configuracion copiada correctamente.
- [ ] Nueva sesion independiente.
- [ ] Estado inicial `created`.

---

## T-051: Migrar refreshToken a cookie httpOnly

**Prioridad:** P1 | **Tamano:** M | **Dependencias:** Ninguna

**Descripcion:**
Eliminar refresh token en `localStorage` y usar cookie `httpOnly`.

**Sub-tareas:**
1. Backend: setear cookie en login y refresh; limpiar en logout.
2. Backend: leer refresh desde `req.cookies`.
3. Frontend: eliminar uso de `localStorage` para refresh.
4. Tests: login/refresh/logout con cookies.
5. Documentacion: actualizar API_v0.3.0.md.

**Criterios de aceptacion:**
- [ ] `refreshToken` no aparece en `localStorage`.
- [ ] Cookie `httpOnly` con `sameSite=strict` y `secure` en prod.
- [ ] Refresh funciona sin body.
- [ ] Logout limpia cookie.
- [ ] Documentacion actualizada.

---

## T-052: Soporte prefers-reduced-motion

**Prioridad:** P3 | **Tamano:** S | **Dependencias:** T-035

**Descripcion:**
Respetar `prefers-reduced-motion` en componentes animados.

**Sub-tareas:**
1. Hook `useReducedMotion.js`.
2. Aplicar en componentes con animaciones (wizard, cards, modales, RFID UI).
3. Variantes framer con fallback de opacidad.
4. CSS fallback para reducir transiciones.
5. Tests o verificacion manual.

**Criterios de aceptacion:**
- [ ] Hook implementado.
- [ ] Animaciones pesadas deshabilitadas con preferencia activa.
- [ ] UI sigue siendo funcional.
- [ ] Documentacion actualizada.

---

## T-038: E2E tests frontend

**Prioridad:** P1 | **Tamano:** M | **Dependencias:** T-021

**Descripcion:**
Tests E2E con Playwright para flujos criticos.

**Sub-tareas:**
1. Configurar Playwright y base URL.
2. Tests de auth: login, logout, refresh.
3. Tests de alumnos: crear, editar, eliminar, buscar.
4. Tests de sesiones: wizard, iniciar, pausar/reanudar.
5. Integracion CI con reportes.

**Criterios de aceptacion:**
- [ ] 4 flujos E2E cubiertos.
- [ ] Tests corren en CI.
- [ ] Reportes generados.

---

## T-053: Cambio de estados de GameSession

**Prioridad:** P2 | **Tamano:** S | **Dependencias:** Ninguna

**Descripcion:**
Definir y aplicar reglas de transicion de estados de GameSession.

**Sub-tareas:**
1. Definir reglas:
   - `active` si hay al menos una partida `in-progress` o `paused`.
   - `completed` si no hay partidas activas o pausadas.
2. Actualizar servicio/controlador para recalcular estado en eventos clave.
3. Tests de transicion (creacion, inicio, finalizacion, abandono).

**Criterios de aceptacion:**
- [ ] Reglas documentadas y aplicadas.
- [ ] Transiciones consistentes en escenarios reales.
- [ ] Tests basicos pasando.

---
