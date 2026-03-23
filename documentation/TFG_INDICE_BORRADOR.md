# Índice Borrador — Memoria TFG

## Plataforma de Juegos Educativos con RFID (Eduplay)

## Resumen / Abstract

Breve descripción del problema, solución propuesta, tecnologías clave y resultados obtenidos.
*(~300–400 palabras cada una)*

---

## Índice de contenidos

*(generado automáticamente al final)*

---

## Índice de figuras y tablas

*(generado automáticamente al final)*

---

## Glosario de términos y acrónimos

Definición de términos técnicos y acrónimos utilizados a lo largo del documento, como:

`RFID, UID, NFC, JWT, DTO, SSE, WS, ADR, CI/CD, ORM, CDN, SPA, IoT, ESP8266, RC522`…

---

## 1. Introducción

### 1.1 Motivación

Por qué una plataforma RFID para educación infantil (4–6 años). Brecha entre tecnología y aula. Dificultad de los métodos de evaluación tradicionales. Potencial pedagógico del aprendizaje gamificado y la interacción física.

### 1.2 Objetivos

#### 1.2.1 Objetivo general

Diseñar, implementar y validar una plataforma educativa interactiva que permita a profesores crear y supervisar sesiones de juego con tarjetas RFID físicas para alumnos de educación infantil.

#### 1.2.2 Objetivos específicos

- Diseñar un sistema full-stack seguro, escalable y desplegable en la nube.
- Integrar hardware RFID (ESP8266 + RC522) con el navegador del profesor vía Web Serial API.
- Implementar comunicación en tiempo real (Socket.IO) para gameplay reactivo.
- Proveer analítica pedagógica para que el profesor identifique puntos de mejora.
- Asegurar la privacidad y seguridad de datos de menores (GDPR).

#### 1.2.3 Objetivos de Desarrollo Sostenible (ODS)

ODS 4 (Educación de calidad), ODS 9 (Industria e innovación), ODS 10 (Reducción de desigualdades digitales en el aula).

### 1.3 Alcance y limitaciones

Qué cubre el proyecto y qué queda fuera (p. ej., aplicación móvil de alumnos, integración con LMS, soporte multi-sede, conectividad MQTT/WiFi del sensor).

### 1.4 Estructura del documento

Descripción párrafo a párrafo de cada capítulo.

---

## 2. Estado del Arte

### 2.1 Gamificación en educación infantil

Revisión de evidencia pedagógica: motivación, retención, retroalimentación inmediata. Comparativa con plataformas existentes (Kahoot, Quizlet, ClassDojo, Plickers).

### 2.2 Tecnología RFID en contextos educativos

Fundamentos de RFID (HF 13,56 MHz, MIFARE, NFC). Casos de uso en aulas documentados en la literatura. Limitaciones conocidas del protocolo Crypto-1 de MIFARE Classic (relevante para el análisis de seguridad, ver §6).

### 2.3 Arquitecturas de aplicaciones web en tiempo real

Comparativa WebSocket vs. SSE vs. Long Polling. Socket.IO como abstracción. Estado distribuido con Redis en entornos de alto ciclo de vida corto.

### 2.4 Web Serial API y acceso a hardware desde el navegador

Estado del estándar W3C. Compatibilidad Chrome/Edge. Comparativa con alternativas (Web USB, Bluetooth Web API). Implicaciones de seguridad (origen, HTTPS).

### 2.5 Seguridad en aplicaciones IoT educativas

OWASP Top 10 aplicado a IoT y APIs REST. Regulación GDPR/LOPDGDD en entornos con datos de menores.

---

## 3. Análisis de Requisitos

### 3.1 Descripción general del sistema

Visión de conjunto: sensor RFID → profesor → plataforma web → analítica.  
📄 *Material base:* [documentation/00-Requisitos.md](../documentation/00-Requisitos.md) §1

### 3.2 Actores del sistema

Tabla de roles: `super_admin`, `teacher`, `student`. Permisos, acceso y ciclo de vida de cuenta.  
📄 *Material base:* [documentation/00-Requisitos.md](../documentation/00-Requisitos.md) §1.2

