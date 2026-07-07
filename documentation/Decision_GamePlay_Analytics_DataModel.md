# Decisión pendiente: modelo de datos de `GamePlay` y coste de analytics

**Estado:** Abierto — requiere sesión dedicada (brainstorming + migración + validación en staging/Atlas).
**Origen:** Auditoría de la vertical de partidas (ADR-228). Estos hallazgos se **identificaron y verificaron** contra el código, pero NO se aplicaron en esa sesión: son refactors de arquitectura de datos con backfill/migración que tocan analytics de **datos de menores**, y el escenario TFG actual (413 plays, Atlas M0 512 MB) todavía no sufre el problema (son escalabilidad futura, no bugs). Forzarlos al vuelo arriesga romper analytics sensibles. Este documento conserva el detalle para retomarlos con su propia verificación.

> Precedente: `Decision_BullMQ_vs_Scheduling_InProcess.md` (ADR-226) documenta de la misma forma un hallazgo de coste que necesita medición real antes de decidir.

---

## Contexto

`GamePlay` es el registro por-partida (un alumno juega una sesión). Alimenta **toda** la analítica del docente y del super_admin: curvas de aprendizaje, efectividad de contenidos, alumnos en riesgo, dificultades por alumno, comparativas de clase. El volumen crece de forma lineal con `alumnos × sesiones jugadas`.

El eje transversal es **coste free-tier**: Atlas M0 (512 MB, sin Performance Advisor representativo en Docker) y la necesidad de que las agregaciones de analytics no exploten en RAM ni en documentos escaneados cuando el dataset crezca más allá del piloto.

---

## Hallazgos diferidos

### DB-1 — Extended reference en `GamePlay` (`teacherId` / `mechanicType` / `contextId`)

**Problema.** Casi todas las queries de analytics arrancan resolviendo "las sesiones de este docente" (`GameSession.find({ createdBy })`) para luego hacer `GamePlay.find({ sessionId: { $in: [...] } })`, y encima hacen `$lookup` a `game_sessions`/`game_mechanics`/`game_contexts` para recuperar mecánica/contexto. Ese `$in` crece con el número de sesiones del docente y los `$lookup` son el grueso del coste de cada pipeline.

**Patrón aplicable.** `pattern-extended-reference` (skill `mongodb-schema-design`): cachear en `GamePlay` los pocos campos de las entidades relacionadas que las queries necesitan para filtrar/agrupar — `teacherId`, `mechanicType`, `contextId` (y quizá `mechanicName`) —, poblados en la creación de la partida (ya se conocen). Elimina el `$in` de sesiones y la mayoría de `$lookup`.

**Coste.** Migración de backfill sobre las `GamePlay` existentes + actualizar el punto de creación + revisar cada pipeline de analytics para que use los campos nuevos. Riesgo: si el backfill deja documentos sin el campo, las agregaciones filtran de menos → **infra-conteo silencioso en datos de menores**. Requiere validación exhaustiva post-migración.

**Cuándo.** Cuando el dashboard de un docente con muchas sesiones note latencia, o antes de escalar el piloto a varias aulas.

---

### DB-2 — Poda de `events[]` en anonimización + `displayData` cuadruplicado

**Problema (a).** La política de retención/anonimización actúa sobre campos identificables pero **no poda el array `events[]`** de las partidas anonimizadas. Ese array es el subdocumento más pesado de `GamePlay` (un evento por scan) y, una vez anonimizada la partida, su detalle por-evento ya no aporta valor analítico agregable pero sigue ocupando espacio en M0.

**Problema (b).** `displayData` (nombre/valor/URLs del asset de cada carta) se materializa **cuadruplicado**: en `card_decks.cardMappings`, en `game_sessions` (snapshot), y en cada `GamePlay`. En partidas con muchas cartas esto engorda `game_sessions` y `GamePlay`.

**Patrones aplicables.** `pattern-archive` / `antipattern-bloated-documents`. Podar `events[]` en la anonimización (conservando los agregados ya calculados) y evaluar si el snapshot de `displayData` en `GamePlay` puede reducirse a una referencia (la reconstrucción server-side de `displayData` ya existe desde ADR-226, AS-2).

**Coste.** Tocar el flujo de retención (RGPD — cuidado: la poda debe preservar lo que la base legal exige conservar) + posible migración de los snapshots. Riesgo alto por ser el camino de anonimización de menores.

**Cuándo.** Cuando el uso de M0 se acerque a un umbral de alerta (ver `Free_Tier_Budget.md`), o en la próxima revisión de la política de retención.

---

### DB-5 — Cota temporal en `getStudentDifficulties`

**Problema.** `getStudentDifficulties` hace 3 `$lookup` sobre el histórico **completo** del alumno. Añadir `completedAt >= (hoy − 90d)` acotaría el coste.

**Por qué NO se aplicó al vuelo.** Cambia la **semántica** (histórico completo → ventana reciente) de una query **cacheada y ya acotada por alumno**. El beneficio de coste es marginal en el volumen actual y el cambio silencioso alteraría lo que ve el docente ("dificultades" pasaría a significar "dificultades recientes"). Es una decisión de producto, no solo técnica: hay que acordar la ventana con el criterio pedagógico.

**Cuándo.** Si esa query aparece en slow-query logs de Atlas, y con el docente validando la nueva semántica.

---

### DB-6 / DB-8 / DB-10 — Cambios de índice/schema que exigen staging + Atlas

- **DB-6 — `_id: false` en subdocumentos de arrays.** Los subdocumentos embebidos (p. ej. `roundResults`, `cardMappings`) generan un `_id` por elemento que no se usa. Desactivarlo (`_id: false` en el sub-schema) ahorra espacio e índice. Requiere migración de los documentos existentes.
- **DB-8 — Índices posiblemente muertos en `game_sessions`.** La traza sugiere índices sin uso, pero **no se tocan índices sin datos de `$indexStats` representativos** (el skill `mongodb-query-optimizer` es explícito: solo eliminar índices si la sugerencia viene del **Performance Advisor de Atlas**). El workload de Docker no es representativo.
- **DB-10 — Partial index de `consent.withdrawnAt`.** Un índice parcial aceleraría el barrido de retención/anonimización, pero exige validar la expresión parcial (recordar MDB-7 del ADR-226: `$ne` **no** está permitido en `partialFilterExpression` → el índice queda "fantasma"; usar `$type`/`$exists`).

**Cuándo.** En una sesión con **Atlas conectado** (Performance Advisor + `$indexStats`) y **staging** para validar la migración antes de tocar producción.

---

## Recomendación

Agrupar DB-1/DB-2/DB-5 (modelo de datos + coste de analytics) en una sesión con brainstorming previo y tests dedicados, y DB-6/DB-8/DB-10 (índices/schema) en una sesión con Atlas + staging. No mezclarlos con QA de gameplay: el riesgo para la analítica de menores exige foco y verificación inversa por hallazgo.
