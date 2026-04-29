# Sprint 6 - Plan de Tareas (Release v1.0.0)

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)
**Autor:** Samuel Blanchart Pérez
**Duración:** 4-6 semanas (Mayo - Junio 2026)
**Versión objetivo:** 1.0.0 (release final del TFG, cloud-deployed)
**Última actualización:** 29-04-2026

---

## Resumen del Sprint

Sprint **final** del TFG. El Sprint 5 cerró con la versión 0.5.0 (release intermedia, Docker-first, foco gameplay y protección de datos). Sprint 6 transforma esa base en una **release v1.0.0 desplegada en cloud, públicamente accesible y operable** — el corte definitivo de entrega del TFG. Cinco ejes:

1. **Release v1.0.0 cloud completa**: deploy en Koyeb (backend + worker BullMQ) + Cloudflare Pages (frontend) + MongoDB Atlas M0 + Upstash Redis + Supabase Storage. CD pipeline completo (staging auto-deploy + prod via tag semver con approval gate), observabilidad (Sentry Performance, log shipping, alerting externo), seguridad endurecida (CSP/HSTS, OWASP ZAP, MFA super_admin), backups con restore drill, performance/escalabilidad (Cloudflare WAF, command budget Upstash), testing pre-release (E2E Playwright, load test k6, chaos), docs v1.0.0 (README raíz, OpenAPI, runbook operacional) y housekeeping (free tier budget, deprecación de Docker prod, cold-start warming).
2. **Cierre del alcance gameplay con la mecánica Secuencia**: implementación end-to-end (backend + gameEngine + frontend + analytics) de la tercera y última mecánica del proyecto, hoy bloqueada como "Próximamente" en `SESSION_ENABLED_MECHANICS`. Incluye una **auditoría integral de estadísticas y visualizaciones** posterior a la implementación para garantizar que la nueva mecánica se trata de forma coherente en todos los endpoints, charts, filtros, seeders y documentación de analytics. Hace que la v1.0.0 entregue las tres mecánicas originales del TFG (Asociación, Memoria, Secuencia) en lugar de cortar con dos.
3. **Redis avanzado**: materialización de leaderboards (ZSET) y `studentMetrics` (Hash) con reconciliación nocturna, ya planificada como deuda en ADR-080 y diferida a este sprint.
4. **Analytics avanzado y alertas con ciclo de vida**: persistencia real de alertas inteligentes (modelo `SmartAlert` con `active|resolved|dismissed`), vista cruzada Mecánica × Contexto, dashboard admin global para super_admin y zona Informes funcional, más campaña de cobertura SonarCloud para alcanzar el Quality Gate.
5. **UI/UX, motion signature ampliada y polish final**: backlog UX/accesibilidad/motion del Sprint 5 (paginación, inline editing, atmósferas dinámicas, hero transitions, mascota extendida, atajos de teclado, tema claro, modo demo, notificaciones tiempo real) consolidado en tareas-paraguas, **más dos tareas dedicadas a calidad final**: una auditoría sistemática de coherencia visual + WCAG 2.2 AA + responsive tablet con tooling formal (T-958), y una pasada de polish de los flujos críticos (wizards profesor, área admin, gameplay para niños 4-8 años, print stylesheet para informes y microcopy review, T-959). Estas dos últimas elevan la percepción del producto en la entrega final del TFG y producen evidencia documentable para la memoria.

### Notas de planificación

- **Eliminación de feature flags (decisión PO 2026-04-27):** el sistema de feature flags Redis (PROP-61, ADRs 073/074) fue retirado por completo durante el cierre de Sprint 5 al considerarse fuera de alcance del proyecto (super_admin no técnico). Las propuestas que originalmente las mencionaban como dependencia (PROP-97 incluía `ff:*` en su inventario de keys Redis; PROP-123 mencionaba un "flag check" en el cálculo de hot paths) se reformulan en este sprint para no asumir su existencia.
- **Mecánica Secuencia como bloqueante v1.0.0:** Asociación y Memoria están operativas desde Sprint 4. La v1.0.0 debe entregar las tres mecánicas anunciadas para no cortar con un "Próximamente" visible en producción.
- **Decisiones cloud previas:** Stack 100% free tier (Koyeb + Cloudflare + Atlas M0 + Upstash + Supabase + UptimeRobot). Fly.io descartado (perdió free tier real a finales de 2024). Docker queda relegado a desarrollo local — los assets `docker-compose.prod.yml` y Dockerfiles de producción se archivan (T-910).
- **Tareas diferidas del Sprint 5 absorbidas:** T-535 (plan modular de mazos) y T-616 (onboarding contextual) quedaron parcialmente implementadas en Sprint 5; sus extensiones se absorben en T-921/T-951 según corresponda.

### Trazabilidad propuestas → tareas

Este sprint absorbe la **totalidad de las 68 propuestas pendientes** de `documentation/propuestas-mejora.md` (PROP-1, 2, 4, 6, 9, 10, 11, 13, 16, 17, 18, 60, 63, 65-69, 71-76, 78, 82, 91, 93, 94, 95-133) más las dos tareas nuevas de la mecánica Secuencia. La sección "Tabla de Consolidación" al final del documento lista qué propuestas absorbe cada tarea.

---

## Leyenda

- **Prioridad:** P0 (Crítica/Bloqueante v1.0.0) > P1 (Alta) > P2 (Media) > P3 (Baja)
- **Tamaño:** XS (< 2h), S (2-4h), M (4-8h), L (1-2 días), XL (> 2 días)
- **Estado:** 📋 Pendiente | 🔄 En Progreso | ✅ Completada
- **Área:** ☁️ Release Cloud | 🎮 Gameplay (Mecánica Secuencia) | 🔧 Backend / Redis | 📊 Analytics & Alertas | ⚛️ UI/UX & Motion
- **Origen:** Documento `propuestas-mejora.md` (auditorías de QA, planificación 2026-04-24 release v1.0.0) + cierre alcance gameplay del TFG
- **Definición de 100% (DoD):** Código implementado + tests pasando + lint limpio + verificación visual (frontend) + verificación E2E manual contra staging cloud (cuando aplique)

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
8. **Para tareas de despliegue cloud (T-901 a T-910):** verificación E2E manual en staging cloud antes de marcar la tarea completa.

---

## P0 — Prioridad Crítica (Bloqueantes v1.0.0)

### T-901: ☁️ Scaffolding cloud + migraciones (Koyeb + Atlas + Upstash + secrets + staging) 📋

**Consolida:** PROP-95 + PROP-96 + PROP-97 + PROP-98 + PROP-99
**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** Sin esta tarea no hay infraestructura cloud para desplegar nada

**Descripción:**
Aprovisionar los recursos managed (MongoDB Atlas M0, Upstash Redis, Koyeb apps) en sus regiones europeas, configurar la separación staging vs producción (dos conjuntos independientes, todos free tier), establecer el pipeline de secrets desde `.env.example` → Koyeb Secrets → GitHub Actions, y dejar el backend + worker preparados para arrancar contra esos recursos sin Dockerfiles (Nixpacks autodetecta Node).

**Sub-tareas:**

**Fase A — Koyeb scaffolding (ex PROP-95):**

1. Crear configuración declarativa para dos apps Koyeb por entorno: `api-staging` / `worker-staging` y `api-prod` / `worker-prod`. Región `fra` o `ams`, escala mínima 1 en ambos.
2. Healthcheck del API apuntando a `/health/ready` (depende de T-902).
3. Variables de entorno referenciando Koyeb Secrets (Fase D).
4. Script `npm run start:prod` que verifique conectividad a Atlas y Upstash antes de levantar HTTP — diagnóstico rápido de misconfiguración.
5. Entry point del worker BullMQ: `backend/worker.js` (ya existente, ADR-077).
6. Documentación nueva: `documentation/Deploy_Koyeb.md` con quickstart de aprovisionamiento.

**Fase B — MongoDB Atlas M0 (ex PROP-96):**

7. Crear cluster M0 en `eu-central-1` o equivalente próximo a Koyeb (RGPD).
8. Network Access: al no haber IPs fijas en Koyeb free, whitelist `0.0.0.0/0` mitigado con usuario/password fuerte + TLS.
9. Database Access: usuario `eduplay-api` con rol `readWrite@eduplay-prod` y otro equivalente para `eduplay-staging`.
10. `MONGODB_URI` con formato SRV completo y `retryWrites=true&w=majority`.
11. Ejecutar `npm run seed:if-empty` en el primer deploy para bootstrap de datos.
12. Auditar índices: algunos `schema.index(...)` pueden requerir creación manual. Verificar con `db.collection.getIndexes()`.
13. Auditar tamaño del seed: el seed completo debe caber holgadamente en 512 MB.

**Fase C — Upstash Redis (ex PROP-97, sin feature flags):**

14. Crear 2 DBs Upstash: `eduplay-prod` y `eduplay-staging`, región `eu-west-1`.
15. Variables: `REDIS_URL` con formato `rediss://default:pass@...upstash.io:6379` (TLS nativo).
16. `keyPrefix: 'eduplay:'` en ioredis para separar entornos en caso de compartir DB en algún edge case.
17. Verificar BullMQ queues caben en 256 MB bajo carga normal (data-retention, backup-mongo-daily de T-906).
18. Inventario explícito de namespaces Redis activos tras la retirada de feature flags: `rl:*` (rate-limiters), `session:*` (Socket.IO/Mongo), `play:init:*` (idempotencia startPlay), `auth:user:*` (cache slim-user), `cache:analytics:*` (cache-aside analytics), `bull:*` (BullMQ). **Sin `ff:*` — el sistema de flags fue retirado en el cierre de Sprint 5.**
19. Smoke test: correr el backend local contra Upstash staging por 24h y verificar commands/day en el dashboard.

**Fase D — Secrets management (ex PROP-98):**

20. Actualizar `.env.example` con todas las variables requeridas, marcando secretos vs públicas con comentarios.
21. Crear todos los Koyeb Secrets: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MONGODB_URI`, `REDIS_URL`, `SENTRY_DSN`, `SUPABASE_SERVICE_ROLE_KEY`, `CSRF_SECRET`, etc.
22. Variables no-secret (`FRONTEND_URL`, `NODE_ENV`, `PORT`) via env normal en el panel Koyeb.
23. Documento `documentation/Secrets_Rotation.md`:
    - Lista de secrets con propósito y riesgo al comprometerse.
    - Frecuencia recomendada (JWT cada 6 meses, DB cada 3, general anual).
    - Procedimiento de rotación sin downtime usando dual-validation (ambos secrets válidos durante ventana de transición).

**Fase E — Entornos staging vs producción (ex PROP-99):**

24. Provisionar el segundo conjunto completo: cluster Atlas `eduplay-staging`, DB Upstash `eduplay-staging`, apps Koyeb `api-staging` / `worker-staging`, proyecto Cloudflare Pages que tracke rama `Maintenance` → staging y `main` → prod.
25. Variables `NODE_ENV` y `APP_ENV=staging|production` diferenciadas.
26. Flag `SEED_ON_BOOT=true` solo en staging para reset rápido.
27. Documentar en `Deploy_Koyeb.md` que toda release se valida en staging antes de promocionar a prod via tag (T-903).

**Criterios de Aceptación:**

- [ ] Apps Koyeb `api-staging`, `worker-staging`, `api-prod`, `worker-prod` aprovisionadas y arrancan
- [ ] Cluster Atlas M0 `eduplay-prod` y `eduplay-staging` operativos con TLS
- [ ] DBs Upstash `eduplay-prod` y `eduplay-staging` operativas con `rediss://`
- [ ] Backend conecta a Atlas + Upstash sin errores en boot
- [ ] `npm run seed:if-empty` ejecuta correctamente en primer deploy
- [ ] `.env.example` actualizado con todas las variables y comentarios de secret/public
- [ ] Todos los secretos creados en Koyeb Secrets (no en `.env` versionado)
- [ ] Documento `Deploy_Koyeb.md` con quickstart funcional
- [ ] Documento `Secrets_Rotation.md` con política de rotación y procedimiento dual-validation
- [ ] Commands/day en Upstash staging tras smoke test 24h ≤ 50% del límite (5K)

**ADRs:** ADR-087 (Koyeb + Nixpacks), ADR-088 (Atlas M0 + whitelist hardening), ADR-089 (Upstash command budget), ADR-090 (Secrets management Koyeb), ADR-091 (Separación staging vs prod free tier).

**Archivos afectados:** `.env.example`, `package.json` (script `start:prod`), `backend/src/config/database.js`, `backend/src/config/redis.js`, `documentation/Deploy_Koyeb.md` (nuevo), `documentation/Secrets_Rotation.md` (nuevo).

---

### T-902: ☁️ Hardening pre-deploy (probes + graceful shutdown + WS timeouts + pool Mongoose) 📋

**Consolida:** PROP-100 + PROP-101 + PROP-102 + PROP-103
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-901
**Origen:** Sin hardening específico de cloud, los defaults locales rompen en Koyeb (cold starts, idle timeouts, pool agotado, deploys con loss)

**Descripción:**
Cuatro ajustes específicos de runtime para que el backend sobreviva al ciclo de vida cloud: separar liveness/readiness probes (Koyeb necesita ambos), implementar graceful shutdown completo con drain de BullMQ y notificación Socket.IO, ajustar timeouts del proxy Koyeb para WebSocket de larga duración, y tunear el connection pool de Mongoose para Atlas M0 (red compartida, no local).

**Sub-tareas:**

**Fase A — Liveness vs readiness probes (ex PROP-100):**

1. Refactor `healthController.js` con dos handlers separados: `healthLive` y `healthReady`.
2. `GET /health/live`: siempre 200 con body mínimo `{status:'ok', uptime, pid}`. **Sin tocar Mongo/Redis** (por eso UptimeRobot puede pingar sin gastar Upstash commands).
3. `GET /health/ready`: pings paralelos Mongo + Redis con timeout 500ms cada uno, status 503 si alguno falla + JSON con detalle por dependencia.
4. Mantener `/api/health` como alias de `/health/ready` por retrocompatibilidad (frontend o monitoring legacy).
5. Healthcheck de Koyeb apuntando a `/health/ready`. UptimeRobot (T-910) pingando `/health/live`.
6. Tests unitarios de ambos endpoints con mocks de fallo de Mongo y Redis.

**Fase B — Graceful shutdown completo (ex PROP-101):**

7. Auditar handlers SIGTERM/SIGINT en `server.js` y `worker.js`.
8. Secuencia de shutdown del backend API (timeout duro 25s antes de SIGKILL de Koyeb):
   1. Marcar `readiness=false` → Koyeb deja de enviar tráfico nuevo.
   2. `httpServer.close()` con timeout → esperar requests in-flight.
   3. Socket.IO: emit `server_shutdown` a rooms activas, `io.close()`.
   4. BullMQ producer queues: `queue.close()`.
   5. Mongoose: `mongoose.connection.close(false)`.
   6. Redis: `redis.quit()`.
   7. Sentry flush (timeout 5s), Pino flush.
9. Secuencia del worker (distinta): `worker.close(true)` drena jobs activos con timeout 10s antes de forzar.
10. Test de integración que envíe SIGTERM a un backend real y verifique secuencia + ausencia de loss.

**Fase C — Timeouts proxy Koyeb para WebSocket (ex PROP-102):**

11. Verificar config Koyeb: `idle_timeout` a 120s+ (confirmar valor exacto del tier free).
12. Confirmar ping/pong Socket.IO en el server: `pingInterval: 25000, pingTimeout: 20000`.
13. Frontend: asegurar `reconnectionAttempts: Infinity, reconnectionDelay: 1000, reconnectionDelayMax: 5000`.
14. Test E2E manual: partida completa de 15 min con un frontend apuntando a la app staging en Koyeb, monitorizar disconnects.
15. Documentar comportamiento esperado en `backend/docs/WebSockets-ExtendedUsage.md`.

**Fase D — Pool Mongoose para Atlas (ex PROP-103):**

16. `backend/src/config/database.js` con opciones explícitas para Atlas M0:
    ```js
    {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      heartbeatFrequencyMS: 30000,
      retryReads: true,
      retryWrites: true,
      w: 'majority'
    }
    ```
17. Variables `MONGO_MAX_POOL_SIZE` y `MONGO_MIN_POOL_SIZE` configurables por entorno.
18. Circuit breaker ligero: si la primera selección de server falla 3 veces seguidas, marcar `readiness=false` hasta recuperarse.
19. Documentar en `backend/docs/Performance_Notes.md` el razonamiento del valor elegido para cada opción.

**Criterios de Aceptación:**

