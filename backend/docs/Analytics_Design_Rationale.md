# Diseño Analítico: Justificación Pedagógica y de Business Intelligence

**Fecha:** 2026-04-03
**Autor:** Samuel Blanchart Pérez (con asistencia IA)
**Estado:** Aprobado — Sprint 5
**Relacionado:** ADR-017 (endpoints existentes), ADR-026 (descomposición del servicio)

---

## 1. Objetivo Pedagógico General

### 1.1. Contexto educativo

La plataforma está dirigida a **niños de 4 a 8 años** que interactúan con tarjetas RFID físicas para jugar juegos educativos de asociación y memoria. Los **profesores** — que generalmente no tienen formación técnica en análisis de datos — configuran las sesiones de juego y necesitan herramientas que les permitan:

1. Entender cómo aprende cada alumno individualmente
2. Identificar dificultades antes de que se conviertan en problemas
3. Ajustar el material didáctico basándose en evidencia
4. Comunicar el progreso a las familias con datos objetivos

### 1.2. Evaluación formativa, no sumativa

La plataforma es una herramienta de **evaluación formativa**: su propósito no es poner notas, sino informar al profesor para que pueda adaptar su enseñanza. Esto significa que:

- Los datos deben traducirse en **acciones concretas** ("revisar este contenido", "dar más tiempo a este alumno")
- Las alertas deben ser **proactivas**, no reactivas
- Los gráficos deben ser **intuitivos** para personas sin formación técnica en datos
- El seguimiento debe ser **longitudinal** (evolución en el tiempo), no solo instantáneo

### 1.3. Principio rector

> **"Cada dato que mostramos al profesor debe responder a una pregunta que puede formular en lenguaje natural."**

Ejemplos:
- "¿Cómo va Ana esta semana?" → Trayectoria (E01)
- "¿Está mejorando o se ha estancado?" → Velocidad + Mesetas (E02, E03)
- "¿Qué alumnos necesitan atención?" → Alertas (E15)
- "¿Es el material adecuado o es demasiado difícil?" → Efectividad de contenido (E12, E13)
- "¿Les motiva jugar o lo dejan a medias?" → Engagement (E09)

### 1.4. Referencia

La teoría de visualización y los principios de diseño de dashboards están documentados en `documentation/Dashboard.md` (principios de Data Storytelling, semántica de la visualización, selección de gráficos). Este documento se centra en el **por qué** de cada dato, no en el **cómo** se visualiza.

---

## 2. Justificación de cada grupo analítico

### 2.1. Trayectoria de Aprendizaje (Endpoints E01-E04)

#### Fundamento pedagógico

El aprendizaje infantil **no es lineal**. Los niños de 4-8 años presentan patrones de progreso caracterizados por:
- **Avances repentinos** después de periodos de aparente estancamiento
- **Regresiones temporales** provocadas por fatiga, cambios emocionales o nuevos estímulos
- **Ritmos distintos** según el área temática (un niño puede ser rápido en geografía y lento en matemáticas)

Si el profesor solo ve una "foto" del rendimiento actual (score promedio = 65), pierde toda esta información dinámica. Necesita ver la **película completa**.

#### Por qué cada endpoint

| Endpoint | Pregunta que responde | Acción pedagógica |
|----------|----------------------|-------------------|
| **E01 — Trajectory** | "¿Cómo ha evolucionado el rendimiento de este alumno en las últimas semanas?" | Identificar si el alumno mejora, empeora o se estanca. Ajustar expectativas y planificación |
| **E02 — Velocity** | "¿A qué ritmo está mejorando? ¿Se está acelerando o frenando?" | Un alumno con score bajo pero velocidad alta necesita paciencia, no intervención. Uno con score alto pero velocidad negativa necesita atención urgente |
| **E03 — Plateaus** | "¿Se ha estancado? ¿Desde cuándo y por cuánto tiempo?" | Los estancamientos en educación infantil suelen indicar necesidad de cambio de estímulo: nuevo contexto, mecánica diferente, o descanso |
| **E04 — Evolution by context/mechanic** | "¿Mejora en geografía pero no en matemáticas?" | Permite intervención focalizada por área temática en vez de intervención genérica |

#### Decisión técnica: tendencia por regresión lineal

La tendencia (`improving`/`declining`/`stable`) se calcula mediante el coeficiente de pendiente (slope) de una regresión lineal simple sobre los scores en el periodo. La `confidence` se basa en el número de puntos de datos (R² no es práctico con <10 puntos):
- **high**: ≥7 data points y |slope| > 1.0
- **medium**: 4-6 data points o |slope| entre 0.5 y 1.0
- **low**: <4 data points o |slope| < 0.5

**Justificación del umbral stable**: se considera `stable` cuando el slope está entre -0.5 y +0.5 puntos por periodo. Con scores de 0-100, una variación de ±0.5 por semana es ruido estadístico, no tendencia.

---

### 2.2. Análisis Profundo de Sesiones (Endpoints E05-E08)

#### Fundamento pedagógico

Las métricas agregadas (score total, accuracy promedio) ocultan patrones **dentro** de una partida que son críticos para entender cómo aprende un niño:

- Un niño que acierta las 3 primeras rondas y falla las 3 últimas **no tiene un problema de conocimiento**, tiene un problema de **fatiga o atención**
- Un niño que falla siempre la misma tarjeta tiene un problema **específico de contenido**, no de capacidad general
- Dos errores seguidos pueden ser casualidad; cinco errores consecutivos son **frustración**

#### Por qué cada endpoint

| Endpoint | Pregunta que responde | Acción pedagógica |
|----------|----------------------|-------------------|
| **E05 — Rounds** | "¿Cómo fue esta partida ronda a ronda? ¿Se cansó hacia el final?" | Ajustar la duración de las sesiones. Si detecta fatiga, reducir el número de rondas |
| **E06 — Card analysis** | "¿Hay tarjetas que todos los alumnos fallan?" | Si el error es sistemático (>50% de error en múltiples alumnos), el problema es el contenido, no el alumno. Revisar el material didáctico |
| **E07 — Struggles** | "¿Ha tenido momentos de frustración con errores consecutivos?" | Detectar frustración temprana. En niños de 4-8 años, la frustración sostenida tiene impacto emocional real y puede generar rechazo al aprendizaje |
| **E08 — Fatigue** | "¿Se fatigan mis alumnos durante las partidas? ¿A partir de qué ronda?" | Dato agregado de clase para ajustar la configuración global de sesiones (tiempos, número de rondas) |

#### Decisión técnica: detección de fatiga

La fatiga se mide comparando el **tiempo medio de respuesta** en la primera mitad de las rondas vs la segunda mitad:

```
fatigueSlowdownPercent = ((avgTimeSecondHalf - avgTimeFirstHalf) / avgTimeFirstHalf) * 100
```

- **No se detecta fatiga**: slowdown < 20% (variación normal)
- **Fatiga leve**: 20-50% de slowdown
- **Fatiga significativa**: >50% de slowdown