### 3.3 Requisitos funcionales

Organizados por módulo:
- **RF-USR** — Gestión de usuarios y autenticación
- **RF-JGO** — Sistema de juego (sesiones, partidas, mecánicas)
- **RF-RFID** — Tarjetas, sensor y modos de escaneo
- **RF-ASSET** — Assets multimedia (imágenes, audio)
- **RF-RT** — Comunicación en tiempo real
- **RF-ADMIN** — Panel de administración y aprobación de profesores

📄 *Material base:* [documentation/00-Requisitos.md](../documentation/00-Requisitos.md)

### 3.4 Requisitos no funcionales

Seguridad (RNF-SEG), rendimiento (RNF-REN), calidad de código (RNF-CAL), accesibilidad, mantenibilidad.  
📄 *Material base:* [documentation/00-Requisitos.md](../documentation/00-Requisitos.md) §3

### 3.5 Modelo de dominio (diagrama de entidades)

Entidades principales: `User`, `Card`, `CardDeck`, `GameMechanic`, `GameContext`, `GameSession`, `GamePlay`. Relaciones y cardinalidades.

---

## 4. Diseño del Sistema

### 4.1 Arquitectura general

Monorepo con tres capas: firmware RFID, backend Node.js y frontend React. Diagrama de despliegue (cloud + navegador + sensor USB).  
📄 *Material base:* [backend/docs/Architecture_Decisions.md](../backend/docs/Architecture_Decisions.md), [documentation/02-Patrones_Diseno.md](../documentation/02-Patrones_Diseno.md)

### 4.2 Decisiones arquitectónicas (ADRs)

Las decisiones de diseño con mayor impacto transversal:
- **ADR-001** — Eliminación del límite duro de partidas simultáneas (soft-limit + monitorización)
- **ADR-002** — Autenticación obligatoria en WebSockets y sesión única
- **ADR-003** — Capa de DTOs v1 y contrato de respuestas uniforme
- **ADR-004** — Migración RFID de backend serial a Web Serial en cliente (cloud-readiness)

📄 *Material base:* [backend/docs/Architecture_Decisions.md](../backend/docs/Architecture_Decisions.md)

### 4.3 Diseño del hardware RFID

Componentes (ESP8266 Wemos D1 Mini, RC522 HW-126). Esquema de conexión SPI. Firmware en PlatformIO. Protocolo serie JSON a 115.200 baud. Tipos de tarjeta soportados (MIFARE 1K/4K, NTAG).  
📄 *Material base:* [rfid_scanner/README.md](../rfid_scanner/README.md), [backend/docs/RFID_Protocol.md](../backend/docs/RFID_Protocol.md) §3

### 4.4 Diseño del backend

#### 4.4.1 Arquitectura por capas

MVC + Service Layer + Repository + DTO. Diagrama de capas. Justificación de cada patrón.  
📄 *Material base:* [documentation/02-Patrones_Diseno.md](../documentation/02-Patrones_Diseno.md)

#### 4.4.2 Modelo de datos (MongoDB/Mongoose)

Esquemas de las seis entidades principales. Índices, relaciones por referencia. Decisión de datos compartidos vs. privados por profesor.  
📄 *Material base:* [backend/src/models/README.md](../backend/src/models/README.md)

#### 4.4.3 Sistema de autenticación y gestión de sesión

Doble token JWT (access 15 min + refresh 7 días). Rotación por familyId. Blacklist en Redis. Device fingerprinting. Single-session policy.  
📄 *Material base:* [backend/docs/Seguridad_tokens_JWT.md](../backend/docs/Seguridad_tokens_JWT.md), [backend/docs/Arquitectura_Redis.md](../backend/docs/Arquitectura_Redis.md)

#### 4.4.4 Motor de juego (GameEngine)

Estado en memoria + Redis. Ciclo de vida de una partida. Mecánicas intercambiables (Strategy Pattern). State Machine de rondas. Locks por partida (race hardening).  
📄 *Material base:* [backend/docs/RFID_Runtime_Flows.md](../backend/docs/RFID_Runtime_Flows.md), [backend/src/strategies/README.md](../backend/src/strategies/README.md), [backend/src/states/README.md](../backend/src/states/README.md)