- [ ] `GET /health/live` responde 200 sin tocar Mongo/Redis
- [ ] `GET /health/ready` responde 503 si Mongo o Redis están KO
- [ ] `/api/health` sigue funcionando como alias de `/health/ready`
- [ ] SIGTERM completa secuencia de shutdown en < 25s sin loss de requests/jobs
- [ ] Partida de 15 min vía WebSocket en staging completa sin desconexiones
- [ ] Pool Mongoose con `maxPoolSize: 10` y circuit breaker funcional
- [ ] Test de SIGTERM verifica orden de cierre
- [ ] `WebSockets-ExtendedUsage.md` y `Performance_Notes.md` actualizados

**ADRs:** ADR-092 (liveness/readiness probes), ADR-093 (graceful shutdown completo).

**Archivos afectados:** `backend/src/controllers/healthController.js`, `backend/src/routes/health.js`, `backend/src/server.js`, `backend/worker.js`, `backend/src/config/database.js`, `backend/src/realtime/socketHandlers.js`, `frontend/src/services/socket.js`, `backend/docs/WebSockets-ExtendedUsage.md`, `backend/docs/Performance_Notes.md`.

---

### T-903: ☁️ CD pipeline (deploy auto staging + prod via tag semver + rollback + release-please + PR previews) 📋

**Consolida:** PROP-104 + PROP-105 + PROP-106 + PROP-107 + PROP-108
**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-901, T-902
**Origen:** Sin CD, cada deploy es manual desde CLI con riesgo alto de error en monorepo

**Descripción:**
Automatizar el ciclo completo de despliegue: cada push a `Maintenance` despliega automáticamente a staging tras CI verde; cada push de tag `v*` dispara deploy a producción con approval gate manual; auto-rollback si los health checks post-deploy fallan; release-please automatiza el bumping de versión y CHANGELOG desde conventional commits; preview deploys efímeros por PR para QA en entorno real.

**Sub-tareas:**

**Fase A — Deploy automático a staging (ex PROP-104):**

1. Workflow `.github/workflows/deploy-staging.yml` con `needs: [backend-tests, frontend-checks]` reutilizando el CI actual como gate.
2. Steps paralelos: `koyeb service redeploy api-staging` y `koyeb service redeploy worker-staging` usando la CLI oficial (action `koyeb-community/koyeb-actions/deploy@v2` o curl directo a la API).
3. Secret `KOYEB_API_TOKEN_STAGING` en GitHub Actions secrets.
4. Post-deploy: curl `/health/ready` tras 60s, fail si 503.
5. Notificación email/Slack con resultado.
6. Cloudflare Pages: configurado a auto-deploy rama `Maintenance` → staging y `main` → producción (config nativa, sin workflow).

**Fase B — Deploy producción via tag semver (ex PROP-105):**

7. GitHub Environment `production` con `required_reviewers: [Samuel]`.
8. Workflow `.github/workflows/deploy-production.yml` con `on: push: tags: ['v*']`.
9. Steps: checkout → setup-node → validate tag semver → `koyeb service redeploy api-prod` + `worker-prod` → smoke test `/health/ready` → create GitHub Release con notas del CHANGELOG.
10. Secret `KOYEB_API_TOKEN_PROD` separado de staging.
11. Si falla smoke test: trigger Fase C (auto-rollback) y fail build.

**Fase C — Auto-rollback (ex PROP-106):**

12. Step post-deploy en `deploy-production.yml`: polling `/health/ready` cada 15s × 8 iteraciones.
13. Si 5 de 8 devuelven 503: `koyeb service rollback` a release anterior.
14. Notificación Sentry + email (severidad alta).
15. Test: deploy intencional con variable incorrecta en staging, verificar que rollback dispara.

**Fase D — Release automation (ex PROP-107):**

16. `.github/workflows/release-please.yml` con `googleapis/release-please-action`.
17. `release-please-config.json` configurado como single-package monorepo (root) o multi-package (backend, frontend separados — decidir según facilidad).
18. `.release-please-manifest.json` con versión inicial `0.5.0`.
19. Primer release-please PR generará CHANGELOG.md retroactivo desde conventional commits históricos (subset desde el último tag manual).
20. Documentar flujo en `CONTRIBUTING.md` y README: merge del PR de release-please → tag automático → trigger deploy-production.

**Fase E — Preview deploys efímeros (ex PROP-108):**

21. Workflow `on: pull_request`:
    - `opened`/`reopened` → `koyeb app create api-pr-<num>` + deploy.
    - `synchronize` → redeploy.
    - `closed` → `koyeb app delete api-pr-<num>`.
22. Cloudflare Pages: preview deploys por branch (config nativa).
23. Comentario automático en el PR con URL de preview.
24. Límite: solo PRs del propio repo (no forks) para no exponer secrets.
25. Compartir DB con staging (preview deploys son read-mostly, warning en PR).

**Criterios de Aceptación:**

- [ ] Push a `Maintenance` con CI verde dispara deploy automático a staging
- [ ] Push de tag `v*` dispara deploy a prod tras approval del environment
- [ ] Auto-rollback funciona: deploy roto vuelve a release anterior en < 3 min
- [ ] Release-please PR se abre tras merges a main con conventional commits
- [ ] Preview deploys por PR funcionan y se destruyen al cerrar el PR
- [ ] CHANGELOG actualizado automáticamente en release-please PR
- [ ] Smoke test post-deploy a prod valida `/health/ready`

**ADRs:** ADR-094 (CD pipeline staging+prod), ADR-095 (Deploy prod via tag + approval), ADR-096 (Release automation con release-please).

**Archivos afectados:** `.github/workflows/deploy-staging.yml` (nuevo), `.github/workflows/deploy-production.yml` (nuevo), `.github/workflows/release-please.yml` (nuevo), `.github/workflows/preview-deploy.yml` (nuevo), `release-please-config.json` (nuevo), `.release-please-manifest.json` (nuevo), `CONTRIBUTING.md`, `README.md`.

---

### T-904: ☁️ Observabilidad producción (Sentry Performance + log shipping + alerting + dashboard ops) 📋

**Consolida:** PROP-109 + PROP-110 + PROP-111 + PROP-112
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-901, T-902
**Origen:** En cloud sin observabilidad un incidente se diagnostica solo cuando un usuario reporta — y sin logs persistentes no hay forensics

**Descripción:**
Cuatro capas complementarias de observabilidad: Sentry Performance (trazas + p95 + transactions, free tier 10K/mes), log shipping centralizado (Koyeb retiene logs ~3 días), alerting externo (UptimeRobot + Sentry Alerts) y un dashboard operativo consolidado en markdown que centraliza enlaces a las 6 consolas distintas (Atlas, Upstash, Koyeb, Cloudflare, Sentry, UptimeRobot).

**Sub-tareas:**

**Fase A — Sentry Performance (ex PROP-109):**

1. `Sentry.init({ tracesSampleRate: 0.1 })` en backend y frontend prod. En staging subir a 0.5 para más señal.
2. Instrumentar manualmente transacciones críticas con `Sentry.startSpan`: `startPlay`, `endPlay`, `getClassroomAnalytics`, socket `rfid_scan`, todos los handlers de la mecánica Secuencia (T-921).
3. Dashboard Sentry Performance revisado semanalmente durante primeras 4 semanas post-release.
4. Documentar métricas observadas en memoria TFG.

**Fase B — Log shipping (ex PROP-110):**

5. Evaluación de proveedor: recomendado **Grafana Cloud Loki** (50 GB/mes free, LogQL potente) o **BetterStack Logtail** (UI más amigable, 5 GB/mes free). Decidir y documentar el descartado en ADR.
6. Integración: transport Pino apropiado (`pino-loki` / `@grafana/logfmt-transport` / `@logtail/pino`).
7. Estructurar logs con campos consistentes: `requestId`, `userId`, `sessionId`, `playId`, `component`, `severity`. Verificar que ya existe en Pino y completar lo que falte.
8. Saved views: "errores por endpoint", "slow queries", "auth fails spike", "rate-limit hits", "RFID scans inválidos".
9. Secret `LOG_SHIPPING_TOKEN` en Koyeb Secrets.
10. Alerting desde LogQL/filter: "error rate > 5%/min".

**Fase C — Alerting externo (ex PROP-111):**

11. UptimeRobot free: 2 monitors pingando `/health/ready` de staging y prod cada 5 min.
12. 2 monitors adicionales pingando Cloudflare Pages (frontend disponible).
13. Sentry Alerts:
    - "Error rate > 5% in 5 min on prod"
    - "New error type appeared in prod"
    - "Auth failures spike > 20/min"
    - "Rate limit fallback store counter > 0" (regresión de ADR-068)
14. Notificaciones: email (canal bloqueante), Slack opcional.
15. Cada tipo de alerta enlaza a procedimiento en `Runbook_DR.md` (T-906).

**Fase D — Dashboard operativo (ex PROP-112):**

16. `documentation/Operational_Dashboard.md` con enlaces y screenshots a Atlas Charts (slow queries, connections), Upstash Console (memory, commands/day), Koyeb metrics (CPU, RAM, network), Cloudflare Analytics (traffic, cache hit ratio), Sentry Performance (p95, error rate), UptimeRobot status page.
17. Saved queries en Atlas Charts y Sentry con filtros útiles.
18. Status page pública en UptimeRobot para usuarios finales.
19. Screenshots de referencia incluidos en memoria TFG como evidencia.

**Criterios de Aceptación:**

- [ ] Sentry Performance recibe spans desde backend prod con sampleRate 0.1
- [ ] Logs Pino exportados al servicio de log shipping con todos los campos estructurados
- [ ] 4 monitors UptimeRobot funcionando + status page pública
- [ ] 4 Sentry Alerts configuradas y notifican por email
- [ ] `Operational_Dashboard.md` con enlaces directos a las 6 consolas
- [ ] Status page accesible públicamente

**ADR:** ADR-097 (log shipping centralizado).

**Archivos afectados:** `backend/src/config/sentry.js`, `frontend/src/services/sentry.js`, `backend/src/utils/logger.js`, `backend/package.json`, `documentation/Operational_Dashboard.md` (nuevo).

---

### T-905: ☁️ Seguridad producción (CSP/HSTS + rate limits recalibrados + OWASP ZAP + MFA super_admin) 📋

**Consolida:** PROP-113 + PROP-114 + PROP-115 + PROP-116
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-901, T-903
**Origen:** Headers actuales permisivos para HMR de dev; rate limits pensados para 1 profesor; MFA inexistente para super_admin con poder total

**Descripción:**
Cuatro frentes de hardening de seguridad para prod: CSP/HSTS endurecidos (objetivo A+ en securityheaders.com), rate limits recalibrados con tráfico realista (10-30 profesores, picos de 100 alumnos), pasada con OWASP ZAP baseline scan contra staging para tener artefacto auditable, y MFA TOTP para acciones críticas del super_admin (defense in depth).

**Sub-tareas:**

**Fase A — Security headers prod (ex PROP-113):**

1. Refactor `backend/src/config/security.js` con split `devHeaders` vs `prodHeaders`.
2. CSP strict para prod:
   - `script-src 'self' https://*.sentry.io`
   - `style-src 'self' 'nonce-...'` (si hay inline style necesario)
   - `connect-src 'self' wss://api-prod.koyeb.app https://*.sentry.io`
   - `img-src 'self' data: https://supabase.co`
3. HSTS: `includeSubDomains; preload; max-age=63072000`.
4. Submit a hstspreload.org tras 2 semanas de staging.
5. Report-uri/report-to a endpoint Sentry para violaciones CSP.
6. Test con securityheaders.com post-deploy. Objetivo: A+.

**Fase B — Rate limits recalibrados (ex PROP-114):**

7. Inventariar limits actuales en `security.js` y `realtime/`.
8. Propuesta numérica por limiter:
   - `globalLimiter`: 1000 req/15min por IP (de 500)
   - `authLimiter`: 20 intentos/15min para endpoints auth menos sensibles, mantener 5 para login
   - `creationLimiter`: 50/hora por user (de 20)
   - WS event scan: 60 scans/min por socket (de 30)
   - WS event pause/resume: 20/min por session
9. Deploy a staging y validar con load test k6 (T-908). Ajustar si hay falsos positivos o underutilización.

**Fase C — OWASP ZAP scan pre-release (ex PROP-115):**

10. GitHub Action `zaproxy/action-baseline@v0.13.0` disparada manualmente con `workflow_dispatch`.
11. URL objetivo: `staging.eduplay.<dominio>`.
12. Report HTML subido como artifact GitHub.
13. Triage de findings en tabla: severidad, explotable, acción tomada.
14. Capítulo en memoria TFG con screenshots del scan y mitigaciones.

**Fase D — MFA super_admin (ex PROP-116):**

15. Middleware `requireMfa` que valide TOTP code en endpoints críticos del super_admin (`DELETE /admin/users/:id`, purgas de datos GDPR, transferencias).
16. Librería `otplib` o `speakeasy` para generación/validación TOTP.
17. UI `/admin/mfa-setup` con QR para Google Authenticator / Authy.
18. Backup codes si el admin pierde el dispositivo (8 códigos single-use, almacenados como hash bcrypt).
19. Alternativa complementaria opcional: `ADMIN_IP_ALLOWLIST` env var validando IPs conocidas (skip si free tier complica esto).

**Criterios de Aceptación:**

- [ ] securityheaders.com da A+ a la URL de producción
- [ ] CSP report-uri envía violaciones a Sentry
- [ ] Rate limits ajustados según valores nuevos y validados sin falsos positivos
- [ ] Report OWASP ZAP archivado como artifact y triage completo
- [ ] MFA TOTP funciona para super_admin con QR setup y backup codes
- [ ] Sin endpoint `/admin/*` accesible solo con JWT (siempre requiere MFA en acciones críticas)
- [ ] Documentado en memoria TFG

**ADR:** ADR-098 (CSP/HSTS prod), ADR-099 (MFA TOTP super_admin).

**Archivos afectados:** `backend/src/config/security.js`, `backend/src/middlewares/requireMfa.js` (nuevo), `backend/src/controllers/authController.js`, `frontend/src/pages/admin/MfaSetup.jsx` (nuevo), `.github/workflows/zap-scan.yml` (nuevo), `package.json` (deps `otplib`).

---

### T-906: ☁️ Backup + DR (BullMQ backup diario + runbook DR + restore-e2e automatizado) 📋

**Consolida:** PROP-117 + PROP-118 + PROP-119
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-901, T-902
**Origen:** Atlas M0 no incluye backups automáticos fiables; sin runbook un incidente se gestiona improvisando; sin drill automatizado los backups se asumen sin verificar

**Descripción:**
Tres pilares de continuidad de servicio: backup diario automatizado de MongoDB con rotación a Supabase Storage, runbook escrito de DR para los 6 escenarios de fallo más probables, y script de restore end-to-end automatizado que corre mensualmente y valida que los backups son realmente útiles.

**Sub-tareas:**

**Fase A — Política de backups (ex PROP-117):**

1. Nuevo BullMQ job `backup-mongo-daily` en `backend/src/jobs/`.
2. Ejecuta `mongodump --uri=$MONGODB_URI --archive --gzip` stream-to-buffer (evitar FS intermediario en Koyeb que tiene FS efímero).
3. Sube a bucket Supabase `backups/mongo/YYYY-MM-DD.gz`.
4. Rotación: borrar backups > 7 días.
5. Upstash: similar pero menor prioridad (cache reconstruible — solo backup semanal opcional).
6. Documento `documentation/Backup_Policy.md` con procedimiento de restore paso a paso manual.
7. Calendario recurrente para drill mensual (issue auto-creado).

**Fase B — Runbook DR (ex PROP-118):**

8. Documento `documentation/Runbook_DR.md` con procedimiento paso-a-paso para 6 escenarios:
   - Atlas M0 no responde
   - Upstash cuota commands excedida
   - Koyeb service down / crashed
   - Cloudflare DNS issue
   - Supabase Storage error
   - BullMQ worker crashed en bucle
9. Por escenario: síntomas, diagnóstico en 2 min, mitigación inmediata, postmortem.
10. Objetivos RTO 1h, RPO 24h acordes al free tier.
11. Revisión tras cada incidente real (meta: runbook vivo).

**Fase C — Restore e2e automatizado (ex PROP-119):**

12. Script `backend/scripts/restore-test.js`.
13. Workflow `.github/workflows/restore-drill.yml` con schedule `0 3 1 * *` (día 1 del mes a las 3am UTC).
14. Ejecuta contra `eduplay-staging` (destruye y recrea datos staging).
15. Smoke suite mínima: login teacher → list decks → create session → start play → verify analytics endpoint.
16. Alerta email si falla.

