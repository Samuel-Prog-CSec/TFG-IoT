# Hallazgos del firmware RFID (propuesta para el tutor)

> **Estado:** documento de propuesta. La app web ya compensa defensivamente todos los puntos abajo; ninguno de estos hallazgos es bloqueante. Se presentan al tutor para su discusión y eventual modificación del firmware en una versión futura.
>
> **Archivo auditado:** `rfid_scanner/src/main.cpp` (141 líneas), `rfid_scanner/platformio.ini`.
>
> **Fecha de auditoría:** 2026-04-19.
>
> **Asunción del plan de hardening:** el firmware en `rfid_scanner/` es inmutable; la app web (frontend + backend) compensa defensivamente cualquier limitación.

---

## 1. Mensaje de boot en texto plano (no JSON)

**Ubicación:** `rfid_scanner/src/main.cpp:16`

```cpp
Serial.println("RFID Scanner v1.0 - Ready for MERN integration");
```

**Problema técnico:** El resto del protocolo serial está consistentemente en JSON line-delimited (`{"event":"...", ...}\n`). El `Serial.println` de boot es la única excepción y rompe la uniformidad. Cualquier parser estricto que asuma `JSON.parse(line)` sin filtros lanza un `SyntaxError` en cada arranque.

**Mitigación actual en la app:** `frontend/src/services/webSerialService.js` filtra explícitamente este banner con un regex `/^RFID Scanner/i` y emite un evento `device_banner` (en lugar de `error`) una sola vez por sesión.

**Propuesta de fix firmware:**

```cpp
String json = "{\"event\":\"banner\",\"product\":\"RFID Scanner\",\"version\":\"1.0\"}";
Serial.println(json);
```

Beneficio: la app puede consumir el banner como cualquier otro evento sin lógica especial.

---

## 2. Delays bloqueantes (`delay()`)

**Ubicaciones:**

- `main.cpp:15` — `delay(2000)` (espera ruido de boot del ESP8266).
- `main.cpp:68` — `delay(50)` (entre reintentos de lectura).
- `main.cpp:92, :125` — `delay(500)` (cooldown tras detectar tarjeta).
- `main.cpp:139` — `delay(100)` (entre iteraciones del loop sin tarjeta).

**Problema técnico:** `delay()` bloquea completamente el loop principal del ESP8266. Mientras está en delay, el firmware no puede:

- Leer del puerto serie (no hay `Serial.read()` y aunque lo hubiera, los bytes se acumularían sin procesar).
- Responder a comandos del host.
- Atender interrupciones críticas (excepto NMI).

**Mitigación actual en la app:** ninguna directa. La app web no necesita enviar comandos al sensor (protocolo unidireccional, ver punto 3), por lo que el bloqueo es invisible. Pero impide cualquier ampliación futura del protocolo.

**Propuesta de fix firmware:** migrar a patrón no bloqueante con `millis()`:

```cpp
static unsigned long lastDetectionMs = 0;
const unsigned long DETECTION_COOLDOWN_MS = 500;

void loop() {
  unsigned long now = millis();
  if (now - lastDetectionMs < DETECTION_COOLDOWN_MS) {
    return; // todavía en cooldown
  }
  // ... lógica de detección
  lastDetectionMs = now;
}
```

---

## 3. Protocolo unidireccional (sin canal host → device)

**Ubicación:** todo el firmware. No existe `Serial.available()` ni `Serial.read()`.

**Problema técnico:** el firmware sólo emite. El host no puede:

- Pedir un rescaneo manual.
- Ajustar la ganancia de antena en runtime (`PCD_SetAntennaGain`).
- Pedir silencio de heartbeats durante una ráfaga de scans (para no contaminar el buffer cliente).
- Reiniciar el chip RC522 sin desconectar/reconectar USB.
- Confirmar comandos (no hay ACK).

**Mitigación actual en la app:** ninguna requerida porque ningún feature del plan necesita comandos. El backend confía en los eventos emitidos.

**Propuesta de fix firmware:**

1. Añadir lectura de comandos al inicio de `loop()`:
   ```cpp
   if (Serial.available()) {
     String cmd = Serial.readStringUntil('\n');
     handleHostCommand(cmd);
   }
   ```
2. Definir un sub-protocolo simple, p. ej.:
   - `{"cmd":"set_gain","value":48}` → ajusta `PCD_SetAntennaGain`.
   - `{"cmd":"silence_heartbeat","ms":30000}` → suprime status durante 30 s.
   - `{"cmd":"reset"}` → reinicia el RC522.
3. Cada comando responde con `{"event":"ack","cmd":"...","ok":true|false}`.

---

## 4. Latencia de `card_removed` (~1 segundo)

**Ubicación:** `main.cpp:132-138`

```cpp
} else {
  noDetectCount++;
  if (noDetectCount > 10 && cardPresentFlag) {
    String json = "{\"event\":\"card_removed\",\"uid\":\"" + lastUid + "\"}";
    Serial.println(json);
    cardPresentFlag = false;
    lastUid = "";
  }
  delay(100);
}
```

**Problema técnico:** `noDetectCount > 10` con `delay(100)` significa que `card_removed` se emite con ~1000-1100 ms de latencia tras retirar la tarjeta. Si el alumno retira y reinserta la misma tarjeta en menos de 1 s, el firmware no emite `card_removed` y el contador `cardsDetected` puede quedar inconsistente.

**Mitigación actual en la app:** la lógica de juego del backend NO depende de `card_removed`. Sólo se usa para feedback visual informativo. La app es robusta a esta latencia.

**Propuesta de fix firmware:** considerar un umbral más sensible o un timestamp absoluto:

```cpp
static unsigned long lastSeenMs = 0;
const unsigned long REMOVAL_THRESHOLD_MS = 300;

if (cardPresent) {
  lastSeenMs = millis();
} else if (cardPresentFlag && millis() - lastSeenMs > REMOVAL_THRESHOLD_MS) {
  // emit card_removed
}
```

Reduciría la latencia a ~300 ms manteniendo robustez frente a falsos negativos transitorios.

---

## 5. `cards_detected` se incrementa por iteración, no por UID único

**Ubicación:** `main.cpp:85, :120` (incremento `cardsDetected++`).

**Problema técnico:** el contador del heartbeat (`{"event":"status","cards_detected":N,...}`) cuenta DETECCIONES, no UIDs únicos. Si la misma tarjeta queda apoyada sobre el lector, `cardsDetected` no crece (gracias al `cardPresentFlag` + `delay(500)`), pero si el alumno alterna A→B→A→B rápidamente, cuenta 4 cuando son 2 tarjetas distintas escaneadas dos veces cada una.

**Mitigación actual en la app:** el backend mantiene sus propias métricas en `rfidService` y `gameEngine.metrics` (`totalCardScans`, `dedupeHits`, `ignoredCardScans`). El `cards_detected` del heartbeat se ignora a efectos de lógica.

**Propuesta de fix firmware:** mantener un Set de UIDs únicos vistos:

```cpp
#include <set>
std::set<String> uniqueUids;
// ...
uniqueUids.insert(uidStr);
// en heartbeat:
"\"unique_cards\":" + String(uniqueUids.size())
```

(Cuidado con la fragmentación de heap en el ESP8266 — alternativamente, contar con un contador de UIDs nuevos cuando `lastUid != uidStr`).

---

## 6. Sin validación CRC del UID en fallback de anticollision

**Ubicación:** `main.cpp:96-107` (path de fallback cuando `PICC_ReadCardSerial` falla 3 veces).

**Problema técnico:** el firmware reconstruye el UID directamente de `backBuf[0..3]` sin verificar el byte de CRC (BCC) que normalmente sigue al UID en MIFARE. Clones del RC522 con firmware no estándar pueden devolver UIDs parcialmente corruptos en este path.

**Mitigación actual en la app:** `webSerialService._handleCardDetected` valida el formato del UID con `/^[0-9A-F]{8}$|^[0-9A-F]{14}$/` antes de aceptarlo. UIDs malformados emiten `device_error` con `type='invalid_uid'` y NO se procesan como scan.

**Propuesta de fix firmware:** añadir verificación del BCC tras la lectura cruda:

```cpp
byte bcc = backBuf[0] ^ backBuf[1] ^ backBuf[2] ^ backBuf[3];
if (bcc != backBuf[4]) {
  Serial.println("{\"event\":\"error\",\"type\":\"crc_failure\",\"message\":\"BCC mismatch\"}");
  return;
}
```

---

## 7. Versión de la librería MFRC522 con caret (semver flexible)

**Ubicación:** `rfid_scanner/platformio.ini:17`

```ini
lib_deps = miguelbalboa/MFRC522@^1.4.10
```

**Problema técnico:** el operador `^1.4.10` permite actualizaciones automáticas a `1.5.x` o `1.x`, que podrían introducir cambios de comportamiento sin que un humano lo revise.

**Mitigación actual en la app:** ninguna directa. Si la librería cambia, la app web vería los efectos sólo después de que el firmware se recompile y se cargue al sensor — un evento manual del tutor.

**Propuesta de fix firmware:** pinear a versión exacta:

```ini
lib_deps = miguelbalboa/MFRC522@=1.4.10
```

O al menos restringir a parche con `~1.4.10`.

---

## Resumen tabular

| #   | Hallazgo                                  | Severidad | Mitigación app           | Fix firmware sugerido                |
| --- | ----------------------------------------- | --------- | ------------------------ | ------------------------------------ |
| 1   | Banner de boot en texto plano             | Baja      | Filtro regex en parser   | Convertir a `{"event":"banner",...}` |
| 2   | `delay()` bloqueantes                     | Media     | N/A (sin comandos)       | Migrar a `millis()` no bloqueante   |
| 3   | Protocolo unidireccional                  | Baja      | N/A (no requerido hoy)   | Añadir `Serial.read()` + ACK         |
| 4   | Latencia `card_removed` ~1s               | Baja      | No depende de este event | Umbral basado en `millis()`         |
| 5   | `cards_detected` por iteración            | Baja      | Métricas propias backend | Set de UIDs únicos                   |
| 6   | Sin validación CRC en fallback            | Media     | Regex hex en cliente     | Verificar BCC tras lectura cruda     |
| 7   | Caret en pin de versión MFRC522           | Baja      | N/A                      | Pin exacto `=1.4.10`                 |

---

## Notas finales para la discusión con el tutor

- Estos puntos NO bloquean el funcionamiento actual del sistema en producción. El plan de hardening (ADR-062 + ADR-063) deja la app web preparada para operar con el firmware tal cual está hoy.
- El punto de mayor potencial de mejora cualitativa es **el #3 (protocolo bidireccional)**, porque desbloquearía features futuras como ajuste dinámico de ganancia de antena, modos de bajo consumo o calibración remota.
- El punto de mayor riesgo de bug visible es el **#6 (sin CRC en fallback)**, ya mitigado defensivamente desde el frontend pero que en el firmware sería un cambio de ~5 líneas.
- Si en el futuro se valida la migración del firmware, sería deseable mantener compatibilidad total del protocolo serial (eventos JSON) para no romper la app web actual.
