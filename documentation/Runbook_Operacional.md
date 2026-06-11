# Runbook Operacional — EduPlay RFID

> **Audiencia.** Operador on-call. Persona que tiene que reaccionar a una alerta a las 02:00 sin contexto y no quiere leer 600 líneas de ADRs antes de actuar.
>
> **Formato.** Cada playbook sigue el patrón `Síntoma → Diagnóstico → Pasos → Verificación → Rollback`. Los comandos están listos para copiar; los placeholders en `<MAYÚSCULAS>` se sustituyen por el valor real del incidente.

---

## Tabla de playbooks

| Nº | Playbook | Severidad típica |
|---|---|---|
| 1 | [Desplegar a staging](#1-desplegar-a-staging) | Baja |
| 2 | [Desplegar a producción](#2-desplegar-a-producción) | Baja |
| 3 | [Rollback manual de producción](#3-rollback-manual-de-producción) | Alta |
| 4 | [Reiniciar worker BullMQ](#4-reiniciar-worker-bullmq) | Media |
| 5 | [Rotar JWT_SECRET / JWT_REFRESH_SECRET](#5-rotar-jwt_secret--jwt_refresh_secret) | Alta (incidente) / Baja (programada) |
| 6 | [Rotar password de MongoDB Atlas](#6-rotar-password-de-mongodb-atlas) | Alta (incidente) / Media (programada) |
| 7 | [Rotar password de Upstash Redis](#7-rotar-password-de-upstash-redis) | Alta (incidente) / Media (programada) |
| 8 | [Investigar a un usuario por ID](#8-investigar-a-un-usuario-por-id) | Variable |
| 9 | [Purgar datos GDPR (derecho al olvido)](#9-purgar-datos-gdpr-derecho-al-olvido) | Alta (legal) |
| 10 | [Responder alerta Sentry](#10-responder-alerta-sentry) | Variable |
| 11 | [Slow queries en MongoDB Atlas](#11-slow-queries-en-mongodb-atlas) | Media |
| 12 | [Picos de comandos en Upstash](#12-picos-de-comandos-en-upstash) | Media |
| 13 | [Verificar integridad de backups Atlas](#13-verificar-integridad-de-backups-atlas) | Baja (programada) |
| 13a | [Atlas storage al 80%](#13a-atlas-storage-al-80) | Media (proactiva free tier) |
| 13b | [Upstash commands al 80%](#13b-upstash-commands-al-80) | Media (proactiva free tier) |
| 13c | [Supabase egress al 80%](#13c-supabase-egress-al-80) | Media (proactiva free tier) |
| 13d | [Sentry quota al 80%](#13d-sentry-quota-al-80) | Media (proactiva free tier) |
| 13e | [Cold-start warming de Koyeb (verificación)](#13e-cold-start-warming-de-koyeb-verificación) | Baja (proactiva) |
| 14 | [Levantar entorno de test desde cero](#14-levantar-entorno-de-test-desde-cero) | Baja (onboarding) |
| 15 | [Aplicar parche de seguridad urgente](#15-aplicar-parche-de-seguridad-urgente) | Alta (incidente) |
| 16 | [Crear preview deploy desde un Pull Request](#16-crear-preview-deploy-desde-un-pull-request) | Baja (QA) |
| 17 | [Responder alerta Sentry Performance (degradación de p95)](#17-responder-alerta-sentry-performance-degradación-de-p95) | Variable |
| 18 | [Responder alerta UptimeRobot](#18-responder-alerta-uptimerobot) | Alta |
| 19 | [Diagnosticar Security Audit rojo en CI](#19-diagnosticar-security-audit-rojo-en-ci) | Media (bloqueante PRs) |
| 20 | [Responder alerta `rfid_hmac_spike` (rechazos HMAC/replay RFID)](#20-responder-alerta-rfid_hmac_spike-rechazos-hmacreplay-rfid) | Alta (posible ataque) / Media (firmware) |

---

## 1. Desplegar a staging

**Síntoma:** Quieres validar un cambio en el entorno staging antes de mergear a `main`.

**Diagnóstico:** N/A (acción proactiva).

**Pasos:**

1. Asegúrate de que tu rama está mergeada o cherry-picked a `Maintenance`.
2. Push a `Maintenance`: `git push origin Maintenance`.
3. El workflow `build.yml` (CI) corre primero.
4. Si CI verde, `deploy-staging.yml` se dispara automáticamente via `workflow_run`.
5. Monitor: https://github.com/Samuel-Prog-CSec/TFG-IoT/actions

**Pre-requisitos de config (Settings → Secrets and variables → Actions):**

- **Secrets:** `KOYEB_API_TOKEN`, `KOYEB_API_STAGING_NAME`, `KOYEB_WORKER_STAGING_NAME`.
- **Variables:** `KOYEB_STAGING_URL` (no es secreto — URL operativa visible en logs).

Si falta cualquiera, el step "Verificar secrets y variables requeridos" detiene el workflow con un error claro.

**Verificación:**

```bash
curl -i https://api-staging-<org>.koyeb.app/health/ready
# Esperar 200 con { "ready": true, "checks": { "mongo": "ok", "redis": "ok" } }
```

Frontend: abrir `https://maintenance.eduplay-frontend.pages.dev` → login con `maria@test.com` / `Test1234!` → comprobar que se conecta a `api-staging`.

**Rollback:** Automático si `/health/ready` falla <3/8 veces tras deploy. Manual con [playbook 3](#3-rollback-manual-de-producción) sustituyendo `prod` por `staging`.

---

## 2. Desplegar a producción

**Síntoma:** Hay cambios mergeados a `main` y se quiere publicar una nueva versión.

**Diagnóstico:** N/A.

**Pasos:**

1. Asegúrate de que el PR "chore: release vX.Y.Z" de `release-please` está abierto en GitHub.
2. Revisa el CHANGELOG que ha generado. Si necesitas editar (ej. la primera release retroactiva), edita el archivo `CHANGELOG.md` directamente en el PR.
3. Aprueba y mergea el PR.
4. `release-please` crea automáticamente el tag `vX.Y.Z` y dispara `deploy-production.yml`.
5. El workflow espera approval en el environment `production`. Aprueba desde:
   `https://github.com/Samuel-Prog-CSec/TFG-IoT/actions/runs/<RUN_ID>`
6. El workflow redeploya `api-prod` + `worker-prod` en paralelo + smoke test.

**Pre-requisitos de config:**

- **Environment `production`** con Required reviewer = Samuel-Prog-CSec y Deployment branches = tags `v*`. Si no existe, el workflow queda *Waiting for approval* sin un reviewer asignado y nunca progresa.
- **Secrets:** `KOYEB_API_TOKEN`, `KOYEB_API_PROD_NAME`, `KOYEB_WORKER_PROD_NAME`.
- **Variables:** `KOYEB_PROD_URL` (no es secreto). Si la migración desde `secrets.KOYEB_PROD_URL` no se ha hecho, borrar la antigua y crear la nueva como Variable.

**Verificación:**

```bash
curl -i https://api-<org>.koyeb.app/health/ready    # 200
curl -i https://api-<org>.koyeb.app/health         # 200 con detalle
# Frontend
curl -I https://eduplay-frontend.pages.dev          # 200 (Cloudflare Pages)
```

Login con un docente real → crear sesión → simular RFID scan → verificar que GamePlay se crea en MongoDB.

**Rollback:** Automático si `/health/ready` falla ≥5/8 veces. Manual con [playbook 3](#3-rollback-manual-de-producción).

---

## 3. Rollback manual de producción

**Síntoma:** El deploy fue dado por verde pero los usuarios reportan errores 500 / latencia alta / funcionalidad rota. Sentry empieza a llenarse de eventos.

**Diagnóstico:**

```bash
# 1. ¿Está respondiendo /health/ready?
curl -s https://api-<org>.koyeb.app/health/ready | jq

# 2. ¿Qué dice el log de Sentry? Top 5 errores en los últimos 15 min.

# 3. ¿La revisión actual es la del último deploy?
koyeb services describe api-prod
```

**Pasos:**

1. **Instalar Koyeb CLI** (si no lo tienes):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | sh
   export KOYEB_TOKEN=<tu_token_personal>
   ```
2. **Rollback paralelo de api + worker:**
   ```bash
   koyeb services rollback api-prod --token "$KOYEB_TOKEN"
   koyeb services rollback worker-prod --token "$KOYEB_TOKEN"
   ```
   Koyeb mantiene las últimas 5 revisiones y vuelve a la anterior estable.

**Verificación:**

```bash
# Esperar 60-90s a que el rollback termine
sleep 90
curl -s https://api-<org>.koyeb.app/health/ready | jq
# Esperado: { "ready": true, "checks": { "mongo": "ok", "redis": "ok" } }
```

Confirmar con un smoke test E2E: login + endpoint autenticado funcionando.

**Rollback del rollback:** Si la versión anterior también está rota (raro), usar `koyeb services describe api-prod --revisions` para listar revisiones y deploy con `koyeb services update api-prod --revision <SHA>`.

---

## 4. Reiniciar worker BullMQ

**Síntoma:** Jobs de `data-retention` se acumulan sin procesar o el log del worker está mudo durante >15 minutos.

**Diagnóstico:**

```bash
# Ver jobs en cola via Redis CLI (Upstash dashboard también funciona)
redis-cli -u <REDIS_URL> --tls keys 'eduplay:prod:bull:*' | head -20
redis-cli -u <REDIS_URL> --tls LLEN 'eduplay:prod:bull:data-retention:wait'
```

**Pasos:**

```bash
koyeb services redeploy worker-prod --token "$KOYEB_TOKEN"
```

El SIGTERM dispara el graceful shutdown del worker (drena jobs en curso, libera Redis), y el container nuevo arranca con `npm run worker` que reconecta a la queue.

**Verificación:**

```bash
# Logs en Koyeb dashboard → worker-prod → Logs
# Esperar a ver: "Worker: listo para procesar jobs"
# Después algún log de proceso: "Ejecutando job de retención de datos"
```

**Rollback:** No aplica — un worker reiniciado no introduce regresión (BullMQ rescata jobs interrumpidos por timeout de lock).

---

## 5. Rotar JWT_SECRET / JWT_REFRESH_SECRET

**Síntoma (incidente):** Sospecha de fuga del JWT secret (commit accidental, leak de logs).
**Síntoma (programado):** Pasaron 6 meses desde la última rotación.

**Diagnóstico (sólo en incidente):** Buscar en `git log -p -- backend/` por commits que contengan `JWT_SECRET=`.

**Pasos:**

1. Generar nuevos secretos:
   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_SECRET
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"   # JWT_REFRESH_SECRET
   ```
2. **Staging primero**: Koyeb dashboard → `api-staging` → Environment → editar `JWT_SECRET` y `JWT_REFRESH_SECRET` → Redeploy. Idem `worker-staging`.
3. Smoke test staging: login con seed user → llamada autenticada → OK.
4. **Producción**: idem en `api-prod` + `worker-prod`.
5. Comunicar a usuarios que tendrán que re-login.

**Verificación:**

- Tras el redeploy, los tokens viejos (firmados con el secret anterior) devuelven 401.
- Los nuevos tokens (emitidos tras la rotación) funcionan normal.

**Rollback:** Re-aplicar el secret antiguo. Los usuarios mantienen sus sesiones. **Cuidado:** si la fuga es real, no rolees back — la urgencia de cortar el acceso comprometido prima sobre la inconveniencia del re-login.

Detalle completo en [`documentation/Secrets_Rotation.md`](Secrets_Rotation.md).

---

## 6. Rotar password de MongoDB Atlas

**Síntoma:** Igual que JWT — incidente (fuga) o programada (cada 3 meses).

**Diagnóstico:** Si es incidente, revisar Atlas → Activity Feed para detectar accesos sospechosos.

**Pasos:**

1. Atlas → Database Access → editar usuario `eduplay-api` → Edit Password → **autogenerate**.
2. **Importante:** no clickear "Update User" todavía — copiar password primero. Cuando se actualiza, la vieja deja de funcionar inmediatamente.
3. Construir las URIs nuevas (una por entorno, con la DB correcta `rfid_games_staging` o `rfid_games_production`).
4. Koyeb dashboard → `api-staging` + `worker-staging` → editar `MONGO_URI` → Redeploy.
5. Hacer click "Update User" en Atlas.
6. Smoke test staging.
7. Repetir con `api-prod` + `worker-prod`.

**Verificación:**

```bash
curl -s https://api-staging-<org>.koyeb.app/health | jq '.services.mongodb'
# Esperar: { "status": "healthy", "state": "connected", ... }
```

**Rollback:** Si el pool se queda colgado, hacer reset de password en Atlas a un valor temporal compartido, redeploy con esa URI, y planificar rotación clean.

---

## 7. Rotar password de Upstash Redis

**Síntoma:** Igual que JWT/Mongo.

**Diagnóstico:** Upstash dashboard → Logs.

**Pasos:**

1. Upstash dashboard → DB `eduplay-staging` → `Reset Password`. Confirma — la URI regenerada aparece en `Details`.
2. Koyeb dashboard → `api-staging` + `worker-staging` → editar `REDIS_URL` con la nueva URI → Redeploy.
3. Smoke test: login + crear partida + cerrar sesión. Si rate limit, blacklist y BullMQ funcionan, OK.
4. Repetir con `eduplay-prod` + `api-prod` + `worker-prod`.

**Verificación:**

```bash
curl -s https://api-staging-<org>.koyeb.app/health | jq '.services.redis'
# Esperar: { "status": "healthy", "responseTime": "X ms", "circuitBreaker": "closed" }
```

**Rollback:** Resetear password a la versión anterior si Upstash lo permite (no siempre). Si no, urgencia: cambiar todos los Koyeb services al mismo tiempo con la nueva password.

---

## 8. Investigar a un usuario por ID

**Síntoma:** Soporte pide info sobre un usuario (ej. "no puede entrar", "doble cobro de tokens", "datos extraños").

**Diagnóstico:**

```bash
# Conectar a Atlas via mongosh
mongosh "mongodb+srv://eduplay-api:<pwd>@eduplay-cluster.xxx.mongodb.net/rfid_games_production"

# Buscar por email o por ID
db.users.findOne({ email: "<EMAIL>" })
db.users.findOne({ _id: ObjectId("<USER_ID>") })

# Ver últimas sesiones del usuario (si es docente)
db.gamesessions.find({ ownerId: ObjectId("<USER_ID>") }).sort({ createdAt: -1 }).limit(10)

# Ver últimas partidas del usuario (si es alumno)
db.gameplays.find({ studentId: ObjectId("<USER_ID>") }).sort({ startedAt: -1 }).limit(10)

# Ver notificaciones recientes
db.notifications.find({ userId: ObjectId("<USER_ID>") }).sort({ createdAt: -1 }).limit(20)
```

**Pasos:** Anota los hallazgos en el ticket de soporte. Si hay datos personales, asegúrate de tratar la captura como información sensible.

**Verificación:** N/A (consulta).

**Rollback:** N/A.

---

## 9. Purgar datos GDPR (derecho al olvido)

**Síntoma:** Un usuario invoca su derecho al olvido (RGPD Art. 17). Tienes 30 días para responder.

**Diagnóstico:** Verificar identidad del solicitante (debe ser el propio interesado o un padre/tutor si el alumno es menor).

**Pasos:**

1. Identificar el `userId` ([playbook 8](#8-investigar-a-un-usuario-por-id)).
2. Ejecutar el script ad-hoc desde Koyeb console:
   ```bash
   # En Koyeb dashboard → api-prod → Console
   npm run data:retention -- --user-id <USER_ID> --hard-delete
   ```
   El script anonimiza (`anonymize`) o borra (`hard-delete`) según política.
3. Limpiar assets en Supabase Storage:
   ```bash
   # Listar assets del usuario
   # (manual desde Supabase dashboard o via SQL)
   ```
4. Confirmar al usuario por escrito.
5. Documentar la acción en el log de incidentes RGPD del centro.

**Verificación:**

```javascript
db.users.findOne({ _id: ObjectId("<USER_ID>") })
// Para anonymize: nombre cambiado a "Usuario eliminado", email a null
// Para hard-delete: documento ausente
```

**Rollback:** **No hay rollback.** Esta operación es irreversible. Verificar tres veces antes de ejecutar `--hard-delete`.

---

## 10. Responder alerta Sentry

**Síntoma:** Sentry envía email/Slack con un nuevo issue P0/P1/P2.

**Diagnóstico:**

- **P0** = error crítico sostenido (rate >10/min). Saca al usuario del flujo: pantalla blanca, fallos de login masivos, errores 500 globales.
- **P1** = error grave intermitente (rate >1/min). Un endpoint específico responde 500 ocasionalmente.
- **P2** = error notable pero contenido (rate <1/min). Edge case detectado.

**Pasos por severidad:**

- **P0**: aplicar [playbook 3](#3-rollback-manual-de-producción) inmediatamente si el error correlaciona con el último deploy. Si no, investigar Atlas/Upstash → posible incidente de infraestructura.
- **P1**: crear issue en GitHub con stack trace de Sentry. Priorizar para próximo sprint. Si el error rate sube a P0, escalar.
- **P2**: marcar issue como "to-investigate" en Sentry. Tratar en el siguiente cycle de mantenimiento.

**Verificación:** Sentry "Resolved" tras el fix; el rate vuelve a 0/min en la siguiente hora.

**Rollback:** N/A.

---

## 11. Slow queries en MongoDB Atlas

**Síntoma:** Latencia de endpoints HTTP sube de <100ms (P95) a >500ms. Sentry empieza a marcar `mongoServerSelectionTimeout`.

**Diagnóstico:**

1. Atlas dashboard → Performance Advisor → Slow Queries.
2. Filtrar últimos 60 min, ordenar por "Average Execution Time".
3. Identificar la query culpable (suele ser un aggregate sin índice).

**Pasos:**

1. **Quick fix**: en Atlas → Performance Advisor sugiere índices. Crear el índice sugerido si parece razonable.
2. **Long fix**: añadir el índice en código (`backend/src/models/*.js`) con `schema.index({...})` → commit + deploy.
3. Si el problema es una aggregate específica, considerar añadir cache Redis (patrón `cache:analytics:*` ya usado en `analyticsService.js`).

**Verificación:**

```bash
curl -w "@-" -o /dev/null -s https://api-<org>.koyeb.app/api/sessions <<'EOF'
\nLookup: %{time_namelookup}s\nConnect: %{time_connect}s\nTotal: %{time_total}s\n
EOF
# Esperar Total < 0.5s
```

**Rollback:** Los índices son aditivos — no hace falta rollback. Si quitas un índice creado en caliente, vuelve la latencia.

---

## 12. Picos de comandos en Upstash

**Síntoma:** Upstash dashboard avisa que estás a >80% del free tier (5K cmds/día) en menos de 12h.

**Diagnóstico:**

1. Upstash dashboard → DB → Metrics → últimas 24h por tipo de comando.
2. Identificar el prefix más activo (`rl:*`, `cache:analytics:*`, `bull:*`, etc.).

**Pasos según el sospechoso:**

- `rl:*` (rate limit): comprobar si hay un bot atacando. Mirar logs de Koyeb por IPs repetitivas + 429 responses.
- `cache:analytics:*`: alguien está hammering el dashboard. Subir el TTL del cache en `analyticsService.js`.
- `bull:*`: jobs duplicados. Revisar `worker.js` por leaks de cron jobs (`scheduleDataRetentionCron` debe ser idempotente por jobId).
- `session:*` o `auth:user:*`: tráfico normal — si crece sostenido, considerar plan de pago Upstash ($0.20/100K cmds).

**Verificación:**

```bash
# Re-medir tras el fix
# Upstash dashboard → DB → Metrics → 1h window
```

**Rollback:** N/A (sólo optimización).

---

## 13. Verificar integridad de backups Atlas

**Síntoma:** Cada lunes / mensual (proactivo).

**Diagnóstico:** Atlas free tier (M0) NO hace snapshots automáticos. Para v1.0.0 con M0, hay que hacer dumps manuales.

**Pasos:**

```bash
# Dump full de la BD prod
mongodump --uri "mongodb+srv://eduplay-api:<pwd>@eduplay-cluster.xxx.mongodb.net/rfid_games_production" \
  --out "./backup-$(date +%Y%m%d)"

# Subir a un bucket S3 / Cloudflare R2 / Drive personal
# ...

# Verificar restauración en una BD test
mongorestore --uri "mongodb+srv://eduplay-api:<pwd>@eduplay-cluster.xxx.mongodb.net/rfid_games_backup_test" \
  --drop \
  "./backup-$(date +%Y%m%d)/rfid_games_production"

# Smoke test: contar documentos clave
mongosh "mongodb+srv://eduplay-api:<pwd>@eduplay-cluster.xxx.mongodb.net/rfid_games_backup_test" \
  --eval 'print(db.users.countDocuments() + " users, " + db.gameplays.countDocuments() + " plays")'
```

**Verificación:** Las cuentas del dump coinciden con las de prod (margen ±0.1% por escrituras concurrentes).

**Rollback:** N/A (no se modifica prod).

> **Mejora futura**: upgrade a Atlas M2 o M5 que incluye snapshots continuos automáticos.

---

## 13a. Atlas storage al 80%

**Síntoma:** alerta `atlas_storage_quota` (warning o critical) en `/admin/system-alerts`, o aviso por email del propio Atlas.

**Diagnóstico:**

1. Abrir Atlas UI → cluster `eduplay-cluster` → tab "Metrics" → panel "Storage". Apuntar el uso actual frente al límite (512 MB en M0).
2. Identificar las colecciones más pesadas:
   ```bash
   mongosh "$MONGODB_URI" --eval 'db.getCollectionNames().forEach(c => { const s = db[c].stats(); print(c + " → " + Math.round(s.size/1024/1024 * 10)/10 + " MB datos + " + Math.round(s.totalIndexSize/1024/1024 * 10)/10 + " MB índices"); })'
   ```
3. Comprobar si la retención RGPD viene corriendo (Runbook §9 + worker `data-retention`).

**Pasos:**

```bash
# 1) Ejecutar retención manual (purga GamePlay/Session > política RGPD)
cd backend && npm run data:retention

# 2) Eliminar SystemAlerts ya resueltas (>90d) si pesan
mongosh "$MONGODB_URI" --eval 'db.systemalerts.deleteMany({ status: { $in: ["resolved","dismissed"] }, updatedAt: { $lt: new Date(Date.now() - 90*24*3600*1000) } })'

# 3) Si la alerta es critical (>95%) y la retención no ha liberado suficiente:
#    upgrade temporal a Atlas M2 ($9/mes, 2 GB, sin downtime)
#    Atlas UI → cluster → "Modify cluster" → tier M2 → confirm
```

**Verificación:**

- Espera a la próxima corrida del detector (≤5 min) → la alerta debe pasar a `resolved` (`autoResolveAfterMissedRuns: 2`).
- Repetir `db.stats()`: el `usedMB` debe haber bajado por debajo del 80% del presupuesto.

**Rollback:** N/A. La purga de datos antiguos es definitiva. El upgrade a M2 se puede devolver a M0 más adelante si el storage baja.

---

## 13b. Upstash commands al 80%

**Síntoma:** alerta `upstash_commands_quota` o `rate_limit_store_fallback` en `/admin/system-alerts`. Complementa al §12 (que cubre el caso reactivo: pico ya producido).

**Diagnóstico:**

1. Revisar `/api/metrics` (auth super_admin) → bloque `redis.commandsByCategory` para identificar la categoría dominante (auth, ratelimit, bullmq, cache-*, etc.).
2. Comparar con Upstash Console → Metrics → "Commands per day": confirmar que la proyección lineal interna y el dashboard externo concuerdan.

**Pasos:**

```bash
# Caso A — la categoría dominante es 'bullmq' (jobs frecuentes):
#   Subir el cron de `system-alert-detection` de */5 a */10 mientras dura la presión.
#   En Koyeb dashboard ajustar la env var SYSTEM_ALERT_DETECTION_CRON.

# Caso B — la categoría dominante es 'cache-analytics' o 'cache-context':
#   Subir TTL en backend/src/services/cacheHelper.js para el namespace afectado.
#   Validar que la frescura sigue siendo aceptable para el caso de uso.

# Caso C — la categoría dominante es 'auth' (cache slim-user cold):
#   Aumentar IN_MEMORY_AUTH_USER_TTL_MS y/o IN_MEMORY_AUTH_USER_MAX en Koyeb.
#   Reiniciar para que apliquen.

# Caso D — la alerta es `rate_limit_store_fallback` (Redis intermitente):
#   Verificar conectividad Upstash, restaurar conexión y *reiniciar el proceso*
#   para que los limiters se reanclen al store distribuido (no se reconectan
#   automáticamente al cambiar de store).
```

**Si todo lo anterior no basta:**

- Migrar a Upstash Pay-as-you-go (~$0,20 por 100K cmds). Cambio sin downtime desde Upstash Console.

**Verificación:** la alerta debe auto-resolverse en las próximas 2 corridas del detector. Revisar también `runtimeMetrics.redis.commandsEstimatedDaily` cae por debajo del 80%.

**Rollback:** revertir TTL/MAX si la frescura se vuelve un problema visible para los usuarios.

---

## 13c. Supabase egress al 80%

**Síntoma:** email automático de Supabase indicando uso elevado, o issue creada por el workflow `free-tier-monthly-review.yml`.

**Diagnóstico:**

1. Supabase Studio → proyecto → Settings → Usage → "Storage Bandwidth" (egress mensual).
2. Confirmar que los assets se sirven con `Cache-Control: max-age=31536000` (T-908): abrir DevTools en el frontend, ver una imagen de una tarjeta y verificar el header.

**Pasos:**

```bash
# Caso A — cache-control correcto, simplemente hay mucho tráfico legítimo:
#   Esperar al próximo ciclo de facturación o migrar a Supabase Pro ($25/mes).

# Caso B — cache-control incorrecto o ausente:
#   Verificar `backend/src/services/storage/...` que el upload setea
#   metadata correctamente. Reupload de los assets afectados desde
#   admin (`/admin/contexts` → "Re-procesar contexto").

# Caso C — necesidad estructural de más egress:
#   Evaluar mover assets a Cloudflare R2 (free 10 GB egress/mes,
#   integración nativa con Workers).
```

**Verificación:** el siguiente ciclo de facturación debe mostrar consumo proporcionalmente menor. Espera 2-3 días para tendencia clara.

**Rollback:** N/A. Si se migra a R2, conservar Supabase como backup durante un mes.

---

## 13d. Sentry quota al 80%

**Síntoma:** email automático de Sentry o issue del workflow mensual.

**Diagnóstico:**

1. Sentry → Stats → "Quotas". Comparar errores y transacciones acumulados frente al free tier (5 K + 10 K).
2. Identificar si el pico viene de un Issue concreto (regresión) o es tendencia uniforme.

**Pasos:**

```bash
# Caso A — pico por un Issue específico:
#   Resolver el bug o usar "Ignore" en Sentry para descartar ocurrencias
#   futuras hasta que se libere fix.

# Caso B — tendencia uniforme (todo el sistema genera más eventos):
#   Bajar muestreo de Performance en producción.
#   Koyeb env: SENTRY_TRACES_SAMPLE_RATE=0.05 (antes 0.1) en api-prod.
#   Documentar el cambio en ADR-165 si se mantiene.

# Caso C — la cuota se acerca al 100% y faltan días del mes:
#   Considerar Sentry Team ($26/mes) — 50K errores + 100K transacciones.
```

**Verificación:** revisar Stats al día siguiente; el ritmo de consumo debe haber bajado proporcionalmente al cambio de `tracesSampleRate`.

**Rollback:** restaurar `SENTRY_TRACES_SAMPLE_RATE=0.1` cuando se reduzca el tráfico real.

---

## 13e. Cold-start warming de Koyeb (verificación)

**Síntoma:** primera petición tras un periodo sin tráfico tarda > 3 s, o se nota un retraso visible al abrir la app por primera vez tras una sesión inactiva.

**Diagnóstico:**

1. Verificar que los 4 monitors UptimeRobot configurados en T-904 (Bloque 8.3 de `DEPLOY_GUIA_COMPLETA.md`) están **activos** y pingando `/health/live` cada 5 min:
   - API prod, API staging, Frontend prod, Frontend staging.
2. UptimeRobot Dashboard → cada monitor debe mostrar estado "Up" y latencia razonable (< 1 s en steady state).

**Pasos:**

```bash
# Caso A — algún monitor está pausado/borrado:
#   UptimeRobot dashboard → recrearlo apuntando a `<KOYEB_URL>/health/live`
#   con intervalo 5 min. No usar `/health/ready` (golpearía Mongo+Redis).

# Caso B — Koyeb ha cambiado su política de hibernación a más agresiva
# (la documentación lo indica como ≈5 min sin tráfico):
#   Añadir un 5º monitor cada 3 min en UptimeRobot (sigue dentro de los
#   50 monitors del free tier). Documentar el cambio en ADR-168.

# Caso C — se confirma que Koyeb Eco no es suficiente:
#   Migrar a Koyeb Eco paid ($1,61/mes/servicio) — sin hibernación.
#   Decisión documentada en Free_Tier_Budget.md §6.
```

**Verificación:** ejecutar `curl -w "%{time_total}\n" -o /dev/null -s <KOYEB_URL>/health/live` tras 10 minutos de inactividad y confirmar que el tiempo está por debajo de 500 ms.

**Rollback:** N/A. Los monitors son acciones idempotentes.

---

## 14. Levantar entorno de test desde cero

**Síntoma:** Nuevo contributor, máquina nueva, o quiero un entorno limpio para reproducir un bug.

**Diagnóstico:** N/A.

**Pasos:**

```bash
# 1. Clonar
git clone https://github.com/Samuel-Prog-CSec/TFG-IoT.git
cd TFG-IoT

# 2. .env
cp .env.example .env
# Generar JWT secrets:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 3. Docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 4. Seed
docker compose exec backend npm run seed:reset

# 5. Verificar
curl http://localhost:5000/health/ready
# Esperar: { "ready": true }
```

**Verificación:** Login con `maria@test.com` / `Test1234!` debe funcionar.

**Rollback:** `docker compose down -v` borra todos los volúmenes y vuelves a empezar.

---

## 15. Aplicar parche de seguridad urgente

**Síntoma:** CVE publicada en una dependencia directa o transitiva crítica (Express, Mongoose, Sentry, etc.).

**Diagnóstico:**

```bash
cd backend && npm audit --omit=dev
cd ../frontend && npm audit --omit=dev
```

**Pasos:**

1. **Crear rama de hotfix:**
   ```bash
   git checkout main
   git pull
   git checkout -b fix/sec-<cve-id>
   ```
2. **Actualizar la dependencia**: `npm install --save <pkg>@<fixed-version>` en el workspace afectado.
3. Si la vulnerability es transitiva y no se puede bumpear el paquete top-level, evaluar:
   - **Override** en `package.json` (con cuidado: puede romper peer deps).
   - **Excluir advisory** en `.github/workflows/build.yml` con justificación clara (no alcanzable en la cadena de uso).
4. Lanzar lint + tests:
   ```bash
   cd backend && npm test && npm run lint
   cd ../frontend && npm test -- --run && npm run lint
   ```
5. Commit + push: `fix(deps): <pkg> a versión <X> — corrige CVE-XXXX`.
6. PR contra `main`, mergear tras revisión.
7. Crear tag manual: `git tag v1.0.X -m "Hotfix CVE-XXXX"` y push.
8. El tag dispara `deploy-production.yml` → approval gate → deploy.

**Verificación:**

```bash
cd backend && npm audit --omit=dev
# Esperar: 0 vulnerabilities, o sólo las excluidas en build.yml con justificación.
```

**Rollback:** Rollback del tag de hotfix → `koyeb services rollback api-prod`. Documentar en Sentry/Slack qué CVE no pudo aplicarse.

---

## 16. Crear preview deploy desde un Pull Request

**Síntoma:** Un PR cambia código relevante para QA visual o flujos críticos (RFID, gameplay, analytics) y se quiere probar la build real antes de mergear a `Maintenance`.

**Cómo funciona:**

El workflow `.github/workflows/preview-deploy.yml` se dispara automáticamente con `on: pull_request` (eventos `opened`, `synchronize`, `closed`). Crea una app efímera `api-pr-<num>` en Koyeb apuntando al commit del PR y comparte la DB Atlas + Upstash de staging. Cloudflare Pages levanta su propio preview del frontend en paralelo. Cuando se cierra el PR, las apps se destruyen automáticamente.

**Pasos:**

1. Abrir el PR (o pushear nuevos commits a la rama del PR).
2. El bot de GitHub publica un comentario con la URL del preview tras ~2-3 min:
   - `https://api-pr-<num>-<org>.koyeb.app`
   - `https://pr-<num>.eduplay-frontend.pages.dev`
3. Login con cualquier usuario del seeder (`maria@test.com / Test1234!`).
4. Validar el flujo afectado. **Importante:** los preview deploys escriben en la DB de staging, así que cualquier dato creado durante el QA será visible para otros previews.
5. Para forzar un redeploy sin nuevos commits: pulsar "Synchronize" en el panel del PR (re-dispara el workflow).
6. Al cerrar/mergear el PR, esperar el comentario `Preview cleaned up`.

**Pre-requisitos de config:**

- **Variable `PREVIEW_DEPLOYS_ENABLED=true`** en Settings → Variables. Sin esto el workflow se salta (free tier Koyeb no soporta previews por PR).
- **Secrets `KOYEB_API_TOKEN` y `KOYEB_ORG`**. Si faltan, el step "Verificar secrets requeridos" para los jobs `preview` y `teardown` aborta con error claro: el problema es config de repo, no del PR.

**Limitaciones:**

- Solo PRs del propio repo (no forks) — el workflow no expone los secrets a forks.
- Backend de preview no recibe deploys de prod ni se promociona automáticamente.
- Si el commit rompe el boot, el preview falla y aparece `pending` en el panel Koyeb. Revisar logs con `koyeb logs api-pr-<num> --tail 200`.

**Verificación:**

- `gh pr view <num>` muestra el check `preview-deploy` en verde.
- `curl https://api-pr-<num>-<org>.koyeb.app/health/live` → 200.

**Rollback:** No aplica — el preview es efímero, se destruye al cerrar el PR.

---

## 17. Responder alerta Sentry Performance (degradación de p95)

**Síntoma:** Sentry envía email por una de las 4 alertas de T-904:
17.1 Prod error rate >5% in 5min · 17.2 Nuevo tipo de error en prod ·
17.3 Auth failures spike · 17.4 Rate-limit fallback regression.

### 17.1 Error rate >5% in 5 min

**Diagnóstico:**

1. Abre el dashboard Sentry → Performance → filtra `environment:production`.
2. Identifica qué `op` está disparando: ¿`gameplay.endPlay`? ¿`analytics.classroomSummary`? ¿`rfid.scan`?
3. Comprueba si correlaciona con el último deploy (Sentry release tag).

**Pasos:**

- Si correlaciona con el último tag de release: aplicar [playbook 3](#3-rollback-manual-de-producción).
- Si NO correlaciona y el `op` afecta a `analytics.*`: [playbook 11](#11-slow-queries-en-mongodb-atlas) — probablemente Atlas M0 saturada.
- Si afecta a `rfid.scan` o `gameplay.*`: revisa [playbook 12](#12-picos-de-comandos-en-upstash) — el lock distribuido puede estar contended.

**Verificación:** Sentry rate baja a <1% en 15 min. Confirma con LogQL en Loki: `rate({app="eduplay-rfid", env="production"} | json | level="error" [5m])`.

### 17.2 Nuevo tipo de error en prod

**Diagnóstico:**

1. Sentry → Issues → New (último 1h). Abre el issue.
2. Lee stack trace + breadcrumbs (incluyen `playId`, `userId` si aplica).

**Pasos:**

- Si es un error de validación legítimo (input malformado): añadir caso al validador Zod correspondiente.
- Si es bug funcional: crear issue GitHub con stack trace + breadcrumb relevante, priorizar según severidad.
- Si es regresión post-deploy: rollback inmediato + crear hotfix branch.

**Verificación:** Issue marcado `Resolved` en Sentry; rate del fingerprint vuelve a 0.

### 17.3 Auth failures spike >20/min

**Diagnóstico:**

1. LogQL en Loki: `sum by (req_ip) (rate({app="eduplay-rfid", env="production"} | json | msg=~"(?i)auth fail" [5m]))`.
2. Identifica si es UNA IP (probable bot/credential stuffing) o múltiples IPs (ataque distribuido o problema real).

**Pasos:**

- IP única > 30 fails/min: bloquear en Cloudflare → Security → IP Access Rules → Block.
- IPs múltiples: verificar que `account-lockout` está activo (`LOG_LEVEL=info` debería mostrar "account locked" tras 5 fails); si no, escalar a Sentry como bug.
- Si correlaciona con un email específico: contactar al usuario, posible cuenta comprometida.

**Verificación:** Rate baja a <5/min. Si el ataque persiste, considerar activar Cloudflare Bot Fight Mode (Bloque 7.4 de la guía de deploy).

### 17.4 Rate-limit fallback regression

**Síntoma:** Sentry envía issue por mensaje `"rate-limit store fallback"` con count > 0.

**Diagnóstico:** este log indica que el rate limiter dejó de usar Redis y cayó a MemoryStore local. Eso significa que la protección distribuida ya NO funciona: dos instancias api-prod tendrán cada una su propio contador, doblando la cuota efectiva por IP.

**Pasos:**

1. Revisar estado Upstash en la consola (memory usage, command rate). Si Upstash está caído → escalar.
2. Logs Koyeb del servicio api-prod: buscar `"Redis: Fallo al conectar"` o `"circuit breaker open"`. Si hay, [playbook 12](#12-picos-de-comandos-en-upstash).
3. Si Upstash está OK pero el contador del fallback sigue subiendo, reiniciar api-prod desde Koyeb (`koyeb service redeploy api-prod`).

**Verificación:** `runtimeMetrics.redis.rateLimitStoreFallbackCount` vuelve a 0 vía endpoint `/api/metrics` (super_admin).

**Rollback:** No aplica — es síntoma, no causa.

---

## 18. Responder alerta UptimeRobot

**Síntoma:** UptimeRobot envía email "Monitor is DOWN" para uno de los 4 monitores (API prod / API staging / Frontend prod / Frontend staging).

### 18.1 API prod / staging DOWN (apunta a `/health/live`)

**Diagnóstico:**

1. `curl -i $KOYEB_PROD_URL/health/live` desde tu máquina. ¿Devuelve 200 o timeout?
2. Si timeout: Koyeb dashboard → api-prod → status. ¿Pending, deploying, failed?
3. Si 200: posiblemente UptimeRobot tiene un problema de DNS o tu IP está bloqueada en Cloudflare Bot Fight Mode.

**Pasos:**

- Si Koyeb dice "deploying" tras un deploy nuevo: esperar ~2 min más, el deploy puede tardar.
- Si "failed": logs Koyeb → leer primer error. Comúnmente envvars mal o Redis/Mongo caídos. Aplicar playbook correspondiente.
- Si la IP de UptimeRobot está bloqueada por Bot Fight Mode: whitelistear en Cloudflare → IP Access Rules → Allow.

**Verificación:** UptimeRobot marca "UP" en el siguiente ping (5 min).

### 18.2 Frontend prod DOWN (Cloudflare Pages)

**Diagnóstico:**

1. Cloudflare Dashboard → Pages → `eduplay-frontend` → último deploy. ¿Está "active" o "failed"?
2. `curl -I https://eduplay-frontend.pages.dev` → ¿código 200? ¿Cloudflare headers presentes?

**Pasos:**

- Deploy fallido: revisar log del build en Cloudflare Pages. Comúnmente: `npm run build` falla por un error de tipos/lint.
- 5xx con headers Cloudflare: incidente Cloudflare global — verificar https://www.cloudflarestatus.com/.
- 200 pero contenido roto: investigar deploy → archivos build esperados (`dist/index.html`).

**Verificación:** UptimeRobot "UP" + curl manual devuelve `200 OK`.

**Rollback:** Cloudflare Pages → Deployments → Rollback al deploy anterior.

---

## 19. Diagnosticar Security Audit rojo en CI

**Síntoma:** `build.yml` falla en el job *Security Audit*. La salida del step "Security gate (producción)" muestra `FAIL Backend: N vulnerabilidad(es) de producción NO excluida(s)` o similar.

**Diagnóstico (en local, rápido):**

```bash
# 1. Reproduce exactamente lo que hace el CI:
node backend/scripts/audit-with-exclusions.js \
  --workspace backend \
  --label "Backend" \
  --excluded "GHSA-w5hq-g745-h8pq,GHSA-v2v4-37r5-5v8g,GHSA-jxxr-4gwj-5jf2,GHSA-58qx-3vcg-4xpx"

node backend/scripts/audit-with-exclusions.js \
  --workspace frontend \
  --label "Frontend" \
  --excluded "GHSA-3p68-rc4w-qgx5,GHSA-fvcv-3m26-pcqx,GHSA-r4q5-vmmm-2653,GHSA-58qx-3vcg-4xpx"

# Si el script lista vulns nuevas: anótalas (formato GHSA-xxxx-xxxx-xxxx).
# 2. Para ver el árbol completo de la vuln:
npm --prefix backend audit --omit=dev | head -40
```

**Pasos:**

Por cada nueva GHSA detectada, decidir:

1. **¿Es alcanzable en runtime?** Si NO (transitiva de dev-only, código no llamado, etc.), añadir el GHSA a la lista correspondiente en `.github/workflows/build.yml` (constantes `BACKEND_EXCLUDED` / `FRONTEND_EXCLUDED`) con un comentario que explique:
   - Qué paquete la introduce.
   - Por qué no es alcanzable.
   - Cuándo se podrá retirar la exclusión (ej. "tras bump de socket.io@4.9").
2. **Sincronizar `dependency-review.yml`** con la misma lista en `allow-ghsas` — si no, los PRs nuevos fallarán por el mismo motivo.
3. **¿Es alcanzable?** Aplicar [playbook 15](#15-aplicar-parche-de-seguridad-urgente) — bump del paquete top-level o override en `package.json`.

**Verificación:**

```bash
# Tras editar build.yml + dependency-review.yml:
node backend/scripts/audit-with-exclusions.js --workspace backend --label "Backend" --excluded "<lista actualizada>"
# Debe imprimir: "OK Backend audit: N vulnerabilidad(es) cubierta(s) por exclusiones documentadas"

# Push a la rama feature → CI debe quedar verde en el job Security Audit.
```

**Rollback:** Si una exclusión deja pasar una vuln que SÍ era alcanzable y descubres el incidente, retirar el GHSA de la lista, aplicar fix urgente ([playbook 15](#15-aplicar-parche-de-seguridad-urgente)), y documentar en Sentry/Slack.

**Notas:**

- El helper de exclusiones vive en `backend/scripts/audit-with-exclusions.js` con tests unitarios en `backend/tests/auditWithExclusions.test.js`. Cambios en la política se hacen ahí, no inline en el workflow.
- Las exclusiones se acumulan con motivos en los comentarios — revisar mensualmente si alguna puede retirarse tras bumps de Dependabot.

---

## Referencias

- **ADR-139..146** en [`Architecture_Decisions.md`](Architecture_Decisions.md): decisiones de stack y CD.
- **ADR-165, ADR-166**: Sentry Performance + Log shipping Loki (T-904).
- **ADR-167**: Saneamiento del pipeline CI/CD pre-cierre cloud foundation.
- **[`Deploy_Koyeb.md`](Deploy_Koyeb.md)**: aprovisionamiento inicial.
- **[`Operational_Dashboard.md`](Operational_Dashboard.md)**: hub de las 6 consolas + saved queries LogQL.
- **[`Secrets_Rotation.md`](Secrets_Rotation.md)**: política rotación completa.
- **[`Proteccion_Datos_Menores.md`](Proteccion_Datos_Menores.md)**: política RGPD detallada.
- **Sentry**: https://sentry.io (login con cuenta del proyecto).
- **Grafana Cloud**: https://grafana.com (Loki + alertas LogQL).
- **UptimeRobot**: https://uptimerobot.com.
- **Koyeb**: https://koyeb.com.
- **Atlas**: https://cloud.mongodb.com.
- **Upstash**: https://upstash.com.
- **Cloudflare**: https://dash.cloudflare.com.

---

## Playbook 19 — Monitorización p95 analytics + drift T-931

> **Cuándo aplicar**: tras una caída Redis prolongada (>30 min), o si el cron `analytics-reconcile-cron` reporta drift > 5 por noche.

### Vigilancia rutinaria

`/api/metrics` expone (super_admin):
- `t931.reconcileRuns` — cuántas corridas del cron (1/día esperado).
- `t931.reconcileDriftDetected` — entradas con drift detectado en últimas corridas.
- `t931.reconcileDriftCorrected` — cuántas se corrigieron.
- `t931.lastReconcileAt` — timestamp última corrida.
- `t931.leaderboardWrites` + `studentMetricsWrites` — debe crecer monotónicamente con cada `endPlay`.
- `redis.cacheLayers['cache:analytics'].hitRatePercent` — debería superar 50% en operación normal.

**Alerta operativa**: Sentry alert si `t931.reconcileDriftDetected > 5` en una sola corrida.

### Procedimiento: drift > 5 detectado

1. **Revisar logs worker** del último cron run:
   ```bash
   # Grafana Cloud Loki (saved query):
   {service="worker"} |= "T-931 reconcile" | json | driftDetected > 5
   ```
2. **Correlación con caídas Redis**: buscar logs `circuit-breaker` o `Redis: Conexión cerrada` en las últimas 24h.
3. **Verificar tamaño de la queue local pendingInvalidations**: si saturó (Sentry warning con tag `kind=pubsub-queue`), las invalidaciones cache fueron descartadas; impacto en consistencia limitado al modo RFID (no afecta T-931).
4. **Reconciliación manual ad-hoc** si quieres acelerar la corrección sin esperar al próximo cron:
   ```bash
   # Desde host (requiere Docker stack corriendo):
   MSYS_NO_PATHCONV=1 docker compose exec -T worker node -e "
     process.chdir('/app');
     require('/app/src/config/database').connectDB()
       .then(() => require('/app/src/config/redis').connectRedis())
       .then(() => require('/app/src/services/analytics/materializedAnalyticsService').runFullReconciliation())
       .then(r => console.log(JSON.stringify(r, null, 2)))
       .then(() => process.exit(0));
   "
   ```
5. **Verificar `/api/metrics`** tras reconcile manual: `reconcileRuns` incrementó, `driftCorrected` cuenta acumulada.

### Procedimiento: caída Redis prolongada

Si Redis cayó >30 min:
- **No hay acción inmediata** — la reconciliación nocturna corregirá leaderboards + studentMetrics.
- Pub/sub queue `pendingInvalidations` cap 100 con FIFO — invalidaciones más allá del cap se descartaron. El modo RFID se autocorrige por TTL 60min al próximo cambio del usuario.
- Verificar `socketRateLimiter.fallbackCount` en `/api/metrics`. Si > 0, el rate limiter cayó a memory-local durante la ventana — cluster pierde sincronía global del rate-limit. Comportamiento aceptable a corto plazo.

### Procedimiento: cron `analytics-reconcile-cron` no se ejecuta

- Verificar que el cron está programado: logs del backend al boot deben incluir `queues: cron de reconciliación analytics programado (00:30)`.
- Verificar worker container está corriendo: `docker compose ps worker`.
- Verificar BullMQ queue: `docker compose exec redis redis-cli -a 'devRedis123!' --no-auth-warning KEYS "rfid-games:bull:analytics-reconcile:*"`.
- Si la queue está vacía, re-programar manualmente:
  ```bash
  docker compose exec backend node -e "
    require('./src/queues').scheduleAnalyticsReconcileCron().then(() => process.exit(0));
  "
  ```

---

## 20. Responder alerta `rfid_hmac_spike` (rechazos HMAC/replay RFID)

**Síntoma:** El centro de alertas del super_admin muestra una alerta `rfid_hmac_spike` (source `auth`). El detector dispara `warning` a partir de **10 rechazos/h** y `critical` a partir de **30/h** (suma de firmas inválidas + replays en la última hora). Una `critical` notifica en tiempo real a todos los super_admins (`system_alert_critical`).

**Diagnóstico:** El finding desglosa el total en dos subcontadores (`invalidLastHour` vs `replayLastHour`). El reparto orienta la causa:

- Predominio de **`rfid_hmac_invalid`** (firma no cuadra, `HMAC_INVALID`): normalmente **firmware en actualización**, **secret desincronizado** firmware↔backend (re-flasheo con un `RFID_HMAC_SECRET` distinto al del entorno), o **sensor defectuoso**.
- Predominio de **`rfid_replay`** (`COUNTER_REPLAY`, counter no creciente): **ataque de reproducción** de scans capturados o **sensor clonado**. Es el caso más preocupante.

**Pasos:**

1. Leer el desglose actual de los contadores Redis (ventana 1 h):
   ```bash
   docker compose exec redis redis-cli -a 'devRedis123!' --no-auth-warning \
     ZCOUNT rfid-games:security:counter:rfid_hmac_invalid -inf +inf
   docker compose exec redis redis-cli -a 'devRedis123!' --no-auth-warning \
     ZCOUNT rfid-games:security:counter:rfid_replay -inf +inf
   ```
   En prod (Upstash), usar la consola de Upstash con el mismo `ZCOUNT` sobre las keys `security:counter:rfid_hmac_invalid` / `:rfid_replay`.
2. Comprobar el snapshot por instancia en `GET /api/metrics/rfid` → bloque `security` (`invalid`, `replay`, `hmacEnabled`).
3. Revisar los logs del validador para identificar el/los `sensorId` implicados:
   ```bash
   # Grafana Cloud Loki:
   {service="api"} | json | component="rfidHmac" |~ "HMAC mismatch|replay detectado"
   ```
   El log de replay incluye `sensorId`, `counter` y `previous` (un `COUNTER_REPLAY` recurrente sobre un mismo `sensorId` → investigar ese sensor).
4. **Si predomina `rfid_hmac_invalid` y hubo un re-flasheo reciente:** verificar que el secret inyectado en firmware (`-DRFID_HMAC_SECRET` en `build_flags`) coincide con `RFID_HMAC_SECRET` del backend. Si no coinciden, re-provisionar (ver [playbook 5](#5-rotar-jwt_secret--jwt_refresh_secret) para el patrón de rotación y `SECURITY.md` §13.4).
5. **Si predomina `rfid_replay` o se sospecha compromiso del secret:** rotar `RFID_HMAC_SECRET` (backend env + re-flashear todos los sensores con el nuevo secret — son los dos lados del HMAC; ver `Secrets_Rotation.md`). Mientras dure la rotación los sensores con el secret viejo recibirán `HMAC_INVALID`.

**Verificación:** Tras la acción, el total de rechazos cae por debajo de 10/h; el detector deja de reaparecer y la alerta auto-resuelve tras 2 corridas sin findings (`*/5 * * * *`). Confirmar en el bloque `security` de `/api/metrics/rfid` que `invalid`/`replay` dejan de crecer.

**Rollback:** N/A para la rotación del secret (es la acción correctiva). Si una rotación de secret se hizo por error y no había compromiso, re-provisionar el secret anterior en backend + firmware lo revierte.
