# /backend/Dockerfile

# 1. Usamos una imagen base ligera de Node 24
FROM node:24-alpine

# 2. Directorio de trabajo dentro del contenedor
WORKDIR /app

# 3. Copiamos solo los archivos de dependencias primero (para aprovechar caché de Docker)
COPY package*.json ./

# 4. Instalamos dependencias (usamos 'npm ci' para entornos limpios/producción)
RUN npm ci --only=production

# 5. Copiamos el resto del código fuente
COPY . .

# 6. Exponemos el puerto
EXPOSE 5000

# 7. Usuario no-root por seguridad
USER node

# 8. Comando de inicio
CMD ["npm", "start"]