#### 4.4.5 Sistema de assets multimedia

Upload con validación por magic bytes. Procesamiento con Sharp (WebP, thumbnails). Validación de audio MP3/OGG. Almacenamiento en Supabase Storage.  
📄 *Material base:* [backend/docs/AssetProcessing.md](../backend/docs/AssetProcessing.md)

#### 4.4.6 Arquitectura Redis

Casos de uso (blacklist, refresh tokens, estado de partidas, mapeo tarjeta→partida, security flags). Namespacing de claves. TTL automático. Comparativa con solución in-memory previa.  
📄 *Material base:* [backend/docs/Arquitectura_Redis.md](../backend/docs/Arquitectura_Redis.md)

### 4.5 Diseño de la integración RFID (Web Serial + Socket.IO)

Flujo completo: firmware → USB → Web Serial → normalización → Socket.IO → GameEngine. Modos de escaneo (gameplay, registro, asignación, idle). Contrato de evento `rfid_scan_from_client`. Validación de sensorId. Control de flujo de modos backend-authoritative.  
📄 *Material base:* [backend/docs/WebSerial_Architecture.md](../backend/docs/WebSerial_Architecture.md), [backend/docs/RFID_Protocol.md](../backend/docs/RFID_Protocol.md), [backend/docs/RFID_Runtime_Flows.md](../backend/docs/RFID_Runtime_Flows.md)

### 4.6 Diseño del frontend

#### 4.6.1 Arquitectura de la SPA

React 19 + React Router 7. Rutas protegidas por rol. AuthContext y ciclo refresh/invalidation. Lazy loading y error boundaries.  
📄 *Material base:* [frontend/docs/TFG_FRONTEND_ARQUITECTURA.md](../frontend/docs/TFG_FRONTEND_ARQUITECTURA.md), [frontend/docs/01-PATRONES-DISENO.md](../frontend/docs/01-PATRONES-DISENO.md)

#### 4.6.2 Sistema de diseño (Tailwind v4 + OKLCH)

Design tokens con directiva `@theme`. Espacio de color OKLCH para uniformidad perceptiva. CVA para variantes de componentes. Glassmorphism. Skeletons de alta fidelidad y eliminación de CLS.  
📄 *Material base:* [frontend/docs/TFG_FRONTEND_ARQUITECTURA.md](../frontend/docs/TFG_FRONTEND_ARQUITECTURA.md), [frontend/docs/Mejoras_TailwindCSS.md](../frontend/docs/Mejoras_TailwindCSS.md)

#### 4.6.3 Dashboard analítico del profesor

Visualizaciones (Recharts). Histograma de rendimiento global. Mapa de calor de dificultad (Scatter Plot contexto × mecánica). Métricas accionables para intervención pedagógica.  
📄 *Material base:* [frontend/docs/TFG_FRONTEND_ARQUITECTURA.md](../frontend/docs/TFG_FRONTEND_ARQUITECTURA.md), [documentation/Dashboard.md](../documentation/Dashboard.md)

### 4.7 Infraestructura y despliegue

Docker multi-stage (base/dev/prod). Variables de entorno y secretos. Reverse proxy y HTTPS. Upstash Redis en producción. CI/CD con GitHub Actions.  
📄 *Material base:* [docker/README.md](../docker/README.md), [documentation/02-Patrones_Diseno.md](../documentation/02-Patrones_Diseno.md) §Estado de Seguridad en CI

---

## 5. Implementación

### 5.1 Entorno de desarrollo

Stack de versiones (Node.js ≥24, React 19, Tailwind 4, MongoDB, Redis). Estructura del monorepo. Scripts de desarrollo.

### 5.2 Backend: aspectos de implementación relevantes

- Validación de entrada con Zod (esquemas por recurso, mensajes en español).
- Command Pattern para eventos Socket.IO.
- Logging estructurado con Pino: redacción de datos sensibles, sampling, scopes por componente.
- Manejo centralizado de errores (AppError, Sentry).
- WebSocket: autenticación en handshake, rate limiting por evento, caché de revalidación TTL.

