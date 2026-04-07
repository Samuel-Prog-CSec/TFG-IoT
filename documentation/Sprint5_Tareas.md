# Sprint 5 - Plan de Tareas (Consolidado)

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)
**Autor:** Samuel Blanchart Pérez
**Duración:** 4-6 semanas (Marzo - Abril 2026)
**Versión objetivo:** 1.0.0
**Última actualización:** 26-03-2026 (T-802, T-803, T-804, T-806, T-807 completadas — eje RFID Cards 100%)

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

### Nota sobre consolidación

Este documento consolida las 57 tareas originales en **31 tareas** (46% menos) agrupando tareas pequeñas (XS/S) con sus dependencias directas y fusionando tareas con alto solapamiento. Cada tarea consolidada indica las tareas originales que absorbe. **Todas las sub-tareas y criterios de aceptación originales se han preservado íntegramente.**

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

### T-516: 🔧 Unificar flujo de errores centralizado (validación, notFound, asyncHandler) ✅

**Consolida:** T-516 + T-517 + T-518
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** Ninguna
**Origen:** Auditoría — `middlewares/validation.js` responde directamente, saltándose errorHandler, Sentry y logging; `notFoundHandler` no usa flujo centralizado; 72 bloques try/catch manuales en 12 controllers

**Descripción:**
Tres problemas relacionados con el flujo de errores:
1. Los tres middlewares de validación (`validateBody`, `validateQuery`, `validateParams`) capturan `ZodError` y responden directamente con `res.status(400).json(...)`, bypaseando el errorHandler centralizado. Deben usar `next(new ValidationError(...))` con los errores Zod formateados.
2. `notFoundHandler` responde directamente con `res.status(404).json(...)` en lugar de pasar por el error handler, lo que significa que las rutas no encontradas no se registran en el logging de errores estructurado.
3. Todos los controllers usan `async (req, res, next) => { try { ... } catch (error) { next(error); } }` manualmente. Un wrapper `asyncHandler` eliminará este boilerplate. Express 5.x tiene soporte nativo para errores async en route handlers, pero NO en todos los casos de middlewares, por lo que el wrapper sigue siendo valioso.

**Sub-tareas:**

**Fase A — Validación Zod (ex T-516):**

1. Modificar los tres middlewares en `middlewares/validation.js` para construir `ValidationError` y llamar `next(error)`.
2. Actualizar `errorHandler.js` para detectar `ValidationError`/`ApiValidationError` y formatear la respuesta preservando `{ success: false, message, errors: [{field, message}] }`.
3. Revisar que `let error = { ...err }` en `errorHandler.js` no pierda propiedades de la cadena de prototipos.
4. Actualizar tests existentes para verificar el flujo centralizado.
5. Ejecutar suite completa de tests.

**Fase B — notFoundHandler (ex T-517):**

6. Modificar `notFoundHandler` para pasar por el flujo centralizado (construir `AppError` con 404 y llamar `next()`).
7. Agregar test de que ruta inexistente retorna 404 con formato estándar.
8. Verificar que las rutas 404 se registran en el logging estructurado de Pino.

**Fase C — asyncHandler (ex T-518):**

9. Crear `utils/asyncHandler.js` con función que capture errores sync y async y los pase a `next()`.
10. Agregar test unitario para `asyncHandler`.
11. Migrar UN controller como piloto (sugerido: `gameMechanicController.js`, 6 handlers).
12. Si el piloto es exitoso, migrar progresivamente el resto.
13. Documentar relación con Express 5 async error handling.

**Criterios de Aceptación:**

- [x] Los tres middlewares usan `next(new ValidationError(...))` en lugar de `res.status(400).json()`
- [x] El `errorHandler` formatea los errores de validación con el array `errors` preservado
- [x] La respuesta HTTP sigue siendo 400 con el mismo formato JSON
- [x] Los errores de validación aparecen en los logs de Pino como `warn`
- [x] Todos los tests existentes pasan sin modificaciones al contrato de respuesta
- [x] Las rutas 404 se registran en el logging estructurado de Pino
- [x] Test de integración cubre el caso de ruta inexistente
- [x] `utils/asyncHandler.js` creado y exportado
- [x] El wrapper captura errores síncronos y asíncronos
- [x] Al menos un controller migrado y funcionando
- [x] Tests existentes del controller piloto pasan sin cambios
- [x] Documentación inline explicando el patrón

**Archivos afectados:** `backend/src/middlewares/validation.js`, `backend/src/middlewares/errorHandler.js`, `backend/src/utils/errors.js`, `backend/src/utils/asyncHandler.js` (nuevo), `backend/src/controllers/gameMechanicController.js` (piloto)

---

### T-601: 📊 Backend — Nuevos endpoints de analytics para dashboards ✅

**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-516 (recomendado: usar asyncHandler y errorHandler unificado)
**Origen:** Dashboard frontend necesita datos que actualmente no existen en la API

**Descripción:**
El dashboard actual depende de 3 endpoints (`/classroom/summary`, `/classroom/comparison`, `/classroom/difficulties`). Para las mejoras planificadas se necesitan **5 nuevos endpoints** que aprovechen los datos ricos ya almacenados en `GamePlay.events[]`, `GamePlay.metrics` y `User.studentMetrics`. Sin estos endpoints, las tareas T-602, T-603, T-604 y T-606 están bloqueadas.

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

- [x] `GET /api/analytics/classroom/students` retorna lista con métricas
- [x] `GET /api/analytics/classroom/distribution` retorna distribución en 4 rangos
- [x] `GET /api/analytics/classroom/trends?timeRange=7d` retorna trends con cambio porcentual
- [x] `GET /api/analytics/student/:id/summary` retorna resumen completo
- [x] Todos requieren autenticación y rol teacher/super_admin
- [x] Validación Zod aplicada en todos los endpoints
- [x] Tests de integración para cada nuevo endpoint
- [x] `npm test` pasa en backend sin regresiones
- [x] Endpoints extra: `GET /classroom/heatmap` y `GET /classroom/rankings`

---

### T-602: 📊 Dashboard — Eliminar datos mock y conectar datos reales ✅

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

- [x] `StudentsList` muestra estudiantes reales del profesor autenticado
- [x] `DistributionChart` muestra distribución real de rendimiento
- [x] StatCards muestran trends calculados (comparación período actual vs anterior)
- [x] Zero datos mock/hardcodeados en el dashboard
- [x] Click en estudiante navega a su perfil
- [x] Loading states (skeleton) durante carga de nuevos endpoints
- [x] `npm test` y `npm run build` pasan

---

### T-603: 📊 Nueva página — Perfil Individual de Estudiante (con comparativa de clase) ✅

**Consolida:** T-603 + T-620
**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-601
**Origen:** No existe forma de que el profesor vea el detalle de un alumno individual

**Descripción:**
Crear la página `/students/:studentId` que permita al profesor consultar el progreso detallado de un estudiante individual. Pieza fundamental del TFG: los profesores deben poder entender las fortalezas, debilidades y evolución de cada alumno de forma visual e intuitiva, incluso sin conocimientos técnicos. Incluye overlay de promedio de clase en el gráfico de progreso temporal para dar contexto comparativo.

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

4. **Gráfico: Progreso temporal (LineChart/AreaChart) con overlay de promedio de clase (ex T-620):**
   - Datos individuales con selector 7d/30d
   - Línea punteada con promedio de clase para comparar
   - Leyenda clara diferenciando alumno vs clase
   - Tooltip muestra ambos valores (alumno y promedio de clase)

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
- `frontend/src/components/dashboard/StudentProgressChart.jsx` — Overlay de promedio de clase

**Criterios de Aceptación:**

- [x] Página accesible en `/students/:studentId` con autenticación
- [x] Header muestra nombre, avatar, aula, badge de rendimiento, última actividad
- [x] 4-6 KPIs individuales con valores reales y comparativa con clase
- [x] Gráfico de progreso temporal funcional con selector 7d/30d
- [x] Línea punteada de promedio de clase visible en el gráfico de progreso
- [x] Leyenda clara diferenciando alumno vs clase, tooltip muestra ambos valores
- [x] Gráfico de rendimiento por contexto con barras coloreadas
- [x] Gráfico de rendimiento por mecánica funcional
- [x] Historial de partidas recientes con al menos 10 entradas
- [x] Sección de fortalezas/debilidades derivada de datos
- [x] Skeleton loaders durante carga
- [x] Responsive: legible en ≥768px
- [x] Navegable desde Dashboard y desde breadcrumb
- [x] `npm test` y `npm run build` pasan

---

### T-701: 🛡️ Auditoría de datos personales, RAT y Evaluación de Impacto (EIPD) ✅

**Consolida:** T-701 + T-707
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** Ninguna
**Origen:** Auditoría de protección de datos — Obligación del Art. 30 RGPD (RAT) y Art. 35 RGPD (EIPD)

**Descripción:**
La plataforma trata datos personales de menores de 4-8 años (colectivo especialmente protegido) sin disponer de un inventario formal de tratamientos ni un Registro de Actividades de Tratamiento (RAT). El Art. 30 RGPD obliga a todo responsable a mantener este registro. Además, el RAT es el input fundamental para la Evaluación de Impacto (EIPD): la AEPD incluye el tratamiento de datos de **menores de 14 años** entre los criterios que obligan a realizar una EIPD. La plataforma cumple al menos dos criterios: (1) datos de sujetos vulnerables (menores de 4-8 años) y (2) evaluación sistemática de aspectos personales (rendimiento educativo, patrones de respuesta, tiempos). Esta tarea cubre tanto el inventario como la evaluación de impacto.

**Sub-tareas:**

**Fase A — Auditoría y RAT (ex T-701):**

1. Catalogar cada actividad de tratamiento de datos personales en la plataforma:
   - Creación y gestión de cuentas de estudiantes
   - Registro de partidas (GamePlay) y eventos de interacción
   - Analytics y métricas de rendimiento
   - Autenticación y gestión de sesiones (profesores)
   - Logging de seguridad
2. Para cada actividad, documentar: finalidad, base legal, categorías de interesados, categorías de datos, destinatarios, plazos de conservación (actuales y propuestos), medidas de seguridad.
3. Crear documento formal `backend/docs/RAT_Registro_Actividades_Tratamiento.md`.
4. Generar script de inventario automático (`npm run data:audit`) que recorra los modelos Mongoose y liste los campos que contienen datos personales, comparándolos con el RAT.

**Fase B — EIPD (ex T-707):**

5. Crear documento `documentation/EIPD_Evaluacion_Impacto.md` con las secciones requeridas por el Art. 35.7 RGPD:
   - Descripción sistemática de las operaciones de tratamiento y sus fines
   - Evaluación de la necesidad y proporcionalidad del tratamiento
   - Evaluación de los riesgos para los derechos y libertades de los interesados
   - Medidas previstas para afrontar los riesgos (enlazar con tareas T-702 a T-710)
6. Incluir matriz de riesgos con probabilidad e impacto para cada riesgo identificado.
7. Documentar las medidas de mitigación implementadas y su eficacia esperada.
8. Referenciar el RAT como base del análisis.

