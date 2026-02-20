# Scripts de Backend

Este directorio contiene scripts de utilidad para el mantenimiento y desarrollo del backend.

## Scripts Disponibles

### `benchmark-session-reads.js`

Benchmark reproducible de latencia para endpoints de lectura de sesiones:

- `GET /api/sessions`
- `GET /api/sessions/:id`

Compara dos modos:

1. **baseline** sin `lean` (`SESSION_READ_LEAN_ENABLED=false`)
2. **optimizado** con `lean` (`SESSION_READ_LEAN_ENABLED=true`)

Uso:

- `npm run bench:sessions`

Variables opcionales:

- `SESSION_READ_BENCH_ITERATIONS` (default: `120`)
- `SESSION_READ_BENCH_WARMUP` (default: `20`)
- `SESSION_READ_BENCH_SESSIONS` (default: `60`)
- `SESSION_READ_BENCH_LIMIT` (default: `100`)
- `MONGO_URI` o `TEST_MONGO_URI` (requerido)

Variables internas de comparación (gestionadas automáticamente por el script):

- `SESSION_READ_LEAN_ENABLED`

Salida:

- Reporte JSON con `avgMs`, `p95Ms`, `p99Ms` e `improvement` porcentual baseline vs optimizado.

### `drop-db.js`

Elimina completamente la base de datos configurada en las variables de entorno.

  - Solicita confirmación interactiva (S/N).
  - **No funciona en producción** (`NODE_ENV=production`).


### `seed-if-empty.js`

Ejecuta los seeders solo si la base de datos esta vacia.

- **Uso**: `node scripts/seed-if-empty.js`
- **Requisitos**: Archivo `.env` configurado con `MONGO_URI`.
- **Comportamiento**:
  - Si la BD tiene datos, no hace cambios.
  - Si la BD esta vacia, ejecuta todos los seeders en orden.
