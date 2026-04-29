# Proteccion de Datos de Menores en la Plataforma Eduplay

**Proyecto:** Trabajo de Fin de Grado — Plataforma de Juegos Educativos con RFID
**Autor:** Samuel Blanchart Perez
**Fecha de elaboracion:** 13-04-2026
**Clasificacion:** Anexo academico — Proteccion de Datos Personales
**Normativa principal:** Reglamento (UE) 2016/679 (RGPD), Ley Organica 3/2018 (LOPDGDD)

---

## Indice

1. [Introduccion y contexto](#1-introduccion-y-contexto)
2. [Marco normativo aplicable](#2-marco-normativo-aplicable)
   - 2.1 [Reglamento General de Proteccion de Datos (RGPD)](#21-reglamento-general-de-proteccion-de-datos-rgpd)
   - 2.2 [Ley Organica de Proteccion de Datos y Garantia de Derechos Digitales (LOPDGDD)](#22-ley-organica-de-proteccion-de-datos-y-garantia-de-derechos-digitales-lopdgdd)
   - 2.3 [Directrices de la AEPD](#23-directrices-de-la-aepd)
   - 2.4 [Directrices del EDPB](#24-directrices-del-edpb)
3. [Inventario de datos personales](#3-inventario-de-datos-personales)
   - 3.1 [Datos recogidos de estudiantes](#31-datos-recogidos-de-estudiantes)
   - 3.2 [Datos NO recogidos (minimizacion por diseno)](#32-datos-no-recogidos-minimizacion-por-diseno)
   - 3.3 [Datos de profesores](#33-datos-de-profesores)
4. [Registro de Actividades de Tratamiento (RAT)](#4-registro-de-actividades-de-tratamiento-rat)
   - 4.1 [AT-01: Gestion de cuentas de estudiantes](#41-at-01-gestion-de-cuentas-de-estudiantes)
   - 4.2 [AT-02: Registro de partidas educativas](#42-at-02-registro-de-partidas-educativas)
   - 4.3 [AT-03: Analytics y metricas de rendimiento](#43-at-03-analytics-y-metricas-de-rendimiento)
   - 4.4 [AT-04: Autenticacion de profesores](#44-at-04-autenticacion-de-profesores)
   - 4.5 [AT-05: Logging de seguridad](#45-at-05-logging-de-seguridad)
   - 4.6 [AT-06: Procesamiento de errores por Sentry](#46-at-06-procesamiento-de-errores-por-sentry)
   - 4.7 [AT-07: Interaccion RFID en tiempo real](#47-at-07-interaccion-rfid-en-tiempo-real)
   - 4.8 [Medidas de seguridad transversales](#48-medidas-de-seguridad-transversales)
5. [Evaluacion de Impacto en Proteccion de Datos (EIPD)](#5-evaluacion-de-impacto-en-proteccion-de-datos-eipd)
   - 5.1 [Justificacion de obligatoriedad](#51-justificacion-de-obligatoriedad)
   - 5.2 [Evaluacion de necesidad y proporcionalidad](#52-evaluacion-de-necesidad-y-proporcionalidad)
   - 5.3 [Matriz de riesgos](#53-matriz-de-riesgos)
   - 5.4 [Medidas de mitigacion y riesgo residual](#54-medidas-de-mitigacion-y-riesgo-residual)
6. [Medidas tecnicas implementadas](#6-medidas-tecnicas-implementadas)
   - 6.1 [Minimizacion de datos](#61-minimizacion-de-datos)
   - 6.2 [Consentimiento parental verificable](#62-consentimiento-parental-verificable)
   - 6.3 [Derecho de oposicion a analytics](#63-derecho-de-oposicion-a-analytics)
   - 6.4 [Seudonimizacion](#64-seudonimizacion)
   - 6.5 [k-anonimidad en aulas pequenas](#65-k-anonimidad-en-aulas-pequenas)
   - 6.6 [Borrado efectivo](#66-borrado-efectivo)
   - 6.7 [Politica de retencion](#67-politica-de-retencion)
   - 6.8 [Exportacion de datos y portabilidad](#68-exportacion-de-datos-y-portabilidad)
   - 6.9 [Filtrado de PII en Sentry](#69-filtrado-de-pii-en-sentry)
   - 6.10 [Logging de seguridad con redaccion de PII](#610-logging-de-seguridad-con-redaccion-de-pii)
   - 6.11 [Verificacion de consentimiento en gameplay](#611-verificacion-de-consentimiento-en-gameplay)
   - 6.12 [Auditoria automatizada de datos](#612-auditoria-automatizada-de-datos)
7. [Medidas organizativas y documentales](#7-medidas-organizativas-y-documentales)
   - 7.1 [Protocolo de notificacion de brechas](#71-protocolo-de-notificacion-de-brechas)
   - 7.2 [Centralizacion RGPD en Super Admin](#72-centralizacion-rgpd-en-super-admin)
   - 7.3 [Control de acceso basado en roles (RBAC)](#73-control-de-acceso-basado-en-roles-rbac)
8. [Evaluacion del riesgo de re-identificacion](#8-evaluacion-del-riesgo-de-re-identificacion)
   - 8.1 [Quasi-identificadores](#81-quasi-identificadores)
   - 8.2 [Escenarios de riesgo](#82-escenarios-de-riesgo)
   - 8.3 [Analisis de k-anonimidad](#83-analisis-de-k-anonimidad)
   - 8.4 [Medida implementada](#84-medida-implementada)
   - 8.5 [Limitaciones conocidas](#85-limitaciones-conocidas)
9. [Conclusiones](#9-conclusiones)
10. [Referencias bibliograficas](#10-referencias-bibliograficas)

---

## 1. Introduccion y contexto

### 1.1 Descripcion de la plataforma

**Eduplay** es una plataforma educativa interactiva que permite a profesores de educacion infantil y primaria crear y supervisar sesiones de juego con tarjetas RFID fisicas para alumnos de entre **4 y 8 anos**. El sistema se compone de un backend (Node.js/Express), un frontend (React), un lector RFID basado en ESP8266 con modulo RC522, y una infraestructura de soporte (MongoDB, Redis, Docker Compose).

El flujo funcional de la plataforma se estructura de la siguiente manera:

1. **Creacion de estudiantes:** El profesor o el administrador del centro registra a cada alumno con datos identificativos minimos (nombre, edad, aula). El alumno no posee credenciales de acceso.
2. **Configuracion de sesiones de juego:** El profesor crea sesiones seleccionando un contexto tematico, una mecanica de juego y un mazo de tarjetas RFID.
3. **Ejecucion de partidas:** Cada alumno juega una partida individual interactuando fisicamente con tarjetas RFID que son leidas por un lector RC522 conectado a un microcontrolador ESP8266. El navegador del profesor transmite las lecturas al backend mediante WebSocket (Socket.IO) a traves de la Web Serial API.
4. **Registro de eventos:** Cada interaccion del alumno (acierto, error, timeout) se registra como un evento con marca temporal y tiempo de respuesta en milisegundos.
5. **Analisis de rendimiento:** El profesor consulta dashboards con metricas agregadas de sus alumnos: puntuaciones medias, distribucion por rangos, tendencias temporales y alertas de riesgo academico.

### 1.2 Por que la proteccion de datos es critica en este proyecto

El rango de edad de los usuarios finales (4-8 anos) situa a los estudiantes de la plataforma dentro de un colectivo que la legislacion europea y espanola reconoce como **especialmente vulnerable** en materia de proteccion de datos personales. El Considerando 38 del Reglamento General de Proteccion de Datos (RGPD) establece explicitamente que:

> *«Los ninos merecen una proteccion especifica de sus datos personales, ya que pueden ser menos conscientes de los riesgos, consecuencias, garantias y derechos concernientes al tratamiento de datos personales.»*

La plataforma recoge datos de rendimiento educativo, tiempos de respuesta, patrones de acierto y error, y metadatos de interaccion de menores. Aunque estos datos no incluyen categorias especiales del Articulo 9 del RGPD (datos de salud, biometricos, etc.), si constituyen **datos personales de menores** que, combinados, pueden revelar informacion sensible sobre las capacidades cognitivas, ritmos de aprendizaje y comportamiento de cada nino. Los tiempos de respuesta y patrones de error, por ejemplo, podrian interpretarse — incorrectamente y sin diagnostico profesional — como indicadores de dificultades cognitivas o de aprendizaje.

Esta circunstancia exige un tratamiento riguroso desde la fase de diseno (*privacy by design*) hasta la operacion del sistema, integrando consideraciones de gobernanza de datos y cumplimiento normativo como requisitos no funcionales de primera clase.

### 1.3 Motivacion academica

En el contexto de un Trabajo de Fin de Grado en Ingenieria Informatica, dedicar un eje completo del desarrollo a la proteccion de datos no es un mero formalismo: demuestra la madurez del proyecto al integrar consideraciones de gobernanza de datos como parte integral de la arquitectura del software. Este enfoque refleja la realidad de la ingenieria de software moderna, donde el diseno de sistemas que tratan datos personales — especialmente de colectivos vulnerables — exige un tratamiento riguroso que va mas alla de las funcionalidades tecnicas.

La mayoria de los trabajos de fin de grado que desarrollan aplicaciones web no abordan la proteccion de datos de menores con este nivel de profundidad. Incluir medidas tecnicas alineadas con la normativa vigente, documentadas formalmente y verificadas mediante herramientas de auditoria automatizada, constituye un elemento diferenciador que demuestra madurez profesional y comprension del marco regulatorio europeo.

---

## 2. Marco normativo aplicable

El tratamiento de datos personales de menores en una plataforma educativa desarrollada y operada en Espana esta sujeto a un marco normativo multinivel que comprende regulacion europea, legislacion organica espanola y directrices interpretativas de las autoridades de control.

### 2.1 Reglamento General de Proteccion de Datos (RGPD)

El **Reglamento (UE) 2016/679** (RGPD), de aplicacion directa en todos los Estados miembros, es la norma de referencia. Los articulos con incidencia directa en esta plataforma son los siguientes.

#### Articulo 5 — Principios relativos al tratamiento

Define los principios que todo tratamiento de datos debe cumplir. Los tres con mayor incidencia en esta plataforma son:

- **Minimizacion de datos** (Art. 5.1.c): Los datos deben ser *«adecuados, pertinentes y limitados a lo necesario en relacion con los fines para los que son tratados»*. Este principio exige revisar cada campo de datos recopilado y eliminar aquellos que no sean estrictamente necesarios para la funcionalidad educativa.
- **Limitacion del plazo de conservacion** (Art. 5.1.e): Los datos deben conservarse *«durante no mas tiempo del necesario para los fines del tratamiento»*. Exige definir politicas de retencion con plazos concretos y mecanismos de limpieza automatica.
- **Responsabilidad proactiva** (Art. 5.2): El responsable del tratamiento debe poder **demostrar** el cumplimiento de los principios anteriores. No basta con cumplir: hay que documentar como se cumple. Este principio fundamenta la elaboracion del Registro de Actividades de Tratamiento y la Evaluacion de Impacto.

#### Articulo 6.1.a — Consentimiento como base legal

El tratamiento solo es licito si el interesado ha dado su consentimiento para uno o varios fines especificos. Para menores por debajo de la edad establecida por cada Estado miembro, el consentimiento debe proceder del titular de la patria potestad o tutela.

#### Articulo 8 — Consentimiento del menor

Establece que cuando el tratamiento se basa en el consentimiento y se ofrece un servicio de la sociedad de la informacion directamente a un menor, el tratamiento solo es licito si el menor tiene al menos la edad que establezca el Estado miembro (entre 13 y 16 anos). Para menores por debajo de esa edad, **el consentimiento debe ser otorgado o autorizado por el titular de la patria potestad o tutela**. El apartado 8.2 exige ademas que el responsable haga *«esfuerzos razonables»* para verificar que el consentimiento fue efectivamente otorgado por el titular de la patria potestad.

#### Articulo 17 — Derecho de supresion

El interesado tiene derecho a obtener la supresion de sus datos personales. El apartado 17.1.f establece una causa especifica cuando *«los datos personales se han recogido en relacion con la oferta de servicios de la sociedad de la informacion»* a un menor. El Considerando 65 refuerza que este derecho es *«pertinente en particular cuando el interesado dio su consentimiento siendo nino y no era plenamente consciente de los riesgos que implicaba el tratamiento»*.

#### Articulo 20 — Derecho a la portabilidad

El interesado tiene derecho a recibir los datos personales que haya proporcionado al responsable del tratamiento en un **formato estructurado, de uso comun y lectura mecanica**, y a transmitirlos a otro responsable. Este derecho aplica cuando el tratamiento se efectua por medios automatizados, como es el caso de esta plataforma.

#### Articulo 21 — Derecho de oposicion

El interesado tiene derecho a oponerse en cualquier momento, por motivos relacionados con su situacion particular, al tratamiento de sus datos personales. Para menores, este derecho lo ejercen los titulares de la patria potestad o tutela. La plataforma implementa este derecho de forma granular, permitiendo oponerse al tratamiento con fines de analytics de rendimiento sin que ello impida la participacion del alumno en sesiones de juego.

#### Articulo 25 — Proteccion de datos desde el diseno y por defecto

Obliga al responsable a aplicar medidas tecnicas y organizativas apropiadas — como la **seudonimizacion** — disenadas para aplicar de forma efectiva los principios de proteccion de datos e integrar las garantias necesarias en el tratamiento. Las Directrices 4/2019 del EDPB detallan que este articulo es *«particularmente importante»* cuando los interesados son menores.

#### Articulo 30 — Registro de las actividades de tratamiento

Todo responsable debe llevar un registro de las actividades de tratamiento efectuadas bajo su responsabilidad, que incluya: fines del tratamiento, categorias de interesados y datos personales, destinatarios, plazos de supresion y descripcion de las medidas de seguridad.

#### Articulo 32 — Seguridad del tratamiento

El responsable y el encargado del tratamiento deben aplicar medidas tecnicas y organizativas apropiadas para garantizar un nivel de seguridad adecuado al riesgo, incluyendo la seudonimizacion y el cifrado de datos, la capacidad de garantizar la confidencialidad, integridad, disponibilidad y resiliencia permanentes de los sistemas, la capacidad de restaurar la disponibilidad y el acceso a los datos de forma rapida, y un proceso de verificacion, evaluacion y valoracion regulares de la eficacia de las medidas.

#### Articulo 35 — Evaluacion de Impacto en Proteccion de Datos (EIPD)

Cuando un tipo de tratamiento *«entrane un alto riesgo para los derechos y libertades de las personas fisicas»*, el responsable debe realizar una Evaluacion de Impacto. La AEPD incluye expresamente el tratamiento de datos de **menores de 14 anos** entre los criterios que obligan a realizar una EIPD.

### 2.2 Ley Organica de Proteccion de Datos y Garantia de Derechos Digitales (LOPDGDD)

La **Ley Organica 3/2018, de 5 de diciembre** (LOPDGDD) complementa y desarrolla el RGPD en el ordenamiento juridico espanol.

#### Articulo 7 — Consentimiento de los menores de edad

Espana fija en **14 anos** la edad minima para que un menor pueda prestar consentimiento por si mismo para el tratamiento de sus datos personales, ejerciendo la opcion que el Art. 8 RGPD otorga a los Estados miembros de rebajar el umbral de 16 anos sin bajar de 13. Para los alumnos de 4-8 anos de esta plataforma, el consentimiento **siempre** debe proceder del titular de la patria potestad o tutela.

Cabe senalar que el Proyecto de Ley Organica para la Proteccion de las Personas Menores de Edad en los Entornos Digitales (aprobado por el Consejo de Ministros en marzo de 2025, en tramitacion parlamentaria) contempla elevar esta edad a 16 anos. Aunque no esta vigente a fecha de este documento, refuerza la tendencia legislativa hacia una mayor proteccion de los menores en entornos digitales.

#### Articulo 83 — Derecho a la educacion digital

Establece que el sistema educativo debe garantizar *«la plena insercion del alumnado en la sociedad digital y el aprendizaje de un consumo responsable y uso critico y seguro de los medios digitales»*, incluyendo expresamente el respeto a la **intimidad personal y familiar** y la **proteccion de datos personales**.

#### Articulo 92 — Proteccion de datos de los menores en Internet

Los centros educativos y cualquier persona que desarrolle actividades con menores deben garantizar la **proteccion del interes superior del menor** y sus derechos fundamentales, especialmente el derecho a la proteccion de datos personales.

### 2.3 Directrices de la AEPD

La **Agencia Espanola de Proteccion de Datos** (AEPD), como autoridad de control en Espana, ha publicado documentacion especifica que orienta el tratamiento de datos en entornos educativos:

- **Guia para Centros Educativos** (AEPD, 2018, actualizada): Responde a mas de 80 preguntas frecuentes de la comunidad educativa sobre proteccion de datos. Distingue entre actividades propias de la funcion docente (amparables en el interes publico, Art. 6.1.e RGPD) y el uso de plataformas externas no esenciales (que requieren consentimiento expreso de los tutores). En el caso de Eduplay, al ser una plataforma externa que no forma parte del sistema de gestion academica del centro, el consentimiento parental es la base legal mas apropiada.

- **Listas de tipos de tratamientos que requieren EIPD** (AEPD, 2019): Publicada conforme al Art. 35.4 RGPD. Incluye expresamente tratamientos de datos de menores de 14 anos como uno de los criterios que obligan a realizar una Evaluacion de Impacto.

- **Guia basica de anonimizacion** (AEPD, 2019): Describe tecnicas de anonimizacion y advierte que *«la anonimizacion absoluta no existe»*: el riesgo de re-identificacion depende del contexto y debe evaluarse continuamente. Recomienda valores de k de al menos 5 para conjuntos de datos sensibles en el marco de la k-anonimidad.

### 2.4 Directrices del EDPB

El **European Data Protection Board** (EDPB), como organo consultivo y de cooperacion europeo en materia de proteccion de datos, ha emitido directrices directamente aplicables a este proyecto:

- **WP 248 rev.01 — Directrices sobre evaluacion de impacto** (Grupo de Trabajo del Art. 29, 2017, refrendadas por el EDPB): Proporcionan la metodologia de evaluacion de riesgos utilizada en la EIPD de este proyecto. Senalan que el tratamiento de datos de menores, por su condicion de sujetos especialmente vulnerables, justifica por si solo una evaluacion de impacto reforzada.

- **Directrices 01/2025 sobre Seudonimizacion** (EDPB, enero de 2025): Proporcionan orientacion detallada sobre la seudonimizacion como medida tecnica conforme al Art. 25 RGPD. Definen la seudonimizacion como el tratamiento de datos de forma que *«ya no puedan atribuirse a un interesado sin utilizar informacion adicional»*, siempre que dicha informacion adicional se mantenga separada. Reconocen como tecnicas validas las funciones hash, que es el enfoque adoptado en esta plataforma.

- **Directrices 4/2019 sobre proteccion de datos desde el diseno y por defecto** (EDPB, 2020): Detallan los requisitos del Art. 25 RGPD, indicando que este articulo es *«particularmente importante»* cuando los interesados son menores. La plataforma implementa proteccion por defecto al no recoger datos innecesarios, al configurar por defecto la maxima proteccion y al separar datos identificativos de datos analiticos.

---

## 3. Inventario de datos personales

Se ha realizado una auditoria exhaustiva del codigo fuente para identificar todos los datos personales recopilados, clasificandolos por categoria de interesado y evaluando su necesidad funcional.

### 3.1 Datos recogidos de estudiantes

#### Datos identificativos (modelo User, rol student)

| Dato | Campo tecnico | Necesidad educativa | Justificacion |
|------|---------------|---------------------|---------------|
| Nombre completo | `name` | **Alta** | Imprescindible para que el profesor identifique a cada alumno en el dashboard y pueda intervenir pedagogicamente |
| Edad | `profile.age` | **Media** | Permite contextualizar el rendimiento del alumno segun su grupo de edad. Un tiempo de respuesta de 5 segundos tiene distinta significacion pedagogica para un alumno de 4 anos que para uno de 8 |
| Aula | `profile.classroom` | **Alta** | Necesaria para la organizacion de alumnos por grupos. El profesor gestiona multiples aulas y necesita filtrar y agrupar a sus alumnos |
| Avatar | `profile.avatar` | **Baja** | Elemento opcional de personalizacion visual. No se recoge por defecto. No contribuye al seguimiento pedagogico |
| Profesor responsable | `createdBy`, `assignedTeacher` | **Alta** | Vinculacion profesor-alumno necesaria para el control de acceso y la responsabilidad sobre los datos |

#### Datos de rendimiento educativo (modelo GamePlay)

| Dato | Campo tecnico | Necesidad educativa | Justificacion |
|------|---------------|---------------------|---------------|
| Puntuacion | `score` | **Alta** | Dato central del seguimiento pedagogico. Permite evaluar el progreso del alumno en cada partida |
| Metricas de partida | `metrics.*` (6 campos) | **Alta** | Desglosan la puntuacion en componentes utiles para el diagnostico: intentos totales, aciertos, errores, timeouts. Permiten distinguir entre un alumno que falla mucho pero intenta y uno que abandona |
| Eventos de interaccion | `events[]` (hasta 500) | **Media** | Proporcionan el detalle granular de cada intento. Su necesidad pedagogica disminuye con el tiempo, por lo que se aplica una politica de retencion de 12 meses |
| Tiempos de respuesta | `events[].timeElapsed` | **Media** | Indicador indirecto de dificultad o facilidad. Dato potencialmente sensible porque puede revelar informacion sobre capacidades cognitivas |
| UID de tarjeta RFID | `events[].cardUid` | **Baja tras la partida** | Necesario durante la partida para asociar el escaneo fisico con el contenido esperado. Las tarjetas son tokens fungibles, no vinculados a un alumno concreto |
| Metricas agregadas | `studentMetrics.*` (8 campos) | **Alta** | Permiten el seguimiento longitudinal del progreso del alumno sin necesidad de recalcular a partir de partidas individuales |

#### Datos especialmente sensibles

Los tiempos de respuesta (`events[].timeElapsed`) y los patrones de error pueden revelar indirectamente informacion sobre capacidades cognitivas o dificultades de aprendizaje del menor. Aunque no constituyen datos de categoria especial (Art. 9 RGPD), requieren **proteccion reforzada** por tratarse de menores. La plataforma no realiza inferencias sobre capacidades cognitivas ni facilita este tipo de interpretaciones; la responsabilidad de la interpretacion pedagogica recae siempre en el profesor.

### 3.2 Datos NO recogidos (minimizacion por diseno)

El diseno de la plataforma ha excluido deliberadamente los siguientes datos, aplicando el principio de minimizacion desde la fase de diseno (Art. 25 RGPD — proteccion de datos desde el diseno y por defecto):

| Dato excluido | Justificacion de la exclusion |
|----------------|-------------------------------|
| **Email del alumno** | Los alumnos de 4-8 anos no tienen email propio. Recogerlo seria innecesario y contrario al principio de minimizacion. Los alumnos no necesitan credenciales de acceso porque no interactuan directamente con la plataforma web |
| **Contrasena del alumno** | Los alumnos no inician sesion en la plataforma. Su participacion se canaliza a traves del profesor, que gestiona las sesiones de juego. El modelo de datos valida activamente que un usuario con rol estudiante no tenga contrasena |
| **Fecha de nacimiento completa** | La edad simple es suficiente para la funcion educativa. La fecha de nacimiento completa tiene un potencial identificativo significativamente mayor: un menor de 5 anos nacido el 15 de marzo de 2021 es identificable en un aula de 20 alumnos; un menor de «5 anos» en la misma aula tiene menor riesgo de identificacion. La eliminacion de este campo es una medida de minimizacion implementada activamente |
| **Direccion postal** | Sin relevancia para la funcion educativa de la plataforma |
| **Telefono** | Sin relevancia para la funcion educativa. La comunicacion con las familias se realiza a traves de los canales habituales del centro educativo, fuera de la plataforma |
| **Datos biometricos** | El UID de la tarjeta RFID no es un dato biometrico: es un identificador del objeto fisico (la tarjeta), no del alumno. Las tarjetas son intercambiables entre alumnos y no estan vinculadas a la identidad biologica de ningun menor |
| **Datos de salud** | La plataforma no recoge ni pretende inferir datos de salud. Aunque los tiempos de respuesta podrian correlacionarse con determinadas condiciones cognitivas, la plataforma no realiza este tipo de inferencias ni las facilita |
| **Geolocalizacion** | No se recoge la ubicacion del alumno ni del dispositivo. La IP del profesor se registra en logs de seguridad pero no se geolocaliza |
| **Imagenes o video del alumno** | La plataforma no utiliza camaras ni captura imagenes de los alumnos. El avatar es una imagen generica seleccionada por el profesor, no una fotografia del menor |

### 3.3 Datos de profesores

| Dato | Campo tecnico | Justificacion |
|------|---------------|---------------|
| Email | `email` | Credenciales de acceso e identificacion en la plataforma |
| Contrasena (hash bcrypt) | `password` | Autenticacion segura. Almacenada como hash bcrypt con 10 rondas de sal |
| IP | Logs de seguridad | Auditoria de seguridad y deteccion de anomalias |
| User-Agent | Logs de seguridad | Diagnostico tecnico y deteccion de token theft |
| Fingerprint de dispositivo | Hash SHA-256 en JWT | Deteccion de robo de tokens. Hash irreversible de cabeceras HTTP |

Los datos de profesores se tratan conforme al Art. 6.1.b RGPD (ejecucion de contrato) y al Art. 6.1.f RGPD (interes legitimo del responsable para la seguridad del sistema).

---

## 4. Registro de Actividades de Tratamiento (RAT)

El Articulo 30 del RGPD establece la obligacion de llevar un registro de las actividades de tratamiento efectuadas bajo la responsabilidad del responsable del tratamiento. Este registro incluye la informacion minima exigida por el Art. 30.1: nombre y datos de contacto del responsable, fines del tratamiento, categorias de interesados y datos, destinatarios, plazos previstos para la supresion y descripcion general de las medidas de seguridad.

Adicionalmente, el Art. 5.2 RGPD (principio de responsabilidad proactiva) exige que el responsable sea capaz de demostrar el cumplimiento de los principios de proteccion de datos. El presente registro constituye una de las evidencias de dicho cumplimiento.

**Responsable del tratamiento:** Centro educativo que utiliza la plataforma Eduplay
**Encargado del tratamiento:** Plataforma Eduplay (TFG)

### 4.1 AT-01: Gestion de cuentas de estudiantes

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Crear, identificar y gestionar las cuentas de alumnos de 4-8 anos para permitir su participacion en sesiones de juego educativo y el seguimiento pedagogico por parte del profesor |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD + Art. 8 RGPD + Art. 7 LOPDGDD |
| **Categorias de interesados** | Menores de edad (4-8 anos) — colectivo especialmente protegido (Considerando 38 RGPD) |
| **Categorias de datos** | Nombre completo, edad, aula, avatar opcional, identificador interno, fecha de creacion, profesor responsable |
| **Datos NO recogidos (por diseno)** | Email, contrasena, direccion, telefono, fecha de nacimiento completa (eliminada por minimizacion), datos biometricos, datos de salud |
| **Destinatarios** | Super_admin (gestion completa: creacion, consentimiento, borrado, exportacion), profesor creador (acceso de lectura y uso pedagogico). No se comparten datos con terceros |
| **Transferencias internacionales** | No directamente. Sentry puede recibir metadatos en caso de error del sistema (ver AT-06) |
| **Plazo de conservacion** | Mientras el consentimiento parental este vigente. Maximo 24 meses tras inactividad del estudiante, tras lo cual se aplica borrado efectivo (Art. 17 RGPD) |
| **Medidas de seguridad** | Control de acceso por roles (RBAC) con operaciones RGPD centralizadas en super_admin, cifrado en transito (TLS/HTTPS), DTOs para control de exposicion, rate limiting, validacion de entrada (Zod), ausencia de credenciales para estudiantes, historial de consentimiento con trazabilidad completa (Art. 7.1), metadata de canal (IP, user-agent) en registro de consentimiento |

**Justificacion de la base legal:** El Art. 7 de la LOPDGDD fija en 14 anos la edad minima para que un menor pueda prestar consentimiento por si mismo. Los alumnos de Eduplay tienen entre 4 y 8 anos, muy por debajo de este umbral. Se ha descartado el interes publico (Art. 6.1.e RGPD) porque, aunque la funcion educativa del centro puede ampararse en este fundamento para las actividades propias del curriculo, Eduplay es una plataforma externa que no forma parte del sistema de gestion academica del centro. La AEPD senala en su Guia para Centros Educativos que el uso de plataformas externas no esenciales requiere consentimiento expreso de los tutores. Se ha descartado tambien el interes legitimo (Art. 6.1.f RGPD) porque el Considerando 47 establece que los intereses y derechos del interesado prevalecen cuando se trata de menores de corta edad.

### 4.2 AT-02: Registro de partidas educativas

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Registrar el desarrollo de cada partida individual (aciertos, errores, tiempos de respuesta) para proporcionar retroalimentacion pedagogica al profesor y permitir el seguimiento del progreso de aprendizaje |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD + Art. 8 RGPD |
| **Categorias de interesados** | Menores de edad (4-8 anos) |
| **Categorias de datos** | Identificador del estudiante, puntuacion, ronda actual, estado, metricas agregadas, eventos detallados (hasta 500 por partida, incluyendo tipo de evento, tiempo de respuesta en ms, valor esperado/actual, UID de tarjeta RFID), timestamps de inicio y fin |
| **Datos especialmente sensibles** | Los tiempos de respuesta y patrones de error pueden revelar indirectamente informacion sobre capacidades cognitivas o dificultades de aprendizaje. Aunque no constituyen datos de categoria especial (Art. 9 RGPD), requieren proteccion reforzada por tratarse de menores |
| **Destinatarios** | Profesor creador de la sesion. No se comparten con terceros |
| **Transferencias internacionales** | No |
| **Plazo de conservacion** | Datos identificados: 12 meses desde la partida. Tras este plazo, se aplica anonimizacion (eliminacion de identificadores del estudiante y UIDs de tarjetas). Los datos agregados anonimos se conservan indefinidamente (Considerando 26 RGPD — datos anonimos no sujetos al RGPD) |
| **Medidas de seguridad** | Acceso restringido al profesor de la sesion, rate limiting en endpoints de analytics, limite de 500 eventos por partida, validacion de entrada |

### 4.3 AT-03: Analytics y metricas de rendimiento

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Proporcionar al profesor analisis agregado del rendimiento de sus alumnos: distribucion por rangos, tendencias temporales, rankings, mapas de calor de actividad y alertas de estudiantes en riesgo academico |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD |
| **Categorias de interesados** | Menores de edad (4-8 anos) |
| **Categorias de datos** | Metricas acumuladas del estudiante (total de partidas jugadas, puntuacion media, mejor puntuacion, aciertos y errores totales, tiempo medio de respuesta, timeouts, partidas abandonadas, ultima partida), identificador seudonimizado en endpoints de analytics |
| **Tratamiento de perfilado** | Este tratamiento implica una evaluacion sistematica de aspectos personales (rendimiento educativo, patrones de respuesta) que, combinada con el tratamiento de datos de menores, justifica la realizacion de una EIPD (Art. 35 RGPD). No se toman decisiones automatizadas con efectos juridicos (Art. 22 RGPD): la interpretacion de los datos es siempre responsabilidad del profesor |
| **Derecho de oposicion (Art. 21 RGPD)** | El tutor legal puede oponerse al tratamiento con fines de analytics de rendimiento sin que ello impida la participacion del alumno en sesiones de juego. Cuando se ejerce este derecho: (1) las metricas agregadas dejan de actualizarse con nuevas partidas, (2) el alumno se excluye de todas las consultas de analytics, (3) el cambio se registra en el historial de consentimiento para trazabilidad |
| **Destinatarios** | Profesor creador (datos de sus alumnos), super_admin (datos agregados). No se comparten con terceros |
| **Transferencias internacionales** | No |
| **Plazo de conservacion** | Metricas vinculadas a estudiantes activos: mientras el consentimiento este vigente. Metricas anonimizadas: indefinidamente |
| **Medidas de seguridad** | Rate limiting especifico para analytics (30 peticiones/minuto), cache Redis con TTL, DTOs que no exponen PII en analytics, acceso restringido por ownership |

### 4.4 AT-04: Autenticacion de profesores

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Gestionar el acceso seguro de profesores y administradores a la plataforma mediante credenciales y tokens JWT |
| **Base legal** | Ejecucion de contrato / interes legitimo del responsable — Art. 6.1.b / Art. 6.1.f RGPD |
| **Categorias de interesados** | Profesores (adultos), super_admins (adultos) |
| **Categorias de datos** | Email, contrasena (hash bcrypt), tokens JWT (access + refresh con JTI), fingerprint del dispositivo (hash SHA-256), ultimo login, estado de cuenta |
| **Destinatarios** | Sistema interno. Los tokens se almacenan en Redis con TTL automatico |
| **Transferencias internacionales** | No |
| **Plazo de conservacion** | Mientras la cuenta este activa. Access tokens: 15 minutos (TTL). Refresh tokens: 30 dias (TTL Redis). Tokens revocados: 24 horas en blacklist Redis |
| **Medidas de seguridad** | Hashing bcrypt (10 rondas de sal), JWT con rotacion y familia de tokens, deteccion de robo de tokens, blacklist Redis para revocacion instantanea, rate limiting estricto en autenticacion (5 intentos/15 minutos), single session enforcement, CSRF double-submit cookie |

### 4.5 AT-05: Logging de seguridad

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Registrar eventos de seguridad (intentos de acceso, errores, anomalias) para la deteccion de incidentes, la trazabilidad de acciones y el cumplimiento del Art. 32 RGPD (seguridad del tratamiento) |
| **Base legal** | Interes legitimo del responsable (Art. 6.1.f RGPD) + obligacion de seguridad (Art. 32 RGPD) |
| **Categorias de interesados** | Profesores (adultos), sistema |
| **Categorias de datos** | Direccion IP del profesor, User-Agent, origen de la peticion, identificador de request, eventos de seguridad (login, logout, token theft, rate limit exceeded) |
| **Datos de menores en logs** | Los logs de seguridad **no contienen** datos identificativos de estudiantes (nombre, aula). Los identificadores de estudiante en logs operativos se registran como pseudoId (hash truncado). Redaccion automatica de: contrasenas, tokens, cabeceras de autorizacion, cookies |
| **Destinatarios** | Equipo de desarrollo (acceso a logs), Sentry (procesador de errores, ver AT-06) |
| **Transferencias internacionales** | Posible, a traves de Sentry (ver AT-06) |
| **Plazo de conservacion** | 12 meses |
| **Medidas de seguridad** | Redaccion automatica de campos sensibles (11 paths en el sistema de logging), sanitizacion de input para prevenir log injection, logging estructurado (JSON), separacion de niveles de severidad |

### 4.6 AT-06: Procesamiento de errores por Sentry

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Capturar errores inesperados del sistema y metricas de rendimiento para diagnostico y mejora continua de la plataforma |
| **Base legal** | Interes legitimo del responsable (Art. 6.1.f RGPD) — garantizar la estabilidad y seguridad del sistema |
| **Relacion contractual** | Sentry actua como encargado del tratamiento (Art. 28 RGPD). La relacion se rige por los terminos de servicio de Sentry que incluyen clausulas de proteccion de datos |
| **Categorias de interesados** | Profesores (adultos). Los errores del sistema pueden contener contexto con identificadores de usuarios |
| **Datos de menores** | La configuracion de Sentry asegura que **no se envian datos PII de estudiantes** en breadcrumbs, contexto de error ni tags. El filtro `beforeSend` redacta nombre del estudiante, nombre del jugador, nombre generico, aula y otros datos identificativos de menores |
| **Transferencias internacionales** | **Si** — Sentry, Inc. tiene sede en EE.UU. La transferencia se ampara en Standard Contractual Clauses (SCCs) segun Art. 46.2.c RGPD, incorporadas en los terminos de servicio de Sentry. La Decision de Ejecucion de la Comision Europea de 10 de julio de 2023 (EU-US Data Privacy Framework) proporciona un marco actualizado para transferencias a entidades certificadas en EE.UU. |
| **Plazo de conservacion** | Segun configuracion de Sentry (por defecto 90 dias para eventos) |
| **Medidas de seguridad** | Filtro `beforeSend` que redacta email y PII de menores (breadcrumbs, extras, tags), circuit breaker para evitar sobrecarga, umbrales de severidad configurables. Sentry es configurable y desactivable: solo se activa si se configuran expresamente las variables de entorno correspondientes |

### 4.7 AT-07: Interaccion RFID en tiempo real

| Campo | Descripcion |
|-------|-------------|
| **Finalidad** | Procesar los escaneos de tarjetas RFID realizados por los estudiantes durante las sesiones de juego, transmitiendo los datos desde el navegador del profesor hasta el backend via WebSocket (Socket.IO) |
| **Base legal** | Consentimiento del titular de la patria potestad o tutela — Art. 6.1.a RGPD |
| **Categorias de interesados** | Menores de edad (4-8 anos) — interactuan fisicamente con las tarjetas RFID |
| **Categorias de datos** | UID de tarjeta RFID, identificador de partida, timestamps de escaneo. Los UIDs de tarjeta son tokens fungibles sin vinculacion directa al menor: la tarjeta se asigna a un valor semantico, no a un alumno |
| **Almacenamiento** | Transitorio en Redis con TTL automatico. Los eventos de escaneo se persisten en los registros de partida (ver AT-02) |
| **Destinatarios** | Sistema interno (WebSocket server). El profesor visualiza el resultado en tiempo real |
| **Transferencias internacionales** | No |
| **Plazo de conservacion** | Estado en Redis: duracion de la sesion de juego (TTL automatico). Eventos persistidos: ver AT-02 |
| **Medidas de seguridad** | WebSocket autenticado (JWT), rate limiting de eventos, validacion de UID (formato hexadecimal), persistencia RFID en Redis para recuperacion ante desconexiones |

### 4.8 Medidas de seguridad transversales

Las siguientes medidas de seguridad se aplican a **todas** las actividades de tratamiento, en cumplimiento del Art. 32 RGPD:

| Medida | Articulo RGPD |
|--------|---------------|
| Cifrado en transito (HTTPS/TLS) | Art. 32.1.a |
| Hashing de contrasenas (bcrypt, 10 rondas de sal) | Art. 32.1.a |
| Control de acceso por roles (RBAC: teacher, student, super_admin) | Art. 32.1.b |
| Autenticacion JWT con rotacion de tokens y deteccion de robo | Art. 32.1.b |
| Rate limiting HTTP (global, auth, creaciones, uploads) y WebSocket | Art. 32.1.b |
| Redaccion automatica de datos sensibles en logs (11 paths) | Art. 25 |
| Token blacklist en Redis para revocacion instantanea | Art. 32.1.d |
| CSRF double-submit cookie | Art. 32.1.a |
| Helmet/CSP, CORS whitelist | Art. 32.1.a |
| DTOs para control de exposicion en respuestas API | Art. 25 |
| Payload guard (proteccion contra prototype pollution y NoSQL injection) | Art. 32.1.a |
| Validacion de entrada con Zod en todas las rutas | Art. 32.1.a |
| Logging estructurado con Pino | Art. 32.1.d |
| Monitorizacion de errores con Sentry | Art. 32.1.d |
| Consentimiento parental obligatorio y verificable | Art. 8 + Art. 7 LOPDGDD |
| Historial de consentimiento con trazabilidad completa | Art. 7.1 |
| Metadata de canal en consentimiento (IP, user-agent, canal) | Art. 7.1 |
| Verificacion de consentimiento activo en creacion de partidas (defense in depth) | Art. 6.1 |
| Operaciones RGPD centralizadas en super_admin (minimo privilegio) | Art. 5.1.f + Art. 32.1.b |
| Audit trail de acceso a datos individuales de estudiantes | Art. 5.2 |
| Derecho de oposicion a analytics de rendimiento | Art. 21 |
| Borrado efectivo (hard delete) con cascada | Art. 17 |
| Politica de retencion con plazos definidos | Art. 5.1.e |

---

## 5. Evaluacion de Impacto en Proteccion de Datos (EIPD)

La Evaluacion de Impacto en Proteccion de Datos (EIPD) es el instrumento previsto por el Art. 35 del RGPD para analizar los riesgos que un tratamiento de datos entraña para los derechos y libertades de los interesados, y para determinar las medidas necesarias para mitigar dichos riesgos hasta un nivel aceptable.

### 5.1 Justificacion de obligatoriedad

El Art. 35.1 del RGPD establece que el responsable del tratamiento debe realizar una EIPD cuando un tipo de tratamiento *«entrane un alto riesgo para los derechos y libertades de las personas fisicas»*. La AEPD, en cumplimiento del Art. 35.4 RGPD, publico en 2019 la lista de tipos de tratamiento que requieren EIPD, estableciendo que esta es **obligatoria** cuando el tratamiento cumple **dos o mas** de los criterios enumerados.

La plataforma Eduplay cumple los siguientes criterios:

| Criterio AEPD | Aplicabilidad en Eduplay |
|----------------|--------------------------|
| **Criterio 5: Datos de sujetos vulnerables** | Los interesados son **menores de 4 a 8 anos**, colectivo expresamente reconocido como vulnerable por el Considerando 38 del RGPD y por la AEPD en su Guia para Centros Educativos |
| **Criterio 3: Evaluacion o puntuacion** | La plataforma realiza una **evaluacion sistematica** del rendimiento educativo de los menores: puntuaciones, tiempos de respuesta, patrones de acierto/error, metricas agregadas y clasificacion por rangos de rendimiento |

El cumplimiento de al menos dos criterios hace obligatoria la realizacion de esta EIPD. Adicionalmente, las Directrices del Grupo de Trabajo del Art. 29 (WP 248 rev.01, adoptadas por el EDPB) senalan que el tratamiento de datos de menores, por su condicion de sujetos especialmente vulnerables, justifica por si solo una evaluacion de impacto reforzada.

### 5.2 Evaluacion de necesidad y proporcionalidad

La evaluacion de necesidad y proporcionalidad, requerida por el Art. 35.7.b) del RGPD, verifica que el tratamiento es el minimo necesario para alcanzar sus finalidades.

**Justificacion de cada tipo de dato recogido:**

| Dato | Necesidad | Justificacion |
|------|-----------|---------------|
| Nombre del alumno | Alta | Imprescindible para la identificacion por el profesor y la intervencion pedagogica |
| Edad | Media | Permite contextualizar el rendimiento segun el grupo de edad. Se almacena como entero, no como fecha de nacimiento |
| Aula | Alta | Necesaria para la organizacion de alumnos por grupos. El profesor gestiona multiples aulas |
| Avatar | Baja | Elemento opcional de personalizacion visual. No se recoge por defecto |
| Puntuacion | Alta | Dato central del seguimiento pedagogico |
| Metricas de partida | Alta | Diagnostico pedagogico: distinguir patrones de aprendizaje |
| Eventos de interaccion | Media | Detalle granular con utilidad decreciente en el tiempo. Politica de retencion de 12 meses |
| Tiempos de respuesta | Media | Indicador de dificultad. Proteccion reforzada por potencial sensibilidad |
| UID de tarjeta RFID | Baja tras la partida | Necesario durante la partida; fungible despues |
| Metricas agregadas | Alta | Seguimiento longitudinal sin recalcular desde partidas individuales |

**Adecuacion de la base legal:**

El consentimiento parental es la base legal mas apropiada por las siguientes razones:

1. Los alumnos tienen entre 4 y 8 anos, muy por debajo del umbral de 14 anos del Art. 7 LOPDGDD.
2. Eduplay es una plataforma externa complementaria, no un componente esencial del sistema educativo formal. La AEPD distingue entre actividades propias de la funcion docente y el uso de plataformas externas.
3. El consentimiento maximiza el control parental, coherente con la proteccion reforzada del RGPD para menores.
4. La plataforma implementa un mecanismo de registro verificable que cumple el Art. 7.1 RGPD.
5. El consentimiento puede ser retirado en cualquier momento (Art. 7.3 RGPD), desencadenando el borrado efectivo.

**Proporcionalidad del tratamiento:**

1. Solo se recogen datos necesarios, con cada campo vinculado a una necesidad funcional documentada.
2. Los datos tienen plazos de conservacion definidos (eventos: 12 meses; cuentas inactivas: 24 meses; tokens: TTL automatico).
3. El acceso esta restringido por ownership: cada profesor solo accede a datos de sus propios alumnos.
4. Existen mecanismos tecnicos para ejercer los derechos de supresion, portabilidad y acceso.
5. No se toman decisiones automatizadas con efectos juridicos: la clasificacion por rangos es una ayuda visual, no una decision en el sentido del Art. 22 RGPD.

### 5.3 Matriz de riesgos

La evaluacion de riesgos sigue la metodologia recomendada por el EDPB en las Directrices WP 248 rev.01, combinada con el enfoque de la AEPD en su Guia practica para las evaluaciones de impacto (2021).

**Escala de probabilidad:** Baja (improbable dadas las medidas existentes), Media (posible, con incidentes similares documentados en plataformas comparables), Alta (probable sin medidas adicionales).

**Escala de impacto:** Bajo (inconveniente menor superable sin dificultad), Medio (dificultades significativas superables con esfuerzo), Alto (consecuencias significativas dificiles de superar), Muy Alto (consecuencias irreversibles o muy dificiles de superar).

| ID | Riesgo | Prob. | Impacto | Nivel |
|----|--------|-------|---------|-------|
| R-01 | Re-identificacion de menores en aulas pequenas | Media | Alto | **Alto** |
| R-02 | Acceso no autorizado a datos de rendimiento educativo | Baja | Alto | **Medio** |
| R-03 | Retencion indefinida de datos sin base legal vigente | Media | Medio | **Medio** |
| R-04 | Ausencia de consentimiento parental verificable | Alta | Alto | **Critico** |
| R-05 | Fuga de PII de menores en logs de aplicacion | Media | Alto | **Alto** |
| R-06 | Transferencia internacional a Sentry sin garantias documentadas | Media | Medio | **Medio** |
| R-07 | Imposibilidad de ejercer derecho de supresion (solo soft delete) | Alta | Alto | **Critico** |
| R-08 | Imposibilidad de ejercer derecho de portabilidad | Media | Medio | **Medio** |
| R-09 | Perfilado inadvertido de capacidades cognitivas de menores | Media | Alto | **Alto** |
| R-10 | Brecha de seguridad con exposicion masiva de datos de menores | Baja | Muy Alto | **Alto** |
| R-11 | Uso indebido de datos analiticos por profesor no autorizado | Baja | Alto | **Medio** |
| R-12 | Perdida de datos por fallo tecnico sin backup verificado | Baja | Medio | **Bajo** |

### 5.4 Medidas de mitigacion y riesgo residual

Para cada riesgo identificado, se han implementado medidas de mitigacion especificas. La siguiente tabla resume el nivel de riesgo original, las medidas principales aplicadas y el nivel residual resultante:

| ID | Riesgo | Nivel original | Medidas principales | Nivel residual |
|----|--------|----------------|---------------------|----------------|
| R-01 | Re-identificacion en aulas pequenas | Alto | Eliminacion de fecha de nacimiento, seudonimizacion en analytics, separacion PII/analytics en DTOs, anonimizacion diferida de eventos, k-anonimidad (k=5) | **Bajo** |
| R-02 | Acceso no autorizado a rendimiento | Medio | RBAC, validacion de ownership, JWT con rotacion y deteccion de robo, rate limiting, validacion de entrada con Zod, proteccion contra NoSQL injection, Helmet/CSP/CORS | **Bajo** |
| R-03 | Retencion indefinida sin base legal | Medio | Politica de retencion con plazos definidos (12 meses eventos, 24 meses cuentas), script de retencion automatica, anonimizacion diferida, documentacion en RAT | **Bajo** |
| R-04 | Ausencia de consentimiento verificable | Critico | Registro tecnico de consentimiento en modelo de datos, validacion obligatoria al crear estudiante, registro del otorgante/fecha/finalidades, historial de consentimiento | **Bajo** |
| R-05 | Fuga de PII en logs | Alto | Redaccion automatica de 11 paths en Pino, seudonimizacion de identificadores de estudiantes, prohibicion de datos identificativos en logs de seguridad, filtro beforeSend en Sentry | **Bajo** |
| R-06 | Transferencia internacional a Sentry | Medio | Filtro beforeSend que redacta PII, Sentry configurable y desactivable, documentacion formal de la transferencia bajo SCCs y EU-US Data Privacy Framework | **Bajo** |
| R-07 | Imposibilidad de supresion efectiva | Critico | Borrado efectivo (hard delete) con cascada completa (User, GamePlays, tokens Redis, WebSocket), confirmacion explicita, registro de la accion, mantenimiento del soft delete como operacion separada | **Bajo** |
| R-08 | Imposibilidad de portabilidad | Medio | Endpoint de exportacion de datos en formato JSON estructurado, acceso restringido a super_admin y profesor propietario | **Bajo** |
| R-09 | Perfilado inadvertido de capacidades | Alto | No se toman decisiones automatizadas con efectos juridicos, datos no compartidos con terceros, anonimizacion temporal de datos granulares (12 meses) | **Medio** |
| R-10 | Brecha de seguridad masiva | Alto | Cifrado en transito, autenticacion en bases de datos, CSRF, rate limiting, DTOs, validacion de entrada, minimizacion de datos almacenados, monitorizacion con Sentry y logging estructurado | **Bajo** |
| R-11 | Uso indebido por profesor no autorizado | Medio | Validacion de ownership en todos los endpoints, rate limiting, audit trail de acceso, validacion de ObjectId | **Bajo** |
| R-12 | Perdida de datos por fallo tecnico | Bajo | Docker Compose con volumenes persistentes | **Bajo** |

**Riesgo residual global:** Tras la aplicacion de las medidas de mitigacion, 11 de los 12 riesgos se situan en nivel **Bajo**. El unico riesgo con nivel residual **Medio** (R-09, perfilado inadvertido) es inherente a cualquier sistema de seguimiento pedagogico y se mitiga con medidas organizativas de informacion al profesor. La interpretacion de los datos y las decisiones pedagogicas son siempre responsabilidad del profesor humano, no del sistema.

**Dictamen:** El tratamiento de datos personales de menores realizado por la plataforma Eduplay es **viable** siempre que se implementen y mantengan las medidas de mitigacion descritas. El tratamiento es necesario y proporcionado, la base legal es adecuada, los riesgos estan mitigados a niveles aceptables, se garantizan los derechos del interesado mediante mecanismos tecnicos y se materializan los principios del RGPD en medidas concretas.

---

## 6. Medidas tecnicas implementadas

Esta seccion describe las medidas tecnicas implementadas en la plataforma para garantizar la proteccion de los datos personales de los menores. Para cada medida se expone que es, por que es necesaria (con su fundamentacion legal) y que se consigue con su implementacion.

### 6.1 Minimizacion de datos

**Fundamentacion legal:** Art. 5.1.c RGPD — Los datos deben ser *«adecuados, pertinentes y limitados a lo necesario en relacion con los fines para los que son tratados»*. Art. 25 RGPD — proteccion de datos desde el diseno y por defecto.

**Que es:** Un conjunto de medidas que garantizan que la plataforma solo recoge y almacena los datos estrictamente necesarios para su funcion educativa, eliminando activamente los campos que presentan un riesgo identificativo desproporcionado respecto a su utilidad pedagogica.

**Medidas implementadas:**

1. **Eliminacion del campo de fecha de nacimiento:** Se ha eliminado el campo `profile.birthdate` del modelo de datos de estudiantes, conservando unicamente la edad como numero entero (`profile.age`). La fecha de nacimiento completa tiene un potencial identificativo significativamente mayor que la edad simple: un menor de 5 anos nacido el 15 de marzo de 2021 es identificable en un aula de 20 alumnos, mientras que un menor de «5 anos» en la misma aula tiene un riesgo de identificacion considerablemente menor.

2. **Eliminacion del campo de ultimo login para estudiantes:** Se ha eliminado el registro de la fecha del ultimo inicio de sesion para usuarios con rol de estudiante, dado que los alumnos no inician sesion en la plataforma (su interaccion se canaliza a traves del profesor).

3. **Validacion en el modelo de datos:** El modelo incluye una validacion pre-guardado que impide que un usuario con rol de estudiante tenga almacenada una fecha de nacimiento. Esta validacion actua como salvaguarda contra regresiones en el codigo que pudieran reintroducir este campo.

4. **Script de migracion:** Se ha desarrollado un script de migracion que convierte las fechas de nacimiento existentes en edades y elimina el campo original, garantizando que los datos historicos tambien se ajustan al principio de minimizacion.

**Que se consigue:** Reduccion de la superficie de datos personales almacenados, disminucion del riesgo de re-identificacion, y cumplimiento demostrable del principio de minimizacion. En caso de una hipotetica brecha de datos, la informacion expuesta es significativamente menos identificativa.

### 6.2 Consentimiento parental verificable

**Fundamentacion legal:** Art. 8 RGPD — Consentimiento del menor en relacion con los servicios de la sociedad de la informacion. Art. 7 LOPDGDD — Edad minima de 14 anos en Espana para consentimiento propio. Art. 7.1 RGPD — El responsable debe ser capaz de **demostrar** que el interesado consintio el tratamiento.

**Que es:** Un mecanismo tecnico integrado en el modelo de datos que registra, verifica y audita el consentimiento parental en todo el ciclo de vida del estudiante en la plataforma.

**Medidas implementadas:**

1. **Objeto de consentimiento en el modelo de datos:** Cada estudiante tiene un objeto `consent` que registra: si se ha otorgado el consentimiento (`granted`), quien lo otorgo (`grantedBy`), cuando (`grantedAt`), para que finalidades (`purposes[]`), la version de la politica de privacidad aceptada (`policyVersion`), el canal por el que se obtuvo (`channel`), la direccion IP (`ipAddress`) y el agente de usuario (`userAgent`).

2. **Historial de consentimiento:** Un array `consentHistory[]` almacena el registro completo de todos los otorgamientos y revocaciones de consentimiento, proporcionando una trazabilidad auditora completa que cumple el Art. 7.1 RGPD. Cada entrada del historial incluye la accion realizada (otorgamiento, revocacion), la fecha, el responsable y los metadatos del canal.

3. **Bloqueo de creacion sin consentimiento:** La API rechaza la creacion de un estudiante si el campo `consent.granted` no es `true`. Sin consentimiento parental registrado, no es posible dar de alta a un alumno en la plataforma.

4. **Endpoint de gestion de consentimiento:** Un endpoint PATCH permite otorgar o revocar el consentimiento, actualizando el objeto `consent` y anadiendo una entrada al historial. La revocacion del consentimiento desencadena automaticamente las acciones correspondientes (exclusion de analytics, posibilidad de borrado efectivo).

5. **Centralizacion en super_admin:** Todas las operaciones de gestion de consentimiento estan centralizadas en el rol super_admin, que representa al responsable del tratamiento en el centro educativo (direccion del centro). Los profesores no gestionan el consentimiento directamente, sino que acceden a los datos una vez que el consentimiento ha sido otorgado. Esta decision se alinea con el modelo organizativo real de los centros educativos espanoles.

6. **Metadata de canal para prueba de consentimiento:** El registro incluye la direccion IP, el agente de usuario y el canal por el que se obtuvo el consentimiento. Estos metadatos proporcionan evidencia tecnica del momento y las circunstancias en que se otorgo el consentimiento, cumpliendo la carga de la prueba que el Art. 7.1 RGPD impone al responsable.

**Que se consigue:** Cumplimiento del Art. 8 RGPD y Art. 7 LOPDGDD con un mecanismo tecnico verificable. El responsable del tratamiento puede demostrar en cualquier momento que se obtuvo el consentimiento parental, quien lo otorgo, cuando, para que finalidades y en que circunstancias. El historial de consentimiento proporciona una auditoria completa de los cambios.

### 6.3 Derecho de oposicion a analytics

**Fundamentacion legal:** Art. 21 RGPD — Derecho de oposicion. El interesado tiene derecho a oponerse en cualquier momento al tratamiento de sus datos personales por motivos relacionados con su situacion particular.

**Que es:** Un mecanismo que permite a los tutores legales oponerse al tratamiento de los datos de su hijo con fines de analytics de rendimiento, sin que ello impida la participacion del alumno en las sesiones de juego.

**Medidas implementadas:**

1. **Finalidades granulares de consentimiento:** El campo `consent.purposes[]` distingue entre dos finalidades independientes: `educational_tracking` (seguimiento educativo basico, necesario para la funcionalidad del juego) y `performance_analytics` (analytics de rendimiento, estadisticas avanzadas, rankings). Un tutor puede revocar el consentimiento para analytics manteniendo el consentimiento para el seguimiento educativo.

2. **Exclusion efectiva de analytics:** Cuando un estudiante tiene revocado el consentimiento para `performance_analytics`, sus metricas agregadas dejan de actualizarse con nuevas partidas y se excluye de todas las consultas de analytics (distribucion, tendencias, rankings, alertas).

3. **Servicio centralizado de verificacion de consentimiento:** Un servicio dedicado centraliza toda la logica de verificacion de consentimiento, garantizando que la comprobacion se aplica de forma consistente en todos los endpoints que acceden a datos de estudiantes.

4. **Registro en historial de consentimiento:** Cada cambio en las finalidades de consentimiento se registra en el historial para trazabilidad.

**Que se consigue:** Cumplimiento del Art. 21 RGPD con granularidad suficiente para no penalizar al alumno que desea seguir jugando pero cuyos tutores se oponen al perfilado analitico. La separacion de finalidades garantiza que el ejercicio del derecho de oposicion no impide la funcionalidad educativa basica.

### 6.4 Seudonimizacion

**Fundamentacion legal:** Art. 25 RGPD — Proteccion de datos desde el diseno y por defecto. Directrices 01/2025 del EDPB sobre seudonimizacion — Reconocen las funciones hash como tecnica valida de seudonimizacion.

**Que es:** La transformacion de los identificadores de estudiantes en valores hash irreversibles (pseudoIds) en contextos donde no es necesario acceder a la identidad real del menor, como los logs de seguridad y los endpoints de analytics.

**Medidas implementadas:**

1. **Funcion de seudonimizacion:** Se ha implementado una utilidad que genera un hash SHA-256 truncado a 8 caracteres hexadecimales del identificador original del estudiante. La truncatura reduce la precision del hash sin eliminar su utilidad como identificador consistente (el mismo input genera siempre el mismo pseudoId).

2. **Aplicacion en logs de seguridad:** Todos los logs operativos que referencian a estudiantes utilizan el pseudoId en lugar del identificador real. Si un log registra una operacion sobre un estudiante, contiene el pseudoId `"a1b2c3d4"` en lugar del nombre o identificador directo.

3. **Aplicacion en endpoints de analytics:** Los DTOs de analytics retornan el pseudoId del estudiante en lugar del identificador directo. La resolucion nombre-pseudoId se realiza unicamente en la capa de presentacion del dashboard del profesor autorizado.

4. **Separacion de datos identificativos y analiticos en DTOs:** Los DTOs de analytics no incluyen datos identificativos del estudiante. Si se comprometiese el subsistema de analytics, los datos expuestos no permitirian identificar a los menores directamente.

**Que se consigue:** Los datos de rendimiento educativo pueden procesarse y analizarse sin necesidad de acceder a la identidad real del menor. En caso de una brecha limitada al subsistema de analytics o a los logs, los datos expuestos no contienen informacion directamente identificativa. La decision de utilizar seudonimizacion en lugar de anonimizacion completa para datos operativos responde a una necesidad funcional: el profesor debe poder identificar a sus alumnos para intervenir pedagogicamente, lo cual requiere que la seudonimizacion sea reversible con la tabla de correspondencia adecuada (accesible solo al profesor autorizado).

### 6.5 k-anonimidad en aulas pequenas

**Fundamentacion legal:** Art. 25 RGPD — Proteccion de datos desde el diseno. Guia basica de anonimizacion de la AEPD (2019) — Recomienda valores de k de al menos 5 para conjuntos de datos sensibles.

**Que es:** Un mecanismo que protege la privacidad de los estudiantes en grupos pequenos, donde la combinacion de quasi-identificadores (edad, aula, patrones de rendimiento) podria permitir la re-identificacion individual incluso con datos seudonimizados.

**Medidas implementadas:**

1. **Umbral de grupo minimo:** Se establece una constante de configuracion `MIN_ANALYTICS_GROUP_SIZE = 5` que define el tamano minimo de grupo por debajo del cual se aplican restricciones adicionales.

2. **Respuesta agregada para grupos pequenos:** Cuando un endpoint de analytics recibe una consulta sobre un grupo de menos de 5 estudiantes, en lugar de devolver datos individuales por estudiante, devuelve unicamente metricas agregadas del grupo: numero total de estudiantes, media de puntuacion, total de partidas y distribucion por niveles de rendimiento. La respuesta incluye un campo explicativo indicando que se aplica proteccion de k-anonimidad.

3. **Referencia academica y normativa:** El umbral k=5 se fundamenta en la Guia de Anonimizacion de la AEPD (2019), que recomienda al menos k=5 para datos sensibles, y en la investigacion academica de Sweeney (2002) sobre modelos de proteccion de privacidad. Se ha descartado k=3 como insuficiente segun las recomendaciones de la AEPD y k=10 como excesivamente restrictivo para aulas reales espanolas (tipicamente 15-25 alumnos).

**Que se consigue:** Proteccion efectiva contra la re-identificacion en grupos pequenos. El profesor conserva una vision general del progreso del grupo sin que los datos permitan distinguir a cada alumno individualmente. Esta medida protege especialmente contra escenarios como la comparticion involuntaria de pantalla o el acceso no autorizado al endpoint.

### 6.6 Borrado efectivo

**Fundamentacion legal:** Art. 17 RGPD — Derecho de supresion. Considerando 65 — Este derecho es *«pertinente en particular cuando el interesado dio su consentimiento siendo nino y no era plenamente consciente de los riesgos que implicaba el tratamiento»*.

**Que es:** Un mecanismo de eliminacion permanente e irreversible de todos los datos de un estudiante, distinto del soft delete (desactivacion reversible de la cuenta) que se mantiene como operacion separada.

**Medidas implementadas:**

1. **Endpoint de borrado efectivo:** Un endpoint `DELETE /api/users/:id/data` realiza la eliminacion permanente de todos los datos del estudiante con una cascada completa: documento de usuario, todas las partidas asociadas, tokens de sesion en Redis y desconexion de WebSockets activos.

2. **Confirmacion explicita:** La operacion requiere un parametro de confirmacion explicita (`confirmDeletion: true`) en el cuerpo de la peticion. El frontend muestra un dialogo de confirmacion que advierte claramente de la irreversibilidad de la accion.

3. **Acceso restringido:** Solo el super_admin puede ejecutar el borrado efectivo, en coherencia con la centralizacion de las operaciones RGPD. La validacion de ownership actua como capa adicional de defensa en profundidad.

4. **Registro de la accion:** Se registra un evento de seguridad `DATA_HARD_DELETE` sin incluir PII del estudiante eliminado, documentando que se ejercio el derecho de supresion, cuando y por quien. Este registro permite demostrar el cumplimiento del Art. 17 sin conservar los datos eliminados.

5. **Mantenimiento del soft delete como operacion separada:** El soft delete (cambio de estado a inactivo) se mantiene como mecanismo de desactivacion reversible. El borrado efectivo es una operacion distinta, explicita e irreversible. Esta dualidad permite gestionar la desactivacion temporal de cuentas (por ejemplo, durante vacaciones) sin confundirla con el ejercicio del derecho de supresion.

**Que se consigue:** Cumplimiento pleno del Art. 17 RGPD, incluyendo la especial relevancia del derecho de supresion para datos recogidos de menores (Considerando 65). La cascada completa garantiza que no quedan datos residuales del estudiante en ningun almacen del sistema.

### 6.7 Politica de retencion

**Fundamentacion legal:** Art. 5.1.e RGPD — Los datos deben conservarse *«durante no mas tiempo del necesario para los fines del tratamiento»*. Considerando 26 — Los principios de proteccion de datos no se aplican a informacion anonima.

**Que es:** Un sistema de gestion del ciclo de vida de los datos que aplica plazos de retencion definidos y ejecuta automaticamente la limpieza o anonimizacion de los datos que superan dichos plazos.

**Medidas implementadas:**

1. **Plazos de retencion definidos:**

| Categoria de datos | Periodo | Accion al vencer |
|---------------------|---------|-------------------|
| Eventos detallados de partida | 12 meses desde la partida | Anonimizacion (eliminacion de identificador del estudiante y UID de tarjeta) |
| Cuentas de estudiantes inactivas | 24 meses sin actividad | Borrado efectivo automatico |
| Tokens de refresco | 30 dias | Eliminacion automatica (TTL Redis) |
| Logs de seguridad | 12 meses | Eliminacion |

2. **Script de retencion automatica:** Se ha implementado un script ejecutable (`npm run data:retention`) que aplica los plazos de retencion y genera un informe detallado de las acciones realizadas. El script admite un modo de simulacion (`--dry-run`) que permite verificar que acciones se ejecutarian sin modificar datos reales.

3. **Anonimizacion diferida de datos historicos:** En lugar de eliminar las partidas completas al vencer el periodo de retencion, se aplica un enfoque de anonimizacion diferida: se eliminan los campos que vinculan la partida con un estudiante concreto (identificador del jugador, UIDs de tarjeta), conservando las metricas agregadas anonimas (puntuacion, precision, tiempo de respuesta). Los datos agregados anonimos conservan valor estadistico (el profesor puede ver tendencias historicas de su aula sin identificar individuos) y quedan fuera del ambito del RGPD conforme al Considerando 26, que establece que los principios de proteccion de datos no se aplican a informacion anonima.

4. **Configuracion centralizada:** Los plazos de retencion, el umbral de k-anonimidad y otros parametros de proteccion de datos se definen en un archivo de configuracion centralizado, facilitando su revision y actualizacion.

**Que se consigue:** Cumplimiento del principio de limitacion del plazo de conservacion (Art. 5.1.e). Los datos no se acumulan indefinidamente, reduciendo el impacto potencial de una brecha de seguridad y manteniendo la base de datos limpia de datos obsoletos.

### 6.8 Exportacion de datos y portabilidad

**Fundamentacion legal:** Art. 20 RGPD — El interesado tiene derecho a recibir los datos personales en un *«formato estructurado, de uso comun y lectura mecanica»*.

**Que es:** Un endpoint que permite exportar la totalidad de los datos personales de un estudiante en formato JSON estructurado, cumpliendo el requisito de portabilidad del RGPD.

**Medidas implementadas:**

1. **Endpoint de exportacion:** `GET /api/users/:id/export-data` retorna todos los datos personales del estudiante organizados en secciones: perfil (nombre, edad, aula, avatar), estado del consentimiento (actual e historial completo), metricas agregadas de rendimiento e historial completo de partidas.

2. **Formato estructurado:** La exportacion se realiza en formato JSON, que cumple con el requisito del Art. 20 RGPD de formato estructurado, de uso comun y lectura mecanica. El objeto incluye metadatos (fecha de exportacion, version del formato) que facilitan la trazabilidad.

3. **Acceso restringido:** Solo el super_admin o el profesor propietario del alumno pueden ejecutar la exportacion, previniendo el acceso no autorizado a datos completos del menor. El endpoint esta protegido por rate limiting para prevenir la extraccion masiva.

**Que se consigue:** Cumplimiento del derecho de portabilidad (Art. 20 RGPD). Los tutores legales pueden obtener una copia completa y estructurada de todos los datos de su hijo, facilitando la migracion a otra plataforma educativa si asi lo desean.

### 6.9 Filtrado de PII en Sentry

**Fundamentacion legal:** Art. 25 RGPD — Proteccion de datos desde el diseno. Art. 28 RGPD — Obligaciones del encargado del tratamiento. Art. 46.2.c RGPD — Standard Contractual Clauses para transferencias internacionales.

**Que es:** Un sistema de filtrado que garantiza que los datos de identificacion personal de los menores no se transmiten al servicio externo de monitorizacion de errores (Sentry), que opera desde Estados Unidos.

**Medidas implementadas:**

1. **Filtro beforeSend:** Un hook de procesamiento previo al envio intercepta cada evento de error antes de transmitirlo a Sentry y elimina automaticamente: email, contrasena, tokens, cookies. Adicionalmente, se eliminan de breadcrumbs, extras y tags los datos identificativos de menores: nombre del estudiante, nombre del jugador, nombre generico, aula y otros campos sensibles.

2. **Sentry configurable y desactivable:** El servicio solo se activa si se configuran expresamente las variables de entorno correspondientes. En caso de duda sobre las garantias de la transferencia, se puede desactivar completamente sin afectar la funcionalidad de la plataforma.

3. **Documentacion de la transferencia internacional:** La transferencia de datos a Sentry se documenta formalmente, identificando el mecanismo de transferencia aplicable: Standard Contractual Clauses (Art. 46.2.c RGPD) incorporadas en los terminos de servicio de Sentry, y la Decision de Adecuacion de la Comision Europea (EU-US Data Privacy Framework, Decision de 10 de julio de 2023). Se ha verificado que Sentry esta acogida al marco correspondiente.

**Que se consigue:** Minimizacion de datos transferidos internacionalmente, con garantia de que los datos de identificacion personal de menores no abandonan el perimetro de la plataforma. La documentacion formal de la transferencia cumple las obligaciones del Capitulo V del RGPD, teniendo en cuenta los requisitos reforzados establecidos por la sentencia Schrems II del TJUE (C-311/18, 16 de julio de 2020).

### 6.10 Logging de seguridad con redaccion de PII

**Fundamentacion legal:** Art. 32 RGPD — Seguridad del tratamiento (capacidad de deteccion de incidentes). Art. 25 RGPD — Proteccion de datos desde el diseno (minimizacion en logs).

**Que es:** Un sistema de logging estructurado que registra eventos de seguridad para la deteccion de incidentes, garantizando al mismo tiempo que los datos de identificacion personal de menores no se incluyen en los registros.

**Medidas implementadas:**

1. **Redaccion automatica de campos sensibles:** El sistema de logging (Pino) tiene configurados 11 paths de redaccion que eliminan automaticamente de los logs: contrasenas, tokens, cabeceras de autorizacion, cookies y otros campos sensibles.

2. **Conjunto de claves sensibles:** Se mantiene un conjunto de claves sensibles que incluye `classroom` como quasi-identificador, garantizando que este campo no aparece en logs incluso si se incluye accidentalmente en el contexto de un error.

3. **Eventos de seguridad especificos del RGPD:** Se han definido eventos de seguridad especificos para las operaciones de proteccion de datos: `DATA_CONSENT_CHANGE` (cambio en consentimiento), `DATA_HARD_DELETE` (borrado efectivo), `DATA_RETENTION_EXECUTED` (ejecucion de politica de retencion), `DATA_RECTIFICATION` (rectificacion de datos), `DATA_ACCESS` (acceso a datos individuales) y `DATA_EXPORT` (exportacion de datos). Estos eventos permiten la trazabilidad de las operaciones RGPD sin incluir PII del estudiante afectado.

4. **Prohibicion de datos identificativos de estudiantes en logs de seguridad:** Los logs de seguridad no registran nombres ni aulas de estudiantes. Los identificadores se registran como pseudoId (hash truncado), impidiendo la asociacion directa con el menor.

**Que se consigue:** Capacidad de deteccion de incidentes y trazabilidad de operaciones RGPD sin comprometer la privacidad de los menores. Los logs proporcionan la informacion necesaria para el diagnostico tecnico y la auditoria de cumplimiento sin contener datos que permitan identificar a un estudiante concreto.

### 6.11 Verificacion de consentimiento en gameplay

**Fundamentacion legal:** Art. 6.1 RGPD — Licitud del tratamiento (el consentimiento debe estar vigente en el momento del tratamiento). Principio de defensa en profundidad.

**Que es:** Una comprobacion adicional que verifica que el consentimiento parental sigue vigente en el momento de crear una nueva partida, actuando como capa de defensa en profundidad mas alla de la validacion inicial al crear el estudiante.

**Medidas implementadas:**

1. **Verificacion en el servicio de partidas:** El servicio responsable de la creacion de partidas verifica el campo `consent.granted` del estudiante antes de permitir la creacion de una nueva partida. Si el consentimiento ha sido revocado, la partida no se crea.

2. **Servicio centralizado de consentimiento:** Un servicio dedicado centraliza toda la logica de verificacion de consentimiento, garantizando que la comprobacion es consistente en todos los puntos del sistema que acceden a datos de estudiantes.

3. **Revocacion de tokens al retirar consentimiento:** Cuando se revoca el consentimiento de un estudiante, los tokens de sesion asociados se invalidan en Redis, garantizando que no se pueden realizar operaciones adicionales con datos del estudiante tras la revocacion.

**Que se consigue:** Garantia de que no se generan nuevos datos de un estudiante cuyo consentimiento ha sido retirado, incluso si la revocacion se produce entre la creacion del estudiante y una partida posterior. Esta defensa en profundidad protege contra escenarios de condicion de carrera o retrasos en la propagacion de la revocacion.

### 6.12 Auditoria automatizada de datos

**Fundamentacion legal:** Art. 5.2 RGPD — Responsabilidad proactiva. El responsable debe ser capaz de demostrar el cumplimiento de los principios de proteccion de datos.

**Que es:** Un script de auditoria automatizada que analiza el estado de los datos personales en la base de datos y genera un informe de cumplimiento.

**Medidas implementadas:**

1. **Script de auditoria de datos:** Un script ejecutable (`npm run data:audit`) realiza una clasificacion de PII en los modelos de datos, genera metricas de cumplimiento y detecta anomalias: fechas de nacimiento presentes (que deberian ser 0 tras la migracion), estudiantes sin consentimiento registrado, partidas candidatas a anonimizacion segun la politica de retencion.

2. **Codigos de salida para integracion CI/CD:** El script retorna codigos de salida que permiten su integracion en pipelines de integracion continua, facilitando la deteccion temprana de regresiones en el cumplimiento.

**Que se consigue:** Verificacion automatizada y continua del cumplimiento de los principios de proteccion de datos. La responsabilidad proactiva (Art. 5.2) se materializa en un mecanismo tecnico que no depende de la revision manual, sino que puede ejecutarse de forma periodica o como parte del proceso de desarrollo.

---

## 7. Medidas organizativas y documentales

### 7.1 Protocolo de notificacion de brechas

**Fundamentacion legal:** Art. 33 RGPD — Notificacion de una violacion de seguridad a la autoridad de control (maximo 72 horas). Art. 34 RGPD — Comunicacion de una violacion de seguridad al interesado (cuando entrane alto riesgo). Art. 73.a LOPDGDD — Infraccion por no notificar brechas.

**Que es:** Un procedimiento documentado para la deteccion, evaluacion, contencion y notificacion de brechas de seguridad que afecten a datos personales, con especial atencion a los datos de menores.

**Procedimiento de respuesta (timeline de 72 horas):**

**Fase 1 — Deteccion (Hora 0):** La brecha puede detectarse a traves de multiples mecanismos: monitorizacion de errores (Sentry), eventos del logger de seguridad (deteccion de robo de tokens, exceso de rate limiting), logs de auditoria (patrones de acceso inusuales), notificacion externa de un usuario o centro educativo, o alertas de infraestructura.

**Fase 2 — Contencion inmediata (Horas 0-4):**
1. Aislar el sistema afectado si es necesario.
2. Revocar credenciales comprometidas (revocacion global de tokens).
3. Preservar evidencia: no borrar logs, capturar estado del sistema.
4. Activar el equipo de respuesta y notificar al responsable del tratamiento.

**Fase 3 — Evaluacion del impacto (Horas 4-24):** Determinar que datos se han visto afectados, si se trata de datos de menores, cuantos interesados se ven afectados, si se han exfiltrado datos y que medidas de seguridad estaban implementadas. **Regla general para Eduplay:** Si datos de menores estan involucrados, el riesgo es al menos Alto y la notificacion a la autoridad de control es obligatoria.

**Fase 4 — Notificacion a la AEPD (Horas 24-72):** Conforme al Art. 33.3 RGPD, la notificacion debe incluir: naturaleza de la violacion (categorias de interesados y datos afectados, numero aproximado), nombre y datos de contacto del punto de contacto, consecuencias probables, y medidas adoptadas o propuestas para remediar la violacion y mitigar sus efectos.

**Fase 5 — Notificacion a padres/tutores legales (Art. 34 RGPD):** Cuando la violacion entrane un alto riesgo para los derechos y libertades de los interesados — lo que se presume en la mayoria de escenarios que involucran datos de menores — se debe comunicar la brecha a los padres o tutores legales en un lenguaje accesible para no tecnicos, incluyendo: descripcion de lo ocurrido, datos afectados, medidas adoptadas y recomendaciones para los afectados.

**Plantilla de notificacion a la AEPD:** Se ha elaborado una plantilla que contiene todos los campos exigidos por el Art. 33.3, incluyendo categorias de interesados (menores de 4-8 anos), categorias de datos afectados, medidas de proteccion que estaban implementadas (seudonimizacion, k-anonimidad, RBAC) y medidas adoptadas para remediar la situacion.

**Plantilla de notificacion a padres/tutores:** Se ha elaborado una plantilla en lenguaje accesible que informa a las familias sobre lo ocurrido, los datos afectados, las medidas adoptadas y las acciones que pueden emprender (incluyendo el ejercicio del derecho de supresion conforme al Art. 17 RGPD).

**Registro de incidentes (Art. 33.5):** Independientemente de si se notifica a la AEPD, toda brecha debe documentarse en un registro interno que incluya los hechos relativos a la violacion, los efectos, las medidas correctivas adoptadas y la justificacion de la decision de notificar o no. Este registro se mantiene a disposicion de la autoridad de control.

**Que se consigue:** Capacidad de respuesta estructurada ante incidentes de seguridad, cumplimiento de los plazos legales de notificacion (72 horas), proteccion reforzada de los menores mediante la presuncion de alto riesgo cuando sus datos estan involucrados, y documentacion probatoria para la autoridad de control.

### 7.2 Centralizacion RGPD en Super Admin

**Fundamentacion legal:** Art. 5.1.f RGPD — Principio de integridad y confidencialidad. Art. 32.1.b RGPD — Capacidad de garantizar la confidencialidad. Principio de minimo privilegio.

**Que es:** Un modelo organizativo que centraliza todas las operaciones relacionadas con el RGPD (consentimiento, borrado efectivo, exportacion) en el rol super_admin, separando las funciones pedagogicas (profesor) de las funciones de gobernanza de datos.

**Justificacion:**

En un centro educativo real, las decisiones sobre proteccion de datos no las toma cada profesor individualmente, sino la direccion del centro como responsable del tratamiento. La centralizacion en super_admin refleja este modelo organizativo:

- **El super_admin** (representando a la direccion del centro) gestiona: creacion de estudiantes, otorgamiento y revocacion de consentimiento, borrado efectivo, exportacion de datos y rectificacion de datos.
- **El profesor** accede a los datos de sus alumnos exclusivamente para la funcion pedagogica: consultar dashboards, gestionar sesiones de juego, interpretar metricas de rendimiento.

**Que se consigue:** Separacion de responsabilidades alineada con el modelo organizativo de los centros educativos espanoles, aplicacion del principio de minimo privilegio (cada rol accede solo a las operaciones necesarias para su funcion), y trazabilidad clara de quien ejecuta operaciones sensibles sobre datos de menores.

### 7.3 Control de acceso basado en roles (RBAC)

**Fundamentacion legal:** Art. 32.1.b RGPD — Capacidad de garantizar la confidencialidad y el acceso a los datos.

**Que es:** Un sistema de control de acceso que define tres roles con permisos diferenciados y que valida la propiedad de los datos en cada operacion.

**Roles definidos:**

- **teacher:** Acceso pedagogico a los datos de sus propios alumnos (dashboard, sesiones de juego, analytics). No puede ejecutar operaciones RGPD.
- **student:** Sin credenciales de acceso. Interaccion unicamente a traves de tarjetas RFID fisicas supervisadas por el profesor.
- **super_admin:** Gestion completa de datos y operaciones RGPD. Acceso a datos agregados de todos los profesores.

**Validacion de ownership:** Cada endpoint que expone datos de estudiantes verifica que el profesor autenticado es el creador o profesor asignado del alumno consultado. Un helper centralizado realiza esta verificacion de forma consistente en todos los endpoints, actuando como capa adicional de defensa en profundidad.

**Que se consigue:** Garantia de que cada usuario accede unicamente a los datos necesarios para su funcion. La validacion de ownership protege contra el acceso no autorizado a datos de alumnos de otros profesores, incluso en caso de manipulacion de identificadores en las peticiones.

---

## 8. Evaluacion del riesgo de re-identificacion

La plataforma procesa datos de rendimiento educativo de menores en entornos de aula. Los endpoints de analytics permiten a los profesores visualizar metricas individuales de sus alumnos, lo cual es esencial para la funcion pedagogica. Sin embargo, en aulas pequenas, la combinacion de quasi-identificadores puede permitir la re-identificacion de un estudiante incluso cuando se aplica seudonimizacion. Este analisis evalua el riesgo y justifica la medida implementada.

### 8.1 Quasi-identificadores

Un quasi-identificador es un atributo que, por si solo, no identifica a una persona, pero que combinado con otros atributos puede permitir su identificacion. Los quasi-identificadores presentes en el sistema son:

| Quasi-identificador | Fuente | Riesgo |
|---|---|---|
| Edad | Modelo de usuario, campo `profile.age` | Combinado con aula, reduce significativamente el grupo de anonimato |
| Aula | Modelo de usuario, campo `profile.classroom` | Reduce el grupo de anonimato al tamano del aula |
| Patron de rendimiento | Metricas del estudiante | En grupos pequenos, el patron puede ser unico |
| Horario de juego | Marca temporal de finalizacion de partida | Puede cruzarse con informacion de asistencia presencial |

### 8.2 Escenarios de riesgo

**Escenario A — Aula con 3 alumnos, pantalla compartida:** Un profesor comparte la pantalla del dashboard. Un padre observa las metricas. Si solo hay 3 alumnos de 5 anos en el aula, el padre puede deducir a que alumno pertenece cada fila de datos, incluso sin ver el nombre del alumno.

**Escenario B — Acceso no autorizado al endpoint:** Si un actor obtiene acceso al endpoint de analytics (por ejemplo, mediante robo de un token JWT), los datos individuales de un grupo pequeno son trivialmente re-identificables, ya que la combinacion de quasi-identificadores es unica para cada estudiante en grupos reducidos.

### 8.3 Analisis de k-anonimidad

La k-anonimidad es una propiedad que garantiza que cada combinacion de quasi-identificadores aparece al menos *k* veces en el conjunto de datos. Si k=5, un individuo no puede distinguirse entre al menos 5 registros.

En Eduplay, el «conjunto de datos» es el grupo de estudiantes de un profesor, con granularidad minima a nivel de aula.

| Tamano del grupo | k efectivo | Riesgo |
|---|---|---|
| < 5 alumnos | k < 5 | Alto — datos individuales trivialmente re-identificables |
| 5-10 alumnos | k = 5-10 | Medio — riesgo reducido pero no eliminado |
| > 10 alumnos | k > 10 | Bajo — re-identificacion requiere informacion adicional |

**Umbral adoptado: k = 5.** Este umbral se fundamenta en:

1. La Guia de Anonimizacion de la AEPD (2019), que recomienda al menos k=5 para conjuntos de datos sensibles.
2. El tamano tipico de aulas de educacion infantil en Espana (15-25 alumnos), donde un subgrupo de 5 o mas es realista tras filtros por edad o aula.
3. El equilibrio pedagogico: un umbral demasiado alto (k=10) impediria el uso de analytics en aulas reales, mientras que un umbral menor (k=3) es insuficiente segun las recomendaciones de la AEPD.

### 8.4 Medida implementada

El endpoint de analytics de estudiantes por aula aplica el siguiente comportamiento:

- **Si el grupo tiene 5 o mas estudiantes:** Devuelve datos individuales con seudonimizacion (pseudoId en lugar de identificadores directos).
- **Si el grupo tiene menos de 5 estudiantes:** Devuelve unicamente metricas agregadas del grupo (numero total de estudiantes, media de puntuacion, total de partidas, distribucion por niveles). No se devuelven datos individuales por estudiante.

La respuesta agregada incluye un campo explicativo que informa al consumidor de la API de que se esta aplicando proteccion de k-anonimidad, indicando el tamano del grupo y el umbral minimo.

### 8.5 Limitaciones conocidas

1. **El profesor ya conoce la identidad de sus alumnos:** La proteccion k-anonimidad no impide que el profesor (que tiene acceso directo a los alumnos en el aula fisica) deduzca identidades. Su objetivo es proteger contra terceros que accedan al sistema o contra la comparticion involuntaria de pantalla.

2. **Datos temporales no cubiertos completamente:** El horario de juego (marca temporal de finalizacion) no se anonimiza en la respuesta de detalle individual. Un observador con acceso al aula podria correlacionar horarios de juego con presencia fisica. Esta limitacion se mitiga porque los timestamps solo se devuelven en el endpoint de resumen individual del estudiante, que requiere autenticacion y validacion de ownership.

3. **Agregacion sobre grupo filtrado:** El check de k-anonimidad se aplica al grupo filtrado por los parametros de la consulta. Un profesor con 20 alumnos totales pero que filtra por un aula concreta con 3 alumnos recibira la respuesta agregada, protegiendo al subgrupo pequeno.

---

## 9. Conclusiones

La plataforma Eduplay ha implementado un conjunto integral de medidas tecnicas y organizativas para la proteccion de los datos personales de los menores de 4-8 anos que interactuan con el sistema. Este capitulo sintetiza los logros alcanzados y su alineacion con el marco normativo aplicable.

### 9.1 Cumplimiento normativo alcanzado

Las medidas implementadas abordan directamente los siguientes articulos y principios del RGPD y la LOPDGDD:

| Articulo | Principio/Derecho | Medida implementada |
|----------|--------------------|-----------------------|
| Art. 5.1.c RGPD | Minimizacion de datos | Eliminacion de fecha de nacimiento, exclusion de datos innecesarios por diseno |
| Art. 5.1.e RGPD | Limitacion del plazo de conservacion | Politica de retencion con plazos definidos y script automatico |
| Art. 5.2 RGPD | Responsabilidad proactiva | RAT, EIPD, auditoria automatizada, historial de consentimiento |
| Art. 6.1.a + Art. 8 RGPD | Consentimiento parental | Registro verificable con historial y metadata de canal |
| Art. 7 LOPDGDD | Edad minima 14 anos | Consentimiento parental obligatorio centralizado |
| Art. 17 RGPD | Derecho de supresion | Borrado efectivo con cascada completa |
| Art. 20 RGPD | Derecho de portabilidad | Exportacion de datos en formato JSON estructurado |
| Art. 21 RGPD | Derecho de oposicion | Oposicion granular a analytics sin impedir gameplay |
| Art. 25 RGPD | Proteccion desde el diseno | Seudonimizacion, k-anonimidad, separacion PII/analytics |
| Art. 30 RGPD | Registro de actividades | RAT con 7 actividades documentadas |
| Art. 32 RGPD | Seguridad del tratamiento | 23 medidas transversales implementadas |
| Art. 35 RGPD | Evaluacion de impacto | EIPD con 12 riesgos identificados y mitigados |
| Arts. 33-34 RGPD | Notificacion de brechas | Protocolo documentado con plantillas y timeline |
| Art. 83 LOPDGDD | Educacion digital | Respeto a la intimidad y proteccion de datos en entorno educativo |
| Art. 92 LOPDGDD | Proteccion de menores | Interes superior del menor como principio rector |

### 9.2 Resultados de la evaluacion de riesgos

De los 12 riesgos identificados en la Evaluacion de Impacto, tras la implementacion de las medidas de mitigacion:

- **11 riesgos** se han reducido a nivel **Bajo**, incluyendo los dos que partian de nivel Critico (ausencia de consentimiento parental verificable e imposibilidad de supresion efectiva).
- **1 riesgo** permanece en nivel **Medio** (R-09: perfilado inadvertido de capacidades cognitivas). Este riesgo es inherente a cualquier sistema de seguimiento pedagogico y no es eliminable sin renunciar a la finalidad educativa del sistema. Se mitiga con medidas organizativas: la interpretacion de los datos es siempre responsabilidad del profesor humano, y los datos no se comparten con terceros.

### 9.3 Diferenciacion academica

La integracion de un eje completo de proteccion de datos en el desarrollo de la plataforma aporta los siguientes elementos diferenciadores al Trabajo de Fin de Grado:

1. **Profundidad normativa:** Las medidas no se limitan a declaraciones genericas de cumplimiento, sino que se fundamentan en articulos concretos del RGPD, la LOPDGDD y las directrices de la AEPD y el EDPB, con justificaciones legales especificas para cada decision tecnica.

2. **Implementacion real:** Todas las medidas descritas en este documento estan implementadas en el codigo fuente del proyecto y son verificables mediante los scripts de auditoria automatizada, los tests y la documentacion tecnica.

3. **Alineacion con el marco europeo:** El proyecto demuestra como un sistema educativo puede cumplir con la normativa europea de proteccion de datos sin comprometer su funcionalidad pedagogica, un equilibrio que constituye uno de los desafios centrales de la ingenieria de software moderna en el ambito educativo.

4. **Consideracion del colectivo vulnerable:** La proteccion reforzada de los menores de 4-8 anos no se trata como un anadido posterior, sino como un requisito de diseno que ha influido en la arquitectura del sistema desde la definicion del modelo de datos hasta la configuracion de los servicios externos.

---

## 10. Referencias bibliograficas

### Legislacion y regulacion

1. **Reglamento (UE) 2016/679** del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la proteccion de las personas fisicas en lo que respecta al tratamiento de datos personales y a la libre circulacion de estos datos (Reglamento General de Proteccion de Datos — RGPD). *Diario Oficial de la Union Europea*, L 119, 4 de mayo de 2016.

2. **Ley Organica 3/2018**, de 5 de diciembre, de Proteccion de Datos Personales y garantia de los derechos digitales (LOPDGDD). *Boletin Oficial del Estado*, num. 294, de 6 de diciembre de 2018. BOE-A-2018-16673.

3. **Ley Organica 2/2006**, de 3 de mayo, de Educacion (LOE), modificada por la **Ley Organica 3/2020**, de 29 de diciembre (LOMLOE). *Boletin Oficial del Estado*, num. 106, de 4 de mayo de 2006. BOE-A-2006-7899.

### Directrices de la AEPD

4. **Agencia Espanola de Proteccion de Datos (AEPD).** *Guia para Centros Educativos.* AEPD, 2018 (actualizada). Responde a mas de 80 preguntas frecuentes de la comunidad educativa sobre proteccion de datos.

5. **Agencia Espanola de Proteccion de Datos (AEPD).** *Listas de tipos de tratamientos de datos que requieren evaluacion de impacto relativa a proteccion de datos (Art. 35.4 RGPD).* AEPD, 2019. Publicada conforme al procedimiento del Art. 35.6 RGPD con dictamen del Comite Europeo de Proteccion de Datos.

6. **Agencia Espanola de Proteccion de Datos (AEPD).** *Guia basica de anonimizacion.* AEPD, 2019. Describe tecnicas de anonimizacion, k-anonimidad y limites de la anonimizacion absoluta.

7. **Agencia Espanola de Proteccion de Datos (AEPD).** *Guia practica para las evaluaciones de impacto en la proteccion de los datos sujetas al RGPD.* AEPD, 2021. Proporciona la metodologia de evaluacion de riesgos y plantillas para la EIPD.

8. **Agencia Espanola de Proteccion de Datos (AEPD).** *Guia para la gestion y notificacion de brechas de seguridad.* AEPD, 2021.

### Directrices del EDPB

9. **Grupo de Trabajo del Articulo 29 (WP 248 rev.01).** *Directrices sobre la evaluacion de impacto relativa a la proteccion de datos (EIPD) y para determinar si el tratamiento «entrana probablemente un alto riesgo» a efectos del Reglamento (UE) 2016/679.* Adoptadas el 4 de abril de 2017, revisadas el 4 de octubre de 2017. Refrendadas por el EDPB.

10. **European Data Protection Board (EDPB).** *Guidelines 01/2025 on Pseudonymisation.* Adoptadas el 16 de enero de 2025. Proporcionan orientacion detallada sobre la seudonimizacion como medida tecnica conforme al Art. 25 RGPD.

11. **European Data Protection Board (EDPB).** *Guidelines 4/2019 on Article 25 — Data Protection by Design and by Default.* Version 2.0, adoptadas el 20 de octubre de 2020. Detallan los requisitos de proteccion de datos desde el diseno y por defecto.

12. **European Data Protection Board (EDPB).** *Guidelines 01/2021 on Examples regarding Data Breach Notification (version 2.0).* EDPB, 2023.

### Decisiones de la Comision Europea

13. **Comision Europea.** *Decision de Ejecucion de 10 de julio de 2023, con arreglo al Reglamento (UE) 2016/679, sobre el nivel adecuado de proteccion de los datos personales garantizado por el Marco de Privacidad de Datos UE-EE.UU.* (EU-US Data Privacy Framework). C(2023) 4745 final.

### Jurisprudencia

14. **Tribunal de Justicia de la Union Europea (TJUE).** Sentencia de 16 de julio de 2020, Asunto C-311/18, *Data Protection Commissioner contra Facebook Ireland Ltd y Maximillian Schrems* (Schrems II). Invalida la Decision 2016/1250 (Privacy Shield) y establece requisitos reforzados para las transferencias internacionales de datos.

### Normas tecnicas

15. **ISO/IEC 27701:2019** (revisada 2025). *Privacy Information Management — Requirements and guidance for establishing, implementing, maintaining and continually improving a Privacy Information Management System (PIMS).* International Organization for Standardization. Proporciona un marco de referencia para la gestion de la privacidad alineado con el RGPD, con un mapeo especifico en su Anexo D.

### Publicaciones academicas

16. **Sweeney, L.** (2002). *k-Anonymity: A Model for Protecting Privacy.* International Journal of Uncertainty, Fuzziness and Knowledge-Based Systems, 10(05), 557-570. Referencia academica fundamental para el modelo de k-anonimidad adoptado.

### Considerandos del RGPD referenciados

17. **Considerando 26** — Datos anonimos: Los principios de proteccion de datos no se aplican a informacion anonima, es decir, informacion que no guarda relacion con una persona fisica identificada o identificable. Fundamenta la conservacion indefinida de datos anonimizados.

18. **Considerando 38** — Proteccion especifica de los datos personales de los ninos: Los ninos merecen una proteccion especifica, ya que pueden ser menos conscientes de los riesgos, consecuencias, garantias y derechos concernientes al tratamiento de datos personales. Fundamenta el enfoque reforzado de todo el eje de proteccion de datos.

19. **Considerando 47** — Interes legitimo y menores: Los intereses y derechos fundamentales del interesado pueden prevalecer sobre el interes legitimo del responsable, particularmente cuando se tratan datos de menores. Fundamenta la eleccion del consentimiento parental como base legal.

20. **Considerando 65** — Derecho de supresion de datos de menores: Este derecho es pertinente en particular cuando el interesado dio su consentimiento siendo nino. Fundamenta la implementacion del borrado efectivo con cascada.

21. **Considerando 83** — Seguridad proporcional al riesgo: El responsable debe evaluar los riesgos inherentes al tratamiento y aplicar medidas para mitigarlos, teniendo en cuenta los avances tecnologicos y los costes de aplicacion. Fundamenta el enfoque de seguridad por capas implementado.

---

*Documento elaborado como parte del Trabajo de Fin de Grado «Plataforma de Juegos Educativos con RFID» para fundamentar las medidas tecnicas y organizativas de proteccion de datos de menores implementadas en la plataforma Eduplay, en cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Organica 3/2018 (LOPDGDD).*
