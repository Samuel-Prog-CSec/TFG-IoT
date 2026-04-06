# Registro de Actividades de Tratamiento (RAT)

**Responsable del tratamiento:** Centro educativo que utiliza la plataforma Eduplay
**Encargado del tratamiento:** Plataforma Eduplay (TFG)
**Delegado de Protección de Datos (DPD):** No aplica (TFG académico)
**Fecha de elaboración:** 06-04-2026
**Última actualización:** 06-04-2026
**Base legal del registro:** Artículo 30 del Reglamento (UE) 2016/679 (RGPD)

---

## Nota previa

Este Registro de Actividades de Tratamiento se elabora en cumplimiento del **Artículo 30 del RGPD**, que establece la obligación de llevar un registro de las actividades de tratamiento efectuadas bajo la responsabilidad del responsable del tratamiento. El registro incluye la información mínima exigida por el Art. 30.1: nombre y datos de contacto del responsable, fines del tratamiento, categorías de interesados y datos, destinatarios, plazos previstos para la supresión, y descripción general de las medidas de seguridad.

Adicionalmente, el **Art. 5.2 RGPD** (principio de responsabilidad proactiva) exige que el responsable sea capaz de **demostrar** el cumplimiento de los principios de protección de datos. Este documento constituye una de las evidencias de dicho cumplimiento.

---

## AT-01: Gestión de cuentas de estudiantes

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Gestión de cuentas de estudiantes |
| **Finalidad** | Crear, identificar y gestionar las cuentas de alumnos de 4-8 años para permitir su participación en sesiones de juego educativo y el seguimiento pedagógico por parte del profesor |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD + Art. 8 RGPD + Art. 7 LOPDGDD (edad mínima 14 años en España) |
| **Categorías de interesados** | Menores de edad (4-8 años) — colectivo especialmente protegido (Considerando 38 RGPD) |
| **Categorías de datos personales** | Nombre completo (`name`), edad (`profile.age`), aula (`profile.classroom`), avatar opcional (`profile.avatar`), identificador interno (`_id`), fecha de creación (`createdAt`), profesor responsable (`createdBy`, `assignedTeacher`) |
| **Datos NO recogidos (por diseño)** | Email, contraseña, dirección, teléfono, fecha de nacimiento completa (eliminada por minimización — Art. 5.1.c), datos biométricos, datos de salud |
| **Destinatarios** | Profesor creador (acceso completo), super_admin (acceso de gestión). No se comparten datos con terceros |
| **Transferencias internacionales** | No directamente. Sentry (procesador de errores) puede recibir metadatos en caso de error del sistema — ver AT-06 |
| **Plazo de conservación** | Mientras el consentimiento parental esté vigente. Máximo 24 meses tras inactividad del estudiante, tras lo cual se aplica borrado efectivo (Art. 17 RGPD) |
| **Medidas de seguridad** | Control de acceso por roles (RBAC), cifrado en tránsito (TLS/HTTPS), DTOs para control de exposición, rate limiting, validación de entrada (Zod), ausencia de credenciales para estudiantes |

---

## AT-02: Registro de partidas educativas (GamePlay)

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Registro de partidas educativas |
| **Finalidad** | Registrar el desarrollo de cada partida individual de un estudiante (aciertos, errores, tiempos de respuesta) para proporcionar retroalimentación pedagógica al profesor y permitir el seguimiento del progreso de aprendizaje |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD + Art. 8 RGPD |
| **Categorías de interesados** | Menores de edad (4-8 años) |
| **Categorías de datos personales** | Identificador del estudiante (`playerId`), puntuación (`score`), ronda actual (`currentRound`), estado (`status`), métricas agregadas (`metrics.*`), eventos detallados (`events[]` — hasta 500 por partida, incluyendo tipo de evento, tiempo de respuesta en ms, valor esperado/actual, UID de tarjeta RFID), timestamps de inicio/fin |
| **Datos especialmente sensibles** | Los tiempos de respuesta (`events[].timeElapsed`) y patrones de error pueden revelar indirectamente información sobre capacidades cognitivas o dificultades de aprendizaje del menor. Aunque no constituyen datos de categoría especial (Art. 9 RGPD), requieren protección reforzada por tratarse de menores |
| **Destinatarios** | Profesor creador de la sesión. No se comparten con terceros |
| **Transferencias internacionales** | No |
| **Plazo de conservación** | Datos identificados: 12 meses desde la partida. Tras este plazo, se aplica anonimización (eliminación de `playerId` y `events[].cardUid`). Los datos agregados anónimos se conservan indefinidamente (Considerando 26 RGPD — datos anónimos no sujetos al RGPD) |
| **Medidas de seguridad** | Acceso restringido al profesor de la sesión, rate limiting en endpoints de analytics, límite de 500 eventos por partida (MAX_EVENTS_PER_PLAY), validación de entrada |

---