**Criterios de Aceptación:**

- [ ] Documento RAT creado con formato conforme al Art. 30 RGPD
- [ ] Todas las actividades de tratamiento de datos personales inventariadas (mínimo 5)
- [ ] Cada actividad tiene base legal identificada y justificada
- [ ] Script `data:audit` ejecutable y genera informe legible
- [ ] Plazos de conservación definidos para cada categoría de datos
- [ ] Documento EIPD creado con las 4 secciones requeridas por Art. 35.7
- [ ] Mínimo 8 riesgos identificados y evaluados con probabilidad e impacto
- [ ] Cada riesgo tiene al menos una medida de mitigación asociada
- [ ] Referencias a normativa aplicable (RGPD, LOPDGDD, directrices AEPD)
- [ ] Enlace con el RAT y las medidas técnicas implementadas en el Sprint

**Archivos afectados:** `backend/docs/RAT_Registro_Actividades_Tratamiento.md` (nuevo), `backend/scripts/dataAudit.js` (nuevo), `backend/package.json` (nuevo script), `documentation/EIPD_Evaluacion_Impacto.md` (nuevo)

---

### T-702: 🛡️ Minimización de datos y consentimiento parental para estudiantes ✅

**Consolida:** T-702 + T-708
**Prioridad:** P0 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 5.1.c RGPD (minimización), Art. 8 RGPD + Art. 7 LOPDGDD (consentimiento)

**Descripción:**
Dos cambios necesarios en el modelo de datos de estudiantes:
1. **Minimización:** El modelo `User` almacena `profile.birthdate` (fecha de nacimiento completa) cuando solo se necesita `profile.age`. Una fecha de nacimiento completa combinada con aula y nombre tiene alto potencial identificativo. Además, `lastLoginAt` se mantiene para estudiantes aunque nunca hacen login.
2. **Consentimiento:** El Art. 7 LOPDGDD fija en 14 años la edad mínima para consentir en España. Para los alumnos de 4-8 años, el consentimiento debe proceder del titular de la patria potestad. Actualmente no se registra este consentimiento.

**Sub-tareas:**

**Fase A — Minimización de datos (ex T-702):**

1. Crear script de migración que convierta `profile.birthdate` existentes a `profile.age` (si `age` no está ya asignado) y luego elimine el campo `birthdate` para usuarios con role `student`.
2. Modificar el modelo `User.js`: eliminar `profile.birthdate` del schema para role `student` (mantenerlo como opcional para `teacher`).
3. Actualizar validadores Zod en `userValidator.js` o `commonValidator.js`: `birthdate` no debe aceptarse al crear/actualizar estudiantes.
4. Actualizar DTOs: eliminar `birthdate` del DTO de estudiante.
5. Revisar seeders: eliminar `birthdate` de los datos de seed de estudiantes.

**Fase B — Consentimiento parental (ex T-708):**

6. Añadir campo `consent` al schema de `User` para role `student`:
   ```
   consent: {
     granted: Boolean (required for students),
     grantedBy: String (nombre del tutor legal),
     grantedAt: Date,
     purposes: [String] (e.g., ['educational_tracking', 'performance_analytics']),
     policyVersion: String
   }
   ```
7. Modificar validador de creación de estudiantes: requerir `consent.granted = true` y `consent.grantedBy` obligatorio.
8. Actualizar DTO de estudiante para incluir estado del consentimiento (sin exponer `grantedBy` en endpoints públicos).
9. Crear endpoint `PATCH /api/users/:id/consent` para actualizar/revocar el consentimiento.
10. Si el consentimiento se revoca: el estudiante pasa a `status: 'inactive'` y no puede participar en partidas.
11. Frontend: añadir sección de consentimiento en el formulario de creación de estudiante con checkbox explícito y campo de nombre del tutor.
12. Ejecutar tests para verificar que no hay regresiones.

**Criterios de Aceptación:**

- [ ] El campo `profile.birthdate` no existe en documentos de estudiantes tras migración
- [ ] La API rechaza `birthdate` al crear/actualizar estudiantes (400 Bad Request)
- [ ] El DTO de estudiante no expone `birthdate`
- [ ] Los seeders no incluyen `birthdate` para estudiantes
- [ ] No se puede crear un estudiante sin `consent.granted = true` y `consent.grantedBy`
- [ ] Endpoint `PATCH /api/users/:id/consent` permite actualizar/revocar
- [ ] La revocación desactiva al estudiante automáticamente
- [ ] El DTO incluye estado del consentimiento
- [ ] Frontend muestra campos de consentimiento al crear estudiante
- [ ] `npm test` pasa en backend sin regresiones
- [ ] `npm run build` pasa en frontend

**Archivos afectados:** `backend/src/models/User.js`, `backend/src/utils/dtos.js`, `backend/src/validators/userValidator.js`, `backend/src/seeders/`, `backend/scripts/migrateBirthdate.js` (nuevo), `backend/src/controllers/userController.js`, `backend/src/routes/users.js`, `frontend/src/pages/` (formulario de creación de estudiante)

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

### T-802: 🃏 Backend — Eliminar `cardId` de esquemas Mongoose y validadores Zod ✅

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

- [x] `CardDeck.cardMappings` no contiene campo `cardId`
- [x] `GameSession.cardMappings`, `boardLayout` y `associationChallengePlan` no contienen `cardId`
- [x] Validador de boardLayout en GameSession usa `uid` en vez de `cardId`
- [x] Validadores Zod no requieren `cardId` en ningún mapping schema
- [x] Validación de unicidad de UIDs dentro de un mazo se mantiene
- [x] `npm run lint` pasa en backend

**Archivos afectados:** `backend/src/models/CardDeck.js`, `backend/src/models/GameSession.js`, `backend/src/validators/cardDeckValidator.js`, `backend/src/validators/gameSessionValidator.js`

---

### T-803: 🃏 Backend — Refactorizar lógica de negocio y DTOs sin Card ✅

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

- [x] `cardDeckController` no importa `cardRepository` ni valida existencia de cartas
- [x] `gameSessionService` no importa `cardRepository` ni valida cartas
- [x] Todos los lookups de mappings en `sessionValidationHelpers` usan `uid` como key
- [x] DTOs de Card eliminados de `dtos.js`
- [x] DTOs de mapping/boardLayout/associationPlan no contienen `cardId`
- [x] `POST /api/decks` funciona con mappings que solo tienen `uid` (sin `cardId`)
- [x] `npm run lint` pasa en backend

**Archivos afectados:** `backend/src/controllers/cardDeckController.js`, `backend/src/services/gameSessionService.js`, `backend/src/controllers/helpers/sessionValidationHelpers.js`, `backend/src/controllers/gameSessionController.js`, `backend/src/services/gameEngine.js`, `backend/src/utils/dtos.js`

---

## P1 — Prioridad Alta

### T-503: ⚛️ Migrar tokens de color en WizardStepper y SessionsPage ✅

**Consolida:** T-503 + T-506
**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** 13+ colores hardcodeados en WizardStepper; 31 ocurrencias en SessionsPage

**Descripción:**
`WizardStepper.jsx` y su variante compacta contienen 13+ usos de colores Tailwind crudos y valores `rgba()` inline. `SessionsPage.jsx` tiene 31 usos de colores raw en cards de sesión, iconos, textos y bordes. Ambos deben usar los tokens semánticos de `index.css`.

**Sub-tareas:**

**Fase A — WizardStepper (ex T-503):**

1. Reemplazar en `getStepButtonClassName`: `bg-indigo-600` → `bg-accent-indigo`, `bg-emerald-500` → `bg-success-base`, `bg-slate-900` → `bg-background-deep`, etc.
2. Reemplazar `rgba(99, 102, 241, ...)` de animación pulse por `var(--color-accent-indigo)` con opacidades.
3. Reemplazar en `getStepLabelClassName`: `text-indigo-400` → `text-accent-indigo`, `text-emerald-400` → `text-success-base`.
4. Reemplazar partículas y barra de progreso inline.
5. Aplicar mismos reemplazos en `WizardStepperCompact`.

**Fase B — SessionsPage (ex T-506):**

6. **Header:** `bg-indigo-500/20 text-indigo-300` → `bg-accent-indigo/20 text-accent-indigo`
7. **Textos:** `text-white` → `text-text-primary`; `text-slate-400` → `text-text-muted`
8. **Bordes por estado:** `border-l-amber-500/70` → `border-l-warning-base/70`; `border-l-emerald-500/70` → `border-l-success-base/70`
9. **Stats icon backgrounds:** mapear a tokens `accent-indigo`, `accent-cyan`, `warning-base`, `success-base`
10. **Fondos y error card:** `bg-white/5` → `bg-glass-bg`; `border-rose-500/30` → `border-error-base/30`

**Criterios de Aceptación:**

- [x] Cero usos de `indigo-*`, `emerald-*`, `slate-*` raw en WizardStepper.jsx (excepto confetti)
- [x] Cero valores `rgba(...)` inline en WizardStepper
- [x] Cero colores Tailwind crudos en SessionsPage.jsx
- [x] Aspecto visual idéntico en ambos componentes
- [x] `npm test` y `npm run build` pasan

---

### T-507: ⚛️ Migrar tokens de color en `GameSession.jsx` y sub-componentes ✅

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

- [x] Colores hardcodeados reducidos a < 5 (justificados) — 0 restantes + 3 TOKEN-EXCEPTION documentadas
- [x] Aspecto visual idéntico
- [x] `npm test` pasa

---

### T-519: 🔧 Utilidades backend reutilizables (responseHelper, filterBuilder) ✅

**Consolida:** T-519 + T-530
**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-516
**Origen:** Auditoría — ~70 instancias de `{ success: true }` construidas manualmente; `buildUsersFilter`, `buildPlaysFilter` replican lógica

**Descripción:**
Dos utilidades para reducir boilerplate en controllers:
1. **responseHelper**: Funciones centralizadas para respuestas API (`sendSuccess`, `sendCreated`, `sendPaginated`, `sendNoContent`).
2. **filterBuilder**: Factory genérica `buildFilter(queryParams, fieldMappings, options)` con soporte para `exact`, `regex`, `range`, `in`, `computed`.

**Sub-tareas:**

**Fase A — responseHelper (ex T-519):**

1. Crear `utils/responseHelper.js` con funciones documentadas.
2. Integrar `toPaginatedDTOV1` dentro de `sendPaginated`.
3. Definir y documentar contrato de respuesta estándar.
4. Migrar controller piloto (`cardController.js`).
5. Tests unitarios para cada función.

**Fase B — filterBuilder (ex T-530):**

6. Crear `utils/filterBuilder.js`.
7. Migrar `buildUsersFilter` como piloto.
8. Tests unitarios para cada tipo de mapping.

**Criterios de Aceptación:**

- [x] `utils/responseHelper.js` creado con funciones documentadas
- [x] Al menos un controller migrado y usando el helper
- [x] Respuestas mantienen el mismo formato JSON (retrocompatibilidad)
- [x] El frontend no necesita cambios
- [x] `utils/filterBuilder.js` creado con soporte para los 5 tipos
- [x] Al menos un controller migrado al filterBuilder
- [x] Builder escapa valores regex automáticamente
- [x] Tests unitarios para ambas utilidades

