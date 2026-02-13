# Scripts de Backend

Este directorio contiene scripts de utilidad para el mantenimiento y desarrollo del backend.

## Scripts Disponibles

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
