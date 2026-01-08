# ETAPA 1: Construcción
FROM node:24-alpine as builder
WORKDIR /app

# Argumento de construcción para la URL de la API
# Vite necesita que las variables empiecen por VITE_
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ETAPA 2: Servidor Nginx
FROM nginx:alpine
# Copiamos el build de Vite (carpeta dist)
COPY --from=builder /app/dist /usr/share/nginx/html
# Archivo nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]