**Criterios de Aceptación:**

- [ ] Job `backup-mongo-daily` corre diariamente en BullMQ y sube a Supabase
- [ ] Rotación elimina backups > 7 días automáticamente
- [ ] `Backup_Policy.md` documenta procedimiento manual de restore
- [ ] `Runbook_DR.md` cubre 6 escenarios con RTO/RPO declarados
- [ ] Workflow `restore-drill.yml` corre mensualmente y valida smoke suite
- [ ] Test verifica que un backup intencionalmente corrupto falla el drill

**ADR:** ADR-100 (Política de backups + restore drill).

**Archivos afectados:** `backend/src/jobs/backupMongo.js` (nuevo), `backend/scripts/restore-test.js` (nuevo), `documentation/Backup_Policy.md` (nuevo), `documentation/Runbook_DR.md` (nuevo), `.github/workflows/restore-drill.yml` (nuevo).

---

### T-907: ☁️ Performance + escalabilidad (Cloudflare rules + bundle analysis + Socket.IO multi-instancia + command budget Upstash) 📋

**Consolida:** PROP-120 + PROP-121 + PROP-122 + PROP-123
**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-901, T-903
**Origen:** Cloudflare free aporta WAF/cache/rate-limit edge no aprovechados; bundle frontend sin auditar; Socket.IO adapter ya integrado pero sin validar; Upstash 10K commands/día apretado

**Descripción:**
Cuatro mejoras de performance y escalabilidad: configuración Cloudflare (cache + WAF + DDoS + rate limit edge), análisis y reducción del bundle frontend (objetivo < 200 KB gzipped inicial), validación del Socket.IO Redis adapter en escenario multi-instancia (evidencia para memoria TFG), y optimización del command budget Upstash con pipelining donde aplique.

**Sub-tareas:**

**Fase A — Cloudflare rules (ex PROP-120):**

1. Cloudflare Dashboard → Page Rules / Rules Engine:
   - `*.js`, `*.css`, `*.woff2`: Cache Everything, TTL 1h.
   - `/index.html`: Bypass cache (SPA fresh).
   - `/api/*`: Bypass cache, forward a backend Koyeb.
2. Security → WAF → Managed Rules → OWASP Core Ruleset (free).
3. Security → Rate limiting: 30 req/10s por IP a `/api/*`.
4. Bot Fight Mode activado.
5. Documentación en `documentation/Cloudflare_Setup.md`.

**Fase B — Bundle analysis (ex PROP-121):**

6. Integrar `rollup-plugin-visualizer` en `vite.config.js`.
7. Build de prod y revisar treemap HTML resultante.
8. Candidatos a lazy-load:
   - Recharts (solo en analytics) → `React.lazy` por ruta.
   - Página admin (`/admin/*`) → chunk separado.
   - FallbackTouchPanel → solo load si `rfidMode !== 'physical'`.
9. Medidas antes/después: Lighthouse score, TTI, bundle size.
10. Documentar en `frontend/docs/Frontend_Chunking_Vite_Optimization.md`.

**Fase C — Socket.IO multi-instancia (ex PROP-122):**

11. Test manual local: 2 backends en puertos distintos compartiendo la misma Upstash staging.
12. Cliente A se conecta al backend 1, cliente B al backend 2. Ambos en la misma `room` (misma sesión).
13. Verificar que `io.to(room).emit(...)` desde el backend 1 llega al cliente B (servido por backend 2) y viceversa.
14. Documentar resultados en `backend/docs/WebSockets-ExtendedUsage.md` (sección "Validación multi-instancia").

**Fase D — Command budget Upstash (ex PROP-123, sin feature flags):**

15. Dashboard Upstash con commands/day ploteado semanalmente.
16. Telemetría propia en `config/redis.js` contando comandos por categoría: `rate-limit`, `session`, `cache:analytics`, `cache:auth`, `play:init`, `bullmq`. **Nota: la categoría `flags` queda fuera del inventario porque el sistema de feature flags fue retirado.**
17. Identificar hot paths:
    - Por cada request autenticada hay: rate-limit check + session validation + cache:auth lookup = 3 comandos mínimos. (Sin `flag check` que existía antes.)
    - 100 requests/min × 3 = 4320 commands/día.
18. Optimizaciones:
    - Pipeline en `security.js` rateLimiter (1 roundtrip no 3).
    - Cache memoria 30s para slim-user (complementa cache Redis ADR-065).
    - Agrupar reads con pipeline donde sea posible (`MGET`, `HMGET`).
19. Objetivo: < 5K commands/día en uso típico prod.

**Criterios de Aceptación:**

- [ ] Cloudflare Rules + WAF + Rate Limit operativos en prod
- [ ] Bundle inicial frontend < 200 KB gzipped
- [ ] Test multi-instancia Socket.IO documentado y exitoso
- [ ] Telemetría de commands Upstash por categoría disponible en `/api/metrics`
- [ ] Commands/día en staging < 5K tras 1 semana de uso típico
- [ ] Lighthouse score frontend ≥ 90 en Performance

**ADR:** ADR-101 (Optimización command budget Upstash con pipelining).

**Archivos afectados:** `frontend/vite.config.js`, `frontend/src/App.jsx` (lazy routes), `backend/src/config/redis.js`, `backend/src/config/security.js`, `documentation/Cloudflare_Setup.md` (nuevo), `frontend/docs/Frontend_Chunking_Vite_Optimization.md`, `backend/docs/WebSockets-ExtendedUsage.md`.

---

### T-908: ☁️ Testing pre-release (E2E Playwright + load test k6 + chaos testing) 📋

**Consolida:** PROP-124 + PROP-125 + PROP-126
**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-902, T-905
**Origen:** Unit tests no detectan bugs de integración SPA+backend+Mongo+Redis; sin load test no se conoce el techo; sin chaos los patrones de resiliencia no están validados

**Descripción:**
Tres capas de testing antes de cortar v1.0.0: smoke E2E con Playwright corriendo en CI cubriendo el happy path, load test con k6 contra staging para detectar cuellos antes de prod, y scripts chaos manuales para validar los patrones de resiliencia ya implementados (fallback rate-limiters, circuit breaker, dedupe RFID).

**Sub-tareas:**

**Fase A — Smoke E2E Playwright (ex PROP-124):**

1. Instalar `@playwright/test` en `frontend/`.
2. Suite `frontend/e2e/smoke.spec.js`:
   - Login `maria@test.com`.
   - Crear mazo "Test Deck" con 6 tarjetas.
   - Crear sesión de Asociación.
   - Iniciar partida con FallbackTouchPanel.
   - Completar 1 ronda acierto.
   - Verificar score en analytics.
3. Test extra para Memoria y para Secuencia (cuando T-921/T-922 estén listas).
4. Workflow `.github/workflows/e2e.yml` con `services: mongodb, redis` (ioredis-mock no vale, necesita real).
5. Subir screenshots de fallos como artifacts.
6. Run en cada PR.

**Fase B — Load test k6 (ex PROP-125):**

7. Script `tests/load/k6-classroom.js` con escenario realista (profesores + alumnos, mix de endpoints).
8. Ramp up: 0 → 50 profes en 2 min, sostener 10 min, ramp down.
9. Métricas a medir:
   - p95 `/api/plays/start` < 300ms
   - p95 `endPlay` < 500ms
   - p95 `/api/analytics/classroom/*` < 800ms
   - Error rate < 1%
10. Contra staging (nunca contra prod).
11. Resultados en `documentation/Load_Test_Results.md` con gráficos.

**Fase C — Chaos testing (ex PROP-126):**

12. Scripts `scripts/chaos/*.sh`:
    - `kill-upstash.sh`: bloquea puerto con iptables (dev/staging).
    - `flood-atlas.sh`: satura pool con conexiones paralelas.
    - `kill-worker.sh`: `pkill worker.js`.
13. Checklist comportamiento esperado por cada escenario.
14. Ejecución manual trimestral (no automatizada — demasiado invasivo).
15. Documentar hallazgos en `documentation/Chaos_Results.md`.

**Criterios de Aceptación:**

- [ ] Suite E2E smoke pasa en CI en cada PR
- [ ] Load test k6 cumple p95 declarados en staging
- [ ] Scripts chaos ejecutados manualmente con resultado documentado
- [ ] `Load_Test_Results.md` y `Chaos_Results.md` con hallazgos

**Archivos afectados:** `frontend/e2e/smoke.spec.js` (nuevo), `frontend/playwright.config.js` (nuevo), `tests/load/k6-classroom.js` (nuevo), `scripts/chaos/*.sh` (nuevos), `.github/workflows/e2e.yml` (nuevo), `documentation/Load_Test_Results.md` (nuevo), `documentation/Chaos_Results.md` (nuevo).

---

### T-909: ☁️ Docs v1.0.0 (README raíz + runbook operacional + OpenAPI 3.1 + CHANGELOG automation) 📋

**Consolida:** PROP-127 + PROP-128 + PROP-129 + PROP-130
**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-903 (release-please)
**Origen:** README raíz mínimo; runbook operacional inexistente; sin OpenAPI no hay contrato consumible programáticamente; CHANGELOG manual se desactualiza

**Descripción:**
Suite documental completa para v1.0.0: README raíz como carta de presentación del proyecto (un dev fresco debe poder entender, instalar y desplegar sin preguntar), runbook operacional para operaciones del día a día, OpenAPI 3.1 generado desde JSDoc para todos los endpoints, y CHANGELOG automatizado vía release-please.

**Sub-tareas:**

**Fase A — README raíz (ex PROP-127):**

1. Reescribir `README.md` raíz con: Descripción, Arquitectura (con diagramas PNG), Stack, Requisitos, Quickstart Dev, Quickstart Deploy, Troubleshooting, Contribuir, Licencia.
2. Badges: CI status, SonarCloud coverage, version actual, license.
3. Diagrama arquitectura cloud (Koyeb / Cloudflare Pages / Atlas / Upstash / Supabase) renderizado como PNG desde PlantUML o Mermaid.
4. Enlaces a `documentation/`, `backend/docs/`, `frontend/docs/`.

**Fase B — Runbook operacional (ex PROP-128):**

5. `documentation/Runbook_Operacional.md` con ~15 playbooks de 1 página cada uno, formato consistente: cuándo aplica, comandos exactos, verificación, rollback posible.
6. Playbooks cubiertos:
   - Desplegar staging
   - Desplegar producción
   - Rollback manual
   - Reiniciar worker BullMQ
   - Rotar secrets sin downtime
   - Escalar (futuro)
   - Investigar usuario reportado
   - Purgar datos GDPR (Art. 17)
   - Responder a alerta UptimeRobot
   - Investigar slow query Atlas
   - Investigar pico de commands Upstash
   - Verificar integridad de backups
   - Crear nuevo entorno de testing
   - Aplicar parche de seguridad urgente
   - Cambiar política de retención
7. Índice cruzado con `Runbook_DR.md` (T-906).
8. Actualización continua a medida que se aprenden operaciones nuevas.

**Fase C — OpenAPI 3.1 (ex PROP-129):**

9. Integrar `swagger-jsdoc` + `swagger-ui-express`.
10. Anotar todas las rutas con JSDoc `@openapi`: `auth`, `users`, `cards`, `mechanics`, `contexts`, `sessions`, `plays`, `decks`, `admin`, `analytics`, **secuencia (T-921)**.
11. Generar spec estática `openapi.json` en build para descarga.
12. Ruta `/api/docs`: pública en staging, con auth super_admin en prod.
13. URL pública enlazada desde README.

**Fase D — CHANGELOG automation (ex PROP-130):**

14. Generar CHANGELOG retroactivo (subset) desde primer commit semver para tener base en release-please PR inicial.
15. Release-please mantiene actualizado automáticamente (T-903).
16. `CONTRIBUTING.md` con política semver + conventional commits documentada.
17. README enlaza CHANGELOG.

**Criterios de Aceptación:**

- [ ] README raíz incluye 9 secciones enumeradas + diagrama arquitectura cloud
- [ ] Badges visibles y funcionando (CI, coverage, version, license)
- [ ] `Runbook_Operacional.md` con 15 playbooks de formato consistente
- [ ] `/api/docs` accesible en staging mostrando spec OpenAPI completa
- [ ] `openapi.json` descargable
- [ ] CHANGELOG actualizado y enlazado desde README

**Archivos afectados:** `README.md`, `CONTRIBUTING.md`, `documentation/Runbook_Operacional.md` (nuevo), `backend/src/server.js` (Swagger UI), `backend/src/routes/*.js` (anotaciones JSDoc), `frontend/docs/`, `documentation/Architecture_Decisions.md`.

---

### T-910: ☁️ Housekeeping (free tier budget + deprecar Docker prod + cold-start warming) 📋

**Consolida:** PROP-131 + PROP-132 + PROP-133
**Prioridad:** P0 | **Tamaño:** M (4-8h) | **Dependencias:** T-901, T-904
**Origen:** Sin budget docs un límite se cruza sin aviso; Docker prod queda como deuda cognitiva; cold start de Koyeb free puede romper la primera demo si no hay warming

**Descripción:**
Tres tareas de cierre y housekeeping: documento `Free_Tier_Budget.md` con todos los límites por servicio y plan B si se superan; archivar `docker-compose.prod.yml` y Dockerfiles de prod (queda solo Docker para dev local); estrategia de cold-start warming con UptimeRobot pingando `/health/live` cada 5 min para mantener Koyeb free despierto.

**Sub-tareas:**

**Fase A — Free tier budget (ex PROP-131):**

1. `documentation/Free_Tier_Budget.md` con tabla por servicio con límites duros y soft:
   - Atlas M0: 512 MB data, 100 connections shared, 10 GB transfer/semana.
   - Upstash: 256 MB, 10K cmd/día, 1 GB bandwidth/mes.
   - Koyeb: 512 MB RAM, 0.1 vCPU, bandwidth ~100 GB/mes.
   - Cloudflare Pages: bandwidth ilimitado, 500 builds/mes, 100 custom domains.
   - Supabase: 500 MB storage, 2 GB bandwidth/mes, 50K MAUs auth.
   - Sentry: 5K errors/mes, 10K transactions/mes.
   - UptimeRobot: 50 monitors, 5min mín interval.
2. Cálculo de consumo estimado: ¿50 profes × 200 alumnos diarios entra?
3. Alertas tempranas: notificar al 80% de cualquier límite (job BullMQ nocturno o Sentry cron).
4. Plan B por servicio: tier paid mínimo y coste estimado.

**Fase B — Deprecar Docker prod (ex PROP-132):**

5. Renombrar `docker-compose.prod.yml` → `docker-compose.local-prod-test.yml` (explícito) o moverlo a `docker/archive/`.
6. Si existe `docker/backend/Dockerfile.prod` o similar, mover a `docker/archive/` o eliminar.
7. Actualizar `README.md`, `backend/docs/`, `documentation/` removiendo referencias a "Docker producción".
8. Banner en `docker/README.md`:
   > Docker is used only for local development and pre-deploy testing. Production deployment uses Koyeb (backend + worker) and Cloudflare Pages (frontend). See `documentation/Deploy_Koyeb.md`.

**Fase C — Cold-start warming (ex PROP-133):**

9. UptimeRobot monitor HTTP(s) cada 5 min a `https://api-prod.koyeb.app/health/live`.
10. Segundo monitor para staging.
11. Notificaciones: email solo si downtime > 15 min (evita ruido).
12. Sección en memoria TFG "decisiones operacionales":
    - Razonamiento: por qué ping y no otra estrategia.
    - Alternativas descartadas: cron job propio (no rentable), keepalive interno (no evita Koyeb sleep).
    - Coste: 0 €, 0 commands Upstash (porque `/health/live` no toca Mongo/Redis), carga insignificante en Koyeb.
    - Riesgo: mínimo (solo un GET ligero cada 5 min).

**Criterios de Aceptación:**

- [ ] `Free_Tier_Budget.md` con tabla completa, cálculo de consumo y plan B por servicio
- [ ] Alerta temprana al 80% de cualquier límite implementada
- [ ] `docker-compose.prod.yml` archivado o renombrado, sin referencias a "Docker prod" en docs
- [ ] 2 monitors UptimeRobot pingando `/health/live` cada 5 min
- [ ] Sección "decisiones operacionales" añadida a memoria TFG

**Archivos afectados:** `documentation/Free_Tier_Budget.md` (nuevo), `docker-compose.prod.yml` (renombrado/archivado), `docker/README.md`, `README.md`, `backend/docs/`, `memoria/`.

---

### T-921: 🎮 Backend mecánica Secuencia (modelo + gameEngine + sockets + DTOs + tests) 📋