📄 *Material base:* [backend/docs/WebSockets-ExtendedUsage.md](../backend/docs/WebSockets-ExtendedUsage.md), [backend/docs/Logging_Strategy.md](../backend/docs/Logging_Strategy.md), [backend/src/commands/README.md](../backend/src/commands/README.md)

### 5.3 Frontend: aspectos de implementación relevantes

- WebSerialService: conexión, backoff exponencial, reconexión automática, heartbeat.
- Integración React + Socket.IO (ciclo de vida de sockets, cleanup en `useEffect`).
- Wizard de creación de sesión: flujo multi-paso con validación por etapa.
- Componente RFIDModeHandler: indicador flotante de estado del sensor.

📄 *Material base:* [frontend/docs/04-ESTRUCTURA-PROYECTO.md](../frontend/docs/04-ESTRUCTURA-PROYECTO.md), [frontend/docs/02-BUENAS-PRACTICAS.md](../frontend/docs/02-BUENAS-PRACTICAS.md)

### 5.4 Firmware RFID

Código PlatformIO para ESP8266 + RC522. Optimizaciones: gain de antena, fallback anticollision para clones HW-126, modo bajo consumo entre lecturas. Protocolo de salida JSON (card_detected, card_removed, status heartbeat).  
📄 *Material base:* [rfid_scanner/README.md](../rfid_scanner/README.md)

### 5.5 Gestión de dependencias y deuda técnica

Política de auditoría (gate bloqueante runtime vs. informativo tooling). Dependabot mensual. KPIs de remediación.  
📄 *Material base:* [documentation/03-Gestion_Dependencias.md](../documentation/03-Gestion_Dependencias.md)

---

## 6. Seguridad

### 6.1 Modelo de amenazas

Actores de amenaza relevantes en el contexto escolar. Superficie de ataque: API REST, WebSocket, Web Serial, firmware.

### 6.2 Autenticación y gestión de tokens

Doble token con rotación. Detección de reuso de refresh token (familyId). Blacklist en Redis con TTL. Single-session y desconexión activa de sockets al invalidar sesión.  
📄 *Material base:* [backend/docs/Seguridad_tokens_JWT.md](../backend/docs/Seguridad_tokens_JWT.md)

### 6.3 Autorización y control de acceso

Middleware de roles. Verificación de propiedad de recursos (anti-IDOR). Validación de accountStatus y approved en handshake WebSocket.

### 6.4 Protección de la capa HTTP

Helmet + CSP personalizado. CORS por whitelist. CSRF con doble-submit cookie/header. Rate limiting granular por endpoint. Validación estricta de entrada con Zod.

### 6.5 Seguridad en la integración RFID

Validación server-side de sensorId en gameplay (anti-spoofing). Discusión de la viabilidad de clonación de tarjetas MIFARE Classic y mitigación en el contexto de uso. Race condition TOCTOU y solución de lock por partida.  
📄 *Material base:* [documentation/advanced_vulnerabilities.md](../documentation/advanced_vulnerabilities.md)

### 6.6 Seguridad en WebSockets

Autenticación obligatoria en handshake. Rate limiting por tipo de evento. Defensa contra CSWSH. Desconexión activa ante sesión inválida.  
📄 *Material base:* [backend/docs/Architecture_Decisions.md](../backend/docs/Architecture_Decisions.md) ADR-002, [documentation/advanced_vulnerabilities.md](../documentation/advanced_vulnerabilities.md)

### 6.7 Seguridad de assets y prevención de XSS

Validación por magic bytes (no solo por extensión). Conversión forzada a WebP (neutraliza SVG/XSS). Validación de dimensiones y tamaño máximo. Política de origen de Supabase Storage.  
📄 *Material base:* [backend/docs/AssetProcessing.md](../backend/docs/AssetProcessing.md), [documentation/supabase/SVG_vs_PNG.md](../documentation/supabase/SVG_vs_PNG.md)

### 6.8 Privacidad y cumplimiento normativo

Datos de menores de edad. Roles sin datos personales de alumnos en el sistema (alumnos solo interactúan con sensor). Logging sin PII. Consideraciones GDPR/LOPDGDD.

