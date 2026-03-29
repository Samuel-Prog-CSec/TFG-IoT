# Web Serial - Arquitectura RFID

## Resumen Ejecutivo

La lectura RFID se mueve del backend al navegador del profesor usando Web Serial API. El backend deja de depender de puertos USB y se convierte en un procesador de eventos en tiempo real. Esta decision elimina la limitacion critica que impedia el despliegue cloud.

## Problema Identificado

La arquitectura original dependia de `SerialPort` en el servidor. En entornos cloud no existe acceso a USB, lo que bloquea el despliegue en plataformas como Railway o Heroku. Ademas, un unico servidor fisico limitaba el escalado por aula.

## Solucion Propuesta

- El sensor se conecta por USB al PC del profesor.
- El navegador lee el puerto con Web Serial API.
- El frontend normaliza los eventos al contrato estable y los envia al backend por Socket.IO.
- El backend valida y procesa los eventos con autoridad server-side.

## Arquitectura

```
[Sensor RFID] --USB--> [PC Profesor] --Web Serial--> [Frontend]
                                             |
                                        Socket.IO
                                             |
                                      [Backend Cloud]
```

## Contrato de Evento RFID (Cliente)

```json
{
  "uid": "32B8FA05",
  "type": "MIFARE_1KB",
  "sensorId": "sensor-0f5e1b9c",
  "timestamp": 1736467200000,
  "source": "web_serial"
}
```

Reglas:
- `uid`: hexadecimal mayusculas, 8 o 14 caracteres.
- `type`: `MIFARE_1KB` | `MIFARE_4KB` | `NTAG` | `UNKNOWN`.
- `sensorId`: identificador persistente del navegador.
- `timestamp`: epoch en milisegundos generado por el cliente.
- `source`: siempre `web_serial`.

## Validacion y Seguridad

- El backend valida el payload con Zod y rechaza eventos malformados.
- **Validacion Estricta de SensorId (T-009):** En el modo `gameplay`, el backend verifica que el `sensorId` del evento coincida con el vinculado a la `GameSession` activa. Si hay discrepancia, el evento se rechaza por seguridad.
- Se aplica rate limiting y dedupe por `sensorId` para evitar spam.
- En gameplay, el backend no expone el UID al cliente.

## Gestion de Modos y Control de Flujo (T-010)

El sistema conmuta automaticamente el modo del lector RFID para optimizar el consumo y evitar lecturas accidentales:
- **Auto-Gameplay:** Al entrar en una partida (`join_play`), el sensor se activa en modo `gameplay`.
- **Pausa Inteligente:** Si la partida se pausa (`pause_play`), el sensor pasa a modo `idle`. Se reactiva al reanudar (`resume_play`).
- **Cleanup:** Al salir de la partida o desconectarse, se limpia el estado del modo para ese usuario.

## Robustez y Experiencia de Usuario

- **Reconexion Automatica (Frontend):** Si se detecta una desconexion del puerto serie, el `WebSerialService` inicia una secuencia de reintentos con backoff exponencial (1s, 2s, 4s).
- **Indicador Visual:** Un componente flotante en el frontend (`RFIDModeHandler`) muestra el estado del sensor y el modo activo en todo momento.

## Operacion

- `RFID_SOURCE=client` habilita el modo Web Serial.
- `RFID_SOURCE=disabled` desactiva el procesamiento RFID.

## Diagramas

- [rfid_architecture.puml](diagrams/rfid_architecture.puml)
- [rfid_data_flow.puml](diagrams/rfid_data_flow.puml)
- [rfid_gameplay_sequence.puml](diagrams/rfid_gameplay_sequence.puml)

## Cola de Scans Pendientes (Offline Queue)

Cuando el socket está desconectado, el `webSerialService` encola los escaneos en una cola interna con las siguientes características:

| Parámetro | Valor | Configurable |
| --- | --- | --- |
| Capacidad máxima | 200 scans | `MAX_PENDING_SCANS` |
| TTL por scan | 30 segundos | `PENDING_SCAN_TTL` |
| Poda automática | Al añadir, se eliminan scans expirados | Automático |

