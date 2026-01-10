# Sprint 1 - Fallos Críticos a Corregir

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)  
**Sprint:** Sprint 1 (Finalizado)  
**Fecha de Revisión:** Diciembre 2025  
**Versión:** 0.1.0

---

## Resumen

Este documento recoge los **fallos críticos y graves** detectados al finalizar el Sprint 1 que **deben ser atendidos obligatoriamente** antes de continuar con nuevas funcionalidades en el Sprint 2.

### Clasificación de Severidad

| Nivel | Descripción |
|-------|-------------|
| 🔴 **Crítico** | Bloquea desarrollo/despliegue. Debe corregirse inmediatamente. |
| 🟠 **Grave** | Afecta funcionalidad core. Debe corregirse en los primeros días del Sprint 2. |
| 🟡 **Moderado** | Deuda técnica importante. Corregir durante el Sprint 2. |

---

## 🔴 Fallos Críticos

### FC-001: Suite de Tests Completamente Rota

**Severidad:** 🔴 Crítico  
**Archivo(s) Afectado(s):** `tests/serial.test.js`, `tests/gameFlow.test.js`  
**Detectado en:** Ejecución de `npm test`

**Descripción:**  
La ejecución de tests falla estrepitosamente, haciendo imposible validar cambios de código de forma automatizada.

**Síntomas:**
- `serial.test.js` intenta abrir conexión real al puerto serie (COM3) en lugar de usar mock
- Error "File not found" cuando no hay hardware conectado
- "Work process failed to exit gracefully" por Open Handles no cerrados
- `gameFlow.test.js` falla en cadena por estados residuales entre tests

**Causa Raíz:**
- La inyección del mock de `serialport` no funciona correctamente debido a cómo se importa/instancia en `rfidService.js`
- La base de datos de test no se limpia correctamente entre tests
- Timers y conexiones no se cierran correctamente (memory leaks)

**Impacto:**
- Imposible ejecutar CI/CD
- Imposible validar regresiones
- Cobertura de código inválida (~31% reportada, pero no confiable)

**Solución Requerida:**
1. Refactorizar `rfidService.js` para permitir inyección de dependencias del `SerialPort`
2. Implementar limpieza completa de BD entre tests
3. Asegurar cierre de todos los handles (timers, conexiones) en `afterAll`
4. Configurar Jest para detectar y reportar Open Handles

**Prioridad de Corrección:** Inmediata (Día 1 del Sprint 2)

---

### FC-002: Typo en Nombre de Archivo Crítico

**Severidad:** 🔴 Crítico  
**Archivo Afectado:** `backend/src/services/storageSErvice.js`  

**Descripción:**  
El archivo del servicio de almacenamiento tiene un typo en su nombre (`SErvice` con E mayúscula). Esto puede causar:
- Errores de importación en sistemas case-sensitive (Linux, Mac)
- Confusión en el equipo de desarrollo
- Problemas en CI/CD en contenedores Linux

**Síntomas:**
- `Error: Cannot find module './storageService'` en Linux
- Imports inconsistentes en el código

**Solución Requerida:**
1. Renombrar archivo a `storageService.js`
2. Actualizar todas las referencias/imports
3. Verificar que Git detecta el cambio (puede requerir `git mv`)

**Prioridad de Corrección:** Inmediata (Día 1 del Sprint 2)

---

### FC-003: Configuración Hardcoded de Puerto Serie

**Severidad:** 🔴 Crítico  
**Archivo Afectado:** `src/services/rfidService.js`  

**Descripción:**  
El servicio RFID usa `COM3` como fallback hardcoded cuando no se define `SERIAL_PORT`. Esto:
- Falla en Linux/Mac donde los puertos son `/dev/ttyUSB0` o similar
- Causa errores silenciosos si el puerto no existe
- Puede intentar conectar a dispositivos incorrectos

**Síntomas:**
- Error "Port not found" en entornos no-Windows
- Intentos de conexión a dispositivos incorrectos
- El servicio falla silenciosamente en entornos sin hardware

**Código Problemático:**
```javascript
const port = process.env.SERIAL_PORT || 'COM3'; // Fallback hardcoded
```

**Solución Requerida:**
1. Eliminar fallback hardcoded
2. Hacer `SERIAL_PORT` obligatorio solo si `RFID_ENABLED=true`
3. Añadir variable `RFID_ENABLED` (default: false)
4. Fallar con mensaje descriptivo si falta configuración en producción

**Prioridad de Corrección:** Primeros 2 días del Sprint 2

---

## 🟠 Fallos Graves

### FG-001: Gestión Insegura de Secrets de Supabase

**Severidad:** 🟠 Grave  
**Archivo Afectado:** `src/services/storageSErvice.js`  

**Descripción:**  
El servicio de almacenamiento usa valores placeholder inseguros cuando faltan las credenciales de Supabase:
```javascript
this.supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
this.supabaseKey = process.env.SUPABASE_KEY || 'placeholder-key';
```

Esto permite que el servidor inicie con un cliente Supabase inválido, causando errores confusos cuando se intenta subir archivos.

**Síntomas:**
- El servidor inicia sin credenciales válidas
- Los uploads fallan con errores poco descriptivos
- No hay indicación clara de que faltan credenciales

**Solución Requerida:**
1. En producción: lanzar error si faltan credenciales
2. En desarrollo: deshabilitar storage con warning claro
3. Añadir validación en `envValidator.js`

**Prioridad de Corrección:** Primera semana del Sprint 2

---

### FG-002: Singleton RFID Limita a Un Solo Lector

**Severidad:** 🟠 Grave  
**Archivo Afectado:** `src/services/rfidService.js`  