**Prioridad:** P0 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** Cierre del alcance gameplay del TFG — la mecánica Secuencia está hoy bloqueada como "Próximamente" en `SESSION_ENABLED_MECHANICS`

**Descripción:**
Implementar end-to-end la tercera y última mecánica del proyecto en el backend. La mecánica Secuencia consiste en que el sistema muestra una secuencia ordenada de N elementos al alumno (3-7 según dificultad), y el alumno debe reproducirla en el mismo orden escaneando las tarjetas correspondientes. Incluye fase de **memorización** (mostrar la secuencia con resaltado temporal) y fase de **reproducción** (escaneo en orden). Acierto si reproduce N elementos en orden correcto; fallo si se equivoca de orden o de elemento.

Este flujo añade dos requisitos al gameEngine: (1) **estado de fase intra-ronda** (`memorizing` vs `reproducing`), y (2) **validación ordenada** de los scans dentro de la ronda (en Asociación cada scan se evalúa aislado; en Memoria cada scan abre o cierra una pareja; en Secuencia hay que mantener el array de scans de la ronda y compararlo con la secuencia objetivo).

Asociación y Memoria ya están operativas desde Sprint 4 (`gameMechanics/association.js`, `gameMechanics/memory.js`). Esta tarea sigue el patrón Strategy ya consolidado.

**Sub-tareas:**

**Fase A — Modelo de datos:**

1. Extender `GameSession.js` con `sequencePlan` (paralelo a `boardLayout` de Memory y `associationChallengePlan` de Association):
   ```js
   sequencePlan: [{
     roundNumber: Number,
     sequence: [{ uid: String, assignedValue: String, displayData: {...} }],
     length: Number  // 3-7
   }]
   ```
2. Añadir validación: longitud mínima 3, máxima 7. Validar que todos los `uid` referenciados existen en `cardMappings`.
3. Extender enum `MECHANIC_TYPE` (si existe en `constants/enums.js`) o añadir entrada `'sequence'`.
4. Añadir `sequence` a `SESSION_ENABLED_MECHANICS` env var permitidas.

**Fase B — Validadores Zod:**

5. `gameSessionValidator.js`: nuevo schema `sequencePlanItemSchema` y `sequencePlanArraySchema`. Refines de unicidad de `uid` por ronda.
6. Validador de creación: si `mechanicType === 'sequence'`, requerir `sequencePlan` no vacío.

**Fase C — gameEngine + Strategy:**

7. Nuevo módulo `backend/src/gameMechanics/sequence.js` siguiendo el patrón de `association.js` y `memory.js`. API esperada:
   - `prepareRound(session, roundNumber, context)` → devuelve `{ sequence, expectedScans: N }`
   - `processCardScan(state, scan, context)` → registra el scan, compara con `state.expectedSequence[currentIndex]`, devuelve `{ matched: bool, completed: bool, error: 'wrong_order' | null }`
   - `evaluateRound(state)` → devuelve resultado final de la ronda (acierto/fallo + score parcial).
8. Integrar `sequence.js` en `gameEngine.js` (factory de strategies en `getMechanicStrategy(type)`).
9. Estado intra-ronda extendido en Redis: `play:<playId>:state` añade `sequenceProgress: { currentIndex, scansSoFar, fase: 'memorizing'|'reproducing' }`.
10. Eventos socket nuevos:
    - `sequence_start_memorize` (server → client): emite la secuencia con timing de display (3s por elemento + 1s gap).
    - `sequence_start_reproduce` (server → client): cliente puede ya escanear.
    - `sequence_progress` (server → client): cada scan correcto incrementa progreso.
    - `sequence_round_result` (server → client): emite resultado final de la ronda.
11. Manejar timeout: si la fase `reproducing` excede `roundTimeoutMs`, ronda contabiliza como fallo.

**Fase D — DTOs y respuestas API:**

12. Extender DTO de GameSession para incluir `sequencePlan` cuando aplique.
13. Extender DTO de GamePlay (`metrics`) para incluir métricas específicas de Secuencia:
    - `sequencesCompleted`: número de secuencias reproducidas correctamente al completo.
    - `maxSequenceLengthAchieved`: longitud máxima alcanzada en la partida.
    - `partialReproductions`: número de scans correctos antes de fallar (acumulado).
    - `averageReproductionTime`: tiempo medio en reproducir una secuencia completa.

**Fase E — Analytics tracking:**

14. Extender `analyticsService.js` para que las métricas de Secuencia entren en agregaciones de:
    - `studentMetrics` (campos paralelos a los de Asociación/Memoria).
    - `getStudentSummary` con desglose por mecánica.
    - `getClassroomTrends`, `getClassroomDistribution` (agregando partidas de Secuencia al total).
    - `getClassroomRankings` (top contextos donde Secuencia funciona mejor).

**Fase F — Tests:**

15. `tests/sequenceMechanic.test.js`: tests unitarios del módulo `sequence.js`.
16. `tests/sequenceFlow.test.js`: test E2E del flujo completo (crear sesión → iniciar partida → memorizar → reproducir → fallar/acertar → siguiente ronda → endPlay).
17. `tests/sequenceAnalytics.test.js`: verificar que las métricas se agregan correctamente en analytics.
18. Actualizar `gameMechanicAvailability.test.js` para que `sequence` aparezca como disponible.

**Criterios de Aceptación:**

- [ ] `MECHANIC_TYPE` y `SESSION_ENABLED_MECHANICS` aceptan `sequence`
- [ ] Crear sesión con `mechanicType: 'sequence'` valida `sequencePlan` correctamente
- [ ] `gameEngine` orquesta partidas de Secuencia con estado `memorizing` → `reproducing`
- [ ] Eventos socket `sequence_*` emitidos en orden correcto
- [ ] Scan correcto en orden → `sequence_progress` con `matched: true`
- [ ] Scan incorrecto u orden incorrecto → `sequence_round_result` con fallo
- [ ] Timeout de fase `reproducing` cierra la ronda como fallo
- [ ] Métricas de Secuencia aparecen en `studentMetrics` y endpoints de analytics
- [ ] Suite de tests: 3 nuevos archivos pasando, sin regresiones en Asociación/Memoria
- [ ] `npm test` y `npm run lint` pasan en backend

**ADR:** ADR-102 (Mecánica Secuencia: estado intra-ronda y validación ordenada).

**Archivos afectados:** `backend/src/models/GameSession.js`, `backend/src/validators/gameSessionValidator.js`, `backend/src/constants/enums.js`, `backend/src/gameMechanics/sequence.js` (nuevo), `backend/src/services/gameEngine/index.js` (factory de strategies), `backend/src/services/analyticsService.js`, `backend/src/utils/dtos.js`, `backend/src/realtime/socketHandlers.js`, `backend/tests/sequenceMechanic.test.js` (nuevo), `backend/tests/sequenceFlow.test.js` (nuevo), `backend/tests/sequenceAnalytics.test.js` (nuevo).

---

### T-922: 🎮 Frontend mecánica Secuencia + analytics específicas 📋

**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-921
**Origen:** Sin componente UI de gameplay para Secuencia, la mecánica del backend no es jugable

**Descripción:**
Componente de gameplay frontend para la mecánica Secuencia: vista de **memorización** (los elementos de la secuencia se resaltan secuencialmente con timing visible), transición a vista de **reproducción** (las cartas vuelven a ocultarse o se atenúan, el alumno debe escanear/tap en orden), feedback de acierto progresivo por elemento y feedback final de ronda. Incluye:

- Componente `SequenceBoard.jsx` paralelo a `MemoryBoard.jsx` y `ChallengeDisplay.jsx`.
- Adaptación del wizard de creación de sesión para configurar `sequencePlan`.
- Adaptación de `FallbackTouchPanel` para soporte de Secuencia (tap en orden).
- KPIs específicos en `StudentProfile.jsx` y vista comparativa.
- Visualizaciones específicas en analytics: gráfico de progreso de longitud máxima alcanzada por partida.

**Sub-tareas:**

**Fase A — Componente de gameplay (`SequenceBoard.jsx`):**

1. Layout principal: tarjetas dispuestas como en Memoria pero **siempre visibles** durante la fase de memorización.
2. Fase `memorizing`: highlighting secuencial con animación "ping" + número visible (1, 2, 3...) sobre la tarjeta resaltada. Respetar `prefers-reduced-motion`.
3. Transición visible al alumno: "Ahora reproduce la secuencia" con cuenta atrás de 2s (componente `<PhaseTransitionOverlay>`).
4. Fase `reproducing`: tarjetas se atenúan ligeramente, el alumno escanea (o tappa con FallbackTouchPanel).
5. Feedback acierto progresivo: cada scan correcto añade un "tick" visible en la zona de progreso (1/N → 2/N → ...).
6. Feedback fallo: vibración visual del board + glow rojo en la tarjeta esperada y la tarjeta escaneada (si fueron distintas).
7. Integrar con `useGameSocket` para escuchar `sequence_*` events.
8. Soporte `prefers-reduced-motion`: sin highlighting animado, solo cambio de color.

**Fase B — Wizard de sesión:**

9. `DeckCreationWizard` y `SessionEdit`: detectar `mechanicType === 'sequence'` y mostrar configurador específico:
   - Slider de longitud de secuencia (3-7).
   - Opción "Aleatorizar tarjetas por ronda" o "Definir secuencia fija".
   - Generación automática de `sequencePlan` si "aleatorizar".

**Fase C — FallbackTouchPanel:**

10. Modo Secuencia: tarjetas tappables siempre visibles, validación de orden del lado cliente (que llega en evento `sequence_start_reproduce` con `expectedSequence` para feedback inmediato sin esperar al backend).
11. Cooldown anti-tap-spam alineado con la política dedupe de ADR-090 (250ms).

**Fase D — Analytics frontend:**

12. `StudentProfile.jsx`: añadir tarjeta de métricas de Secuencia (longitud máxima alcanzada, % aciertos completos, tiempo medio reproducción).
13. `StudentsAnalytics.jsx` (vista comparativa): añadir columna "Mejor Secuencia" con tooltip explicativo.
14. Nuevo componente `SequenceProgressChart.jsx` (Recharts) que muestra evolución de la longitud máxima alcanzada por el alumno a lo largo del tiempo.
15. `getStudentSummary` en `analytics.js` ya devuelve métricas específicas (T-921 fase E); consumir.

**Fase E — Habilitación + GameSession:**

16. `GameSession.jsx`: añadir branch para `mechanicType === 'sequence'` y renderizar `SequenceBoard`.
17. Quitar el "Próximamente" del wizard cuando la mecánica esté disponible.

**Fase F — Tests:**

18. `SequenceBoard.test.jsx`: tests unitarios de fases y transiciones.
19. `GameSession.test.jsx`: añadir caso para `mechanicType: 'sequence'`.

**Criterios de Aceptación:**

- [ ] `SequenceBoard.jsx` renderiza fases `memorizing` → `reproducing` con transición clara
- [ ] Highlighting secuencial respeta `prefers-reduced-motion`
- [ ] Acierto progresivo y fallo dan feedback visual claro
- [ ] `FallbackTouchPanel` soporta Secuencia con cooldown 250ms
- [ ] Wizard configura `sequencePlan` correctamente (longitud + aleatorización)
- [ ] `StudentProfile` muestra métricas específicas de Secuencia
- [ ] Vista comparativa incluye columna "Mejor Secuencia"
- [ ] Mecánica deja de aparecer como "Próximamente" en wizard
- [ ] `npm test` y `npm run lint` pasan en frontend
- [ ] Verificación visual en desktop ≥1024px y tablet ≥768px

**Archivos afectados:** `frontend/src/components/game/SequenceBoard.jsx` (nuevo), `frontend/src/components/game/PhaseTransitionOverlay.jsx` (nuevo), `frontend/src/components/game/FallbackTouchPanel.jsx`, `frontend/src/pages/GameSession.jsx`, `frontend/src/pages/DeckCreationWizard.jsx`, `frontend/src/pages/SessionEdit.jsx`, `frontend/src/pages/StudentProfile.jsx`, `frontend/src/pages/StudentsAnalytics.jsx`, `frontend/src/components/analytics/SequenceProgressChart.jsx` (nuevo), `frontend/src/services/analytics.js`, tests asociados.

---

### T-923: 🎮 Auditoría integral de estadísticas y visualizaciones con mecánica Secuencia 📋

**Prioridad:** P0 | **Tamaño:** L (1-2 días) | **Dependencias:** T-921, T-922
**Origen:** Las fases analytics dentro de T-921/T-922 sólo cubren lo evidente (DTOs y un chart nuevo); el resto del área analytics queda sin auditar y arriesga romperse o silenciarse con datos `mechanicType: 'sequence'`

**Descripción:**
Pasada exhaustiva por todo el área analytics (backend + frontend + seeders + docs) verificando que la mecánica Secuencia se trata de forma coherente, no rompe agregaciones existentes y se visualiza de forma específica donde aplica. Esta tarea es defensiva pero crítica: sin ella, riesgos reales de:

- Charts que muestran placeholders feos o se rompen al recibir `mechanicType: 'sequence'` (ej: `mechanicLabels` mapping que no contempla la nueva clave).
- Agregaciones que ignoran partidas de Secuencia → KPIs del Dashboard "vacíos" para profesores que sólo usan Secuencia.
- Heatmaps, distribución y rankings que no contabilizan la nueva mecánica.
- Demos al tribunal donde Secuencia "no aparece" en analytics porque el seeder no la genera.
- Alertas inteligentes (T-941) sin detección de patrones específicos de Secuencia (ej: "alumno se atasca en secuencias largas").

**Sub-tareas:**

**Fase A — Auditoría backend (analyticsService + endpoints + agregaciones):**

1. Repasar uno a uno los 19+ endpoints de analytics (cubiertos en CHANGELOG v0.5.0) y verificar que tratan `mechanicType: 'sequence'` correctamente:
   - `/classroom/students` (filtro por tier cuenta partidas Secuencia)
   - `/classroom/distribution` (rangos RAG agregan plays Secuencia)
   - `/classroom/trends` (variación KPIs por mecánica)
   - `/classroom/heatmap` (día/hora incluye plays Secuencia)
   - `/classroom/rankings` (top mecánicas y top contextos × mecánica incluyen Secuencia)
   - `/classroom/content-effectiveness` (eficacia por mecánica + matriz cruzada de T-942)
   - `/student/:id/summary` (desglose por mecánica con métricas específicas de Secuencia: `maxSequenceLengthAchieved`, `sequencesCompleted`, `partialReproductions`, `averageReproductionTime`)
2. Añadir tipos de alerta específicos de Secuencia en `alertDetectionService` (post-T-941):
   - `sequence_stagnation`: alumno no supera longitud N en X partidas seguidas.
   - `sequence_order_errors`: alumno acierta los elementos pero falla el orden de forma sistemática (errores cognitivos vs memoria).
3. Revisar `studentMetrics` agregados en `User.updateStudentMetrics` y en T-931 (Redis Hash): los campos de Secuencia deben fluir correctamente.
4. Verificar `mechanicLabels` mapping en backend — `'sequence'` debe traducirse al label "Secuencia" donde se exponga al frontend.
5. Tests de integración por endpoint con dataset que incluya plays Secuencia.

**Fase B — Auditoría frontend (charts y componentes):**

6. Repasar cada chart asegurando que no se rompe con datos `mechanicType: 'sequence'` y que **muestra Secuencia coherentemente** (no como genérico):
   - `StudentProgressChart` — soporta filtro por mecánica, incluye Secuencia.
   - `DifficultyHeatmap` — incluye partidas Secuencia.
   - `ActivityHeatmap` — incluye partidas Secuencia.
   - `StudentsDistributionChart` — distribución agrega Secuencia.
   - `TrendsChart` — trends por mecánica incluyen Secuencia.
   - `TrajectoryChart` — trayectoria incluye Secuencia.
   - `RecentActivity` — eventos Secuencia con label e icono coherentes.
   - `CrossMatrix` (T-942) — eje mecánica incluye Secuencia.
   - `SequenceProgressChart` (T-922) — integrado en `StudentProfile`, evaluar también en `Dashboard` para profesores activos en Secuencia.
7. Filtros de Dashboard (selector mecánica): incluir Secuencia con label "Secuencia" e icono diferenciado.
8. Mapping `mechanicLabels` y `mechanicIcons` en `frontend/src/constants` (o donde resida): añadir entrada Secuencia con icono Lucide coherente con el resto.
9. Vista comparativa (`StudentsAnalytics`): columna "Mejor Secuencia" añadida en T-922 fase D — verificar que se renderiza con dataset real.
10. Insights/Informes (T-942 fase C): los tipos de informe predefinidos deben poder filtrarse por Secuencia y mostrar sus KPIs específicos.
11. Empty states específicos: si un profesor no tiene partidas Secuencia, los charts dedicados deben mostrar un empty state útil ("Aún no se han jugado partidas de Secuencia"), no un chart vacío con ejes a 0.

