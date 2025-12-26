# Sprint 2 - Plan de Tareas

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Duración:** 2-3 semanas (Diciembre 2025 - Enero 2026)  
**Versión objetivo:** 0.2.0

---

## Resumen del Sprint

Este sprint se centra en **estabilizar la base técnica**, corregir los problemas críticos del Sprint 1, implementar las decisiones tomadas en las Dudas de Diciembre y preparar el sistema para las funcionalidades de producción.

### Métricas del Sprint

| Prioridad | Cantidad | Esfuerzo Estimado |
|-----------|----------|-------------------|
| P0 (Crítica) | 6 | ~4-5 días |
| P1 (Alta) | 8 | ~6-8 días |
| P2 (Media) | 8 | ~4-5 días |
| P3 (Baja) | 5 | ~2-3 días |
| **Total** | **27** | **16-21 días** |

---

## Leyenda

- **Prioridad:** P0 (Crítica/Bloqueante) > P1 (Alta) > P2 (Media) > P3 (Baja)
- **Tamaño:** XS (< 2h), S (2-4h), M (4-8h), L (1-2 días), XL (> 2 días)
- **Estado:** 📋 Pendiente | 🔄 En Progreso | ✅ Completada
- **Dependencias:** Tareas que deben completarse antes

---

## P0 - Prioridad Crítica (Bloqueantes)

### T-001: Corregir Suite de Tests 📋
**Prioridad:** P0 | **Tamaño:** L | **Dependencias:** Ninguna

**Descripción:**  
La suite de tests falla estrepitosamente. Es imperativo tenerla en verde antes de añadir nuevas funcionalidades.

**Sub-tareas:**
1. Refactorizar `serial.test.js` para que el mock de `SerialPort` funcione correctamente y no se toque hardware real
2. Corregir `gameFlow.test.js` asegurando limpieza de BD entre tests
3. Resolver "Open Handles" y fugas de memoria en tests
4. Configurar logger silencioso durante `NODE_ENV=test`
5. Verificar que todos los tests pasan en entorno CI/CD

**Criterios de Aceptación:**
- `npm test` ejecuta sin errores
- Cobertura mínima del 50% (actualmente ~31%)
- Sin warnings de "Work process failed to exit gracefully"

---

### T-002: Renombrar storageService.js 📋
**Prioridad:** P0 | **Tamaño:** XS | **Dependencias:** Ninguna

**Descripción:**  
Corregir el typo en el nombre del archivo `storageSErvice.js` → `storageService.js` y actualizar todas las referencias.

**Sub-tareas:**
1. Renombrar archivo a `storageService.js`
2. Actualizar imports en todos los archivos que lo referencien
3. Verificar que no hay errores de importación

---

### T-003: Implementar Sistema Super Admin 📋
**Prioridad:** P0 | **Tamaño:** L | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #51, los profesores nuevos deben ser validados por un super admin antes de poder acceder al sistema.

**Sub-tareas:**
1. Añadir rol `super_admin` al modelo User
2. Añadir campo `accountStatus` al modelo User: `pending_approval`, `approved`, `rejected`
3. Crear endpoint `POST /api/admin/users/:id/approve` (solo super_admin)
4. Crear endpoint `POST /api/admin/users/:id/reject` (solo super_admin)
5. Modificar flujo de login para rechazar usuarios con `accountStatus !== 'approved'`
6. Crear seeder para primer super_admin
7. Documentar flujo de aprobación

**Criterios de Aceptación:**
- Un profesor recién registrado no puede hacer login hasta ser aprobado
- Solo super_admin puede aprobar/rechazar usuarios
- El super_admin inicial se crea vía seeder

---

### T-004: Implementar Sesión Única por Dispositivo 📋
**Prioridad:** P0 | **Tamaño:** M | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #48, un profesor NO puede tener sesiones activas en múltiples dispositivos simultáneamente.

**Sub-tareas:**
1. Almacenar `currentSessionId` en el modelo User
2. Al hacer login, invalidar sesión anterior automáticamente
3. Modificar middleware de auth para verificar sesión activa
4. Emitir evento WebSocket `session_invalidated` al dispositivo anterior
5. Añadir tests para este comportamiento

