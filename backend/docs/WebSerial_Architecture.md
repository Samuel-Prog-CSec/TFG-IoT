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
- Se aplica rate limiting y dedupe por `sensorId` para evitar spam.
- En gameplay, el backend no expone el UID al cliente.

## Limitaciones

- Web Serial requiere HTTPS en produccion (localhost exento).
- Solo Chrome/Edge soportan Web Serial.
- El usuario debe otorgar permisos explicitos al puerto.

## Operacion

- `RFID_SOURCE=client` habilita el modo Web Serial.
- `RFID_SOURCE=disabled` desactiva el procesamiento RFID.

## Diagramas

- [rfid_architecture.puml](diagrams/rfid_architecture.puml)
- [rfid_data_flow.puml](diagrams/rfid_data_flow.puml)
- [rfid_gameplay_sequence.puml](diagrams/rfid_gameplay_sequence.puml)