**Fase C — Seeders de demo:**

12. Actualizar `backend/seeders/06-sessions.js` y los seeders de plays correspondientes para generar partidas de Secuencia variadas: longitudes 3-7, distintos contextos, mix de aciertos/fallos completos/parciales.
13. Verificar que tras `npm run seed:reset` los analytics muestran datos de las 3 mecánicas (Asociación, Memoria, Secuencia) en Dashboard, StudentProfile, StudentsAnalytics e Insights.

**Fase D — Documentación:**

14. Actualizar `backend/docs/Analytics_Design_Rationale.md` con:
    - Sección dedicada a la mecánica Secuencia: KPIs específicos, agregaciones, lectura pedagógica.
    - Actualización de la matriz mecánica × KPI (qué KPI aplica a qué mecánica).
15. Actualizar `frontend/docs/05-GAMEPLAY-REALTIME.md` con la sección Secuencia desde el ángulo realtime y eventos socket.
16. Actualizar `documentation/Dashboard.md` con las visualizaciones nuevas y los KPIs específicos.

**Fase E — QA visual con datos reales:**

17. Pasada Playwright o manual en viewport 1920×1080:
    - Tras `seed:reset`, login como `maria@test.com`.
    - Verificar Dashboard, StudentProfile (de un alumno con partidas de Secuencia), StudentsAnalytics e Insights con datos reales de Secuencia.
    - Capturar screenshots como evidencia (carpeta `qa-capturas-v1.0.0/`, útiles para memoria TFG).
18. Probar `prefers-reduced-motion` en charts y transiciones específicas para asegurar que no hay regresiones.

**Criterios de Aceptación:**

- [ ] Los 19+ endpoints de analytics tratan `mechanicType: 'sequence'` correctamente (test por endpoint con dataset Secuencia)
- [ ] Al menos 2 tipos de alerta nuevos específicos de Secuencia añadidos (`sequence_stagnation`, `sequence_order_errors`)
- [ ] Mapping `mechanicLabels` y `mechanicIcons` actualizado en backend y frontend
- [ ] Los 9+ charts del proyecto se renderizan correctamente con datos Secuencia (sin regresiones en Asociación/Memoria)
- [ ] Filtros de Dashboard incluyen Secuencia
- [ ] `SequenceProgressChart` integrado en `StudentProfile` con datos reales
- [ ] Vista comparativa muestra columna "Mejor Secuencia" con datos
- [ ] Seeders generan partidas Secuencia variadas (longitudes 3-7, todos los contextos, mix aciertos/fallos)
- [ ] `Analytics_Design_Rationale.md`, `05-GAMEPLAY-REALTIME.md` y `Dashboard.md` actualizados
- [ ] Capturas QA almacenadas en `qa-capturas-v1.0.0/`
- [ ] Tests pasando sin regresiones (`npm test` backend + frontend)
- [ ] Verificación visual desktop ≥1024px y tablet ≥768px

**Archivos afectados:** `backend/src/services/analyticsService.js`, `backend/src/services/alertDetectionService.js` (post-T-941), `backend/src/services/gameEngine/endPlay.js`, `backend/src/models/User.js`, `backend/src/utils/dtos.js`, `backend/seeders/06-sessions.js`, `backend/seeders/` (plays), `backend/docs/Analytics_Design_Rationale.md`, `frontend/src/constants/mechanicLabels.js` (o equivalente), múltiples componentes en `frontend/src/components/analytics/`, `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/StudentProfile.jsx`, `frontend/src/pages/StudentsAnalytics.jsx`, `frontend/src/pages/Insights.jsx`, `frontend/docs/05-GAMEPLAY-REALTIME.md`, `documentation/Dashboard.md`.

---

## P1 — Prioridad Alta

### T-941: 📊 Persistencia de alertas inteligentes con ciclo de vida activo/resuelto/desestimado 📋

**Consolida:** PROP-78
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-901 (BullMQ ya operativo desde Sprint 5)
**Origen:** QA 2026-04-22 — alertas se generan on-the-fly sin historial, todas con `createdAt = now`, sin estado dismiss/resolved

**Descripción:**
Hoy `analyticsService.getClassroomAlerts` recorre partidas recientes y deriva alertas (declining_performance, inactivity, sudden_score_drop, consistent_timeout...) sin persistirlas. Como consecuencia: `createdAt` se setea siempre a "now" (frontend muestra "Hace 7 min" para todas), no hay historial, no se puede marcar como leída/resuelta, y si el alumno mejora la alerta desaparece silenciosamente sin trazabilidad. Esta tarea introduce el modelo `SmartAlert` con ciclo de vida formal y un job BullMQ que evalúa cada 15 min.

**Sub-tareas:**

1. **Modelo Mongoose `SmartAlert`:**
   - Fields: `studentId`, `teacherId`, `type`, `severity`, `description`, `detectedAt` (primera detección), `lastSeenAt` (última reaparición), `resolvedAt`, `dismissedAt`, `status` (`active|resolved|dismissed`), `gamePlayId` opcional, `metadata` flexible.
   - Índices: `{ teacherId, status, detectedAt: -1 }`, `{ studentId, type, status }` (para dedupe).
2. **Servicio `alertDetectionService.js`:**
   - Recálculo periódico (BullMQ job cada 15 min) que evalúa cada alumno activo y:
     - Si detecta una alerta nueva (type + studentId no activa) → insert.
     - Si una alerta existente sigue válida → update `lastSeenAt`.
     - Si una alerta existente ya no aplica → transición a `resolved` con `resolvedAt = now`.
   - Dedupe por `(studentId, type, status=active)`.
   - Reemplaza el cálculo on-the-fly del `analyticsService` actual.
3. **Endpoints REST:**
   - `GET /api/analytics/alerts?status=active&period=...` — listado paginado.
   - `PATCH /api/analytics/alerts/:id/dismiss` — marcar como desestimada.
   - `PATCH /api/analytics/alerts/:id/resolve` — marcar como resuelta.
4. **Frontend:**
   - `AlertsHub.jsx`: mostrar `detectedAt` real con `formatRelativeTime`.
   - Filtros por estado (Activas / Resueltas / Desestimadas).
   - Acción de "Dismiss" en cada alerta (con undo toast vía sonner durante 5s).
5. **Migración:** script `migrate-alerts.js` que genera alertas históricas a partir de las partidas existentes (backfill desde fecha del primer GamePlay).

**Tests:**
- Unit: dedupe de alertas (no duplicar la misma type+student en activas).
- Unit: transición a resolved cuando desaparece la condición.
- E2E: job corre → alertas aparecen con detectedAt correcto → profesor dismiss → no reaparece aunque el criterio se repita.

**Criterios de Aceptación:**

- [ ] Modelo `SmartAlert` con índices correctos
- [ ] Job BullMQ corre cada 15 min y evalúa todos los estudiantes activos
- [ ] Dedupe funcional (no duplicados active del mismo type+student)
- [ ] Transición correcta a resolved/dismissed
- [ ] Endpoints REST funcionales con autenticación + autorización
- [ ] Frontend muestra `detectedAt` real, filtros por estado y acción dismiss con undo
- [ ] Script de migración backfill genera alertas históricas correctamente
- [ ] Tests unitarios + E2E pasando

**ADR:** ADR-103 (Persistencia de alertas con ciclo de vida).

**Archivos afectados:** `backend/src/models/SmartAlert.js` (nuevo), `backend/src/services/alertDetectionService.js` (nuevo), `backend/src/jobs/alertDetectionJob.js` (nuevo), `backend/src/services/analyticsService.js` (refactor del cálculo on-the-fly), `backend/src/controllers/analyticsController.js`, `backend/src/routes/analytics.js`, `backend/src/validators/analyticsValidator.js`, `backend/scripts/migrate-alerts.js` (nuevo), `frontend/src/components/dashboard/AlertsHub.jsx`, `frontend/src/components/dashboard/AlertsPanel.jsx`, `frontend/src/services/analytics.js`, tests asociados.

---

### T-943: 📊 Campaña de cobertura tests para Quality Gate SonarCloud 📋

**Consolida:** PROP-94
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** ADR-086 dejó cobertura 28.9% como deuda explícita; QG SonarCloud exige 80% en new code

**Descripción:**
Subir cobertura de tests del proyecto desde 28.9% (backend ~30%, frontend ~25%) hacia el threshold del Quality Gate SonarCloud (80% en new code). Las otras dos condiciones del QG (reliability + hotspots_reviewed) ya se cerraron en la sesión SonarCloud abril 2026. La cobertura baja permite que regresiones se cuelen sin signal temprana. Áreas críticas sin cobertura completa: gameEngine (parcial), mecánicas individuales, flujos de auth/refresh token rotation, hooks frontend (`useGameSocket`, `useGamePlaySync`).

**Sub-tareas:**

**Fase A — Backend:**

1. Tests para gameEngine restantes (estado intra-ronda, transiciones, cleanup).
2. Tests para mecánicas individuales (Asociación: edge cases con penalización; Memoria: aborto y resume; Secuencia: orden estricto, timeout fase).
3. authService completo (refresh rotation + blacklist + device fingerprinting).
4. Endpoints analytics menos cubiertos (`heatmap`, `rankings`, `summary` con casos extremos).
5. Repositorios con write ops (transacciones con rollback).

**Fase B — Frontend:**

6. Hooks críticos (`useGameSocket`, `useGamePlaySync`, `useReducedMotion`, `useFormFocusFirstError`, `useConfirmationModal`).
7. Páginas principales (`GameSession`, `Dashboard`, `StudentProfile`, `StudentsAnalytics`).
8. Componentes de juego (`ChallengeDisplay`, `RFIDHandler`, `MemoryBoard`, `SequenceBoard` (tras T-922)).

**Fase C — Configuración:**

9. Excluir explícitamente en `sonar-project.properties` lo que no aporta cobertura significativa: bootstrapping (`server.js`, `main.jsx`), CLIs (`scripts/*`), efectos visuales puros (`Confetti`, `ScanlineOverlay`), barrel files.
10. Si la subida total tarda más que el sprint: bajar threshold del QG a 50% en new code temporalmente, evitando bloquear merges por una métrica que no va a moverse en un PR pequeño.

**Criterios de Aceptación:**

- [ ] Cobertura backend ≥ 60% (objetivo 80% si tiempo da)
- [ ] Cobertura frontend ≥ 60% (objetivo 80% si tiempo da)
- [ ] Quality Gate SonarCloud pasa en cobertura new code (con threshold ajustado si es necesario)
- [ ] Exclusiones documentadas y justificadas en `sonar-project.properties`
- [ ] Hooks críticos del frontend tienen tests
- [ ] Mecánicas individuales (Asociación, Memoria, Secuencia) tienen suite específica

**Archivos afectados:** `backend/tests/` (~10 nuevos archivos), `frontend/src/**/__tests__/` (~10 nuevos archivos), `sonar-project.properties`, `documentation/Sonar_Coverage_Campaign.md` (nuevo, opcional).

---

### T-953: ⚛️ Charts paleta de marca + mascota emocional ampliada + GameOver expresivo 📋

**Consolida:** PROP-66 + PROP-67 + PROP-74
**Prioridad:** P1 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** Charts genéricos (anti-AI-slop), GameOver funcional pero no emocional, mascota ya existe pero infrautilizada (solo GameOver actual)

**Descripción:**
Tres mejoras de signature visual y feedback emocional que aprovechan la mascota ya existente (`CharacterMascot.jsx`, `MascotAccessory.jsx`):

1. Sistema de tema para charts Recharts con paleta de marca y patterns colorblind-safe (gradients `brand→accent-indigo` en líneas positivas, `warning→error-dark` en negativas, patterns `<defs>` reutilizables).
2. Ampliación de la mascota a más contextos (empty states, onboarding, éxitos críticos) con nuevos estados (greeting, pointing, celebrating, thinking).
3. GameOver emocional con escalera de feedback acoplada a la mascota:
   - 1 estrella: "Buen intento" + mascota animando "pulgar arriba pequeño"
   - 2 estrellas: "Muy bien" + confetti breve + mascota saltando
   - 3 estrellas: "Eres un crack" + confetti + fireworks + mascota dando vueltas

**Sub-tareas:**

**Fase A — Charts theme (ex PROP-66):**

1. `<defs>` globales con gradients y patterns en `frontend/src/components/analytics/ChartsTheme.jsx`.
2. Wrappers `ThemedLineChart`, `ThemedBarChart`, `ThemedHeatmap` que aplican el tema.
3. Migrar charts: `StudentProgressChart`, `DifficultyHeatmap`, `ActivityHeatmap`, `StudentsDistributionChart`, `TrendsChart`, `TrajectoryChart`, `SequenceProgressChart` (T-922).
4. Patterns diagonales/puntos en heatmaps para colorblind-safe.
5. Iconos en datos categóricos (no solo color).
6. Tests con snapshots que verifiquen que el `<defs>` está presente.

**Fase B — Mascota extendida (ex PROP-74):**

7. Refactor `CharacterMascot.jsx` para aceptar más states: `greeting`, `pointing`, `celebrating`, `thinking`, además de los existentes (`idle`, `happy`, `sad`, `encouraging`).
8. Diseñar nuevos estados SVG si faltan (consultar con autor del TFG / illustrator).
9. Integrar en `EmptyState` como prop opcional `mascot`.
10. Integrar en Onboarding (4 pasos actuales): mascota guía con burbujas de diálogo.

**Fase C — GameOver emocional (ex PROP-67):**

11. Refactor de `GameOverScreen` con escalera de mascota + escalera de mensajes.
12. Refactor de `FeedbackOverlay` con particle burst direccionado desde la tarjeta hacia el score.
13. Feedback acierto: mascota reacciona (animación de ojitos brillantes), particles brotan de la tarjeta hacia el score.
14. Feedback error: mascota inclina cabeza pensativa, barra de progreso "retrocede" un frame como rewind.

**Criterios de Aceptación:**

- [ ] `ChartsTheme.jsx` exporta `<defs>` globales y wrappers funcionan en los 7+ charts del proyecto
- [ ] Patterns colorblind-safe presentes en heatmaps
- [ ] `CharacterMascot.jsx` soporta 8+ states con animación coherente
- [ ] EmptyState integra mascota como opcional
- [ ] Onboarding usa mascota como guía
- [ ] GameOver muestra escalera 1/2/3 estrellas con respuesta emocional distinta
- [ ] FeedbackOverlay con particles direccionado en acierto/error
- [ ] `npm test` y `npm run build` pasan en frontend

**ADR:** ADR-104 (Sistema de tema para charts), ADR-105 (Mascota ampliada y feedback emocional).

**Archivos afectados:** `frontend/src/components/analytics/ChartsTheme.jsx` (nuevo), `frontend/src/components/analytics/Themed*.jsx` (nuevos), `frontend/src/components/analytics/StudentProgressChart.jsx`, `frontend/src/components/analytics/DifficultyHeatmap.jsx`, `frontend/src/components/analytics/ActivityHeatmap.jsx`, `frontend/src/components/analytics/StudentsDistributionChart.jsx`, `frontend/src/components/analytics/TrendsChart.jsx`, `frontend/src/components/analytics/TrajectoryChart.jsx`, `frontend/src/components/game/CharacterMascot.jsx`, `frontend/src/components/game/MascotAccessory.jsx`, `frontend/src/components/game/GameOverScreen.jsx`, `frontend/src/components/game/FeedbackOverlay.jsx`, `frontend/src/components/ui/EmptyState.jsx`.

---

### T-958: ⚛️ Audit final de coherencia visual + WCAG 2.2 AA + responsive tablet 📋

**Prioridad:** P1 | **Tamaño:** L-XL (~2-3 días) | **Dependencias:** T-951, T-952, T-953, T-954 (toda la integración UI/UX del sprint debe haber tocado tierra antes)
**Origen:** El sprint añade muchas piezas UI nuevas (mascota ampliada, charts theme, atmósferas, hero transitions, tema claro, paginación, inline editing); sin pasada final de coherencia hay riesgo de inconsistencias visibles entre componentes; el TFG argumenta accesibilidad como eje pedagógico (datos de menores) y la memoria necesita evidencia de WCAG 2.2 AA con tooling formal — el ADR-069 cubrió a11y crítica pero falta auditoría sistemática

