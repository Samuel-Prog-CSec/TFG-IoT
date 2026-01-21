# Sprint 3 - Plan de Tareas

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Duración:** 3-4 semanas (Enero - Febrero 2026)  
**Versión objetivo:** 0.3.0  
**Última actualización:** 10-01-2026

---

## Resumen del Sprint

Este sprint representa un **salto de calidad significativo** ("Hardening") con tres ejes principales:

1. **Arquitectura RFID Producción-Ready**: Migración de SerialPort del backend a Web Serial API en el frontend para permitir despliegue cloud.
2. **Integración Frontend-Backend**: Conexión completa de la UI con la API real.
3. **Seguridad y Calidad**: Rate limiting WebSocket, validación Zod completa, DTOs, y logging estructurado.

---

## Leyenda

- **Prioridad:** P0 (Crítica/Bloqueante) > P1 (Alta) > P2 (Media) > P3 (Baja)
- **Tamaño:** XS (< 2h), S (2-4h), M (4-8h), L (1-2 días), XL (> 2 días)
- **Estado:** 📋 Pendiente | 🔄 En Progreso | ✅ Completada
- **Origen:** Auditoría de Arquitectura (ARCH-XX) | Auditoría de Seguridad (SEC-XX) | Dudas Diciembre (#XX)

---

## P0 - Prioridad Crítica (Bloqueantes)

### T-044: Migración RFID a Web Serial API 📋

**Prioridad:** P0 | **Tamaño:** XL | **Dependencias:** Ninguna  
**Origen:** Decisión arquitectónica crítica para despliegue en producción

**Descripción:**  
La arquitectura actual del `rfidService.js` lee del puerto serie del servidor backend. Esto **impide el despliegue en la nube** (Heroku, Railway, etc.) porque no hay acceso a puertos USB. Se debe migrar a **Web Serial API** para que el sensor conectado al PC del profesor sea leído directamente por el navegador.

**Arquitectura Objetivo:**
```
[Sensor RFID] ──USB──► [PC Profesor] ──Web Serial API──► [Frontend Chrome]
                                                              │
                                                         Socket.IO
                                                              │
                                                              ▼
                                                       [Backend Cloud]
```

**Contrato de evento RFID (v1 - propuesto):**
```json
{
   "uid": "32B8FA05",
   "type": "MIFARE_1KB",
   "sensorId": "teacher-pc-01",
   "timestamp": 1736467200000,
   "source": "web_serial"
}
```

Reglas mínimas:
- `uid`: string uppercase (8 o 14 hex)
- `type`: enum (mismo set que el backend)
- `sensorId`: string (requerido si hay multi-sensor)
- `timestamp`: number (epoch ms) generado en cliente
- `source`: enum (`web_serial` | `server_serial`)

**Sub-tareas:**

1. **Frontend - Crear servicio WebSerialService.js:**
   - Clase para gestionar conexión al puerto serie
   - Método `connect()` que solicita puerto al usuario
   - Métodos `startReading()` / `stopReading()` para controlar el ciclo de lectura
   - Lectura **solo** cuando la UI esté en un flujo que lo requiera (según modo/pantalla)
   - Cleanup automático al cambiar de ruta o desmontar componente (evitar listeners/bucles colgados)
   - Método `startReading()` para leer datos continuamente
   - Parser JSON para eventos del sensor
   - Normalización a un **contrato de evento** estable (p.ej. `{ uid, type, sensorId, timestamp, source }`)
   - Dedupe/cooldown cliente (evitar spam por UID repetido)
   - Emisión de eventos vía Socket.IO al backend

2. **Frontend - Crear componente RFIDConnector.jsx:**
   - Botón "Conectar Sensor RFID"
   - Indicador de estado de conexión (conectado/desconectado)
   - Lista de puertos disponibles
   - Manejo de errores de conexión con mensajes claros
   - Estados UX: permiso denegado, puerto ocupado, desconexión inesperada, reconexión manual

3. **Frontend - Detectar soporte de Web Serial:**
   - Verificar `'serial' in navigator`
   - Mostrar mensaje para navegadores no soportados

4. **Backend - Crear evento WebSocket `rfid_scan_from_client`:**
   - Recibir eventos RFID desde el frontend
   - Validar estructura del evento
   - El backend mantiene la autoridad: valida el **modo actual** (server-side) antes de procesar
   - Procesar igual que `rfidService.on('rfid_event')`

5. **Backend - Hacer rfidService.js opcional:**
   - Variable de entorno `RFID_MODE=server|client`
   - En desarrollo: sensor en servidor (actual)
   - En producción: sensor en cliente (Web Serial)

6. **Documentar arquitectura híbrida:**
   - Crear `docs/WebSerial_Architecture.md`
   - Diagramas de flujo para ambos modos

7. **Añadir polyfill/fallback para navegadores no soportados:**
   - Mensaje claro: "Usa Chrome o Edge para conectar el sensor"

8. **Tests de integración:**
   - Mock de Web Serial API
   - Verificar flujo completo sensor → frontend → backend → gameEngine
   - Test: dedupe/cooldown evita eventos duplicados por UID
   - Test: en `idle` no se emiten eventos al backend

**Criterios de Aceptación:**

- [ ] El profesor puede conectar el sensor RFID desde Chrome
- [ ] El frontend controla cuándo leer (start/stop) según modo/pantalla para evitar lecturas inútiles
- [ ] Los eventos del sensor llegan al backend vía WebSocket
- [ ] El gameEngine procesa las lecturas correctamente
- [ ] Funciona tanto en desarrollo local como en despliegue cloud
- [ ] Navegadores no soportados muestran mensaje informativo
- [ ] El contrato de evento RFID se valida (cliente y servidor) y rechaza inputs malformados

**Notas Técnicas:**
- Web Serial API requiere HTTPS en producción (localhost exento)
- Solo Chrome (v89+) y Edge (v89+) soportan Web Serial
- El usuario debe dar permiso explícito para acceder al puerto

---

### T-021: Integración Frontend con API REST 📋

**Prioridad:** P0 | **Tamaño:** XL | **Dependencias:** Ninguna

**Descripción:**  
Conectar la UI React con el backend real, eliminando mocks y estableciendo la comunicación completa.

**Sub-tareas:**

1. **Configurar cliente Axios con interceptores:**
   - Base URL desde variables de entorno
   - Interceptor para añadir token Authorization
   - Interceptor para refresh automático en 401
   - Timeout de 10 segundos

2. **Implementar AuthContext con persistencia:**
   - Login real con JWT
   - Logout con invalidación de token
   - Auto-refresh de tokens antes de expirar
   - Redirección según rol (teacher → dashboard, super_admin → admin panel)

3. **CRUD completo de Alumnos:**
   - Listar alumnos del profesor con paginación
   - Crear alumno con validación
   - Editar alumno existente
   - Eliminar alumno con confirmación
   - Búsqueda por nombre y filtros por aula

4. **CRUD completo de Tarjetas:**
   - Listar tarjetas activas del profesor
   - Registrar nueva tarjeta (integrado con sensor RFID)
   - Editar metadatos (color, icono)
   - Desactivar/Reactivar tarjeta

5. **CRUD completo de Sesiones:**
   - Listar sesiones del profesor con estados
   - Crear sesión con wizard (T-036)
   - Ver detalles de sesión con estadísticas
   - Iniciar/Pausar/Reanudar/Finalizar sesión

6. **Gestión de estados de carga:**
   - Estado `{ data, loading, error }` en cada componente
   - Loading spinners durante peticiones
   - Skeleton loaders para listas

7. **Manejo de errores con feedback visual:**
   - Toast notifications (éxito, error, warning)
   - Mensajes descriptivos del backend
   - Retry automático en errores de red (3 intentos)

**Criterios de Aceptación:**

- [ ] Login/Logout funciona con JWT real
- [ ] Tokens se refrescan automáticamente antes de expirar
- [ ] CRUD de alumnos, tarjetas y sesiones funcional
- [ ] Estados de carga visibles en toda la UI
- [ ] Errores mostrados con toast notifications
- [ ] No hay código de mock en producción

---

### T-045: Rate Limiting en WebSocket (SEC-CRIT-01) 📋

**Prioridad:** P0 | **Tamaño:** M | **Dependencias:** Ninguna  
**Origen:** Auditoría de Seguridad - Vulnerabilidad Crítica

**Descripción:**  
Los handlers de Socket.IO no tienen limitación de frecuencia, permitiendo ataques DoS por saturación de queries a MongoDB.

**Sub-tareas:**

1. **Crear middleware `socketRateLimiter.js`:**
   - Clase con Map para tracking de eventos por socket
   - Límites configurables por tipo de evento
   - Ventana deslizante de 1 segundo
   - Bloqueo temporal tras exceder límite

2. **Definir límites por evento:**
   | Evento | Límite/segundo |
   |--------|----------------|
   | start_play | 1 |
   | pause_play | 2 |
   | resume_play | 2 |
   | next_round | 5 |
   | join_play | 3 |
   | rfid_scan_from_client | 10 |
   | default | 10 |

3. **Integrar en server.js con wrapper:**
   - Función `withRateLimit(socket, event, handler)`
   - Emitir `error` con código `RATE_LIMITED` si excede

4. **Añadir bloqueo temporal para abusadores:**
   - Si excede límite 3 veces consecutivas: bloqueo de 60 segundos
   - Log de seguridad para análisis posterior

5. **Límites por seguridad operativa:**
   - Límite de tamaño de payload por evento (rechazar si excede)
   - Cooldown/dedupe adicional para `rfid_scan_from_client` por `userId`/`sensorId`

6. **Tests de rate limiting:**
   - Test: permite tráfico normal
   - Test: bloquea tráfico excesivo
   - Test: desbloquea tras timeout
   - Test: rechaza payloads demasiado grandes

**Criterios de Aceptación:**

- [ ] Eventos WebSocket limitados por frecuencia
- [ ] Bloqueo temporal tras abuso repetido
- [ ] Logs de seguridad generados
- [ ] Tests de rate limiting pasando
- [ ] Payloads excesivos se rechazan y quedan registrados

---

### T-032: Hardening de Validación con Zod (SEC-HIGH-03) 📋

**Prioridad:** P0 | **Tamaño:** L | **Dependencias:** Ninguna  
**Origen:** Auditoría de Seguridad - Validación incompleta

**Descripción:**  
Varios endpoints carecen de validación completa de body, query params y route params. Esto expone a inyecciones y datos malformados.

**Sub-tareas:**

1. **Crear esquemas comunes reutilizables (`validators/commonValidator.js`):**
   - `objectIdSchema`: validación de MongoDB ObjectId
   - `paginationSchema`: page, limit, sortBy, order, search
   - `userFiltersSchema`: extiende paginación con role, status, classroom

2. **Crear middlewares de validación (`middlewares/validation.js`):**
   - `validateQuery(schema)`: valida req.query
   - `validateParams(schema)`: valida req.params
   - `validateBody(schema)`: ya existe, verificar consistencia

3. **Aplicar validación en todas las rutas:**
   | Archivo | Body | Query | Params |
   |---------|------|-------|--------|
   | users.js | ✅ | ⚠️ Añadir | ⚠️ Añadir |
   | cards.js | ✅ | ⚠️ Añadir | ⚠️ Añadir |
   | plays.js | ⚠️ Revisar | ⚠️ Añadir | ⚠️ Añadir |
   | sessions.js | ✅ | ⚠️ Añadir | ⚠️ Añadir |
   | contexts.js | ✅ | ⚠️ Añadir | ⚠️ Añadir |

4. **Sanitizar inputs para regex en búsquedas:**
   - Función `escapeRegex(str)` para prevenir ReDoS
   - Aplicar en todos los filtros de búsqueda

5. **Documentar esquemas en cada ruta con comentarios JSDoc**

**Criterios de Aceptación:**

- [ ] 100% de endpoints con validación Zod completa
- [ ] Query params validados y tipados correctamente
- [ ] Route params validados como ObjectId
- [ ] Búsquedas sanitizadas contra regex injection
- [ ] Tests de validación para cada endpoint

---

### T-041: Capa de Transformación DTOs (ARCH-03) 📋

**Prioridad:** P0 | **Tamaño:** M | **Dependencias:** Ninguna  
**Origen:** Auditoría de Arquitectura - Exposición de datos sensibles

**Descripción:**  
Los controllers devuelven documentos Mongoose directamente, exponiendo campos como `password`, `__v`, y datos internos. Se debe implementar una capa de DTOs consistente.

**Sub-tareas:**

1. **Expandir `utils/dtos.js` con todos los DTOs:**
   - `toUserDTO(user)`: excluir password, __v
   - `toStudentDTO(user)`: incluir studentMetrics
   - `toGamePlayDTO(play)`: excluir events completos (solo resumen)
   - `toGamePlayDetailDTO(play)`: incluir events para vista detallada
   - `toGameSessionDTO(session)`: excluir cardMappings detallados
   - `toCardDTO(card)`: datos públicos de tarjeta
   - `toContextDTO(context)`: datos de contexto
   - `toPaginatedDTO(data, page, limit, total)`: wrapper para listados

2. **Refactorizar todos los controllers:**
   - userController: usar toUserDTO/toStudentDTO
   - gamePlayController: usar toGamePlayDTO
   - gameSessionController: usar toGameSessionDTO
   - cardController: usar toCardDTO

3. **Crear DTO para listados paginados:**
   - Estructura consistente con `data`, `pagination`
   - Incluir `hasNext`, `hasPrev`, `totalPages`

4. **Tests para verificar que no se exponen datos sensibles:**
   - Test: response no contiene `password`
   - Test: response no contiene `__v`
   - Test: listados tienen estructura de paginación correcta

**Criterios de Aceptación:**

- [ ] Ningún endpoint devuelve `password`
- [ ] Ningún endpoint devuelve `__v`
- [ ] DTOs documentados con JSDoc
- [ ] Tests verifican no exposición de datos sensibles
- [ ] Respuestas paginadas tienen estructura consistente

---

---

## P1 - Prioridad Alta

### T-046: Autenticación WebSocket Obligatoria (SEC-HIGH-01) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** Ninguna  
**Origen:** Auditoría de Seguridad

**Descripción:**  
Algunos eventos WebSocket no verifican autenticación ni ownership, permitiendo manipulación de partidas ajenas.

**Sub-tareas:**

1. **Middleware de auth para Socket.IO:**
   - Extraer token de `socket.handshake.auth.token`
   - Verificar con `verifyAccessToken`
   - Adjuntar `socket.user` con datos del usuario
   - Rechazar conexión si token inválido

2. **Helper de verificación de ownership:**
   - Función `requirePlayOwnership(socket, playId)`
   - Verificar que `sessionDoc.createdBy === socket.user.id`
   - Permitir super_admin bypass

3. **Aplicar en todos los eventos de control de partida:**
   - `start_play`, `pause_play`, `resume_play`
   - `next_round`, `leave_play`

4. **Emitir eventos RFID solo a rooms autorizadas:**
   - No broadcast global
   - Solo a room de la partida correspondiente

5. **Control de acceso a rooms:**
   - El socket solo puede unirse a rooms (play/registro) tras pasar ownership + modo
   - Evitar que un cliente fuerce `join` a rooms ajenas

**Criterios de Aceptación:**

- [ ] Conexión WebSocket requiere token válido
- [ ] Eventos de partida verifican ownership
- [ ] Super admin puede controlar cualquier partida
- [ ] Tests de autorización WebSocket pasando
- [ ] No es posible unirse a rooms de otras partidas

---

### T-047: Eventos RFID Dirigidos (SEC-HIGH-02) 📋

**Prioridad:** P1 | **Tamaño:** S | **Dependencias:** T-044  
**Origen:** Auditoría de Seguridad - Data leakage

**Descripción:**  
Los eventos RFID se emiten globalmente (`io.emit`), exponiendo UIDs de tarjetas a todos los clientes conectados.

Nota de contrato: aunque el evento de entrada RFID (v1) incluya `uid`, en **gameplay** el backend debe emitir hacia el cliente únicamente datos mínimos (`displayData` / resultado), y reservar `uid` solo para flujos de `card_registration`/diagnóstico.

**Sub-tareas:**

1. **Modificar emisión de eventos RFID:**
   - Si tarjeta pertenece a partida activa: emitir solo a `play_${playId}`
   - Si modo registro: emitir solo a room `card_registration`
   - Status events: solo a room `admin_room`

2. **Crear rooms específicas:**
   - `play_${playId}`: participantes de una partida
   - `card_registration`: profesores registrando tarjetas
   - `admin_room`: super admins

3. **No exponer UID en eventos de gameplay:**
   - Enviar solo `displayData` necesario
   - UID solo en modo registro

**Criterios de Aceptación:**

- [ ] Eventos RFID no se emiten con `io.emit()`
- [ ] Cada partida recibe solo sus eventos
- [ ] Modo registro tiene room dedicada
- [ ] UIDs no expuestos en gameplay

---

### T-031: Migración a PinoJS (ARCH-04) 📋

**Prioridad:** P1 | **Tamaño:** S | **Dependencias:** Ninguna  
**Origen:** Auditoría de Arquitectura - Logging profesional

**Descripción:**  
Migrar de Winston a PinoJS para logging JSON estructurado con mejor rendimiento.

**Sub-tareas:**

1. **Instalar dependencias:**
   - `pino`: logger principal
   - `pino-http`: middleware para Express
   - `pino-pretty`: formato legible en desarrollo

2. **Crear nuevo logger (`utils/logger.js`):**
   - Nivel configurable via `LOG_LEVEL`
   - JSON en producción, pretty en desarrollo
   - Silencioso en tests (`NODE_ENV=test`)

3. **Middleware para Express:**
   - Request logging automático
   - Response time incluido

4. **Migrar todos los `logger.info/warn/error` existentes**

5. **Crear logger child para componentes:**
   - `logger.child({ component: 'gameEngine' })`
   - `logger.child({ component: 'rfidService' })`

**Criterios de Aceptación:**

- [ ] Logs en formato JSON en producción
- [ ] Pretty print en desarrollo
- [ ] Sin logs durante tests
- [ ] Request logging automático

---

### T-009: Multi-Sensor RFID (Duda #22) 📋

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-044  
**Origen:** Duda #22 de Diciembre

**Descripción:**  
Soporte para múltiples sensores RFID conectados a diferentes PCs de profesores, cada uno identificado por `sensorId`.

**Sub-tareas:**

1. **Modificar protocolo del sensor:**
   - Añadir campo `sensorId` a eventos JSON
   - Firmware: configurar ID único por sensor

   > Nota: en modo `RFID_MODE=client` el frontend (Web Serial) debe adjuntar `sensorId` al emitir `rfid_scan_from_client`.

2. **Añadir `sensorId` a GameSession:**
   - Campo opcional en schema
   - Se asigna al iniciar partida

3. **Asociar sensor a partida:**
   - Al iniciar, el profesor selecciona sensor
   - Solo ese sensor puede responder en esa partida

4. **Validar origen de eventos:**
   - Verificar `sensorId` coincide con sesión
   - Validar también el **modo actual** (server-side) y que la sesión/partida pertenece al profesor autenticado
   - Ignorar eventos de otros sensores

5. **UI para seleccionar sensor:**
   - Lista de sensores conectados
   - Estado de cada sensor

**Criterios de Aceptación:**

- [ ] Cada sensor tiene ID único
- [ ] Partida asociada a sensor específico
- [ ] Eventos de otros sensores ignorados
- [ ] Backend rechaza eventos si `sensorId` o modo no coinciden con la sesión
- [ ] UI muestra sensores disponibles

---

### T-010: Modos RFID (Control de Flujo) (Duda #25) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-044  
**Origen:** Duda #25 de Diciembre

**Descripción:**  
Prevenir lecturas accidentales implementando modos de operación del sensor.

**Modos disponibles:**
- `idle`: Sensor ignorado, no procesa lecturas
- `gameplay`: Solo procesa lecturas para la partida activa
- `card_registration`: Permite registrar nuevas tarjetas
- `card_assignment`: Permite asignar tarjetas a valores de contexto

**Sub-tareas:**

1. **Estado de modo por profesor:**
   - Almacenar en memoria/Redis por `userId`
   - Cambiar via evento WebSocket

2. **Validar modo antes de procesar:**
   - Si `idle`: ignorar lectura
   - Si `gameplay` y no hay partida activa: ignorar
   - Si `card_registration`: emitir para registro

3. **UI para cambiar modo:**
   - Toggle/selector de modo
   - Indicador visual del modo actual

4. **Feedback visual del modo:**
   - Color diferente por modo
   - Mensaje de estado

5. **Frontend - Control de lectura por contexto (ciclo de vida):**
   - En `idle`: `stopReading()` (o no iniciar lectura)
   - En `gameplay/card_registration/card_assignment`: `startReading()` solo en las pantallas correspondientes
   - Evitar emitir eventos al backend si el modo UI es `idle` (reducción de ruido/coste)

**Criterios de Aceptación:**

- [ ] Lecturas ignoradas en modo idle
- [ ] Solo procesa lecturas en modo correcto
- [ ] UI muestra y permite cambiar modo
- [ ] Transiciones de modo correctas
- [ ] El frontend no lee/no envía scans cuando el modo es `idle`

---

### T-042: Aprobación de Profesores - Frontend (Duda #51) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-021

**Descripción:**  
Implementar UI para que el Super Admin apruebe o rechace profesores pendientes.

**Sub-tareas:**

1. **Crear página `AdminPendingUsers.jsx`:**
   - Lista de profesores con `accountStatus: 'pending_approval'`
   - Mostrar nombre, email, fecha de registro
   - Botones Aprobar / Rechazar por fila

2. **Modal de confirmación:**
   - Confirmar antes de aprobar/rechazar
   - Opción de añadir comentario (opcional)

3. **Integrar con endpoints existentes:**
   - `GET /api/admin/pending` para listar
   - `POST /api/admin/users/:id/approve` para aprobar
   - `POST /api/admin/users/:id/reject` para rechazar

4. **Notificación de éxito/error:**
   - Toast al completar acción
   - Actualizar lista automáticamente

5. **Ruta protegida:**
   - Solo accesible para `role: 'super_admin'`
   - Redirección si no autorizado

**Criterios de Aceptación:**

- [ ] Super admin ve lista de profesores pendientes
- [ ] Puede aprobar con un click + confirmación
- [ ] Puede rechazar con un click + confirmación
- [ ] Lista se actualiza tras acción
- [ ] Profesor aprobado puede hacer login

---

### T-043: Sesión Única por Usuario - Frontend (Duda #48) 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-021

**Descripción:**  
Cuando un usuario hace login en otro dispositivo, la sesión anterior se invalida automáticamente.

**Sub-tareas:**

1. **Frontend escucha evento `session_invalidated`:**
   - Suscribirse al evento en AuthContext
   - Handler que limpia localStorage
   - Navegar a login

2. **Mostrar mensaje explicativo:**
   - "Tu sesión ha sido cerrada porque iniciaste sesión en otro dispositivo"
   - Mostrar en página de login

3. **Limpiar estado de la aplicación:**
   - Desconectar Socket.IO
   - Limpiar tokens
   - Resetear contextos React

4. **Test de flujo multi-dispositivo:**
   - Login en A, login en B, verificar A recibe evento

**Criterios de Aceptación:**

- [ ] Login en dispositivo B cierra sesión en A
- [ ] Dispositivo A recibe notificación inmediata
- [ ] Usuario redirigido a login con mensaje
- [ ] Estado de app limpiado correctamente

---

### T-035: Gestión de Mazos - Frontend 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-021

**Descripción:**  
UI para crear, editar y gestionar mazos de cartas (CardDeck) que se reutilizan en sesiones.

**Sub-tareas:**

1. **Crear página `CardDecksPage.jsx`:**
   - Lista de mazos del profesor
   - Nombre, descripción, cantidad de cartas
   - Acciones: editar, eliminar, duplicar

2. **Crear componente `DeckEditor.jsx`:**
   - Campo nombre (requerido)
   - Campo descripción (opcional)
   - Selector de tarjetas disponibles
   - Drag & drop para ordenar
   - Vista previa del mazo

3. **Modal de confirmación para eliminar**

4. **Integrar con API CardDeck:**
   - GET /api/decks (listar)
   - POST /api/decks (crear)
   - PUT /api/decks/:id (actualizar)
   - DELETE /api/decks/:id (eliminar)

**Criterios de Aceptación:**

- [ ] CRUD completo de mazos funcional
- [ ] Selección visual de tarjetas con checkbox/drag
- [ ] Vista previa del mazo antes de guardar
- [ ] Mazo seleccionable en creación de sesión

---

### T-036: Asistente de Sesión Mejorado 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-035

**Descripción:**  
Wizard paso a paso para crear sesiones de juego de forma intuitiva.

**Pasos del wizard:**
1. **Seleccionar mecánica:** Association, Sequence, Memory
2. **Seleccionar contexto:** Geografía, Historia, etc.
3. **Configurar cartas:** Usar mazo existente O crear mappings
4. **Configurar reglas:** Rondas, tiempo, puntos
5. **Confirmar:** Preview y crear

**Sub-tareas:**

1. **Crear componente `SessionWizard.jsx`:**
   - Stepper visual (pasos numerados)
   - Navegación anterior/siguiente
   - Validación entre pasos

2. **Paso 1: MechanicSelector:**
   - Cards con descripción de cada mecánica
   - Icono y nombre

3. **Paso 2: ContextSelector:**
   - Lista de contextos disponibles
   - Preview de assets

4. **Paso 3: CardConfiguration:**
   - Opción A: Seleccionar mazo existente
   - Opción B: Crear mappings manualmente

5. **Paso 4: RulesConfiguration:**
   - Número de rondas (slider 1-20)
   - Tiempo por ronda (slider 5-60s)
   - Puntos por acierto/error

6. **Paso 5: SessionPreview:**
   - Resumen de toda la configuración
   - Botón "Crear Sesión"

**Criterios de Aceptación:**

- [ ] Wizard guía paso a paso
- [ ] No se puede avanzar sin completar paso actual
- [ ] Preview muestra configuración completa
- [ ] Sesión se crea correctamente al confirmar

---

### T-049: Dashboard Analytics Avanzado 📋

**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-021  
**Origen:** Requisito pedagógico - Análisis de aprendizaje

**Descripción:**  
Mejorar el Dashboard del profesor con visualizaciones avanzadas y métricas de aprendizaje que permitan identificar patrones, detectar dificultades y tomar decisiones pedagógicas informadas. El objetivo es transformar datos crudos en **conocimiento accionable** sobre el progreso de cada alumno y del grupo.

**Objetivos pedagógicos:**
- Detectar alumnos con dificultades de aprendizaje específicas
- Identificar contextos/mecánicas que generan más errores
- Comparar progreso individual vs media de la clase
- Visualizar evolución temporal del aprendizaje
- Alertar sobre patrones preocupantes (regresión, estancamiento)

**Sub-tareas:**

1. **Backend - Endpoints de Analytics:**
   - `GET /api/analytics/student/:id/progress`: progreso temporal del alumno
   - `GET /api/analytics/student/:id/difficulties`: áreas problemáticas detectadas
   - `GET /api/analytics/classroom/summary`: resumen de la clase
   - `GET /api/analytics/classroom/comparison`: comparativa entre alumnos
   - `GET /api/analytics/context/:id/errors`: errores frecuentes por contexto

2. **Backend - Servicio de Análisis (`services/analyticsService.js`):**
   - Calcular tendencia de puntuación (mejora/empeora/estable)
   - Identificar contextos con mayor tasa de error por alumno
   - Calcular percentiles de rendimiento en la clase
   - Detectar patrones de timeout (posible falta de atención)
   - Identificar mecánicas donde el alumno destaca/flaquea

3. **Frontend - Página `DashboardAnalytics.jsx`:**
   - Vista general con KPIs principales
   - Selector de alumno individual / vista de clase
   - Filtros por rango de fechas y contexto/mecánica
   - Export de datos a CSV (opcional)

4. **Frontend - Componente `StudentProgressChart.jsx`:**
   - Gráfico de líneas: evolución de puntuación en el tiempo
   - Indicador visual de tendencia (▲ mejorando, ▼ empeorando, ─ estable)
   - Comparación con media de la clase (línea punteada)
   - Tooltips con detalles de cada partida

5. **Frontend - Componente `DifficultyHeatmap.jsx`:**
   - Matriz: contextos × mecánicas
   - Color por tasa de acierto (verde → rojo)
   - Click para ver detalle de errores específicos
   - Identificar combinaciones problemáticas

6. **Frontend - Componente `ClassroomOverview.jsx`:**
   - Ranking de alumnos por puntuación media
   - Distribución de rendimiento (histograma)
   - Alumnos "en riesgo" destacados (bajo rendimiento sostenido)
   - Comparativa de tiempo de respuesta medio

7. **Frontend - Componente `AlertsPanel.jsx`:**
   - Alertas automáticas:
     - "🔴 [Alumno] ha bajado un 30% en las últimas 3 partidas"
     - "🟡 [Alumno] tiene +50% errores en Geografía"
     - "🟢 [Alumno] ha mejorado consistentemente esta semana"
   - Configurar umbrales de alerta

8. **Frontend - Componente `ErrorAnalysis.jsx`:**
   - Lista de errores más frecuentes por contexto
   - Qué respuesta incorrecta se da más (ej: confunde España con Portugal)
   - Sugerencias de refuerzo basadas en errores

9. **Integración con librerías de visualización:**
   - Instalar y configurar Chart.js o Recharts
   - Componentes wrapper reutilizables
   - Tema consistente con la paleta de la aplicación

**Criterios de Aceptación:**

- [ ] Profesor puede ver evolución temporal de puntuación por alumno
- [ ] Gráfico muestra tendencia clara (mejora/empeora/estable)
- [ ] Heatmap identifica contextos/mecánicas problemáticas
- [ ] Vista de clase permite comparar alumnos entre sí
- [ ] Alertas automáticas notifican sobre patrones preocupantes
- [ ] Datos se actualizan tras cada partida completada
- [ ] UI es responsive y carga en < 2 segundos
- [ ] El profesor puede filtrar por rango de fechas
- [ ] Se identifican claramente los alumnos "en riesgo"

**Notas de UX:**
- Usar colores semánticos: verde (bien), amarillo (atención), rojo (problema)
- Tooltips explicativos en cada métrica
- Empty states informativos si no hay suficientes datos
- Considerar exportación de informes para reuniones con padres

---

### T-038: E2E Tests Frontend 📋

**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-021

**Descripción:**  
Tests end-to-end con Playwright para flujos críticos de la aplicación.

**Flujos a testear:**
1. Login → Dashboard → Ver estadísticas
2. CRUD completo de alumno
3. Crear sesión con wizard
4. Iniciar y completar partida (mock RFID)

**Sub-tareas:**

1. **Configurar Playwright:**
   - Instalar dependencias
   - Configurar base URL
   - Setup de fixtures

2. **Tests de autenticación:**
   - Login exitoso
   - Login fallido
   - Logout
   - Refresh de token

3. **Tests de gestión de alumnos:**
   - Crear alumno
   - Editar alumno
   - Eliminar alumno
   - Búsqueda

4. **Tests de sesiones:**
   - Crear sesión con wizard
   - Iniciar sesión
   - Pausar/Reanudar

5. **Integración CI:**
   - GitHub Action para ejecutar tests
   - Reportes de resultados

**Criterios de Aceptación:**

- [ ] 4 flujos E2E implementados
- [ ] Tests corren en CI automáticamente
- [ ] Reportes generados
- [ ] Cobertura de flujos críticos

---

---

## P2 - Prioridad Media

### T-027: Orden Aleatorio de Rondas (Duda #28) 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Ninguna  
**Origen:** Duda #28 de Diciembre

**Descripción:**  
Las rondas deben presentarse en orden aleatorio para evitar que los alumnos memoricen secuencias.

**Sub-tareas:**

1. **Implementar Fisher-Yates shuffle en GameEngine:**
   ```javascript
   shuffleArray(array) {
     const shuffled = [...array];
     for (let i = shuffled.length - 1; i > 0; i--) {
       const j = Math.floor(Math.random() * (i + 1));
       [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
     }
     return shuffled;
   }
   ```

2. **Aplicar al iniciar partida:**
   - Shuffle de `roundOrder` en `startPlay()`
   - Almacenar orden shuffleado en estado

3. **Test de distribución uniforme:**
   - Ejecutar 1000 shuffles
   - Verificar distribución aproximadamente uniforme

**Criterios de Aceptación:**

- [ ] Rondas se presentan en orden aleatorio
- [ ] Algoritmo Fisher-Yates implementado correctamente
- [ ] Test de aleatoriedad pasando

---

### T-034: Swagger API Docs 📋

**Prioridad:** P2 | **Tamaño:** L | **Dependencias:** T-032

**Descripción:**  
Documentación OpenAPI 3.0 interactiva con Swagger UI para facilitar el desarrollo y testing de la API.

**Sub-tareas:**

1. **Instalar dependencias:**
   - `swagger-jsdoc`: generar spec desde comentarios
   - `swagger-ui-express`: servir UI interactiva

2. **Configurar swagger-jsdoc:**
   - Definir info del API (título, versión, descripción)
   - Definir servers (desarrollo, producción)
   - Configurar seguridad (Bearer token)

3. **Documentar endpoints con comentarios JSDoc:**
   - Cada ruta con `@openapi` annotations
   - Request body schemas
   - Response schemas con ejemplos
   - Posibles errores

4. **Montar Swagger UI:**
   - Ruta `/api-docs` para UI interactiva
   - Ruta `/api-docs/json` para spec raw

5. **Proteger en producción (opcional):**
   - Basic auth para acceder a docs

**Criterios de Aceptación:**

- [ ] Swagger UI accesible en `/api-docs`
- [ ] Todos los endpoints documentados
- [ ] Schemas de request/response definidos
- [ ] Ejemplos incluidos
- [ ] Se puede probar endpoints desde UI

---

### T-037: Replicar Sesión 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** T-021

**Descripción:**  
Permitir clonar una sesión existente para reutilizar su configuración.

**Sub-tareas:**

1. **Backend - Endpoint `POST /api/sessions/:id/clone`:**
   - Copiar: mechanicId, contextId, config, cardMappings
   - Resetear: status='created', startedAt=null, endedAt=null
   - Nuevo createdAt

2. **Frontend - Botón "Volver a jugar":**
   - Visible en sesiones completadas
   - Abre modal de confirmación
   - Opcional: permitir editar antes de crear

3. **Tests:**
   - Clonar sesión exitosamente
   - Verificar que es independiente de la original

**Criterios de Aceptación:**

- [ ] Sesión clonada con un click
- [ ] Configuración copiada correctamente
- [ ] Nueva sesión es independiente
- [ ] Estado inicial 'created'

---

### T-039: Sentry Setup Completo 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Completar integración de Sentry con Error Boundary en Frontend y tracing distribuido.

**Sub-tareas:**

1. **Frontend - Error Boundary:**
   - Usar `Sentry.ErrorBoundary` como wrapper
   - Fallback UI amigable
   - Captura automática de errores React

2. **Frontend - Tracing:**
   - `BrowserTracing` para rendimiento
   - Tracking de navegación

3. **Source maps en producción:**
   - Subir source maps a Sentry
   - Configurar en build de Vite

4. **Alertas configuradas:**
   - Email en errores críticos
   - Slack/Discord (opcional)

**Criterios de Aceptación:**

- [ ] Errores frontend capturados en Sentry
- [ ] Tracing de transacciones visible
- [ ] Stack traces con source maps
- [ ] Alertas funcionando

---

### T-033: Dockerización Profesional 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** Ninguna

**Descripción:**  
Dockerfile multi-stage y docker-compose optimizado para desarrollo y producción.

**Sub-tareas:**

1. **Backend - Dockerfile multi-stage:**
   - Stage 1: Build con devDependencies
   - Stage 2: Producción solo con dependencies
   - User non-root
   - Health check

2. **Frontend - Dockerfile multi-stage:**
   - Stage 1: Build con Vite
   - Stage 2: Nginx para servir estáticos

3. **docker-compose.yml mejorado:**
   - Servicios: backend, frontend, mongodb, redis
   - Volúmenes para persistencia
   - Networks aisladas
   - Health checks

4. **docker-compose.prod.yml:**
   - Configuración para producción
   - Secrets via Docker secrets
   - Sin volúmenes de desarrollo

5. **Documentación:**
   - README con instrucciones
   - Variables de entorno requeridas

**Criterios de Aceptación:**

- [ ] Build multi-stage funciona
- [ ] Imagen de producción < 200MB
- [ ] docker-compose levanta todo el stack
- [ ] Secrets no incluidos en imagen

---

## P3 - Prioridad Baja

### T-040: UI/UX Polish 📋

**Prioridad:** P3 | **Tamaño:** M | **Dependencias:** T-021

**Descripción:**  
Mejoras visuales, animaciones y feedback de usuario para pulir la experiencia.

**Sub-tareas:**

1. **Animaciones de transición:**
   - Fade in/out de páginas
   - Slide para modales
   - Animación de listas

2. **Loading skeletons:**
   - Skeleton para cards
   - Skeleton para tablas
   - Skeleton para formularios

3. **Empty states diseñados:**
   - "No hay alumnos" con ilustración
   - "No hay sesiones" con CTA
   - "No hay mazos" con guía

4. **Tooltips informativos:**
   - Explicar campos de formulario
   - Ayuda contextual

5. **Responsive completo:**
   - Verificar mobile
   - Verificar tablet
   - Ajustar breakpoints

**Criterios de Aceptación:**

- [ ] Animaciones suaves (no molestas)
- [ ] Skeletons en todos los listados
- [ ] Empty states amigables
- [ ] Responsive en todos los tamaños

---

### T-048: Security Logging (SEC-MED-02) 📋

**Prioridad:** P3 | **Tamaño:** M | **Dependencias:** T-031  
**Origen:** Auditoría de Seguridad

**Descripción:**  
Logger dedicado para eventos de seguridad con alertas para eventos críticos.

**Sub-tareas:**

1. **Crear `utils/securityLogger.js`:**
   - Eventos definidos como constantes
   - Función `logSecurityEvent(event, details)`
   - Enmascarar datos sensibles

2. **Eventos a loggear:**
   - `AUTH_LOGIN_SUCCESS`
   - `AUTH_LOGIN_FAILED`
   - `AUTH_TOKEN_REVOKED`
   - `AUTH_TOKEN_THEFT_DETECTED`
   - `AUTHZ_ACCESS_DENIED`
   - `SECURITY_RATE_LIMITED`

3. **Integrar en flujos existentes:**
   - authController: login success/failed
   - auth middleware: access denied
   - socketRateLimiter: rate limited

4. **Alertas en Sentry para eventos críticos:**
   - `TOKEN_THEFT_DETECTED` → alerta inmediata
   - `RATE_LIMITED` × 10 en 1 min → alerta

**Criterios de Aceptación:**

- [ ] Eventos de seguridad loggeados
- [ ] Datos sensibles enmascarados
- [ ] Alertas configuradas para críticos
- [ ] Logs útiles para análisis forense

---

## Dependencias entre Tareas

```
T-044 (Web Serial) ──────────────────────────────────────────────┐
        │                                                        │
        ├──► T-047 (RFID Dirigido)                              │
        ├──► T-009 (Multi-Sensor)                               │
        └──► T-010 (Modos RFID)                                 │
                                                                 │
T-021 (Frontend API) ────────────────────────────────────────────┤
        │                                                        │
        ├──► T-042 (Aprobación Frontend)                        │
        ├──► T-043 (Sesión Única Frontend)                      │
        ├──► T-035 (Mazos Frontend) ──► T-036 (Wizard)          │
        ├──► T-037 (Replicar Sesión)                            │
        ├──► T-038 (E2E Tests)                                  │
        ├──► T-040 (UI Polish)                                  │
        └──► T-049 (Dashboard Analytics) ◄── Nuevo              │
                                                                 │
T-050 (Mockup Gameplay) ──► Sprint 4 (Gameplay Funcional) ◄─────┤
        │                                                        │
        └── Sin dependencias (puede empezar en paralelo)        │
                                                                 │
T-032 (Zod Completo) ──► T-034 (Swagger)                        │
                                                                 │
T-031 (PinoJS) ──► T-048 (Security Logging)                     │
                                                                 │
T-033 (Docker) ──► T-023 (Staging)                              │
                                                                 ▼
                                                           Sprint 3
                                                           Completado
```

---

## Checklist de Calidad del Sprint

### Seguridad
- [ ] Rate limiting en WebSocket implementado (T-045)
- [ ] Límites de payload + cooldown/dedupe WS aplicados (T-045)
- [ ] Auth obligatoria en todos los eventos WS (T-046)
- [ ] Eventos RFID no se emiten globalmente (T-047)
- [ ] 100% endpoints validados con Zod (T-032)
- [ ] Ningún endpoint expone password o __v (T-041)

### Arquitectura
- [ ] Web Serial API funciona en producción (T-044)
- [ ] Contrato de evento RFID validado (T-044)
- [ ] DTOs en todos los controllers (T-041)
- [ ] Logging con PinoJS (T-031)
- [ ] Docker multi-stage (T-033)
- [ ] Versionado coherente entre paquetes (root/backend/frontend)

### Funcionalidad
- [ ] Frontend conectado a API real (T-021)
- [ ] CRUD completo funcionando
- [ ] Wizard de sesión implementado (T-036)
- [ ] Gestión de mazos funcional (T-035)
- [ ] Modos RFID controlan lectura y emisión (T-010)
- [ ] Dashboard Analytics muestra métricas de aprendizaje (T-049)
- [ ] Mockup de pantalla de juego validado visualmente (T-050)

### Testing
- [ ] Tests backend > 50% cobertura
- [ ] E2E tests críticos pasando (T-038)
- [ ] Sin errores nuevos en Sentry

---

## Notas Adicionales

### Decisiones Arquitectónicas Clave

| Decisión | Justificación |
|----------|---------------|
| Web Serial API | Permite despliegue cloud sin acceso a puertos USB del servidor |
| PinoJS sobre Winston | Mejor rendimiento, JSON nativo, más ligero (~30% más rápido) |
| Rate limiting manual | Control fino sobre límites por tipo de evento |
| DTOs obligatorios | Previene data leakage, mejor documentación, respuestas consistentes |

### Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Web Serial solo Chrome/Edge | Media | Alto | Mensaje claro, documentar requisito |
| Complejidad migración RFID | Media | Alto | Mantener modo dual (server/client) |
| Tiempo integración frontend | Alta | Medio | Priorizar flujos críticos primero |
| Breaking changes en API | Baja | Medio | Versionado de API, changelog |

### Requisitos de Infraestructura

| Servicio | Desarrollo | Producción |
|----------|------------|------------|
| Node.js | v22+ | v22+ (LTS) |
| MongoDB | Local/Docker | Atlas (M10+) |
| Redis | Local/Docker | Redis Cloud / ElastiCache |
| Storage | Local | Supabase Storage |
| Hosting Backend | localhost:5000 | Railway / Render |
| Hosting Frontend | localhost:5173 | Vercel / Netlify |

---

## Referencias de Auditoría

Las tareas de este sprint están basadas en las auditorías realizadas:

- **Arquitectura/Rendimiento:** `Auditoria_total_agente/Arquitectura_Rendimiento/`
  - [01_Resumen_Ejecutivo.md](../Auditoria_total_agente/Arquitectura_Rendimiento/01_Resumen_Ejecutivo.md)
  - [02_Analisis_Rendimiento.md](../Auditoria_total_agente/Arquitectura_Rendimiento/02_Analisis_Rendimiento.md)
  - [03_Patrones_Arquitectura.md](../Auditoria_total_agente/Arquitectura_Rendimiento/03_Patrones_Arquitectura.md)

- **Seguridad:** `Auditoria_total_agente/Seguridad/`
  - [01_Resumen_Ejecutivo.md](../Auditoria_total_agente/Seguridad/01_Resumen_Ejecutivo.md)
  - [02_Vulnerabilidades_Detalle.md](../Auditoria_total_agente/Seguridad/02_Vulnerabilidades_Detalle.md)
  - [03_Checklist_OWASP.md](../Auditoria_total_agente/Seguridad/03_Checklist_OWASP.md)

---

**Documento actualizado:** 10-01-2026  
**Autor:** Agente de Auditoría (basado en análisis de código)  
**Próxima revisión:** Al completar 50% de tareas