**Archivos afectados:** `backend/src/utils/responseHelper.js` (nuevo), `backend/src/utils/filterBuilder.js` (nuevo), `backend/src/utils/dtos.js`, `backend/src/controllers/cardController.js` (piloto responseHelper), `backend/src/controllers/userController.js` (piloto filterBuilder)

---

### T-520: 🔧 Completar el patrón Repository (write ops, transacciones, batch) ✅

**Consolida:** T-520 + T-533 + T-534
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** Auditoría — repositorios sin update/delete; ~25 llamadas directas a `.save()` en controllers/services; sin soporte de transacciones ni batch

**Descripción:**
Los repositorios carecen de métodos de actualización y eliminación. Esta tarea completa el patrón Repository con tres capas: operaciones de escritura base, soporte de transacciones, y operaciones batch.

**Sub-tareas:**

**Fase A — Operaciones de escritura (ex T-520):**

1. Ampliar `baseRepository.js` con funciones genéricas: `applyUpdateOptions(Model, id, update, options)`.
2. Agregar a cada repositorio (7 total): `updateById`, `updateOne`, `deleteById`, `deleteMany`.
3. Agregar `findByIdAndUpdate` como wrapper con `{ new: true, runValidators: true }`.
4. En `gameSessionRepository` agregar `save(doc)` que encapsule `doc.save()`.
5. Tests unitarios. NO migrar controllers/services en esta tarea.

**Fase B — Transacciones (ex T-533):**

6. Crear `utils/withTransaction.js` con función `withTransaction(callback)`.
7. Agregar soporte de `session` en métodos de `baseRepository.js`.
8. Test demuestra commit y rollback.
9. Documentación sobre requisitos de replica set.

**Fase C — Operaciones batch (ex T-534):**

10. Agregar `insertMany` y `bulkWrite` a `baseRepository.js`.
11. Exponer en repositorios relevantes (cardDeck, gamePlay, user).
12. Tests unitarios.

**Criterios de Aceptación:**

- [x] `baseRepository.js` tiene funciones genéricas de update/delete
- [x] Los 6 repositorios exponen `updateById`, `updateOne`, `deleteById`, `deleteMany`
- [x] Métodos de update soportan mismas opciones que lectura
- [x] Tests unitarios cubren CRUD completo
- [x] Tests existentes pasan sin regresiones
- [x] `utils/withTransaction.js` creado y documentado
- [x] Métodos del repository aceptan `session` como opción
- [x] Test demuestra commit y rollback
- [x] Documentación sobre requisitos de replica set
- [x] `insertMany` y `bulkWrite` disponibles en repository base
- [x] Al menos 3 repositorios concretos los exponen

**Archivos afectados:** `backend/src/repositories/baseRepository.js`, `backend/src/repositories/*.js`, `backend/src/utils/withTransaction.js` (nuevo)

---

### T-521: 🔧 Rate limiting en acciones de play y migración a Redis store ✅

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

- [x] `/api/plays/:id/pause` y `resume` tienen rate limiting
- [x] En producción, rate limiters usan Redis
- [x] En desarrollo/test, usan in-memory
- [x] Degradación graceful si Redis no disponible
- [x] Tests cubren nuevos rate limits

**Archivos afectados:** `backend/src/routes/plays.js`, `backend/src/config/security.js`, `backend/package.json`

---

### T-604: 📊 Dashboard — KPIs expandidos, filtros interactivos, alertas inteligentes y heatmap mejorado ✅

**Consolida:** T-604 + T-605 + T-607 + T-615
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-601, T-602
**Origen:** Dashboard actual solo tiene 4 KPIs básicos sin filtros; AlertsPanel solo tiene 2 tipos de alerta; Heatmap no es accionable; select nativo del navegador

**Descripción:**
Mejora integral del dashboard con: KPIs adicionales, filtros interactivos, sistema de alertas inteligentes, heatmap mejorado y reemplazo del select nativo por `SelectPremium`.

**Sub-tareas:**

**Fase A — KPIs expandidos y filtros (ex T-604):**

1. **Nuevos KPIs (8 total):** Tasa de Acierto Global, Tiempo Medio de Respuesta, Estudiantes Activos, Tasa de Completado.
2. **Filtros interactivos:** Selector de Contexto Temático, Mecánica de Juego, Rango de fechas (7d, 30d, 90d, Todo). Filtros afectan todos los componentes.
3. **Sección de Actividad Reciente (timeline):** Últimas 5-8 partidas por cualquier alumno.

**Fase B — Alertas inteligentes (ex T-605):**

4. **Nuevos tipos de alerta:** `inactive` (>7 días sin jugar), `declining` (bajada >15%), `improving` (subida >15%), `streak` (5+ partidas >80%), `difficulty_spike` (>60% error rate).
5. **Acciones directas:** Cada alerta con botón contextual que navega al perfil o filtra.
6. **Estado vacío positivo:** Card con CheckCircle verde y "¡Todo marcha bien!" en vez de `return null`.
7. **Mejoras visuales:** Iconos diferenciados, animación escalonada, timestamps relativos, máximo 5 visibles.

**Fase C — DifficultyHeatmap mejorado (ex T-607):**

8. **Leyenda visual descriptiva:** 3 niveles (Verde "Dominado", Ámbar "Necesita práctica", Rojo "Dificultad alta").
9. **Tooltips enriquecidos:** Número de estudiantes, sugerencia textual, evolución.
10. **Mejorar visualización:** Evaluar grid/tabla visual (cuadrícula con celdas coloreadas) en vez de ScatterChart.
11. **Responsividad:** Nombres abreviados o rotados en viewport pequeño.

**Fase D — Reemplazar select nativo (ex T-615):**

12. Reemplazar `<select>` nativo en Dashboard Header y `ChartSection.jsx` por `SelectPremium` del design system.

**Archivos a Modificar:**

- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/dashboard/StatCard.jsx`
- `frontend/src/components/dashboard/AlertsPanel.jsx`
- `frontend/src/components/dashboard/DifficultyHeatmap.jsx`
- `frontend/src/components/dashboard/ChartSection.jsx`
- `frontend/src/services/analytics.js`

**Criterios de Aceptación:**

- [x] 8 KPIs visibles con datos reales
- [x] Filtros de contexto, mecánica y rango de fechas funcionales
- [x] Filtros afectan todos los componentes del dashboard
- [x] Sección de actividad reciente con partidas reales
- [x] Al menos 5 tipos de alerta diferentes derivados de datos
- [x] Cada alerta tiene acción directa que navega a contenido relevante
- [x] Estado vacío muestra mensaje positivo en vez de `null`
- [x] Alertas se generan automáticamente de los datos
- [x] Leyenda clara con 3 niveles de dificultad en heatmap
- [x] Tooltips con información accionable en heatmap
- [x] Visualización intuitiva para personas no técnicas
- [x] Cero `<select>` nativos en Dashboard y ChartSection
- [x] Accesibilidad mantenida en SelectPremium
- [x] Layout responsivo en ≥768px
- [x] `npm test` y `npm run build` pasan

---

### T-606: 📊 Nueva página — Vista Comparativa de Estudiantes (con exportación CSV y navegación) ✅

**Consolida:** T-606 + T-617 + T-618
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-601, T-603
**Origen:** No existe forma de comparar rendimiento entre estudiantes; profesores necesitan exportar datos; sidebar sin enlace a nueva página

**Descripción:**
Crear la página `/analytics/students` con tabla interactiva de todos los estudiantes, exportación CSV y navegación desde sidebar.

**Sub-tareas:**

**Fase A — Tabla interactiva y página (ex T-606):**

1. **Ruta y página base:** `/analytics/students` (protegida, lazy loading).
2. **Tabla interactiva:** Columnas (Avatar+Nombre, Aula, Partidas, Score, Tasa Acierto, Tiempo, Última Actividad, Estado). Ordenable, filtrable por tier, búsqueda por nombre. Click → `/students/:studentId`.
3. **Resumen visual:** DistributionChart compacto + KPIs resumidos.
4. **Indicador última actividad:** Coloreado (verde <3d, ámbar 3-7d, rojo >7d).
5. **Empty state** con CTA hacia gestión de estudiantes.

**Fase B — Exportación CSV (ex T-617):**

6. Crear función `exportToCSV` en `frontend/src/lib/utils.js`. Generación client-side con `Blob` + `URL.createObjectURL`, sin dependencias externas.
7. Botón "Exportar CSV" en StudentsAnalytics (y opcionalmente en Dashboard).

**Fase C — Navegación sidebar (ex T-618):**

8. Enlace "Mis Alumnos" en sidebar para la nueva página.
9. Badge de notificación en "Dashboard" si hay alertas activas.

**Archivos a Crear/Modificar:**

- `frontend/src/pages/StudentsAnalytics.jsx` — **NUEVO**
- `frontend/src/constants/routes.js` — Añadir ruta
- `frontend/src/App.jsx` — Registrar ruta
- `frontend/src/lib/utils.js` — Función `exportToCSV`
- `frontend/src/components/layout/AppLayout.jsx` — Sidebar enlaces y badge

**Criterios de Aceptación:**

- [x] Página accesible en `/analytics/students`
- [x] Tabla con todos los estudiantes y métricas reales
- [x] Ordenable por todas las columnas
- [x] Filtrable por tier y búsqueda por nombre
- [x] Click en estudiante navega a su perfil (T-603)
- [x] Resumen visual de distribución de clase
- [x] Skeleton loader durante carga
- [x] Responsive en ≥768px
- [x] Botón "Exportar CSV" visible en vista de estudiantes
- [x] CSV generado correctamente con datos reales
- [x] Descarga automática del archivo
- [x] Sin dependencias externas para CSV
- [x] Badge de notificación visible cuando hay alertas
- [x] Enlace "Mis Alumnos" funcional en sidebar
- [x] `npm test` y `npm run build` pasan

---

### T-608: ⚛️ Migrar tokens de color en Login, Register y ContextsPage ✅

**Consolida:** T-608 + T-610
**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** Ninguna
**Origen:** Login.jsx tiene ~20 colores hardcodeados; Register.jsx patrón similar; ContextsPage tiene ~30 colores hardcodeados

**Descripción:**
Login y Register son la primera impresión del profesor con la plataforma. ContextsPage muestra los contextos temáticos. Todas usan extensivamente colores Tailwind crudos en vez de design tokens OKLCH.

**Sub-tareas:**

**Fase A — Login y Register (ex T-608):**

1. **Login.jsx — Migración de colores (~20 ocurrencias):** `bg-slate-950` → `bg-background-deep`, gradientes → tokens `accent-indigo`, `brand-base`, `accent-pink`, etc.
2. **Register.jsx — Mismo patrón de migración.**
3. **Verificación visual** antes/después en mobile y desktop.

**Fase B — ContextsPage (ex T-610):**

4. Migrar `ContextsPage.jsx` y sub-componentes inline (ContextCard, CreateContextModal) a design tokens siguiendo la tabla de mapeo estándar.

**Archivos a Modificar:**

- `frontend/src/pages/Login.jsx`
- `frontend/src/pages/Register.jsx`
- `frontend/src/pages/ContextsPage.jsx`

**Criterios de Aceptación:**

- [x] Cero colores Tailwind crudos en Login.jsx y Register.jsx (excepto confetti/canvas)
- [x] Cero colores Tailwind crudos en ContextsPage.jsx
- [x] Cero valores `rgba()` inline
- [x] Aspecto visual idéntico al actual en los tres archivos
- [x] Verificación visual en mobile y desktop
- [x] `npm run build` pasa

---

### T-609: 📊 Mejoras visuales completas en la experiencia de partida ✅

**Consolida:** T-609 + T-613 + T-619
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** La pantalla de juego puede mejorar en feedback visual e inmersión para niños de 4-6 años; GameOverScreen básico; CharacterMascot sin personalidad

**Descripción:**
Mejora integral de la experiencia visual de las partidas: GameOverScreen con resumen expandido, ChallengeDisplay con feedback visual, CharacterMascot con micro-animaciones y personalidad, y HUD mejorado.

**Sub-tareas:**

**Fase A — GameOverScreen expandido (ex T-609 sub-tarea 1 + T-613):**

1. **Resumen expandido:** Comparativa con mejor partida anterior, ampliar mensajes de feedback a 6-8 niveles, animación "progreso desbloqueado".
2. **Desglose por ronda:** Expandible, con detalle de cada ronda.

**Fase B — ChallengeDisplay — Feedback visual (ex T-609 sub-tarea 2):**

3. Glow verde + partículas en acierto, shake + flash rojo en error, transiciones suaves.

**Fase C — CharacterMascot — Personalidad y micro-animaciones (ex T-609 sub-tarea 3 + T-619):**

4. **Micro-animaciones por estado:** Parpadeo idle, salto happy, wave encouraging, cabeceo sad, brazos arriba en acierto.
5. **Burbujas de diálogo** con mensajes rotativos motivacionales.

**Fase D — HUD — Legibilidad (ex T-609 sub-tarea 4):**

6. Indicador de progreso de rondas más visible, barra de completado.

**Archivos a Modificar:**

- `frontend/src/components/game/GameOverScreen.jsx`
- `frontend/src/components/game/ChallengeDisplay.jsx`
- `frontend/src/components/game/CharacterMascot.jsx`
- `frontend/src/components/game/MascotAccessory.jsx`
- `frontend/src/pages/GameSession.jsx`

**Criterios de Aceptación:**

- [x] GameOverScreen muestra comparativa con mejor partida anterior
- [x] GameOverScreen tiene al menos 6 niveles de mensaje de feedback — 7 niveles implementados
- [ ] Desglose por ronda visible al expandir — pendiente (requiere datos de `summary.rounds` que aún no existen en el backend)
- [x] ChallengeDisplay tiene feedback visual claro de acierto y error — partículas de éxito + flash rojo de error
- [x] CharacterMascot tiene micro-animaciones en al menos 3 estados — 6 estados con animaciones únicas
- [x] Burbujas de diálogo con mensajes rotativos — 3-5 mensajes por mood, sin repetición consecutiva
- [x] HUD muestra indicador de progreso de rondas claramente visible — barra de progreso + dots condicionales
- [x] Animaciones respetan `prefers-reduced-motion` — todas envueltas en `shouldReduceMotion`
- [x] `npm test` y `npm run build` pasan

---

### T-703: 🛡️ Seudonimización y separación de datos identificativos en analytics ✅

**Consolida:** T-703 + T-709
**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 25 RGPD (protección desde el diseño), Directrices EDPB 01/2025

**Descripción:**
Los logs de Pino pueden registrar datos identificativos de estudiantes, y los endpoints de analytics retornan `playerId` (ObjectId directo al User) que enlaza sin intermediación con los datos identificativos del menor. Se debe implementar seudonimización en logs y separar la resolución de identidad de los datos de rendimiento en los DTOs de analytics.

**Sub-tareas:**

**Fase A — Seudonimización en logs (ex T-703):**

1. Crear utilidad `utils/pseudonymize.js` con función `pseudonymize(id)` que genere un hash SHA-256 truncado a 8 caracteres del ObjectId, con sal configurable por entorno.
2. Extender la configuración de redacción del logger Pino (`utils/logger.js`) para incluir campos de estudiante: `studentName`, `playerName`, `classroom`, `birthdate`.
3. Revisar el security logger (`utils/securityLogger.js`): asegurar que eventos como `STUDENT_TRANSFER` no logueen el nombre del estudiante (usar pseudoId).
4. Tests unitarios para la utilidad `pseudonymize` y tests de integración que verifiquen que los logs no contienen PII de estudiantes.

**Fase B — Separación PII/analytics en DTOs (ex T-709):**

5. Crear DTO `StudentAnalyticsDTO` que retorne `pseudoId` (hash) en lugar de `playerId`/`_id` directo.
6. Crear DTO `StudentIdentityDTO` que solo contenga: `pseudoId`, `name`, `avatar`, `classroom`.
7. Los endpoints de analytics retornarán datos con `pseudoId`; el frontend resolverá la identidad con una tabla de correspondencia obtenida de un endpoint separado (el de listado de estudiantes del profesor).
8. Actualizar los DTOs en `utils/dtos.js`.
9. Tests que verifiquen que los endpoints de analytics no exponen `name`, `email`, ni `classroom`.

**Criterios de Aceptación:**

- [ ] Utilidad `pseudonymize(id)` creada y exportada con tests
- [ ] Los logs de Pino nunca contienen `studentName`, `playerName` ni `classroom` de estudiantes
- [ ] El security logger usa pseudoIds para eventos relacionados con estudiantes
- [ ] La función es determinista (mismo input → mismo output) para permitir correlación de logs
- [ ] Los endpoints de analytics no retornan `name`, `email` ni `classroom` directamente
- [ ] Usan `pseudoId` como identificador de estudiante
- [ ] La resolución identidad ↔ pseudoId se realiza en el frontend
- [ ] DTO `StudentAnalyticsDTO` creado y aplicado
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/utils/pseudonymize.js` (nuevo), `backend/src/utils/logger.js`, `backend/src/utils/securityLogger.js`, `backend/src/utils/dtos.js`, `backend/src/controllers/analyticsController.js`, `backend/src/services/analyticsService.js`

---

### T-704: 🛡️ Borrado efectivo y política de retención de datos de estudiantes ✅

**Consolida:** T-704 + T-705
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-702
**Origen:** Auditoría de protección de datos — Art. 17 RGPD (derecho de supresión), Art. 5.1.e RGPD (limitación del plazo de conservación)

**Descripción:**
Dos capacidades complementarias para el ciclo de vida de datos:
1. **Borrado efectivo (hard delete):** El sistema solo implementa soft delete, lo cual no satisface el Art. 17 RGPD. Se necesita un endpoint que elimine todos los datos personales con cascada completa.
2. **Retención automática:** Los datos se acumulan indefinidamente. Se necesita un script de retención configurable que aplique los plazos definidos en el RAT (T-701), reutilizando la lógica de borrado.

**Sub-tareas:**

**Fase A — Borrado efectivo (ex T-704):**

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

**Fase B — Política de retención automática (ex T-705):**

7. Definir constantes de retención en `config/dataRetention.js`:
   - `GAMEPLAY_EVENTS_RETENTION_MONTHS`: 12 (eventos detallados)
   - `INACTIVE_STUDENT_RETENTION_MONTHS`: 24
   - `SECURITY_LOGS_RETENTION_MONTHS`: 12
8. Crear script `scripts/dataRetention.js` ejecutable con `npm run data:retention`:
   - **GamePlay events > 12 meses:** Anonimizar eliminando `playerId`, `events[].cardUid`, y reemplazando `events[].timestamp` con solo la fecha (sin hora/minuto). Conservar métricas agregadas.
   - **Estudiantes inactivos > 24 meses:** Ejecutar borrado efectivo (reutilizar lógica de Fase A).
   - **Generar informe:** Número de gameplays anonimizados, estudiantes eliminados, espacio liberado estimado.
9. Añadir flag `--dry-run` que muestre qué se haría sin ejecutar cambios.
10. Añadir scripts npm `data:retention` y `data:retention:dry-run` en `package.json`.
11. Tests unitarios para la lógica de cálculo de fechas y selección de registros.

**Criterios de Aceptación:**

- [ ] Endpoint `DELETE /api/users/:id/data` elimina todos los datos del estudiante
- [ ] La cascada elimina User + GamePlays + tokens Redis
- [ ] Solo accesible por el profesor propietario o super_admin
- [ ] Requiere `confirmDeletion: true` en el body
- [ ] Log de auditoría registrado (sin PII del estudiante)
- [ ] Respuesta 200 con resumen de datos eliminados (conteos, no datos)
- [ ] Script de retención ejecutable con `npm run data:retention`
- [ ] GamePlays > 12 meses: eventos anonimizados, métricas conservadas
- [ ] Estudiantes inactivos > 24 meses: borrado efectivo con cascada
- [ ] Flag `--dry-run` funcional y genera informe sin modificar datos
- [ ] Constantes de retención configurables en un solo archivo
- [ ] Tests unitarios para la lógica de selección temporal
- [ ] `npm test` pasa en backend

**Archivos afectados:** `backend/src/controllers/userController.js`, `backend/src/routes/users.js`, `backend/src/validators/userValidator.js`, `backend/src/config/dataRetention.js` (nuevo), `backend/scripts/dataRetention.js` (nuevo), `backend/package.json`

---

### T-706: 🛡️ Derecho a la portabilidad — Endpoint de exportación de datos de estudiante ✅

**Prioridad:** P1 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Auditoría de protección de datos — Art. 20 RGPD (derecho a la portabilidad de datos)

**Descripción:**
No existe forma de exportar los datos personales de un estudiante en formato estructurado. El Art. 20 RGPD establece el derecho a recibir los datos *«en un formato estructurado, de uso común y lectura mecánica»*. Se necesita un endpoint que retorne todos los datos personales del estudiante en JSON descargable.

**Sub-tareas:**

1. Crear endpoint `GET /api/users/:id/export-data` en `userController.js`.
2. Recopilar datos de todas las fuentes:
   - Datos del perfil (User: name, age, classroom, avatar, status, fechas)
   - Consentimiento registrado (si T-702 está implementado)
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

### T-804: 🃏 Backend — Eliminar infraestructura de Card y actualizar seeders ✅

**Consolida:** T-804 + T-805
**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-803
**Origen:** ADR-012 — Fases 5 y 6 del plan de implementación

**Descripción:**
Eliminar completamente los 9 archivos de la capa Card y limpiar las referencias en server.js, la máquina de estados RFID y los comandos socket. Mantener `CardAssignmentState` (necesario para escaneo en creación de mazos). Actualizar los seeders para que funcionen sin la colección Card.

