# /frontend/Dockerfile
# Multi-stage build para aplicación React/Vite
# Autor: Samuel Blanchart Pérez
# Versión: 1.0.0

# ============================================
# STAGE 1: Build
# Compila la aplicación con Vite
# ============================================
FROM node:26-alpine AS builder

WORKDIR /app

# Argumento de construcción para la URL de la API
# Vite necesita que las variables empiecen por VITE_
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Modo de build de Vite. Por defecto `production` (bundle real de despliegue).
# Para sesiones de QA con sensor simulado se puede construir con
# `docker compose build --build-arg VITE_BUILD_MODE=development frontend`,
# que monta `window.__rfidSim` (gate dev-only en webSerialService.js).
ARG VITE_BUILD_MODE=production

# Instalar dependencias primero (aprovechar caché)
COPY package*.json ./
RUN npm ci

# Copiar código fuente y construir
COPY . .
RUN npm run build -- --mode ${VITE_BUILD_MODE}

# ============================================
# STAGE 2: Production
# Servidor Nginx optimizado
# ============================================
FROM nginx:alpine AS production

# Version de la aplicacion (sincronizar con package.json)
ARG APP_VERSION=1.0.0

# Metadatos OCI
LABEL org.opencontainers.image.title="RFID Games Frontend"
LABEL org.opencontainers.image.description="Frontend SPA for RFID educational games platform"
LABEL org.opencontainers.image.authors="Samuel Blanchart Pérez"
LABEL org.opencontainers.image.version="${APP_VERSION}"

# Copiar el build de Vite (carpeta dist)
COPY --from=builder /app/dist /usr/share/nginx/html

# Archivo nginx.conf personalizado (server block + locations)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Snippet DRY de cabeceras de seguridad. Va en `snippets/` (NO en `conf.d/`,
# que el image base auto-incluye en el bloque http) porque contiene directivas
# `add_header` válidas solo en contexto server/location; se incluye explícitamente
# desde nginx.conf en el server y en la location de assets.
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

# T-905 B4: zones globales (limit_req_zone) que requieren contexto http.
# Se copia con prefijo `00-` para garantizar carga ANTES de default.conf.
COPY nginx-zones.conf /etc/nginx/conf.d/00-zones.conf

# Puerto de la aplicación
EXPOSE 80

# Health check para nginx.
# Usa 127.0.0.1 (no `localhost`): dentro del contenedor `localhost` resuelve
# primero a IPv6 (::1), pero nginx solo escucha en IPv4 (`listen 80;`), de modo
# que `localhost` daria "connection refused" y marcaria el contenedor como
# unhealthy pese a servir correctamente. Forzar IPv4 evita el falso negativo.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/health || exit 1

# Comando de inicio
CMD ["nginx", "-g", "daemon off;"]