## AT-03: Analytics y métricas de rendimiento

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Analytics y métricas de rendimiento |
| **Finalidad** | Proporcionar al profesor análisis agregado del rendimiento de sus alumnos: distribución por rangos, tendencias temporales, rankings, mapas de calor de actividad, y alertas de estudiantes en riesgo académico |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD |
| **Categorías de interesados** | Menores de edad (4-8 años) |
| **Categorías de datos personales** | Métricas acumuladas del estudiante (`studentMetrics.*`: totalGamesPlayed, averageScore, bestScore, totalCorrectAnswers, totalErrors, averageResponseTime, totalTimeouts, totalAbandonedGames, lastPlayedAt), identificador pseudonimizado en endpoints de analytics |
| **Tratamiento de perfilado** | Este tratamiento implica una **evaluación sistemática de aspectos personales** (rendimiento educativo, patrones de respuesta) que, combinada con el tratamiento de datos de menores, justifica la realización de una EIPD (Art. 35 RGPD). No se toman decisiones automatizadas con efectos jurídicos (Art. 22 RGPD) — la interpretación de los datos es siempre responsabilidad del profesor |
| **Destinatarios** | Profesor creador (datos de sus alumnos), super_admin (datos agregados). No se comparten con terceros |
| **Transferencias internacionales** | No |
| **Plazo de conservación** | Métricas vinculadas a estudiantes activos: mientras el consentimiento esté vigente. Métricas anonimizadas: indefinidamente |
| **Medidas de seguridad** | Rate limiting específico para analytics (30 req/min), caché Redis con TTL, DTOs que no exponen PII en analytics, acceso restringido por ownership |

---

## AT-04: Autenticación y gestión de sesiones de profesores

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Autenticación y gestión de sesiones de profesores |
| **Finalidad** | Gestionar el acceso seguro de profesores y administradores a la plataforma mediante credenciales y tokens JWT |
| **Base legal** | Ejecución de contrato / interés legítimo del responsable — Art. 6.1.b / Art. 6.1.f RGPD |
| **Categorías de interesados** | Profesores (adultos), super_admins (adultos) |
| **Categorías de datos personales** | Email, contraseña (hash bcrypt), tokens JWT (access + refresh con JTI), fingerprint del dispositivo (hash SHA-256 de User-Agent + Accept headers), último login (`lastLoginAt`), estado de cuenta (`accountStatus`) |
| **Destinatarios** | Sistema interno. Los tokens se almacenan en Redis con TTL automático |
| **Transferencias internacionales** | No |
| **Plazo de conservación** | Mientras la cuenta esté activa. Access tokens: 15 minutos (TTL). Refresh tokens: 30 días (TTL Redis). Tokens revocados: 24 horas en blacklist Redis |
| **Medidas de seguridad** | Hashing bcrypt (salt rounds 10), JWT con rotación y familia de tokens, detección de robo de tokens, blacklist Redis para revocación instantánea, rate limiting estricto en auth (5 intentos/15 min), single session enforcement, CSRF double-submit cookie |

---

## AT-05: Logging de seguridad

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Logging de seguridad y monitorización |
| **Finalidad** | Registrar eventos de seguridad (intentos de acceso, errores, anomalías) para la detección de incidentes, la trazabilidad de acciones y el cumplimiento del Art. 32 RGPD (seguridad del tratamiento) |
| **Base legal** | Interés legítimo del responsable (Art. 6.1.f RGPD) + obligación de seguridad (Art. 32 RGPD) |
| **Categorías de interesados** | Profesores (adultos), sistema |
| **Categorías de datos personales** | Dirección IP del profesor, User-Agent, origen de la petición, identificador de request, eventos de seguridad (login, logout, token theft, rate limit exceeded) |
| **Datos de menores en logs** | Los logs de seguridad **NO deben contener** datos identificativos de estudiantes (nombre, aula). Los identificadores de estudiante en logs operativos se registran como pseudoId (hash truncado). Redacción automática de: passwords, tokens, headers de autorización, cookies |
| **Destinatarios** | Equipo de desarrollo (acceso a logs), Sentry (procesador de errores — ver AT-06) |
| **Transferencias internacionales** | Posible, a través de Sentry (ver AT-06) |
| **Plazo de conservación** | 12 meses |
| **Medidas de seguridad** | Redacción automática de campos sensibles (11 paths en Pino), sanitización de input para prevenir log injection, logging estructurado (JSON), separación de niveles de severidad |

---