**Sub-tareas:**

**Fase A — Eliminar infraestructura Card (ex T-804):**

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

**Fase B — Actualizar seeders (ex T-805):**

6. **seeders/index.js** — Eliminar import de `02-cards`, eliminar paso de seeding de cards del pipeline, actualizar firmas de funciones que recibían `cards`, actualizar log de resumen.
7. **seeders/05-carddecks.js** — Eliminar parámetro `cards`. Generar UIDs sintéticos inline con `generateCardMappings(contextAssets, count, uidOffset)`. Eliminar `cardId` de los mappings generados.
8. **seeders/06-sessions.js** — Eliminar parámetro `cards`. Eliminar `cardId` de mappings, boardLayout y associationChallengePlan generados.
9. Verificar: `npm run seed:reset` ejecuta sin errores y los datos son coherentes.
10. Ejecutar lint y verificar que no hay imports rotos.

**Criterios de Aceptación:**

- [x] Los 9 archivos listados no existen en el repositorio
- [x] `server.js` no tiene rutas `/api/cards`
- [x] Máquina de estados RFID no tiene modo `CARD_REGISTRATION`
- [x] Modo `CARD_ASSIGNMENT` sigue funcionando (no se elimina)
- [x] `GET /api/cards` devuelve 404 (ruta no encontrada)
- [x] El servidor arranca sin errores
- [x] `npm run seed:reset` ejecuta exitosamente sin modelo Card
- [x] Los mazos generados tienen UIDs sintéticos válidos (formato `AA00XXXX`)
- [x] Las sesiones generadas no contienen campo `cardId` en mappings
- [x] El pipeline de seeding no referencia la colección `cards`
- [x] `npm run lint` pasa en backend
- [x] `npm test` pasa en backend

**Archivos eliminados:** (ver Sub-tarea 1 Fase A)
**Archivos modificados:** `backend/src/server.js`, `backend/src/states/rfid/index.js`, `backend/src/commands/socket/index.js`, `backend/src/realtime/socketHandlers.js`, `backend/seeders/index.js`, `backend/seeders/05-carddecks.js`, `backend/seeders/06-sessions.js`

---

### T-806: 🃏 Backend — Actualizar tests sin modelo Card ✅

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

- [x] No existen tests que importen `Card` model
- [x] Todos los tests de deck/session usan UIDs directos sin crear documentos Card
- [x] `npm test` pasa al 100% sin regresiones
- [x] Coverage no disminuye significativamente (se eliminan tests de Card, pero se mantienen los de deck/session)

**Archivos eliminados:** `backend/tests/cards.test.js` (si existe)
**Archivos modificados:** ~12 archivos de test (ver Sub-tarea 2)

---

### T-807: 🃏 Frontend — Eliminar capa Card y actualizar páginas de mazos, sesiones y admin ✅

**Consolida:** T-807 + T-808 + T-809
**Prioridad:** P1 | **Tamaño:** L (1-2 días) | **Dependencias:** T-803
**Origen:** ADR-012 — Fases 8.1 a 8.6 del plan de implementación

**Descripción:**
Eliminar el servicio `cardsAPI` del frontend, actualizar `cardMapping.js` para usar `uid` como identificador primario, actualizar las páginas de mazos y sesiones, y eliminar las páginas de gestión de cartas del panel de administración.

**Sub-tareas:**

**Fase A — Capa de datos (ex T-807):**

1. **api.js** — Eliminar todas las funciones de `cardsAPI` (getCards, getCardById, createCard, updateCard, deleteCard, createCardsBatch, getCardStats) y su export.
2. **cardMapping.js** — Eliminar lógica de `cardId`. Usar `uid` como key en `normalizeCardMappingsFromDeck()` y `buildCardMappingsPayload()`.
3. Buscar y eliminar cualquier otro import de `cardsAPI` en el codebase frontend.

**Fase B — Páginas de mazos (ex T-808):**

4. **DeckCreationWizard.jsx** — Eliminar import de `cardsAPI`, eliminar `cardsAPI.getCards()`, cambiar keys de `card._id` a `card.uid` o `uid`. El escaneo en vivo vía `CardAssignmentState` ya existe y es el método principal.
5. **DeckEditPage.jsx** — Mismo patrón: eliminar referencias a `cardsAPI` y `cardId`.
6. **CardDeckDetailPage.jsx** — Eliminar referencias a `cardId` en `getCardInfo()` y displays de mapping. Usar `uid` directamente.
7. **CardSelector.jsx** — Evaluar: si solo servía para seleccionar cartas pre-registradas de BD → eliminar. Si tiene lógica de UI reutilizable para escaneo → refactorizar.

**Fase C — Sesiones y admin (ex T-809):**

8. **SessionDetail.jsx** — Eliminar referencias a `cardId` en displays de card mapping.
9. **SessionEdit.jsx** — Eliminar referencias a `cardId` en la lógica de edición de mappings.
10. **Admin pages** — Identificar y eliminar páginas de gestión de cartas del panel de super_admin (listado, registro, batch import).
11. **Router** — Eliminar rutas de admin de cartas en el router de la aplicación.
12. **Sidebar/Navigation** — Eliminar enlace a gestión de cartas del menú de admin.
13. `npm run build` y `npm test` pasan.

**Criterios de Aceptación:**

- [x] `cardsAPI` no existe en `api.js`
- [x] `cardMapping.js` usa `uid` como identificador primario
- [x] No existen imports de `cardsAPI` en ningún componente frontend
- [x] `DeckCreationWizard` no importa ni llama a `cardsAPI`
- [x] `DeckEditPage` no usa `cardId` ni `cardsAPI`
- [x] `CardDeckDetailPage` muestra UIDs directamente sin buscar `cardId`
- [x] `CardSelector.jsx` eliminado o refactorizado (justificado en commit)
- [x] Crear/editar mazo funciona con UIDs capturados por escaneo en vivo
- [x] `SessionDetail` y `SessionEdit` no referencian `cardId`
- [x] No existen páginas de gestión de cartas en el panel admin
- [x] No existe enlace a "Gestión de tarjetas" en la navegación
- [x] Rutas de admin de cartas eliminadas del router
- [x] `npm run build` y `npm test` pasan

**Archivos afectados:** `frontend/src/services/api.js`, `frontend/src/lib/cardMapping.js`, `frontend/src/pages/DeckCreationWizard.jsx`, `frontend/src/pages/DeckEditPage.jsx`, `frontend/src/pages/CardDeckDetailPage.jsx`, `frontend/src/components/ui/CardSelector.jsx`, `frontend/src/pages/SessionDetail.jsx`, `frontend/src/pages/SessionEdit.jsx`, `frontend/src/App.jsx` (router), páginas admin de cartas (por identificar)

---

## P2 — Prioridad Media

### T-512: ⚛️ Migrar colores hardcodeados en componentes restantes (batch + tokens faltantes) ✅

**Consolida:** T-512 + T-515
**Prioridad:** P2 | **Tamaño:** L (1-2 días) | **Dependencias:** T-503, T-507
**Origen:** ~80 ocurrencias restantes distribuidas en ~15 archivos; evaluación post-migración de cobertura

**Descripción:**
Después de los archivos priorizados individualmente, quedan: `RFIDScannerPanel.jsx` (~31), `CardSelector.jsx` (~25), `DeckCard.jsx` (~25), `AssetSelector.jsx` (~23), `RFIDModeHandler.jsx` (~12), `CharacterMascot.jsx` (~8), `ChallengeDisplay.jsx` (~7), `Sparkles.jsx` (~8), `FloatingPointsBadge.jsx` (~6), `FeedbackOverlay.jsx` (~5), `ScoreDisplay.jsx` (~5), `GameOverScreen.jsx` (~4), `CardAssetPreview.jsx` (~3), `SelectPremium.jsx` (~2), `ConfirmationModal.jsx` (~1).

Aplicar tabla de mapeo estándar de tokens semánticos a cada archivo. Tras completar la migración, revisar si algún color no pudo mapearse y crear tokens adicionales si patrones recurrentes lo justifican.

**Criterios de Aceptación:**

- [x] Colores hardcodeados reducidos a < 10% del total original (~20 max., justificados) — 0 restantes, 14 TOKEN-EXCEPTION documentadas
- [x] Nuevos tokens (si los hay) siguen convención `--color-{categoría}-{variante}` en OKLCH — no se necesitaron nuevos tokens
- [x] Nuevos tokens documentados con comentario en `index.css`
- [x] `npm run build` y `npm test` pasan

---

### T-523: 🔧 Eliminar rutas legacy de assets y código subyacente ✅

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** Auditoría — rutas `@deprecated` en JSDoc con código legacy sin consumidores

**Descripción:**
Las rutas legacy de assets (`POST /:id/assets`, `DELETE /:id/assets/:assetKey`) estaban marcadas como `@deprecated` en JSDoc y habían sido reemplazadas por rutas con subida de archivo (`POST /:id/images`, `POST /:id/audio`, `DELETE /:id/images/:assetKey`, `DELETE /:id/audio/:assetKey`). Al no existir consumidores externos de la API, se decidió eliminar directamente las rutas legacy y todo su código subyacente en lugar de implementar un middleware de deprecación RFC 8594 (que solo tendría sentido con una API pública con consumidores de terceros).

**Sub-tareas:**

1. Eliminar las dos rutas deprecated de `routes/contexts.js` (`POST /:id/assets`, `DELETE /:id/assets/:assetKey`).
2. Eliminar handlers `addAsset` y `removeAsset` de `controllers/gameContextController.js`.
3. Eliminar `addAssetSchema` de `validators/gameContextValidator.js`.
4. Eliminar tests de validación de las rutas eliminadas en `tests/validationEndpoints.test.js`.
5. Actualizar tabla de endpoints en `docs/API_v0.5.0.md` (eliminar filas de rutas legacy).

**Criterios de Aceptación:**

- [x] Rutas `POST /:id/assets` y `DELETE /:id/assets/:assetKey` eliminadas de `routes/contexts.js`
- [x] Handlers `addAsset` y `removeAsset` eliminados de `gameContextController.js`
- [x] `addAssetSchema` eliminado del validador
- [x] Tests de validación de rutas eliminadas quitados
- [x] `API_v0.5.0.md` actualizado sin las filas legacy
- [x] `npm test` pasa en backend sin regresiones
- [x] `npm run lint` pasa sin errores nuevos

**Archivos afectados:** `backend/src/routes/contexts.js`, `backend/src/controllers/gameContextController.js`, `backend/src/validators/gameContextValidator.js`, `backend/tests/validationEndpoints.test.js`, `backend/docs/API_v0.5.0.md`

---

### T-525: 🔧 Unificar health checks y extraer handlers inline de server.js ✅

**Consolida:** T-525 + T-532
**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** Ninguna
**Origen:** Auditoría — health check duplicado en `/health` y `/api/health`; server.js tiene handlers inline para `GET /`, health, metrics

**Descripción:**
Los handlers de `/health` y `/api/health` son idénticos (código copiado). Se debe compartir el handler de health e incluir la versión del backend. Además, server.js tiene handlers inline que deben extraerse a controllers/routes dedicados para que `server.js` sea solo configuración y montaje.