**Descripción:**  
El diseño actual de `RFIDService` como Singleton acoplado a un único `SerialPort` limita el sistema a tener **un solo lector RFID físico** conectado al servidor. Esto contradice el requisito de múltiples sensores (Duda #22).

**Impacto:**
- Solo se puede usar un sensor RFID a la vez
- No se puede escalar a múltiples aulas/mesas
- Rediseño significativo requerido para soporte multi-sensor

**Solución Requerida:**
1. Opción A: Migrar a arquitectura MQTT donde los sensores son clientes autónomos
2. Opción B: Refactorizar servicio para manejar múltiples conexiones serie
3. Implementar mapa `sensorId → connection`

**Prioridad de Corrección:** Sprint 2 (tarea de alta prioridad)

---

### FG-003: Token Blacklist en Memoria

**Severidad:** 🟠 Grave  
**Archivo Afectado:** `src/middlewares/auth.js` (o donde esté implementado)  

**Descripción:**  
La blacklist de tokens revocados se almacena en memoria (Map), lo que significa:
- Se pierde si el servidor se reinicia
- No funciona con múltiples instancias del servidor
- Tokens revocados pueden usarse tras un reinicio

**Impacto:**
- Vulnerabilidad de seguridad tras reinicio
- Incompatible con escalado horizontal
- Tokens de logout siguen siendo válidos tras crash

**Solución Requerida:**
1. Migrar blacklist a Redis
2. Configurar TTL igual a expiración del token
3. Implementar limpieza automática

**Prioridad de Corrección:** Sprint 2 (junto con implementación de Redis)

---

### FG-004: Estado de Partidas Volátil

**Severidad:** 🟠 Grave  
**Archivo Afectado:** `src/services/gameEngine.js`  

**Descripción:**  
El estado de las partidas activas (`activePlays`, `cardToPlayMap`) se mantiene solo en memoria. Si el servidor se reinicia:
- Todas las partidas en curso se pierden
- Los alumnos deben reiniciar sus partidas
- No hay forma de recuperar el progreso

**Impacto:**
- Pérdida de datos de partidas activas tras reinicio
- Mala experiencia de usuario
- Datos de métricas incompletos

**Solución Requerida:**
1. Migrar estado de partidas a Redis
2. Implementar recuperación de estado al iniciar
3. Persistir checkpoints periódicos en MongoDB

**Prioridad de Corrección:** Sprint 2 (junto con implementación de Redis)

---

## 🟡 Fallos Moderados (Deuda Técnica)

### FM-001: Logs Excesivos durante Tests

**Severidad:** 🟡 Moderado  
**Archivo Afectado:** `src/utils/logger.js`  

**Descripción:**  
Los tests emiten demasiados logs de Winston/console, dificultando identificar errores reales en la salida de tests.

**Solución Requerida:**
- Configurar nivel `silent` cuando `NODE_ENV=test`
- Permitir override con variable de entorno para debugging

---

### FM-002: Cobertura de Tests Insuficiente

**Severidad:** 🟡 Moderado  
**Impacto:** Todo el proyecto  

**Descripción:**  
La cobertura de código es del ~31%, muy por debajo del mínimo recomendado del 70%. Muchos paths de código no están testeados.

**Áreas Críticas sin Cobertura:**
- Flujo completo de autenticación
- Validación de sesiones de juego
- Manejo de errores en gameEngine
- Casos edge de RFID

**Solución Requerida:**
- Objetivo mínimo Sprint 2: 50%
- Objetivo ideal: 70%
- Priorizar tests de flujos críticos

---

### FM-003: Falta Validación de Variables de Entorno Críticas

**Severidad:** 🟡 Moderado  
**Archivo Afectado:** `src/utils/envValidator.js`  

**Descripción:**  
Algunas variables críticas no se validan al iniciar el servidor, permitiendo que arranque con configuración incompleta.

**Variables Sin Validación Estricta:**
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SERIAL_PORT` (cuando RFID está habilitado)
- `REDIS_URL` (futuro)

**Solución Requerida:**
- Añadir validación estricta en producción
- Warnings claros en desarrollo
- Fallo temprano si falta configuración crítica

---

## Resumen de Acciones Inmediatas

### Día 1 del Sprint 2

| # | Acción | Responsable | Tiempo Estimado |
|---|--------|-------------|-----------------|
| 1 | Renombrar `storageSErvice.js` → `storageService.js` | Dev | 15 min |
| 2 | Crear mock funcional de SerialPort para tests | Dev | 2-4 horas |
| 3 | Corregir `serial.test.js` | Dev | 2-3 horas |
| 4 | Corregir `gameFlow.test.js` | Dev | 2-3 horas |
| 5 | Ejecutar suite completa y verificar verde | Dev | 30 min |

### Primera Semana del Sprint 2

| # | Acción | Responsable | Tiempo Estimado |
|---|--------|-------------|-----------------|
| 6 | Eliminar fallback hardcoded de puerto serie | Dev | 1-2 horas |
| 7 | Añadir validación de secrets de Supabase | Dev | 1-2 horas |
| 8 | Configurar logger silencioso en tests | Dev | 30 min |
| 9 | Implementar Redis para tokens y estado | Dev | 1-2 días |
| 10 | Aumentar cobertura de tests a 50% | Dev | Continuo |

---

## Checklist de Verificación

Antes de considerar estos fallos como resueltos:

- [ ] `npm test` ejecuta sin errores ni warnings
- [ ] No hay "Open Handles" reportados
- [ ] El servidor no intenta conectar a hardware sin configuración
- [ ] Los secrets faltantes causan error claro en producción
- [ ] La cobertura de tests es >= 50%
- [ ] Todos los archivos tienen nombres correctos (sin typos)
- [ ] El servidor puede reiniciarse sin perder estado crítico (con Redis)
