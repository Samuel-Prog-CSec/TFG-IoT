# Registro de Decisiones de Arquitectura (ADR)

## ADR-001: Eliminación del Límite Duro de Partidas Simultáneas

### Contexto

Inicialmente, el sistema imponía un límite duro (`MAX_ACTIVE_PLAYS`) en el número de partidas que podían ocurrir simultáneamente. Si se alcanzaba este límite, el servidor rechazaba nuevas conexiones de juego devolviendo un error.

El objetivo de este límite era proteger los recursos del servidor (memoria, CPU, conexiones de base de datos) ante picos de tráfico. Sin embargo, en la fase actual de despliegue y uso (clases controladas), este límite resultaba artificial y podía bloquear lecciones legítimas innecesariamente.

### Decisión

Se ha decidido **eliminar el bloqueo duro** para nuevas partidas.

1.  La variable `ACTIVE_PLAYS_WARNING_THRESHOLD` (antes `MAX_ACTIVE_PLAYS`) se mantiene como un **umbral de monitorización** (Soft Limit).
2.  Si se supera el umbral, el sistema **permite** crear la partida, pero registra un **WARNING** en los logs.
3.  Se confía en la monitorización externa y alertas (Sentry/Logs) para detectar saturación real.

### Posibles Impactos

#### 1. Rendimiento y Recursos (Memoria/CPU)

- **Impacto**: Al no haber límite, un número masivo de partidas podría agotar la memoria del servidor (Heap de Node.js) o saturar el Event Loop.
- **Mitigación**:
  - Cada estado de partida en `gameEngine` es relativamente ligero (~Kb).
  - Node.js maneja bien miles de objetos en memoria.
  - Se mantiene el `cleanupInterval` para eliminar partidas abandonadas y evitar fugas de memoria.

#### 2. Conexiones a Base de Datos

- **Impacto**: Cada partida genera eventos y escrituras. Un exceso de concurrencia podría saturar el pool de conexiones de MongoDB.
- **Mitigación**: Mongoose gestiona un pool de conexiones (default 5-10). Las peticiones se encolarán si el pool se agota, aumentando la latencia pero no tirando el servidor inmediatamente.

#### 3. Experiencia de Usuario

- **Positivo**: No habrá rechazos arbitrarios de servicio durante una clase.
- **Negativo (Riesgo)**: Si el servidor se satura realmente, todos los usuarios experimentarán lentitud (lag) en lugar de que solo los nuevos sean rechazados. Se prefiere degradación de servicio a denegación de servicio en este contexto educativo.

### Estado Futuro

Si el sistema escala a producción masiva, se deberá reimplementar un rate-limiting más inteligente (ej. por IP o por Tenant) o escalar horizontalmente el backend (lo cual requeriría migrar el estado en memoria de `gameEngine` totalmente a Redis).

---

## ADR-002: Autenticación Obligatoria en WebSockets y Desconexión por Invalidez

### Contexto

Los eventos Socket.IO permiten controlar partidas y emitir escaneos RFID en tiempo real. Sin una autenticación obligatoria en el handshake y sin revocación activa, un socket podría continuar enviando eventos incluso después de que la cuenta sea inhabilitada o se inicie sesión en otro dispositivo.

### Decisión

Se establece autenticación obligatoria en el handshake de Socket.IO, con validación de:

1. Token JWT (access token) desde `auth.token` o header `Authorization`.
2. Estado de cuenta (`active`) y aprobación (`approved` para docentes).
3. Single-session (el `sid` del token debe coincidir con `currentSessionId`).

Además, cuando una sesión se invalida (nuevo login) o la cuenta se desactiva/rechaza, se emite `session_invalidated` y se **desconectan** los sockets activos del usuario.

### Consecuencias

- **Seguridad mejorada**: evita control de partidas o lecturas RFID desde sesiones inválidas.
- **Coherencia de sesión**: garantiza que el canal en tiempo real respete single-session.
- **Coste aceptable**: se añade una consulta de usuario en el handshake, asumible por volumen de conexiones.