**Sub-tareas:**

**Fase A — Health check unificado (ex T-525):**

1. Extraer handler de health check a función reutilizable.
2. Registrar `/health` y `/api/health` apuntando al mismo handler.
3. Incluir versión en health check response.
4. Test que verifique que health check incluye versión correcta.

**Fase B — Extraer handlers inline (ex T-532):**

5. Extraer handlers inline a `controllers/healthController.js` y `routes/health.js`.
6. `server.js` debe ser solo configuración y montaje.
7. Tests existentes pasan.

**Criterios de Aceptación:**

- [x] `/health` y `/api/health` comparten handler — ambos delegan a `healthController.healthCheck`
- [x] Health check incluye versión — campo `version` de `package.json` añadido a la respuesta
- [x] Test verifica que versión es correcta — test en `metricsEndpoints.test.js`
- [x] Handlers inline extraídos a controllers/routes — `healthController.js` (3 handlers) + `health.js` (router)
- [x] `server.js` solo contiene configuración y montaje — ~90 líneas de handlers inline eliminadas
- [x] Endpoints funcionan idénticamente — test de paridad `/health` vs `/api/health`
- [x] Tests existentes pasan — 691 tests, 0 fallos
- [x] Servicios inyectados via `app.set` (rfidService, runtimeMetrics) — patrón DI existente del proyecto
- [x] Filtro pinoHttp migrado a `req.originalUrl` para compatibilidad con routers
- [x] Nuevo endpoint `GET /api/info` con metadatos de la API
- [x] `API_v0.5.0.md` actualizado con campo `version` en health y endpoint `/api/info`

**Archivos afectados:** `backend/src/server.js`, `backend/src/controllers/healthController.js` (nuevo), `backend/src/routes/health.js` (nuevo), `backend/tests/metricsEndpoints.test.js`, `backend/docs/API_v0.5.0.md`

---

### T-611: 📊 Componentes UI reutilizables (Breadcrumb, PageHeader, ErrorState) ✅

**Consolida:** T-611 + T-612 + T-614
**Prioridad:** P2 | **Tamaño:** L (1-2 días) | **Dependencias:** Ninguna
**Origen:** Sin breadcrumbs en ninguna página; inconsistencia en headers entre páginas; inconsistencia en estados vacíos y de error

**Descripción:**
Crear tres componentes UI reutilizables para mejorar la consistencia visual y de navegación en toda la aplicación.

**Sub-tareas:**

**Fase A — Breadcrumb (ex T-611):**

1. **Crear componente `Breadcrumb`:** Props `items: [{ label, to? }]`, separador ChevronRight, responsive (mobile: solo "← Volver").
2. **Integrar en 6+ páginas de detalle:** SessionDetail, SessionEdit, CardDeckDetailPage, DeckEditPage, ContextDetailPage, StudentProfile.

**Fase B — PageHeader (ex T-612):**

3. Crear `PageHeader` reutilizable (props: `icon`, `title`, `subtitle`, `actions`, `badge`).
4. Integrar en ContextsPage, SessionsPage, CardDecksPage.

**Fase C — ErrorState (ex T-614):**

5. Crear componente `ErrorState` reutilizable (props: `title`, `message`, `onRetry`, `icon`).
6. Unificar estados vacíos en AlertsPanel, DifficultyHeatmap, StudentProgressChart.
7. Al menos 4 componentes migrados a estados unificados.

**Archivos a Crear/Modificar:**

- `frontend/src/components/ui/Breadcrumb.jsx` — **NUEVO**
- `frontend/src/components/ui/PageHeader.jsx` — **NUEVO**
- `frontend/src/components/ui/ErrorState.jsx` — **NUEVO**
- Páginas de detalle (SessionDetail, SessionEdit, CardDeckDetailPage, DeckEditPage, ContextDetailPage, StudentProfile)
- Páginas de listado (ContextsPage, SessionsPage, CardDecksPage)
- Componentes dashboard (AlertsPanel, DifficultyHeatmap, StudentProgressChart)

**Criterios de Aceptación:**

- [x] Componente `Breadcrumb` creado y reutilizable
- [x] Breadcrumbs en al menos 5 páginas de detalle — SessionDetail, SessionEdit, CardDeckDetailPage, DeckEditPage, ContextDetailPage
- [x] Navegación funcional
- [x] Responsive: mobile muestra "← Volver" simplificado
- [x] Componente `PageHeader` creado con props flexibles
- [x] Al menos 3 páginas usan PageHeader — SessionsPage, ContextsPage, CardDecksPage
- [x] Componente `ErrorState` creado y reutilizable — integrado en CardDecksPage
- [x] AlertsPanel muestra estado positivo cuando no hay alertas — implementado en T-604
- [x] Al menos 4 componentes migrados a estados unificados — 6 migrados: CardDecksPage (ErrorState), SessionsPage (ErrorState), ContextsPage (ErrorState), Dashboard (ErrorState), DifficultyHeatmap (EmptyState), StudentProgressChart (EmptyState)
- [x] Aspecto visual consistente
- [x] Tokens semánticos usados
- [x] `npm run build` pasa

---

## P3 — Prioridad Baja

### T-535: 🔧 Plan de descomposición modular de gameEngine.js ✅

**Prioridad:** P3 | **Tamaño:** S (2-4h) | **Dependencias:** Ninguna
**Origen:** `gameEngine.js` tiene 1915 líneas

**Descripción:**
Tarea de **PLANIFICACIÓN** — no implementación. Analizar el archivo, identificar responsabilidades separables, y crear documento de diseño con propuesta de descomposición.

**Criterios de Aceptación:**

- [x] Documento de diseño creado — ADR-018 en `backend/docs/Architecture_Decisions.md` (siguiendo el formato de ADRs existentes del proyecto en vez de crear un directorio `docs/adr/` separado)
- [x] Responsabilidades catalogadas — 10 grupos con líneas, métodos y complejidad
- [x] Propuesta de módulos con dependencias claras — 11 módulos bajo `services/gameEngine/` con diagrama de dependencias
- [x] Estimaciones de esfuerzo por módulo — 3 fases (~4h, ~8h, ~12h) = ~32h total
- [x] No se modifica código en esta tarea

**Archivos afectados:** `backend/docs/Architecture_Decisions.md` (ADR-018 añadido al final)

---

### T-625: 📊 Backend — Endpoints de analytics avanzados (19 endpoints) ✅

**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-601
**Origen:** Análisis de necesidades pedagógicas — los profesores necesitan profundidad analítica para entender cómo aprenden los niños individualmente

**Descripción:**
Expansión mayor del backend de analytics, añadiendo 19 nuevos endpoints organizados en 6 grupos: trayectoria de aprendizaje (4), análisis profundo de sesiones (4), métricas de engagement (3), efectividad de contenido (3), alertas inteligentes server-side (2) y datos para reportes/exportación (3). Se descompone la funcionalidad en sub-servicios temáticos bajo `services/analytics/` sin modificar el servicio existente (zero regresión). Documentación completa en `backend/docs/Analytics_Design_Rationale.md` y ADR-026.

**Sub-tareas:**

1. **Documentación y arquitectura:**
   - Crear `backend/docs/Analytics_Design_Rationale.md` con justificación pedagógica y de BI
   - ADR-026 en `Architecture_Decisions.md` (descomposición modular del servicio)
   - Crear estructura `services/analytics/` con helpers compartidos

2. **Trayectoria de aprendizaje (E01-E04):**
   - `GET /student/:id/trajectory` — progresión temporal con tendencia (regresión lineal)
   - `GET /student/:id/velocity` — velocidad de mejora en ventanas temporales
   - `GET /student/:id/plateaus` — detección de mesetas (estancamiento)
   - `GET /student/:id/evolution` — evolución por contexto o mecánica

3. **Análisis de sesiones (E05-E08):**
   - `GET /gameplay/:id/rounds` — desglose ronda-a-ronda con detección de fatiga
   - `GET /classroom/card-analysis` — análisis de tarjetas: tasa de error, dificultad
   - `GET /student/:id/struggles` — momentos de dificultad (errores consecutivos)
   - `GET /classroom/fatigue` — indicadores de fatiga agregados por clase

4. **Engagement (E09-E11):**
   - `GET /student/:id/engagement` — score de engagement (5 componentes ponderados)
   - `GET /classroom/engagement` — engagement agregado de la clase con ranking
   - `GET /student/:id/play-patterns` — patrones de juego (horarios, timeline)

5. **Efectividad de contenido (E12-E14):**
   - `GET /classroom/content-effectiveness` — qué contextos producen mejor aprendizaje
   - `GET /classroom/card-difficulty` — tarjetas problemáticas (tasa error > umbral)
   - `GET /classroom/learning-curves` — curvas de aprendizaje por contenido

6. **Alertas inteligentes (E15-E16):**
   - `GET /alerts` — alertas computadas server-side con severidad y recomendaciones
   - `GET /alerts/summary` — resumen de alertas para badges del sidebar
   - 7 tipos: declining, inactivity, score_drop, timeout, improving, plateau, abandonment

7. **Reportes y exportación (E17-E19):**
   - `GET /reports/student/:id` — reporte completo de estudiante (orquesta sub-servicios)
   - `GET /reports/classroom` — reporte de clase completo
   - `GET /reports/classroom/export` — datos tabulares para CSV

8. **Infraestructura:**
   - 18 nuevos validadores Zod (incluyendo timeRange extendido a 90d)
   - 2 nuevos índices MongoDB (GamePlay, GameSession)
   - Método `aggregate` en gameSessionRepository
   - Caching diferenciado (300s datos, 600s alertas/reportes)

**Archivos Creados:**
- `backend/src/services/analytics/analyticsHelpers.js`
- `backend/src/services/analytics/alertsService.js`
- `backend/src/services/analytics/studentTrajectoryService.js`
- `backend/src/services/analytics/sessionAnalysisService.js`
- `backend/src/services/analytics/engagementService.js`
- `backend/src/services/analytics/contentEffectivenessService.js`
- `backend/src/services/analytics/reportDataService.js`
- `backend/src/services/analytics/index.js`
- `backend/src/controllers/analyticsAdvancedController.js`
- `backend/docs/Analytics_Design_Rationale.md`

**Archivos Modificados:**
- `backend/src/routes/analytics.js` — 19 nuevas rutas
- `backend/src/validators/analyticsValidator.js` — 18 nuevos schemas
- `backend/src/models/GamePlay.js` — 1 nuevo índice
- `backend/src/models/GameSession.js` — 1 nuevo índice
- `backend/src/repositories/gameSessionRepository.js` — método aggregate
- `backend/docs/Architecture_Decisions.md` — ADR-026

**Criterios de Aceptación:**