**Justificación del umbral 20%**: en tests cognitivos infantiles, se considera que una variación de <20% en tiempos de respuesta está dentro de la fluctuación natural por distracción momentánea. Por encima de 20% de forma consistente, hay degradación atencional.

#### Decisión técnica: índice de dificultad de tarjetas

El **difficulty index** de una tarjeta se calcula como:

```
difficultyIndex = (errorCount + timeoutCount) / totalAttempts
```

Rango 0.0 (todos aciertan) a 1.0 (todos fallan). Siguiendo la convención de la Teoría Clásica de Tests (TCT):
- **0.00-0.20**: Muy fácil — casi todos aciertan
- **0.20-0.40**: Fácil — la mayoría acierta
- **0.40-0.60**: Dificultad óptima — discrimina bien entre niveles
- **0.60-0.80**: Difícil — la mayoría falla
- **0.80-1.00**: Muy difícil — posible problema de contenido

Las tarjetas con índice >0.60 en muestras de >10 alumnos deben ser revisadas por el profesor.

---

### 2.3. Métricas de Engagement (Endpoints E09-E11)

#### Fundamento pedagógico

**El rendimiento (score) no mide motivación.** Un alumno puede obtener buenas puntuaciones pero estar perdiendo interés. Las señales de desengagement en niños de 4-8 años incluyen:

- Jugar con menos frecuencia
- No terminar las partidas (abandono)
- No volver a jugar voluntariamente
- Aumentar el tiempo entre sesiones

Estas señales son **predictivas**: la caída de engagement precede a la caída de rendimiento. Si el profesor las detecta a tiempo, puede intervenir antes de que el problema se refleje en las notas.

#### Composición del Engagement Score

El score (0-100) combina 5 factores con pesos diferenciados:

| Factor | Peso | Justificación |
|--------|------|---------------|
| **Tasa de completado** | 0.30 | No terminar juegos es la señal más fuerte de desinterés. Peso mayor porque es el indicador más fiable y menos ambiguo |
| **Frecuencia de juego** | 0.25 | Jugar regularmente indica motivación sostenida |
| **Regularidad** | 0.25 | Distribución uniforme vs ráfagas. Jugar 10 partidas en 1 día y nada en 6 no es lo mismo que 1-2 al día |
| **Tiempo entre sesiones** | 0.10 | Complemento de frecuencia. Peso menor porque depende de factores externos (horario escolar) |
| **Replays voluntarios** | 0.10 | Repetir un juego por elección propia indica motivación intrínseca. Peso moderado porque no todos los niños tienen la oportunidad |

**Normalización**: cada factor se normaliza a 0-100 antes de aplicar el peso:
- Frecuencia: `min(gamesPerWeek / 5, 1) * 100` (5+ juegos/semana = máximo)
- Regularidad: `(díasActivos / díasTotales) * 100`
- Completado: `(completados / total) * 100`
- Tiempo entre sesiones: `max(1 - (avgDaysBetween / 7), 0) * 100` (7+ días = mínimo)
- Replays: `min(replayCount / 3, 1) * 100` (3+ replays = máximo)

#### Análisis de abandono

El abandono de partidas merece análisis separado porque sus causas son diversas:
- **Abandono en rondas tempranas (1-2)**: posible confusión con la mecánica o el contenido
- **Abandono en rondas medias**: posible frustración por dificultad
- **Abandono en rondas finales**: menos preocupante (posible interrupción externa)

Se analiza el `currentRound` en partidas abandonadas y el contexto donde más se abandona, para distinguir entre problemas de contenido y problemas de duración.

---

### 2.4. Efectividad de Contenido (Endpoints E12-E14)

#### Fundamento pedagógico

El análisis de datos no solo evalúa al alumno — **evalúa el material**. Un profesor necesita saber:

- "¿Este contexto temático funciona para enseñar?" → Si los scores no mejoran con repetición, el contenido no está enseñando
- "¿Hay tarjetas mal diseñadas?" → Si una tarjeta tiene >60% de error en todos los alumnos, el problema es la tarjeta
- "¿Cuál es la curva de aprendizaje de cada contenido?" → ¿Cuántas veces necesita jugar un niño para dominar un tema?

#### Por qué cada endpoint

| Endpoint | Pregunta que responde | Acción pedagógica |
|----------|----------------------|-------------------|
| **E12 — Content effectiveness** | "¿Qué contextos/mecánicas producen mejor aprendizaje?" | Priorizar contenidos efectivos y revisar los que no funcionan |
| **E13 — Card difficulty** | "¿Hay tarjetas específicas que son demasiado difíciles?" | Revisar o reemplazar tarjetas problemáticas. No culpar al alumno cuando el material es el problema |
| **E14 — Learning curves** | "¿Mejoran los niños con la repetición de un contenido?" | Si la curva es plana (no mejoran con repetición), el formato de enseñanza no funciona para ese tema |

#### Decisión técnica: curvas de aprendizaje

Las curvas se construyen numerando secuencialmente las partidas de cada alumno para un contexto determinado (1ª vez, 2ª vez, 3ª vez...) y promediando scores entre alumnos en cada "número de intento":

```
playNumber=1: promedio de todos los scores en su 1ª partida de "Geografía"
playNumber=2: promedio de todos los scores en su 2ª partida de "Geografía"
...
```

El **learning rate** es la pendiente de esta curva. Una curva con pendiente positiva significa que los niños aprenden con la repetición. Una curva plana o descendente indica un problema con el contenido.

El **plateau point** (`plateauAt`) indica el número de partida tras el cual la mejora se estabiliza. Es útil para saber cuántas repeticiones son productivas antes de que los rendimientos sean decrecientes.

---

### 2.5. Sistema de Alertas Inteligentes (T-941, ADR-161)

> **Actualizado en T-941**: el motor pasa de cálculo on-the-fly a **persistencia con ciclo de vida formal** (`SmartAlert`). Se mantienen los detectores originales y se añaden 7 más (incluido `plateau_detected` que en versiones anteriores estaba declarado pero no implementado). Catálogo de tipos: ver `backend/src/config/alerts.js`.

#### Fundamento pedagógico

Los profesores **no tienen tiempo** de revisar gráficos a diario para cada alumno. Las alertas son el puente entre los datos y la acción. En educación infantil, la intervención temprana es especialmente crítica porque:

- Los patrones negativos se consolidan rápidamente a estas edades
- La ventana de atención es corta: si un niño se desanima, puede ser difícil reconectarlo
- Los profesores gestionan 20-30 alumnos simultáneamente

#### Tipos de alerta y justificación de umbrales