**Descripción:**
Pasada final de calidad UI/UX del proyecto justo antes del corte v1.0.0. Cubre cuatro frentes complementarios que aseguran que el producto es uniforme, accesible y responde correctamente en todos los breakpoints soportados:

1. **Coherencia design system**: revisión sistemática de variantes hover/focus/active/disabled, spacing rhythm (4/8/16/24/32), typography scale y line-heights, asegurando que ningún componente tiene valores ad-hoc tras integrar las piezas nuevas del sprint.
2. **WCAG 2.2 AA con tooling formal**: auditoría con Axe DevTools (o similar) cubriendo todas las páginas del flujo profesor + flujo super_admin + gameplay. Hallazgos triados, fix de Critical/Serious, justificación documentada de los aceptados como deuda menor. Captura de evidencia para memoria TFG.
3. **Responsive tablet (768-1024px)**: la app es desktop-first pero soporta tablet. Pasada para detectar elementos cortados, scroll horizontal indeseado, touch targets pequeños o solapamientos en ese rango. Mobile no es prioridad documentada y se excluye explícitamente.
4. **Loading/error/empty states audit**: inventario de async calls y verificación de que cada uno tiene loading state (skeleton preferentemente), error boundary con fallback `<ErrorState>` y empty state con ilustración + CTA + texto.

**Sub-tareas:**

**Fase A — Coherencia design system:**

1. Inventario de variantes de botones, inputs, cards, modales y tabs actuales. Identificar valores ad-hoc (clases Tailwind crudas en lugar de tokens semánticos) introducidos en este sprint.
2. Verificar estados hover/focus/active/disabled coherentes en todos los interactivos.
3. Spacing rhythm: revisar que el padding/margin sigue la escala 4/8/16/24/32 (cero valores ad-hoc tipo `p-3.5` o `gap-7`).
4. Typography: tamaños de heading (h1-h4) consistentes entre páginas, line-heights coherentes.
5. Color tokens OKLCH: cero `bg-slate-*`, `text-slate-*` etc. crudos restantes (o documentados como TOKEN-EXCEPTION inline).

**Fase B — Auditoría WCAG 2.2 AA con Axe:**

6. Instalar `@axe-core/react` en dev mode + ejecutar Axe DevTools en cada página clave: `/login`, `/register`, `/dashboard`, `/sessions`, `/decks`, `/contexts`, `/students`, `/analytics/students`, `/students/:id`, `/admin/*`, `/game/:sessionId` (con las 3 mecánicas), `/insights`, `/privacy`.
7. Triar findings por severidad: Critical / Serious / Moderate / Minor.
8. Fix de Critical y Serious. Documentar Moderate aceptados como deuda en `documentation/Accessibility_Audit_v1.0.0.md`.
9. Verificar criterios WCAG 2.2 nuevos respecto a 2.1: **Focus Not Obscured (2.4.11)**, **Target Size Minimum (2.5.8 — 24×24px CSS)**, **Dragging Movements (2.5.7)**, **Consistent Help (3.2.6)**, **Redundant Entry (3.3.7)**.
10. Capturas de pantalla con Axe DevTools mostrando "0 violations Critical/Serious" en pestañas clave para evidencia memoria TFG.

**Fase C — Responsive tablet (768-1024px):**

11. Pasada manual con Chrome DevTools (o tablet real) en breakpoints 768, 834 (iPad mini), 1024 (iPad).
12. Detectar y fixear: scroll horizontal indeseado, elementos cortados, modales que sobresalen, sidebar que se solapa, touch targets < 44×44px (recomendación adicional sobre el mínimo WCAG 24×24).
13. Verificar wizards de creación (mazo + sesión) en tablet — flujo crítico del profesor.
14. Verificar gameplay en tablet — los niños podrían jugar con FallbackTouchPanel sin sensor RFID conectado al iPad.

**Fase D — Loading/error/empty states audit:**

15. Inventario de async calls en frontend. Verificar que cada uno tiene loading state (skeleton preferentemente, no spinner solo).
16. Inventario de error boundaries en páginas principales. Verificar fallback consistente con `<ErrorState>` (componente del Sprint 5).
17. Inventario de empty states. Verificar todos consistentes con ilustración + CTA + texto (patrón ADR-069).

**Criterios de Aceptación:**

- [ ] Inventario y normalización de variantes UI inconsistentes (cero clases ad-hoc post-sprint)
- [ ] Spacing rhythm 4/8/16/24/32 verificado en componentes principales
- [ ] Typography scale consistente (h1-h4 con sizes y line-heights uniformes)
- [ ] Cero color tokens crudos restantes (o documentados como TOKEN-EXCEPTION)
- [ ] Axe DevTools: 0 Critical y 0 Serious en las 13+ páginas clave
- [ ] WCAG 2.2 AA: Focus Not Obscured + Target Size 24×24 + Dragging + Consistent Help + Redundant Entry verificados
- [ ] `Accessibility_Audit_v1.0.0.md` con findings triados y deuda justificada
- [ ] Responsive tablet sin scroll horizontal ni cortes en breakpoints 768/834/1024
- [ ] Loading/error/empty states consistentes (skeleton, ErrorState, EmptyState)
- [ ] Capturas de evidencia en `qa-capturas-v1.0.0/` para memoria TFG

**ADR:** ADR-108 (Audit final UI/UX + WCAG 2.2 AA + responsive tablet pre-release v1.0.0).

**Archivos afectados:** múltiples componentes en `frontend/src/components/**`, `frontend/src/pages/**`, `frontend/src/index.css`, `documentation/Accessibility_Audit_v1.0.0.md` (nuevo), `frontend/docs/03-UI-UX-GUIDELINES.md`.

---

## P2 — Prioridad Media

### T-931: 🔧 Materialización Redis (Leaderboards ZSET + studentMetrics Hash + reconciliación nocturna) 📋

**Consolida:** PROP-60 + PROP-63
**Prioridad:** P2 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-901
**Origen:** ADR-080 difirió esta materialización a Sprint 6; bajo carga de demo el dashboard ejecuta agregaciones costosas en Mongo cada request

**Descripción:**
Materializar dos hot reads del dashboard en estructuras Redis especializadas:

1. **Leaderboards con ZSET** para rankings de contextos/mecánicas/estudiantes (`analyticsService.getTopContextsAndMechanics` ejecuta dos aggregations con `$lookup` × 2 cada una en cada request del dashboard). Con ZSET: O(log N) actualización al completar play, O(log N + M) lectura del top M.
2. **studentMetrics en Redis Hash** para evitar `.save()` sobre el doc User en cada `endPlay` y permitir lecturas masivas de profesor sin costar query Mongo por estudiante.

Ambas estructuras requieren un job BullMQ nocturno de reconciliación con Mongo para corregir drift (eventually consistent).

**Sub-tareas:**

**Fase A — Leaderboards ZSET (ex PROP-60):**

1. Estructura Redis:
   - `leaderboard:context:score:<teacherId>:<timeRange>` → ZSET (score = sumScoreByContext, member = contextId)
   - `leaderboard:context:plays:<teacherId>:<timeRange>` → ZSET (score = playCountByContext)
   - `leaderboard:mechanic:score:<teacherId>:<timeRange>`, `leaderboard:mechanic:plays:<teacherId>:<timeRange>`
   - `leaderboard:student:score:<teacherId>:<timeRange>` (futura expansión)
2. En `endPlay`: `redis.zincrby(key, playScore, contextId)` + `redis.zincrby(playsKey, 1, contextId)`. Lectura: `ZREVRANGEBYSCORE key +inf -inf WITHSCORES LIMIT 0 N`.
3. TTLs: 8 días por key (una ventana >7d). Para timeRanges dinámicos, pre-calcular buckets diarios y sumar al leer.
4. Invalidación: TTL + recálculo nocturno por job BullMQ para reconciliar con Mongo y corregir drift.
5. Tests: `tests/leaderboardZset.test.js` — insertar 100 plays mock, verificar que el top coincide con la agregación Mongo sobre los mismos datos.

**Fase B — studentMetrics Hash (ex PROP-63):**

6. Estructura Redis: `student:metrics:<studentId>` → Hash: `{ totalGamesPlayed, totalCorrectAttempts, totalAttempts, sumScores, count, lastUpdated, maxSequenceLengthAchieved (T-921), ... }`.
7. Pseudocódigo en endPlay: `redis.hincrby(...):totalGamesPlayed 1`, `redis.hincrby(...sumScores, score)`, etc. `avgScore` calculado en lectura.
8. TTL: sin TTL (datos persistentes). Reconciliados con Mongo en job nocturno (Fase C).
9. Invalidación: reconciliación nocturna: leer GamePlay del día, recalcular agregados, escribir en Mongo + Redis como source of truth.
10. Tests: `tests/studentMetricsMaterialized.test.js` — 10 plays en sucesión, verificar que agregados Redis coinciden con cálculo directo Mongo.

**Fase C — Reconciliación nocturna:**

11. BullMQ job `analytics-reconcile-nightly` que cada noche:
    - Recalcula todos los leaderboards desde Mongo y los escribe en Redis (TTL fresco).
    - Recalcula studentMetrics de estudiantes activos.
    - Reporta drift detectado (logs + Sentry warning si > 5%).

**Consideración GDPR:** al eliminar estudiante (Art. 17), purgar `student:metrics:<studentId>` y entradas en leaderboards de students. Integrar con `dataExportService` y `dataRetentionService`.

**Criterios de Aceptación:**

- [ ] ZSETs `leaderboard:*` actualizados en cada `endPlay`
- [ ] Lectura de top contextos/mecánicas usa ZSETs con fallback a Mongo si miss
- [ ] Hash `student:metrics:*` actualizado en cada `endPlay`
- [ ] Lectura de `studentMetrics` lee de Redis Hash con fallback a Mongo
- [ ] Job nocturno reconcilia y reporta drift
- [ ] Borrado GDPR purga keys Redis del estudiante
- [ ] Tests verifican consistencia entre Redis y Mongo
- [ ] `npm test` pasa en backend

**ADR:** ADR-106 (Materialización Redis: Leaderboards ZSET y studentMetrics Hash).

**Archivos afectados:** `backend/src/services/analyticsService.js`, `backend/src/services/gameEngine/endPlay.js`, `backend/src/jobs/analyticsReconcileJob.js` (nuevo), `backend/src/services/dataExportService.js`, `backend/src/services/dataRetentionService.js`, tests asociados.

---

### T-942: 📊 Vista cruzada Mecánica × Contexto + Dashboard admin global + Informes funcional 📋

**Consolida:** PROP-10 + PROP-82 + PROP-91
**Prioridad:** P2 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-941 (alertas con lifecycle)
**Origen:** Tres carencias del área analytics: matriz Mecánica × Contexto inexistente, super_admin ve dashboard de profesor (todo a 0), zona Informes con form solo y 70% del viewport vacío

**Descripción:**
Tres ampliaciones del área analytics que aportan valor pedagógico real:

1. Matriz cruzada Mecánica × Contexto con drill-down (PROP-10): permite ver "qué tal funciona Asociación en Geografía frente a Memoria en Geografía", potente pedagógicamente.
2. Dashboard admin global (PROP-82): el super_admin debe ver KPIs agregados del centro, no la vista vacía del profesor.
3. Informes como zona funcional (PROP-91): rellenar la zona inferior del viewport con informes recientes, ilustración del informe seleccionado y plantillas predefinidas.

**Sub-tareas:**

**Fase A — Vista cruzada (ex PROP-10):**

1. Backend: refactorizar `/api/analytics/classroom/content-effectiveness` para soportar `groupBy: 'cross'` con pipeline que agrupa por `{mechanicId, contextId}`.
2. Frontend: nuevo componente `CrossMatrix.jsx` con tabla con scroll horizontal, celdas RAG y drill-down (click → filtra detalle).
3. Permitir filtros (solo mecánica X, solo contexto Y) sobre la matriz.

**Fase B — Dashboard admin global (ex PROP-82):**

4. Nuevo endpoint `/api/admin/analytics/overview` que agrega por tenancy sin filtrar por `teacherId`: alumnos totales, profesores activos, partidas agregadas, mazos totales, sesiones, alertas críticas del centro.
5. Reusar componentes de Dashboard pero con datasets agregados cuando `role === 'super_admin'`.
6. Considerar filtros por profesor/aula para drill-down.

**Fase C — Informes funcional (ex PROP-91):**

7. Sección "Informes recientes" con lista de informes generados en las últimas 2 semanas (persistidos en Mongo con `generatedAt`, `reportType`, `period`).
8. Ilustración o mini-preview del tipo de informe seleccionado que se actualiza según los dropdowns.
9. CTA "Ver ejemplo" que abre un informe seed del mazo actual.
10. Plantillas predefinidas ("Fin de trimestre", "Padres", "Claustro") que rellenan los 3 dropdowns de una.
11. Modelo Mongoose `ReportTemplate` y `GeneratedReport` (persistencia mínima).

**Criterios de Aceptación:**

- [ ] Endpoint `content-effectiveness?groupBy=cross` devuelve matriz mecánica × contexto
- [ ] `CrossMatrix.jsx` muestra matriz con celdas RAG y drill-down
- [ ] Endpoint `/api/admin/analytics/overview` accesible solo por super_admin
- [ ] Dashboard del super_admin muestra KPIs agregados del centro
- [ ] Zona Informes ocupa el viewport con secciones útiles
- [ ] Plantillas predefinidas funcionan (rellenan dropdowns con un click)
- [ ] Informes recientes persistidos y listables
- [ ] Tests pasando

**Archivos afectados:** `backend/src/services/analyticsService.js`, `backend/src/controllers/analyticsController.js`, `backend/src/controllers/adminController.js`, `backend/src/routes/admin.js`, `backend/src/models/ReportTemplate.js` (nuevo), `backend/src/models/GeneratedReport.js` (nuevo), `frontend/src/components/analytics/CrossMatrix.jsx` (nuevo), `frontend/src/pages/Dashboard.jsx`, `frontend/src/pages/admin/AdminDashboard.jsx` (nuevo o ampliado), `frontend/src/pages/Insights.jsx` (Informes).

---

### T-951: ⚛️ Tema claro/oscuro + atajos de teclado globales + onboarding interactivo 📋

**Consolida:** PROP-4 + PROP-9 + PROP-13 + PROP-17 + PROP-68
**Prioridad:** P2 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** App solo dark, atajos de teclado inexistentes, onboarding actual es informativo no guiado

**Descripción:**
Tres sistemas de personalización y productividad para el profesor:

1. Sistema de tema claro/oscuro con `ThemeContext` (CSS vars OKLCH ya facilitan el cambio, falta toggle + persistencia).
2. Atajos de teclado globales (`g+s`, `g+d`, `?`, `n`, `/`) con overlay de ayuda y respeto a inputs activos.
3. Onboarding interactivo (tour con highlights sobre la UI real) en lugar del modal informativo actual.

**Sub-tareas:**

**Fase A — Tema claro (ex PROP-4 + PROP-9):**

1. Variables CSS para tema claro en `index.css` (ya usa OKLCH, solo añadir nuevos valores).
2. `ThemeContext` con persistencia en `localStorage`.
3. Toggle en sidebar (junto al de animaciones).
4. Transición suave entre temas (CSS `transition: background-color 200ms`).
5. Documentar pares de colores accesibles para cada tema. Evaluar variante de alto contraste (modo "infantil" con saturados).

**Fase B — Atajos de teclado (ex PROP-17 + PROP-68):**

6. Hook `useKeyboardShortcuts` con lista global.
7. Atajos: `g + s` → Sesiones, `g + d` → Dashboard, `g + a` → Analytics, `g + m` → Mazos, `?` → overlay de ayuda, `n` → "Nueva Sesión", `/` → enfocar búsqueda.
8. Respeto a inputs/textareas activos (no disparar atajos ahí).
9. Mini-overlay accesible desde `?` con lista de atajos documentada.
10. Test que verifique que los atajos no disparan en inputs.

**Fase C — Onboarding interactivo (ex PROP-13):**

11. Reutilizar el modal existente como step 0.
12. Añadir tour superpuesto con `react-joyride` (o equivalente CSS-only sin lib externa, evaluar bundle size) para los pasos 1-3 (visitar Sesiones, crear primera sesión, ver analytics).
13. Persistir progreso en `localStorage` + backend (`profile.onboardingProgress`).
14. Mascota guía si T-953 (mascota ampliada) entrega antes.

**Criterios de Aceptación:**

