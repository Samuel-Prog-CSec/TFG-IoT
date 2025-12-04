# Requisitos Funcionales - Implementación Futura

## RF-FUT: Requisitos para Versiones Futuras

---

## Frontend React (RF-FUT-001 a RF-FUT-005)

### RF-FUT-001: Aplicación Web para Profesores 📋

**Descripción:** Desarrollar aplicación React completa para profesores.

**Funcionalidades:**

- Dashboard con estadísticas
- Gestión de alumnos
- Creación de sesiones de juego
- Monitoreo de partidas en tiempo real
- Análisis de resultados

**Stack:**

- React 19+ con Hooks
- React Router v7+
- Socket.IO client
- Axios
- Tailwind CSS 4+

---

### RF-FUT-002: Interfaz de Juego 📋

**Descripción:** Vista de juego para mostrar desafíos y feedback.

**Componentes:**

- GameBoard: Vista principal del juego
- Challenge: Muestra el desafío actual
- CardReader: Estado del sensor RFID
- Feedback: Animaciones de respuesta correcta/incorrecta
- ScoreBoard: Puntuación en tiempo real

---

### RF-FUT-003: Panel de Administración 📋

**Descripción:** Panel para gestión de mecánicas y contextos.

**Funcionalidades:**

- CRUD de mecánicas
- CRUD de contextos
- Subida de assets multimedia
- Gestión de tarjetas RFID
- Seeders visuales

---

### RF-FUT-004: Estadísticas y Reportes 📋

**Descripción:** Visualización de estadísticas de aprendizaje.

**Características:**

- Gráficos de progreso por alumno
- Comparativa de clase
- Identificación de dificultades
- Exportación a PDF/CSV
- Filtros por fecha, aula, mecánica

---

### RF-FUT-005: Diseño Responsivo 📋

**Descripción:** La aplicación debe funcionar en tablets y escritorio.

**Breakpoints:**

- Mobile: < 768px (limitado)
- Tablet: 768px - 1024px (óptimo para profesores)
- Desktop: > 1024px (completo)

---

## Hardware y Conectividad (RF-FUT-006 a RF-FUT-010)

### RF-FUT-006: Múltiples Lectores RFID 📋

**Descripción:** Soportar múltiples sensores RFID simultáneos.

**Enfoque:**

- Migrar de SerialPort a MQTT
- Cada ESP8266 publica a topic único
- Backend suscrito a todos los topics
- Asociación reader_id ↔ playId

**Beneficios:**

- Un lector por alumno/aula
- Comunicación inalámbrica
- Escalabilidad horizontal
- Menor acoplamiento hardware-servidor

---

### RF-FUT-007: Modo Offline del Sensor 📋

**Descripción:** El ESP8266 debe poder operar sin conexión temporal.

**Características:**

- Buffer local de eventos
- Sincronización al reconectar
- Indicador LED de estado
- Almacenamiento en SPIFFS

---

### RF-FUT-008: Feedback Audiovisual en Hardware 📋

**Descripción:** Añadir feedback en el propio dispositivo RFID.

**Componentes:**

- LEDs RGB para indicar correcto/incorrecto
- Buzzer para feedback auditivo
- Pantalla OLED pequeña (opcional)

---

### RF-FUT-009: Batería para ESP8266 📋

**Descripción:** Versión portátil del lector con batería.

**Especificaciones:**

- Batería LiPo 3.7V
- Indicador de carga
- Deep sleep entre lecturas
- Autonomía mínima: 8 horas

---

### RF-FUT-010: OTA Updates 📋

**Descripción:** Actualización de firmware Over-The-Air.

**Implementación:**

- Servidor de actualizaciones
- Verificación de versión
- Rollback en caso de fallo

---

## Mejoras de Backend (RF-FUT-011 a RF-FUT-015)

### RF-FUT-011: Migración a PinoJS 📋

**Descripción:** Reemplazar Winston por Pino para mejor rendimiento.

**Beneficios:**

- Mayor velocidad de logging
- Menor uso de CPU
- Formato JSON nativo
- Mejor integración con ELK stack

---

### RF-FUT-012: Redis para Tokens y Sesiones 📋

**Descripción:** Migrar blacklist de tokens y datos de sesión a Redis.

**Implementación:**

- Token blacklist con TTL automático
- Socket.IO Redis adapter
- Caché de datos frecuentes
- Pub/Sub para eventos

---

### RF-FUT-013: MongoDB Atlas 📋

**Descripción:** Migrar a MongoDB Atlas para producción.

**Características:**

- Clusters de producción
- Backups automáticos
- Monitoring integrado
- Escalado automático

---

### RF-FUT-014: API Versioning 📋

**Descripción:** Implementar versionado de API.

**Enfoque:**

- URL versioning: `/api/v1/`, `/api/v2/`
- Headers de deprecación
- Documentación por versión
- Periodo de transición

---

### RF-FUT-015: Rate Limiting Avanzado 📋

**Descripción:** Rate limiting más sofisticado con Redis.

**Características:**

- Por usuario además de por IP
- Límites dinámicos
- Throttling progresivo
- Dashboard de métricas

---

## Funcionalidades Adicionales (RF-FUT-016 a RF-FUT-020)

### RF-FUT-016: Mecánica de Secuencia Completa 📋

**Descripción:** Implementar completamente la mecánica de secuencia.

**Flujo:**

1. Mostrar elementos a ordenar
2. Jugador escanea en orden
3. Validación paso a paso
4. Puntuación por secuencia completa

---

### RF-FUT-017: Mecánica de Memoria Completa 📋

**Descripción:** Implementar completamente la mecánica de memoria.

**Flujo:**

1. Mostrar patrón por tiempo limitado
2. Ocultar patrón
3. Jugador recrea con tarjetas
4. Validación al completar

---

### RF-FUT-018: Sistema de Logros 📋

**Descripción:** Gamificación con logros y badges.

**Ejemplos:**

- "Primera partida completada"
- "10 respuestas correctas seguidas"
- "Mejor tiempo de la clase"
- "Maestro de Geografía"

---

### RF-FUT-019: Modo Multijugador Competitivo 📋

**Descripción:** Partidas con múltiples jugadores compitiendo.

**Características:**

- Mismas preguntas simultáneas
- Ranking en tiempo real
- Bonus por velocidad
- Podio al finalizar

---

### RF-FUT-020: Integración con LMS 📋

**Descripción:** Integración con sistemas de gestión de aprendizaje.

**Estándares:**

- LTI (Learning Tools Interoperability)
- xAPI (Experience API)
- Exportación SCORM

**Plataformas:**

- Google Classroom
- Moodle
- Canvas

---

## Testing y CI/CD (RF-FUT-021 a RF-FUT-023)

### RF-FUT-021: Suite de Tests Automatizados 📋

**Descripción:** Implementar suite completa de tests.

**Tipos:**

- Unit tests (Jest)
- Integration tests (Supertest)
- E2E tests (Playwright/Cypress)
- Performance tests (Artillery)

---

### RF-FUT-022: Pipeline CI/CD 📋

**Descripción:** Automatizar build, test y deploy.

**Herramientas:**

- GitHub Actions
- Docker para containerización
- Staging y Production environments
- Rollback automático

---

### RF-FUT-023: Documentación OpenAPI 📋

**Descripción:** Documentación automática de API con Swagger.

**Características:**

- Swagger UI
- Generación desde código
- Testing interactivo
- Generación de clientes