| Tipo | Umbral | Severidad | Justificación |
|------|--------|-----------|---------------|
| `declining_performance` | Bajada >10% en 7 días | warning (10-20%), critical (>20%) | <10% es fluctuación normal día a día. >10% sostenido en 7 días indica tendencia real, no ruido. **Filtra `previousAvg > 0` para evitar Infinity %** (BUG-T941-1) |
| `inactivity` | >7 días sin jugar | info (7-14d), warning (>14d) | 7 días = más de una semana lectiva completa. Si un alumno no juega en todo ese tiempo, algo ha cambiado |
| `sudden_score_drop` | Score >30 puntos bajo la media del alumno | warning | 30 puntos en una escala 0-100 es una desviación de ~2σ. Indica una partida anómala que merece revisión |
| `consistent_timeout` | Tasa de timeout >30% en últimas 5 partidas | warning | Los timeouts no son errores de conocimiento, son señales de confusión o desatención. 30% sostenido en 5 partidas no es accidental |
| `improving_fast` | Mejora >15% en 7 días | info (positiva) | Alerta positiva para que el profesor refuerce el progreso del alumno. El reconocimiento es crucial en educación infantil |
| `plateau_detected` | stdDev(score) ≤ 5 en ≥ 5 partidas | info | T-941 cierra el TODO histórico. Indica contenido demasiado fácil o difícil; el profesor decide cambiar de estímulo |
| `high_abandonment` | Tasa de abandono >25% en 7 días | warning | 1 de cada 4 juegos abandonados indica un problema sistemático |
| `engagement_drop` | Caída >25% en `engagementScore` (30d vs 60-30d) | warning | Reusa cache de `engagementService` (TTL 600s). Detecta desmotivación antes que `inactivity` |
| `recovery_after_drop` | `sudden_score_drop`/`declining_performance` resuelta en los últimos 30 días | info (positiva) | Refuerzo positivo durante 7 días tras la recuperación. Convierte el sistema en algo que el docente *quiere* abrir |
| `mastery_milestone` | ≥80% accuracy sostenido en ≥5 partidas en un contexto | info (positiva) | Hito celebratorio por contexto temático. Dedup nivel detector por `data.contextId` (no encaja en el unique index BD) |
| `mechanic_specific_struggle` | Gap ≥30 puntos entre mecánica fuerte y débil, débil <50, ≥3 partidas en cada mecánica | warning | Lectura pedagógica única en el proyecto. Sugiere intervención específica por mecánica |
| `sequence_stagnation` | `maxSequenceLengthAchieved` no supera el mismo valor en 5 partidas Secuencia | warning | T-923 lo dejó pendiente "post-T-941". Identifica techo cognitivo en Secuencia |
| `sequence_order_errors` | `partialReproductions / totalAttempts ≥ 0.4` en últimas partidas Secuencia | warning | T-923 lo dejó pendiente "post-T-941". Distingue problema de orden vs memoria pura |

Todos los umbrales viven en `backend/src/config/alerts.js` (única fuente de verdad). Aplicables por env vars para tuning sin redeploy.

#### Persistencia y ciclo de vida (T-941)

Las alertas viven en MongoDB (`smartalerts`) con estados `active | resolved | dismissed | snoozed`:

- **Insert** cuando un detector retorna finding nuevo (sin alerta activa para `(studentId, type)`).
- **Update** `lastSeenAt + occurrencesCount + severity` cuando el finding se re-detecta. Severity escalation automática: `warning` con `daysActive ≥ 7` y `occurrencesCount ≥ 3` → `critical`. Trazado en `severityHistory[]`.
- **Auto-resolve** tras 2 corridas consecutivas sin reaparecer (`autoResolveAfterMissedRuns`).
- **Dismiss/Resolve/Snooze** manuales por el docente vía endpoints `PATCH /api/analytics/alerts/:id/{dismiss|resolve|snooze}`. Dismiss soporta `reason` (`false_positive | already_addressed | irrelevant | other`).
- **Pinning** (máx 3 por docente).
- **Auto-reapertura** de dismissed críticas que reaparecen tras 60 días (configurable, evita el caso "descarté hace 4 meses, ahora el alumno está mucho peor").
- **Hard-delete** de resolved/dismissed > 365 días vía cron `data-retention` (integrado, sin queue nueva).

#### Worker BullMQ

Cron `*/15 * * * *` (env `ALERT_DETECTION_CRON`) ejecuta `alertDetectionService.runForAllTeachers()`. Worker en proceso separado `worker.js` (no acopla al HTTP backend). Idempotente vía `jobId` fijo.

#### Notificación realtime

Cuando aparece una alerta `critical` nueva o una existente se promueve a `critical` por escalation, el servicio emite `notificationService.notify({ type: 'student_at_risk', priority: 'critical' })`. Reusa la infraestructura T-955 (dedup window 60s, room `user_${teacherId}`). El frontend dispara `window.dispatchEvent(new CustomEvent('smartalert:created'))` para refrescar el Dashboard sin reload.

#### RGPD

- `loadActiveStudentsForTeacher` excluye estudiantes con `consent.withdrawnAt` (Art. 7 RGPD). Defensa en profundidad: el orquestador también descarta findings cuyo `studentId` no esté en el conjunto cargado.
- Cada SmartAlert lleva `studentPseudoId` (sha256 truncado, determinista). Los logs Pino solo usan pseudo IDs — nunca `studentId` plano.

#### Cache

Namespace dedicado `cache:alerts` con TTL 60 s, invalidación granular por teacher vía `cacheInvalidatePattern('cache:alerts', 'teacher:{tid}:*')` (utilidad nueva en `cacheHelper.js`). Cada acción lifecycle invalida.

---

### 2.6. Sistema de Alertas Operativas para super_admin (T-942, ADR-162)

Espejo conceptual del § 2.5 para alertas operacionales (Redis, MongoDB, colas BullMQ, seguridad, moderación, compliance) gestionadas por la dirección del centro.

#### Diferencias clave frente a SmartAlert

| Dimensión | SmartAlert (teacher) | SystemAlert (super_admin) |
|---|---|---|
| Dueño | `teacherId` obligatorio | Sin dueño: alerta global por incidente |
| Dedup unique | `(studentId, type, status='active')` | `(type, status='active')` |
| Audiencia notificación | Teacher dueño (`student_at_risk`) | Todos los super_admins (`system_alert_critical`) |
| Cron detección | `*/15 * * * *` | `*/5 * * * *` (más frecuente) |
| Escalation warning→critical | 7 días + 3 ocurrencias | 2 horas + 3 ocurrencias |
| Reopen tras dismiss | 60 días | 12 horas |
| Hard-delete | 365 días | 90 días |
| Snooze presets | 1/7/14/30 días | 1/6/24/72 horas |
| Cache TTL | 60 s | 30 s |
| Cache namespace | `cache:alerts:teacher:*` | `cache:system-alerts:*` |

#### Catálogo de detectores

> Catálogo canónico en `config/systemAlerts.js` (`SYSTEM_ALERT_TYPES`). Se documentan aquí los detectores núcleo por categoría; los detectores de cuota free-tier (T-910) viven en `Free_Tier_Budget.md`.

