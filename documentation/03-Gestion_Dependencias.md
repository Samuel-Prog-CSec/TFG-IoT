# 03-Gestion_Dependencias

Proyecto: Plataforma de Juegos Educativos con RFID (TFG)

Estado: Activo
Version: 1.0
Ultima actualizacion: 2026-02-19

## Objetivo

Definir un proceso profesional de gestion, revision y mantenimiento de dependencias que reduzca riesgo de seguridad en produccion sin degradar estabilidad del desarrollo.

## Politica de Riesgo

### 1) Gate bloqueante de seguridad (produccion)

- Comando oficial: `npm run audit:prod`
- Alcance: backend y frontend con `--omit=dev`
- Regla: si falla, no se hace merge.

### 2) Reporte informativo (tooling)

- Comando oficial: `npm run audit:all`
- Alcance: root + backend + frontend (incluye devDependencies)
- Regla: no bloquea CI, pero genera deuda tecnica que debe revisarse en la cadencia definida.

## Cadencia Operativa

### Flujo mensual (automatizado)

- Dependabot abre PRs mensuales para:
  - `backend` (npm)
  - `frontend` (npm)
  - `github-actions`

### Flujo mensual (operativo)

En cada revision mensual se ejecuta el siguiente checklist:

1. Ejecutar `npm run audit:all` y registrar severidades.
2. Revisar PRs abiertos de Dependabot y priorizar:
   - Parches/menores de runtime primero.
   - Actualizaciones de tooling con impacto controlado.
3. Aplicar actualizaciones seguras y validar:
   - `npm --prefix backend run lint`
   - `npm --prefix backend test`
   - `npm --prefix frontend run lint`
   - `npm --prefix frontend run build`
4. Cerrar ciclo mensual con estado resumido:
   - vulnerabilidades prod (objetivo: 0)
   - vulnerabilidades tooling pendientes
   - acciones siguientes

## Criterios de Priorizacion

1. Criticas/High en runtime (produccion) -> inmediata
2. Moderate en runtime -> siguiente iteracion
3. High en tooling -> en el siguiente ciclo mensual
4. Moderate/Low en tooling -> por lote, segun compatibilidad

## Regla de Estabilidad

No aplicar overrides globales agresivos para forzar 0 vulnerabilidades en tooling cuando rompan `eslint`, `jest` o build.

Se prioriza:

- seguridad efectiva de produccion
- continuidad operativa de CI/CD
- remediacion progresiva y trazable de deuda tecnica

## Roles y Responsabilidades (RACI ligero)

- Responsable tecnico: Ingenieria backend/frontend (senior)
- Aprobador de politica: Lead del proyecto
- Ejecutores: equipo de desarrollo
- Informados: tutor/PM del TFG

## Comandos Estandar

```bash
# Gate bloqueante
npm run audit:prod

# Reporte completo
npm run audit:all

# Auditorias detalladas por paquete
npm --prefix backend run audit:full:json
npm --prefix backend run audit:prod:json
npm --prefix frontend run audit:full:json
npm --prefix frontend run audit:prod:json
```

## KPIs Minimos

- Vulnerabilidades runtime abiertas: 0
- Tiempo de remediacion runtime high/critical: < 48h
- Tiempo de remediacion runtime moderate: < 14 dias
- Tendencia de vulnerabilidades de tooling: decreciente por trimestre

## Referencias

- CI: `.github/workflows/build.yml`
- Dependabot: `.github/dependabot.yml`
- Politica de seguridad: `documentation/Security_Maintenance.md`
- Arquitectura: `documentation/02-Patrones_Diseno.md`
- ADR de dependencias: `backend/docs/Architecture_Decisions.md`
