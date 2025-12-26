# Correcciones para el Sprint 2 - Backend

Este documento recoge los problemas detectados en la finalización del Sprint 1 y define las tareas prioritarias para abordar en el Sprint 2.

## 🔴 Prioridad Alta (Bloqueantes)

### 1. Suite de Tests Rotos (`npm test`)
Actualmente, la ejecución de tests falla estrepitosamente. Es imperativo tener una suite en verde antes de añadir nuevas funcionalidades.

- **Problema Crítico en `serial.test.js`**:
  - Los tests unitarios intentan abrir una conexión real al puerto serie (`COM3`) en lugar de usar el mock.
  - **Causa**: La inyección del mock de `serialport` no está funcionando correctamente, probablemente debido a cómo se importa/instancia en `rfidService.js`.
  - **Consecuencia**: Fallo en entornos sin hardware (CI/CD) y errores de "File not found" en local. "Work process failed to exit gracefully".

- **Tests de Integración (`gameFlow.test.js`)**:
  - Fallan en cadena debido a estados residuales o dependencias no resueltas.
  - Se requiere asegurar que la base de datos de test (MongoDB Memory Server o test DB) se limpia correctamente entre tests.

- **Cobertura Insuficiente**:
  - Cobertura global del ~31%. Es demasiado baja para garantizar estabilidad.

### 2. Errores de Nombrado de Archivos
- **Archivo**: `backend/src/services/storageSErvice.js`
  - **Problema**: Typo en el nombre del archivo (`SErvice` con E mayúscula).
  - **Acción**: Renombrar a `storageService.js` y actualizar todas las referencias (imports).

## 🟡 Prioridad Media (Deuda Técnica & Mejoras)

### 3. Configuración Hardcoded
- **Archivo**: `src/services/rfidService.js`
  - Se usa `COM3` como fallback hardcoded. Esto fallará en Linux/Mac o si el puerto cambia.
  - **Acción**: Hacer robusta la configuración vía variables de entorno y fallar controladamente si no se define, en lugar de intentar conectar a un puerto default ciegamente en producción.

### 4. Limitación de Singleton en RFID (Duda #1)
- **Problema**: El diseño actual de `RFIDService` como Singleton acoplado a un `SerialPort` local limita el sistema a tener **un solo lector RFID físico** conectado al servidor.
- **Acción**: Evaluar migración a arquitectura basada en eventos externos (ej: MQTT) donde los lectores son clientes autónomos, o refactorizar el servicio para manejar múltiples puertos si se decide mantener conexión directa.

### 5. Gestión de Secrets (Supabase)
- **Archivo**: `src/services/storageSErvice.js`
  - El constructor usa valores placeholder inseguros si faltan las credenciales (`placeholder.supabase.co`).
  - **Acción**: En producción/test, esto debería lanzar un error o deshabilitar el servicio explícitamente en lugar de configurar un cliente inválido silenciosamente.

## 🟢 Prioridad Baja (Mantenimiento)

### 6. Limpieza de Logs
- Los tests actuales emiten muchos logs de consola (winston/console). Configurar el logger para que sea silencioso durante `NODE_ENV=test` para facilitar la lectura de errores reales.

---

## Plan de Acción Inmediato (Inicio Sprint 2)

1. **Renombrar** `storageSErvice.js` -> `storageService.js`.
2. **Refactorizar `serial.test.js`** para asegurar que el mock de `SerialPort` funciona y no se toca hardware real.
3. **Corregir `gameFlow.test.js`** y asegurar que pasa en verde.
4. **Ejecutar suite completa** y verificar que no hay "Open Handles" (fugas de memoria).