**Sistema/Operación (4):**
- `redis_high_latency`: ≥3 muestras consecutivas con avgLatency superior al umbral (100ms warning / 500ms critical).
- `mongo_disconnected`: `mongoose.connection.readyState ≠ 1` durante 2 muestras consecutivas → critical inmediato.
- `memory_pressure`: heap percent usado >85% (warning) / >95% (critical).
- `queue_backlog`: cualquier queue BullMQ con jobs pending > umbral o failed > 0.

**Seguridad (4):**
- `account_lockout_spike`: ≥5/h warning, ≥20/h critical. Lee `securityCounters.account_locked` (sliding 1 h en Redis).
- `auth_failed_spike`: ≥50/h warning, ≥200/h critical. Lee `securityCounters.auth_failed`.
- `token_theft_detected`: cualquier ocurrencia → critical inmediato. Lee `securityCounters.token_theft`.
- `rfid_hmac_spike` (ADR-206 addendum): ≥10/h warning, ≥30/h critical sobre el **total** de rechazos del enforcement HMAC RFID. Suma dos contadores: `securityCounters.rfid_hmac_invalid` (firma no cuadra, `HMAC_INVALID`) + `securityCounters.rfid_replay` (counter no creciente, `COUNTER_REPLAY`), ambos incrementados desde `rfidHmacValidator` al rechazar en modo enforce. El finding desglosa `invalidLastHour` vs `replayLastHour`: predominio de replay → posible reproducción/sensor clonado; predominio de invalid → firmware en actualización o secret desincronizado. Playbook: `Runbook_Operacional.md` (alerta `rfid_hmac_spike`).

**Moderación (3):**
- `pending_teachers_aging`: warning si oldest pending ≥48h, critical ≥7 días. Lookup en `User` por `accountStatus:'pending_approval'`.
- `inactive_teachers`: info ≥30 días, warning ≥90 días sin login. Agregado: el finding cita el count y un ejemplo.
- `context_without_assets`: warning si hay contextos con `assets:[]` creados hace >24h.

**Compliance (2):**
- `data_retention_lag`: warning si última ejecución del job de retención RGPD >48h, critical >7d. Lee timestamp escrito por `dataRetentionWorker` en Redis (`system:meta:lastRetentionRun`).
- `consent_withdrawal_spike`: info ≥5/día, warning ≥20/día. Agregado sobre `consent.history` por action='withdrawn'.

#### `securityCountersService`

Servicio nuevo en `services/security/securityCountersService.js`. Para cada evento auth importante (`AUTH_LOGIN_FAILED`, `AUTH_ACCOUNT_LOCKED`, `AUTH_TOKEN_THEFT_DETECTED`, `DATA_CONSENT_CHANGE` con action='withdrawn'), `securityLogger.logSecurityEvent` invoca `securityCounters.increment(eventType)` fire-and-forget. Implementación: `ZADD security:counter:<eventType> <timestamp> <member>` + `ZCOUNT` en ventana de 1 h. Fail-open: si Redis cae, no bloquea autenticación ni propaga errores. Limpieza perezosa cada 50 llamadas vía `ZREMRANGEBYSCORE`.

#### Persistencia + lifecycle

Mismo modelo que SmartAlert (active/resolved/dismissed/snoozed/snoozedUntil/severityHistory). Pero:
- Sin `teacherId/studentId/studentPseudoId/gamePlayId`.
- Con `title`, `source`, `component`, `data` (Mixed), `runbookUrl` (link a doc interna).
- Audit `resolvedBy/dismissedBy/snoozedBy/pinnedBy` (`role: 'super_admin'`).

#### Avisos a profesores (SystemAnnouncement)

Mecanismo complementario manual: la dirección publica avisos (`title`, `body`, `severity: info/warning/urgent`, `linkUrl`, `expiresAt`) dirigidos a `all_teachers` o `all_users`. Persiste en `systemannouncements`. El backend expone `/api/announcements/active` (cualquier rol autenticado) y el frontend renderiza `<TeacherAnnouncementBanner />` en `AppLayout` (solo teacher) con stack máx. 3 visibles ordenados por severidad. Dismiss persistente en `localStorage` por usuario. Límite `SYSTEM_ANNOUNCEMENT_MAX_ACTIVE=3` por audience.

---

### 2.7. Datos para Reportes y Exportación (Endpoints E17-E19)

#### Fundamento pedagógico

Los datos **deben poder salir de la plataforma** para ser útiles en contextos no digitales:

- **Reuniones con familias**: el profesor necesita un informe comprensible del progreso del niño
- **Coordinación con orientadores**: si se detecta una dificultad, los datos objetivos ayudan al diagnóstico
- **Informes de evaluación**: muchos centros requieren documentación formal del progreso

#### Diseño de los reportes

- **Reporte de estudiante (E17)**: combina todos los sub-servicios en una sola respuesta. Incluye overview, trayectoria, rendimiento por contexto/mecánica, historial de partidas, momentos de dificultad y alertas activas. Diseñado para ser renderizado como PDF client-side.
- **Reporte de clase (E18)**: visión macro con distribución, tendencias, contenido más y menos efectivo, y resumen por alumno.
- **Exportación tabular (E19)**: formato plano (headers + rows) optimizado para generación de CSV client-side con `Blob + URL.createObjectURL`. Columnas en español para el usuario final.

---

## 3. Decisiones Arquitectónicas

### 3.1. Descomposición del servicio de analytics

El `analyticsService.js` actual tiene **1092 líneas** con 11 funciones. Añadir 19 endpoints más lo llevaría a ~3000+ líneas, haciéndolo difícil de mantener, testear y revisar.

**Decisión**: crear sub-servicios temáticos bajo `services/analytics/` sin modificar el servicio existente. Cada sub-servicio tiene responsabilidad única y es testeable de forma aislada.

**Justificación detallada en ADR-026.**

### 3.2. No se crean campos nuevos en los modelos

Toda la información analítica se **deriva** de datos que ya existen:
- `GamePlay.events[]` contiene el log completo de cada partida
- `GamePlay.metrics` tiene los contadores agregados
- `User.studentMetrics` tiene estadísticas pre-computadas por alumno
- `GameSession.cardMappings` tiene la asignación tarjeta→valor

**Ventaja**: zero migraciones, zero riesgo de inconsistencia, zero cambios en el flujo de escritura.

**Solo se añaden índices** para optimizar las nuevas queries de lectura:
- `GamePlay: { playerId: 1, status: 1, startedAt: -1 }` — para queries de engagement que necesitan partidas abandonadas
- `GameSession: { createdBy: 1, contextId: 1 }` — para lookups de contenido por profesor

### 3.3. Computación de alertas on-the-fly con cache

Ver sección 2.5 para la justificación completa. En resumen: frescura de datos + simplicidad > reducción marginal de queries.

### 3.4. Framework KPI: umbrales RAG e interpretación automática

Todos los endpoints de analytics enriquecen sus respuestas con:

1. **Estado RAG** (Red/Amber/Green) — clasificación visual inmediata para el profesor
2. **Interpretación automática** — texto en español siguiendo el patrón "What / So What / Now What" del framework de Business Intelligence

#### Definiciones de KPI con umbrales

Cada métrica tiene umbrales formales definidos en `analyticsHelpers.js → KPI_DEFINITIONS`:

| KPI | Unidad | Dirección | Green (OK) | Red (Alarma) | Target |
|-----|--------|-----------|------------|--------------|--------|
| `score` | puntos | higher_better | ≥70 | <50 | 75 |
| `accuracy` | % | higher_better | ≥75 | <50 | 80 |
| `engagementScore` | puntos | higher_better | ≥60 | <35 | 70 |
| `completionRate` | % | higher_better | ≥85 | <60 | 90 |
| `abandonmentRate` | % | lower_better | ≤10 | >25 | 5 |
| `responseTime` | ms | lower_better | ≤4000 | >8000 | 3000 |
| `fatigueSlowdown` | % | lower_better | ≤15 | >40 | 10 |
| `cardErrorRate` | % | lower_better | ≤30 | >60 | 20 |
| `learningRate` | pts/intento | higher_better | ≥2 | <0 | 3 |
| `trendSlope` | pts/periodo | higher_better | ≥0.5 | <-0.5 | 1.0 |

#### Justificación de umbrales

- **Score 70/50**: basado en los PERFORMANCE_TIERS existentes (ADR-017). 70 = "bueno", 50 = "riesgo"
- **Accuracy 75/50**: 75% significa 3 de cada 4 aciertos, nivel razonable para 4-8 años. <50% es prácticamente aleatorio
- **Engagement 60/35**: derivado empíricamente de los pesos del score compuesto. Un alumno que juega 3 veces/semana con 80% de completado obtiene ~60
- **Response time 4s/8s**: basado en estudios de atención infantil. Niños de 4-8 años responden en 2-5s en tareas familiares
- **Fatigue 15%/40%**: <15% es variación normal de atención. >40% indica degradación significativa

#### Patrón "What / So What / Now What"

Cada interpretación sigue tres niveles adaptados al público (profesores sin formación técnica):

- **What**: observación factual del dato ("Tasa de acierto del 62%")
- **So What**: significado pedagógico ("Acierta más de la mitad pero comete errores frecuentes")
- **Now What**: acción recomendada ("Revisar qué tarjetas o conceptos causan más fallos")

Las interpretaciones varían según el estado RAG: verde = refuerzo positivo, ámbar = monitorización, rojo = intervención.

#### Jerarquía visual en reportes

Los endpoints de reportes (E17, E18) estructuran sus respuestas en niveles jerárquicos siguiendo el principio "Summary → Trends → Details":

1. **Nivel 1 — Summary**: KPIs principales con RAG (lo que el profesor ve primero)
2. **Nivel 2 — Trends**: gráficos de tendencia temporal
3. **Nivel 3 — Engagement**: participación y análisis de abandono
4. **Nivel 4 — Details**: desglose completo (solo en formato `detailed`)

### 3.5. Estrategia de caching diferenciada

| Tipo de dato | TTL | Razón |
|-------------|-----|-------|
| Alertas y reportes | 600s (10 min) | Computación costosa (múltiples queries paralelas). 10 minutos es aceptable porque las alertas no necesitan ser instantáneas |
| Engagement y contenido (classroom) | 300s (5 min) | Consultas que agregan datos de toda la clase. Cambian con cada partida pero el profesor no necesita datos al segundo |
| Datos individuales de estudiante | 300s (5 min) | Pueden cambiar tras cada partida pero el impacto visual en un gráfico de semanas es mínimo |

### 3.6. Alcance del filtro de contenido del Dashboard (contexto/mecánica)

El Dashboard docente permite filtrar por contexto temático y mecánica. Qué vistas responden al filtro y cuáles permanecen globales es una decisión deliberada (ver ADR-190):

- **Responden al filtro** (mismo subconjunto): KPIs (`summary`), distribución (`distribution`), tendencia diaria (`comparison`) y listado de alumnos (`students`). Todas resuelven sus `sessionIds` vía `resolveTeacherSessionIds`, que aísla el camino filtrado (query directa a `GameSession` por `{createdBy, contextId?, mechanicId?}`) del camino sin filtro (lista cacheada compartida), garantizando regresión cero cuando no hay filtro.
- **Permanecen globales** (con rótulo de alcance honesto en la UI cuando hay filtro activo): el «Mapa de Calor de Dificultad» (es una comparación cruzada Contexto×Mecánica — filtrarlo por un contexto lo reduciría a una fila y perdería su propósito) y «Actividad Semanal» (patrón temporal de cuándo se juega, no específico de contenido).

**Rango temporal `90d`:** los selectores de la UI ofrecen «Trimestre actual» / «Últimos 90 días» (→ `90d`). Todos los endpoints de aula y de alumno alcanzables desde esos selectores aceptan `7d/30d/90d` y centralizan el cálculo en `getDateRange`. ADR-190 cerró el desfase en `comparison`/`heatmap`/`student summary`, cuyos validators habían quedado en `7d/30d` pese a que la UI ya ofrecía `90d`.

---

## 4. Implementación Frontend: Suite de Analytics

> **Estado**: Implementado — Sprint 5 (abril 2026)
> **ADRs relacionados**: ADR-027 (Arquitectura Frontend de Analytics), ADR-028 (Composición de Componentes)

### 4.1. Arquitectura de 4 páginas

El frontend consume los 26 endpoints del backend a través de `services/analytics.js` (26 métodos) y los distribuye en 4 páginas con niveles de profundidad progresiva:

| Página | Ruta | Propósito | Pregunta que responde |
|--------|------|-----------|----------------------|
| **Dashboard** | `/dashboard` | Visión rápida (5 segundos) | "¿Cómo va mi clase hoy?" |
| **Perfil Estudiante** | `/students/:id` | Análisis individual (2 minutos) | "¿Qué le pasa a este alumno?" |
| **Mis Alumnos** | `/analytics/students` | Comparación de grupo | "¿Quién destaca, quién necesita apoyo?" |
| **Insights y Reportes** | `/analytics/insights` | Análisis profundo | "¿Qué contenido funciona? ¿Qué alertas hay?" |

**Justificación de 4 páginas (no 1 dashboard monolítico)**: los profesores necesitan diferentes niveles de profundidad para diferentes tareas. Un dashboard único con todo genera sobrecarga cognitiva en usuarios no técnicos. La navegación progresiva (Dashboard → click alumno → Perfil) guía al profesor de lo general a lo específico.

### 4.2. Lenguaje visual: Sistema RAG como elemento firma

Todas las visualizaciones comparten un **patrón de 4 capas** consistente en cada métrica:

