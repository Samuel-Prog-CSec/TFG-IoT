### T-007: Implementar Cumplimiento GDPR/LOPD 📋
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

### T-009: Soporte para Múltiples Sensores RFID 📋
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

### T-010: Control de Procesamiento RFID desde Frontend 📋
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

### T-018: Documentar Flujo de Autenticación en Desarrollo 📋
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

### T-020: Configuración de Backup de MongoDB 📋
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

### T-023: Preparar Entorno de Staging 📋
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

### T-026: Migrar a PinoJS (Evaluación) 📋
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