- [ ] Toggle tema claro/oscuro funcional en sidebar
- [ ] Persistencia en localStorage
- [ ] Pares de colores accesibles para ambos temas
- [ ] 6+ atajos globales funcionando con overlay de ayuda accesible vía `?`
- [ ] Atajos no se disparan dentro de inputs
- [ ] Tour interactivo con react-joyride (o equivalente) cubre 3 pasos clave
- [ ] Progreso persistido (localStorage + backend)
- [ ] `npm test` y `npm run build` pasan

**Archivos afectados:** `frontend/src/index.css` (variables tema claro), `frontend/src/context/ThemeContext.jsx` (nuevo), `frontend/src/hooks/useKeyboardShortcuts.js` (nuevo), `frontend/src/components/ui/KeyboardShortcutsOverlay.jsx` (nuevo), `frontend/src/components/onboarding/OnboardingTour.jsx` (nuevo), `frontend/src/components/layout/AppLayout.jsx`, `backend/src/models/User.js` (campo `profile.onboardingProgress`).

---

### T-952: ⚛️ Auditoría AnimatePresence + paginación/virtualización + inline editing 📋

**Consolida:** PROP-18 + PROP-65 + PROP-69
**Prioridad:** P2 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** AnimatePresence con motion.div atascados en exit (QA 18/04), listados grandes sin paginación, edición de nombre requiere ir al detalle

**Descripción:**
Tres mejoras transversales de UX en listados y transiciones:

1. Auditoría completa de `AnimatePresence` y `motion.div` con `key` dinámica (incompatibilidades Framer Motion + React 19 StrictMode).
2. Paginación y virtualización en listados grandes (`SessionsPage`, `StudentManagement`) con `usePaginatedList` reutilizable y opción virtualización para 1000+ filas.
3. Inline editing de nombres (DeckCard, SessionCard) con debounce + autosave + spinner.

**Sub-tareas:**

**Fase A — Auditoría AnimatePresence (ex PROP-18):**

1. Auditar todas las ocurrencias de `AnimatePresence` y `motion.div` con `key` dinámica.
2. Probar cada una con y sin `prefers-reduced-motion`.
3. Migrar a patrones sugeridos por el equipo de Motion (modo `popLayout`, `LayoutGroup`, `useIsPresent`) donde aplique.
4. Plan de tests visuales o Playwright que detecten la regresión automáticamente.

**Fase B — Paginación y virtualización (ex PROP-65):**

5. Backend: verificar que los endpoints de students/sessions soportan `page`/`limit` (sessions ya lo hace parcialmente).
6. Frontend: hook `usePaginatedList` reutilizable.
7. Opción A: paginación clásica (número de página + controles).
8. Opción B: virtualización con `react-window` o `@tanstack/react-virtual` para 1000+ filas.
9. Integrar en `StudentManagement` (prioritario, super_admin centro) y `SessionsPage`.

**Fase C — Inline editing (ex PROP-69):**

10. Hook `useInlineEdit({ value, onSave, validate })`.
11. Componente `<InlineEditableText>` que acepta trigger ("click text" o "click pencil").
12. Integrar en `DeckCard.name` y `SessionCard.name`.
13. Autosave debounced a 800ms con toast de confirmación.

**Criterios de Aceptación:**

- [ ] Cero AnimatePresence con `motion.div` atascados en exit en QA visual
- [ ] `usePaginatedList` reutilizable y aplicado en StudentManagement + SessionsPage
- [ ] Virtualización funciona con 1000+ filas sintéticas
- [ ] Inline editing en DeckCard y SessionCard con debounce + autosave + toast
- [ ] Tests pasando

**Archivos afectados:** `frontend/src/components/layout/AppLayout.jsx`, `frontend/src/pages/SessionsPage.jsx`, `frontend/src/pages/admin/StudentManagement.jsx`, `frontend/src/hooks/usePaginatedList.js` (nuevo), `frontend/src/hooks/useInlineEdit.js` (nuevo), `frontend/src/components/ui/InlineEditableText.jsx` (nuevo), `frontend/src/components/dashboard/DeckCard.jsx`, `frontend/src/components/dashboard/SessionCard.jsx`, varios componentes con AnimatePresence.

---

### T-955: ⚛️ Notificaciones tiempo real + inline success badges 📋

**Consolida:** PROP-1 + PROP-76
**Prioridad:** P2 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** Sin notificaciones tiempo real el profesor refresca la página para ver cambios; toast aparece lejos del punto de acción

**Descripción:**
Dos sistemas de feedback en tiempo real:

1. Sistema de notificaciones push (Socket.IO ya desplegado): NotificationBell en sidebar, persistencia en Mongo, panel dropdown con historial leídas/no leídas.
2. Inline success badges micro: tras acción exitosa (crear, guardar, duplicar) un micro-check "✓ Guardado" aparece al lado del botón disparador y desaparece en 2s. Complementario al toast Sonner (que sigue para errores y destructivos).

**Sub-tareas:**

**Fase A — Notificaciones tiempo real (ex PROP-1):**

1. Componente `NotificationBell.jsx` en el header del sidebar.
2. Backend: emitir eventos Socket.IO `notification:created` para cada acción relevante (estudiante completa partida, registro aprobado, alerta crítica).
3. Modelo Mongoose `Notification` con `userId`, `type`, `title`, `body`, `link`, `read: bool`, `createdAt`.
4. Endpoints: `GET /api/notifications`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/mark-all-read`.
5. Panel dropdown con historial paginado (últimas 20).
6. Badge con contador de no-leídas en el bell.

**Fase B — Inline success badges (ex PROP-76):**

7. Hook `useInlineSuccess({ onTrigger, duration = 2000 })` que expone `isVisible` y handlers.
8. Componente `<InlineSuccessBadge visible={...} label="Guardado" />` absolute-positioned al lado del botón trigger.
9. Integrar en botones de "Guardar" de formularios (`CreateSession`, `DeckEdit`, `ContextoForm`...).
10. No desplazar a otros toasts (mantener Sonner para errores).

**Criterios de Aceptación:**

- [ ] NotificationBell visible en sidebar con contador de no-leídas
- [ ] Notificaciones llegan en tiempo real vía Socket.IO
- [ ] Persistencia en Mongo con CRUD de read/unread
- [ ] Panel dropdown con paginación e historial
- [ ] InlineSuccessBadge integrado en 5+ formularios principales
- [ ] Tests pasando

**Archivos afectados:** `frontend/src/components/notifications/NotificationBell.jsx` (nuevo), `frontend/src/components/ui/InlineSuccessBadge.jsx` (nuevo), `frontend/src/hooks/useInlineSuccess.js` (nuevo), `backend/src/models/Notification.js` (nuevo), `backend/src/services/notificationService.js` (nuevo), `backend/src/controllers/notificationController.js` (nuevo), `backend/src/routes/notifications.js` (nuevo), `backend/src/realtime/socketHandlers.js`, `frontend/src/pages/CreateSession.jsx`, `frontend/src/pages/DeckEditPage.jsx`, `frontend/src/components/contexts/ContextoForm.jsx`.

---

### T-957: ⚛️ Logout con confirmación + undo (toast persistente) 📋

**Consolida:** PROP-93
**Prioridad:** P2 | **Tamaño:** S-M (2-4h) | **Dependencias:** Ninguna
**Origen:** Click accidental en "Cerrar Sesión" sin red de seguridad — refinamiento sobre el ConfirmationModal de PROP-85 (ya implementado en Sprint 5)

**Descripción:**
UX moderna: el click logout cierra sesión inmediatamente pero un toast persistente durante 5s muestra "Sesión cerrada. [Deshacer]". Si el usuario pulsa deshacer antes de 5s, se re-autentica con el refresh token que todavía está válido. Más fluido que el modal y conserva la red de seguridad.

**Sub-tareas:**

1. `toast.success` persistente con action `Deshacer` (Sonner soporta este patrón).
2. Logout diferido: borrar access token en memoria pero conservar refresh 5s más antes de invalidarlo en backend; si el usuario pulsa deshacer, re-crear sesión desde refresh token.
3. Backend: endpoint `POST /api/auth/logout` con flag `defer_invalidation_ms` (default 5000) que retrasa la invalidación del refresh.
4. Test concurrency: refrescar pestaña durante los 5s no debe desloguear.

**Criterios de Aceptación:**

- [ ] Click logout → toast persistente con "Deshacer" durante 5s
- [ ] Pulsar "Deshacer" antes de 5s → sesión recuperada sin pedir credenciales
- [ ] Tras 5s sin acción → refresh token invalidado en backend, logout completo
- [ ] Refresh de pestaña durante los 5s no desloguea
- [ ] Tests pasando (frontend + backend)

**Archivos afectados:** `frontend/src/components/auth/LogoutButton.jsx` o equivalente, `frontend/src/services/authService.js`, `backend/src/controllers/authController.js`, `backend/src/services/authService.js`, tests asociados.

---

### T-959: ⚛️ Polish flujos críticos profesor + área admin + extras (print stylesheet + sonidos gameplay + microcopy review) 📋

**Consolida:** polish dedicado de zonas de la app que han recibido fixes puntuales pero no pasada de pulido sistemática
**Prioridad:** P2 | **Tamaño:** XL (~4-5 días) | **Dependencias:** T-953 (mascota ampliada y feedback emocional disponibles para reuso), T-922 (SequenceBoard ya existe)
**Origen:** Wizards y detalles del profesor han recibido fixes puntuales pero sin pasada dedicada; área super_admin es la zona más descuidada (solo el dashboard global de T-942 está planeado); informes (T-942 fase C) sin estilos de impresión; gameplay con audio infrautilizado pese a tener assets en Supabase Storage; microcopy con variaciones tras 3 pasadas masivas de tildes que evidencian reglas pero no revisión de voz/tono

**Descripción:**
Cinco frentes de pulido agrupados por afinidad temática, todos con foco en elevar la percepción del producto en la entrega final del TFG:

1. **Wizards y detalles del profesor**: pulido de los flujos críticos que más usa el profesor (`DeckCreationWizard`, `CreateSession`, `SessionEdit`, `SessionDetail`, `CardDeckDetailPage`).
2. **Área admin (super_admin)**: polish de las páginas de administración (`AdminUsers`, `AdminContexts`, `AdminMechanics`, etc.) que son la zona más descuidada, complementando el dashboard global de T-942.
3. **Gameplay desde la lente niños 4-8 años**: tap targets, feedback inmediato, lenguaje sencillo y sonidos sutiles aprovechando los assets de audio ya existentes.
4. **Print stylesheet para informes**: estilos `@media print` para `Insights` (T-942 fase C) y para los informes generados.
5. **Microcopy review**: pase de copy con foco docente (mensajes de error accionables, CTAs con verbos directos, tooltips útiles, tono uniforme).

**Sub-tareas:**

**Fase A — Wizards y detalles del profesor:**

1. `DeckCreationWizard`: revisión paso-a-paso (configurar contexto, agregar cartas escaneadas, asignar valores, revisar). Espacio negativo, transiciones entre steps, microinteracciones de "carta escaneada" — la mascota de T-953 podría reaccionar.
2. `CreateSession` y `SessionEdit`: idem, con foco en la fase de configuración de mecánica (Asociación / Memoria / Secuencia adaptativa post-T-922).
3. `SessionDetail`: jerarquía visual de la información, accesos rápidos (jugar, clonar, editar, eliminar) con prioridad clara.
4. `CardDeckDetailPage`: rejilla de cartas, mejor visualización de UIDs (alineación, font monoespaciada para UID, hover info con metadata).

**Fase B — Área admin (super_admin):**

5. `AdminUsers`: tabla de usuarios con filtros por rol/estado, acciones contextuales, modal de edición pulido.
6. `AdminContexts`: rejilla de contextos del centro, polish de la card de contexto (consistente con la del profesor).
7. `AdminMechanics`: gestión de mecánicas (visibility, orden, etc.), polish.
8. Coherencia entre todas las páginas admin (header, breadcrumb, layout, paginación si aplica desde T-952).

**Fase C — Gameplay desde la lente niños 4-8 años:**

9. Verificar tap targets ≥ 44×44px en `MemoryBoard`, `FallbackTouchPanel`, `SequenceBoard` (T-922).
10. Feedback inmediato: cada tap/scan da feedback visual en < 100ms (visual ack antes de que el backend responda).
11. Lenguaje sencillo en mensajes de gameplay (verificar que no hay tecnicismos ni vocabulario adulto).
12. Sonidos sutiles aprovechando assets ya en Supabase Storage:
    - Acierto: tono ascendente corto (puede reusar audio del contexto si existe).
    - Error: tono descendente corto.
    - Pausa/resume: click discreto.
    - GameOver según estrellas: 3 variantes (1 estrella sonido neutro, 2 estrellas alegre, 3 estrellas celebratorio).
13. Volumen configurable en settings con persistencia localStorage. Coordinarse con `prefers-reduced-motion` ya respetado y con el estándar emergente `prefers-reduced-sound` (silenciar sonidos si activo).

**Fase D — Print stylesheet:**

14. Estilos `@media print` en `frontend/src/index.css` para:
    - Página de informe generado (T-942): layout vertical A4, sin sidebar, sin botones, headers limpios, tabla de datos legible.
    - Página de privacidad: tipografía legible, sin elementos decorativos.
15. Test manual: imprimir a PDF desde Chrome y verificar layout en A4.

**Fase E — Microcopy review:**

16. Inventario de mensajes de error de la app (en `validators` y `errors` del backend, plus equivalente frontend).
17. Inventario de CTAs (botones primarios y secundarios) en formularios principales.
18. Inventario de tooltips y empty state messages.
19. Pase de revisión: verbos accionables ("Crear sesión" no "Crear"), errores claros y útiles ("La fecha de inicio no puede ser anterior a hoy" no "Fecha inválida"), tooltips que expliquen qué hace el botón (no decorativos).
20. Tono uniforme: docente, claro, sin tecnicismos. Documentar guía en `documentation/Microcopy_Style_Guide.md` con ejemplos de "antes/después".

**Criterios de Aceptación:**

- [ ] Wizards de mazo y sesión pulidos con transiciones coherentes y microinteracciones (mascota T-953 integrada donde aplique)
- [ ] `SessionDetail` y `CardDeckDetailPage` con jerarquía visual y accesos rápidos pulidos
- [ ] Páginas admin con coherencia entre sí (header, breadcrumb, layout, paginación)
- [ ] Tap targets gameplay ≥ 44×44px en las 3 mecánicas
- [ ] Feedback visual de tap/scan en < 100ms antes de respuesta backend
- [ ] 4 sonidos de gameplay aplicados (acierto, error, pausa/resume, GameOver con 3 variantes según estrellas)
- [ ] Volumen configurable en settings con persistencia
- [ ] `prefers-reduced-sound` respetado (silencia sonidos)
- [ ] `@media print` para informes con layout A4 limpio (verificado imprimir a PDF)
- [ ] 50+ mensajes de error/CTA/tooltip revisados con tono docente uniforme
- [ ] `Microcopy_Style_Guide.md` documenta la guía de voz/tono con ejemplos
- [ ] `npm test` y `npm run build` pasan
- [ ] Verificación visual desktop ≥1024px y tablet ≥768px

**Archivos afectados:** `frontend/src/pages/DeckCreationWizard.jsx`, `frontend/src/pages/CreateSession.jsx`, `frontend/src/pages/SessionEdit.jsx`, `frontend/src/pages/SessionDetail.jsx`, `frontend/src/pages/CardDeckDetailPage.jsx`, `frontend/src/pages/admin/AdminUsers.jsx`, `frontend/src/pages/admin/AdminContexts.jsx`, `frontend/src/pages/admin/AdminMechanics.jsx`, `frontend/src/components/game/MemoryBoard.jsx`, `frontend/src/components/game/FallbackTouchPanel.jsx`, `frontend/src/components/game/SequenceBoard.jsx`, `frontend/src/services/audioService.js` (nuevo), `frontend/src/index.css` (print styles), `documentation/Microcopy_Style_Guide.md` (nuevo).

---

## P3 — Prioridad Baja

### T-954: ⚛️ Atmósferas dinámicas por contexto + hero transitions + navegación direccional + scroll parallax 📋

**Consolida:** PROP-16 + PROP-71 + PROP-72 + PROP-73 + PROP-75
**Prioridad:** P3 | **Tamaño:** XL (> 2 días) | **Dependencias:** T-953 (signature visual base)
**Origen:** Cinco mejoras de motion signature que aprovechan el `resolveContextGlow` de ADR-070 y `useScroll` ya importado pero no usado

**Descripción:**
Paquete de motion signature ampliada que continúa la línea "Tactile RFID + Paper" (ADR-070):

1. Atmósferas dinámicas por contexto (PROP-16/PROP-75): cuando el profesor entra en sesión de "Geografía", toda la aurora del fondo adopta tintes geography (cyan), iconos del header se tintan, botones primarios heredan el tint.
2. Shared element transition DeckCard → CardDeckDetailPage (PROP-71): hero transition con `layoutId` de Framer Motion.
3. Navegación direccional (PROP-72): hook `useNavigationDirection` que detecta pop vs push, AppLayout aplica exit animation direccional.
4. Scroll-linked parallax (PROP-73): `useScroll` + `useTransform` sobre el aurora background, ya hay scaffolding sin uso real.

**Sub-tareas:**

**Fase A — Atmósferas dinámicas (ex PROP-16 + PROP-75):**

1. `ThemeContext` con scope por contexto activo (composición con T-951 si aplica).
2. CSS vars scoped (ej: `--color-atmosphere-primary` que cambia según contexto).
3. Aplicar en AppLayout aurora background + PageHeader icono + ButtonPremium variant primary.
4. Persistir el contexto activo por sesión/route.

**Fase B — Hero transition DeckCard (ex PROP-71):**

5. Plumbing del router para no desmontar el DOM durante la transición.
6. Coordinar `layoutId="deck-<id>"` entre grid (DeckCard) y página de detalle.
7. Evaluar rendimiento con 50+ decks (AnimatePresence `mode="popLayout"` en la ruta, tests aparte porque hay incompatibilidad conocida con jsdom).

**Fase C — Navegación direccional (ex PROP-72):**

8. Hook `useNavigationDirection.js` con `useNavigationType()` de react-router 7.
9. Propagar direction a AppLayout como context o prop.
10. Variantes de transición direccional en `lib/utils.js`: `x: +100vw` en pop, `x: -100vw` en push.
11. Respetar `prefers-reduced-motion` (sin dirección, solo fade).

**Fase D — Scroll parallax (ex PROP-73):**

12. Detectar cuando el overflow del main es significativo.
13. Aplicar `useTransform(scrollY, [0, 800], [0, -60])` a los orbes de aurora.
14. Respetar `prefers-reduced-motion` (sin parallax).

**Criterios de Aceptación:**

- [ ] Atmósferas dinámicas por contexto activo (aurora + header + botones)
- [ ] Hero transition entre DeckCard y CardDeckDetailPage funcional
- [ ] Navegación direccional (forward/backward) aplicada con respeto a reduced-motion
- [ ] Parallax de aurora aplicado en páginas con scroll significativo
- [ ] Verificación visual desktop + tablet
- [ ] Tests pasando

**ADR:** ADR-107 (Motion signature ampliada: atmósferas + hero + dirección + parallax).

**Archivos afectados:** `frontend/src/context/ThemeContext.jsx` (extensión de T-951), `frontend/src/hooks/useNavigationDirection.js` (nuevo), `frontend/src/components/layout/AppLayout.jsx`, `frontend/src/pages/CardDeckDetailPage.jsx`, `frontend/src/components/dashboard/DeckCard.jsx`, `frontend/src/lib/utils.js`, `frontend/src/index.css`.

---

### T-956: ⚛️ Modo demo profesor (sin RFID) + Export/Import sesiones y mazos 📋

**Consolida:** PROP-2 + PROP-6 + PROP-11
**Prioridad:** P3 | **Tamaño:** XL (> 2 días) | **Dependencias:** Ninguna
**Origen:** Profesor sin lector RFID no puede validar sesiones; sin export/import no hay colaboración entre profesores

**Descripción:**
Dos features de productividad para el profesor que extienden el alcance de la plataforma:

1. Modo demo / vista previa de partida sin RFID (PROP-2 + PROP-11): permite simular una partida completa con tarjetas virtuales clicables. UI dedicada (no fallback de emergencia), pensada para preview con visual diferenciado.
2. Export/Import de sesiones y mazos (PROP-6): JSON descargable, importable en otra cuenta o instancia, con resolución de conflictos (contextos/assets referenciados).

**Sub-tareas:**

**Fase A — Modo demo (ex PROP-2 + PROP-11):**

1. Botón "Modo Demo" en `SessionDetail`.
2. Reutilizar componentes de GameSession con un mock de WebSerialService.
3. UI distinta: banner "Modo Demo — sin hardware RFID", tarjetas virtuales clicables que simulan un escaneo.
4. Backend: marca el GamePlay con flag `isDemo: true` para que no contamine analytics reales.
5. Visual diferenciado del FallbackTouchPanel (que sigue siendo "fallback de emergencia" para sesiones reales sin sensor).

**Fase B — Export/Import (ex PROP-6):**

6. Backend: endpoints `GET /api/decks/:id/export` y `POST /api/decks/import`.
7. Backend: endpoints `GET /api/sessions/:id/export` y `POST /api/sessions/import`.
8. Frontend: botón "Exportar" en deck/session detail, botón "Importar" en list pages.
9. Validación de formato al importar (Zod schema dedicado).
10. Resolución de conflictos:
    - Contextos: si referenciado no existe, error con sugerencia de crear.
    - Assets: si referenciado no existe, importar con asset placeholder y aviso.

**Criterios de Aceptación:**

- [ ] Botón "Modo Demo" en SessionDetail abre partida virtual con tarjetas clicables
- [ ] GamePlay del demo tiene `isDemo: true` y no contamina analytics
- [ ] Visual diferenciado del FallbackTouchPanel
- [ ] Export de deck y session genera JSON descargable
- [ ] Import valida formato y resuelve conflictos con mensajes claros
- [ ] Tests pasando

**Archivos afectados:** `frontend/src/pages/SessionDetail.jsx`, `frontend/src/pages/CardDeckDetailPage.jsx`, `frontend/src/pages/CardDecksPage.jsx`, `frontend/src/pages/SessionsPage.jsx`, `frontend/src/services/webSerialMock.js` (nuevo), `frontend/src/components/game/DemoBanner.jsx` (nuevo), `backend/src/controllers/cardDeckController.js`, `backend/src/controllers/gameSessionController.js`, `backend/src/services/exportImportService.js` (nuevo), `backend/src/routes/decks.js`, `backend/src/routes/sessions.js`.

---

## Dependencias entre Tareas

```
═══════════════════════════════════════════════════════════════
                    ☁️ RELEASE CLOUD v1.0.0
