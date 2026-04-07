# Estrategia de Protección de Datos de Menores — Sprint 5

**Proyecto:** Plataforma de Juegos Educativos con RFID (TFG)
**Autor:** Samuel Blanchart Pérez
**Fecha:** 18-03-2026
**Versión:** 1.0
**Clasificación:** Documento interno de diseño — Protección de Datos

---

## Índice

1. [Contexto y motivación](#1-contexto-y-motivación)
2. [Marco normativo aplicable](#2-marco-normativo-aplicable)
   - 2.1 [Reglamento General de Protección de Datos (RGPD)](#21-reglamento-general-de-protección-de-datos-rgpd)
   - 2.2 [Ley Orgánica de Protección de Datos y Garantía de Derechos Digitales (LOPDGDD)](#22-ley-orgánica-de-protección-de-datos-y-garantía-de-derechos-digitales-lopdgdd)
   - 2.3 [Directrices de la AEPD para centros educativos](#23-directrices-de-la-aepd-para-centros-educativos)
   - 2.4 [Directrices del EDPB sobre seudonimización](#24-directrices-del-edpb-sobre-seudonimización)
   - 2.5 [ISO/IEC 27701 como marco de referencia](#25-isoiec-27701-como-marco-de-referencia)
3. [Análisis del estado actual de la plataforma](#3-análisis-del-estado-actual-de-la-plataforma)
   - 3.1 [Inventario de datos personales recopilados](#31-inventario-de-datos-personales-recopilados)
   - 3.2 [Flujos de datos identificados](#32-flujos-de-datos-identificados)
   - 3.3 [Medidas de seguridad ya implementadas](#33-medidas-de-seguridad-ya-implementadas)
   - 3.4 [Carencias detectadas](#34-carencias-detectadas)
4. [Estrategia de protección propuesta](#4-estrategia-de-protección-propuesta)
   - 4.1 [Principios rectores](#41-principios-rectores)
   - 4.2 [Medidas técnicas](#42-medidas-técnicas)
   - 4.3 [Medidas organizativas y documentales](#43-medidas-organizativas-y-documentales)
5. [Justificación técnica de las decisiones](#5-justificación-técnica-de-las-decisiones)
   - 5.1 [Seudonimización vs. anonimización](#51-seudonimización-vs-anonimización)
   - 5.2 [Borrado efectivo vs. soft delete](#52-borrado-efectivo-vs-soft-delete)
   - 5.3 [Retención temporal con anonimización diferida](#53-retención-temporal-con-anonimización-diferida)
   - 5.4 [Separación de datos identificativos y analíticos](#54-separación-de-datos-identificativos-y-analíticos)
6. [Ventajas y beneficios de la implementación](#6-ventajas-y-beneficios-de-la-implementación)
7. [Planificación de la implementación](#7-planificación-de-la-implementación)
8. [Referencias bibliográficas](#8-referencias-bibliográficas)

---

## 1. Contexto y motivación

La plataforma **Eduplay** es un sistema educativo interactivo que permite a profesores de educación infantil crear y supervisar sesiones de juego con tarjetas RFID físicas para alumnos de entre **4 y 8 años**. Este rango de edad sitúa a los usuarios finales del sistema (los estudiantes) dentro de un colectivo que la legislación europea y española reconoce como **especialmente vulnerable** en materia de protección de datos personales.

### Por qué es necesario abordar la protección de datos

El Considerando 38 del Reglamento General de Protección de Datos (RGPD) establece explícitamente que:

> *«Los niños merecen una protección específica de sus datos personales, ya que pueden ser menos conscientes de los riesgos, consecuencias, garantías y derechos concernientes al tratamiento de datos personales.»*

Esta plataforma recoge datos de rendimiento educativo, tiempos de respuesta, patrones de acierto/error y metadatos de interacción de menores. Aunque estos datos no incluyen categorías especiales del Artículo 9 del RGPD (datos de salud, biométricos, etc.), sí constituyen **datos personales de menores** que, combinados, pueden revelar información sensible sobre las capacidades cognitivas, ritmos de aprendizaje y comportamiento de cada niño.

### Motivación académica

En el contexto de un Trabajo de Fin de Grado en Ingeniería Informática, dedicar un eje del sprint a la protección de datos no es un mero formalismo: demuestra la madurez del proyecto al integrar consideraciones de **gobernanza de datos** y cumplimiento normativo como un requisito no funcional de primera clase. Este enfoque refleja la realidad de la ingeniería de software moderna, donde el diseño de sistemas que tratan datos personales — especialmente de colectivos vulnerables — exige un tratamiento riguroso desde la fase de diseño (*privacy by design*) hasta la operación del sistema.

### Objetivo de este documento

Este documento tiene un triple propósito:

1. **Fundamentar legalmente** las medidas de protección que se implementarán, identificando los artículos y normativas aplicables.
2. **Analizar el estado actual** de la plataforma en materia de tratamiento de datos personales de menores.
3. **Definir una estrategia de implementación** concreta, justificando cada decisión técnica y explicando por qué se adopta un enfoque frente a alternativas.

---

## 2. Marco normativo aplicable

El tratamiento de datos personales de menores en una plataforma educativa desarrollada y operada en España está sujeto a un marco normativo multinivel que comprende regulación europea, legislación orgánica española y directrices interpretativas de las autoridades de control.

### 2.1 Reglamento General de Protección de Datos (RGPD)

El **Reglamento (UE) 2016/679** (RGPD), de aplicación directa en todos los Estados miembros, es la norma de referencia. Los artículos con incidencia directa en esta plataforma son:

#### Artículo 5 — Principios relativos al tratamiento

Define los principios que todo tratamiento de datos debe cumplir. Los tres más relevantes para esta plataforma son:

- **Minimización de datos** (Art. 5.1.c): Los datos deben ser *«adecuados, pertinentes y limitados a lo necesario en relación con los fines para los que son tratados»*. Esto exige una revisión de cada campo de datos recopilado y la eliminación de aquellos que no sean estrictamente necesarios para la funcionalidad educativa.
- **Limitación del plazo de conservación** (Art. 5.1.e): Los datos deben conservarse *«durante no más tiempo del necesario para los fines del tratamiento»*. Exige definir políticas de retención con plazos concretos.
- **Responsabilidad proactiva** (Art. 5.2): El responsable del tratamiento debe poder **demostrar** el cumplimiento de los principios anteriores. No basta con cumplir: hay que documentar cómo se cumple.

#### Artículo 8 — Consentimiento del menor

Establece que cuando el tratamiento se basa en el consentimiento y se ofrece un servicio de la sociedad de la información directamente a un menor, el tratamiento solo es lícito si el menor tiene al menos la edad que establezca el Estado miembro (entre 13 y 16 años). Para menores por debajo de esa edad, **el consentimiento debe ser otorgado o autorizado por el titular de la patria potestad o tutela**.

#### Artículo 17 — Derecho de supresión

El interesado tiene derecho a obtener la supresión de sus datos personales. El apartado 17.1.f establece una causa específica cuando *«los datos personales se han recogido en relación con la oferta de servicios de la sociedad de la información»* a un menor. El Considerando 65 refuerza que este derecho es *«pertinente en particular cuando el interesado dio su consentimiento siendo niño y no era plenamente consciente de los riesgos que implicaba el tratamiento»*.

#### Artículo 20 — Derecho a la portabilidad

El interesado tiene derecho a recibir los datos personales que haya proporcionado al responsable del tratamiento en un **formato estructurado, de uso común y lectura mecánica**, y a transmitirlos a otro responsable. Esto aplica cuando el tratamiento se efectúa por medios automatizados (como es el caso de esta plataforma).

#### Artículo 25 — Protección de datos desde el diseño y por defecto

Obliga al responsable a aplicar medidas técnicas y organizativas apropiadas — como la **seudonimización** — diseñadas para aplicar de forma efectiva los principios de protección de datos e integrar las garantías necesarias en el tratamiento. Las Directrices 4/2019 del EDPB detallan que este artículo es *«particularmente importante»* cuando los interesados son menores.

#### Artículo 30 — Registro de las actividades de tratamiento

Todo responsable debe llevar un registro de las actividades de tratamiento efectuadas bajo su responsabilidad, que incluya: fines del tratamiento, categorías de interesados y datos personales, destinatarios, plazos de supresión, y descripción de las medidas de seguridad.

#### Artículo 35 — Evaluación de Impacto en Protección de Datos (EIPD)

Cuando un tipo de tratamiento *«entrañe un alto riesgo para los derechos y libertades de las personas físicas»*, el responsable debe realizar una Evaluación de Impacto. La AEPD incluye expresamente el tratamiento de **datos de menores de 14 años** entre los criterios que obligan a realizar una EIPD.

### 2.2 Ley Orgánica de Protección de Datos y Garantía de Derechos Digitales (LOPDGDD)

La **Ley Orgánica 3/2018, de 5 de diciembre** (LOPDGDD) complementa y desarrolla el RGPD en el ordenamiento jurídico español:

#### Artículo 7 — Consentimiento de los menores de edad

España fija en **14 años** la edad mínima para que un menor pueda prestar consentimiento por sí mismo para el tratamiento de sus datos personales (ejerciendo la opción que el Art. 8 RGPD otorga a los Estados miembros de rebajar el umbral de 16 años, sin bajar de 13). Para los alumnos de 4-8 años de esta plataforma, el consentimiento **siempre** debe proceder del titular de la patria potestad o tutela.

> **Nota sobre legislación en tramitación:** El Proyecto de Ley Orgánica para la Protección de las Personas Menores de Edad en los Entornos Digitales (aprobado por el Consejo de Ministros en marzo de 2025, en tramitación parlamentaria) contempla elevar esta edad a 16 años. Aunque no está vigente a fecha de este documento, refuerza la tendencia legislativa hacia una mayor protección.

#### Artículo 83 — Derecho a la educación digital

Establece que el sistema educativo debe garantizar *«la plena inserción del alumnado en la sociedad digital y el aprendizaje de un consumo responsable y uso crítico y seguro de los medios digitales»*, incluyendo expresamente el respeto a la **intimidad personal y familiar** y la **protección de datos personales**.

#### Artículo 92 — Protección de datos de los menores en Internet

Los centros educativos y cualquier persona que desarrolle actividades con menores deben garantizar la **protección del interés superior del menor** y sus derechos fundamentales, especialmente el derecho a la protección de datos personales.

### 2.3 Directrices de la AEPD para centros educativos

La **Agencia Española de Protección de Datos** (AEPD), como autoridad de control en España, ha publicado documentación específica que orienta el tratamiento de datos en entornos educativos:

- **Guía para Centros Educativos** (AEPD, 2018, actualizada): Responde a más de 80 preguntas frecuentes de la comunidad educativa sobre protección de datos.
- **Criterios de tratamiento de datos personales en centros educativos** (AEPD, infografía): Establece que la función educativa y orientadora del centro (Art. 6.1.e RGPD — misión en interés público) puede legitimar el tratamiento sin necesidad de consentimiento para actividades propias de la función docente.
- **Guía básica de anonimización** (AEPD, 2019): Describe técnicas de anonimización y advierte que *«la anonimización absoluta no existe»*: el riesgo de reidentificación depende del contexto y debe evaluarse continuamente.
- **Listas de tipos de tratamientos que requieren EIPD** (AEPD, 2019): Incluye expresamente tratamientos de datos de **menores de 14 años** como uno de los criterios que obligan a su realización.

#### Base legal en el ámbito educativo

Un aspecto relevante para esta plataforma es la distinción de la base legal aplicable:

- Para actividades **propias de la función docente** (evaluación, seguimiento pedagógico), la base legal puede ser el **interés público** (Art. 6.1.e RGPD), amparado por la Ley Orgánica de Educación.
- Para actividades **ajenas al currículo** o que utilicen plataformas externas no esenciales, se requiere **consentimiento expreso** de los tutores.

En el caso de Eduplay, al ser una plataforma externa (no forma parte del sistema de gestión académica del centro), el consentimiento parental es la base legal más segura para su uso.

### 2.4 Directrices del EDPB sobre seudonimización

El **European Data Protection Board** (EDPB) adoptó en enero de 2025 las **Directrices 01/2025 sobre Seudonimización**, que proporcionan orientación detallada sobre esta medida técnica:

- La seudonimización consiste en tratar los datos de forma que **ya no puedan atribuirse a un interesado sin utilizar información adicional**, siempre que dicha información adicional se mantenga separada y se apliquen medidas técnicas y organizativas para garantizar que no se atribuyan a una persona identificada o identificable.
- Es una medida explícitamente recomendada por el Art. 25 RGPD para cumplir con la obligación de **protección de datos desde el diseño y por defecto**.
- Técnicas válidas incluyen: tablas de correspondencia (lookup tables), cifrado con clave, tokenización y funciones hash con sal.

### 2.5 ISO/IEC 27701 como marco de referencia

La norma **ISO/IEC 27701:2019** (revisada en 2025) establece un Sistema de Gestión de Información de Privacidad (PIMS) que mapea directamente a los requisitos del RGPD. Su Anexo D contiene un mapeo específico al reglamento europeo.

Aunque la certificación no es objetivo de este TFG, ISO 27701 proporciona un **marco de referencia reconocido internacionalmente** para estructurar las medidas de privacidad de forma sistemática. Las medidas que implementaremos en este sprint están alineadas con las recomendaciones de esta norma en cuanto a: minimización de datos, control de acceso, retención definida y capacidad de respuesta a los derechos del interesado.

---

## 3. Análisis del estado actual de la plataforma

Se ha realizado una auditoría exhaustiva del código fuente para identificar todos los datos personales recopilados, los flujos de tratamiento y las medidas de protección existentes.

### 3.1 Inventario de datos personales recopilados

#### Datos del modelo `User` (estudiantes de 4-8 años)

| Campo | Tipo | Necesidad educativa | Nivel de riesgo |
|-------|------|---------------------|-----------------|
| `name` | String (nombre completo) | Alta — identificación por el profesor | Medio |
| `profile.birthdate` | Date (fecha completa) | **Baja** — solo se necesita la edad | **Alto** |
| `profile.age` | Number | Media — contextualizar rendimiento | Bajo |
| `profile.classroom` | String | Alta — organización por grupos | Bajo |
| `profile.avatar` | String (URL) | Baja — personalización visual | Bajo |
| `createdBy` | ObjectId (profesor) | Alta — relación profesor-alumno | Bajo |
| `assignedTeacher` | ObjectId | Alta — asignación de responsabilidad | Bajo |
| `studentMetrics.*` | Numbers (6 campos) | Alta — seguimiento pedagógico | Medio |
| `lastLoginAt` | Date | Baja — los alumnos no hacen login | **Bajo** |

#### Datos del modelo `GamePlay` (registros de partida)

| Campo | Tipo | Necesidad educativa | Nivel de riesgo |
|-------|------|---------------------|-----------------|
| `playerId` | ObjectId (enlace directo a estudiante) | Alta | Medio |
| `score`, `currentRound` | Numbers | Alta | Bajo |
| `metrics.*` | Numbers (6 campos agregados) | Alta | Bajo |
| `events[]` | Array (hasta 500 eventos por partida) | Media — detalle excesivo | **Alto** |
| `events[].timestamp` | Date (momento exacto) | Baja | Medio |
| `events[].timeElapsed` | Number (ms de respuesta) | Media | Medio |
| `events[].cardUid` | String (UID de tarjeta RFID) | Baja tras la partida | Bajo |
| `startedAt`, `completedAt` | Dates | Media | Bajo |

#### Datos de seguridad y logging

| Dato | Ubicación | Necesidad | Nivel de riesgo |
|------|-----------|-----------|-----------------|
| IP del profesor | Security logger | Media — auditoría de seguridad | Medio |
| User-Agent | Security logger | Baja — diagnóstico | Bajo |
| Fingerprint del dispositivo | JWT claims + Redis | Media — anti-suplantación | Medio |

### 3.2 Flujos de datos identificados

Se han identificado los siguientes flujos de tratamiento de datos de estudiantes:

```
                   ┌─────────────────────────────────┐
                   │  CREACIÓN DE ESTUDIANTE          │
                   │  Profesor → POST /api/users      │
                   │  Datos: name, birthdate, age,    │
                   │  classroom, avatar                │
                   └──────────────┬──────────────────┘
                                  │
                   ┌──────────────▼──────────────────┐
                   │  ALMACENAMIENTO                  │
                   │  MongoDB: colección Users         │
                   │  (PII + métricas en mismo doc)   │
                   └──────────────┬──────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
   ┌──────────▼─────────┐  ┌─────▼──────────┐  ┌────▼────────────┐
   │  GAMEPLAY           │  │  DASHBOARD      │  │  ANALYTICS      │
   │  GamePlay.playerId  │  │  StudentsList   │  │  Endpoints API  │
   │  → enlaza a User    │  │  → name, avatar │  │  → métricas +   │
   │  Events[], metrics  │  │  metrics, aula  │  │  identificador  │
   └─────────────────────┘  └────────────────┘  └─────────────────┘
                                  │
                   ┌──────────────▼──────────────────┐
                   │  ELIMINACIÓN (actual)            │
                   │  Soft delete: status='inactive'  │
                   │  Datos permanecen en MongoDB     │
                   │  GamePlays NO se eliminan        │
                   └─────────────────────────────────┘
```

### 3.3 Medidas de seguridad ya implementadas

La plataforma cuenta con varias medidas de seguridad relevantes que proporcionan una base sólida:

| Medida | Estado | Artículo RGPD |
|--------|--------|---------------|
| Cifrado en tránsito (HTTPS/TLS) | Implementado | Art. 32.1.a |
| Hashing de contraseñas (bcrypt) | Implementado | Art. 32.1.a |
| Control de acceso por roles (teacher, student, super_admin) | Implementado | Art. 32.1.b |
| Autenticación JWT con rotación de tokens | Implementado | Art. 32.1.b |
| Rate limiting (HTTP y WebSocket) | Implementado | Art. 32.1.b |
| Redacción automática de datos sensibles en logs (password, tokens, headers) | Implementado | Art. 25 |
| Token blacklist en Redis para revocación instantánea | Implementado | Art. 32.1.d |
| Protección CSRF (double-submit cookie) | Implementado | Art. 32.1.a |
| Helmet/CSP, CORS whitelist | Implementado | Art. 32.1.a |
| DTOs para control de exposición en respuestas API | Implementado | Art. 25 |

### 3.4 Carencias detectadas

A pesar de las medidas de seguridad existentes, la auditoría revela carencias significativas en materia de **gobernanza de datos** y **derechos del interesado**:

| Carencia | Artículo RGPD incumplido | Severidad |
|----------|--------------------------|-----------|
| No existe Registro de Actividades de Tratamiento (RAT) | Art. 30 | **Alta** |
| No existe Evaluación de Impacto (EIPD) | Art. 35 | **Alta** |
| Se almacena fecha de nacimiento completa cuando solo se necesita la edad | Art. 5.1.c (minimización) | **Alta** |
| No hay mecanismo de borrado efectivo (solo soft delete) | Art. 17 (supresión) | **Alta** |
| No hay endpoint de exportación/portabilidad de datos | Art. 20 (portabilidad) | Media |
| No hay política de retención con plazos definidos | Art. 5.1.e (limitación plazo) | Media |
| No se registra el consentimiento parental | Art. 8 + Art. 7 LOPDGDD | Media |
| Los logs de seguridad no excluyen datos identificativos de estudiantes | Art. 25 (diseño) | Media |
| PII y datos analíticos residen en el mismo documento MongoDB | Art. 25 (diseño) | Media |
| No existe información de privacidad accesible a profesores/tutores | Art. 13/14 | Baja |
| No hay audit trail de acceso a datos de estudiantes | Art. 5.2 (responsabilidad) | Baja |
| GamePlay.events[] almacena hasta 500 eventos detallados indefinidamente | Art. 5.1.c + Art. 5.1.e | Media |

---

## 4. Estrategia de protección propuesta

### 4.1 Principios rectores

La estrategia se basa en cuatro principios del RGPD adaptados al contexto educativo infantil:

#### 1. Minimización de datos (Art. 5.1.c)

> *Recoger y conservar únicamente los datos estrictamente necesarios para la función educativa.*

**Aplicación concreta:**
- Eliminar el campo `profile.birthdate` del modelo de estudiante (se conserva `profile.age`).
- Revisar y justificar formalmente cada campo del modelo `User` para estudiantes.
- Limitar los eventos detallados de GamePlay a lo pedagógicamente relevante.

#### 2. Protección desde el diseño y por defecto (Art. 25)

> *Integrar las medidas de protección en la arquitectura del sistema, no como un añadido posterior.*

**Aplicación concreta:**
- Seudonimizar identificadores de estudiantes en logs y datos analíticos.
- Separar conceptualmente datos identificativos de datos de rendimiento.
- Configurar por defecto la máxima protección (sin compartición de datos habilitada).

#### 3. Limitación del plazo de conservación (Art. 5.1.e)

> *Definir plazos de retención concretos y aplicar limpieza automática.*

**Aplicación concreta:**
- Eventos detallados de GamePlay: retención de 12 meses, después anonimización.
- Cuentas inactivas de estudiantes: retención de 24 meses, después borrado efectivo.
- Métricas agregadas (sin PII): retención indefinida (datos anonimizados no están sujetos al RGPD, según Considerando 26).

#### 4. Derechos del interesado (Arts. 15-22)

> *Proporcionar mecanismos técnicos para ejercer los derechos de acceso, supresión y portabilidad.*

**Aplicación concreta:**
- Endpoint de exportación de datos en formato JSON estructurado.
- Borrado efectivo (hard delete) con cascada a GamePlays y métricas.
- Registro de consentimiento parental vinculado a cada estudiante.

### 4.2 Medidas técnicas

Las medidas técnicas se organizan por prioridad de implementación:

#### MT-01: Minimización de datos del modelo de estudiante

**Qué:** Eliminar el campo `profile.birthdate` del modelo `User` para estudiantes, conservando únicamente `profile.age`. Añadir campo `profile.ageRange` como alternativa más protectora para analytics.

**Por qué:** La fecha de nacimiento completa es un dato con alto potencial identificativo que no aporta valor pedagógico adicional respecto a la edad simple. Un menor de 5 años nacido el 15/03/2021 es identificable en un aula de 20 alumnos; un menor de «5 años» no lo es.

**Cómo:** Migración del modelo Mongoose con script que convierte birthdates existentes a ages, seguida de eliminación del campo.

#### MT-02: Seudonimización en logs y analytics

**Qué:** Asegurar que los logs de Pino y el security logger nunca registren datos identificativos de estudiantes (nombre, classroom). Los identificadores de estudiante en logs se registrarán como hash truncado del ObjectId.

**Por qué:** Los logs operativos persisten en sistemas de monitorización que pueden tener un régimen de acceso distinto al de la base de datos. Si un log contiene `"studentName": "María García", "classroom": "1ºA"`, cualquier persona con acceso a los logs puede identificar al menor.

**Cómo:** Extender el serializer de Pino para redactar campos de estudiante. Crear utilidad `pseudonymize(id)` que genere un hash SHA-256 truncado a 8 caracteres del ObjectId.

#### MT-03: Borrado efectivo (hard delete) de datos de estudiantes

**Qué:** Implementar endpoint `DELETE /api/users/:id/data` que realice un borrado efectivo (hard delete) de todos los datos de un estudiante, incluyendo: documento User, todos los GamePlays asociados, métricas, y tokens en Redis.

**Por qué:** El soft delete actual (cambiar `status` a `'inactive'`) **no satisface** el derecho de supresión del Art. 17 RGPD. Los datos siguen existiendo en la base de datos y podrían ser consultados. El Considerando 65 enfatiza que este derecho es especialmente relevante para datos recogidos de menores.

**Cómo:** Endpoint protegido (solo teacher propietario o super_admin) con confirmación explícita. Cascada de eliminación: User → GamePlays (por playerId) → tokens Redis → logs de transferencia.

#### MT-04: Política de retención con limpieza automática

**Qué:** Implementar script de retención que se ejecute periódicamente con los siguientes plazos:

| Categoría de datos | Período de retención | Acción al vencer |
|---------------------|---------------------|-------------------|
| Eventos detallados de GamePlay (`events[]`) | 12 meses desde la partida | Anonimización (eliminar `playerId`, `cardUid`) |
| Métricas agregadas de GamePlay (`metrics`) | Indefinida (tras anonimizar) | Sin acción (datos anónimos) |
| Cuentas de estudiantes inactivas | 24 meses sin actividad | Notificación + borrado efectivo |
| Tokens de refresco expirados | 30 días (TTL Redis) | Ya implementado (TTL automático) |
| Logs de seguridad | 12 meses | Eliminación |

**Por qué:** Sin plazos de retención definidos, los datos se acumulan indefinidamente, lo que constituye un incumplimiento del Art. 5.1.e RGPD y aumenta el impacto potencial de una brecha de seguridad.

**Cómo:** Script Node.js ejecutable como tarea programada (`npm run data:retention`). Utiliza las funciones del repository layer existente. Genera informe de acciones realizadas.

#### MT-05: Endpoint de exportación de datos (portabilidad)

**Qué:** Implementar `GET /api/users/:id/export-data` que retorne todos los datos personales del estudiante en formato JSON estructurado, descargable como archivo.

**Por qué:** El Art. 20 RGPD establece el derecho a recibir los datos *«en un formato estructurado, de uso común y lectura mecánica»*. Además, la T-617 del Sprint 5 ya contempla exportar analytics a CSV; este endpoint complementa esa funcionalidad con un alcance más amplio (todos los datos del estudiante, no solo métricas).

**Cómo:** El endpoint recopila datos de: User (perfil), GamePlays (historial), métricas agregadas. Retorna un objeto JSON con metadatos (fecha exportación, versión del formato) y secciones por categoría.

#### MT-06: Registro de consentimiento parental

**Qué:** Añadir al modelo de estudiante un objeto `consent` que registre: si se ha obtenido consentimiento parental, quién lo otorgó, cuándo, para qué finalidades, y versión de la política de privacidad aceptada.

**Por qué:** El Art. 8 RGPD y el Art. 7 LOPDGDD exigen consentimiento del titular de la patria potestad para menores de 14 años. Además, el RGPD requiere que el responsable sea capaz de **demostrar** que se obtuvo el consentimiento (Art. 7.1). Sin un registro técnico, no hay forma de probarlo.

**Cómo:** Nuevos campos en el modelo User (para role `student`): `consent.granted`, `consent.grantedBy`, `consent.grantedAt`, `consent.purposes[]`, `consent.policyVersion`. Validación: no se permite crear un estudiante sin consentimiento registrado.

#### MT-07: Separación lógica de datos identificativos y analíticos

**Qué:** Reestructurar los DTOs y endpoints de analytics para que los datos de rendimiento puedan consultarse y procesarse sin necesidad de acceder a datos identificativos del estudiante.

**Por qué:** Alineado con el principio de protección por diseño (Art. 25), esta separación garantiza que los procesos de análisis de datos no requieran acceso a PII. En caso de una brecha en el subsistema de analytics, los datos expuestos no permitirían identificar a los menores.

**Cómo:** Los endpoints de analytics retornarán datos de rendimiento con un identificador seudonimizado. La resolución del nombre/avatar solo se realizará en la capa de presentación del dashboard del profesor autorizado, no en la capa de datos.

### 4.3 Medidas organizativas y documentales

#### MO-01: Registro de Actividades de Tratamiento (RAT)

**Qué:** Documento formal que describe cada actividad de tratamiento, según el formato requerido por el Art. 30 RGPD.

**Por qué:** Es una **obligación legal directa** del Art. 30. Además, el RAT sirve como mapa de datos que fundamenta todas las demás medidas técnicas.

**Contenido mínimo:** Para cada actividad: nombre, finalidad, base legal, categorías de interesados, categorías de datos, destinatarios, plazos de conservación, medidas de seguridad.

#### MO-02: Evaluación de Impacto en Protección de Datos (EIPD)

**Qué:** Documento formal que evalúa el impacto del tratamiento sobre los derechos de los menores, según el formato del Art. 35 RGPD.

**Por qué:** La AEPD incluye el tratamiento de datos de menores de 14 años entre los criterios que **obligan** a realizar una EIPD. Al tratar datos de niños de 4-8 años con perfilado de rendimiento educativo, se cumplen al menos dos de los criterios de la lista de la AEPD: (1) datos de sujetos vulnerables (menores) y (2) evaluación sistemática de aspectos personales (rendimiento, patrones de respuesta).

**Contenido mínimo:** Descripción del tratamiento, evaluación de necesidad y proporcionalidad, evaluación de riesgos para los derechos de los interesados, medidas de mitigación.

#### MO-03: Información de privacidad para profesores y tutores

**Qué:** Página/sección accesible en la plataforma que informe de forma clara sobre: qué datos se recogen, con qué finalidad, durante cuánto tiempo, quién tiene acceso, y cómo ejercer los derechos.

**Por qué:** Los Arts. 13 y 14 RGPD exigen proporcionar esta información al interesado (o a sus tutores legales, en el caso de menores) en el momento de la recogida de datos, de forma *«concisa, transparente, inteligible y de fácil acceso, con un lenguaje claro y sencillo»*.

---

## 5. Justificación técnica de las decisiones

### 5.1 Seudonimización vs. anonimización

La decisión de utilizar **seudonimización** en lugar de anonimización completa en los datos de analytics responde a una necesidad funcional concreta: el profesor debe poder identificar a sus alumnos para intervenir pedagógicamente. Si los datos fueran completamente anónimos, el dashboard perdería su utilidad principal.

| Criterio | Anonimización | Seudonimización |
|----------|---------------|-----------------|
| ¿Reversible? | No | Sí (con tabla de correspondencia) |
| ¿Sujeto al RGPD? | No (Considerando 26) | Sí (sigue siendo dato personal) |
| ¿Permite seguimiento pedagógico? | No | Sí |
| ¿Reduce riesgo ante brecha? | Máximo | Significativo |
| ¿Adecuado para nuestro caso? | Solo para datos históricos | Para datos operativos |

**Decisión:** Seudonimización para datos operativos (dashboard, logs), anonimización para datos históricos que superen el período de retención.

La AEPD advierte en su Guía de Anonimización que *«la anonimización absoluta no existe»* y que el riesgo de reidentificación debe evaluarse en contexto. En un aula de 20 alumnos, incluso datos aparentemente anónimos (edad + rendimiento + aula) podrían permitir la identificación. Por ello, la anonimización se aplica solo cuando los datos se desvinculan completamente del contexto del aula (datos históricos agregados).

### 5.2 Borrado efectivo vs. soft delete

El diseño actual utiliza soft delete (cambiar `status` a `'inactive'`). Esta decisión fue correcta desde el punto de vista operativo (previene eliminaciones accidentales, permite recuperación), pero **insuficiente** para el derecho de supresión.

**Solución adoptada:** Mantener el soft delete como mecanismo por defecto para la «desactivación» de cuentas (operación reversible), e implementar un **borrado efectivo** separado como operación explícita e irreversible, con las siguientes garantías:

1. **Confirmación explícita:** El profesor debe confirmar la acción con un diálogo de confirmación.
2. **Cascada completa:** Se eliminan: documento User, todos los GamePlays con `playerId`, todos los tokens en Redis, y se limpian referencias en GameSessions.
3. **Registro de la acción:** Se registra un log (sin PII del estudiante eliminado) que documenta que se ejerció el derecho de supresión, cuándo, y por quién.
4. **Irreversibilidad comunicada:** El frontend advierte claramente de que esta acción no es reversible.

### 5.3 Retención temporal con anonimización diferida

En lugar de eliminar los GamePlays completos al vencer el período de retención, se opta por un enfoque de **anonimización diferida**:

1. **Fase 1 (0-12 meses):** Datos completos disponibles para el profesor.
2. **Fase 2 (>12 meses):** Se anonimizan los eventos detallados eliminando `playerId`, `cardUid` y timestamps exactos. Se conservan las métricas agregadas (score, accuracy, response time) sin vinculación a un estudiante específico.

**Justificación:** Los datos agregados anónimos conservan valor estadístico (el profesor puede ver tendencias históricas de su aula sin identificar individuos), mientras que los datos detallados pierden utilidad pedagógica pasado cierto tiempo.

Este enfoque está alineado con el Considerando 26 del RGPD, que establece que los principios de protección de datos **no se aplican** a información anónima. Una vez anonimizados, los datos dejan de ser datos personales y pueden conservarse indefinidamente.

### 5.4 Separación de datos identificativos y analíticos

La separación de PII y datos analíticos se implementa a nivel de **DTOs y endpoints**, no a nivel de modelo de base de datos, por las siguientes razones:

1. **Impacto mínimo en código existente:** No requiere reestructurar los modelos Mongoose ni migrar datos.
2. **Efectividad equivalente:** La protección se logra igualmente si los endpoints de analytics no exponen PII, aunque internamente los datos residan en el mismo documento.
3. **Coherencia con la arquitectura existente:** La plataforma ya usa DTOs para controlar la exposición de datos; esta medida es una extensión natural de ese patrón.

En la práctica, esto significa que:
- Los endpoints de analytics retornan `studentPseudoId` en lugar de `playerId`/`name`.
- La resolución nombre ↔ pseudoId se realiza solo en el frontend del profesor autorizado.
- Si se comprometen los datos de analytics, no se puede identificar a los menores.

---

## 6. Ventajas y beneficios de la implementación

### Beneficios legales y de cumplimiento

1. **Cumplimiento del RGPD y LOPDGDD:** Las medidas propuestas abordan directamente los artículos 5, 8, 17, 20, 25, 30 y 35 del RGPD, y los artículos 7, 83 y 92 de la LOPDGDD.
2. **Prevención de sanciones:** El RGPD prevé multas de hasta 20 millones de euros o el 4% de la facturación anual. Aunque un TFG no es una empresa comercial, demostrar el cumplimiento normativo es esencial para un despliegue en centros educativos reales.
3. **Documentación probatoria:** El RAT y la EIPD constituyen evidencia documental de la responsabilidad proactiva (Art. 5.2).

### Beneficios técnicos

1. **Reducción de la superficie de datos:** Menos datos almacenados = menor impacto en caso de brecha. Si se elimina `birthdate` y se seudonimiza en logs, una hipotética filtración de la base de datos o los logs expone significativamente menos información identificativa.
2. **Datos más limpios:** La política de retención evita la acumulación indefinida de datos obsoletos, mejorando el rendimiento de las consultas de MongoDB.
3. **Arquitectura más robusta:** La separación de PII y analytics en los DTOs facilita futuras integraciones (por ejemplo, si se quisiera enviar datos anónimos a un sistema de investigación educativa externo).

### Beneficios para los usuarios

1. **Confianza de los centros educativos:** Un sistema que demuestra cumplimiento normativo y buenas prácticas de privacidad tiene mayor probabilidad de ser adoptado por centros educativos reales.
2. **Tranquilidad de las familias:** Los padres y tutores pueden verificar qué datos se recogen, por qué, y ejercer sus derechos de forma directa.
3. **Transparencia:** La información de privacidad accesible y la exportación de datos refuerzan la relación de confianza entre la plataforma y sus usuarios.

### Beneficios académicos (TFG)

1. **Diferenciación del proyecto:** La mayoría de los TFG de aplicaciones web no abordan la protección de datos de menores con este nivel de profundidad. Incluir medidas técnicas alineadas con normativa real demuestra madurez profesional.
2. **Capítulo 6.8 de la memoria reforzado:** La sección de «Privacidad y cumplimiento normativo» del índice borrador del TFG pasa de ser un párrafo genérico a una sección sustantiva con medidas concretas implementadas y documentadas.
3. **Alineación con los ODS:** Refuerza el ODS 4 (Educación de calidad) al garantizar que la tecnología educativa respeta los derechos de los menores, y el ODS 16 (Paz, justicia e instituciones sólidas) al promover marcos de gobernanza de datos.

---

## 7. Planificación de la implementación

Las medidas se implementarán como tareas del Sprint 5, siguiendo el formato y sistema de prioridades del archivo `Sprint5_Tareas.md`. Se han asignado identificadores T-701 a T-711 para distinguirlas del resto de tareas del sprint.

### Fases de implementación

```
Fase 0 — Auditoría y documentación (base para todo)
├── T-701: Inventario de datos y RAT
└── T-702: Minimización de datos (birthdate → age)

Fase 1 — Derechos del interesado (P1)
├── T-703: Seudonimización en logs/analytics
├── T-704: Borrado efectivo (hard delete)
├── T-705: Política de retención
└── T-706: Exportación de datos (portabilidad)

Fase 2 — Gobernanza y documentación (P2)
├── T-707: EIPD/DPIA
├── T-708: Registro de consentimiento parental
└── T-709: Separación PII / analytics en DTOs

Fase 3 — Información y auditoría (P3)
├── T-710: Página de información de privacidad
└── T-711: Audit trail de acceso a datos
```

### Dependencias

```
T-701 (Auditoría) ──┬──► T-702 (Minimización)
                    ├──► T-703 (Seudonimización)
                    ├──► T-707 (EIPD, usa el RAT como input)
                    └──► T-709 (Separación PII/analytics)

T-702 ──► T-704 (Borrado efectivo, requiere modelo actualizado)
T-704 ──► T-705 (Retención, reutiliza lógica de borrado)
T-701 ──► T-706 (Exportación, necesita inventario de datos)
T-701 ──► T-708 (Consentimiento, necesita inventario)
T-709 ──► T-710 (Información de privacidad, necesita saber qué datos se exponen)
T-704 ──► T-711 (Audit trail, necesita acciones a registrar)
```

### Estimación de esfuerzo

| Tarea | Tamaño | Tipo |
|-------|--------|------|
| T-701 (Auditoría + RAT) | M (4-8h) | Documentación + código |
| T-702 (Minimización) | S (2-4h) | Backend |
| T-703 (Seudonimización) | M (4-8h) | Backend |
| T-704 (Borrado efectivo) | M (4-8h) | Backend |
| T-705 (Retención) | L (1-2 días) | Backend |
| T-706 (Exportación) | M (4-8h) | Backend |
| T-707 (EIPD) | M (4-8h) | Documentación |
| T-708 (Consentimiento) | M (4-8h) | Backend + Frontend |
| T-709 (Separación PII/analytics) | S (2-4h) | Backend |
| T-710 (Información privacidad) | S (2-4h) | Frontend |
| T-711 (Audit trail) | S (2-4h) | Backend |
| **Total** | **~10-15 días** | |

---

## 8. Referencias bibliográficas

### Legislación y regulación

1. **Reglamento (UE) 2016/679** del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la protección de las personas físicas en lo que respecta al tratamiento de datos personales y a la libre circulación de estos datos (Reglamento General de Protección de Datos — RGPD). *Diario Oficial de la Unión Europea*, L 119, 4 de mayo de 2016.

2. **Ley Orgánica 3/2018**, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD). *Boletín Oficial del Estado*, núm. 294, de 6 de diciembre de 2018. BOE-A-2018-16673.

3. **Proyecto de Ley Orgánica para la Protección de las Personas Menores de Edad en los Entornos Digitales.** Aprobado por el Consejo de Ministros, 25 de marzo de 2025. En tramitación parlamentaria.

### Directrices de autoridades de control

4. **Agencia Española de Protección de Datos (AEPD).** *Guía para Centros Educativos.* AEPD, 2018 (actualizada).

5. **Agencia Española de Protección de Datos (AEPD).** *Listas de tipos de tratamientos de datos que requieren evaluación de impacto relativa a protección de datos (Art. 35.4).* AEPD, 2019.

6. **Agencia Española de Protección de Datos (AEPD).** *Guía básica de anonimización.* AEPD, 2019.

7. **Agencia Española de Protección de Datos (AEPD).** *Orientaciones y garantías en los procedimientos de anonimización de datos personales.* AEPD, 2020.

8. **European Data Protection Board (EDPB).** *Guidelines 4/2019 on Article 25 — Data Protection by Design and by Default.* Versión 2.0, adoptadas el 20 de octubre de 2020.

9. **European Data Protection Board (EDPB).** *Guidelines 01/2025 on Pseudonymisation.* Adoptadas el 16 de enero de 2025.

### Normas y estándares

10. **ISO/IEC 27701:2019** (revisada 2025). *Privacy Information Management — Requirements and guidance for establishing, implementing, maintaining and continually improving a Privacy Information Management System (PIMS).* International Organization for Standardization.

### Considerandos del RGPD referenciados

11. **Considerando 26** — Datos anónimos y principio de identificabilidad.
12. **Considerando 38** — Protección específica de los datos personales de los niños.
13. **Considerando 65** — Derecho de supresión en relación con datos recogidos de menores.

---

## 9. Estado de implementación

**Última actualización:** 08-04-2026

### Medidas técnicas implementadas

| Medida | Tarea | Estado | Normativa |
|--------|-------|--------|-----------|
| MT-01: Eliminación de `profile.birthdate` | T-702 Fase A | ✅ Implementada | Art. 5.1.c RGPD |
| MT-02: Seudonimización en logs/analytics | T-703 | ✅ Implementada | Art. 25 RGPD, EDPB 01/2025 |
| MT-03: Borrado efectivo (hard delete) | T-704 Fase A | ✅ Implementada | Art. 17 RGPD |
| MT-04: Política de retención automática | T-704 Fase B | ✅ Implementada | Art. 5.1.e RGPD |
| MT-05: Exportación de datos (portabilidad) | T-706 | ✅ Implementada | Art. 20 RGPD |
| MT-06: Consentimiento parental | T-702 Fase B | ✅ Implementada | Art. 8 RGPD + Art. 7 LOPDGDD |
| MT-07: Separación PII/analytics en DTOs | T-703 Fase B | ✅ Implementada | Art. 25 RGPD |

### Medidas organizativas implementadas

| Medida | Tarea | Estado | Normativa |
|--------|-------|--------|-----------|
| MO-01: Registro de Actividades de Tratamiento (RAT) | T-701 | ✅ Implementada | Art. 30 RGPD |
| MO-02: Evaluación de Impacto (EIPD) | T-701 | ✅ Implementada | Art. 35 RGPD |
| MO-03: Página de privacidad | T-710 | 📋 Pendiente | Arts. 13-14 RGPD |

### Medidas adicionales identificadas (sesión 06-04-2026)

| Medida | Tarea | Estado | Normativa |
|--------|-------|--------|-----------|
| Protocolo de notificación de brechas | T-712 | ✅ Implementada | Arts. 33-34 RGPD |
| Endpoint de rectificación con audit trail | T-713 | ✅ Implementada | Art. 16 RGPD |
| Evaluación riesgo re-identificación aulas pequeñas | T-714 | ✅ Implementada | EDPB 01/2025 |
| Derecho de oposición a analytics | T-715 | 📋 Pendiente | Art. 21 RGPD |
| Planificación Atlas CSFLE para producción | T-716 | 📋 Pendiente | Art. 32.1.a RGPD |
| Documentar Sentry como procesador internacional | T-717 | ✅ Implementada | Arts. 28, 46 RGPD |

### Carencias resueltas

| Carencia original (§3.4) | Resolución |
|--------------------------|------------|
| No existe RAT | ✅ `backend/docs/RAT_Registro_Actividades_Tratamiento.md` creado con 7 actividades |
| No existe EIPD | ✅ `documentation/EIPD_Evaluacion_Impacto.md` creado con 12 riesgos identificados |
| Se almacena fecha de nacimiento completa | ✅ `profile.birthdate` eliminado, validación en pre-save, script migración |
| No hay mecanismo de borrado efectivo | ✅ `DELETE /api/users/:id/data` con cascada completa (User + GamePlays + Redis + WebSocket) |
| No hay política de retención | ✅ `config/dataRetention.js` + `scripts/dataRetention.js` con `--dry-run` |
| No se registra consentimiento parental | ✅ Campo `consent` en User, bloqueo de creación sin consentimiento, endpoint PATCH, frontend |

### Documentación generada

- **ADR-030:** Protección de datos de menores — en `backend/docs/Architecture_Decisions.md`
- **RAT:** `backend/docs/RAT_Registro_Actividades_Tratamiento.md` (Art. 30 RGPD)
- **EIPD:** `documentation/EIPD_Evaluacion_Impacto.md` (Art. 35 RGPD)
- **Scripts:** `data:audit`, `data:retention`, `data:retention:dry-run`, `migrate:birthdate`
- **Eventos de seguridad:** `DATA_CONSENT_CHANGE`, `DATA_HARD_DELETE`, `DATA_RETENTION_EXECUTED`, `DATA_RECTIFICATION`, `DATA_ACCESS`, `DATA_EXPORT`
- **Seudonimización:** `backend/src/utils/pseudonymize.js` (SHA-256 truncado, 8 chars hex)
- **Exportación datos:** `GET /api/users/:id/export-data` con `backend/src/services/dataExportService.js`
- **k-anonimidad:** `MIN_ANALYTICS_GROUP_SIZE: 5` en `config/dataRetention.js`
- **Evaluación re-identificación:** `documentation/Evaluacion_Riesgo_Reidentificacion.md`
- **Protocolo brechas:** `documentation/Protocolo_Notificacion_Brechas.md` (Art. 33-34)
- **Filtrado Sentry:** PII de menores eliminada de breadcrumbs/extras/tags en `beforeSend`

---

*Documento elaborado como parte del Sprint 5 del TFG «Plataforma de Juegos Educativos con RFID» para fundamentar las medidas técnicas y organizativas de protección de datos de menores implementadas en la plataforma Eduplay.*
