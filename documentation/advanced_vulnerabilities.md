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

## 2. Vulnerabilidades Web y API (Backend Node.js/Express)

### D. NoSQL Injection (Avanzada)

- Contexto: Usas MongoDB. Aunque uses Mongoose y Zod, hay riesgos si se pasan objetos JSON completos a las consultas.
- Vulnerabilidad: Inyección de operadores de MongoDB.
- Escenario: En el endpoint de login o búsqueda, si el atacante envía { "email": { "$ne": null }, "password": ... } en lugar de un string, y el backend no sanea estrictamente que el tipo de dato debe ser string, podría loguearse como el primer usuario de la base de datos (Admin).
- Nota: Zod ayuda mucho aquí, pero revisa los req.query donde a veces Zod es más permisivo si no se configura strict().

### E. Prototype Pollution

- Contexto: Node.js y el uso intensivo de JSON (merging de objetos, configs de juego, displayData).
- Vulnerabilidad: Un atacante inyecta la propiedad __proto__ en un payload JSON (ej: al actualizar el perfil o crear una sesión).
- Escenario: Al procesar el JSON, se modifica el prototipo base de Object. Esto podría causar que comprobaciones de seguridad posteriores fallen o incluso llevar a ejecución remota de código (RCE) si se usan librerías vulnerables al procesar esos objetos.

### F. SSRF (Server-Side Request Forgery) en Subida de Assets

- Contexto: El profesor puede subir imágenes/audio. Aunque validas Magic Bytes, ¿procesas URLs externas?
- Vulnerabilidad: Si en el futuro permites "Importar desde URL" o si la librería de procesamiento de imágenes (sharp) tiene vulnerabilidades al parsear ciertos metadatos.
- Escenario: Subir una imagen maliciosa que, al ser procesada por el servidor, intenta conectarse a servicios internos (ej: http://localhost:6379 para atacar Redis) o leer archivos locales.

## 3. Vulnerabilidades de Comunicación en Tiempo Real (Socket.io)

### G. CSWSH (Cross-Site WebSocket Hijacking)

- Contexto: Comunicación vía WebSockets.
- Vulnerabilidad: Similar a CSRF pero para WebSockets. Si el handshake de conexión no valida estrictamente el header Origin.
- Escenario: Un profesor visita una web maliciosa mientras tiene sesión iniciada en tu plataforma. La web maliciosa abre una conexión WebSocket a tu servidor (las cookies/tokens viajan automáticamente si no se protegen bien) y toma el control de las partidas.
- Defensa: Has mencionado auth.token en el handshake, lo cual es bueno, pero asegúrate de validar el Origin.

### H. DoS por Inundación de Websockets (Message Flooding)

- Contexto: Comunicación bidireccional constante.
- Vulnerabilidad: Agotamiento de recursos.
- Escenario: Un cliente malicioso envía miles de eventos join_play o rfid_scan_from_client por segundo. Aunque tengas Rate Limit HTTP, a veces se olvida implementar Rate Limit dentro del canal WebSocket por socket conectado. Esto podría saturar el Event Loop de Node.js.

## 4. Vulnerabilidades de Privacidad y Lógica (IDOR & GDPR)

### I. IDOR (Insecure Direct Object Reference) en Métricas y Assets

- Contexto: Los profesores pueden ver alumnos y partidas.
- Vulnerabilidad: Acceso a recursos de otros profesores manipulando IDs.
- Escenario: Un profesor cambia el ID en la URL GET /api/users/:id/stats para ver las estadísticas de un alumno de otro colegio. Aunque el requisito RF-SEG-008 menciona verificación de propiedad, es el fallo más común en implementaciones manuales.
- Ojo: Mencionas que los "Contextos son compartidos", pero los alumnos NO deberían serlo.

### J. Fuga de Información en Logs (Logging Injection)

- Contexto: Estrategia de Logging con Pino.
- Vulnerabilidad: Inyección de caracteres de nueva línea o falsificación de logs.
- Escenario: Un usuario se registra con el nombre: Usuario\n[ERROR] CRITICAL: Database dump.... Si los logs no escapan correctamente la entrada, un administrador que lea los logs podría confundirse o herramientas automáticas (como Sentry) podrían interpretar mal los eventos. Has mencionado "Redaction", asegúrate de que también sanea saltos de línea.

## 5. Vulnerabilidades Modernas / Cadena de Suministro

### K. Zombie Cookies / Tokens Persistentes

- Contexto: Refresh Tokens de 7 días con rotación.
- Vulnerabilidad: Si la revocación (blacklist en Redis) falla (ej: Redis se cae o reinicia y no tiene persistencia en disco configurada), los tokens revocados vuelven a ser válidos.
- Escenario: Un profesor cierra sesión en un ordenador público. Redis se reinicia. Alguien recupera la cookie del navegador y puede acceder porque la Blacklist estaba en memoria volátil.

### L. ReDoS (Regular Expression Denial of Service)

- Contexto: Validaciones con Zod y Regex personalizadas (ej: validación de UIDs, emails, contraseñas).
- Vulnerabilidad: Regex mal formadas que toman tiempo exponencial.
- Escenario: Si usas una regex compleja para validar nombres o formatos de tarjetas y un atacante envía una cadena especialmente diseñada (ej: aaaaaaaaaaaaaaaaaaaa!), podría bloquear el hilo principal de Node.js al 100% de CPU.
