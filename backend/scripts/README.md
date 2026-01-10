# Scripts de Backend

Este directorio contiene scripts de utilidad para el mantenimiento y desarrollo del backend.

## Scripts Disponibles

### `drop-db.js`

Elimina completamente la base de datos configurada en las variables de entorno.

- **Uso**: `node scripts/drop-db.js`
- **Requisitos**: Archivo `.env` configurado con `MONGO_URI`.
- **Seguridad**:
  - Solicita confirmación interactiva (S/N).
  - **No funciona en producción** (`NODE_ENV=production`).
