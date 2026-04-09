# Protocolo de Notificacion de Brechas de Seguridad

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)
**Autor:** Samuel Blanchart Perez
**Fecha:** 08-04-2026
**Clasificacion:** Documento interno — Seguridad y Proteccion de Datos
**Normativa:** Art. 33-34 RGPD, Art. 73.a LOPDGDD

---

## 1. Objetivo

Establecer un procedimiento claro y documentado para la deteccion, evaluacion, notificacion y gestion de brechas de seguridad que afecten a datos personales tratados por la plataforma Eduplay, con especial atencion a los datos de menores de edad.

---

## 2. Definiciones

**Brecha de seguridad de datos personales (Art. 4.12 RGPD):** Toda violacion de la seguridad que ocasione la destruccion, perdida o alteracion accidental o ilicita de datos personales transmitidos, conservados o tratados de otra forma, o la comunicacion o acceso no autorizados a dichos datos.

**Tipos de brecha:**

| Tipo | Descripcion | Ejemplo en Eduplay |
|---|---|---|
| **Confidencialidad** | Acceso no autorizado a datos | Robo de token JWT con acceso a datos de alumnos |
| **Integridad** | Alteracion no autorizada | Manipulacion de scores o metricas de estudiantes |
| **Disponibilidad** | Destruccion o perdida de datos | Borrado accidental de documentos de GamePlay |

---

## 3. Procedimiento de respuesta (timeline 72 horas)

### Hora 0: Deteccion

La brecha puede detectarse a traves de:

- **Sentry:** Errores inusuales o patrones anomalos (umbrales configurados en `securityLogger.js`)
- **Security logger:** Eventos `AUTH_TOKEN_THEFT_DETECTED`, `SECURITY_RATE_LIMITED` con frecuencia anomala
- **Logs de auditoria:** Patrones de acceso inusuales (`DATA_ACCESS`, `DATA_EXPORT`, `DATA_HARD_DELETE`)
- **Notificacion externa:** Comunicacion de un usuario, padre o centro educativo
- **Monitorizacion de infraestructura:** Alertas de Docker, MongoDB, Redis

### Horas 0-4: Contencion inmediata

1. **Aislar el sistema afectado:** Desconectar el servicio comprometido si es necesario
2. **Revocar credenciales comprometidas:** Ejecutar revocacion global de tokens (`AUTH_TOKENS_REVOKED_ALL`)
3. **Preservar evidencia:** No borrar logs; capturar estado del sistema
4. **Activar equipo de respuesta:** Notificar al responsable del tratamiento (tutor del TFG en contexto academico)

### Horas 4-24: Evaluacion del impacto

#### Checklist de evaluacion

- [ ] Que datos personales se han visto afectados?
- [ ] Se trata de datos de menores?
- [ ] Cuantos interesados se han visto afectados (numero aproximado)?
- [ ] Se han exfiltrado datos o solo se ha producido acceso no autorizado?
- [ ] La brecha sigue activa o ha sido contenida?
- [ ] Que medidas de seguridad estaban implementadas (cifrado, seudonimizacion)?
- [ ] Existen copias de seguridad para restaurar los datos?

#### Clasificacion de riesgo

| Factor | Bajo | Medio | Alto | Critico |
|---|---|---|---|---|
| Datos afectados | Logs tecnicos | Metricas seudonimizadas | Nombres + aulas de alumnos | Nombres + rendimiento completo |
| Menores afectados | No | No | Si (< 10) | Si (> 10) |
| Tipo de brecha | Disponibilidad temporal | Acceso a datos anonimizados | Acceso a datos seudonimizados | Acceso a datos identificativos |
| Duracion | < 1 hora | < 24 horas | > 24 horas | Indeterminada |

**Regla general para Eduplay:** Si datos de menores estan involucrados, el riesgo es **al menos Alto** y la notificacion a la autoridad de control es **obligatoria**.

### Horas 24-72: Notificacion

#### 3.1 Notificacion a la autoridad de control (Art. 33 RGPD)

**Plazo:** Maximo 72 horas desde la deteccion. Si no es posible completar la evaluacion en ese plazo, se notifica con la informacion disponible y se amplia despues (Art. 33.4).

**Autoridad competente:** Agencia Espanola de Proteccion de Datos (AEPD)
**Canal de notificacion:** Sede electronica de la AEPD — formulario de notificacion de brechas

**Contenido obligatorio (Art. 33.3):**

1. Naturaleza de la violacion, incluyendo:
   - Categorias de interesados afectados (menores 4-8 anos, profesores)
   - Numero aproximado de interesados
   - Categorias de datos afectados
   - Numero aproximado de registros
2. Nombre y datos de contacto del DPO o punto de contacto
3. Consecuencias probables de la violacion
4. Medidas adoptadas o propuestas para:
   - Poner remedio a la violacion
   - Mitigar los posibles efectos negativos

#### 3.2 Notificacion a los interesados (Art. 34 RGPD)

**Cuando es obligatoria:** Cuando la violacion entrane un **alto riesgo para los derechos y libertades** de los interesados. En el caso de datos de menores, esto se presume en la mayoria de escenarios.