## AT-06: Procesamiento de errores por Sentry (procesador externo)

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Procesamiento de errores y monitorización de rendimiento |
| **Finalidad** | Capturar errores inesperados del sistema y métricas de rendimiento para diagnóstico y mejora continua de la plataforma |
| **Base legal** | Interés legítimo del responsable (Art. 6.1.f RGPD) — garantizar la estabilidad y seguridad del sistema |
| **Relación contractual** | Sentry actúa como **encargado del tratamiento** (Art. 28 RGPD). La relación se rige por los términos de servicio de Sentry que incluyen cláusulas de protección de datos |
| **Categorías de interesados** | Profesores (adultos). Los errores del sistema pueden contener contexto con IDs de usuarios |
| **Categorías de datos personales** | Datos técnicos del error (stack trace, URL, método HTTP), IP del profesor (filtrada opcionalmente), email del profesor (filtrada en beforeSend) |
| **Datos de menores** | La configuración de Sentry **debe asegurar** que no se envíen datos PII de estudiantes en breadcrumbs, contexto de error o tags. El filtro `beforeSend` de Sentry debe redactar cualquier dato identificativo de menores |
| **Transferencias internacionales** | **Sí** — Sentry, Inc. tiene sede en EE.UU. La transferencia se ampara en Standard Contractual Clauses (SCCs) según Art. 46.2.c RGPD, incorporadas en los términos de servicio de Sentry. Se recomienda documentar formalmente esta transferencia (tarea T-717) |
| **Plazo de conservación** | Según configuración de Sentry (por defecto 90 días para eventos) |
| **Medidas de seguridad** | Filtro `beforeSend` que redacta email, circuit breaker para evitar sobrecarga, umbrales de severidad configurables |

---

## AT-07: Interacción RFID en tiempo real

| Campo | Descripción |
|-------|-------------|
| **Nombre de la actividad** | Interacción RFID en tiempo real durante sesiones de juego |
| **Finalidad** | Procesar los escaneos de tarjetas RFID realizados por los estudiantes durante las sesiones de juego, transmitiendo los datos desde el navegador del profesor hasta el backend via WebSocket (Socket.IO) |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD |
| **Categorías de interesados** | Menores de edad (4-8 años) — interactúan físicamente con las tarjetas RFID |
| **Categorías de datos personales** | UID de tarjeta RFID (`cardUid`), identificador de partida (`playId`), timestamps de escaneo. Los UIDs de tarjeta son tokens fungibles sin vinculación directa al menor (la tarjeta se asigna a un valor semántico, no a un alumno) |
| **Almacenamiento** | Transitorio en Redis (`CARD` y `PLAY` namespaces) con TTL automático. Los eventos de escaneo se persisten en `GamePlay.events[]` (ver AT-02) |
| **Destinatarios** | Sistema interno (WebSocket server). El profesor visualiza el resultado en tiempo real |
| **Transferencias internacionales** | No |
| **Plazo de conservación** | Estado en Redis: duración de la sesión de juego (TTL automático). Eventos persistidos: ver AT-02 |
| **Medidas de seguridad** | WebSocket autenticado (JWT), rate limiting de eventos (eventRateLimiter), validación de UID (formato hexadecimal), persistencia RFID en Redis para recuperación ante desconexiones |

---

## Medidas de seguridad transversales (Art. 32 RGPD)

Las siguientes medidas de seguridad se aplican a **todas** las actividades de tratamiento:

| Medida | Artículo RGPD | Estado |
|--------|---------------|--------|
| Cifrado en tránsito (HTTPS/TLS) | Art. 32.1.a | Implementado |
| Hashing de contraseñas (bcrypt, salt rounds 10) | Art. 32.1.a | Implementado |
| Control de acceso por roles (RBAC: teacher, student, super_admin) | Art. 32.1.b | Implementado |
| Autenticación JWT con rotación de tokens y detección de robo | Art. 32.1.b | Implementado |
| Rate limiting HTTP (global, auth, creaciones, uploads) y WebSocket | Art. 32.1.b | Implementado |
| Redacción automática de datos sensibles en logs (11 paths) | Art. 25 | Implementado |
| Token blacklist en Redis para revocación instantánea | Art. 32.1.d | Implementado |
| CSRF double-submit cookie | Art. 32.1.a | Implementado |
| Helmet/CSP, CORS whitelist | Art. 32.1.a | Implementado |
| DTOs para control de exposición en respuestas API | Art. 25 | Implementado |
| Payload guard (protección contra prototype pollution y NoSQL injection) | Art. 32.1.a | Implementado |
| Validación de entrada con Zod en todas las rutas | Art. 32.1.a | Implementado |
| Logging estructurado con Pino | Art. 32.1.d | Implementado |
| Monitorización de errores con Sentry | Art. 32.1.d | Implementado |
| Consentimiento parental obligatorio y verificable | Art. 8 + Art. 7 LOPDGDD | Implementado (T-702) |
| Borrado efectivo (hard delete) con cascada | Art. 17 | Implementado (T-704) |
| Política de retención con plazos definidos | Art. 5.1.e | Implementado (T-704) |

---

*Documento elaborado como parte del Sprint 5 del TFG «Plataforma de Juegos Educativos con RFID» en cumplimiento del Artículo 30 del Reglamento (UE) 2016/679 (RGPD).*