1. **Valor numérico** — el dato crudo (ej: "82%")
2. **Indicador RAG** — semáforo visual (verde/ámbar/rojo) con los umbrales de la sección 3.4
3. **Comparativa contextual** — contexto que da significado al dato (ej: "vs clase: 71%")
4. **Micro-narrativa** — texto accionable (ej: "Mejorando" / "Necesita atención")

Este patrón se implementa en el componente `StudentKPICard` con borde izquierdo coloreado (4px) como indicador RAG. Los profesores entienden intuitivamente el semáforo sin formación técnica.

**Colores RAG**: se reutilizan los tokens OKLCH del design system existente (`--color-success-base`, `--color-warning-base`, `--color-error-base`) para mantener coherencia visual con el resto de la aplicación.

### 4.3. Mapeo endpoint → componente (implementado)

| Endpoint backend | Componente frontend | Página | Tipo de visualización |
|-----------------|---------------------|--------|----------------------|
| E01 trajectory | `TrajectoryChart` | Perfil Estudiante | LineChart con línea alumno + overlay clase punteada + badge tendencia (mejorando/estable/declinando) |
| E02-E03 velocity/plateaus | Datos en `TrajectoryChart` | Perfil Estudiante | Indicador de confianza + detección de mesetas integrada |
| E04 evolution | `PerformanceByDimension` | Perfil Estudiante | BarChart horizontal con barras coloreadas RAG, dos instancias: por contexto Y por mecánica |
| E05 rounds | `GameHistoryTable` (expandible) | Perfil Estudiante | Tabla con desglose por ronda al hacer click |
| E06 card-analysis | `ContentEffectivenessMatrix` | Insights (tab Efectividad) | Matriz grid mecánica × contexto con celdas RAG interactivas |
| E07 struggles | Datos en `StrengthsWeaknesses` | Perfil Estudiante | Tarjetas de debilidades derivadas de datos de rendimiento |
| E08 fatigue | `ActivityHeatmap` | Dashboard | Grid día × hora con intensidad de color (cuándo juegan) |
| E09 engagement | `EngagementRadar` | Perfil Estudiante | RadarChart con 5 ejes (frecuencia, regularidad, completado, constancia, replays) |
| E10 classroom engagement | Datos en `StudentsAnalytics` | Mis Alumnos | Columna de engagement en tabla comparativa |
| E11 play-patterns | `ActivityHeatmap` + timeline | Dashboard | Heatmap semanal + timeline de actividad reciente |
| E12 content-effectiveness | `ContentEffectivenessMatrix` | Insights (tab Efectividad) | Grid mecánica × contexto con RAG y detalle expandible |
| E13 card-difficulty | Datos en `ContentEffectivenessMatrix` | Insights (tab Efectividad) | Integrado en la matriz de efectividad |
| E14 learning-curves | `LearningCurvesSection` (AreaChart) | Insights (tab Efectividad) | AreaChart con múltiples líneas por contexto, eje X = intento, eje Y = score |
| E15 alerts | `AlertsPanel` (Dashboard) + `AlertsHub` (Insights) | Dashboard + Insights | Dashboard: top 5 alertas con acción. Insights: hub completo con filtros severidad/tipo |
| E16 alerts/summary | Sidebar badge | Navegación | Badge numérico en "Dashboard" del sidebar |
| E17 reports/student | `ReportGenerator` | Insights (tab Informes) | Preview renderizado + exportación CSV/print |
| E18 reports/classroom | `ReportGenerator` | Insights (tab Informes) | Preview renderizado + exportación CSV/print |
| E19 reports/export | `exportToCSV()` | Mis Alumnos | Descarga CSV client-side con `Blob + URL.createObjectURL` |

### 4.4. Justificación de decisiones de visualización

#### ¿Por qué la dimensión mecánica × contexto como matriz grid?

La `ContentEffectivenessMatrix` muestra mecánicas como filas y contextos como columnas, con celdas coloreadas RAG. Se eligió un grid (no un scatter plot) porque:
- Un profesor de primaria interpreta una **tabla coloreada** (celda verde = bien, roja = mal) mucho más rápido que un gráfico abstracto
- La dimensión mecánica × contexto es **exactamente una matriz 2D**, por lo que la representación natural es un grid
- Permite identificar rápidamente combinaciones problemáticas (ej: "Asociación + Números tiene celda roja")

#### ¿Por qué RadarChart para engagement?

El `EngagementRadar` usa 5 ejes (frecuencia, regularidad, completado, constancia, replays) porque:
- Muestra el **perfil completo** de un vistazo: un alumno con alta frecuencia pero baja regularidad se ve inmediatamente
- Los radares son intuitivos para mostrar equilibrio/desequilibrio entre múltiples factores
- Es visualmente diferente a los BarCharts de rendimiento, lo que ayuda a distinguir "cómo rinde" de "cuánto participa"

#### ¿Por qué narrativa What/So What/Now What?

El `NarrativeCard` traduce datos numéricos en lenguaje natural siguiendo el framework BI de Data Storytelling:
- **What Happened** ("Qué pasó"): observación factual — ancla al profesor en los datos
- **So What** ("Por qué importa"): implicación pedagógica — conecta el dato con el contexto educativo
- **Now What** ("Qué hacer"): acción recomendada — el dato se convierte en acción

Estas narrativas se generan server-side en `analyticsHelpers.js` con `generateInterpretation()` y se entregan al frontend listas para renderizar. El profesor no necesita interpretar gráficos — recibe directamente la acción sugerida.

#### ¿Por qué tabla (no cards) en Mis Alumnos?

Para comparación de múltiples alumnos, la tabla es superior a cards porque:
- Permite **ordenar** por cualquier columna con un click
- Facilita el **escaneo vertical** para encontrar valores extremos
- Los valores están **alineados** para comparación directa
- Es la forma más **densa** de mostrar datos multidimensionales

Las cards se usan en el Perfil Individual donde cada métrica necesita más espacio visual (RAG, comparativa, narrativa).

### 4.5. Estrategia de rendimiento frontend

| Técnica | Implementación | Impacto |
|---------|----------------|---------|
| **Lazy loading** de páginas | `React.lazy()` en App.jsx | Las 3 páginas nuevas no se cargan hasta que se navega a ellas |
| **Promise.all** para fetching | Todos los datos de cada página se piden en paralelo | Elimina waterfalls secuenciales |
| **Catch no-bloqueante** | Datos secundarios (trajectory, engagement) con `.catch(() => null)` | Si un endpoint falla, la página muestra lo que tiene |
| **Memoización** | `memo()` en charts, `useMemo()` en derivaciones | Evita re-renders costosos de Recharts |
| **AbortController** | Limpieza en `useEffect` cleanup | Previene race conditions al cambiar de página o período |
| **Skeleton loading** | Estructura idéntica al contenido final | Previene CLS (Cumulative Layout Shift) |
| **prefers-reduced-motion** | `useReducedMotion()` hook en todos los componentes | Desactiva animaciones para usuarios sensibles al movimiento |

