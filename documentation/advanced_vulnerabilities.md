# Vulnerabilidades Avanzadas en el TFG de IoT y Web en Tiempo Real

## 1. Vulnerabilidades de la Lógica de Negocio y Hardware (Lo más crítico en tu TFG)

Dado que has migrado la lectura RFID al cliente mediante Web Serial (ver WebSerial_Architecture.md), has movido la "fuente de la verdad" a un entorno no confiable (el navegador).

### A. Spoofing de Eventos RFID (Client-Side Trust Issue)

- Contexto: El backend recibe eventos rfid_scan_from_client vía WebSocket.
- Vulnerabilidad: Un usuario con conocimientos básicos de JavaScript puede abrir la consola del navegador y emitir manualmente el evento rfid_scan_from_client con un UID arbitrario, sin necesidad de tener la tarjeta física ni el sensor conectado.
- Escenario: Un alumno (o un atacante) inyecta socket.emit('rfid_scan_from_client', { uid: 'UID_CORRECTO', ... }) para acertar todas las respuestas o registrar tarjetas falsas.
- Nivel: Crítico. Rompe la integridad del juego físico.

### B. Clonación y Replay de Tarjetas MIFARE

- Contexto: Usas tarjetas MIFARE Classic 1K/4K.
- Vulnerabilidad: El protocolo de cifrado de MIFARE Classic (Crypto-1) está roto hace años.
- Escenario: Un alumno usa una aplicación móvil con NFC (como Mifare Classic Tool) para clonar la tarjeta de otro compañero o crear una tarjeta "maestra" copiando el UID de una tarjeta válida.
- Nivel: Alto en entornos reales, Medio en entorno escolar controlado.

### C. Race Conditions en el Estado del Juego

- Contexto: El estado del juego está en Redis y manejas eventos asíncronos (gameEngine).
- Vulnerabilidad: Time-of-Check to Time-of-Use (TOCTOU).
- Escenario: Si dos sensores (o un sensor y un script) envían dos escaneos de la misma tarjeta con milisegundos de diferencia para la misma partida, el backend podría procesar ambos antes de actualizar el estado a "ronda finalizada", otorgando doble puntuación o corrompiendo las métricas del alumno.
- Nivel: Alto.
- Solución: Se implementó serialización por partida con `executeWithPlayLock()` en `gameEngine.js`, que garantiza que solo un evento se procesa a la vez por `playId`. Adicionalmente, la reserva de tarjetas usa scripts Lua atómicos (`reserveCards.lua` — all-or-nothing) que verifican y reservan en una sola operación Redis, eliminando la ventana TOCTOU. El rate limiter WebSocket para `rfid_scan_from_client` (2 eventos / 3s) con deduplicación de UID (cooldown de 1.2s) previene ráfagas de escaneos duplicados.

## 2. Vulnerabilidades Web y API (Backend Node.js/Express)

### D. NoSQL Injection (Avanzada)

- Contexto: Usas MongoDB. Aunque uses Mongoose y Zod, hay riesgos si se pasan objetos JSON completos a las consultas.
- Vulnerabilidad: Inyección de operadores de MongoDB.
- Escenario: En el endpoint de login o búsqueda, si el atacante envía { "email": { "$ne": null }, "password": ... } en lugar de un string, y el backend no sanea estrictamente que el tipo de dato debe ser string, podría loguearse como el primer usuario de la base de datos (Admin).
- Nivel: Crítico.
- Solución: Defensa en profundidad en tres capas: (1) **Zod `.strict()`** en todos los schemas de validación fuerza tipos primitivos (`z.string()`) y rechaza propiedades desconocidas; (2) **`securityPayloadGuard`** (`payloadSecurity.js`) bloquea recursivamente cualquier clave que empiece por `$` en `body`, `query` y `params` antes de que llegue a los controladores; (3) **`escapeRegex()`** sanea caracteres especiales en campos de búsqueda antes de construir operadores `$regex`. Además, se validó que el middleware HPP previene la inyección de arrays en query params que podrían evadir la validación `z.string()`.

### E. Prototype Pollution

