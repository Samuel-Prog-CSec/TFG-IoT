# Requisitos No Funcionales - Rendimiento y Escalabilidad

## RNF-REN: Rendimiento del Sistema

---

## Rendimiento (RNF-REN-001 a RNF-REN-006)

### RNF-REN-001: Búsqueda O(1) de Tarjetas ✅

**Descripción:** La búsqueda de partidas por UID de tarjeta debe ser O(1).

**Implementación:**

- Mapa `cardUidToPlayId`: Map<uid, playId>
- Mapa `uidToMapping`: Map<uid, cardMapping> por partida
- Eliminación de iteración sobre todas las partidas activas

**Beneficio:** Latencia constante independiente del número de partidas activas.

---

### RNF-REN-002: Denormalización de Datos ✅

**Descripción:** Datos frecuentemente accedidos deben estar denormalizados.

**Implementaciones:**

- UID incluido en `GameSession.cardMappings`
- Evita JOINs a colección de tarjetas
- Compensación: Mayor uso de almacenamiento

---

### RNF-REN-003: Compresión de Respuestas ✅

**Descripción:** Las respuestas HTTP deben comprimirse para reducir ancho de banda.

**Configuración:**

- Middleware: compression
- Threshold: 1KB (no comprimir si < 1KB)
- Algoritmo: gzip/deflate según Accept-Encoding

---

### RNF-REN-004: Connection Pooling MongoDB ✅

**Descripción:** La conexión a MongoDB debe usar connection pooling.

**Configuración Mongoose:**

- Pool de conexiones gestionado automáticamente
- Reconexión automática
- Timeout configurable

---

### RNF-REN-005: Índices de Base de Datos ✅

**Descripción:** Las colecciones deben tener índices optimizados para las consultas frecuentes.

**Índices Implementados:**

| Colección | Índice | Propósito |
|-----------|--------|-----------|
| users | `{ role: 1 }` | Filtrar por rol |
| users | `{ status: 1 }` | Filtrar por estado |
| users | `{ role: 1, 'profile.classroom': 1 }` | Alumnos por aula |
| users | `{ createdBy: 1 }` | Alumnos por profesor |
| cards | `{ status: 1 }` | Tarjetas activas |
| game_sessions | `{ status: 1 }` | Sesiones activas |
| game_sessions | `{ mechanicId: 1 }` | Sesiones por mecánica |
| game_sessions | `{ contextId: 1 }` | Sesiones por contexto |
| gameplays | `{ sessionId: 1, playerId: 1, status: 1 }` | Partida activa de jugador |
| gameplays | `{ playerId: 1 }` | Historial de jugador |
| game_mechanics | `{ isActive: 1 }` | Mecánicas activas |

---

### RNF-REN-006: Latencia de Tiempo Real ✅

**Descripción:** Los eventos en tiempo real deben tener baja latencia.

**Criterios de Aceptación:**

- WebSocket preferido sobre polling
- Ping/Pong cada 25 segundos
- Timeout de 60 segundos
- Delay de feedback: 4 segundos (respuestas), 2 segundos (timeout)

---

## Escalabilidad (RNF-REN-007 a RNF-REN-012)

### RNF-REN-007: Límite de Partidas Activas ✅

**Descripción:** El sistema debe limitar las partidas simultáneas para proteger recursos.

**Configuración:**

- Variable: MAX_ACTIVE_PLAYS
- Default: 1000 partidas
- Error 503 si se alcanza el límite

---

### RNF-REN-008: Cleanup Automático ✅

**Descripción:** Las partidas abandonadas deben limpiarse automáticamente.

**Configuración:**

- Intervalo: 5 minutos
- Timeout de partida: 1 hora (PLAY_TIMEOUT_MS)
- Métricas de partidas canceladas

---

### RNF-REN-009: Graceful Shutdown ✅

**Descripción:** El servidor debe cerrarse de forma ordenada.

**Secuencia:**

1. Recibir señal SIGTERM/SIGINT
2. Dejar de aceptar nuevas conexiones
3. Finalizar partidas activas (gameEngine.shutdown())
4. Desconectar sensor RFID
5. Cerrar conexión a MongoDB
6. Timeout de 30 segundos para forzar salida

---

### RNF-REN-010: Estado en Memoria vs BD ✅

**Descripción:** El estado de partidas activas se mantiene en memoria con persistencia periódica.

**Implementación:**

- Estado volátil en `GameEngine.activePlays`
- Eventos guardados en BD (`GamePlay.events`)
- Score actualizado en BD tras cada evento
- Métricas finales calculadas al completar

**Compensación:** Pérdida de estado si el servidor cae sin graceful shutdown.

---

### RNF-REN-011: Escalabilidad Horizontal 📋

**Descripción:** El sistema debe poder escalarse horizontalmente en el futuro.

**Consideraciones Futuras:**

- Migrar blacklist de tokens a Redis
- Sticky sessions o Redis adapter para Socket.IO
- Balanceador de carga con session affinity

**Estado:** Diseño preparado, implementación futura.

---

### RNF-REN-012: Almacenamiento Externo ✅

**Descripción:** Los archivos multimedia deben almacenarse en servicio externo.

**Implementación:**

- Supabase Storage para imágenes y audios
- Backend solo almacena URLs
- Reduce carga en servidor principal
- CDN para distribución global

