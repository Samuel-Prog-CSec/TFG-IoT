# docker/archive — assets legados de Docker producción

Este directorio recoge los assets de Docker que se utilizaban cuando el
proyecto se desplegaba en producción mediante Docker Compose (Sprint 5).

Desde Sprint 6 el despliegue real de producción se hace en **Koyeb**
(backend + worker) y **Cloudflare Pages** (frontend). El compose que
vivía en raíz se mueve aquí para evitar dos cosas:

1. Que un contributor nuevo piense que sigue siendo el método de
   despliegue oficial.
2. Que el fichero se desactualice silenciosamente al no formar parte
   del flujo activo.

## Contenido

- `docker-compose.prod.yml` — antiguo override de producción. Combina
  `restart: always`, límites de recursos, puertos internos no expuestos,
  logging rotado y `command: --maxmemory-policy noeviction` para Redis.

## Cuándo usarlo

Este compose **sigue siendo útil** para validar localmente un build
representativo de producción antes de cortar un tag y disparar el deploy
a Koyeb. Algunas situaciones típicas:

- Reproducir un bug que solo aparece bajo `NODE_ENV=production`.
- Validar que el bundle frontend final se sirve correctamente con Nginx.
- Verificar que el seed/migrations no se ejecuta accidentalmente en
  producción (`SEED_ON_BOOT=false` por defecto).
- Probar la configuración de logging rotado sin pedir acceso a Koyeb.

## Comando de uso

Desde la raíz del repositorio:

```bash
docker compose -f docker-compose.yml -f docker/archive/docker-compose.prod.yml up -d
```

> Nota: la ruta es relativa al repositorio, no al directorio `docker/`.

## Documentación oficial de producción

- Despliegue real: [`documentation/Deploy_Koyeb.md`](../../documentation/Deploy_Koyeb.md).
- Guía paso a paso (operador): [`development/DEPLOY_GUIA_COMPLETA.md`](../../development/DEPLOY_GUIA_COMPLETA.md).
- Runbook operacional: [`documentation/Runbook_Operacional.md`](../../documentation/Runbook_Operacional.md).
- Presupuesto free-tier: [`documentation/Free_Tier_Budget.md`](../../documentation/Free_Tier_Budget.md).