- Contexto: Node.js y el uso intensivo de JSON (merging de objetos, configs de juego, displayData).
- Vulnerabilidad: Un atacante inyecta la propiedad __proto__ en un payload JSON (ej: al actualizar el perfil o crear una sesión).
- Escenario: Al procesar el JSON, se modifica el prototipo base de Object. Esto podría causar que comprobaciones de seguridad posteriores fallen o incluso llevar a ejecución remota de código (RCE) si se usan librerías vulnerables al procesar esos objetos.
- Nivel: Alto.
- Solución: El middleware `securityPayloadGuard` (`payloadSecurity.js`) inspecciona recursivamente todos los objetos en `body`, `query` y `params`, bloqueando las claves `__proto__`, `prototype` y `constructor`. En WebSockets, la misma función `findDangerousPayloadPath()` se aplica a los payloads de cada evento antes de procesarlos. Cualquier intento de inyección es rechazado con HTTP 400 y se loguea un evento de seguridad `SECURITY_PAYLOAD_BLOCKED` con contexto completo del request.

### F. SSRF (Server-Side Request Forgery) en Subida de Assets

- Contexto: El profesor puede subir imágenes/audio. Aunque validas Magic Bytes, ¿procesas URLs externas?
- Vulnerabilidad: Si en el futuro permites "Importar desde URL" o si la librería de procesamiento de imágenes (sharp) tiene vulnerabilidades al parsear ciertos metadatos.
- Escenario: Subir una imagen maliciosa que, al ser procesada por el servidor, intenta conectarse a servicios internos (ej: http://localhost:6379 para atacar Redis) o leer archivos locales.

## 3. Vulnerabilidades de Comunicación en Tiempo Real (Socket.io)

### G. CSWSH (Cross-Site WebSocket Hijacking)

- Contexto: Comunicación vía WebSockets.
- Vulnerabilidad: Similar a CSRF pero para WebSockets. Si el handshake de conexión no valida estrictamente el header Origin.
- Escenario: Un profesor visita una web maliciosa mientras tiene sesión iniciada en tu plataforma. La web maliciosa abre una conexión WebSocket a tu servidor (las cookies/tokens viajan automáticamente si no se protegen bien) y toma el control de las partidas.
- Nivel: Alto.
- Solución: El handshake de Socket.IO valida el header `Origin` contra la misma whitelist CORS (`corsWhitelist`) que las peticiones HTTP. En producción, las conexiones sin Origin son rechazadas. Además, la autenticación WebSocket requiere un access token JWT válido en `handshake.auth.token` (no en cookies), lo que impide que un sitio malicioso herede credenciales automáticamente — el token debe enviarse explícitamente en el código del cliente. La combinación Origin + auth.token proporciona defensa en profundidad contra CSWSH.

### H. DoS por Inundación de Websockets (Message Flooding)

- Contexto: Comunicación bidireccional constante.
- Vulnerabilidad: Agotamiento de recursos.
- Escenario: Un cliente malicioso envía miles de eventos join_play o rfid_scan_from_client por segundo. Aunque tengas Rate Limit HTTP, a veces se olvida implementar Rate Limit dentro del canal WebSocket por socket conectado. Esto podría saturar el Event Loop de Node.js.
- Nivel: Alto.
- Solución: Se implementó un sistema de rate limiting WebSocket multinivel en `socketRateLimiter.js`: (1) **Límites por evento** con ventana deslizante — `join_play`: 3/s, `rfid_scan_from_client`: 2/3s, `start_play`: 1/s; (2) **Límite global de payload** de 16KB (`maxHttpBufferSize`) y 8KB para eventos RFID; (3) **Bloqueo temporal** de 60s tras 3 violaciones consecutivas; (4) **Deduplicación RFID** con cooldown de 1.2s para prevenir escaneos repetidos; (5) **Limpieza automática** de memoria cada 2.5 minutos para prevenir memory leaks de conexiones inactivas. Las conexiones no autenticadas son rechazadas en el handshake antes de que alcancen el rate limiter.

## 4. Vulnerabilidades de Privacidad y Lógica (IDOR & GDPR)

### I. IDOR (Insecure Direct Object Reference) en Métricas y Assets

- Contexto: Los profesores pueden ver alumnos y partidas.
- Vulnerabilidad: Acceso a recursos de otros profesores manipulando IDs.
- Escenario: Un profesor cambia el ID en la URL GET /api/users/:id/stats para ver las estadísticas de un alumno de otro colegio. Aunque el requisito RF-SEG-008 menciona verificación de propiedad, es el fallo más común en implementaciones manuales.
- Nivel: Alto.
- Solución: Todos los controllers implementan verificación de ownership por `createdBy`: (1) **Alumnos** — `userController` valida que `student.createdBy === req.user._id` antes de devolver datos; (2) **Sesiones** — `gameSessionController` filtra por `createdBy` del profesor; (3) **Partidas** — `gamePlayController` verifica que la sesión padre pertenece al profesor; (4) **Mazos** — `cardDeckController` verifica `creator` ownership; (5) **Analytics** — valida ownership del alumno antes de mostrar estadísticas. El rol `super_admin` mantiene visibilidad global para administración. Los Contextos (`GameContext`) y Mecánicas (`GameMechanic`) son compartidos por diseño (recursos globales de la plataforma, no datos privados de un profesor).

### J. Fuga de Información en Logs (Logging Injection)

- Contexto: Estrategia de Logging con Pino.
- Vulnerabilidad: Inyección de caracteres de nueva línea o falsificación de logs.
- Escenario: Un usuario se registra con el nombre: Usuario\n[ERROR] CRITICAL: Database dump.... Si los logs no escapan correctamente la entrada, un administrador que lea los logs podría confundirse o herramientas automáticas (como Sentry) podrían interpretar mal los eventos.
- Nivel: Medio.
- Solución: En producción, Pino emite JSON estructurado donde los control characters se escapan automáticamente (`\n` → `\\n`), por lo que los parsers de logs (ELK, CloudWatch, etc.) no se confunden. Se añadió un serializer personalizado `userInput` en `logger.js` que elimina caracteres de control (rango `U+0000–U+001F` y `U+007F`) para prevenir log forgery en desarrollo con `pino-pretty`. Adicionalmente, Pino ya aplica redacción (`[REDACTED]`) sobre rutas sensibles como `req.headers.authorization`, `req.body.password`, `req.headers.cookie`, `user.email`, tokens, etc.

## 5. Vulnerabilidades Modernas / Cadena de Suministro

### K. Zombie Cookies / Tokens Persistentes

- Contexto: Refresh Tokens de 30 días con rotación.
- Vulnerabilidad: Si la revocación (blacklist en Redis) falla (ej: Redis se cae o reinicia y no tiene persistencia en disco configurada), los tokens revocados vuelven a ser válidos.
- Escenario: Un profesor cierra sesión en un ordenador público. Redis se reinicia. Alguien recupera la cookie del navegador y puede acceder porque la Blacklist estaba en memoria volátil.
- Nivel: Alto.
- Solución: Redis está configurado con AOF (Append Only File) persistence (`--appendonly yes --appendfsync everysec`) tanto en `docker-compose.yml` como en `docker-compose.prod.yml`, garantizando que la blacklist de tokens revocados sobrevive reinicios. Adicionalmente, el sistema implementa una segunda línea de defensa independiente de Redis: cada login genera un nuevo `currentSessionId` (UUID) almacenado en MongoDB, y cada validación de token verifica que el `sid` del JWT coincida con el `currentSessionId` del usuario en BD. Si un token es robado y el usuario hace login desde otro dispositivo, el `sessionId` cambia y el token robado queda invalidado sin depender de la blacklist Redis.

### L. ReDoS (Regular Expression Denial of Service)

- Contexto: Validaciones con Zod y Regex personalizadas (ej: validación de UIDs, emails, contraseñas).
- Vulnerabilidad: Regex mal formadas que toman tiempo exponencial.
- Escenario: Si usas una regex compleja para validar nombres o formatos de tarjetas y un atacante envía una cadena especialmente diseñada (ej: aaaaaaaaaaaaaaaaaaaa!), podría bloquear el hilo principal de Node.js al 100% de CPU.
- Nivel: Alto.
- Solución: Se auditaron todas las expresiones regulares custom del proyecto. Todas usan patrones seguros: clases de caracteres simples (`[0-9a-fA-F]`), longitud fija con anchoring (`^...$`), y cuantificadores no anidados. No se encontraron patrones con repetición anidada ni backtracking catastrófico. Los patrones específicos auditados incluyen: ObjectId (`/^[0-9a-fA-F]{24}$/`), UID RFID (`/^[0-9A-F]{8}$|^[0-9A-F]{14}$/`), validaciones de password (clases individuales `[A-Z]`, `[a-z]`, `[0-9]`), y `escapeRegex()` (clase de caracteres pura). Se recomienda realizar esta auditoría periódicamente al añadir nuevos patrones.

## 6. Vulnerabilidades Detectadas en Auditoría (Marzo 2026)

### M. HTTP Parameter Pollution (HPP)

- Contexto: Express parsea query params duplicados como arrays (e.g. `?role=admin&role=student` → `req.query.role = ['admin', 'student']`).
- Vulnerabilidad: Si el código accede a `req.query` antes de la validación Zod, o si algún middleware no anticipó recibir un array donde esperaba un string, podría causar comportamientos inesperados o bypass de lógica de autorización.
- Escenario: Un atacante envía `GET /api/users?role=student&role=super_admin`. Si algún middleware previo a Zod comprueba `req.query.role === 'student'`, la comparación fallaría con el array, potencialmente saltando un filtro de seguridad.
- Nivel: Medio.
- Solución: Se añadió el middleware `hpp` (npm) en `server.js`, que normaliza query params duplicados manteniendo solo el último valor. Esto actúa como primera línea de defensa antes de que la validación Zod (segunda línea) rechace tipos incorrectos con `.strict()`.

### N. Sort Injection via `sortBy` sin validación enum

- Contexto: El schema base `paginationSchema` (`commonValidator.js`) definía `sortBy: z.string().optional()`, permitiendo cualquier string como campo de ordenación en MongoDB.
- Vulnerabilidad: Un atacante podría inyectar operadores MongoDB en la opción `sort` de las queries, ya que el valor de `sortBy` se usa directamente como clave del objeto de ordenación `{ [sortBy]: 1 }`.
- Escenario: `GET /api/admin/pending?sortBy={"$where":"sleep(5000)"}` — la ruta admin usaba el schema base sin sobreescribir `sortBy`, permitiendo que un string arbitrario llegara al sort de MongoDB.
- Nivel: Alto.
- Solución: Se restringe `sortBy` en el schema base `paginationSchema` a `z.enum(['createdAt', 'updatedAt']).optional().default('createdAt')`. Todos los endpoints de dominio (sessions, plays, cards, users, etc.) ya sobreescribían `sortBy` con sus propios `z.enum()` específicos, por lo que no se ven afectados. El cambio cierra el único endpoint que usaba el schema base directamente.

### O. Exposición de herramientas de debug sin autenticación

- Contexto: Docker Compose incluye un perfil `debug` con Mongo Express (UI web para MongoDB) y Redis Commander. Mongo Express estaba configurado con `ME_CONFIG_BASICAUTH=false`, deshabilitando cualquier forma de autenticación.
- Vulnerabilidad: Acceso no autenticado a la base de datos completa a través de una interfaz web.
- Escenario: Un desarrollador activa el perfil debug en un entorno accesible en red (e.g. servidor de staging, VPN compartida) o lo deja activo por error. Cualquier persona con acceso al puerto 8082 puede navegar, modificar y eliminar documentos de MongoDB sin credenciales, incluyendo datos de usuarios, sesiones de juego y tokens.
- Nivel: Alto. Aunque las herramientas de debug solo se activan con `--profile debug`, el riesgo es significativo porque: (1) no requiere ninguna credencial, (2) otorga acceso completo de lectura/escritura a la BD, (3) el perfil podría activarse por error en entornos compartidos.
- Solución: Se habilitó BasicAuth (`ME_CONFIG_BASICAUTH=true`) con credenciales configurables por variables de entorno (`MONGO_EXPRESS_USER`, `MONGO_EXPRESS_PASSWORD`). Los valores por defecto (`admin`/`devAdm1n!`) son solo para desarrollo local; en otros entornos deben sobreescribirse en el archivo `.env`. Redis Commander no se modificó porque ya opera en un puerto diferente y no expone capacidades de escritura destructiva por defecto.