**Flujo**:
1. Si el socket está conectado: el scan se envía directamente via `rfid_scan_from_client` (fire-and-forget).
2. Si el socket está desconectado: el scan se encola con timestamp.
3. Al reconectar, `flushPendingScans()` envía todos los scans encolados no expirados al servidor.
4. El evento `queue_status` se emite localmente al añadir/eliminar de la cola.
5. El evento `queue_flush` se emite al vaciar la cola tras reconexión.

**Decisión de diseño**: Se usa fire-and-forget (sin ACK) para los scans RFID. El rate limiter del backend elimina el callback ACK de todos modos, y el patrón de cola del frontend maneja la pérdida de conexión. Añadir ACK incrementaría la latencia en un path de alta frecuencia sin beneficio real.

## Deduplicación de UID

El servicio aplica deduplicación client-side antes de enviar al servidor:

| Parámetro | Valor |
| --- | --- |
| Cooldown entre mismos UIDs | 1200ms (`DEDUPE_COOLDOWN_MS`) |
| Tamaño máximo de cache | 500 UIDs (`MAX_UID_CACHE_SIZE`) |
| TTL de cache | 5 minutos (`UID_CACHE_TTL`) |

Cuando un UID duplicado se detecta dentro del cooldown, se emite un evento local `dedupe` en lugar de enviar al servidor. La cache se limpia oportunistamente al procesar nuevos scans (no hay timer periódico).

Esta deduplicación es complementaria al `DUPLICATE_RFID_EVENT` del backend (ver [WebSockets-ExtendedUsage.md §10.4](WebSockets-ExtendedUsage.md#104-deduplicación-rfid)): el cliente filtra duplicados inmediatos, el servidor filtra los que pasan el filtro del cliente.

## Heartbeat Watchdog

El servicio monitorea la salud del dispositivo RFID mediante un watchdog de heartbeat:

| Parámetro | Valor |
| --- | --- |
| Timeout de heartbeat | 20 segundos (`HEARTBEAT_TIMEOUT`) |
| Mensaje esperado | Evento `status` del firmware |

Si el dispositivo no envía un evento `status` dentro del timeout, el estado del dispositivo pasa a `stale`. Cada evento `status` recibido resetea el timer del watchdog.

## Máquina de Estados del Dispositivo

```text
                  ┌─────────────┐
                  │   unknown   │ ◄── Estado inicial (sin conexión)
                  └──────┬──────┘
                         │ connectToPort()
                         ▼
                  ┌──────────────┐
                  │ initializing │ ◄── Esperando respuesta init del firmware
                  └──────┬───┬──┘
                         │   │
              init OK    │   │  init timeout / error
                         ▼   ▼
                  ┌───────┐  ┌───────┐
                  │ ready │  │ error │
                  └───┬───┘  └───────┘
                      │
         sin heartbeat│
          (20s)       │
                      ▼
                  ┌───────┐
                  │ stale │ ◄── Sin señal del sensor
                  └───┬───┘
                      │ heartbeat recibido
                      ▼
                  ┌───────┐
                  │ ready │
                  └───────┘
```

**Estados**:
- `unknown`: Sin puerto serial abierto. Estado por defecto.
- `initializing`: Puerto abierto, esperando que el firmware envíe el evento `init` (timeout: 8s).
- `ready`: Firmware respondió con `init` exitoso. Sensor operativo.
- `error`: Firmware reportó error o no respondió al init.
- `stale`: Sin heartbeat durante 20s. El sensor puede haberse desconectado físicamente.

El estado se comunica al frontend via el evento local `device_state_change`, que incluye el estado y la versión del firmware (si disponible).

## Reconexión Automática del Puerto Serial

| Parámetro | Valor |
| --- | --- |
| Intentos máximos | 3 (`MAX_RECONNECT_ATTEMPTS`) |
| Backoff | Exponencial: `delay * 2^(intento-1)` |
| Deshabilitación | `autoReconnectEnabled = false` |

La reconexión automática se activa cuando el puerto se cierra inesperadamente (no por acción del usuario). Las desconexiones físicas (USB) requieren intervención manual del usuario debido a restricciones de seguridad del navegador (Web Serial API no permite re-abrir puertos sin gesto del usuario).
