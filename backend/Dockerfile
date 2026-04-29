# /backend/Dockerfile
# Multi-stage build para aplicación Node.js
# Autor: Samuel Blanchart Pérez
# Versión: 1.0.0

# ============================================
# STAGE 1: Dependencies
# Instala todas las dependencias
# ============================================
FROM node:24-alpine AS deps

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias (incluyendo dev para build)
RUN npm ci && npm cache clean --force

# ============================================
# STAGE 1.5: Development
# Imagen con dependencias de desarrollo
# ============================================
FROM node:24-alpine AS development

ENV NODE_ENV=development
WORKDIR /app

COPY package*.json ./
RUN npm ci && npm cache clean --force

COPY src/ ./src/
COPY seeders/ ./seeders/
COPY scripts/ ./scripts/
COPY worker.js ./worker.js

EXPOSE 5000

CMD ["npm", "run", "dev"]

# ============================================
# STAGE 2: Production
# Imagen final optimizada para producción
# ============================================
FROM node:24-alpine AS production

# Version de la aplicacion (sincronizar con package.json)
ARG APP_VERSION=0.5.0

# Metadatos OCI
LABEL org.opencontainers.image.title="RFID Games Backend"
LABEL org.opencontainers.image.description="Backend API for RFID educational games platform"
LABEL org.opencontainers.image.authors="Samuel Blanchart Pérez"
LABEL org.opencontainers.image.version="${APP_VERSION}"

# Configuración de entorno
ENV NODE_ENV=production
WORKDIR /app

# Copiar package.json para npm scripts
COPY package*.json ./

# Instalar SOLO dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# Copiar código fuente necesario
COPY src/ ./src/
COPY seeders/ ./seeders/
COPY scripts/ ./scripts/
# worker.js es el entry-point del proceso BullMQ (ADR-077, PROP-62)
COPY worker.js ./worker.js

# Permisos seguros - usuario non-root
RUN chown -R node:node /app
USER node

# Puerto de la aplicación
EXPOSE 5000

# Health check - verifica que el servidor responde
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Comando de inicio
CMD ["node", "src/server.js"]