### 4.6. Componentes reutilizables

Se crearon 11 componentes en `frontend/src/components/analytics/` diseñados para composición flexible:

| Componente | Responsabilidad | Reutilizado en |
|------------|----------------|----------------|
| `StudentKPICard` | Métrica individual con RAG 4 capas | Perfil Estudiante (6 instancias) |
| `TrajectoryChart` | Gráfico temporal con overlay de clase | Perfil Estudiante |
| `NarrativeCard` | Framework What/So What/Now What | Perfil Estudiante |
| `PerformanceByDimension` | BarChart horizontal (contexto O mecánica) | Perfil Estudiante (2 instancias) |
| `EngagementRadar` | RadarChart de 5 ejes | Perfil Estudiante |
| `GameHistoryTable` | Tabla de historial con paginación | Perfil Estudiante |
| `StrengthsWeaknesses` | Fortalezas/debilidades derivadas | Perfil Estudiante |
| `ActivityHeatmap` | Grid día × hora | Dashboard |
| `ContentEffectivenessMatrix` | Matriz mecánica × contexto RAG | Insights |
| `AlertsHub` | Hub de alertas con filtros | Insights |
| `ReportGenerator` | Generación de informes | Insights |

### 4.7. Consolidación de umbrales RAG en frontend

Los umbrales de clasificación RAG (score ≥70 → green, ≥50 → amber, <50 → red) y los tiers de rendimiento (≥90 excellent, ≥70 good, ≥50 average, <50 risk) estaban definidos como funciones inline en 6 archivos diferentes (StudentProfile, GameHistoryTable, PerformanceByDimension, ContentEffectivenessMatrix, ReportGenerator). Esto violaba el principio DRY y creaba riesgo de divergencia.

**Decisión:** Se creó `frontend/src/constants/analyticsThresholds.js` como fuente única de verdad frontend. Exporta `scoreToTier()`, `scoreToRAG()`, `getRAGCSSColor()`, `scoreToRAGWithNull()`, `PERFORMANCE_TIERS`, `TIER_CONFIG` y `TIER_BADGE`. Los 5 componentes fueron refactorizados para importar desde este módulo.

**Relación con backend:** Los valores reflejan los definidos en `analyticsHelpers.js` → `KPI_DEFINITIONS`. Si los umbrales cambian en el backend, deben actualizarse en el frontend también (documentado en el header del archivo).

### 4.8. Estrategia de filtrado en Dashboard

**Contexto:** T-604 requería filtros de contexto temático y mecánica de juego en el Dashboard. El servicio original `analyticsService.js` no puede modificarse (ADR-026).

**Decisión:** Filtrado híbrido:
- **Server-side** para `getClassroomStudents`: el controlador (`analyticsController.js`) pre-filtra los estudiantes que han jugado en sesiones con el contexto/mecánica seleccionados usando queries a `GameSession` + `GamePlay.distinct('playerId')`.
- **Client-side** para componentes cuyo endpoint no acepta estos filtros: los KPIs y trends muestran datos globales de clase (que es lo pedagógicamente correcto — el profesor necesita la visión general).

**Justificación:** El filtrado más granular por contenido está disponible en la página de Insights (`/analytics/insights`) con la `ContentEffectivenessMatrix`, que es el lugar natural para ese nivel de detalle. El Dashboard prioriza la visión de alto nivel.

### 4.9. Cache ligero en Dashboard

El Dashboard realiza 8 peticiones paralelas en cada carga. Para evitar re-fetches innecesarios (ej. al volver a la pestaña), se implementó un cache en memoria con `useRef` que almacena el timestamp del último fetch junto con la clave de filtros (`timeRange:contextId:mechanicId`). Si los datos tienen menos de 60 segundos y los filtros no han cambiado, se reutilizan los datos existentes sin hacer nuevas peticiones.

---

## 5. Mecánica Secuencia (T-921 / T-923)

La tercera mecánica añade KPIs propios que no encajan en el esquema común de Asociación/Memoria. La filosofía de diseño es la misma: el alumno juega, el backend persiste métricas crudas en `GamePlay.metrics`, y el `analyticsService` agrega esas métricas en bloques específicos por mecánica que el frontend consume sin necesidad de filtros.

### 5.1. KPIs específicos persistidos en `GamePlay.metrics`

| Campo | Tipo | Significado |
|---|---|---|
| `sequencesCompleted` | int | Rondas terminadas con todas las cartas correctas. |
| `sequencesBlocked` | int | Rondas con al menos una carta bloqueada por fallos. |
| `sequencesTimedOut` | int | Rondas que no se completaron a tiempo. |
| `maxSequenceLengthAchieved` | int | Longitud máxima reproducida correctamente. **Mejor indicador de la "memoria de trabajo" del alumno.** |
| `partialReproductions` | int | Cartas correctas acumuladas antes del primer fallo en cada ronda. |
| `averageReproductionTimeMs` | int | Tiempo medio de la fase reproducing (no incluye memorización). |
| `blockedCardsTotal` | int | Total de cartas bloqueadas por fallos en la partida. |
| `hintsUsed` | int | Pistas entregadas (sólo aplica en dificultad easy). |

### 5.2. Agregación: `analyticsService.getStudentSummary().bySequence`

Pipeline `$facet` con un nuevo branch `sequenceStats` que filtra por `mechanic.name === 'sequence'` y produce los mismos campos sumados/máximos sobre el rango temporal. `null` si no hay partidas Secuencia.

### 5.3. Lectura pedagógica para el profesor

- **`maxSequenceLengthAchieved` creciente en el tiempo** → el alumno está mejorando su capacidad de retención visoespacial.
- **`partialReproductions` alto pero `sequencesCompleted` bajo** → "memoria de comienzo" buena pero pierde foco a mitad. Ajustar `displaySeconds` o reducir `maxSequenceLength`.
- **`sequencesBlocked >> sequencesTimedOut`** → el problema es de identificación de carta, no de tiempo. Considerar revisar el orden mostrado o subir dificultad.
- **`sequencesTimedOut >> sequencesBlocked`** → el alumno acierta cuando llega pero no llega. Subir `timeLimit`.
- **`hintsUsed > 0` con dificultad ≠ easy** → no debería ocurrir; señal de bug.

### 5.4. Matriz mecánica × KPI

| KPI | Asociación | Memoria | Secuencia |
|---|:---:|:---:|:---:|
| `correctAttempts` | ✅ | ✅ | ✅ (cartas correctas) |
| `errorAttempts` | ✅ | ✅ | ✅ (incluye blocked + timedOut individuales) |
| `timeoutAttempts` | ✅ | — | ✅ (cartas timed out) |
| `averageResponseTime` | ✅ | ✅ | ✅ |
| `sequencesCompleted` | — | — | ✅ |
| `maxSequenceLengthAchieved` | — | — | ✅ |
| `partialReproductions` | — | — | ✅ |
| `hintsUsed` | — | — | ✅ |