- [x] 19 nuevos endpoints implementados bajo `/api/analytics/`
- [x] Todos requieren autenticación y rol teacher/super_admin
- [x] Validación Zod estricta en todos los endpoints
- [x] Sub-servicios organizados por dominio en `services/analytics/`
- [x] `analyticsService.js` original NO modificado (zero regresión)
- [x] `analyticsController.js` original NO modificado
- [x] Documento de diseño con justificación pedagógica y de BI
- [x] ADR-026 documentando la decisión de descomposición
- [x] Caching Redis en endpoints costosos
- [x] `npm run lint` sin errores
- [x] `npm test` — 695 tests pasando sin regresiones

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

### T-710: 🛡️ Información de privacidad y audit trail de acceso a datos 📋 (parcial: audit trail en T-713)

**Consolida:** T-710 + T-711
**Prioridad:** P3 | **Tamaño:** M (4-8h) | **Dependencias:** T-704, T-703
**Origen:** Auditoría de protección de datos — Arts. 13, 14 y 5.2 RGPD (derecho a la información y responsabilidad proactiva)

**Descripción:**
Dos piezas de cumplimiento RGPD:
1. **Información de privacidad:** Los Arts. 13 y 14 RGPD exigen proporcionar información sobre el tratamiento de datos de forma concisa, transparente e inteligible. Actualmente no existe ninguna página que informe a profesores o tutores.
2. **Audit trail:** El principio de accountability del Art. 5.2 RGPD exige poder demostrar el cumplimiento. Actualmente no se registra quién accede a los datos de qué estudiante ni cuándo se exportan o eliminan.

**Sub-tareas:**

**Fase A — Página de privacidad (ex T-710):**

1. Crear componente `frontend/src/pages/PrivacyInfo.jsx` con la información de privacidad:
   - Qué datos se recogen de los estudiantes (y cuáles no, ej: no se recoge email de alumnos)
   - Finalidad del tratamiento (seguimiento pedagógico, analytics de rendimiento)
   - Plazos de conservación (según T-704)
   - Quién tiene acceso (solo el profesor asignado y super_admin)
   - Cómo ejercer derechos (supresión, portabilidad, revocación de consentimiento)
   - Base legal del tratamiento (consentimiento parental, Art. 8 RGPD + Art. 7 LOPDGDD)
2. Añadir ruta `/privacy` en las rutas de la aplicación (accesible sin autenticación).
3. Añadir enlace a la página de privacidad en el footer o sidebar del layout.
4. Redactar el contenido en español, con lenguaje accesible para padres y profesores no técnicos.

**Fase B — Audit trail de acceso a datos (ex T-711):**

5. Crear utilidad `utils/dataAccessLogger.js` que registre eventos de acceso a datos de estudiantes.
6. Definir eventos a registrar:
   - `DATA_ACCESS`: Cuando un profesor consulta el perfil/analytics de un estudiante
   - `DATA_EXPORT`: Cuando se ejecuta el endpoint de exportación (T-706)
   - `DATA_DELETE`: Cuando se ejecuta el borrado efectivo (T-704) — ya parcialmente cubierto
   - `DATA_CONSENT_CHANGE`: Cuando se modifica el consentimiento (T-702)
7. Formato del log: `{ event, teacherId, studentPseudoId, timestamp, action, ipAddress }`.
8. Integrar en los controllers relevantes: `userController` (perfil, export, delete), `analyticsController` (student summary).
9. Tests unitarios.

**Criterios de Aceptación:**

- [ ] Página de privacidad accesible en `/privacy`
- [ ] Contenido cubre los 6 puntos mínimos del Art. 13 RGPD
- [ ] Lenguaje claro y accesible (no jurídico)
- [ ] Enlace visible desde el layout principal
- [ ] Utilidad `dataAccessLogger` creada con eventos definidos
- [ ] Se registra log al acceder al perfil de un estudiante
- [ ] Se registra log al exportar o eliminar datos de un estudiante
- [ ] Logs usan `pseudoId` del estudiante, nunca el nombre
- [ ] `npm test` pasa en backend
- [ ] `npm run build` pasa en frontend

**Archivos afectados:** `frontend/src/pages/PrivacyInfo.jsx` (nuevo), `frontend/src/App.jsx` (ruta), `frontend/src/components/layout/AppLayout.jsx` (enlace), `backend/src/utils/dataAccessLogger.js` (nuevo), `backend/src/controllers/userController.js`, `backend/src/controllers/analyticsController.js`

---

### T-712: 🛡️ Protocolo de notificación de brechas de seguridad ✅

**Prioridad:** P2 | **Tamaño:** M (4-8h) | **Dependencias:** T-701
**Origen:** Arts. 33 y 34 RGPD — obligación de notificación a la autoridad de control en 72h y al interesado si hay alto riesgo

**Descripción:**
Documentar el procedimiento de notificación de brechas de seguridad que involucren datos de menores: detección, evaluación de impacto del incidente, notificación a la AEPD (máximo 72 horas desde conocimiento, Art. 33.1), y comunicación a los interesados (tutores) cuando sea probable que la brecha entrañe alto riesgo para sus derechos (Art. 34.1). Crear template de registro de brechas y checklist de actuación.

**Sub-tareas:**

1. Crear documento `documentation/Protocolo_Notificacion_Brechas.md` con procedimiento paso a paso
2. Template de registro de brecha con campos requeridos por Art. 33.3 RGPD
3. Checklist de evaluación de riesgo (¿datos de menores afectados? → obligatoria notificación)
4. Script helper para generar formulario de notificación (opcional)

**Criterios de Aceptación:**

- [ ] Documento cubre los requisitos del Art. 33.3 RGPD (naturaleza, categorías, consecuencias, medidas)
- [ ] Template de registro incluye todos los campos exigidos
- [ ] Procedimiento distingue brechas con/sin datos de menores
- [ ] Plazo de 72 horas documentado con escalación

---

### T-713: 🛡️ Endpoint de rectificación de datos con audit trail ✅

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** T-702
**Origen:** Art. 16 RGPD — derecho de rectificación

**Descripción:**
Aunque la rectificación se puede realizar via `PUT /api/users/:id`, no existe un trail de auditoría específico que registre qué campos se modificaron, cuándo, y por quién. Esto es necesario para demostrar cumplimiento del Art. 5.2 RGPD (responsabilidad proactiva). Crear middleware o hook que registre los cambios en datos personales de estudiantes.

**Sub-tareas:**

1. Detectar cambios en campos PII del estudiante (name, profile.age, profile.classroom) en el service/controller
2. Registrar evento `DATA_RECTIFICATION` con: campos modificados (sin valores), studentPseudoId, requestingUserId
3. Tests que verifiquen el registro de rectificación

**Criterios de Aceptación:**

- [ ] Los cambios en name, age, classroom de estudiantes se registran como evento de seguridad
- [ ] El log no contiene los valores antiguos ni nuevos (solo los nombres de campos)
- [ ] `npm test` pasa

---

### T-714: 🛡️ Evaluación de riesgo de re-identificación en aulas pequeñas ✅

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** T-703
**Origen:** Directrices EDPB 01/2025 sobre seudonimización; Considerando 26 RGPD (identificabilidad en contexto)

**Descripción:**
En aulas de 5-6 alumnos, la combinación edad + rendimiento + aula puede hacer trivial la re-identificación incluso con pseudoIds. La AEPD advierte en su Guía de Anonimización que *«la anonimización absoluta no existe»* y que el riesgo de re-identificación debe evaluarse en contexto. Documentar formalmente este riesgo y evaluar si se necesitan medidas adicionales (ej: umbral mínimo de alumnos para analytics comparativos, generalización de edad a rango).

**Sub-tareas:**

1. Documentar el análisis de riesgo en la EIPD (ampliar R-01)
2. Evaluar si implementar umbral mínimo de k-anonimato (k=5) para endpoints comparativos
3. Si se implementa: los endpoints de analytics devuelven datos agregados solo si el grupo tiene >= 5 estudiantes

**Criterios de Aceptación:**

- [ ] Análisis documentado en EIPD con justificación de la decisión tomada
- [ ] Si se implementa umbral: endpoints de analytics lo respetan

---

### T-715: 🛡️ Derecho de oposición a analytics comportamentales 📋

**Prioridad:** P3 | **Tamaño:** M (4-8h) | **Dependencias:** T-702
**Origen:** Art. 21 RGPD — derecho de oposición al tratamiento

**Descripción:**
Permitir que un tutor se oponga al tratamiento de datos con fines de analytics sin que eso impida al estudiante jugar (funcionalidad básica). Requiere separar los flujos de «juego» (funcionalidad educativa) y «analytics» (tratamiento adicional). Si un tutor se opone a analytics, los GamePlays se registran pero las métricas no se agregan a `studentMetrics` ni se incluyen en endpoints de analytics.

**Sub-tareas:**

1. Añadir propósito `performance_analytics` como revocable individualmente en `consent.purposes`
2. Modificar `User.updateStudentMetrics()` para verificar si el propósito está activo
3. Modificar endpoints de analytics para excluir estudiantes sin consentimiento de analytics
4. Frontend: opción de oposición parcial en el formulario de consentimiento

**Criterios de Aceptación:**

- [ ] Un tutor puede revocar `performance_analytics` sin revocar `educational_tracking`
- [ ] Estudiantes sin analytics consent pueden jugar normalmente
- [ ] Los endpoints de analytics no incluyen a estos estudiantes
- [ ] `npm test` pasa

---

### T-716: 🛡️ Planificación de Atlas CSFLE para producción 📋

**Prioridad:** P3 | **Tamaño:** L (1-2 días) | **Dependencias:** T-701
**Origen:** Art. 32.1.a RGPD — cifrado como medida de seguridad

**Descripción:**
MongoDB Atlas proporciona cifrado en reposo (AES-256) por defecto y Client-Side Field Level Encryption (CSFLE) como opción avanzada para cifrar campos específicos antes de enviarlos al servidor. Evaluar y planificar la implementación de CSFLE para los campos PII más sensibles (`name`, `profile.age`, `profile.classroom`) como medida complementaria para el despliegue en producción.

**Sub-tareas:**

1. Documentar requisitos de infraestructura: Atlas M10+, Key Vault (AWS KMS / Azure Key Vault / GCP KMS)
2. Identificar campos candidatos a CSFLE y evaluar impacto en queries (CSFLE no permite búsquedas en campos cifrados con deterministic encryption)
3. Evaluar alternativa: Queryable Encryption de MongoDB 7.0+ (permite queries sobre campos cifrados)
4. Crear roadmap de implementación con estimación de esfuerzo
5. Documentar en EIPD como medida planificada (Art. 32)

**Criterios de Aceptación:**

- [ ] Documento técnico con análisis de viabilidad y roadmap
- [ ] EIPD actualizada con referencia a la medida planificada

---

### T-717: 🛡️ Documentar Sentry como procesador internacional ✅

**Prioridad:** P2 | **Tamaño:** S (2-4h) | **Dependencias:** T-701
**Origen:** Arts. 28 y 46 RGPD — procesadores y transferencias internacionales

