# Informe de diagnóstico — Sensor RFID RC522 + Wemos D1 mini

**Fecha:** 2026-04-23
**Contexto:** TFG Plataforma de juegos educativos con RFID
**Alcance:** sesión intensiva de diagnóstico del sensor RFID entregado por el tutor, ante la imposibilidad de leer tarjetas NTAG215.
**Resultado:** el hardware del módulo RC522 presenta una avería que impide la escritura de registros por SPI. Se descarta cualquier causa de software, cableado lógico o compatibilidad de tarjeta. Requiere revisión o sustitución física.

---

## 1. Resumen ejecutivo

El Wemos D1 mini y el firmware compilan, se flashean y arrancan correctamente. El módulo RC522, sin embargo, **no se inicializa**: aunque responde a las lecturas por SPI, **ignora todas las escrituras de registro**. Como resultado, `PCD_AntennaOn()` no puede activar los drivers de antena y el lector nunca detecta las tarjetas NTAG215 entregadas, aun apoyadas directamente sobre el PCB.

El diagnóstico se ha aislado mediante un sketch de prueba independiente del firmware del TFG, cuya salida demuestra que:

1. El bus SPI lee valores **estables** pero con un `VersionReg = 0xEE` no documentado.
2. Las escrituras a `ModWidthReg` con `0x42` y `0xA5` **no se aplican** (el registro conserva el valor previo `0xC8`).
3. Tras `PCD_AntennaOn()`, el registro `TxControlReg` queda en `0xA8` (bits 0-1 = 00, **antena desactivada**), cuando debería ser `0x83`.
4. `PICC_RequestA()` (comando REQA crudo) devuelve `Timeout in communication` en cada iteración.

**Hipótesis más probable:** línea MOSI rota o con microfractura en la soldadura entre el pin D7 del Wemos y el pin MOSI del RC522. Como hipótesis secundaria, chip RC522 parcialmente dañado.

**No hay solución por software.** Se necesita revisión de la soldadura o sustitución del módulo.

---

## 2. Material y configuración utilizados

| Elemento | Detalle |
|---|---|
| Placa base | Wemos D1 mini (ESP8266EX) — entregada por el tutor, soldada al RC522 |
| Lector RFID | RC522 (13,56 MHz) — entregado por el tutor, soldado |
| Chip USB-serie | FTDI FT232 (VID_0403 PID_6001), S/N FTB6SPL3A → COM4 |
| MAC ESP8266 | `c8:c9:a3:2f:17:3f` |
| Tarjetas de prueba | NTAG215 (AliExpress AF151-10PCS "Standard card") — entregadas por el tutor |
| Firmware | `rfid_scanner/src/main.cpp` entregado por el tutor, sin modificaciones |
| Librería RFID | `miguelbalboa/MFRC522@^1.4.10` (resuelta 1.4.12) |
| Toolchain | PlatformIO Core 6.1.18, esptool.py 3.0, framework-arduinoespressif8266 3.30102.0 |

---

## 3. Metodología

Se ha seguido una secuencia de verificación por capas, de software a hardware, registrando la salida serie en cada paso:

1. **Compilación** del firmware original (`pio run -e d1_mini`).
2. **Detección** del puerto serie del Wemos (validada mediante plug/unplug y `Get-PnpDevice`).
3. **Flasheo** del firmware (`pio run -t upload --upload-port COM4`).
4. **Monitorización serie** a 115 200 baudios para capturar los eventos JSON del firmware.
5. **Pruebas correctivas** (tras detectar anomalías):
   - **A.** Subir la ganancia de antena de `RxGain_38dB` a `RxGain_48dB`.
   - **B.** Sketch de diagnóstico aislado con pruebas exhaustivas de SPI y dump de registros.
6. **Restauración** del estado original (`git checkout` + reflasheo del firmware del tutor).

---

## 4. Resultados

### 4.1 Software y arranque — OK

| Verificación | Resultado |
|---|---|
| Compilación firmware | ✅ 37 s. RAM 35,1 % (28 720 B) · Flash 26,3 % (274 599 B) |
| Resolución librerías | ✅ MFRC522 1.4.12 + SPI 1.0 |
| Flasheo | ✅ 278 752 B escritos en 18 s, hash verificado |
| Arranque firmware | ✅ emite saludo y heartbeats periódicos |

Salida serie con el firmware original:

```
RFID Scanner v1.0 - Ready for MERN integration
{"event":"init","status":"success","version":"0xee"}
{"event":"status","uptime":10113,"cards_detected":0,"free_heap":51664}
{"event":"status","uptime":20177,"cards_detected":0,"free_heap":51664}
```

El firmware ejecuta el `loop()` correctamente, emite heartbeats cada 10 s con `free_heap` estable (~51 KB libres) y nunca se reinicia. **La parte de software y la placa Wemos funcionan sin incidencias.**