**Criterios de Aceptación:**
- Al iniciar sesión en un nuevo dispositivo, la sesión anterior se cierra
- El dispositivo anterior recibe notificación de sesión invalidada

---

### T-005: Configurar Redis para Tokens y Estado 📋
**Prioridad:** P0 | **Tamaño:** XL | **Dependencias:** Ninguna

**Descripción:**  
Según Dudas #39 y #49, se debe usar Redis para almacenar refresh tokens (con rotación), blacklist de tokens y mapas de partidas activas.

**Sub-tareas:**
1. Añadir dependencia `ioredis` al proyecto
2. Crear servicio `redisService.js` con conexión y métodos básicos
3. Migrar token blacklist de memoria a Redis con TTL automático
4. Implementar almacenamiento de refresh tokens en Redis
5. Implementar rotación de refresh tokens (Duda #49: duración 7 días)
6. Migrar `activePlays` map de gameEngine a Redis
7. Configurar variables de entorno para Redis
8. Documentar configuración de Redis

**Criterios de Aceptación:**
- Refresh tokens se almacenan en Redis con TTL de 7 días
- La rotación de refresh tokens funciona correctamente
- El estado de partidas activas se puede recuperar tras reinicio del servidor
- Tests pasan con Redis mockeado

---

### T-006: Implementar Pausa/Reanudación de Partidas 📋
**Prioridad:** P0 | **Tamaño:** M | **Dependencias:** T-005

**Descripción:**  
Según Duda #30, las partidas deben poder pausarse y reanudarse. El tiempo de la ronda actual se congela.

**Sub-tareas:**
1. Añadir estado `paused` al modelo GamePlay
2. Implementar evento WebSocket `pause_play` que congela el timer
3. Implementar evento WebSocket `resume_play` que reanuda el timer
4. Almacenar `pausedAt` y `remainingTime` en estado de partida
5. Añadir endpoint `POST /api/plays/:id/pause` y `POST /api/plays/:id/resume`
6. Añadir tests para pausa/reanudación

**Criterios de Aceptación:**
- Al pausar, el timer se detiene y se guarda el tiempo restante
- Al reanudar, el timer continúa desde donde quedó
- Solo el profesor puede pausar/reanudar partidas

---

## P1 - Prioridad Alta

### T-007: Implementar Cumplimiento GDPR/LOPD 📋 (MOVER SPRINT 3)
**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #31, el sistema maneja datos sensibles de menores. Debemos ajustarnos a GDPR/LOPD con anonimización de datos.

**Sub-tareas:**
1. Investigar requisitos específicos GDPR para menores (Artículo 8)
2. Crear endpoint `POST /api/users/:id/anonymize` para anonimización
3. Implementar método `User.anonymize()` que:
   - Elimina nombre real, reemplaza por "Usuario Anónimo #ID"
   - Elimina datos de perfil sensibles
   - Mantiene métricas para estadísticas agregadas
   - Marca `isAnonymized: true`
4. Documentar proceso de anonimización
5. Añadir campo `consentDate` y `consentVersion` al modelo User
6. Implementar registro de consentimiento parental

**Criterios de Aceptación:**
- Los datos personales se pueden anonimizar manteniendo estadísticas
- Existe documentación del cumplimiento GDPR
- Se registra el consentimiento parental

---

### T-008: Sistema de Mazos de Cartas (CardDeck) 📋
**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #36, cada profesor puede crear mazos de cartas preconfigurados para reutilizar en sesiones de juego.

**Sub-tareas:**
1. Crear modelo `CardDeck.js`:
   ```javascript
   {
     name: String,
     description: String,
     createdBy: ObjectId (ref: User),
     cards: [{
       cardId: ObjectId (ref: Card),
       uid: String,
       defaultValue: String,
       displayData: Mixed
     }],
     contextId: ObjectId (ref: GameContext, opcional),
     isActive: Boolean
   }
   ```
2. Crear controlador y rutas CRUD para mazos
3. Modificar creación de sesión para aceptar `deckId` como alternativa a `cardMappings`
4. Crear validador Zod para mazos
5. Añadir tests para mazos
6. Documentar API de mazos

**Criterios de Aceptación:**
- Un profesor puede crear, editar y eliminar sus mazos
- Al crear una sesión, puede seleccionar un mazo existente
- Las cartas del mazo se copian a cardMappings de la sesión

---

### T-009: Soporte para Múltiples Sensores RFID 📋 (MOVER A SPRINT 3)
**Prioridad:** P1 | **Tamaño:** XL | **Dependencias:** T-005

**Descripción:**  
Según Duda #22, cada sensor debe tener un ID único que se envía junto con la lectura. El backend asocia la lectura a la partida correcta.

**Sub-tareas:**
1. Modificar firmware ESP8266 para incluir `sensor_id` en cada evento
2. Modificar `rfidService.js` para manejar múltiples puertos serie O migrar a MQTT
3. Crear mapa `sensorId → playId` para asociar sensores a partidas
4. Añadir endpoint `POST /api/sensors/register` para registrar sensores
5. Crear modelo `Sensor.js`:
   ```javascript
   {
     sensorId: String (unique),
     name: String,
     location: String,
     status: String (active, inactive),
     lastSeen: Date,
     createdBy: ObjectId
   }
   ```
6. Añadir lógica de asignación de sensor a partida
7. Documentar configuración de múltiples sensores

**Criterios de Aceptación:**
- Cada sensor tiene un ID único
- Las lecturas de un sensor se asocian correctamente a su partida asignada
- Se puede ver el estado de cada sensor registrado

---

### T-010: Control de Procesamiento RFID desde Frontend 📋 (MOVER A SPRINT 3)
**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-009

**Descripción:**  
Según Dudas #22, #25 y #26, el frontend indica al backend cuándo procesar eventos RFID. El backend ignora eventos si el frontend no los necesita.

**Sub-tareas:**
1. Crear evento WebSocket `rfid_mode` con modos: `idle`, `gameplay`, `card_register`, `card_assign`
2. Modificar `gameEngine` para verificar modo antes de procesar escaneos
3. Almacenar modo RFID por cliente/sesión
4. Añadir timeout opcional para volver a modo `idle`
5. Documentar protocolo de modos RFID

**Criterios de Aceptación:**
- El backend solo procesa eventos RFID cuando el frontend lo ha solicitado
- El frontend puede cambiar de modo en cualquier momento
- Los modos son por cliente, no globales

---

### T-011: Transferencia de Alumnos entre Profesores 📋
**Prioridad:** P1 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #32, cuando un alumno cambia de clase/profesor, sus métricas se mantienen. Solo se modifica `createdBy` y `classroom`.

**Sub-tareas:**
1. Crear endpoint `POST /api/users/:studentId/transfer`
2. Aceptar body: `{ newTeacherId, newClassroom }`
3. Validar que ambos usuarios existen y tienen roles correctos
4. Actualizar `createdBy` y `profile.classroom`
5. Registrar evento de transferencia en historial (opcional)
6. Añadir tests para transferencia

**Criterios de Aceptación:**
- Las métricas del alumno se mantienen tras la transferencia
- Solo profesores pueden transferir alumnos
- Se registra el cambio para auditoría

---

### T-012: Validación de Formatos de Assets 📋 
**Prioridad:** P1 | **Tamaño:** M | **Dependencias:** T-002

**Descripción:**  
Según Duda #44, solo se permiten formatos WebP y SVG para imágenes. Priorizar ancho de banda y almacenamiento.

**Sub-tareas:**
1. Modificar validación en `storageService.js` para solo aceptar: WebP, SVG
2. Implementar conversión automática de PNG/JPG a WebP (usando sharp)
3. Añadir validación de tamaño máximo por archivo (5MB)
4. Añadir validación de formatos de audio: MP3, OGG (sin WAV por tamaño)
5. Actualizar documentación de formatos permitidos
6. Añadir tests de validación de formatos

**Criterios de Aceptación:**
- Solo se aceptan WebP y SVG para imágenes
- Las imágenes PNG/JPG se convierten automáticamente a WebP
- Los archivos demasiado grandes son rechazados con error descriptivo

---

### T-013: Compartir Contextos entre Profesores 📋 (REVISAR, PUEDE QUE NO HAGA FALTA)
**Prioridad:** P1 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #45, los contextos son compartidos entre todos los profesores.

**Sub-tareas:**
1. Verificar que la API de contextos no filtra por `createdBy`
2. Añadir campo `visibility` al modelo GameContext: `public` (default), `private`
3. Modificar endpoints GET para mostrar todos los contextos públicos
4. Documentar política de compartición

**Criterios de Aceptación:**
- Todos los profesores pueden ver y usar los contextos públicos
- Un profesor puede marcar un contexto como privado si lo desea

---

### T-021: Conectar Frontend con la BD (vía API REST) 📋
**Prioridad:** P1 | **Tamaño:** L | **Dependencias:** T-001

**Descripción:**
La UI del frontend debe dejar de usar mockups/datos estáticos y consumir datos reales desde el backend a través de la **API REST**, de forma que toda la parte visual “beba” de la BD (MongoDB) indirectamente.

**Alcance (MVP Sprint 2):**
- Sustituir datos mock en páginas principales por llamadas reales a API.
- Añadir estados de carga/error y manejo de sesión (JWT) coherente.
- Mantener el diseño actual: cambiar fuente de datos, no la UX.

**Sub-tareas:**
1. Auditar páginas/componentes con datos estáticos y listar fuentes de mock actuales
2. Centralizar llamadas API en `frontend/src/services/` (axios), con base URL y manejo de errores
3. Integrar autenticación real:
   - Login contra backend
   - Almacenar/access token de forma consistente (y adjuntarlo en cada request)
   - Manejar expiración/401 (logout o refresh si ya está implementado)
4. Conectar pantallas (mínimo):
   - Gestión de alumnos (lista/alta/edición)
   - Gestión de tarjetas (lista/alta/edición)
   - Sesiones/partidas (listado y creación según endpoints existentes)
5. Añadir estados UI:
   - Loading (spinners/placeholder existentes)
   - Errores (mensaje claro; sin stack)
   - Estado vacío (cuando no hay datos)
6. Añadir validaciones básicas en frontend (formulario) alineadas con validadores Zod del backend
7. Probar manualmente el flujo completo contra backend local y asegurar que no quedan arrays hardcodeados para datos dinámicos

**Criterios de Aceptación:**
- No se usan datos estáticos para entidades dinámicas (users/students, cards, sessions, plays) en las pantallas conectadas
- Las pantallas muestran datos reales obtenidos desde la API y reaccionan a cambios (crear/editar/refrescar)
- El frontend maneja correctamente `loading`, `empty` y errores HTTP (incluido 401)
- La integración no introduce cambios de UX fuera de lo necesario (solo reemplazo de fuente de datos)

---

## P2 - Prioridad Media

### T-014: Health Checks y Métricas de Rendimiento 📋
**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** T-005

**Descripción:**  
Según Duda #55, implementar health checks y métricas de rendimiento (latencia, uso de memoria, conexiones activas).

**Sub-tareas:**
1. Crear endpoint `GET /health` con estado de:
   - MongoDB (conexión)
   - Redis (conexión)
   - Sensor RFID (conexión)
   - Memoria (heap usage)
2. Crear endpoint `GET /api/metrics` (protegido) con:
   - Partidas activas
   - Conexiones WebSocket
   - Eventos RFID procesados
   - Latencia promedio
3. Añadir middleware para medir latencia de endpoints
4. Documentar endpoints de salud

**Criterios de Aceptación:**
- `/health` retorna 200 si todo está OK, 503 si hay problemas
- Las métricas se actualizan en tiempo real

---

### T-015: Mejorar Gestión de Secrets 📋
**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** T-002

**Descripción:**  
Según sprint2_corrections.md, el storageService usa placeholders inseguros si faltan credenciales.

**Sub-tareas:**
1. Modificar storageService para lanzar error si faltan credenciales en producción
2. Añadir validación en envValidator.js para SUPABASE_URL y SUPABASE_KEY
3. Deshabilitar funcionalidad de storage si no hay credenciales en desarrollo (con warning)
4. Documentar variables de entorno requeridas

**Criterios de Aceptación:**
- El servidor falla al iniciar si faltan credenciales en producción
- En desarrollo, se muestra warning y el storage se deshabilita

---

### T-016: Configuración Robusta de Puerto Serie 📋
**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Según sprint2_corrections.md, el fallback hardcoded a COM3 falla en Linux/Mac.

**Sub-tareas:**
1. Eliminar fallback hardcoded de puerto serie
2. Hacer obligatoria la variable `SERIAL_PORT` si `RFID_ENABLED=true`
3. Añadir detección automática de puertos disponibles (informativo)
4. Añadir variable `RFID_ENABLED` para habilitar/deshabilitar RFID
5. Fallar controladamente con mensaje descriptivo si no hay puerto configurado

**Criterios de Aceptación:**
- El servidor no intenta conectar a puerto serie si RFID está deshabilitado
- Mensajes de error claros si falta configuración

---

### T-017: Silenciar Logs en Tests 📋
**Prioridad:** P2 | **Tamaño:** XS | **Dependencias:** Ninguna

**Descripción:**  
Según sprint2_corrections.md, los tests emiten demasiados logs que dificultan ver errores reales.

**Sub-tareas:**
1. Modificar logger.js para usar nivel `silent` cuando `NODE_ENV=test`
2. Añadir opción de verbose para debugging: `LOG_LEVEL=debug npm test`

**Criterios de Aceptación:**
- Los tests no producen output de winston por defecto
- Se puede habilitar logging para debugging

---

### T-018: Documentar Flujo de Autenticación en Desarrollo 📋 (MOVER A SPRINT 3)
**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #52, documentar cómo obtener tokens JWT válidos para testing.

**Sub-tareas:**
1. Documentar uso del script `scripts/get-test-token.js`
2. Crear endpoint `POST /api/dev/token` (solo NODE_ENV=development)
3. Documentar configuración `AUTH_BYPASS_FOR_DEV`
4. Añadir ejemplos de uso con Postman/curl
5. Actualizar README con instrucciones

**Criterios de Aceptación:**
- Un desarrollador nuevo puede obtener un token de prueba en < 5 minutos
- La documentación es clara y tiene ejemplos

---

### T-019: Eliminar Límite de Partidas Simultáneas 📋
**Prioridad:** P2 | **Tamaño:** XS | **Dependencias:** T-005

**Descripción:**  
Según Duda #21, no hay límite de partidas simultáneas (de momento).

**Sub-tareas:**
1. Eliminar o aumentar significativamente MAX_ACTIVE_PLAYS
2. Añadir monitorización para alertar si se supera un umbral
3. Documentar decisión y posibles impactos

**Criterios de Aceptación:**
- El sistema no rechaza partidas por límite alcanzado
- Hay alertas si el sistema se acerca a límites de recursos

---

### T-020: Configuración de Backup de MongoDB 📋 (MOVER A SPRINT 3)
**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #54, configurar backups de MongoDB.

**Sub-tareas:**
1. Documentar estrategia de backup para MongoDB Atlas
2. Crear script `scripts/backup-db.js` para backups manuales
3. Configurar retención de backups (30 días sugerido)
4. Añadir instrucciones de restauración
5. Probar proceso de restauración

**Criterios de Aceptación:**
- Existe documentación de backup/restore
- Los backups se pueden automatizar con cron

---

## P3 - Prioridad Baja

### T-022: Script de Drop de Base de Datos 📋
**Prioridad:** P3 | **Tamaño:** XS | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #35, crear script para eliminar datos de seeders haciendo drop de la BD.

**Sub-tareas:**
1. Crear script `scripts/drop-db.js`
2. Añadir confirmación interactiva antes de eliminar
3. Bloquear ejecución en producción
4. Documentar uso

**Criterios de Aceptación:**
- El script elimina la BD completa
- No se puede ejecutar en producción

---

### T-023: Preparar Entorno de Staging 📋 (MOVER A SPRINT 3)
**Prioridad:** P3 | **Tamaño:** L | **Dependencias:** Ninguna

**Descripción:**  
Según Duda #53, preparar entorno de staging para pruebas pre-producción.

**Sub-tareas:**
1. Documentar requisitos del entorno de staging
2. Crear archivo `.env.staging` de ejemplo
3. Configurar MongoDB Atlas para staging
4. Configurar Supabase bucket de staging
5. Documentar proceso de despliegue a staging

**Criterios de Aceptación:**
- Existe documentación completa para staging
- El entorno de staging es independiente de producción

---

### T-024: Rotación de Logs 📋 (MOVER A SPRINT 3, CON PINO JS)
**Prioridad:** P3 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Según RNF-CAL-014, implementar rotación de logs.

**Sub-tareas:**
1. Añadir `winston-daily-rotate-file` como dependencia
2. Configurar rotación diaria
3. Configurar retención de 14 días
4. Configurar compresión de logs antiguos

**Criterios de Aceptación:**
- Los logs rotan diariamente
- Los logs mayores a 14 días se eliminan automáticamente

---

### T-025: Documentar Protocolo de Eventos RFID 📋
**Prioridad:** P3 | **Tamaño:** S | **Dependencias:** T-009, T-010

**Descripción:**  
Documentar completamente el protocolo de comunicación RFID incluyendo múltiples sensores y modos.

**Sub-tareas:**
1. Documentar formato JSON de eventos del sensor
2. Documentar flujo de asociación sensor-partida
3. Documentar modos de escaneo
4. Crear diagramas de secuencia

**Criterios de Aceptación:**
- Existe documentación completa del protocolo RFID
- Incluye diagramas de secuencia

---

### T-026: Migrar a PinoJS (Evaluación) 📋 (MOVER A SPRINT 3)
**Prioridad:** P3 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Según RF-FUT-011, evaluar la migración de Winston a Pino.

**Sub-tareas:**
1. Crear branch de prueba con Pino
2. Medir diferencias de rendimiento
3. Documentar pros/contras
4. Decidir si proceder con la migración

**Criterios de Aceptación:**
- Existe documento de evaluación con benchmark
- Decisión documentada sobre migración

---

## Dependencias entre Tareas

```
T-001 (Tests) ─────────────────────────────────────────────────────────┐
                                                                       │
T-002 (storageService) ──────────────┬─────────────────────────────────┤
                                     │                                 │
T-003 (Super Admin) ─────────────────┼─────────────────────────────────┤
                                     │                                 │
T-004 (Sesión Única) ────────────────┼─────────────────────────────────┤
                                     │                                 │
T-005 (Redis) ───────────────────────┼──┬──────────────────────────────┤
                                     │  │                              │
T-006 (Pausa/Reanudación) ───────────┼──┘                              │
                                     │                                 ▼
T-007 (GDPR) ────────────────────────┤                          Sprint 2
                                     │                          Completado
T-008 (CardDeck) ────────────────────┤
                                     │
T-009 (Multi-Sensor) ────────────────┼──┬──────────────────────────────
                                     │  │
T-010 (Control RFID) ────────────────┼──┘
                                     │
T-011 (Transferencia) ───────────────┤
                                     │
T-012 (Formatos Assets) ─────────────┤
                                     │
T-013 (Compartir Contextos) ─────────┘

T-021 (Frontend ↔ API REST) ──────────┬────────────────────────────────
                                     │
T-001 (Tests) ────────────────────────┘
```

---

## Notas Adicionales

### Decisiones Técnicas Tomadas (Dudas Diciembre)

| Duda | Decisión |
|------|----------|
| #21 | Sin límite de partidas simultáneas |
| #22 | Cada sensor tiene ID único |
| #23 | El sensor descarta lecturas si backend desconectado |
| #24 | Debounce de tarjetas duplicadas se gestiona en frontend |
| #27 | Solo una respuesta correcta por ronda |
| #28 | Rondas en orden aleatorio, sin repetir fallidas |
| #30 | Pausa congela el timer, reanudación lo continúa |
| #31 | Anonimización de datos (no eliminación) |
| #33 | Sin límite de alumnos por profesor |
| #34 | Historial de partidas indefinido |
| #44 | Solo WebP y SVG para imágenes |
| #45 | Contextos compartidos entre profesores |
| #46 | Sin moderación de contenido (confiamos en profesores) |
| #48 | Una sola sesión activa por dispositivo |
| #49 | Refresh token 7 días con rotación |
| #51 | Super admin valida profesores nuevos |

### Requisitos Futuros Descartados (de momento)

- Sistema de pistas (Duda #29)
- Accesibilidad avanzada (Duda #56)
- Multiidioma (Duda #57)
- Migración a Bun (Duda #58)
- Migración a Supabase (Duda #59)

---

## Checklist de Finalización del Sprint

- [ ] Todos los tests pasan (cobertura > 50%)
- [ ] Documentación actualizada
- [ ] Sin errores críticos en Sentry
- [ ] Changelog actualizado
- [ ] Versión incrementada a 0.2.0
- [ ] Review con tutor completada
