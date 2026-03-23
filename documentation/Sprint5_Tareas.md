# Sprint 5 - Plan de Tareas

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)
**Autor:** Samuel Blanchart Pérez
**Duración:** 4-6 semanas (Marzo - Abril 2026)
**Versión objetivo:** 1.0.0
**Última actualización:** 18-03-2026

---

## Resumen del Sprint

Este sprint prepara la **versión 1.0.0 de producción** con cinco ejes principales:

1. **Backend robustecido**: Flujo de errores unificado, asyncHandler, respuestas estandarizadas, repositorios completos, rate limiting con Redis, y nuevos endpoints de analytics.
2. **Frontend limpio y consistente**: Migración de ~197 colores hardcodeados a tokens semánticos OKLCH, y mejoras de rendimiento.
3. **Dashboards y analytics para profesores**: Nuevos endpoints de analytics, conexión de datos reales al dashboard (eliminando mocks), página de perfil individual de estudiante, vista comparativa de alumnos, alertas inteligentes y KPIs expandidos.
4. **Protección de datos de menores**: Auditoría de datos personales, minimización, seudonimización, borrado efectivo, retención, portabilidad, EIPD y consentimiento parental — alineado con RGPD, LOPDGDD y directrices de la AEPD.
5. **Tarjetas RFID como tokens fungibles**: Eliminación del modelo Card y su gestión centralizada. Las tarjetas RFID pasan a ser tokens fungibles que los profesores asignan directamente en mazos vía escaneo en vivo, sin registro previo por parte del administrador (ADR-012).

Tras auditorías exhaustivas del backend y frontend se identificaron:

- **Backend**: Flujo de errores inconsistente (validación Zod bypasea errorHandler), 72 try/catch manuales, repositorios sin write ops, ~70 respuestas construidas a mano, rate limiting incompleto, health check duplicado, y `gameEngine.js` con 1915 líneas.
- **Frontend**: 197 colores Tailwind crudos en 21 archivos (parcialmente corregido), y `useFetch` con `eslint-disable` (ya corregido).
- **Dashboards**: `StudentsList` con datos mock hardcodeados, `DistributionChart` recibiendo `null`, trends de StatCard hardcodeados, sin página de perfil de estudiante, sin vista comparativa, solo 2 tipos de alerta, y sin filtros interactivos.

---

## Leyenda

- **Prioridad:** P0 (Crítica/Bloqueante) > P1 (Alta) > P2 (Media) > P3 (Baja)
- **Tamaño:** XS (< 2h), S (2-4h), M (4-8h), L (1-2 días), XL (> 2 días)
- **Estado:** 📋 Pendiente | 🔄 En Progreso | ✅ Completada
- **Área:** 🔧 Backend | ⚛️ React/Tailwind | 📊 UI/UX & Dashboards | 🛡️ Protección de Datos | 🃏 Refactor RFID Cards
- **Origen:** Auditoría técnica del código backend y frontend + análisis de datos de dashboards
- **Definición de 100% (DoD):** Código implementado + tests pasando + lint limpio + verificación visual (frontend)

---

## Reglas de Cierre (DoD Global)

Una tarea solo puede pasar a ✅ si cumple **todas**:

1. Código implementado en la rama del sprint.
2. Tests existentes pasan sin regresiones (`npm test` en backend y/o frontend según aplique).
3. Lint limpio (`npm run lint`).
4. Build exitoso (`npm run build` en frontend).
5. Criterios de aceptación verificables cumplidos.
6. Retrocompatibilidad con el frontend (mismos contratos de respuesta JSON) para tareas backend.
7. Verificación visual en viewport desktop (≥1024px) y tablet (≥768px) para tareas frontend.

---

## P0 — Prioridad Crítica (Bloqueantes)

### T-516: 🔧 Unificar validación Zod con el errorHandler centralizado 📋

**Prioridad:** P0 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Auditoría — `middlewares/validation.js` responde directamente, saltándose errorHandler, Sentry y logging

**Descripción:**
Los tres middlewares de validación (`validateBody`, `validateQuery`, `validateParams`) capturan `ZodError` y responden directamente con `res.status(400).json(...)`, bypaseando el errorHandler centralizado. Deben usar `next(new ValidationError(...))` con los errores Zod formateados.

**Sub-tareas:**

1. Modificar los tres middlewares en `middlewares/validation.js` para construir `ValidationError` y llamar `next(error)`.
2. Actualizar `errorHandler.js` para detectar `ValidationError`/`ApiValidationError` y formatear la respuesta preservando `{ success: false, message, errors: [{field, message}] }`.
3. Revisar que `let error = { ...err }` en `errorHandler.js` no pierda propiedades de la cadena de prototipos.
4. Actualizar tests existentes para verificar el flujo centralizado.
5. Ejecutar suite completa de tests.

**Criterios de Aceptación:**

- [ ] Los tres middlewares usan `next(new ValidationError(...))` en lugar de `res.status(400).json()`
- [ ] El `errorHandler` formatea los errores de validación con el array `errors` preservado
- [ ] La respuesta HTTP sigue siendo 400 con el mismo formato JSON
- [ ] Los errores de validación aparecen en los logs de Pino como `warn`
- [ ] Todos los tests existentes pasan sin modificaciones al contrato de respuesta

**Archivos afectados:** `backend/src/middlewares/validation.js`, `backend/src/middlewares/errorHandler.js`, `backend/src/utils/errors.js`

---

### T-517: 🔧 Unificar notFoundHandler con el flujo centralizado 📋

**Prioridad:** P0 | **Tamaño:** XS (< 2h) | **Dependencias:** T-516
**Origen:** Auditoría — `notFoundHandler` no usa flujo centralizado

**Descripción:**
`notFoundHandler` responde directamente con `res.status(404).json(...)` en lugar de pasar por el error handler, lo que significa que las rutas no encontradas no se registran en el logging de errores estructurado. El bug de CSRF skipPaths fue corregido durante el Sprint 4 de mantenimiento.

**Sub-tareas:**

1. Modificar `notFoundHandler` para pasar por el flujo centralizado (construir `AppError` con 404 y llamar `next()`).
2. Agregar test de que ruta inexistente retorna 404 con formato estándar.
3. Verificar que las rutas 404 se registran en el logging estructurado de Pino.

**Criterios de Aceptación:**

- [ ] Las rutas 404 se registran en el logging estructurado de Pino
- [ ] Test de integración cubre el caso de ruta inexistente

**Archivos afectados:** `backend/src/middlewares/errorHandler.js`

---

### T-518: 🔧 Implementar wrapper asyncHandler para controllers 📋

**Prioridad:** P0 | **Tamaño:** S (2-4h) | **Dependencias:** T-516
**Origen:** Auditoría — 72 bloques try/catch manuales en 12 controllers

**Descripción:**
Todos los controllers usan `async (req, res, next) => { try { ... } catch (error) { next(error); } }` manualmente. Un wrapper `asyncHandler` eliminará este boilerplate. Express 5.x tiene soporte nativo para errores async en route handlers, pero NO en todos los casos de middlewares, por lo que el wrapper sigue siendo valioso.

**Sub-tareas:**

1. Crear `utils/asyncHandler.js` con función que capture errores sync y async y los pase a `next()`.
2. Agregar test unitario para `asyncHandler`.
3. Migrar UN controller como piloto (sugerido: `gameMechanicController.js`, 6 handlers).
4. Si el piloto es exitoso, migrar progresivamente el resto.
5. Documentar relación con Express 5 async error handling.

**Criterios de Aceptación:**

- [ ] `utils/asyncHandler.js` creado y exportado
- [ ] El wrapper captura errores síncronos y asíncronos
- [ ] Al menos un controller migrado y funcionando
- [ ] Tests existentes del controller piloto pasan sin cambios
- [ ] Documentación inline explicando el patrón

**Archivos afectados:** `backend/src/utils/asyncHandler.js` (nuevo), `backend/src/controllers/gameMechanicController.js` (piloto)

---

### T-601: 📊 Backend — Nuevos endpoints de analytics para dashboards 📋

**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-516, T-518 (recomendado: usar asyncHandler y errorHandler unificado)
**Origen:** Dashboard frontend necesita datos que actualmente no existen en la API

**Descripción:**
El dashboard actual depende de 3 endpoints (`/classroom/summary`, `/classroom/comparison`, `/classroom/difficulties`). Para las mejoras planificadas se necesitan **5 nuevos endpoints** que aprovechen los datos ricos ya almacenados en `GamePlay.events[]`, `GamePlay.metrics` y `User.studentMetrics`. Sin estos endpoints, las tareas T-602 a T-606 están bloqueadas.

**Sub-tareas:**

1. **`GET /api/analytics/classroom/students`** — Lista de estudiantes del profesor con métricas agregadas:
   - Consultar `User` donde `createdBy = teacherId` y `role = 'student'`
   - Incluir: `name`, `profile.avatar`, `profile.classroom`, `studentMetrics.*`, `status`
   - Soportar query params `?sort=name|score|lastPlayed|accuracy&order=asc|desc`
   - Soportar `?tier=risk|average|good|excellent` para filtrar por rango
   - Calcular `accuracyRate` desde `totalCorrectAnswers` y `totalErrors`

2. **`GET /api/analytics/classroom/distribution`** — Distribución de rendimiento:
   - Agrupar estudiantes en 4 rangos: 0-49 (riesgo), 50-69 (promedio), 70-89 (bueno), 90-100 (excelente)
   - Basarse en `studentMetrics.averageScore`
   - Retornar: `[{ range: '0-49', count: N, percentage: X }, ...]`

3. **`GET /api/analytics/classroom/trends`** — Trends calculados comparando períodos:
   - Comparar período actual vs anterior (ej: últimos 7 días vs 7 días anteriores)
   - Retornar para cada KPI: `{ current, previous, change, changePercent }`
   - KPIs: studentsInRisk, averageScore, gamesToday, totalGames, averageAccuracy, averageResponseTime

4. **`GET /api/analytics/student/:id/summary`** — Resumen completo de un estudiante:
   - Datos del `User` (name, profile, studentMetrics)
   - Últimas 10 partidas con score, accuracy, fecha, contexto, mecánica
   - Performance por contexto y por mecánica
   - Comparativa: score del estudiante vs promedio de clase

5. **Validadores Zod** para los nuevos endpoints en `analyticsValidator.js`:
   - `classroomStudentsQuerySchema`: sort, order, tier (todos opcionales)
   - `studentSummaryParamsSchema`: id como ObjectId
   - Reutilizar `analyticsTimeRangeQuerySchema` donde aplique

**Archivos a Crear/Modificar:**

- `backend/src/services/analyticsService.js` — 4 nuevas funciones
- `backend/src/controllers/analyticsController.js` — 4 nuevos handlers
- `backend/src/routes/analytics.js` — 4 nuevas rutas
- `backend/src/validators/analyticsValidator.js` — Nuevos schemas
- `backend/src/utils/dtos.js` — DTO para StudentAnalytics si no existe

**Criterios de Aceptación:**

- [ ] `GET /api/analytics/classroom/students` retorna lista con métricas
- [ ] `GET /api/analytics/classroom/distribution` retorna distribución en 4 rangos
- [ ] `GET /api/analytics/classroom/trends?timeRange=7d` retorna trends con cambio porcentual
- [ ] `GET /api/analytics/student/:id/summary` retorna resumen completo
- [ ] Todos requieren autenticación y rol teacher/super_admin
- [ ] Validación Zod aplicada en todos los endpoints
- [ ] Tests unitarios para cada nuevo pipeline de agregación
- [ ] `npm test` pasa en backend sin regresiones

---

### T-602: 📊 Dashboard — Eliminar datos mock y conectar datos reales 📋

**Prioridad:** P0 | **Tamaño:** M (4-8h) | **Dependencias:** T-601
**Origen:** StudentsList usa mock hardcoded, DistributionChart recibe null, trends son strings fijos

**Descripción:**
Tres componentes del dashboard muestran datos ficticios en producción, invalidando la utilidad del dashboard para profesores. Conectar los componentes existentes a los nuevos endpoints del backend.

**Sub-tareas:**

1. **StudentsList — Conectar a datos reales:**
   - Eliminar array `studentProgressData` hardcodeado
   - Llamar `analyticsService.getClassroomStudents()` en `Dashboard.jsx` dentro del `Promise.all`
   - Mapear campos del API al formato del componente
   - Añadir enlace: click en estudiante → navegar a `/students/:id` (T-603)

2. **DistributionChart — Conectar a datos reales:**
   - Llamar `analyticsService.getClassroomDistribution()` en `Promise.all`
   - Eliminar mock fallback en `ClassroomOverview.jsx`, mostrar SkeletonShimmer si no hay datos

3. **StatCard trends — Calcular desde API:**
   - Llamar `analyticsService.getClassroomTrends(timeRange)` en `Promise.all`
   - Reemplazar trends hardcodeados ("+2.4%", "+5%", etc.) por valores calculados
   - Formatear: positivo con "+" y verde, negativo con "-" y rojo, "—" si sin datos previos

4. **Frontend analytics service — Nuevos métodos:**
   - `getClassroomStudents(config)` → `GET /api/analytics/classroom/students`
   - `getClassroomDistribution(config)` → `GET /api/analytics/classroom/distribution`
   - `getClassroomTrends(timeRange, config)` → `GET /api/analytics/classroom/trends`
   - `getStudentSummary(studentId, config)` → `GET /api/analytics/student/:id/summary`