---

## 7. Pruebas y Calidad

### 7.1 Estrategia de testing

Pirámide de tests: unitarios, integración, e2e (si aplica). Herramientas: Jest + Supertest (backend).  
📄 *Material base:* [documentation/02-Patrones_Diseno.md](../documentation/02-Patrones_Diseno.md)

### 7.2 Cobertura de pruebas

Áreas cubiertas: auth, flujo de juego, game engine (lock, idempotencia), persistencia de eventos, health checks, métricas, procesamiento de assets, validación de entorno.  
*(Ver `backend/tests/` — 15+ ficheros de test identificados)*

### 7.3 Pipeline CI/CD

GitHub Actions: lint → test → audit:prod → SonarCloud. Gates bloqueantes y comprobaciones informativas.  
📄 *Material base:* [documentation/02-Patrones_Diseno.md](../documentation/02-Patrones_Diseno.md) §Estado de Seguridad en CI

### 7.4 Análisis estático y calidad de código

ESLint + Prettier. SonarCloud (cobertura, code smells, vulnerabilidades). Configuración de reglas.

---

## 8. Resultados

### 8.1 Funcionalidades implementadas

Tabla resumen de las funcionalidades entregadas por sprint (v0.1.0 → v0.2.0 → v0.3.0).  
📄 *Material base:* [CHANGELOG.md](../CHANGELOG.md)

### 8.2 Demostración del sistema

Capturas/vídeo del flujo completo: login → creación de sesión → partida activa → escaneo RFID → resultado en tiempo real → dashboard analítico.

### 8.3 Dashboard analítico: resultados

Ejemplos de visualizaciones generadas. Cómo interpreta el profesor el mapa de calor de dificultad. Valor pedagógico.

### 8.4 Métricas de rendimiento

Resultados del benchmark de lecturas de sesión (`benchmark-session-reads.js`). Latencia de handshake WebSocket. Throughput de GameEngine bajo carga.  
📄 *Material base:* [backend/docs/Performance_Notes.md](../backend/docs/Performance_Notes.md), [backend/scripts/README.md](../backend/scripts/README.md)

### 8.5 Cobertura de pruebas obtenida

Porcentaje de cobertura final por módulo (instrucciones, ramas, funciones). Referencia al informe de cobertura generado.

---

## 9. Conclusiones

### 9.1 Grado de cumplimiento de objetivos

Revisión uno a uno de los objetivos específicos del §1.2.

### 9.2 Lecciones aprendidas y dificultades encontradas

- Migración RFID backend-serial → Web Serial: motivación, proceso y resultado.
- Decisión de adoptar Redis: punto de inflexión en la arquitectura.
- Retos al implementar single-session con WebSockets.
- Complejidad del motor de juego con timers y locks concurrentes.

### 9.3 Líneas futuras de trabajo

- **MQTT/WiFi para el sensor:** eliminar dependencia del cable USB por aula.
- **Escalabilidad horizontal:** migración total del GameEngine a Redis para múltiples instancias.
- **Caché de claims en JWT:** reducir consultas MongoDB en handshake WebSocket.
- **Aplicación de alumno:** pantalla simplificada en tablet para visualización del desafío.
- **Integración con LMS** (Moodle, Google Classroom).
- **Soporte offline** (PWA) para entornos con conectividad limitada.

### 9.4 Valoración personal

Reflexión sobre el aprendizaje técnico y personal adquirido durante el proyecto.

---

## Referencias bibliográficas

*(formato IEEE o APA — a definir con el tutor)*

Incluirá referencias a:
- Especificaciones W3C Web Serial API
- RFC 7519 (JWT), RFC 6750 (Bearer Tokens)
- Documentación oficial de Socket.IO, Node.js, MongoDB, Redis
- Literatura sobre gamificación educativa
- MIFARE Classic security analysis (Nohl et al.)
- OWASP Top 10 (Web + API Security + IoT)
- Reglamento General de Protección de Datos (GDPR)

---

## Anexos

### Anexo A — API Reference