Los `—` significan que el campo no aplica y queda `undefined` en el documento (no `0`); el DTO los omite del payload público.

### 5.5. Exposición en `getClassroomStudents` y vista comparativa (ADR-163)

Tras la auditoría post-cierre de Sprint 6 (P0-3 del plan), `analyticsService.getClassroomStudents` añade `studentMetrics.maxSequenceLengthAchieved` y `studentMetrics.sequencesCompleted` al payload de cada alumno. El frontend (`pages/StudentsAnalytics.jsx`) normaliza el primer campo al nivel raíz y lo expone como columna ordenable **"Mejor Secuencia"** con icono `ListOrdered` ámbar y tooltip explicativo. Empty state `—` cuando el alumno no ha jugado partidas Secuencia. La columna entra también en el export CSV.

Esto cierra el criterio 7 de T-922 ("vista comparativa con columna Mejor Secuencia"): permite que el docente compare retención visoespacial entre alumnos del aula con un único barrido visual, complementando la vista granular de `StudentProfile` (que sigue mostrando el `SequenceProgressChart` con la evolución temporal).

## Sprint 0 pre-v1.0.0 — Slow-query observability + materialización planificada (ADR-164, M1)

### Observabilidad de pipelines
`gamePlayRepository.aggregate` ahora mide tiempo de cada aggregation y dispara `logger.warn(alert:true)` si supera `SLOW_AGGREGATE_WARN_MS=5000` (configurable). El log incluye `firstStage` para identificar qué pipeline aporta latencia. Esto da visibilidad **antes** de que MongoDB aborte por `maxTimeMS=15s` y la UX se degrade.

### Candidatos a materialización (diferido a Sprint 3)
Los pipelines `getStudentDifficulties` y `getStudentSummary` realizan 3+ `$lookup` consecutivos (gameplays → sessions → contexts → mechanics). Con dataset de seed (~50 plays) el coste es bajo, pero a escala (10K+ plays) son candidatos a vista materializada nightly:

- **Job BullMQ:** `studentMetricsAggregator` ejecuta el pipeline una vez por noche y persiste los resultados en `studentMetrics.{maxScoreByContext, errorRateByMechanic, slowestContextId}` del documento `User`.
- **Lectura:** los endpoints `/api/analytics/students/:id/difficulties` y `/summary` consultan `studentMetrics.*` directamente con `findById().select(...)`, O(1) per request.
- **Trade-off:** los datos quedan con `staleness` de hasta 24h. Para v1.0.0 no es crítico porque los profesores consultan analytics post-clase, no en tiempo real.

Esto está documentado pero NO implementado en Sprint 0: el slow-query log da observabilidad inmediata; la materialización se aborda cuando los logs muestren que el umbral se supera con regularidad. ADR-164 lo marca como `diferido Sprint 3`.

---

## § 6 — Vista cruzada Mecánica × Contexto (T-942 Fase A, ADR-177)

`getContentEffectiveness` aceptaba dos modos 1D (`groupBy: 'context'|'mechanic'`). Faltaba la pregunta cruzada del docente: «¿qué tal funciona Asociación en Geografía frente a Memoria en Geografía?». La extensión a `groupBy: 'cross'` añade un pipeline con doble `$lookup` (contextos y mecánicas) y `$group` por composite key `{mechanicId, contextId}`. La firma del item resultante añade `mechanicId`, `mechanicName`, `contextId`, `contextName`; el resto de métricas y enriquecimiento RAG (`scoreRag`, `learningRag`, `interpretation`) se mantiene idéntico para preservar la coherencia con las vistas 1D que el docente ya conoce. Flag opcional `includeEmpty` permite mostrar combinaciones sin partidas como celdas "Sin datos" cuando se quiere ver el espacio completo (off por defecto, alineado con el comportamiento de `ContentEffectivenessMatrix`).

Helpers internos (`buildBaseStages`, `buildSharedAggregates`, `buildSingleDimensionPipeline`, `buildCrossPipeline`, `enrichWithLearningMetrics`) reorganizan el código para que las tres ramas compartan etapas y agregados; el switch entre modos queda limpio sin duplicación. Cache key extendida `contentEffectiveness:${teacherId}:${timeRange}:${groupBy}:${includeEmpty}` evita envenenamiento entre clientes con distintos flags.

## § 7 — Agregación tenancy-wide para dirección del centro (T-942 Fase B, ADR-178)

Las agregaciones de `analyticsService` se filtran siempre por `teacherId` (escope per-teacher). El rol super_admin necesita la mirada agregada del centro, sin ese filtro. `adminAnalyticsService.getCenterOverview({ timeRange })` ejecuta 7 sub-agregaciones en paralelo (`Promise.all`):

- **`getUsersAggregate`** — totalStudents, totalTeachers (approved), pendingTeachers.
- **`getActiveTeachersCount(startDate)`** — distinct count de `session.createdBy` con partidas completadas en el periodo. Definición operativa («profesor con partidas») en lugar de registral («profesor con login reciente»). Ver justificación en memoria §4.6.
- **`getActivityAggregate(startDate)`** — totalPlaysInRange, avgScoreInRange, playsToday, playsByMechanic.
- **`getContentAggregate`** — totalDecks, totalSessions, activeSessions, totalContexts, totalMechanics.
- **`getAlertsAggregate`** — totalCriticalActive/WarningActive/InfoActive + top-5 profesores con más alertas (critical desc, warning desc) basado en `SmartAlert.status='active'` con `$lookup users` para resolver nombres.
- **`getTopTeachers(startDate)`** / `getTopMechanics(startDate)` / `getTopContexts(startDate)` — pipelines limit-5 paralelos con `$lookup` para nombres y `$round` de `avgScore`.

Cache 300s en clave `cache:analytics:admin:overview:${timeRange}` (consistente con el resto de analytics del docente). Endpoint `GET /api/admin/analytics/overview` protegido por `requireRole('super_admin')`.

## § 8 — Persistencia de informes generados (T-942 Fase B, ADR-179)

Modelos Mongoose `ReportTemplate` (3 plantillas system seeded: `end-of-term`, `parents`, `staff-meeting`) y `GeneratedReport` (TTL 30d via `expireAfterSeconds` + cap 100 por docente en hook `pre('save')` con drop oldest). Endpoints CRUD `/api/reports/*` exponen templates (lista pública para teacher+super_admin; create/delete solo super_admin para custom; system no se puede borrar), recent (paginado, sin payload), getById (con ownership check; super_admin puede abrir cualquier informe), save (POST con `payloadSize` calculado server-side), delete (owner-only).

El TTL automatiza la limpieza sin cron y respeta `RGPD Art. 5.1.e` (limitación de plazo). El cap evita acumulación indefinida por docente. `payload` como `Mixed` permite cualquier shape pero requiere disciplina del frontend al renderizar (descarta campos desconocidos); shape lo controla `reportDataService`.