**Descripción:**
Sentry actúa como procesador de datos (Art. 28 RGPD) con sede en EE.UU., lo que implica una transferencia internacional de datos. Esta transferencia debe ampararse en Standard Contractual Clauses (SCCs) según Art. 46.2.c RGPD. Documentar formalmente: (1) relación responsable-procesador, (2) base legal para la transferencia, (3) datos que Sentry puede recibir, (4) verificar que la configuración de `beforeSend` no envía PII de estudiantes.

**Sub-tareas:**

1. Revisar `backend/src/config/sentry.js` — verificar filtro `beforeSend` para PII de menores
2. Documentar en RAT la relación con Sentry como procesador (AT-06)
3. Verificar que los breadcrumbs de Sentry no contienen datos identificativos de estudiantes
4. Si se detectan PII en Sentry: añadir filtros adicionales en `beforeSend`

**Criterios de Aceptación:**

- [ ] RAT incluye actividad de tratamiento AT-06 con Sentry como procesador
- [ ] Verificación documentada de que `beforeSend` filtra PII de menores
- [ ] Si hay gaps: filtros adicionales implementados

---

## Dependencias entre Tareas

```
═══════════════════════════════════════════════════════════════
                    🔧 BACKEND
═══════════════════════════════════════════════════════════════

T-516 (errorHandler + notFound + asyncHandler)
  └──► T-519 (responseHelper + filterBuilder)

T-516 ──► T-601 (nuevos endpoints analytics) ─────────────────┐
                                                                │
T-520 (repositories write + transacciones + batch)              │
                                                                │
T-525 (health unificado + handlers inline)                      │
                                                                │
Independientes: T-521, T-523, T-535                             │
                                                                │
═══════════════════════════════════════════════════════════════  │
                    ⚛️ REACT / TAILWIND                         │
═══════════════════════════════════════════════════════════════  │
                                                                │
T-503 ──┐                                                       │
        ├──► T-512 (batch restante + tokens faltantes)          │
T-507 ──┘                                                       │
                                                                │
T-608 (Login/Register + ContextsPage) — independiente           │
                                                                │
═══════════════════════════════════════════════════════════════  │
                    📊 UI/UX & DASHBOARDS                       │
═══════════════════════════════════════════════════════════════  │
                                                                │
T-601 (Backend endpoints) ──┬──► T-602 (Datos reales dashboard) │
                            ├──► T-603 (Perfil estudiante)      │
                            ├──► T-604 (KPIs + alertas +        │
                            │         heatmap) ◄── T-602        │
                            └──► T-606 (Vista comparativa +     │
                                      CSV + sidebar) ◄── T-603  │
                                                                │
T-602 ──► T-616 (Onboarding)                                   │

Independientes: T-609 (mejoras partida), T-611 (UI components)

═══════════════════════════════════════════════════════════════
              🛡️ PROTECCIÓN DE DATOS DE MENORES
═══════════════════════════════════════════════════════════════

T-701 (Auditoría + RAT + EIPD) ──┬──► T-702 (Minimización + consentimiento)
                                   ├──► T-703 (Seudonimización + separación PII)
                                   └──► T-706 (Exportación datos)

T-702 (Minimización + consentimiento) ──► T-704 (Borrado + retención)
T-703 + T-704 ──► T-710 (Privacidad info + audit trail)

═══════════════════════════════════════════════════════════════
              🃏 REFACTOR RFID CARDS (Tokens Fungibles)
═══════════════════════════════════════════════════════════════

T-801 (ADR-012 documentación) ✅
  └──► T-802 (Esquemas Mongoose + Zod) ✅
        └──► T-803 (Lógica negocio + DTOs) ✅
              ├──► T-804 (Eliminar infra Card + seeders) ✅
              │      └──► T-806 (Tests backend) ✅
              ├──► T-807 (Frontend: data layer + páginas + admin) ✅
              └──► T-806 (Tests backend) ✅

═══════════════════════════════════════════════════════════════
              DEPENDENCIAS CRUZADAS (Cross-area)
═══════════════════════════════════════════════════════════════

T-516 (Backend errorHandler) ──► T-601 (Backend analytics)
T-519 (Backend responseHelper) ──► T-601 (usar helpers en nuevos endpoints)
T-608 (Login/Register/Contexts tokens) ║ T-503, T-507 (misma técnica de migración)
T-703 (Seudonimización) ──► T-601/T-703 (analytics usan pseudoIds)
T-702 (Consentimiento) ──► T-603 (perfil estudiante muestra estado consentimiento)
T-803 (Card refactor DTOs) ║ T-601 (Analytics — ambos modifican dtos.js, coordinar)
```

### Rutas Críticas

```
Dashboards:   T-516 (L) → T-601 (L) → T-602 (M) → T-603/T-604/T-606 (XL)
Protección:   T-701 (L) → T-702 (M) → T-704 (XL)
RFID Cards:   T-801 ✅ → T-802 ✅ → T-803 ✅ → T-804 ✅ → T-806 ✅
                                         └──► T-807 ✅  (eje completado)
```

La cadena de dashboards determina cuándo el dashboard estará completamente funcional con datos reales. La cadena de protección de datos es independiente y puede ejecutarse en paralelo. La cadena de RFID Cards es independiente de las otras dos y puede ejecutarse en paralelo, excepto en `dtos.js` (compartido con T-601).

---

## Métricas del Sprint

### Por Prioridad

| Prioridad | Tareas | Esfuerzo estimado |
|---|---|---|
| **P0 (Crítica)** | 9 tareas (T-516, T-601~T-603, T-701, T-702, T-801~T-803) | ~12-18 días |
| **P1 (Alta)** | 15 tareas (T-503, T-507, T-519~T-521, T-604, T-606, T-608, T-609, T-703, T-704, T-706, T-804, T-806, T-807) | ~20-30 días |
| **P2 (Media)** | 4 tareas (T-512, T-523, T-525, T-611) | ~4-6 días |
| **P3 (Baja)** | 3 tareas (T-535, T-616, T-710) | ~2-3 días |
| **Total** | **31 tareas** (13 completadas) | **~38-57 días** |

### Por Área

| Área | Tareas | % esfuerzo |
|---|---|---|
| 🔧 Backend (Node.js, API, Express) | T-516, T-519~T-521, T-523, T-525, T-535 (7 tareas) | ~18% |
| ⚛️ React & Tailwind CSS v4 | T-503, T-507, T-512 (3 tareas) | ~10% |
| 📊 UI/UX, Dashboards y Analytics | T-601~T-604, T-606, T-608, T-609, T-611, T-616 (9 tareas) | ~42% |
| 🛡️ Protección de Datos de Menores | T-701~T-704, T-706, T-710 (6 tareas) | ~18% |
| 🃏 Refactor RFID Cards (Tokens Fungibles) | T-801~T-804, T-806, T-807 (6 tareas, 6 completadas ✅) | ~12% |

### Tabla de Consolidación (Trazabilidad)

| Tarea consolidada | Tareas originales absorbidas |
|---|---|
| T-516 | T-516 + T-517 + T-518 |
| T-519 | T-519 + T-530 |
| T-520 | T-520 + T-533 + T-534 |
| T-525 | T-525 + T-532 |
| T-503 | T-503 + T-506 |
| T-507 | — (sin cambios) |
| T-512 | T-512 + T-515 |
| T-603 | T-603 + T-620 |
| T-604 | T-604 + T-605 + T-607 + T-615 |
| T-606 | T-606 + T-617 + T-618 |
| T-608 | T-608 + T-610 |
| T-609 | T-609 + T-613 + T-619 |
| T-611 | T-611 + T-612 + T-614 |
| T-701 | T-701 + T-707 |
| T-702 | T-702 + T-708 |
| T-703 | T-703 + T-709 |
| T-704 | T-704 + T-705 |
| T-710 | T-710 + T-711 |
| T-804 | T-804 + T-805 |
| T-807 | T-807 + T-808 + T-809 |

---

## Orden de Ejecución Sugerido

### Fase 1 — Fundamentos Backend (Semana 1)

1. **T-516** (L, prerequisito de todo el flujo de errores — incluye validación, notFound, asyncHandler)
2. **T-519** (L, responseHelper + filterBuilder — tras T-516)
3. **T-520** (XL, repository completo — independiente, puede iniciar en paralelo con T-516)
4. **T-521** (M, rate limiting — independiente)

### Fase 2 — Tokens Frontend + Analytics Backend (Semanas 1-2)

5. **T-601** (L, endpoints analytics — tras T-516)
6. **T-503**, **T-507** (migraciones de tokens, paralelas entre sí)

### Fase 3 — Dashboards con Datos Reales (Semanas 2-3)

7. **T-602** (M, conectar datos reales al dashboard — tras T-601)
8. **T-603** (XL, perfil estudiante con overlay — tras T-601)
9. **T-604** (XL, KPIs + alertas + heatmap — tras T-602)
10. **T-608** (L, tokens Login/Register + ContextsPage — paralelo)

### Fase 4 — Páginas Nuevas + Componentes (Semanas 3-4)

11. **T-606** (XL, vista comparativa + CSV + sidebar — tras T-601 y T-603)
12. **T-609** (XL, mejoras visuales partida — independiente)
13. **T-611** (L, Breadcrumb + PageHeader + ErrorState — independiente)

### Fase 5 — Protección de Datos (Semanas 3-5, paralela con Fases 3-4)

14. **T-701** (L, auditoría + RAT + EIPD — sin dependencias, se puede iniciar antes)
15. **T-702** (M, minimización + consentimiento — tras T-701)
16. **T-703** (L, seudonimización + separación PII — tras T-701, paralela con T-702)
17. **T-704** (XL, borrado + retención — tras T-702)
18. **T-706** (M, exportación datos — tras T-701)

### Fase 6 — Refactor RFID Cards (Semanas 4-5, paralela con Fase 5)

19. **T-802** (M, esquemas Mongoose + Zod — sin dependencias externas)
20. **T-803** (L, lógica de negocio + DTOs — coordinar con T-601 en dtos.js)
21. **T-804** (L, eliminar infraestructura Card + seeders — tras T-803)
22. **T-806** (L, tests — tras T-804)
23. **T-807** (L, frontend data layer + páginas + admin — tras T-803)

### Fase 7 — Pulido y Opcionales (Semanas 5-6)

24. **T-512** (L, batch tokens restantes + faltantes — tras T-503, T-507)
25. Tareas P2 backend restantes: **T-523**, **T-525**
26. **T-710** (M, privacidad frontend + audit trail)
27. **T-535**, **T-616** (P3, según capacidad)

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
   - Gráfico de progreso temporal con overlay de promedio de clase
   - Rendimiento por contexto y mecánica
   - Historial de partidas
   - Fortalezas y debilidades
9. **Vista Comparativa** → Navegar desde sidebar "Mis Alumnos":
   - Tabla con todos los estudiantes
   - Ordenación y filtros funcionando
   - Click en estudiante navega al perfil
   - Exportar CSV funcional
10. **Sesiones y Mazos** → Verificar breadcrumbs en páginas de detalle
11. **Partida** → Iniciar una partida y verificar:
    - GameOverScreen con resumen expandido y desglose por ronda
    - CharacterMascot con micro-animaciones y burbujas de diálogo
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