Tabla completa de los ~48 endpoints REST: método, ruta, auth requerida, descripción, body/query params clave.  
📄 *Material base:* [backend/docs/API_v0.3.0.md](../backend/docs/API_v0.3.0.md)

### Anexo B — Protocolo RFID y eventos WebSocket

Especificación del formato JSON del firmware. Tabla de eventos Socket.IO (cliente→servidor y servidor→cliente) con payload y condiciones de emisión.  
📄 *Material base:* [backend/docs/RFID_Protocol.md](../backend/docs/RFID_Protocol.md), [backend/docs/WebSockets-ExtendedUsage.md](../backend/docs/WebSockets-ExtendedUsage.md)

### Anexo C — Guía de despliegue

Pasos para levantar el entorno con Docker Compose (dev y prod). Variables de entorno requeridas. Primer arranque y seeding de datos.  
📄 *Material base:* [docker/README.md](../docker/README.md), [backend/seeders/README.md](../backend/seeders/README.md)

### Anexo D — Diagramas PlantUML

Catálogo de los diagramas de arquitectura generados: flujo RFID, estados del servicio, modos de escaneo, secuencia de inicio de partida, registro de tarjetas.  
📄 *Material base:* `backend/docs/diagrams/*.puml`

### Anexo E — Sprints de desarrollo

Resumen ejecutivo de cada sprint: objetivos, decisiones tomadas y deuda técnica identificada.  
📄 *Material base:* [documentation/Sprint1_Fallos.md](../documentation/Sprint1_Fallos.md), [documentation/Sprint2_Tareas.md](../documentation/Sprint2_Tareas.md), [documentation/Sprint3_Tareas.md](../documentation/Sprint3_Tareas.md), [documentation/Sprint4_Tareas.md](../documentation/Sprint4_Tareas.md)

---

## Mapa de ficheros del repositorio → secciones de la memoria

| Fichero del repositorio | Secciones donde se usa |
|---|---|
| `documentation/00-Requisitos.md` | §3 completo |
| `documentation/02-Patrones_Diseno.md` | §4.1, §4.4.1, §7.1, §7.3 |
| `documentation/03-Gestion_Dependencias.md` | §5.5, §7.3 |
| `documentation/advanced_vulnerabilities.md` | §6.1, §6.5, §6.6 |
| `documentation/Dashboard.md` | §4.6.3, §8.3 |
| `documentation/Sprint{1-4}_*.md` | Anexo E |
| `backend/docs/Architecture_Decisions.md` | §4.1, §4.2, §6.2, §6.6 |
| `backend/docs/Arquitectura_Redis.md` | §4.4.6, §6.2 |
| `backend/docs/Seguridad_tokens_JWT.md` | §4.4.3, §6.2 |
| `backend/docs/RFID_Protocol.md` | §4.3, §4.5, Anexo B |
| `backend/docs/WebSerial_Architecture.md` | §4.5, §5.3 |
| `backend/docs/RFID_Runtime_Flows.md` | §4.4.4, §4.5 |
| `backend/docs/WebSockets-ExtendedUsage.md` | §5.2, Anexo B |
| `backend/docs/AssetProcessing.md` | §4.4.5, §6.7 |
| `backend/docs/Logging_Strategy.md` | §5.2 |
| `backend/docs/Performance_Notes.md` | §8.4 |
| `backend/docs/API_v0.3.0.md` | Anexo A |
| `backend/docs/Flujos_Accion/` | §3.2, §4.4 |
| `frontend/docs/TFG_FRONTEND_ARQUITECTURA.md` | §4.6 completo |
| `frontend/docs/01-PATRONES-DISENO.md` | §4.6.1 |
| `frontend/docs/Mejoras_TailwindCSS.md` | §4.6.2 |
| `frontend/docs/CardDecks_Architecture.md` | §4.4.4 (CardDeck), §3.5 |
| `rfid_scanner/README.md` | §4.3, §5.4 |
| `docker/README.md` | §4.7, Anexo C |
| `CHANGELOG.md` | §8.1 |
| `documentation/supabase/SVG_vs_PNG.md` | §6.7 |
| `documentation/supabase/Supabase.md` | §4.4.5 |