═══════════════════════════════════════════════════════════════

T-901 (cloud scaffolding + Atlas + Upstash + secrets + staging)
  ├──► T-902 (hardening: probes + shutdown + WS + Mongoose pool)
  ├──► T-903 (CD pipeline) ◄──── T-902
  ├──► T-904 (observabilidad: Sentry + log shipping + alerting)
  ├──► T-905 (seguridad prod: CSP + rate limits + ZAP + MFA)
  ├──► T-906 (backup + DR + restore-e2e)
  ├──► T-907 (performance: Cloudflare + bundle + multi-instance + budget)
  ├──► T-908 (testing: E2E + load + chaos)  ◄──── T-902, T-905
  └──► T-910 (housekeeping: free tier + deprecar Docker + warming) ◄──── T-904

T-903 ──► T-909 (docs v1.0.0: README + runbook + OpenAPI + CHANGELOG)

═══════════════════════════════════════════════════════════════
                    🎮 MECÁNICA SECUENCIA
═══════════════════════════════════════════════════════════════

T-921 (backend secuencia) ──► T-922 (frontend secuencia + analytics)
                                └──► T-923 (auditoría integral analytics)
                                       └──► T-941 (alertas Secuencia)
                                       └──► T-942 (CrossMatrix con eje Secuencia)
                                       └──► T-931 (studentMetrics Hash con campos Secuencia)

T-922 ──► T-908 (E2E debe cubrir las 3 mecánicas)
T-923 ──► T-943 (cobertura debe incluir tests Secuencia + analytics auditados)

═══════════════════════════════════════════════════════════════
                    🔧 REDIS AVANZADO
═══════════════════════════════════════════════════════════════

T-901 ──► T-931 (Leaderboards ZSET + studentMetrics Hash + reconciliación)

═══════════════════════════════════════════════════════════════
                    📊 ANALYTICS & ALERTAS
═══════════════════════════════════════════════════════════════

T-901 (BullMQ ya operativo) ──► T-941 (alertas con ciclo de vida)
                                  └──► T-942 (cross matrix + admin global + informes)

T-943 (cobertura SonarCloud) — independiente

═══════════════════════════════════════════════════════════════
                    ⚛️ UI/UX & MOTION SIGNATURE
═══════════════════════════════════════════════════════════════

T-953 (charts theme + mascota + GameOver) — independiente

T-953 ──► T-954 (motion signature ampliada: atmósferas + hero + dirección + parallax)
T-953 ──► T-951 (onboarding usa mascota si T-953 entrega antes)
T-953 ──► T-959 (polish flujos críticos reusa mascota en wizards)

T-951 (tema + atajos + onboarding) — independiente
T-952 (animatepresence + paginación + inline editing) — independiente
T-955 (notificaciones + inline success) — independiente
T-957 (logout undo) — independiente
T-956 (modo demo + export/import) — independiente

T-951, T-952, T-953, T-954 ──► T-958 (audit final coherencia + WCAG + responsive tablet,
                                       requiere todas las piezas integradas)
T-922, T-953 ──► T-959 (polish flujos críticos + admin + extras)

═══════════════════════════════════════════════════════════════
              DEPENDENCIAS CRUZADAS (Cross-area)
═══════════════════════════════════════════════════════════════

T-901 (Atlas + Upstash) ──► T-921 (mecánica secuencia escribe en Redis)
T-921/T-922 (secuencia) ──► T-908 (suite E2E) y T-943 (cobertura)
T-941 (alertas con lifecycle) ──► T-942 (admin global lee alertas críticas)
T-901 (Cloudflare/CDN) ──► T-907 (performance: Cloudflare rules)
```

### Rutas Críticas

```
Release v1.0.0:  T-901 (XL) → T-902 (L) → T-903 (XL) → T-908 (XL) → tag v1.0.0
Mecánica:        T-921 (XL) → T-922 (L) → T-923 (L)
Analytics:       T-941 (XL) → T-942 (XL)
UI/UX signature: T-953 (XL) → T-954 (XL) → T-958 (L-XL)
UI/UX polish:    T-959 (XL) — paralelo a T-958, ambos cierran calidad UI antes del corte
```

La **ruta crítica del sprint es la cadena T-901 → T-902 → T-903 → T-908**: sin ese tramo no hay deploy automatizado en cloud y por tanto no hay v1.0.0. Las cadenas Mecánica, Analytics y UI/UX pueden ejecutarse en paralelo. La cadena **T-921 → T-922 → T-923** (mecánica Secuencia + auditoría analytics) es la siguiente en criticidad porque cierra el alcance gameplay del TFG. **T-958 (audit final coherencia + WCAG + responsive)** es la última tarea UI/UX: requiere que todas las piezas del bloque E hayan tocado tierra antes y produce evidencia formal de calidad para la memoria.

---

## Métricas del Sprint

### Por Prioridad

| Prioridad | Tareas | Esfuerzo estimado |
|---|---|---|
| **P0 (Crítica/Bloqueante v1.0.0)** | 13 tareas (T-901~T-910, T-921, T-922, T-923) | ~32-43 días |
| **P1 (Alta)** | 4 tareas (T-941, T-943, T-953, T-958) | ~8-12 días |
| **P2 (Media)** | 7 tareas (T-931, T-942, T-951, T-952, T-955, T-957, T-959) | ~16-23 días |
| **P3 (Baja)** | 2 tareas (T-954, T-956) | ~4-6 días |
| **Total** | **26 tareas** | **~60-84 días** |

### Por Área

| Área | Tareas | % esfuerzo |
|---|---|---|
| ☁️ Release Cloud v1.0.0 | T-901~T-910 (10 tareas) | ~44% |
| 🎮 Mecánica Secuencia | T-921, T-922, T-923 (3 tareas) | ~11% |
| 🔧 Backend / Redis | T-931 (1 tarea) | ~5% |
| 📊 Analytics & Alertas | T-941, T-942, T-943 (3 tareas) | ~14% |
| ⚛️ UI/UX & Motion Signature | T-951~T-959 (9 tareas) | ~26% |

### Tabla de Consolidación (Trazabilidad propuestas → tareas)

| Tarea | Propuestas absorbidas |
|---|---|
| **T-901** | PROP-95 + PROP-96 + PROP-97 + PROP-98 + PROP-99 |
| **T-902** | PROP-100 + PROP-101 + PROP-102 + PROP-103 |
| **T-903** | PROP-104 + PROP-105 + PROP-106 + PROP-107 + PROP-108 |
| **T-904** | PROP-109 + PROP-110 + PROP-111 + PROP-112 |
| **T-905** | PROP-113 + PROP-114 + PROP-115 + PROP-116 |
| **T-906** | PROP-117 + PROP-118 + PROP-119 |
| **T-907** | PROP-120 + PROP-121 + PROP-122 + PROP-123 |
| **T-908** | PROP-124 + PROP-125 + PROP-126 |
| **T-909** | PROP-127 + PROP-128 + PROP-129 + PROP-130 |
| **T-910** | PROP-131 + PROP-132 + PROP-133 |
| **T-921** | (nueva — Mecánica Secuencia backend) |
| **T-922** | (nueva — Mecánica Secuencia frontend + analytics) |
| **T-923** | (nueva — Auditoría integral analytics post-Secuencia) |
| **T-931** | PROP-60 + PROP-63 |
| **T-941** | PROP-78 |
| **T-942** | PROP-10 + PROP-82 + PROP-91 |
| **T-943** | PROP-94 |
| **T-951** | PROP-4 + PROP-9 + PROP-13 + PROP-17 + PROP-68 |
| **T-952** | PROP-18 + PROP-65 + PROP-69 |
| **T-953** | PROP-66 + PROP-67 + PROP-74 |
| **T-954** | PROP-16 + PROP-71 + PROP-72 + PROP-73 + PROP-75 |
| **T-955** | PROP-1 + PROP-76 |
| **T-956** | PROP-2 + PROP-6 + PROP-11 |
| **T-957** | PROP-93 |
| **T-958** | (nueva — Audit final coherencia visual + WCAG 2.2 AA + responsive tablet) |
| **T-959** | (nueva — Polish flujos críticos profesor + área admin + extras) |

**Total propuestas absorbidas: 68/68** (todas las propuestas pendientes en `propuestas-mejora.md`).
**Total tareas: 26** (21 consolidadas desde propuestas + 3 nuevas de mecánica Secuencia: backend, frontend+analytics, auditoría integral + 2 nuevas de polish UI: audit final coherencia/WCAG y polish flujos críticos).

---

## Definición de "Sprint completado"

El Sprint 6 se considera completado cuando:

1. **Tareas P0 al 100%** — Sin la cadena de release v1.0.0 + mecánica Secuencia, no hay corte de la versión.
2. **Tag `v1.0.0` desplegado en producción cloud** con smoke test exitoso, observabilidad activa y backups verificados.
3. **Tests verdes** en CI (backend + frontend + E2E + load + chaos manual).
4. **Quality Gate SonarCloud pasa** (T-943) o threshold ajustado pragmáticamente con justificación documentada.
5. **Tareas P1 al 100%** o documentadas como diferidas con justificación.
6. **Tareas P2/P3 según margen** — al menos el 50% completadas para cerrar la mayor parte del backlog UX/motion.
7. **CHANGELOG.md** y **memoria TFG** actualizados con todos los cambios y ADRs (102-107 nuevos).
8. **Status page UptimeRobot** pública mostrando 100% uptime durante las primeras 48h post-release.

---

## Notas finales

- **Decisión sobre feature flags:** el sistema fue retirado en el cierre de Sprint 5 (decisión PO). Las propuestas que originalmente las mencionaban (PROP-97, PROP-123) se reformulan en este documento sin asumir su existencia. La env var `SESSION_ENABLED_MECHANICS` se preserva — es una whitelist estática, no un flag dinámico.
- **Mecánica Secuencia como cierre de alcance:** tras esta release el TFG entrega las tres mecánicas anunciadas (Asociación + Memoria + Secuencia). No se planifican más mecánicas para v1.0.0.
- **Backlog post-v1.0.0:** este sprint absorbe el 100% de las propuestas pendientes. Si el sprint corta antes de completar P3, las tareas pendientes pasan a un nuevo `propuestas-mejora.md` post-v1.0.0 (o se cierran como descartadas).
- **No puedo hacer merge ni commit:** esas acciones siguen reservadas para desarrolladores humanos. Mi rol queda en redacción, implementación y verificación con `npm test` / `npm run lint`.