**Destinatarios en Eduplay:**
- **Profesores:** Notificacion directa si sus datos de cuenta se han visto comprometidos
- **Padres/tutores legales:** Notificacion cuando datos de sus hijos menores se hayan visto afectados (dado que los menores de 4-8 anos no pueden recibir la notificacion directamente)

**Contenido minimo:**
- Descripcion comprensible de la brecha (lenguaje accesible para no tecnicos)
- Datos de contacto del punto de contacto
- Consecuencias probables
- Medidas adoptadas y recomendaciones para los afectados

**Excepcion (Art. 34.3):** La notificacion no es necesaria si:
- Se han aplicado medidas de proteccion que hacen los datos ininteligibles (cifrado)
- Se han tomado medidas posteriores que eliminan el riesgo
- Supone un esfuerzo desproporcionado (en cuyo caso se usa comunicacion publica)

---

## 4. Plantilla de notificacion a la AEPD

```
NOTIFICACION DE VIOLACION DE SEGURIDAD DE DATOS PERSONALES
(Art. 33 RGPD)

Fecha de deteccion: ____________________
Fecha de notificacion: ____________________

1. RESPONSABLE DEL TRATAMIENTO
   Nombre: [Responsable del centro educativo / Universidad]
   Contacto: [Email, telefono]
   
2. DESCRIPCION DE LA VIOLACION
   Naturaleza: [Confidencialidad / Integridad / Disponibilidad]
   Descripcion: ____________________________________________
   Fecha de inicio estimada: ________________________________
   Fecha de contencion: ____________________________________

3. INTERESADOS AFECTADOS
   Categorias: [Menores de 4-8 anos (alumnos), Profesores]
   Numero aproximado: ______________________________________

4. DATOS AFECTADOS
   Categorias: [Nombres, edades, aulas, metricas de rendimiento educativo]
   Numero aproximado de registros: __________________________
   Medidas de proteccion aplicadas: [Seudonimizacion, k-anonimidad, RBAC]

5. CONSECUENCIAS PROBABLES
   ________________________________________________________

6. MEDIDAS ADOPTADAS
   Para remediar la violacion: ______________________________
   Para mitigar efectos: ____________________________________

7. INFORMACION COMPLEMENTARIA
   Se ha notificado a los interesados: [Si / No / Pendiente]
   Motivo si no se ha notificado: ___________________________
```

---

## 5. Plantilla de notificacion a padres/tutores

```
Estimados padres/tutores:

Les informamos de que hemos detectado un incidente de seguridad 
en la plataforma educativa Eduplay que podria haber afectado a 
los datos de su hijo/a.

QUE HA OCURRIDO:
[Descripcion clara y comprensible]

QUE DATOS SE HAN VISTO AFECTADOS:
[Lista de categorias: nombre, edad, aula, puntuaciones de juego]

QUE HEMOS HECHO:
[Medidas adoptadas para contener y remediar el incidente]

QUE PUEDEN HACER USTEDES:
- Si observan cualquier uso indebido de los datos de su hijo/a,
  contacten con nosotros inmediatamente
- Pueden ejercer su derecho de supresion (Art. 17 RGPD) solicitando
  al profesor la eliminacion de todos los datos de su hijo/a

CONTACTO:
[Datos del punto de contacto]

Lamentamos las molestias y reiteramos nuestro compromiso con la
proteccion de los datos de los menores.
```

---

## 6. Registro de incidentes (Art. 33.5)

Independientemente de si se notifica a la AEPD, **toda brecha debe documentarse** en un registro interno que incluya:

- Hechos relativos a la violacion
- Efectos de la violacion
- Medidas correctivas adoptadas
- Justificacion de la decision de notificar o no notificar

Este registro debe mantenerse a disposicion de la autoridad de control.

---

## 7. Medidas preventivas implementadas en Eduplay

| Medida | Referencia | Estado |
|---|---|---|
| JWT con rotacion y revocacion instantanea (Redis blacklist) | AT-04 RAT | Implementado |
| Rate limiting en HTTP y WebSocket con Redis store | ADR-016 | Implementado |
| Token theft detection con fingerprint | AT-04 RAT | Implementado |
| Deteccion de reuso de refresh tokens | AT-04 RAT | Implementado |
| Seudonimizacion de PII en logs | T-703 | Implementado |
| Filtrado de PII en Sentry (beforeSend) | T-717 / AT-06 | Implementado |
| Borrado efectivo con cascada | T-704 | Implementado |
| Politica de retencion con anonimizacion | T-704 | Implementado |
| k-anonimidad en analytics de grupos pequenos | T-714 | Implementado |
| Consentimiento parental verificable | T-702 | Implementado |
| Security logging con alertas Sentry | AT-05 RAT | Implementado |

---

## 8. Referencias

- Reglamento (UE) 2016/679 (RGPD), Art. 33 — Notificacion de una violacion de seguridad a la autoridad de control
- Reglamento (UE) 2016/679 (RGPD), Art. 34 — Comunicacion de una violacion de seguridad al interesado
- AEPD (2021). *Guia para la gestion y notificacion de brechas de seguridad.* Agencia Espanola de Proteccion de Datos
- EDPB (2023). *Guidelines 01/2021 on Examples regarding Data Breach Notification (version 2.0).* European Data Protection Board
- Ley Organica 3/2018 (LOPDGDD), Art. 73.a — Infracciones por no notificar brechas
