# Diseño: borrado de contexto con archivado en cascada guiado (Opción C)

**Fecha:** 2026-07-05
**Alcance:** Full-stack (backend + frontend)
**Estado:** Aprobado por Samuel (opción C de las tres presentadas)

## Problema

El borrado de contexto (`DELETE /api/contexts/:id`, super_admin) usa una política *restrict*
que en la práctica produce un deadlock: las sesiones jugadas quedan en estado `active` para
siempre (el endpoint `endSession` existe pero ningún componente de la UI lo llama), las
sesiones jugadas no se pueden eliminar (guard de partidas asociadas), y por tanto el contexto
es imposible de borrar desde la UI. Además, el 409 es genérico: el controller calcula el
desglose de dependencias y lo descarta.

Dos agujeros de integridad adicionales en la política actual:
1. Las sesiones `completed` sobreviven al borrado con `contextId` colgante y URLs muertas en
   sus snapshots, y son re-iniciables (`start()` sobre completada).
2. Los mazos archivados pueden des-archivarse (`PUT /decks/:id` con `status: 'active'`)
   tras borrar su contexto → mazo activo con URLs muertas.

## Decisión

Borrar un contexto ejecuta un **archivado en cascada**: el historial educativo se conserva
degradado a "solo consulta"; los archivos de Storage se borran de verdad. Las partidas
(GamePlay) no guardan URLs de assets (verificado), por lo que analytics e historial son
inmunes.

### Modelo mental

| Entidad | Al borrar su contexto | Razón |
|---|---|---|
| Assets + archivos Storage | Borrado real (Mongo primero, Storage best-effort después — patrón H2 existente) | Recursos del sistema, sin historia propia |
| Mazos del contexto (cualquier estado) | `status: 'archived'` + no restaurables | Material de trabajo; sin contexto no funcionan |
| Sesiones borrador (`created`, 0 partidas) | Eliminadas | Sin historia; conservarlas solo genera ruido |
| Sesiones jugadas (`active`/`completed`) | Pasan a `completed` y degradan a "solo historial" | Contenedor del registro educativo |
| Partidas (GamePlay) | Intactas | Registro educativo; alimentan analytics |

### Backend

1. **`GET /api/contexts/:id/deletion-impact`** (super_admin, nuevo): inventario previo para
   el modal — `{ activePlays, decksToArchive, draftSessionsToDelete, sessionsToComplete,
   playsPreserved, teachersAffected }`.
2. **`DELETE /api/contexts/:id`** (cascada):
   - Único bloqueo (409 accionable con conteo): partidas `in-progress`/`paused` en sesiones
     del contexto.
   - En `withTransaction` (operaciones secuenciales, sin `Promise.all` intra-transacción):
     eliminar sesiones borrador → completar sesiones activas (`endedAt = now`) → archivar
     mazos del contexto → borrar el documento del contexto.
   - Post-commit: limpieza de Storage best-effort e invalidación de cachés (contexto +
     `teacherSessions` de los docentes afectados).
   - Respuesta con resumen de lo ejecutado (para el toast).
3. **Flag `resourcesAvailable`** en el DTO de sesión (adjuntado por los controllers de
   listado y detalle, patrón `playStats`): `existe contexto poblado && mazo poblado con
   status 'active'`. Cubre también el caso "docente archivó su mazo a mano".
4. **Guard de des-archivado**: `PUT /decks/:id` rechaza `status: 'active'` si el contexto
   del mazo ya no existe (409 con mensaje claro).

Los guards de re-juego/edición/clonado ya existen transitivamente: `startSession`,
`updateSession` y `cloneSession` resincronizan siempre contra el mazo y rechazan mazos
no activos.

### Frontend

1. **AdminContexts**: el flujo de borrado pasa a dos tiempos — fetch de `deletion-impact` →
   `ConfirmationModal` con el inventario real (qué se archiva, qué se conserva, docentes
   afectados). Si hay partidas en curso, se muestra el motivo y el confirm queda
   deshabilitado. Éxito → toast con resumen.
2. **SessionsPage / SessionDetail**: cuando `resourcesAvailable === false` → badge
   "Recursos no disponibles", botones Jugar / Volver a jugar / Editar deshabilitados con
   tooltip explicativo (patrón ya existente en las cards), "Ver detalle" siempre activo.
3. **Miniaturas rotas**: ya cubierto — `CardAssetPreview` reintenta ×2 y degrada a etiqueta
   de texto sobre la tarjeta blanca. Sin trabajo nuevo.

### Fuera de alcance

- Job de reconciliación Mongo↔Storage (se documenta como regla operativa en el Runbook:
  el bucket nunca se toca a mano).
- Botón "Finalizar sesión" en la UI del docente: deja de ser necesario para el borrado
  (la cascada completa las sesiones); se puede valorar aparte como gestión de ciclo de vida.

## Testing

- Jest (backend): impact endpoint; cascada (borradores eliminados, activas completadas,
  mazos archivados, contexto borrado); bloqueo con partida en curso; guard de des-archivado;
  flag `resourcesAvailable` en listado/detalle.
- Vitest (frontend): card de sesión degradada (badge + disabled + tooltip); modal de
  impacto en AdminContexts.
- E2E (Docker + Playwright): ciclo completo real, incluido el guard de partida en curso.