**Archivos a Modificar:**

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/dashboard/StudentsList.jsx`
- `frontend/src/components/dashboard/ClassroomOverview.jsx`
- `frontend/src/services/analytics.js`

**Criterios de Aceptación:**

- [ ] `StudentsList` muestra estudiantes reales del profesor autenticado
- [ ] `DistributionChart` muestra distribución real de rendimiento
- [ ] StatCards muestran trends calculados (comparación período actual vs anterior)
- [ ] Zero datos mock/hardcodeados en el dashboard
- [ ] Click en estudiante navega a su perfil
- [ ] Loading states (skeleton) durante carga de nuevos endpoints
- [ ] `npm test` y `npm run build` pasan

---

### T-603: 📊 Nueva página — Perfil Individual de Estudiante 📋

**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-601
**Origen:** No existe forma de que el profesor vea el detalle de un alumno individual

**Descripción:**
Crear la página `/students/:studentId` que permita al profesor consultar el progreso detallado de un estudiante individual. Pieza fundamental del TFG: los profesores deben poder entender las fortalezas, debilidades y evolución de cada alumno de forma visual e intuitiva, incluso sin conocimientos técnicos.

**Sub-tareas:**

1. **Crear ruta y página base:**
   - Ruta `/students/:studentId` en `routes.js` (protegida, teacher/super_admin)
   - Crear `frontend/src/pages/StudentProfile.jsx` con lazy loading
   - Accesible desde Dashboard (click en StudentsList)

2. **Header del perfil:**
   - Avatar, nombre, badge de aula, badge de rendimiento ("Excelente" ≥90, "Bueno" 70-89, "Promedio" 50-69, "Necesita apoyo" <50)
   - Última actividad: "Hace X días"
   - Botón "Volver a Dashboard"

3. **KPIs individuales (4-6 StatCards):**
   - Puntuación promedio, mejor puntuación, tasa de acierto, tiempo medio de respuesta, total de partidas
   - Comparativa con clase: "vs promedio de clase: X%"

4. **Gráfico: Progreso temporal (LineChart/AreaChart):**
   - Datos individuales con selector 7d/30d
   - Línea punteada con promedio de clase para comparar

5. **Gráfico: Rendimiento por Contexto Temático (BarChart horizontal):**
   - Datos de `performanceByContext`, barra coloreada por rendimiento

6. **Gráfico: Rendimiento por Mecánica de Juego:**
   - Comparativa Asociación vs Memoria

7. **Tabla: Historial de partidas recientes (últimas 10-20):**
   - Columnas: Fecha, Contexto, Mecánica, Score, Aciertos/Total, Duración
   - Badge de rendimiento por partida

8. **Sección: Fortalezas y Debilidades:**
   - Top 2 contextos mejor/peor accuracy como tarjetas descriptivas

9. **Estados: Loading, Error, Empty:**
   - Skeleton loader, error con reintentar, vacío si no hay partidas

**Archivos a Crear/Modificar:**

- `frontend/src/pages/StudentProfile.jsx` — **NUEVO**
- `frontend/src/constants/routes.js` — Añadir STUDENT_PROFILE route
- `frontend/src/App.jsx` — Registrar nueva ruta lazy
- `frontend/src/services/analytics.js` — Usar `getStudentSummary`

**Criterios de Aceptación:**

- [ ] Página accesible en `/students/:studentId` con autenticación
- [ ] Header muestra nombre, avatar, aula, badge de rendimiento, última actividad
- [ ] 4-6 KPIs individuales con valores reales y comparativa con clase
- [ ] Gráfico de progreso temporal funcional con selector 7d/30d
- [ ] Gráfico de rendimiento por contexto con barras coloreadas
- [ ] Gráfico de rendimiento por mecánica funcional
- [ ] Historial de partidas recientes con al menos 10 entradas
- [ ] Sección de fortalezas/debilidades derivada de datos
- [ ] Skeleton loaders durante carga
- [ ] Responsive: legible en ≥768px
- [ ] Navegable desde Dashboard y desde breadcrumb
- [ ] `npm test` y `npm run build` pasan

---

### T-701: 🛡️ Auditoría de datos personales y Registro de Actividades de Tratamiento (RAT) 📋

**Prioridad:** P0 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Auditoría de protección de datos — Obligación del Art. 30 RGPD y requisito base para EIPD (Art. 35)

**Descripción:**
La plataforma trata datos personales de menores de 4-8 años (colectivo especialmente protegido) sin disponer de un inventario formal de tratamientos ni un Registro de Actividades de Tratamiento (RAT). El Art. 30 RGPD obliga a todo responsable a mantener este registro. Además, el RAT es el input fundamental para la Evaluación de Impacto (EIPD) y para todas las medidas técnicas posteriores: no se puede proteger lo que no se ha inventariado.

**Sub-tareas:**

1. Catalogar cada actividad de tratamiento de datos personales en la plataforma:
   - Creación y gestión de cuentas de estudiantes
   - Registro de partidas (GamePlay) y eventos de interacción
   - Analytics y métricas de rendimiento
   - Autenticación y gestión de sesiones (profesores)
   - Logging de seguridad
2. Para cada actividad, documentar: finalidad, base legal, categorías de interesados, categorías de datos, destinatarios, plazos de conservación (actuales y propuestos), medidas de seguridad.
3. Crear documento formal `backend/docs/RAT_Registro_Actividades_Tratamiento.md`.
4. Generar script de inventario automático (`npm run data:audit`) que recorra los modelos Mongoose y liste los campos que contienen datos personales, comparándolos con el RAT.

**Criterios de Aceptación:**

- [ ] Documento RAT creado con formato conforme al Art. 30 RGPD
- [ ] Todas las actividades de tratamiento de datos personales inventariadas (mínimo 5)
- [ ] Cada actividad tiene base legal identificada y justificada
- [ ] Script `data:audit` ejecutable y genera informe legible
- [ ] Plazos de conservación definidos para cada categoría de datos

**Archivos afectados:** `backend/docs/RAT_Registro_Actividades_Tratamiento.md` (nuevo), `backend/scripts/dataAudit.js` (nuevo), `backend/package.json` (nuevo script)

---

### T-702: 🛡️ Minimización de datos personales de estudiantes 📋

**Prioridad:** P0 | **Tamaño:** S (2-4h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 5.1.c RGPD (principio de minimización)

**Descripción:**
El modelo `User` almacena `profile.birthdate` (fecha de nacimiento completa) de los estudiantes cuando solo se necesita `profile.age` para la funcionalidad educativa. Una fecha de nacimiento completa combinada con aula y nombre tiene alto potencial identificativo. Además, el campo `lastLoginAt` se mantiene para estudiantes aunque estos nunca hacen login (interactúan vía RFID). Cada campo de datos personales debe estar justificado por una necesidad funcional concreta.

**Sub-tareas:**

1. Crear script de migración que convierta `profile.birthdate` existentes a `profile.age` (si `age` no está ya asignado) y luego elimine el campo `birthdate` para usuarios con role `student`.
2. Modificar el modelo `User.js`: eliminar `profile.birthdate` del schema para role `student` (mantenerlo como opcional para `teacher`).
3. Actualizar validadores Zod en `userValidator.js` o `commonValidator.js`: `birthdate` no debe aceptarse al crear/actualizar estudiantes.
4. Actualizar DTOs: eliminar `birthdate` del DTO de estudiante.
5. Revisar seeders: eliminar `birthdate` de los datos de seed de estudiantes.
6. Ejecutar tests para verificar que no hay regresiones.

**Criterios de Aceptación:**

- [ ] El campo `profile.birthdate` no existe en documentos de estudiantes tras migración
- [ ] La API rechaza `birthdate` al crear/actualizar estudiantes (400 Bad Request)
- [ ] El DTO de estudiante no expone `birthdate`
- [ ] Los seeders no incluyen `birthdate` para estudiantes
- [ ] `npm test` pasa en backend sin regresiones

**Archivos afectados:** `backend/src/models/User.js`, `backend/src/utils/dtos.js`, `backend/src/validators/`, `backend/src/seeders/`, `backend/scripts/migrateBirthdate.js` (nuevo)

---

### T-801: 🃏 ADR-012 — Documentación de la decisión arquitectónica de tarjetas fungibles ✅

**Prioridad:** P0 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** Revisión con el tutor del TFG — las tarjetas RFID no deben requerir registro previo en BD

**Descripción:**
Redactar el ADR-012 en `backend/docs/Architecture_Decisions.md` documentando la decisión de eliminar el modelo Card. Incluye: situación actual y sus 5 limitaciones, perspectiva pedagógica, decisión con 5 cambios principales, alternativas consideradas (deprecación gradual y auto-descubrimiento) con motivos de descarte, análisis de impacto (qué cambia / qué no), consecuencias positivas y trade-offs, evidencia técnica y relación con ADR-003, ADR-004 y ADR-008. También actualizar la sección Cards del mapeo Endpoint → DTO en ADR-003.

**Criterios de Aceptación:**

- [x] ADR-012 añadido a `backend/docs/Architecture_Decisions.md`
- [x] Sección Cards de ADR-003 actualizada con referencia a ADR-012
- [x] Documento incluye perspectiva pedagógica con argumentos de uso educativo real
- [x] Alternativas documentadas con motivos de descarte

**Archivos afectados:** `backend/docs/Architecture_Decisions.md`

---

### T-802: 🃏 Backend — Eliminar `cardId` de esquemas Mongoose y validadores Zod 📋

**Prioridad:** P0 | **Tamaño:** M (4-8h) | **Dependencias:** T-801
**Origen:** ADR-012 — Fase 1 (modelos) y Fase 2 (validadores) del plan de implementación

**Descripción:**
Eliminar el campo `cardId` (ObjectId, ref Card) de todos los esquemas Mongoose y schemas Zod. El `uid` (String) pasa a ser el único identificador de una tarjeta física. Este cambio es fundacional: todo lo demás depende de que los esquemas ya no referencien Card.

**Sub-tareas:**

1. **CardDeck.js** — Eliminar `cardId` del `cardDeckMappingSchema` (líneas 18-22). Resultado: `{ uid, assignedValue, displayData }`.
2. **GameSession.js** — Eliminar `cardId` de:
   - `cardMappings[]` (líneas 140-144)
   - `boardLayout[]` (líneas 165-169)
   - `associationChallengePlan[]` (líneas 190-194)
3. **GameSession.js** — Modificar validador de `boardLayout` (líneas 319-346): cambiar validación de unicidad y pertenencia de `cardId` a `uid`.
4. **cardDeckValidator.js** — Eliminar `cardId: objectIdSchema` del mapping schema. Eliminar `.refine()` de unicidad de cardIds. Mantener refines de UIDs y assignedValues.
5. **gameSessionValidator.js** — Eliminar `cardId: objectIdSchema` de `cardMappingSchema`, `boardLayoutItemSchema` y `associationChallengeItemSchema`.
6. Actualizar JSDoc en ambos modelos.
7. Ejecutar lint para verificar coherencia.

**Criterios de Aceptación:**

- [ ] `CardDeck.cardMappings` no contiene campo `cardId`
- [ ] `GameSession.cardMappings`, `boardLayout` y `associationChallengePlan` no contienen `cardId`
- [ ] Validador de boardLayout en GameSession usa `uid` en vez de `cardId`
- [ ] Validadores Zod no requieren `cardId` en ningún mapping schema
- [ ] Validación de unicidad de UIDs dentro de un mazo se mantiene
- [ ] `npm run lint` pasa en backend

**Archivos afectados:** `backend/src/models/CardDeck.js`, `backend/src/models/GameSession.js`, `backend/src/validators/cardDeckValidator.js`, `backend/src/validators/gameSessionValidator.js`

---

### T-803: 🃏 Backend — Refactorizar lógica de negocio y DTOs sin Card 📋

**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-802
**Origen:** ADR-012 — Fases 3 (lógica) y 4 (DTOs) del plan de implementación

**Descripción:**
Eliminar toda la lógica que valida existencia de tarjetas contra la colección Card. Cambiar lookups basados en `cardId` a `uid` en helpers de sesión. Eliminar DTOs de Card y limpiar campos `cardId` de DTOs de mappings.

**Sub-tareas:**

1. **cardDeckController.js:**
   - Eliminar import de `cardRepository`
   - Eliminar función `validateCardsExistAndActive()` completa (líneas 94-123)
   - Modificar `validateDeckMappingsStructure()`: eliminar validación de `cardId` (líneas 44, 50-51, 60-62)
   - Eliminar llamada a `validateCardsExistAndActive` en `createDeck()` y `applyDeckMappingUpdates()`
   - Eliminar populate de `cardMappings.cardId` en `getDeckById()`

2. **gameSessionService.js:**
   - Eliminar import de `cardRepository`
   - Eliminar `cardId: m.cardId` en `normalizeSessionMappingsFromDeck()`
   - Eliminar bloque de validación contra Card collection en `syncSessionFromDeck()`
   - Eliminar función `validateCards()` completa
   - Cambiar check de duplicados de `cardId` a `uid` en `validateCardMappings()`

3. **sessionValidationHelpers.js:**
   - Cambiar todos los `mappingByCardId` Map a `mappingByUid` Map
   - Eliminar `cardId` de funciones: `normalizeBoardLayout`, `buildBoardLayoutFromMappings`, `normalizeAssociationChallengePlan`, `buildAssociationFallbackPlan`, `repairAssociationChallengePlanAgainstMappings`, `buildAssociationCloneDraftPlan`, `applyCloneMechanicState`

4. **gameSessionController.js** — Eliminar populate de `cardMappings.cardId` en `getSessionById()` y `cloneSession()`

5. **gameEngine.js** — Eliminar referencia a `challengeMapping.cardId` (aprox. línea 903)

6. **dtos.js:**
   - Eliminar funciones: `toCardDTOV1`, `toCardListDTOV1`, `toCardStatsDTOV1`
   - Modificar `mapCardMappingDTOV1()`: eliminar `cardId` y `card`. Resultado: `{ id, uid, assignedValue, displayData }`
   - Modificar `mapBoardLayoutItemDTOV1()` y `mapAssociationChallengeItemDTOV1()`: eliminar `cardId`
   - Eliminar exports de funciones Card

7. Ejecutar lint y tests para verificar.

**Criterios de Aceptación:**

- [ ] `cardDeckController` no importa `cardRepository` ni valida existencia de cartas
- [ ] `gameSessionService` no importa `cardRepository` ni valida cartas
- [ ] Todos los lookups de mappings en `sessionValidationHelpers` usan `uid` como key
- [ ] DTOs de Card eliminados de `dtos.js`
- [ ] DTOs de mapping/boardLayout/associationPlan no contienen `cardId`
- [ ] `POST /api/decks` funciona con mappings que solo tienen `uid` (sin `cardId`)
- [ ] `npm run lint` pasa en backend

**Archivos afectados:** `backend/src/controllers/cardDeckController.js`, `backend/src/services/gameSessionService.js`, `backend/src/controllers/helpers/sessionValidationHelpers.js`, `backend/src/controllers/gameSessionController.js`, `backend/src/services/gameEngine.js`, `backend/src/utils/dtos.js`

---

## P1 — Prioridad Alta

### T-503: ⚛️ Migrar tokens de color en `WizardStepper.jsx` 📋

**Prioridad:** P1 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** 13+ colores hardcodeados incluyendo inline `rgba()` en WizardStepper

**Descripción:**
`WizardStepper.jsx` y su variante compacta contienen 13+ usos de colores Tailwind crudos y valores `rgba()` inline que deben usar los tokens semánticos de `index.css`.

**Sub-tareas:**

1. Reemplazar en `getStepButtonClassName`: `bg-indigo-600` → `bg-accent-indigo`, `bg-emerald-500` → `bg-success-base`, `bg-slate-900` → `bg-background-deep`, etc.
2. Reemplazar `rgba(99, 102, 241, ...)` de animación pulse por `var(--color-accent-indigo)` con opacidades.
3. Reemplazar en `getStepLabelClassName`: `text-indigo-400` → `text-accent-indigo`, `text-emerald-400` → `text-success-base`.
4. Reemplazar partículas y barra de progreso inline.
5. Aplicar mismos reemplazos en `WizardStepperCompact`.

**Criterios de Aceptación:**

- [ ] Cero usos de `indigo-*`, `emerald-*`, `slate-*` raw en WizardStepper.jsx (excepto confetti)
- [ ] Cero valores `rgba(...)` inline
- [ ] Aspecto visual idéntico
- [ ] `npm test` y `npm run build` pasan

---

### T-506: ⚛️ Migrar tokens de color en `SessionsPage.jsx` 📋

**Prioridad:** P1 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** 31 ocurrencias de colores hardcodeados en SessionsPage

**Descripción:**
`SessionsPage.jsx` tiene 31 usos de colores raw en cards de sesión (iconos stats, texto, bordes laterales por estado) y header.

**Sub-tareas:**

1. **Header:** `bg-indigo-500/20 text-indigo-300` → `bg-accent-indigo/20 text-accent-indigo`
2. **Textos:** `text-white` → `text-text-primary`; `text-slate-400` → `text-text-muted`
3. **Bordes por estado:** `border-l-amber-500/70` → `border-l-warning-base/70`; `border-l-emerald-500/70` → `border-l-success-base/70`
4. **Stats icon backgrounds:** mapear a tokens `accent-indigo`, `accent-cyan`, `warning-base`, `success-base`
5. **Fondos y error card:** `bg-white/5` → `bg-glass-bg`; `border-rose-500/30` → `border-error-base/30`

**Criterios de Aceptación:**

- [ ] Cero colores Tailwind crudos en SessionsPage.jsx
- [ ] Aspecto visual idéntico al actual
- [ ] `npm test` pasa

---

### T-507: ⚛️ Migrar tokens de color en `GameSession.jsx` y sub-componentes 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** ~49 ocurrencias de colores hardcodeados en GameSession.jsx (1571 líneas)

**Descripción:**
`GameSession.jsx` es el archivo más grande del frontend. Contiene ~49 usos de colores raw en sub-componentes inline (MemoryBoard, CurrentPlayMetrics, MetricPill, pantallas de fallback/error, HUD, overlays).

**Sub-tareas:**

1. Loading skeleton, error screen, background decorations
2. HUD round indicator, textos, sound toggle, pause toggle
3. RFID status, realtime status pills, pause overlay
4. Round dots, MetricPill, CurrentPlayMetrics
5. MemoryGameplayPanel, getMemorySlotClasses, realtime error banner

Aplicar tabla de mapeo estándar de tokens semánticos en cada caso.

**Criterios de Aceptación:**

- [ ] Colores hardcodeados reducidos a < 5 (justificados)
- [ ] Aspecto visual idéntico
- [ ] `npm test` pasa

---

### T-519: 🔧 Crear utilidad centralizada de respuestas API 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-516
**Origen:** Auditoría — ~70 instancias de `{ success: true }` construidas manualmente

**Descripción:**
Los controllers construyen manualmente `{ success: true, data, message, pagination }` en cada respuesta. Se necesita una utilidad centralizada con funciones: `sendSuccess`, `sendCreated`, `sendPaginated`, `sendNoContent`.

**Sub-tareas:**

1. Crear `utils/responseHelper.js` con funciones documentadas.
2. Integrar `toPaginatedDTOV1` dentro de `sendPaginated`.
3. Definir y documentar contrato de respuesta estándar.
4. Migrar controller piloto (`cardController.js`).
5. Tests unitarios para cada función.

**Criterios de Aceptación:**

- [ ] `utils/responseHelper.js` creado con funciones documentadas
- [ ] Al menos un controller migrado y usando el helper
- [ ] Respuestas mantienen el mismo formato JSON (retrocompatibilidad)
- [ ] Tests unitarios
- [ ] El frontend no necesita cambios

**Archivos afectados:** `backend/src/utils/responseHelper.js` (nuevo), `backend/src/utils/dtos.js`, `backend/src/controllers/cardController.js` (piloto)

---

### T-520: 🔧 Completar el patrón Repository con operaciones de escritura 📋

**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** Ninguna
**Origen:** Auditoría — repositorios sin update/delete; ~25 llamadas directas a `.save()` en controllers/services

**Descripción:**
Los repositorios carecen de métodos de actualización y eliminación. Los controllers y services llaman `.save()` directamente sobre documentos Mongoose, rompiendo la abstracción.

**Sub-tareas:**

1. Ampliar `baseRepository.js` con funciones genéricas: `applyUpdateOptions(Model, id, update, options)`.
2. Agregar a cada repositorio (7 total): `updateById`, `updateOne`, `deleteById`, `deleteMany`.
3. Agregar `findByIdAndUpdate` como wrapper con `{ new: true, runValidators: true }`.
4. En `gameSessionRepository` agregar `save(doc)` que encapsule `doc.save()`.
5. Tests unitarios. NO migrar controllers/services en esta tarea.

**Criterios de Aceptación:**

- [ ] `baseRepository.js` tiene funciones genéricas de update/delete
- [ ] Los 7 repositorios exponen `updateById`, `updateOne`, `deleteById`, `deleteMany`
- [ ] Métodos de update soportan mismas opciones que lectura
- [ ] Tests unitarios cubren CRUD completo
- [ ] Tests existentes pasan sin regresiones

**Archivos afectados:** `backend/src/repositories/baseRepository.js`, `backend/src/repositories/*.js`

---

### T-521: 🔧 Rate limiting en acciones de play y migración a Redis store 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Auditoría — pause/resume sin rate limiting; store in-memory no apto para horizontal scaling

**Descripción:**
Las acciones de pause/resume carecen de rate limiting. Todos los rate limiters usan store in-memory, inadecuado para producción con múltiples instancias.

**Sub-tareas:**

1. Agregar `eventRateLimiter` a rutas `POST /api/plays/:id/pause` y `POST /api/plays/:id/resume`.
2. Instalar `rate-limit-redis`.
3. Crear función factory en `config/security.js` para Redis store en producción con fallback a in-memory.
4. Aplicar Redis store a todos los rate limiters existentes.
5. Tests para los nuevos rate limits.

**Criterios de Aceptación:**

- [ ] `/api/plays/:id/pause` y `resume` tienen rate limiting
- [ ] En producción, rate limiters usan Redis
- [ ] En desarrollo/test, usan in-memory
- [ ] Degradación graceful si Redis no disponible
- [ ] Tests cubren nuevos rate limits

**Archivos afectados:** `backend/src/routes/plays.js`, `backend/src/config/security.js`, `backend/package.json`

---

### T-604: 📊 Dashboard — KPIs expandidos y filtros interactivos 📋

**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-601, T-602
**Origen:** Dashboard actual solo tiene 4 KPIs básicos sin filtros

**Descripción:**
Ampliar el dashboard con KPIs adicionales y filtros interactivos para segmentar por contexto temático, mecánica de juego y rango de fechas ampliado.

**Sub-tareas:**

1. **Nuevos KPIs (8 total):** Tasa de Acierto Global, Tiempo Medio de Respuesta, Estudiantes Activos, Tasa de Completado.
2. **Filtros interactivos:** Selector de Contexto Temático, Mecánica de Juego, Rango de fechas (7d, 30d, 90d, Todo). Filtros afectan todos los componentes.
3. **Sección de Actividad Reciente (timeline):** Últimas 5-8 partidas por cualquier alumno.

**Archivos a Modificar:**

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/dashboard/StatCard.jsx`
- `frontend/src/services/analytics.js`

**Criterios de Aceptación:**

- [ ] 8 KPIs visibles con datos reales
- [ ] Filtros de contexto, mecánica y rango de fechas funcionales
- [ ] Filtros afectan todos los componentes del dashboard
- [ ] Sección de actividad reciente con partidas reales
- [ ] Layout responsivo en ≥768px
- [ ] `npm test` y `npm run build` pasan

---

### T-605: 📊 Dashboard — Sistema de insights y alertas inteligentes 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-601, T-602
**Origen:** AlertsPanel solo tiene 2 tipos de alerta y sin estado vacío

**Descripción:**
Transformar el `AlertsPanel` en un sistema de insights accionables con acciones directas para el profesor.

**Sub-tareas:**

1. **Nuevos tipos de alerta:** `inactive` (>7 días sin jugar), `declining` (bajada >15%), `improving` (subida >15%), `streak` (5+ partidas >80%), `difficulty_spike` (>60% error rate).
2. **Acciones directas:** Cada alerta con botón contextual que navega al perfil o filtra.
3. **Estado vacío positivo:** Card con CheckCircle verde y "¡Todo marcha bien!" en vez de `return null`.
4. **Mejoras visuales:** Iconos diferenciados, animación escalonada, timestamps relativos, máximo 5 visibles.

**Archivos a Modificar:**

- `frontend/src/components/dashboard/AlertsPanel.jsx`
- `frontend/src/pages/Dashboard.jsx`

**Criterios de Aceptación:**

- [ ] Al menos 5 tipos de alerta diferentes derivados de datos
- [ ] Cada alerta tiene acción directa que navega a contenido relevante
- [ ] Estado vacío muestra mensaje positivo en vez de `null`
- [ ] Alertas se generan automáticamente de los datos
- [ ] `npm test` y `npm run build` pasan

---

### T-606: 📊 Nueva página — Vista Comparativa de Estudiantes 📋

**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-601, T-603
**Origen:** No existe forma de comparar rendimiento entre estudiantes

**Descripción:**
Crear la página `/analytics/students` con tabla interactiva de **todos los estudiantes** del profesor con métricas, ordenación, filtros y comparación.

**Sub-tareas:**

1. **Ruta y página base:** `/analytics/students` (protegida, lazy loading).
2. **Tabla interactiva:** Columnas (Avatar+Nombre, Aula, Partidas, Score, Tasa Acierto, Tiempo, Última Actividad, Estado). Ordenable, filtrable por tier, búsqueda por nombre. Click → `/students/:studentId`.
3. **Resumen visual:** DistributionChart compacto + KPIs resumidos.
4. **Indicador última actividad:** Coloreado (verde <3d, ámbar 3-7d, rojo >7d).
5. **Empty state** con CTA hacia gestión de estudiantes.

**Archivos a Crear/Modificar:**

- `frontend/src/pages/StudentsAnalytics.jsx` — **NUEVO**
- `frontend/src/constants/routes.js` — Añadir ruta
- `frontend/src/App.jsx` — Registrar ruta
- Sidebar NAV_ROUTES — Añadir enlace "Mis Alumnos"

**Criterios de Aceptación:**

- [ ] Página accesible en `/analytics/students`
- [ ] Tabla con todos los estudiantes y métricas reales
- [ ] Ordenable por todas las columnas
- [ ] Filtrable por tier y búsqueda por nombre
- [ ] Click en estudiante navega a su perfil (T-603)
- [ ] Resumen visual de distribución de clase
- [ ] Skeleton loader durante carga
- [ ] Responsive en ≥768px
- [ ] `npm test` y `npm run build` pasan

---

### T-607: 📊 Dashboard — Mejorar DifficultyHeatmap con interactividad 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Heatmap actual no es accionable ni intuitivo para profesores no técnicos

**Descripción:**
Mejorar el `DifficultyHeatmap` con leyenda clara, tooltips informativos y visualización más intuitiva para profesores.

**Sub-tareas:**

1. **Leyenda visual descriptiva:** 3 niveles (Verde "Dominado", Ámbar "Necesita práctica", Rojo "Dificultad alta").
2. **Tooltips enriquecidos:** Número de estudiantes, sugerencia textual, evolución.
3. **Mejorar visualización:** Evaluar grid/tabla visual (cuadrícula con celdas coloreadas) en vez de ScatterChart.
4. **Responsividad:** Nombres abreviados o rotados en viewport pequeño.

**Archivos a Modificar:**

- `frontend/src/components/dashboard/DifficultyHeatmap.jsx`

**Criterios de Aceptación:**

- [ ] Leyenda clara con 3 niveles de dificultad
- [ ] Tooltips con información accionable
- [ ] Visualización intuitiva para personas no técnicas
- [ ] Responsivo en ≥768px
- [ ] `npm run build` pasa

---

### T-608: 📊 Consistencia Visual — Login y Register con design tokens 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Login.jsx tiene ~20 colores hardcodeados, Register.jsx patrón similar

**Descripción:**
Login y Register son la primera impresión del profesor con la plataforma, pero usan extensivamente colores Tailwind crudos en vez de design tokens OKLCH.

**Sub-tareas:**

1. **Login.jsx — Migración de colores (~20 ocurrencias):** `bg-slate-950` → `bg-background-deep`, gradientes → tokens `accent-indigo`, `brand-base`, `accent-pink`, etc.
2. **Register.jsx — Mismo patrón de migración.**
3. **Verificación visual** antes/después en mobile y desktop.

**Archivos a Modificar:**

- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Register.jsx`

**Criterios de Aceptación:**

- [ ] Cero colores Tailwind crudos en Login.jsx y Register.jsx (excepto confetti/canvas)
- [ ] Cero valores `rgba()` inline
- [ ] Aspecto visual idéntico al actual
- [ ] `npm run build` pasa
- [ ] Verificación visual en mobile y desktop

---

### T-609: 📊 Mejoras visuales en la experiencia de partida 📋

**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** Ninguna
**Origen:** La pantalla de juego puede mejorar en feedback visual e inmersión para niños de 4-6 años

**Descripción:**
Mejorar la experiencia visual de las partidas (GameOverScreen, ChallengeDisplay, CharacterMascot, HUD) para mayor inmersión y mejor feedback.

**Sub-tareas:**

1. **GameOverScreen — Resumen expandido:** Comparativa con mejor partida anterior, ampliar mensajes de feedback a 6-8 niveles, animación "progreso desbloqueado".
2. **ChallengeDisplay — Feedback visual:** Glow verde + partículas en acierto, shake + flash rojo en error, transiciones suaves.
3. **CharacterMascot — Más personalidad:** Micro-animaciones (parpadeo, salto, brazos arriba), burbujas de diálogo con mensajes rotativos.
4. **HUD — Legibilidad:** Indicador de progreso de rondas más visible, barra de completado.

**Archivos a Modificar:**

- `frontend/src/components/game/GameOverScreen.jsx`
- `frontend/src/components/game/ChallengeDisplay.jsx`
- `frontend/src/components/game/CharacterMascot.jsx`
- `frontend/src/pages/GameSession.jsx`

**Criterios de Aceptación:**

- [ ] GameOverScreen muestra comparativa con mejor partida anterior
- [ ] GameOverScreen tiene al menos 6 niveles de mensaje de feedback
- [ ] ChallengeDisplay tiene feedback visual claro de acierto y error
- [ ] CharacterMascot tiene micro-animaciones en al menos 3 estados
- [ ] HUD muestra indicador de progreso de rondas claramente visible
- [ ] Animaciones respetan `prefers-reduced-motion`
- [ ] `npm test` y `npm run build` pasan

---

### T-703: 🛡️ Seudonimización de datos de estudiantes en logs y analytics 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 25 RGPD (protección desde el diseño), Directrices EDPB 01/2025 sobre seudonimización

**Descripción:**
Los logs de Pino y el security logger pueden registrar datos identificativos de estudiantes (nombre, classroom) cuando se loguean eventos relacionados con partidas o gestión de alumnos. Además, los endpoints de analytics retornan `playerId` (ObjectId directo al User) que enlaza sin intermediación con los datos identificativos del menor. Se debe implementar seudonimización: en logs nunca aparecerá PII de estudiantes, y en analytics se usará un identificador seudonimizado.

**Sub-tareas:**

1. Crear utilidad `utils/pseudonymize.js` con función `pseudonymize(id)` que genere un hash SHA-256 truncado a 8 caracteres del ObjectId, con sal configurable por entorno.
2. Extender la configuración de redacción del logger Pino (`utils/logger.js`) para incluir campos de estudiante: `studentName`, `playerName`, `classroom`, `birthdate`.
3. Revisar el security logger (`utils/securityLogger.js`): asegurar que eventos como `STUDENT_TRANSFER` no logueen el nombre del estudiante (usar pseudoId).
4. Crear middleware o decorator para endpoints de analytics que transforme `playerId` → `pseudoId` en las respuestas antes de enviarlas al cliente.
5. Tests unitarios para la utilidad `pseudonymize` y tests de integración que verifiquen que los logs no contienen PII de estudiantes.

**Criterios de Aceptación:**

- [ ] Utilidad `pseudonymize(id)` creada y exportada con tests
- [ ] Los logs de Pino nunca contienen `studentName`, `playerName` ni `classroom` de estudiantes
- [ ] El security logger usa pseudoIds para eventos relacionados con estudiantes
- [ ] La función es determinista (mismo input → mismo output) para permitir correlación de logs
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/utils/pseudonymize.js` (nuevo), `backend/src/utils/logger.js`, `backend/src/utils/securityLogger.js`

---

### T-704: 🛡️ Implementar borrado efectivo de datos de estudiantes (Derecho de supresión) 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-702
**Origen:** Auditoría de protección de datos — Art. 17 RGPD, Considerandos 65 y 38

**Descripción:**
El sistema solo implementa soft delete (cambiar `status` a `'inactive'`), lo cual **no satisface** el derecho de supresión del Art. 17 RGPD: los datos del menor permanecen íntegros en la base de datos. Se necesita un endpoint de borrado efectivo (hard delete) que elimine todos los datos personales del estudiante con cascada completa. El Considerando 65 establece que este derecho es *«pertinente en particular cuando el interesado dio su consentimiento siendo niño»*.

**Sub-tareas:**

1. Crear endpoint `DELETE /api/users/:id/data` (hard delete) en `userController.js`.
2. Implementar cascada de eliminación:
   - Eliminar documento `User` de MongoDB
   - Eliminar todos los `GamePlay` donde `playerId` = userId
   - Revocar todos los tokens de refresco en Redis
   - Desconectar WebSocket activo si existe
   - Limpiar referencias en `GameSession.cardMappings` si aplica
3. Proteger con middleware de autorización: solo el profesor propietario (`createdBy`) o `super_admin`.
4. Registrar log de la acción (sin PII del estudiante eliminado): quién ejecutó, cuándo, motivo.
5. Validador Zod: requerir campo `confirmDeletion: true` en el body como confirmación explícita.
6. Tests de integración que verifiquen la cascada completa.

**Criterios de Aceptación:**

- [ ] Endpoint `DELETE /api/users/:id/data` elimina todos los datos del estudiante
- [ ] La cascada elimina User + GamePlays + tokens Redis
- [ ] Solo accesible por el profesor propietario o super_admin
- [ ] Requiere `confirmDeletion: true` en el body
- [ ] Log de auditoría registrado (sin PII del estudiante)
- [ ] Respuesta 200 con resumen de datos eliminados (conteos, no datos)
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/controllers/userController.js`, `backend/src/routes/users.js`, `backend/src/validators/userValidator.js`

---

### T-705: 🛡️ Política de retención de datos con limpieza automática 📋

**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-704
**Origen:** Auditoría de protección de datos — Art. 5.1.e RGPD (limitación del plazo de conservación)

**Descripción:**
Los datos se acumulan indefinidamente sin política de retención: los GamePlay.events[] (hasta 500 eventos por partida con timestamps exactos y UIDs de tarjeta) persisten para siempre, y las cuentas de estudiantes inactivas nunca se eliminan. Se necesita un script de retención configurable que aplique los plazos definidos en el RAT (T-701).

**Sub-tareas:**

1. Definir constantes de retención en `config/dataRetention.js`:
   - `GAMEPLAY_EVENTS_RETENTION_MONTHS`: 12 (eventos detallados)
   - `INACTIVE_STUDENT_RETENTION_MONTHS`: 24
   - `SECURITY_LOGS_RETENTION_MONTHS`: 12
2. Crear script `scripts/dataRetention.js` ejecutable con `npm run data:retention`:
   - **GamePlay events > 12 meses:** Anonimizar eliminando `playerId`, `events[].cardUid`, y reemplazando `events[].timestamp` con solo la fecha (sin hora/minuto). Conservar métricas agregadas.
   - **Estudiantes inactivos > 24 meses:** Ejecutar borrado efectivo (reutilizar lógica de T-704).
   - **Generar informe:** Número de gameplays anonimizados, estudiantes eliminados, espacio liberado estimado.
3. Añadir flag `--dry-run` que muestre qué se haría sin ejecutar cambios.
4. Añadir script npm `data:retention` y `data:retention:dry-run` en `package.json`.
5. Tests unitarios para la lógica de cálculo de fechas y selección de registros.

**Criterios de Aceptación:**

- [ ] Script de retención ejecutable con `npm run data:retention`
- [ ] GamePlays > 12 meses: eventos anonimizados, métricas conservadas
- [ ] Estudiantes inactivos > 24 meses: borrado efectivo con cascada
- [ ] Flag `--dry-run` funcional y genera informe sin modificar datos
- [ ] Constantes de retención configurables en un solo archivo
- [ ] Tests unitarios para la lógica de selección temporal
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/config/dataRetention.js` (nuevo), `backend/scripts/dataRetention.js` (nuevo), `backend/package.json`

---

### T-706: 🛡️ Derecho a la portabilidad — Endpoint de exportación de datos de estudiante 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 20 RGPD (derecho a la portabilidad de datos)

**Descripción:**
No existe forma de exportar los datos personales de un estudiante en formato estructurado. El Art. 20 RGPD establece el derecho a recibir los datos *«en un formato estructurado, de uso común y lectura mecánica»*. Se necesita un endpoint que retorne todos los datos personales del estudiante en JSON descargable. Este endpoint complementa la exportación CSV de analytics (T-617) con un alcance más amplio: todos los datos del estudiante, no solo métricas.

**Sub-tareas:**

1. Crear endpoint `GET /api/users/:id/export-data` en `userController.js`.
2. Recopilar datos de todas las fuentes:
   - Datos del perfil (User: name, age, classroom, avatar, status, fechas)
   - Consentimiento registrado (si T-708 está implementado)
   - Métricas agregadas (studentMetrics)
   - Historial de partidas (GamePlays: score, métricas, fechas, estado)
   - Eventos detallados de partidas (si están dentro del período de retención)
3. Estructurar respuesta JSON con metadatos: `{ exportDate, formatVersion, platformName, dataCategories, data: { profile, consent, metrics, gameHistory } }`.
4. Header `Content-Disposition: attachment; filename="student-data-export-{pseudoId}-{date}.json"` para descarga directa.
5. Proteger con autorización: solo profesor propietario o super_admin.
6. Rate limiting específico para prevenir scraping masivo (1 export por minuto por usuario).
7. Tests de integración.

**Criterios de Aceptación:**

- [ ] Endpoint `GET /api/users/:id/export-data` retorna JSON estructurado con todos los datos del estudiante
- [ ] Incluye metadatos de exportación (fecha, versión, plataforma)
- [ ] Incluye datos de perfil, métricas y historial de partidas
- [ ] Header Content-Disposition para descarga directa
- [ ] Solo accesible por profesor propietario o super_admin
- [ ] Rate limiting aplicado (1/min por usuario)
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/controllers/userController.js`, `backend/src/routes/users.js`, `backend/src/config/security.js` (rate limit)

---

### T-804: 🃏 Backend — Eliminar infraestructura de Card (modelo, repo, controller, rutas, RFID states) 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-803
**Origen:** ADR-012 — Fase 5 del plan de implementación

**Descripción:**
Eliminar completamente los 9 archivos de la capa Card y limpiar las referencias en server.js, la máquina de estados RFID y los comandos socket. Mantener `CardAssignmentState` (necesario para escaneo en creación de mazos).

**Sub-tareas:**

1. **Eliminar archivos** (9 archivos):
   - `backend/src/models/Card.js`
   - `backend/src/repositories/cardRepository.js`
   - `backend/src/controllers/cardController.js`
   - `backend/src/routes/cards.js`
   - `backend/src/validators/cardValidator.js`
   - `backend/seeders/02-cards.js`
   - `backend/src/states/rfid/CardRegistrationState.js`
   - `backend/src/commands/socket/JoinCardRegistrationCommand.js`
   - `backend/src/commands/socket/LeaveCardRegistrationCommand.js`

2. **server.js** — Eliminar import de `cardRoutes`, eliminar `app.use('/api/cards', cardRoutes)`, eliminar `/api/cards` de health check.

3. **states/rfid/index.js** — Eliminar import y entrada de `CardRegistrationState`.

4. **commands/socket/index.js** — Eliminar imports de `JoinCardRegistrationCommand` y `LeaveCardRegistrationCommand`.

5. **realtime/socketHandlers.js** — Eliminar `CARD_REGISTRATION` de `RFID_MODES`, eliminar helpers y eventos de registro.

6. Ejecutar lint y verificar que no hay imports rotos.

**Criterios de Aceptación:**

- [ ] Los 9 archivos listados no existen en el repositorio
- [ ] `server.js` no tiene rutas `/api/cards`
- [ ] Máquina de estados RFID no tiene modo `CARD_REGISTRATION`
- [ ] Modo `CARD_ASSIGNMENT` sigue funcionando (no se elimina)
- [ ] `GET /api/cards` devuelve 404 (ruta no encontrada)
- [ ] `npm run lint` pasa en backend
- [ ] El servidor arranca sin errores

**Archivos eliminados:** (ver Sub-tarea 1)
**Archivos modificados:** `backend/src/server.js`, `backend/src/states/rfid/index.js`, `backend/src/commands/socket/index.js`, `backend/src/realtime/socketHandlers.js`

---

### T-805: 🃏 Backend — Actualizar seeders sin modelo Card 📋

**Prioridad:** P1 | **Tamaño:** S (2-4h) | **Dependencias:** T-804
**Origen:** ADR-012 — Fase 6 del plan de implementación

**Descripción:**
Actualizar los seeders para que funcionen sin la colección Card. Los mazos y sesiones generan UIDs sintéticos directamente (formato `AA00XXXX` hexadecimal) sin necesidad de crear documentos Card.

**Sub-tareas:**

1. **seeders/index.js** — Eliminar import de `02-cards`, eliminar paso de seeding de cards del pipeline, actualizar firmas de funciones que recibían `cards`, actualizar log de resumen.
2. **seeders/05-carddecks.js** — Eliminar parámetro `cards`. Generar UIDs sintéticos inline con `generateCardMappings(contextAssets, count, uidOffset)`. Eliminar `cardId` de los mappings generados.
3. **seeders/06-sessions.js** — Eliminar parámetro `cards`. Eliminar `cardId` de mappings, boardLayout y associationChallengePlan generados.
4. Verificar: `npm run seed:reset` ejecuta sin errores y los datos son coherentes.

**Criterios de Aceptación:**

- [ ] `npm run seed:reset` ejecuta exitosamente sin modelo Card
- [ ] Los mazos generados tienen UIDs sintéticos válidos (formato `AA00XXXX`)
- [ ] Las sesiones generadas no contienen campo `cardId` en mappings
- [ ] El pipeline de seeding no referencia la colección `cards`
- [ ] `npm test` pasa en backend

**Archivos eliminados:** `backend/seeders/02-cards.js`
**Archivos modificados:** `backend/seeders/index.js`, `backend/seeders/05-carddecks.js`, `backend/seeders/06-sessions.js`

---

### T-806: 🃏 Backend — Actualizar tests sin modelo Card 📋

**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-803, T-804
**Origen:** ADR-012 — Fase 7 del plan de implementación

**Descripción:**
Eliminar el test de CRUD de Card y actualizar ~12 archivos de test que importan el modelo Card. El patrón es común: reemplazar `Card.create({uid: 'AA000001', ...})` + `card._id` por usar `uid: 'AA000001'` directamente en mappings de deck/session.

**Sub-tareas:**

1. **Eliminar** test de Card CRUD (si existe como `cards.test.js`).
2. **Actualizar** archivos de test que importan `Card`:
   - `cardDeck.test.js` — Crear mappings con uid directo, sin Card.create
   - `gameFlow.test.js` — Idem
   - `gamePlayEventPersistence.test.js` — Idem
   - `gameEngineDistributedLock.test.js` — Idem
   - `socketAuth.test.js` — Idem
   - `repositories.test.js` — Eliminar tests de cardRepository
   - `sessionClone.test.js` — Idem
   - `sessionReadNoMutation.test.js` — Idem
   - `sessionMechanicAvailability.test.js` — Idem
   - `playPauseResume.test.js` — Idem
   - `redisStateRecovery.test.js` — Idem
3. Ejecutar `npm test` completo y verificar 0 fallos.

**Criterios de Aceptación:**

- [ ] No existen tests que importen `Card` model
- [ ] Todos los tests de deck/session usan UIDs directos sin crear documentos Card
- [ ] `npm test` pasa al 100% sin regresiones
- [ ] Coverage no disminuye significativamente (se eliminan tests de Card, pero se mantienen los de deck/session)

**Archivos eliminados:** `backend/tests/cards.test.js` (si existe)
**Archivos modificados:** ~12 archivos de test (ver Sub-tarea 2)

---

### T-807: 🃏 Frontend — Eliminar capa de datos de Card y actualizar cardMapping 📋

**Prioridad:** P1 | **Tamaño:** S (2-4h) | **Dependencias:** T-803
**Origen:** ADR-012 — Fase 8.1 y 8.2 del plan de implementación

**Descripción:**
Eliminar el servicio `cardsAPI` del frontend y actualizar la utilidad `cardMapping.js` para usar `uid` como identificador primario en lugar de `cardId`/`card._id`.

**Sub-tareas:**

1. **api.js** — Eliminar todas las funciones de `cardsAPI` (getCards, getCardById, createCard, updateCard, deleteCard, createCardsBatch, getCardStats) y su export.
2. **cardMapping.js** — Eliminar lógica de `cardId`. Usar `uid` como key en `normalizeCardMappingsFromDeck()` y `buildCardMappingsPayload()`.
3. Buscar y eliminar cualquier otro import de `cardsAPI` en el codebase frontend.
4. `npm run lint` y `npm run build` pasan.

**Criterios de Aceptación:**

- [ ] `cardsAPI` no existe en `api.js`
- [ ] `cardMapping.js` usa `uid` como identificador primario
- [ ] No existen imports de `cardsAPI` en ningún componente frontend
- [ ] `npm run build` pasa sin errores

**Archivos afectados:** `frontend/src/services/api.js`, `frontend/src/lib/cardMapping.js`

---

### T-808: 🃏 Frontend — Actualizar páginas de mazos sin cardId 📋

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-807
**Origen:** ADR-012 — Fase 8.3 y 8.5 del plan de implementación

**Descripción:**
Actualizar las páginas de creación, edición y detalle de mazos para funcionar sin `cardId`. Los componentes usarán `uid` como key y no consultarán `cardsAPI`. Evaluar si `CardSelector.jsx` debe eliminarse o repurpose.

**Sub-tareas:**

1. **DeckCreationWizard.jsx** — Eliminar import de `cardsAPI`, eliminar `cardsAPI.getCards()`, cambiar keys de `card._id` a `card.uid` o `uid`. El escaneo en vivo vía `CardAssignmentState` ya existe y es el método principal.
2. **DeckEditPage.jsx** — Mismo patrón: eliminar referencias a `cardsAPI` y `cardId`.
3. **CardDeckDetailPage.jsx** — Eliminar referencias a `cardId` en `getCardInfo()` y displays de mapping. Usar `uid` directamente.
4. **CardSelector.jsx** — Evaluar: si solo servía para seleccionar cartas pre-registradas de BD → eliminar. Si tiene lógica de UI reutilizable para escaneo → refactorizar.
5. `npm run build` y `npm test` pasan.

**Criterios de Aceptación:**

- [ ] `DeckCreationWizard` no importa ni llama a `cardsAPI`
- [ ] `DeckEditPage` no usa `cardId` ni `cardsAPI`
- [ ] `CardDeckDetailPage` muestra UIDs directamente sin buscar `cardId`
- [ ] `CardSelector.jsx` eliminado o refactorizado (justificado en commit)
- [ ] Crear/editar mazo funciona con UIDs capturados por escaneo en vivo
- [ ] `npm run build` y `npm test` pasan

**Archivos afectados:** `frontend/src/pages/DeckCreationWizard.jsx`, `frontend/src/pages/DeckEditPage.jsx`, `frontend/src/pages/CardDeckDetailPage.jsx`, `frontend/src/components/ui/CardSelector.jsx`

---

### T-809: 🃏 Frontend — Actualizar páginas de sesiones y eliminar admin de cartas 📋

**Prioridad:** P1 | **Tamaño:** S (2-4h) | **Dependencias:** T-807
**Origen:** ADR-012 — Fases 8.4 y 8.6 del plan de implementación

**Descripción:**
Limpiar referencias a `cardId` en las páginas de sesiones y eliminar las páginas de gestión de cartas del panel de administración del super_admin.

**Sub-tareas:**

1. **SessionDetail.jsx** — Eliminar referencias a `cardId` en displays de card mapping.
2. **SessionEdit.jsx** — Eliminar referencias a `cardId` en la lógica de edición de mappings.
3. **Admin pages** — Identificar y eliminar páginas de gestión de cartas del panel de super_admin (listado, registro, batch import).
4. **Router** — Eliminar rutas de admin de cartas en el router de la aplicación.
5. **Sidebar/Navigation** — Eliminar enlace a gestión de cartas del menú de admin.
6. `npm run build` y `npm test` pasan.

**Criterios de Aceptación:**

- [ ] `SessionDetail` y `SessionEdit` no referencian `cardId`
- [ ] No existen páginas de gestión de cartas en el panel admin
- [ ] No existe enlace a "Gestión de tarjetas" en la navegación
- [ ] Rutas de admin de cartas eliminadas del router
- [ ] `npm run build` pasa sin errores

**Archivos afectados:** `frontend/src/pages/SessionDetail.jsx`, `frontend/src/pages/SessionEdit.jsx`, páginas admin de cartas (por identificar), `frontend/src/App.jsx` o router

---

## P2 — Prioridad Media

### T-512: ⚛️ Migrar colores hardcodeados en componentes restantes (batch) 📋

**Prioridad:** P2 | **Tamaño:** L (1-2 días) | **Dependencias:** T-503, T-506, T-507
**Origen:** ~80 ocurrencias restantes distribuidas en ~15 archivos

**Descripción:**
Después de los archivos priorizados individualmente, quedan: `RFIDScannerPanel.jsx` (~31), `CardSelector.jsx` (~25), `DeckCard.jsx` (~25), `AssetSelector.jsx` (~23), `RFIDModeHandler.jsx` (~12), `CharacterMascot.jsx` (~8), `ChallengeDisplay.jsx` (~7), `Sparkles.jsx` (~8), `FloatingPointsBadge.jsx` (~6), `FeedbackOverlay.jsx` (~5), `ScoreDisplay.jsx` (~5), `GameOverScreen.jsx` (~4), `CardAssetPreview.jsx` (~3), `SelectPremium.jsx` (~2), `ConfirmationModal.jsx` (~1).

Aplicar tabla de mapeo estándar de tokens semánticos a cada archivo.

**Criterios de Aceptación:**

- [ ] Colores hardcodeados reducidos a < 10% del total original (~20 max., justificados)
- [ ] `npm run build` y `npm test` pasan

---

### T-523: 🔧 Gestionar deprecación de rutas legacy con headers HTTP 📋

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** Auditoría — rutas `@deprecated` en JSDoc sin informar al consumidor

**Descripción:**
Las rutas legacy de assets tienen `@deprecated` en JSDoc pero no emiten headers de deprecación (RFC 8594).

**Sub-tareas:**

1. Crear middleware `deprecated(sunsetDate, alternativeRoute)` en `middlewares/deprecated.js`.
2. Aplicar a las dos rutas deprecadas en `routes/contexts.js`.
3. Agregar logging `warn` cuando se usen.
4. Documentar en `docs/deprecated-routes.md`.
5. Test de headers.

**Criterios de Aceptación:**

- [ ] Middleware `deprecated()` creado y reutilizable
- [ ] Rutas legacy emiten headers `Deprecation` y `Sunset`
- [ ] Logging registra uso con contexto
- [ ] Tests verifican headers

**Archivos afectados:** `backend/src/middlewares/deprecated.js` (nuevo), `backend/src/routes/contexts.js`

---

### T-525: 🔧 Unificar health checks 📋

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** Auditoría — health check duplicado en `/health` y `/api/health`

**Descripción:**
Los handlers de `/health` y `/api/health` son idénticos (código copiado). Se debe compartir el handler de health e incluir la versión del backend (que ahora se lee dinámicamente de `package.json` tras la corrección del Sprint 4).

**Sub-tareas:**

1. Extraer handler de health check a función reutilizable.
2. Registrar `/health` y `/api/health` apuntando al mismo handler.
3. Incluir versión en health check response.
4. Test que verifique que health check incluye versión correcta.

**Criterios de Aceptación:**

- [ ] `/health` y `/api/health` comparten handler
- [ ] Health check incluye versión
- [ ] Test verifica que versión es correcta

**Archivos afectados:** `backend/src/server.js`

---

### T-530: 🔧 Crear factory de filtros reutilizable para controllers 📋

**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** `buildUsersFilter`, `buildPlaysFilter`, etc. replican lógica

**Descripción:**
Abstraer en utilidad genérica `buildFilter(queryParams, fieldMappings, options)` con soporte para `exact`, `regex`, `range`, `in`, `computed`.

**Sub-tareas:**

1. Crear `utils/filterBuilder.js`.
2. Migrar `buildUsersFilter` como piloto.
3. Tests unitarios para cada tipo de mapping.

**Criterios de Aceptación:**

- [ ] `utils/filterBuilder.js` creado con soporte para los 5 tipos
- [ ] Al menos un controller migrado
- [ ] Builder escapa valores regex automáticamente
- [ ] Tests unitarios

**Archivos afectados:** `backend/src/utils/filterBuilder.js` (nuevo), `backend/src/controllers/userController.js` (piloto)

---

### T-610: 📊 Consistencia Visual — ContextsPage con design tokens 📋

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** ContextsPage tiene ~30 colores hardcodeados

**Descripción:**
Migrar `ContextsPage.jsx` y sub-componentes inline (ContextCard, CreateContextModal) a design tokens siguiendo la tabla de mapeo estándar.

**Criterios de Aceptación:**

- [ ] Cero colores Tailwind crudos en ContextsPage.jsx
- [ ] Aspecto visual idéntico
- [ ] `npm run build` pasa

---

### T-611: 📊 Navegación — Breadcrumbs en páginas de detalle 📋

**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Sin breadcrumbs en ninguna página

**Descripción:**
Crear componente `Breadcrumb` reutilizable e integrarlo en páginas de detalle (SessionDetail, SessionEdit, CardDeckDetailPage, DeckEditPage, ContextDetailPage, StudentProfile).

**Sub-tareas:**

1. **Crear componente `Breadcrumb`:** Props `items: [{ label, to? }]`, separador ChevronRight, responsive (mobile: solo "← Volver").
2. **Integrar en 6+ páginas de detalle.**

**Archivos a Crear/Modificar:**

- `frontend/src/components/ui/Breadcrumb.jsx` — **NUEVO**
- Páginas de detalle (SessionDetail, SessionEdit, CardDeckDetailPage, DeckEditPage, ContextDetailPage, StudentProfile)

**Criterios de Aceptación:**

- [ ] Componente `Breadcrumb` creado y reutilizable
- [ ] Breadcrumbs en al menos 5 páginas de detalle
- [ ] Navegación funcional
- [ ] Responsive: mobile muestra "← Volver" simplificado
- [ ] Tokens semánticos usados
- [ ] `npm run build` pasa

---

### T-612: 📊 Headers de página — Componente PageHeader unificado 📋

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** Inconsistencia en headers entre páginas

**Descripción:**
Crear `PageHeader` reutilizable (props: `icon`, `title`, `subtitle`, `actions`, `badge`). Integrar en ContextsPage, SessionsPage, CardDecksPage.

**Archivos a Crear/Modificar:**

- `frontend/src/components/ui/PageHeader.jsx` — **NUEVO**
- Páginas existentes: ContextsPage, SessionsPage, CardDecksPage

**Criterios de Aceptación:**

- [ ] Componente `PageHeader` creado con props flexibles
- [ ] Al menos 3 páginas usan el componente
- [ ] Aspecto visual consistente
- [ ] Responsive funcional
- [ ] `npm run build` pasa

---

### T-613: 📊 GameOverScreen — Resumen visual expandido 📋

**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** El resumen final de partida es básico

**Descripción:**
Expandir `GameOverScreen` con desglose por ronda (expandible), comparativa con mejor partida anterior, y 6+ niveles de mensajes de feedback rotativos.

**Criterios de Aceptación:**

- [ ] Desglose por ronda visible al expandir
- [ ] Comparativa con mejor partida anterior
- [ ] Al menos 6 niveles de mensajes de feedback
- [ ] Animaciones respetan `prefers-reduced-motion`
- [ ] `npm run build` pasa

---

### T-614: 📊 Estados vacíos y de error unificados 📋

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** Inconsistencia en estados vacíos y de error entre páginas

**Descripción:**
Crear componente `ErrorState` reutilizable (props: `title`, `message`, `onRetry`, `icon`). Unificar estados vacíos en AlertsPanel, DifficultyHeatmap, StudentProgressChart.

**Archivos a Crear/Modificar:**

- `frontend/src/components/ui/ErrorState.jsx` — **NUEVO**
- Componentes existentes a integrar

**Criterios de Aceptación:**

- [ ] Componente `ErrorState` creado y reutilizable
- [ ] AlertsPanel muestra estado positivo cuando no hay alertas
- [ ] Al menos 4 componentes migrados a estados unificados
- [ ] `npm run build` pasa

---

### T-615: 📊 Dashboard — Reemplazar select nativo por SelectPremium 📋

**Prioridad:** P2 | **Tamaño:** XS (< 2h) | **Dependencias:** Ninguna
**Origen:** Select de timeRange usa `<select>` nativo del navegador

**Descripción:**
Reemplazar `<select>` nativo en Dashboard Header y `ChartSection.jsx` por `SelectPremium` del design system.

**Criterios de Aceptación:**

- [ ] Cero `<select>` nativos en Dashboard y ChartSection
- [ ] Funcionalidad idéntica
- [ ] Accesibilidad mantenida
- [ ] `npm run build` pasa

---

### T-707: 🛡️ Evaluación de Impacto en Protección de Datos (EIPD/DPIA) 📋

**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 35 RGPD, lista AEPD de tratamientos que requieren EIPD

**Descripción:**
La AEPD incluye el tratamiento de datos de **menores de 14 años** entre los criterios que obligan a realizar una EIPD. La plataforma cumple al menos dos criterios de la lista: (1) datos de sujetos vulnerables (menores de 4-8 años) y (2) evaluación sistemática de aspectos personales (rendimiento educativo, patrones de respuesta, tiempos). Esta tarea es puramente documental pero tiene alta relevancia normativa y académica para el TFG.

**Sub-tareas:**

1. Crear documento `documentation/EIPD_Evaluacion_Impacto.md` con las secciones requeridas por el Art. 35.7 RGPD:
   - Descripción sistemática de las operaciones de tratamiento y sus fines
   - Evaluación de la necesidad y proporcionalidad del tratamiento
   - Evaluación de los riesgos para los derechos y libertades de los interesados
   - Medidas previstas para afrontar los riesgos (enlazar con tareas T-702 a T-711)
2. Incluir matriz de riesgos con probabilidad e impacto para cada riesgo identificado.
3. Documentar las medidas de mitigación implementadas y su eficacia esperada.
4. Referenciar el RAT (T-701) como base del análisis.

**Criterios de Aceptación:**

- [ ] Documento EIPD creado con las 4 secciones requeridas por Art. 35.7
- [ ] Mínimo 8 riesgos identificados y evaluados con probabilidad e impacto
- [ ] Cada riesgo tiene al menos una medida de mitigación asociada
- [ ] Referencias a normativa aplicable (RGPD, LOPDGDD, directrices AEPD)
- [ ] Enlace con el RAT y las medidas técnicas implementadas en el Sprint

**Archivos afectados:** `documentation/EIPD_Evaluacion_Impacto.md` (nuevo)

---

### T-708: 🛡️ Registro de consentimiento parental para tratamiento de datos 📋

**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 8 RGPD, Art. 7 LOPDGDD

**Descripción:**
El Art. 7 LOPDGDD fija en 14 años la edad mínima para consentir el tratamiento de datos en España. Para los alumnos de 4-8 años, el consentimiento debe proceder del titular de la patria potestad o tutela. Actualmente no se registra este consentimiento. Se necesita un sistema que permita al profesor registrar que ha obtenido el consentimiento parental antes de crear un estudiante, con trazabilidad de quién, cuándo y para qué.

**Sub-tareas:**

1. Añadir campo `consent` al schema de `User` para role `student`:
   ```
   consent: {
     granted: Boolean (required for students),
     grantedBy: String (nombre del tutor legal),
     grantedAt: Date,
     purposes: [String] (e.g., ['educational_tracking', 'performance_analytics']),
     policyVersion: String
   }
   ```
2. Modificar validador de creación de estudiantes: requerir `consent.granted = true` y `consent.grantedBy` obligatorio.
3. Actualizar DTO de estudiante para incluir estado del consentimiento (sin exponer `grantedBy` en endpoints públicos).
4. Crear endpoint `PATCH /api/users/:id/consent` para actualizar/revocar el consentimiento.
5. Si el consentimiento se revoca: el estudiante pasa a `status: 'inactive'` y no puede participar en partidas.
6. Frontend: añadir sección de consentimiento en el formulario de creación de estudiante con checkbox explícito y campo de nombre del tutor.
7. Tests de integración para validar que no se puede crear un estudiante sin consentimiento.

**Criterios de Aceptación:**

- [ ] No se puede crear un estudiante sin `consent.granted = true` y `consent.grantedBy`
- [ ] Endpoint `PATCH /api/users/:id/consent` permite actualizar/revocar
- [ ] La revocación desactiva al estudiante automáticamente
- [ ] El DTO incluye estado del consentimiento
- [ ] Frontend muestra campos de consentimiento al crear estudiante
- [ ] `npm test` pasa en backend
- [ ] `npm run build` pasa en frontend

**Archivos afectados:** `backend/src/models/User.js`, `backend/src/controllers/userController.js`, `backend/src/routes/users.js`, `backend/src/validators/userValidator.js`, `backend/src/utils/dtos.js`, `frontend/src/pages/` (formulario de creación de estudiante)

---

### T-709: 🛡️ Separación de datos identificativos y de rendimiento en DTOs de analytics 📋

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** T-703
**Origen:** Auditoría de protección de datos — Art. 25 RGPD (protección desde el diseño)

**Descripción:**
Los endpoints de analytics retornan datos de rendimiento directamente vinculados a datos identificativos (nombre, avatar, classroom) en la misma respuesta JSON. Si un atacante compromete la capa de analytics, obtiene PII + datos de rendimiento juntos. Se debe separar lógicamente la resolución de identidad de los datos de rendimiento en los DTOs de analytics, de forma que los datos analíticos puedan procesarse sin necesidad de acceder a PII.

**Sub-tareas:**

1. Crear DTO `StudentAnalyticsDTO` que retorne `pseudoId` (hash) en lugar de `playerId`/`_id` directo.
2. Crear DTO `StudentIdentityDTO` que solo contenga: `pseudoId`, `name`, `avatar`, `classroom`.
3. Los endpoints de analytics retornarán datos con `pseudoId`; el frontend resolverá la identidad con una tabla de correspondencia obtenida de un endpoint separado (el de listado de estudiantes del profesor).
4. Actualizar los DTOs en `utils/dtos.js`.
5. Tests que verifiquen que los endpoints de analytics no exponen `name`, `email`, ni `classroom`.

**Criterios de Aceptación:**

- [ ] Los endpoints de analytics no retornan `name`, `email` ni `classroom` directamente
- [ ] Usan `pseudoId` como identificador de estudiante
- [ ] La resolución identidad ↔ pseudoId se realiza en el frontend
- [ ] DTO `StudentAnalyticsDTO` creado y aplicado
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/utils/dtos.js`, `backend/src/controllers/analyticsController.js` (si existe), `backend/src/services/analyticsService.js` (si existe)

---

## P3 — Prioridad Baja

### T-515: ⚛️ Añadir tokens semánticos faltantes en `index.css` si es necesario 📋

**Prioridad:** P3 | **Tamaño:** XS (< 2h) | **Dependencias:** T-503 a T-512
**Origen:** Evaluación post-migración de cobertura de tokens

**Descripción:**
Revisar colores que no pudieron mapearse durante T-503 a T-512. Crear tokens adicionales si patrones recurrentes lo justifican.

**Criterios de Aceptación:**

- [ ] Nuevos tokens (si los hay) siguen convención `--color-{categoría}-{variante}` en OKLCH
- [ ] Documentados con comentario en `index.css`
- [ ] `npm run build` pasa

---

### T-532: 🔧 Extraer endpoints inline de server.js a controllers dedicados 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** T-525
**Origen:** server.js tiene handlers inline para `GET /`, health, metrics

**Descripción:**
Extraer handlers inline a `controllers/healthController.js` y `routes/health.js`. `server.js` debe ser solo configuración y montaje.

**Criterios de Aceptación:**

- [ ] Handlers inline extraídos a controllers/routes
- [ ] `server.js` solo contiene configuración y montaje
- [ ] Tests existentes pasan
- [ ] Endpoints funcionan idénticamente

**Archivos afectados:** `backend/src/controllers/healthController.js` (nuevo), `backend/src/routes/health.js` (nuevo), `backend/src/server.js`

---

### T-533: 🔧 Agregar soporte de transacciones en repository base 📋

**Prioridad:** P3 | **Tamaño:** M (4-8h) | **Dependencias:** T-520
**Origen:** Sin soporte para transacciones de Mongoose

**Descripción:**
Crear `utils/withTransaction.js` con función `withTransaction(callback)`. Agregar soporte de `session` en métodos de `baseRepository.js`. NO migrar operaciones existentes.

**Criterios de Aceptación:**

- [ ] `utils/withTransaction.js` creado y documentado
- [ ] Métodos del repository aceptan `session` como opción
- [ ] Test demuestra commit y rollback
- [ ] Documentación sobre requisitos de replica set

**Archivos afectados:** `backend/src/utils/withTransaction.js` (nuevo), `backend/src/repositories/baseRepository.js`

---

### T-534: 🔧 Agregar operaciones batch al repository base 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** T-520
**Origen:** Sin `bulkWrite()` ni `insertMany()` en repositorios

**Descripción:**
Agregar `insertMany` y `bulkWrite` a `baseRepository.js` y exponer en repositorios relevantes (card, cardDeck, gamePlay).

**Criterios de Aceptación:**

- [ ] `insertMany` y `bulkWrite` disponibles en repository base
- [ ] Al menos 3 repositorios concretos los exponen
- [ ] Tests unitarios

**Archivos afectados:** `backend/src/repositories/baseRepository.js`, repositorios concretos

---

### T-535: 🔧 Plan de descomposición modular de gameEngine.js 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** `gameEngine.js` tiene 1915 líneas

**Descripción:**
Tarea de **PLANIFICACIÓN** — no implementación. Analizar el archivo, identificar responsabilidades separables, y crear documento de diseño con propuesta de descomposición.

**Criterios de Aceptación:**

- [ ] Documento de diseño creado en `docs/adr/`
- [ ] Responsabilidades catalogadas
- [ ] Propuesta de módulos con dependencias claras
- [ ] Estimaciones de esfuerzo por módulo
- [ ] No se modifica código en esta tarea

**Archivos afectados:** `backend/docs/adr/gameEngine-decomposition.md` (nuevo)

---

### T-616: 📊 Onboarding — Guía de primer uso para profesores 📋

**Prioridad:** P3 | **Tamaño:** M (4-8h) | **Dependencias:** T-602
**Origen:** No existe guía para profesores nuevos

**Descripción:**
Dashboard vacío con card de bienvenida con pasos visuales (crear alumnos, explorar contextos, crear mazo, configurar sesión). Botón descartar con persistencia en localStorage.

**Archivos a Crear/Modificar:**

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/dashboard/WelcomeGuide.jsx` — **NUEVO**

**Criterios de Aceptación:**

- [ ] Dashboard vacío muestra guía de primeros pasos
- [ ] Cada paso enlaza a la sección correspondiente
- [ ] Botón de descartar funcional y persistente
- [ ] Guía no aparece si el profesor ya tiene sesiones
- [ ] `npm run build` pasa

---

### T-617: 📊 Exportar datos de analytics a CSV 📋

**Prioridad:** P3 | **Tamaño:** M (4-8h) | **Dependencias:** T-601, T-606
**Origen:** Profesores pueden necesitar compartir datos con dirección del centro

**Descripción:**
Botón "Exportar CSV" en StudentsAnalytics y opcionalmente en Dashboard. Generación client-side con `Blob` + `URL.createObjectURL`, sin dependencias externas.

**Archivos a Crear/Modificar:**

- `frontend/src/lib/utils.js` — Función `exportToCSV`
- `frontend/src/pages/StudentsAnalytics.jsx` — Botón exportar
- `frontend/src/pages/Dashboard.jsx` — Botón exportar (opcional)

**Criterios de Aceptación:**

- [ ] Botón "Exportar CSV" visible en vista de estudiantes
- [ ] CSV generado correctamente con datos reales
- [ ] Descarga automática del archivo
- [ ] Sin dependencias externas
- [ ] `npm run build` pasa

---

### T-618: 📊 Sidebar — Mejoras de navegación y notificaciones 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** T-605, T-606
**Origen:** El sidebar podría indicar mejor el estado del sistema

**Descripción:**
Badge de notificación en "Dashboard" si hay alertas activas. Enlace "Mis Alumnos" para la nueva página T-606.

**Archivos a Modificar:**

- `frontend/src/components/layout/AppLayout.jsx`
- `frontend/src/constants/routes.js`

**Criterios de Aceptación:**

- [ ] Badge de notificación visible cuando hay alertas
- [ ] Enlace "Mis Alumnos" funcional en sidebar
- [ ] `npm run build` pasa

---

### T-619: 📊 Mejoras de micro-interacciones en CharacterMascot 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** La mascota puede aportar más personalidad y motivación

**Descripción:**
Micro-animaciones por estado (parpadeo idle, salto happy, wave encouraging, cabeceo sad) y burbujas de diálogo con mensajes rotativos.

**Archivos a Modificar:**

- `frontend/src/components/game/CharacterMascot.jsx`
- `frontend/src/components/game/MascotAccessory.jsx`

**Criterios de Aceptación:**

- [ ] Al menos 3 estados con micro-animaciones únicas
- [ ] Burbujas de diálogo con mensajes rotativos
- [ ] Animaciones respetan `prefers-reduced-motion`
- [ ] `npm run build` pasa

---

### T-620: 📊 StudentProgressChart — Overlay de promedio de clase 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** T-603
**Origen:** Gráfico de progreso sin contexto comparativo

**Descripción:**
Añadir línea punteada en `StudentProgressChart` (en perfil de estudiante) con promedio de clase para el mismo período.

**Archivos a Modificar:**

- `frontend/src/components/dashboard/StudentProgressChart.jsx`
- `frontend/src/pages/StudentProfile.jsx`

**Criterios de Aceptación:**

- [ ] Línea punteada de promedio de clase visible
- [ ] Leyenda clara diferenciando alumno vs clase
- [ ] Tooltip muestra ambos valores
- [ ] `npm run build` pasa

---

### T-710: 🛡️ Información de privacidad accesible al usuario (profesores/tutores) 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** T-709
**Origen:** Auditoría de protección de datos — Arts. 13 y 14 RGPD (derecho a la información)

**Descripción:**
Los Arts. 13 y 14 RGPD exigen proporcionar información sobre el tratamiento de datos *«de forma concisa, transparente, inteligible y de fácil acceso, con un lenguaje claro y sencillo»*. Actualmente no existe ninguna página o sección en la plataforma que informe a profesores o tutores sobre qué datos se recogen, con qué finalidad, durante cuánto tiempo, quién tiene acceso, y cómo ejercer los derechos. Se necesita una página o modal accesible desde el frontend.

**Sub-tareas:**

1. Crear componente `frontend/src/pages/PrivacyInfo.jsx` con la información de privacidad:
   - Qué datos se recogen de los estudiantes (y cuáles no, ej: no se recoge email de alumnos)
   - Finalidad del tratamiento (seguimiento pedagógico, analytics de rendimiento)
   - Plazos de conservación (según T-705)
   - Quién tiene acceso (solo el profesor asignado y super_admin)
   - Cómo ejercer derechos (supresión, portabilidad, revocación de consentimiento)
   - Base legal del tratamiento (consentimiento parental, Art. 8 RGPD + Art. 7 LOPDGDD)
2. Añadir ruta `/privacy` en las rutas de la aplicación (accesible sin autenticación).
3. Añadir enlace a la página de privacidad en el footer o sidebar del layout.
4. Redactar el contenido en español, con lenguaje accesible para padres y profesores no técnicos.

**Criterios de Aceptación:**

- [ ] Página de privacidad accesible en `/privacy`
- [ ] Contenido cubre los 6 puntos mínimos del Art. 13 RGPD
- [ ] Lenguaje claro y accesible (no jurídico)
- [ ] Enlace visible desde el layout principal
- [ ] `npm run build` pasa

**Archivos afectados:** `frontend/src/pages/PrivacyInfo.jsx` (nuevo), `frontend/src/App.jsx` (ruta), `frontend/src/components/layout/AppLayout.jsx` (enlace)

---

### T-711: 🛡️ Logging de acceso a datos de estudiantes (audit trail) 📋

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** T-704
**Origen:** Auditoría de protección de datos — Art. 5.2 RGPD (responsabilidad proactiva)

**Descripción:**
El principio de responsabilidad proactiva (accountability) del Art. 5.2 RGPD exige poder demostrar el cumplimiento. Actualmente se registran eventos de seguridad (login, transferencia de estudiantes), pero no se registra **quién accede a los datos de qué estudiante** ni cuándo se exportan o eliminan datos. Un audit trail de acceso a datos permite: (1) detectar accesos indebidos, (2) responder ante solicitudes de la AEPD, (3) demostrar que solo personal autorizado accedió a los datos.

**Sub-tareas:**

1. Crear utilidad `utils/dataAccessLogger.js` que registre eventos de acceso a datos de estudiantes.
2. Definir eventos a registrar:
   - `DATA_ACCESS`: Cuando un profesor consulta el perfil/analytics de un estudiante
   - `DATA_EXPORT`: Cuando se ejecuta el endpoint de exportación (T-706)
   - `DATA_DELETE`: Cuando se ejecuta el borrado efectivo (T-704) — ya parcialmente cubierto
   - `DATA_CONSENT_CHANGE`: Cuando se modifica el consentimiento (T-708)
3. Formato del log: `{ event, teacherId, studentPseudoId, timestamp, action, ipAddress }`.
4. Integrar en los controllers relevantes: `userController` (perfil, export, delete), `analyticsController` (student summary).
5. Tests unitarios.

**Criterios de Aceptación:**

- [ ] Utilidad `dataAccessLogger` creada con eventos definidos
- [ ] Se registra log al acceder al perfil de un estudiante
- [ ] Se registra log al exportar o eliminar datos de un estudiante
- [ ] Logs usan `pseudoId` del estudiante, nunca el nombre
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/utils/dataAccessLogger.js` (nuevo), `backend/src/controllers/userController.js`, `backend/src/controllers/analyticsController.js`

---

## Dependencias entre Tareas

```
═══════════════════════════════════════════════════════════════
                    🔧 BACKEND
═══════════════════════════════════════════════════════════════

T-516 (errorHandler unificado)
  ├──► T-517 (notFound)
  ├──► T-518 (asyncHandler)
  └──► T-519 (responseHelper)

T-516 + T-518 ──► T-601 (nuevos endpoints analytics) ─────────┐
                                                                │
T-520 (repositories write)                                      │
  ├──► T-533 (transacciones)                                    │
  └──► T-534 (batch ops)                                        │
                                                                │
T-525 (health unificado)                                        │
  └──► T-532 (extraer inline handlers)                          │
                                                                │
Independientes: T-521, T-523, T-530, T-535                     │
                                                                │
═══════════════════════════════════════════════════════════════  │
                    ⚛️ REACT / TAILWIND                         │
═══════════════════════════════════════════════════════════════  │
                                                                │
T-503 ──┐
T-506 ──┼──► T-512 (batch restante) ──► T-515 (tokens faltantes)
T-507 ──┘

═══════════════════════════════════════════════════════════════
                    📊 UI/UX & DASHBOARDS
═══════════════════════════════════════════════════════════════

T-601 (Backend endpoints) ──┬──► T-602 (Datos reales dashboard)
                            ├──► T-603 (Perfil estudiante)
                            ├──► T-604 (KPIs expandidos) ◄── T-602
                            ├──► T-605 (Alertas inteligentes) ◄── T-602
                            ├──► T-606 (Vista comparativa) ◄── T-603
                            └──► T-617 (Exportar CSV) ◄── T-606

T-602 ──► T-616 (Onboarding)
T-603 ──► T-620 (Overlay promedio clase)
T-605 + T-606 ──► T-618 (Sidebar badges/enlaces)

Independientes: T-607, T-608, T-609, T-610, T-611, T-612,
                T-613, T-614, T-615, T-619

═══════════════════════════════════════════════════════════════
              🛡️ PROTECCIÓN DE DATOS DE MENORES
═══════════════════════════════════════════════════════════════

T-701 (Auditoría + RAT) ──────┬──► T-702 (Minimización datos)
                               ├──► T-703 (Seudonimización)
                               ├──► T-706 (Exportación datos)
                               ├──► T-707 (EIPD)
                               └──► T-708 (Consentimiento parental)

T-702 (Minimización) ──► T-704 (Borrado efectivo)
T-704 (Borrado efectivo) ──► T-705 (Retención automática)
T-704 (Borrado efectivo) ──► T-711 (Audit trail)
T-703 (Seudonimización) ──► T-709 (Separación PII/analytics)
T-709 (Separación PII) ──► T-710 (Información privacidad)

═══════════════════════════════════════════════════════════════
              🃏 REFACTOR RFID CARDS (Tokens Fungibles)
═══════════════════════════════════════════════════════════════

T-801 (ADR-012 documentación) ✅
  └──► T-802 (Esquemas Mongoose + Zod)
        └──► T-803 (Lógica negocio + DTOs)
              ├──► T-804 (Eliminar infra Card)
              │      ├──► T-805 (Seeders)
              │      └──► T-806 (Tests backend)
              ├──► T-807 (Frontend data layer)
              │      ├──► T-808 (Páginas mazos)
              │      └──► T-809 (Sesiones + admin)
              └──► T-806 (Tests backend)

═══════════════════════════════════════════════════════════════
              DEPENDENCIAS CRUZADAS (Cross-area)
═══════════════════════════════════════════════════════════════

T-516 (Backend errorHandler) ──► T-601 (Backend analytics)
T-518 (Backend asyncHandler) ──► T-601 (Backend analytics)
T-519 (Backend responseHelper) ──► T-601 (usar helpers en nuevos endpoints)
T-608 (Login/Register tokens) ║ T-503, T-506, T-507 (misma técnica de migración)
T-610 (ContextsPage tokens)   ║ T-512 (batch de tokens, misma técnica)
T-703 (Seudonimización) ──► T-601/T-709 (analytics usan pseudoIds)
T-708 (Consentimiento) ──► T-603 (perfil estudiante muestra estado consentimiento)
T-803 (Card refactor DTOs) ║ T-601 (Analytics — ambos modifican dtos.js, coordinar)
```

### Rutas Críticas

```
Dashboards:   T-516 (M) → T-518 (S) → T-601 (L) → T-602 (M) → T-603/T-604/T-606 (XL)
Protección:   T-701 (M) → T-702 (S) → T-704 (M) → T-705 (L)
RFID Cards:   T-801 ✅ → T-802 (M) → T-803 (L) → T-804 (M) → T-805/T-806 (S/L)
                                         └──► T-807 (S) → T-808/T-809 (M/S)
```

La cadena de dashboards determina cuándo el dashboard estará completamente funcional con datos reales. La cadena de protección de datos es independiente y puede ejecutarse en paralelo. La cadena de RFID Cards es independiente de las otras dos y puede ejecutarse en paralelo, excepto en `dtos.js` (compartido con T-601).

---

## Métricas del Sprint

### Por Prioridad

| Prioridad | Tareas | Esfuerzo estimado |
|---|---|---|
| **P0 (Crítica)** | 10 tareas (T-516~T-518, T-601~T-603, T-701, T-702, T-801~T-803) | ~10-15 días |
| **P1 (Alta)** | 21 tareas (T-503, T-506, T-507, T-519~T-521, T-604~T-609, T-703~T-706, T-804~T-809) | ~18-27 días |
| **P2 (Media)** | 14 tareas (T-512, T-523, T-525, T-530, T-610~T-615, T-707~T-709) | ~7-11 días |
| **P3 (Baja)** | 12 tareas (T-515, T-532~T-535, T-616~T-620, T-710, T-711) | ~6-8 días |
| **Total** | **57 tareas** (1 completada) | **~41-61 días** |

### Por Área

| Área | Tareas | % esfuerzo |
|---|---|---|
| 🔧 Backend (Node.js, API, Express) | T-516~T-521, T-523, T-525, T-530, T-532~T-535 (13 tareas) | ~18% |
| ⚛️ React & Tailwind CSS v4 | T-503, T-506, T-507, T-512, T-515 (5 tareas) | ~10% |
| 📊 UI/UX, Dashboards y Analytics | T-601 a T-620 (20 tareas) | ~42% |
| 🛡️ Protección de Datos de Menores | T-701~T-711 (11 tareas) | ~18% |
| 🃏 Refactor RFID Cards (Tokens Fungibles) | T-801~T-809 (9 tareas, 1 completada) | ~12% |

### Por Tipo de Cambio

| Tipo de cambio | Tareas | % esfuerzo |
|---|---|---|
| Dashboards y analytics (endpoints + UI) | T-601~T-607, T-615, T-617, T-620 | ~28% |
| Nuevas páginas (StudentProfile, StudentsAnalytics) | T-603, T-606 | ~12% |
| Migración de tokens de color | T-503, T-506, T-507, T-512, T-515, T-608, T-610 | ~12% |
| Robustecimiento backend (errores, repos, seguridad) | T-516~T-521, T-530 | ~12% |
| **Protección de datos y privacidad (RGPD/LOPDGDD)** | **T-701~T-711** | **~20%** |
| Componentes UI reutilizables | T-611, T-612, T-614 | ~4% |
| Experiencia de juego | T-609, T-613, T-619 | ~4% |
| Mejora de hooks y rendimiento React | — (completado) | ~0% |
| Infraestructura backend (health, deprecation, planning) | T-523, T-525, T-532~T-535 | ~4% |
| **Refactor RFID Cards — Tokens fungibles (ADR-012)** | **T-801~T-809** | **~12%** |

---

## Orden de Ejecución Sugerido

### Fase 1 — Fundamentos Backend (Semana 1)

1. **T-516** (M, prerequisito de todo el flujo de errores)
2. **T-517** + **T-518** (XS y S, dependen de T-516, pueden ser paralelas)
3. **T-519** + **T-521** (M cada una, en paralelo)
4. **T-520** (L, independiente, puede iniciar en paralelo)

### Fase 2 — Tokens Frontend + Analytics Backend (Semanas 1-2)

5. **T-601** (L, endpoints analytics — tras T-516 y T-518)
6. **T-503**, **T-506**, **T-507** (migraciones de tokens, paralelas entre sí)

### Fase 3 — Dashboards con Datos Reales (Semanas 2-3)

7. **T-602** (M, conectar datos reales al dashboard — tras T-601)
8. **T-603** (XL, perfil estudiante — tras T-601)
9. **T-604** + **T-605** (KPIs + alertas — tras T-602)
10. **T-608** + **T-610** (tokens Login/Register + ContextsPage, paralelas)

### Fase 4 — Páginas Nuevas + Componentes (Semanas 3-4)

11. **T-606** (XL, vista comparativa — tras T-601 y T-603)
12. **T-607** + **T-609** (heatmap + gameplay, paralelas)
13. **T-611** + **T-612** + **T-614** (breadcrumbs + PageHeader + ErrorState)

### Fase 5 — Protección de Datos: Fundamentos (Semanas 3-4)

14. **T-701** (M, auditoría + RAT — sin dependencias, se puede iniciar antes)
15. **T-702** (S, minimización datos — tras T-701)
16. **T-703** (M, seudonimización — tras T-701, paralela con T-702)

### Fase 6 — Protección de Datos: Derechos del Interesado (Semanas 4-5)

17. **T-704** (M, borrado efectivo — tras T-702)
18. **T-705** + **T-706** (retención + exportación — tras T-704 y T-701 respectivamente, paralelas)
19. **T-707** + **T-708** (EIPD + consentimiento — tras T-701, paralelas)
20. **T-709** (S, separación PII/analytics — tras T-703)

### Fase 7 — Refactor RFID Cards (Semanas 4-5, paralela con Fase 5-6)

21. **T-802** (M, esquemas Mongoose + Zod — sin dependencias externas)
22. **T-803** (L, lógica de negocio + DTOs — coordinar con T-601 en dtos.js)
23. **T-804** (M, eliminar infraestructura Card — tras T-803)
24. **T-805** + **T-806** (seeders + tests — tras T-804, paralelas entre sí)
25. **T-807** (S, frontend data layer — tras T-803)
26. **T-808** + **T-809** (páginas mazos + sesiones/admin — tras T-807, paralelas)

### Fase 8 — Pulido y Opcionales (Semanas 5-6)

27. **T-512** (batch tokens restantes — tras T-503, T-506, T-507)
28. **T-613** + **T-615** (GameOverScreen + SelectPremium)
29. Tareas P2 backend restantes (T-523, T-525, T-530)
30. **T-710** + **T-711** (privacidad frontend + audit trail)
31. Tareas P3 según capacidad (T-515, T-532~T-535, T-616~T-620)

---

## Checklist de Calidad del Sprint

### Código

- [ ] `cd backend && npm run lint` pasa sin errores ni warnings
- [ ] `cd backend && npm test` pasa todas las suites sin regresiones
- [ ] `cd frontend && npm run lint` pasa sin errores ni warnings
- [ ] `cd frontend && npm test` pasa todas las suites sin regresiones
- [ ] `cd frontend && npm run build` completa sin errores

### Limpieza de Código React

- [x] `grep -rn "eslint-disable.*react-hooks" frontend/src` devuelve 0 resultados

### Backend

- [ ] Errores de validación Zod pasan por errorHandler centralizado
- [ ] Al menos un controller migrado a asyncHandler
- [ ] Al menos un controller migrado a responseHelper
- [ ] Rate limiting en pause/resume de partidas

### Tokens de Color

- [ ] Colores raw Tailwind en componentes reducidos de ~197 a < 20 (justificados)
- [ ] Login y Register usan tokens semánticos exclusivamente
- [ ] ContextsPage usa tokens semánticos
- [ ] Verificación visual: capturas antes/después en componentes clave

### Dashboards

- [ ] Zero datos mock en producción (StudentsList, DistributionChart, trends)
- [ ] Todos los KPIs muestran datos reales del profesor autenticado
- [ ] Perfil de estudiante accesible y funcional
- [ ] Vista comparativa operativa con ordenación y filtros

### Responsividad

- [ ] Dashboard legible en ≥768px
- [ ] Perfil de estudiante legible en ≥768px
- [ ] Vista comparativa usable en ≥768px (tabla scrollable)
- [ ] Breadcrumbs adaptados a mobile

### Accesibilidad

- [ ] ARIA labels en todos los nuevos componentes interactivos
- [ ] Focus ring funcional en nuevos componentes
- [ ] `prefers-reduced-motion` respetado en nuevas animaciones
- [ ] Contraste de colores verificado

### Protección de Datos (RGPD/LOPDGDD)

- [ ] Registro de Actividades de Tratamiento (RAT) creado y completo (Art. 30)
- [ ] Campo `birthdate` eliminado del modelo de estudiante (minimización, Art. 5.1.c)
- [ ] Logs de Pino no contienen PII de estudiantes (seudonimización, Art. 25)
- [ ] Endpoint de borrado efectivo (hard delete) funcional (Art. 17)
- [ ] Política de retención definida con plazos concretos (Art. 5.1.e)
- [ ] Endpoint de exportación de datos funcional (Art. 20)
- [ ] EIPD/DPIA documentada (Art. 35)
- [ ] Consentimiento parental requerido al crear estudiante (Art. 8 RGPD + Art. 7 LOPDGDD)
- [ ] DTOs de analytics usan pseudoIds en lugar de identificadores directos

### Refactor RFID Cards (ADR-012)

- [x] ADR-012 documentado en `backend/docs/Architecture_Decisions.md`
- [ ] Modelo Card eliminado (`backend/src/models/Card.js` no existe)
- [ ] Campo `cardId` eliminado de CardDeck y GameSession (modelos, validadores, DTOs)
- [ ] `POST /api/decks` acepta mappings con solo `uid` (sin `cardId`)
- [ ] `GET /api/cards` devuelve 404 (ruta eliminada)
- [ ] Modo RFID `CARD_REGISTRATION` eliminado; `CARD_ASSIGNMENT` mantenido
- [ ] Seeders funcionan sin colección Card (`npm run seed:reset`)
- [ ] Frontend: `cardsAPI` eliminada, páginas admin de cartas eliminadas
- [ ] Crear/editar mazo vía escaneo en vivo funciona
- [ ] Gameplay inalterado (matching por uid en memoria)
- [ ] Todos los tests pasan (`npm test` backend + frontend)

### Rendimiento

- [ ] Bundle size no incrementa significativamente (< 1%)
- [ ] No se introducen re-renders innecesarios

---

## Verificación End-to-End

1. `cd backend && npm test` — Tests backend pasan
2. `cd frontend && npm test` — Tests frontend pasan
3. `cd frontend && npm run lint` — Sin errores
4. `cd frontend && npm run build` — Build exitoso
5. Arrancar dev servers (`docker compose up -d` o `npm run dev` en ambos)
6. **Login** → Verificar colores migrados, formulario funcional
7. **Dashboard** → Verificar:
   - 8 KPIs con datos reales y trends calculados
   - StudentsList con alumnos reales (no mock)
   - DistributionChart con datos reales (4 barras)
   - StudentProgressChart funcional
   - DifficultyHeatmap con leyenda y tooltips mejorados
   - AlertsPanel con insights accionables
   - Filtros interactivos funcionando
8. **Perfil Estudiante** → Click en alumno del StudentsList:
   - KPIs individuales visibles
   - Gráfico de progreso temporal
   - Rendimiento por contexto y mecánica
   - Historial de partidas
   - Fortalezas y debilidades
9. **Vista Comparativa** → Navegar desde sidebar "Mis Alumnos":
   - Tabla con todos los estudiantes
   - Ordenación y filtros funcionando
   - Click en estudiante navega al perfil
10. **Sesiones y Mazos** → Verificar breadcrumbs en páginas de detalle
11. **Partida** → Iniciar una partida y verificar:
    - GameOverScreen con resumen expandido
    - CharacterMascot con micro-animaciones
    - ChallengeDisplay con feedback mejorado
12. **Responsive** → Verificar en viewport de 768px y 1024px
13. **Protección de datos** → Verificar:
    - Crear estudiante sin consentimiento → debe fallar (400)
    - Crear estudiante con consentimiento → debe funcionar
    - `birthdate` no aparece en respuestas de la API para estudiantes
    - `GET /api/users/:id/export-data` retorna JSON descargable con todos los datos
    - `DELETE /api/users/:id/data` con `confirmDeletion: true` elimina todos los datos
    - Logs de Pino no contienen nombres de estudiantes (verificar con `grep`)
    - `npm run data:retention --dry-run` genera informe sin modificar datos
14. **RFID Cards (ADR-012)** → Verificar:
    - `GET /api/cards` devuelve 404
    - `POST /api/decks` con mappings sin `cardId` → 201
    - `GET /api/decks/:id` no contiene `cardId` en mappings
    - Crear sesión desde mazo → funciona sin validar Card collection
    - Panel admin → no existe sección de gestión de tarjetas
    - `npm run seed:reset` → ejecuta sin errores
15. **Documentación** → Verificar existencia de:
    - `backend/docs/RAT_Registro_Actividades_Tratamiento.md`
    - `documentation/EIPD_Evaluacion_Impacto.md`
    - `documentation/Sprint5_Proteccion_Datos_Menores.md`
    - ADR-012 en `backend/docs/Architecture_Decisions.md`
