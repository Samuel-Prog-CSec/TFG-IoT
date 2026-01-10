# Changelog

Todas las notas notables de cambios en este proyecto serán documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-01-09

### Añadido

- **Super Admin:** Rol `super_admin` con capacidad de aprobar/rechazar nuevos profesores. Endpoint de aprobación de usuarios.
- **Sesiones:** Implementada sesión única por dispositivo (invalida sesiones anteriores automáticamente).
- **Redis:** Integración completa con Redis para:
  - Blacklist de tokens y rotación de refresh tokens (7 días).
  - Persistencia de estados de partida (GamePlay).
  - Rate limiting y caché distribuida.
- **Pausa/Reanudación:** Funcionalidad para pausar y reanudar partidas en tiempo real (congelando el timer).
- **Mazos de Cartas (CardDecks):** Sistema para que los profesores creen, guarden y reutilicen configuraciones de cartas.
- **Gestión de Assets:**
  - Nuevos servicios: `imageProcessingService` y `audioValidationService`.
  - Validación estricta por "magic bytes".
  - Conversión automática de imágenes a WebP y generación de thumbnails.
  - Soporte exclusivo para audio MP3/OGG.
- **Transferencias:** Endpoint para transferir alumnos entre profesores manteniendo sus métricas.
- **Infraestructura:**
  - Script `drop-db` para desarrollo.
  - Health checks (`/health`) y endpoint de métricas (`/api/metrics`).
  - Configuración robusta de puerto serie con detección automática.

### Cambiado

- **Seguridad:** SVG eliminado de formatos permitidos por riesgo XSS. Solo WebP para imágenes.
- **Límites:** Eliminado límite duro de partidas simultáneas (ahora es warning suave).
- **Modelos:** Actualizado modelo `User` con `accountStatus` y `currentSessionId`.
- **API:** Endpoints de assets separados en `/images` y `/audio` con validaciones específicas.

### Documentación

- **Protocolo RFID:** Documentación técnica completa con diagramas de secuencia y estados en `backend/docs/RFID_Protocol.md`.
- **Arquitectura:** Nuevos diagramas PlantUML para la arquitectura del sistema y flujos de datos.

## [0.1.0] - 2025-12-15

### Añadido

- **Autenticación:** Sistema completo JWT con Access/Refresh tokens y validación de roles.
- **Gestión de Usuarios:** CRUD para profesores y estudiantes.
- **Hardware RFID:** Integración con servicio `serialport` y simulación para desarrollo.
- **Motor de Juego:** `GameEngine` con soporte para WebSocket (Socket.IO) en tiempo real.
- **Mecánicas:** Base para mecánicas de juego, comenzando con asociación simple.
- **Tests:** Suite completa de tests e2e e integración (Auth, Flujo de Juego, Serial).
- **Documentación:** API REST documentada en `/docs/API_v0.1.0.md`.

### Corregido

- Solucionado problema de "Open Handles" en tests (timers de auth y RFID).
- Resuelto conflicto de nombres en `ValidationError` (error 500).
- Configuración de seguridad ajustada para entornos de test.
