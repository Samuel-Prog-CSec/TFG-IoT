# Requisitos No Funcionales - Calidad y Mantenibilidad

## RNF-CAL: Calidad del Software

---

## Arquitectura (RNF-CAL-001 a RNF-CAL-005)

### RNF-CAL-001: Patrón MVC ✅

**Descripción:** El backend debe seguir el patrón Modelo-Vista-Controlador con capa de servicios.

**Estructura:**

- **Models** (`/models`): Esquemas Mongoose, validación de datos
- **Controllers** (`/controllers`): Manejo de HTTP, orquestación
- **Services** (`/services`): Lógica de negocio compleja
- **Routes** (`/routes`): Definición de endpoints
- **Middlewares** (`/middlewares`): Validación, auth, errores

---

### RNF-CAL-002: Principios SOLID ✅

**Descripción:** El código debe adherirse a los principios SOLID.

**Implementaciones:**

- **S (Single Responsibility):** Cada servicio/controlador tiene una responsabilidad
- **O (Open/Closed):** Mecánicas extensibles sin modificar código existente
- **L (Liskov Substitution):** Validadores intercambiables
- **I (Interface Segregation):** Middlewares específicos por función
- **D (Dependency Inversion):** Inyección de Socket.IO en GameEngine

---

### RNF-CAL-003: Principio DRY ✅

**Descripción:** El código no debe repetirse innecesariamente.

**Implementaciones:**

- Middlewares reutilizables (auth, validation)
- Clases de error personalizadas
- Funciones de utilidad compartidas
- Constantes centralizadas
- Schemas Zod reutilizables

---

### RNF-CAL-004: Separación de Configuración ✅

**Descripción:** La configuración debe estar separada del código.

**Implementación:**

- Variables de entorno para configuración
- Archivos en `/config` para configuración estructurada
- `.env.example` como plantilla
- Validación de variables críticas al iniciar

---

### RNF-CAL-005: Modularidad ✅

**Descripción:** El sistema debe estar organizado en módulos independientes.

**Módulos:**

- Autenticación (auth.js, authController.js)
- Usuarios (users.js, userController.js)
- Tarjetas (cards.js, cardController.js)
- Mecánicas (mechanics.js, gameMechanicController.js)
- Contextos (contexts.js, gameContextController.js)
- Sesiones (sessions.js, gameSessionController.js)
- Partidas (plays.js, gamePlayController.js)
- Motor de Juego (gameEngine.js)
- Servicio RFID (rfidService.js)

---

## Manejo de Errores (RNF-CAL-006 a RNF-CAL-008)

### RNF-CAL-006: Clases de Error Personalizadas ✅

**Descripción:** El sistema debe usar clases de error específicas.

**Clases Implementadas:**

```javascript
AppError          // Base: message, statusCode, isOperational
├── ValidationError   // 400
├── UnauthorizedError // 401
├── ForbiddenError    // 403
├── NotFoundError     // 404
└── ConflictError     // 409
```

---

### RNF-CAL-007: Manejo Centralizado de Errores ✅

**Descripción:** Los errores deben manejarse de forma centralizada.

**Middleware:** `errorHandler`

**Funcionalidad:**

- Captura todos los errores
- Diferencia errores operacionales de programáticos
- Logging con Winston
- Tracking con Sentry
- Respuesta JSON estandarizada

---

### RNF-CAL-008: Integración con Sentry ✅

**Descripción:** Los errores deben reportarse a Sentry para monitoreo.

**Configuración:**

- RequestHandler y TracingHandler
- ErrorHandler para captura automática
- Filtrado de datos sensibles (password, tokens)
- Contexto de usuario en errores
- Profiling opcional

---

## Validación (RNF-CAL-009 a RNF-CAL-011)

### RNF-CAL-009: Validación con Zod ✅

**Descripción:** Todas las entradas deben validarse con Zod.

**Implementaciones:**

- `cardValidator.js`
- `userValidator.js`
- `gameMechanicValidator.js`
- `gameContextValidator.js`
- `gameSessionValidator.js`
- `gamePlayValidator.js`

---

### RNF-CAL-010: Validación en Mongoose ✅

**Descripción:** Los esquemas Mongoose deben tener validación a nivel de BD.

**Validaciones:**

- Campos required
- Valores enum
- Rangos min/max
- Expresiones regulares (match)
- Validadores personalizados

---

### RNF-CAL-011: Validación de Variables de Entorno ✅

**Descripción:** Las variables de entorno críticas deben validarse al iniciar.

**Módulo:** `envValidator.js`

**Variables Críticas:**

- JWT_SECRET (sin fallback inseguro)
- JWT_REFRESH_SECRET
- MONGODB_URI
- NODE_ENV

---

## Logging (RNF-CAL-012 a RNF-CAL-014)

### RNF-CAL-012: Logging Estructurado ✅

**Descripción:** Los logs deben ser estructurados y categorizados.

**Herramienta:** Winston

**Niveles:**

- `error`: Errores críticos → `/logs/error.log`
- `warn`: Advertencias
- `info`: Información general → `/logs/combined.log`
- `debug`: Debugging (solo desarrollo)

---

### RNF-CAL-013: Contexto en Logs ✅

**Descripción:** Los logs deben incluir contexto relevante.

**Campos Incluidos:**

- Timestamp
- Nivel
- Mensaje
- Metadata (userId, playId, path, etc.)
- Stack trace (en errores)

---

### RNF-CAL-014: Rotación de Logs 📋

**Descripción:** Los archivos de log deben rotarse para evitar crecimiento ilimitado.

**Estado:** Pendiente de implementar

**Configuración Futura:**

- Rotación diaria
- Retención de 14 días
- Compresión de logs antiguos

---

## Documentación (RNF-CAL-015 a RNF-CAL-017)

### RNF-CAL-015: Documentación JSDoc ✅

**Descripción:** El código debe estar documentado con JSDoc.

**Elementos Documentados:**

- Módulos (@fileoverview)
- Funciones (@param, @returns, @throws)
- Clases (@class, @constructor)
- Tipos (@typedef)
- Ejemplos (@example)

---

### RNF-CAL-016: README por Carpeta ✅

**Descripción:** Cada carpeta principal debe tener un README explicativo.

**Contenido:**

- Propósito de la carpeta
- Estructura de archivos
- Uso y ejemplos
- Decisiones de diseño

---

### RNF-CAL-017: Documentación de API ✅

**Descripción:** La API debe estar documentada.

**Documentación:**

- README.md del backend con endpoints
- Tabla de métodos, rutas y descripciones
- Payloads de request/response
- Códigos de error

---

## Testing 📋

### RNF-CAL-018: Testing Unitario

**Descripción:** El código crítico debe tener tests unitarios.

**Estado:** Pendiente de implementar

**Herramientas Planificadas:**

- Jest para testing
- Supertest para API
- MongoDB Memory Server

---

### RNF-CAL-019: Testing de Integración

**Descripción:** Los flujos principales deben tener tests de integración.

**Estado:** Pendiente de implementar

**Flujos a Testear:**

- Autenticación completa
- Creación de sesión y partida
- Flujo de juego con validación

