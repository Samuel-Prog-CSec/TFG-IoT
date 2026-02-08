# /frontend/Dockerfile
# Multi-stage build para aplicación React/Vite
# Autor: Samuel Blanchart Pérez
# Versión: 1.0.0

# ============================================
# STAGE 1: Build
# Compila la aplicación con Vite
# ============================================
FROM node:24-alpine AS builder

WORKDIR /app

# Argumento de construcción para la URL de la API
# Vite necesita que las variables empiecen por VITE_
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Instalar dependencias primero (aprovechar caché)
COPY package*.json ./
RUN npm ci

# Copiar código fuente y construir
COPY . .
RUN npm run build

# ============================================
# STAGE 2: Production
# Servidor Nginx optimizado
# ============================================
FROM nginx:alpine AS production

# Metadatos OCI
LABEL org.opencontainers.image.title="RFID Games Frontend"
LABEL org.opencontainers.image.description="Frontend SPA for RFID educational games platform"
LABEL org.opencontainers.image.authors="Samuel Blanchart Pérez"
LABEL org.opencontainers.image.version="0.2.0"

# Copiar el build de Vite (carpeta dist)
COPY --from=builder /app/dist /usr/share/nginx/html

# Archivo nginx.conf personalizado
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Puerto de la aplicación
EXPOSE 80

# Health check para nginx
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Comando de inicio
CMD ["nginx", "-g", "daemon off;"]