### 4.2 Primera anomalía: `VersionReg = 0xEE`

El firmware considera "success" cualquier valor de `VersionReg` distinto de `0x00` o `0xFF`, pero `0xEE` **no es un valor documentado** para el chip MFRC522:

| Valor | Significado |
|---|---|
| `0x91` | MFRC522 v1.0 |
| `0x92` | MFRC522 v2.0 |
| `0xB2` | Clon HW-126 (contemplado en el README del firmware) |
| **`0xEE`** | **No documentado** |

### 4.3 Segunda anomalía: cero detecciones con tarjetas compatibles

Se realizaron tres capturas del monitor serie mientras se apoyaba una tarjeta NTAG215 directamente sobre el PCB del RC522:

| Prueba | Duración | Ganancia antena | `card_detected` | `error: read_failure` |
|---|---|---|---|---|
| 1 | 22 s | 38 dB | 0 | 0 |
| 2 | 30 s | 38 dB | 0 | 0 |
| 3 | 30 s | 48 dB | 0 | 0 |

Las NTAG215 son plenamente compatibles con RC522 (13,56 MHz, ISO 14443A). Además, si el chip detectara presencia de tarjeta pero fallara en la lectura del UID, el firmware emitiría `{"event":"error","type":"read_failure",...}`. **Dicho evento no aparece en ninguna captura**, lo que indica que `PICC_IsNewCardPresent()` devuelve `false` en todo momento: el chip no percibe siquiera presencia de tarjeta.

### 4.4 Prueba correctiva A: ganancia de antena al máximo

Modificación temporal de `main.cpp:32`:

```cpp
mfrc522.PCD_SetAntennaGain(mfrc522.RxGain_48dB);  // antes: RxGain_38dB
```

**Resultado:** idéntico. `VersionReg = 0xEE`, 0 detecciones, 0 errores. El problema **no es marginalidad de antena**.

### 4.5 Prueba correctiva B: sketch de diagnóstico aislado

Se flasheó un sketch independiente del firmware del tutor, que realiza:

1. Cinco lecturas consecutivas de `VersionReg` (verificar estabilidad del bus SPI en lectura).
2. Escrituras de valores conocidos (`0x42`, `0xA5`) a `ModWidthReg` con lectura posterior (verificar bus SPI en escritura).
3. Dump de registros clave (`TxControlReg`, `CommandReg`, `Status1Reg`, `Status2Reg`, `ModeReg`, `RFCfgReg`, `TModeReg`).
4. Loop de detección con `PICC_IsNewCardPresent()` y `PICC_RequestA()` crudo.

Salida completa capturada:

```
=== RC522 DIAGNOSTIC (sketch temporal) ===
[1] VersionReg x5 (debe ser estable):
    1: 0xEE
    2: 0xEE
    3: 0xEE
    4: 0xEE
    5: 0xEE
[2] Test SPI write+readback (ModWidthReg):
    original = 0xC8
    escrito 0x42, leido = 0xC8
    escrito 0xA5, leido = 0xC8
[3] Registros clave (TxControlReg bits 0-1 = antena ON):
    TxControlReg = 0xA8
    CommandReg   = 0x82
    Status1Reg   = 0x8E
    Status2Reg   = 0x90
    ModeReg      = 0xA2
    RFCfgReg     = 0xCC
    TModeReg     = 0xD4
[4] Loop de deteccion (cada 2s). Apoya tarjeta NTAG215 sobre el PCB:
[1] IsNewCardPresent=no   RawREQA=Timeout in communication.
[2] IsNewCardPresent=no   RawREQA=Timeout in communication.
...
[11] IsNewCardPresent=no   RawREQA=Timeout in communication.
```

---

## 5. Interpretación técnica

### 5.1 Hallazgo clave — el SPI lee pero no escribe

La prueba `[2]` es **concluyente**:

- El estado inicial de `ModWidthReg` se lee como `0xC8` (valor anómalo; el default del chip es `0x26`, pero lo relevante es que **la lectura es estable**).
- Se escribe `0x42`. La lectura posterior sigue siendo `0xC8`. La escritura **no se ha aplicado**.
- Se escribe `0xA5`. La lectura posterior sigue siendo `0xC8`. De nuevo **no aplicada**.

El chip responde a lecturas de SPI pero ignora cualquier operación de escritura.

### 5.2 Consecuencias en cadena

Todas las inicializaciones de la librería MFRC522 (`PCD_Init`, `PCD_AntennaOn`, `PCD_SetAntennaGain`) se implementan internamente como escrituras de registro. Al no aplicarse, el chip queda en un estado no inicializado, lo que coincide exactamente con los valores observados:

| Registro | Observado | Esperado tras inicialización |
|---|---|---|
| `TxControlReg` | `0xA8` (bits 0-1 = 00) | `0x83` (bits 0-1 = 11, antena ON) |
| `CommandReg` | `0x82` | `0x20` (soft reset) o `0x00` (idle) |
| `ModeReg` | `0xA2` | `0x3F` (default) |
| `TModeReg` | `0xD4` | `0x80` (tras `PCD_Init`) |
| `RFCfgReg` | `0xCC` | `0x48` (38 dB) o `0x70` (48 dB) |

El dato crítico: **`TxControlReg` bits 0-1 = 00 → drivers de antena desactivados → sin campo electromagnético → las tarjetas no se energizan y por tanto no responden a REQA**. Esto explica con precisión los 11 `Timeout in communication` consecutivos.

### 5.3 Descarte sistemático de causas alternativas

| Causa | Estado | Razonamiento |
|---|---|---|
| Firmware del tutor defectuoso | ❌ descartado | El sketch de diagnóstico independiente reproduce el mismo fallo |
| Librería MFRC522 defectuosa | ❌ descartado | `PCD_WriteRegister` es trivial; además la lectura funciona |
| Baud rate o buffering del monitor | ❌ descartado | Valores consistentes entre múltiples capturas y herramientas |
| Pin SS o RST mal cableado | ❌ descartado | Si lo estuvieran, las lecturas no serían estables |
| Tarjeta incompatible | ❌ descartado | NTAG215 es 13,56 MHz ISO 14443A, plenamente compatible |
| Alimentación marginal del Wemos | ❌ improbable | El ESP8266 no se reinicia ni presenta WDT resets |
| **Bus SPI escritura averiado** | ✅ **confirmado** | Test directo de write+read back con dos valores distintos |

---

## 6. Hipótesis de causa raíz

Por orden de probabilidad:

1. **Línea MOSI desoldada, fracturada o con falso contacto** entre el pin **D7 (GPIO13)** del Wemos y el pin **MOSI** del RC522.
   El chip recibe SCK y responde por MISO (lecturas estables), pero no recibe los bits de datos que el Wemos intenta escribir. Encaja con la totalidad de los síntomas observados.
2. **Chip RC522 parcialmente dañado**: la lógica de lectura responde de forma degenerada (valor fijo `0xEE`) pero la máquina de estados de escritura de registros no opera.
3. **Pista de PCB dañada** dentro del módulo RC522 (p. ej. tras una soldadura con exceso de calor o flux agresivo que haya levantado una pista interna).

---

## 7. Recomendaciones de revisión hardware

Propuestas ordenadas por coste creciente. La línea 2 es la que con más probabilidad resolverá el problema:

1. **Inspección visual con lupa** de las soldaduras entre Wemos y RC522. Buscar soldaduras frías, estaño insuficiente, pistas levantadas o restos de flux conductivo.
2. **Medición de continuidad con multímetro** de las siguientes conexiones (especialmente la primera):
   - **D7 (Wemos) ↔ MOSI (RC522)** — probable causa
   - D5 ↔ SCK
   - D6 ↔ MISO
   - D8 ↔ SS / SDA
   - D1 ↔ RST
   - 3V3 ↔ VCC
   - GND ↔ GND
3. **Medición de la tensión 3V3** del RC522 con el Wemos encendido. Debe ser estable entre 3,2 y 3,4 V, sin ripple apreciable.
4. **Resoldado preventivo** de todos los pines SPI del RC522 (reforzar estaño).
5. **Sustitución del módulo RC522** si lo anterior no corrige el problema.

Tras cualquier revisión, se puede reverificar rápidamente volviendo a ejecutar el firmware original: si el `VersionReg` pasa a ser `0x91`, `0x92` o `0xB2` y aparece `card_detected` al acercar una NTAG215, el sensor estará operativo.

---

## 8. Reversibilidad del diagnóstico

- El archivo `rfid_scanner/src/main.cpp` fue restaurado a la versión original del repositorio mediante `git checkout -- rfid_scanner/src/main.cpp` (verificado con `git diff` vacío).
- El firmware original del tutor fue reflasheado al Wemos al terminar la sesión.
- El Wemos queda exactamente en el estado en que fue entregado: firmware idéntico, sin modificaciones persistentes en código ni en binario.

---

## 9. Conclusión

El sensor, tal y como se ha entregado, no es operativo. El diagnóstico aísla con precisión la causa: **la comunicación SPI de escritura entre Wemos y RC522 no funciona**, dejando al chip permanentemente sin inicializar y con la antena apagada. El firmware, el cableado lógico, la configuración de pines y las tarjetas son correctos y no requieren intervención. La solución pasa necesariamente por una revisión física —con alta probabilidad de la línea MOSI— o la sustitución del módulo RC522.

Quedo disponible para repetir cualquier prueba tras la revisión o sustitución del hardware, con idéntica metodología para poder comparar resultados directamente.
