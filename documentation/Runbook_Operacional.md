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
| 14 | [Levantar entorno de test desde cero](#14-levantar-entorno-de-test-desde-cero) | Baja (onboarding) |
| 15 | [Aplicar parche de seguridad urgente](#15-aplicar-parche-de-seguridad-urgente) | Alta (incidente) |
| 16 | [Crear preview deploy desde un Pull Request](#16-crear-preview-deploy-desde-un-pull-request) | Baja (QA) |

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

**Limitaciones:**

- Solo PRs del propio repo (no forks) — el workflow no expone los secrets a forks.
- Backend de preview no recibe deploys de prod ni se promociona automáticamente.
- Si el commit rompe el boot, el preview falla y aparece `pending` en el panel Koyeb. Revisar logs con `koyeb logs api-pr-<num> --tail 200`.

**Verificación:**

- `gh pr view <num>` muestra el check `preview-deploy` en verde.
- `curl https://api-pr-<num>-<org>.koyeb.app/health/live` → 200.

**Rollback:** No aplica — el preview es efímero, se destruye al cerrar el PR.

---

## Referencias

- **ADR-139..146** en [`Architecture_Decisions.md`](Architecture_Decisions.md): decisiones de stack y CD.
- **[`Deploy_Koyeb.md`](Deploy_Koyeb.md)**: aprovisionamiento inicial.
- **[`Secrets_Rotation.md`](Secrets_Rotation.md)**: política rotación completa.
- **[`Proteccion_Datos_Menores.md`](Proteccion_Datos_Menores.md)**: política RGPD detallada.
- **Sentry**: https://sentry.io (login con cuenta del proyecto).
- **Koyeb**: https://koyeb.com.
- **Atlas**: https://cloud.mongodb.com.
- **Upstash**: https://upstash.com.
- **Cloudflare**: https://dash.cloudflare.com.
