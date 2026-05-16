# Guía de contribución — TFG-IoT (EduPlay)

> Esta guía cubre el flujo de trabajo del repositorio: cómo escribir commits, abrir PRs, gestionar versiones y desplegar.
> Para el aprovisionamiento cloud inicial ver [`documentation/Deploy_Koyeb.md`](documentation/Deploy_Koyeb.md).
> Para la política de rotación de secretos ver [`documentation/Secrets_Rotation.md`](documentation/Secrets_Rotation.md).

---

## Convenciones de mensajes de commit

Usamos **Conventional Commits** (https://www.conventionalcommits.org/). El formato es:

```
<type>(<scope>)?: <subject>

[body opcional]
```

### Tipos permitidos (lo determinan `commitlint.config.cjs` y `release-please`)

| Tipo | Cuándo usarlo | Aparece en CHANGELOG |
|---|---|---|
| `feat` | Funcionalidad nueva | Sí, sección "Features" |
| `fix` | Corrección de bug | Sí, sección "Bug Fixes" |
| `perf` | Mejora de rendimiento sin cambiar comportamiento | Sí, sección "Performance" |
| `refactor` | Reorganización interna sin cambio funcional | Sí, sección "Refactor" |
| `docs` | Cambios sólo en documentación | Sí, sección "Documentation" |
| `deps` | Actualización de dependencias | Sí, sección "Dependencies" |
| `chore` | Mantenimiento que no encaja en otra categoría | Sí, sección "Mantenimiento" |
| `test` | Añadir o ajustar tests | No (hidden) |
| `ci` | Cambios en GitHub Actions o pipelines | No (hidden) |
| `build` | Configuración de build (vite, webpack, etc.) | No (hidden) |
| `style` | Formato, espacios, semicolons (no lógica) | No (hidden) |

### Breaking changes

Añade `!` después del scope para indicar breaking change. release-please bump-eará a **MAJOR**:

```
feat(api)!: cambiar contrato de /api/sessions
```

O usa el footer `BREAKING CHANGE:` con explicación.

### Reglas estrictas de este repo

- **Prohibido `Co-Authored-By:`** en el cuerpo del commit.
- **Prohibido incluir IDs de tareas** (`T-XXX`) en el subject o body — pertenecen a la PR description.
- **Prohibido incluir métricas o resultados** (`Tests: 1145/1145`, `Lint: 0 errors`) al final del commit — son ruido para CHANGELOG.
- Idioma: subject en español si el cambio es funcional, en inglés si afecta API/contratos públicos. **Identificadores de código siempre en inglés.**

Ejemplos válidos:

```
feat(deploy): scaffolding cloud Koyeb + Atlas + Upstash con runbook
fix(auth): validar formato de email antes de hash de password
docs: añadir ADR-141 sobre probes liveness/readiness
refactor(redis): extraer rate limiter store a factory diferida
```

Ejemplos **inválidos**:

```
feat: nueva feature
Adds login                            # falta type
T-901: deploy a Koyeb                 # incluye T-901
fix(login): correct bug

Co-Authored-By: Alice <a@b.com>       # prohibido
Tests: 1145/1145                      # prohibido
```

---

## Flujo de ramas

```
main         ── rama protegida, estado de producción. Sólo recibe merges
                desde PRs aprobados o desde el PR que abre release-please.
                Un tag `v*` empujado a main dispara deploy-production.yml.

Maintenance  ── rama estable de mantenimiento (hotfixes, parches). Cada
                push verde en CI dispara deploy-staging.yml para validar
                en entorno staging antes de cherry-pick a main.

develop      ── rama de integración para features grandes. No despliega
                automáticamente; se merge a Maintenance o a main vía PR
                cuando una feature está lista.

feature/*    ── ramas de feature (ej. `feature/cloud-foundation-and-cd`).
                Se mergean a develop o directamente a main según alcance.
                Si la variable `PREVIEW_DEPLOYS_ENABLED=true` está activa
                en el repo, cada PR genera un preview backend en Koyeb.
```

### Workflow recomendado para un cambio

1. Sincroniza `main` localmente: `git checkout main && git pull`.
2. Crea una rama de feature: `git checkout -b feature/<descripción-corta>`.
3. Implementa con commits frecuentes y mensajes conventional.
4. Lanza tests y lint local: `npm test && npm run lint` en `backend/` y `frontend/`.
5. Abre PR a `main` (cambios pequeños/aislados) o a `develop` (features grandes).
6. CI verde + revisión + merge.
7. release-please mantiene un PR "chore: release vX.Y.Z" con el CHANGELOG; cuando se mergea, crea el tag y dispara deploy-production.

---

## Versionado y releases

### Política semver

| Bump | Cuándo | Ejemplo |
|---|---|---|
| **MAJOR** (1.0.0 → 2.0.0) | Breaking change (commit con `!` o `BREAKING CHANGE:`) | `feat(api)!: cambiar respuesta de /api/users` |
| **MINOR** (1.0.0 → 1.1.0) | Nueva funcionalidad retrocompatible (commit `feat:`) | `feat(deploy): añadir webhook de Sentry` |
| **PATCH** (1.0.0 → 1.0.1) | Bug fix o cambio interno (`fix:`, `perf:`, `refactor:`) | `fix(auth): timeout JWT mal calculado` |

### Cómo se hace un release

1. Después de mergear cambios a `main`, release-please actualiza/abre un PR titulado `chore: release vX.Y.Z`.
2. Ese PR contiene:
   - Bump de versión en `package.json`, `backend/package.json`, `frontend/package.json`.
   - Actualización de `.release-please-manifest.json`.
   - Entrada nueva en `CHANGELOG.md` con todos los commits desde el último tag.
3. Revisa el CHANGELOG y aprueba el PR.
4. Al mergear, release-please crea el tag `vX.Y.Z` automáticamente.
5. El tag dispara `deploy-production.yml`, que pasa por el approval gate del environment `production`.
6. Aprueba el deploy desde la UI de GitHub → deploy-production hace redeploy en Koyeb + smoke test + GitHub Release.

### Hotfix urgente sin esperar al ciclo de release

```bash
git checkout main
git checkout -b fix/hotfix-descripcion
# ... commit ...
git push -u origin fix/hotfix-descripcion
# Abrir PR a main, mergear
# Crear tag manualmente: git tag v1.0.1 && git push --tags
# El push del tag dispara deploy-production.yml
```

---

## CI/CD overview

| Workflow | Trigger | Hace |
|---|---|---|
| `build.yml` (CI) | Push/PR en `main`, `develop`, `Maintenance` | Lint, audit, tests, build, SonarCloud |
| `deploy-staging.yml` | `workflow_run` con CI verde en `Maintenance` | Redeploy api-staging + worker-staging en Koyeb |
| `deploy-production.yml` | Push de tag `v*` o `workflow_dispatch` | Redeploy api-prod + worker-prod con approval gate |
| `release-please.yml` | Push a `main` | Mantiene PR de release con CHANGELOG |
| `preview-deploy.yml` | PR opened/sync/closed (sólo si `PREVIEW_DEPLOYS_ENABLED=true`) | Crea/destruye servicio efímero `api-pr-<N>` |

### Secrets requeridos en el repo

| Secret | Usado por | Cómo obtenerlo |
|---|---|---|
| `KOYEB_API_TOKEN` | deploy-staging, deploy-production, preview-deploy | Koyeb dashboard → Account → API Tokens |
| `KOYEB_API_STAGING_NAME` | deploy-staging | Nombre del servicio (`api-staging` por defecto) |
| `KOYEB_WORKER_STAGING_NAME` | deploy-staging | Nombre del worker (`worker-staging` por defecto) |
| `KOYEB_API_PROD_NAME` | deploy-production | Nombre del servicio (`api-prod` por defecto) |
| `KOYEB_WORKER_PROD_NAME` | deploy-production | Nombre del worker (`worker-prod` por defecto) |
| `KOYEB_ORG` | preview-deploy | Slug de la organización Koyeb (para construir URLs) |
| `KOYEB_STAGING_URL` | deploy-staging | URL pública del api-staging |
| `KOYEB_PROD_URL` | deploy-production | URL pública del api-prod |
| `SONAR_TOKEN` | build.yml | SonarCloud → My Account → Security → Generate Tokens |
| `RELEASE_PLEASE_TOKEN` (opcional) | release-please.yml | PAT con `contents:write` + `pull_requests:write` si el GITHUB_TOKEN no basta para disparar workflows reactivos |

### Variables del repo (no son secrets)

| Variable | Usado por | Valor |
|---|---|---|
| `PREVIEW_DEPLOYS_ENABLED` | preview-deploy | `true` para activar previews por PR; cualquier otra cosa = desactivado (default) |

---

## Approval gate de producción

Configurar en repo Settings → Environments → New environment → `production`:

- ✅ Required reviewers: añadir tu cuenta (y/o miembros del equipo).
- ✅ Wait timer: 0 minutos.
- ✅ Deployment branches: "Selected branches and tags" → tag pattern `v*`.

Cuando un tag dispare `deploy-production.yml`, el job entra en estado `Waiting` y notifica a los reviewers. El deploy continúa sólo tras aprobación manual.

---

## Tests locales

```bash
# Backend (Jest + MongoDB local)
cd backend
npm test
npm run lint

# Frontend (Vitest)
cd frontend
npm test -- --run
npm run lint

# Audit (deps de producción)
npm run audit:prod    # en root corre backend + frontend
```

Los hooks de husky corren `lint:staged` + tests relacionados en cada commit. Si fallan, el commit no se completa.

---

## Cómo NO romper algo

- **No tocar `.github/workflows/build.yml`** salvo causa concreta y revisada — es la base del CI y rompe todo si falla. Añade workflows nuevos en archivos separados.
- **No commitear `.env`** ni ningún archivo con secretos reales. El `.gitignore` cubre `.env`, `.env.local`, `.env.*.local`. Verifica con `git check-ignore .env`.
- **No usar `git push --force` contra `main` o `Maintenance`.** Si necesitas reescribir historia, hazlo en tu rama de feature antes del merge.
- **No mergear directamente a `main` sin PR.** Las ramas protegidas requieren CI verde + 1 review.
- **No saltar el approval gate de producción.** Si urge un deploy y no hay tiempo para aprobación, comunícalo en Slack/equipo y aprueba con conciencia — está ahí por algo.

---

## Referencias

- **ADR-139..145** en [`documentation/Architecture_Decisions.md`](documentation/Architecture_Decisions.md): decisiones de stack cloud y CD.
- **[`documentation/Deploy_Koyeb.md`](documentation/Deploy_Koyeb.md)**: aprovisionamiento desde cero.
- **[`documentation/Secrets_Rotation.md`](documentation/Secrets_Rotation.md)**: política rotación.
- **Conventional Commits**: https://www.conventionalcommits.org/
- **release-please**: https://github.com/googleapis/release-please
