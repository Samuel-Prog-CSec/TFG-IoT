# Evaluacion de Impacto en Proteccion de Datos (EIPD/DPIA)

**Plataforma Eduplay — Juegos Educativos con RFID**

| Campo | Valor |
|-------|-------|
| **Autor** | Samuel Blanchart Perez |
| **Fecha de elaboracion** | 06-04-2026 |
| **Ultima actualizacion** | 06-04-2026 |
| **Version** | 1.0 |
| **Clasificacion** | Documento formal — Proteccion de Datos |
| **Base legal del documento** | Articulo 35 del Reglamento (UE) 2016/679 (RGPD) |
| **Registro de referencia** | RAT — `backend/docs/RAT_Registro_Actividades_Tratamiento.md` |
| **Proyecto** | Trabajo de Fin de Grado — Ingenieria Informatica |

---

## Indice

1. [Justificacion de la obligatoriedad de la EIPD](#1-justificacion-de-la-obligatoriedad-de-la-eipd)
2. [Seccion 1: Descripcion sistematica del tratamiento](#2-seccion-1-descripcion-sistematica-del-tratamiento)
   - 2.1 [Naturaleza del tratamiento](#21-naturaleza-del-tratamiento)
   - 2.2 [Ambito del tratamiento](#22-ambito-del-tratamiento)
   - 2.3 [Contexto del tratamiento](#23-contexto-del-tratamiento)
   - 2.4 [Finalidades del tratamiento](#24-finalidades-del-tratamiento)
   - 2.5 [Base legal del tratamiento](#25-base-legal-del-tratamiento)
   - 2.6 [Datos tratados por actividad](#26-datos-tratados-por-actividad)
   - 2.7 [Infraestructura tecnica](#27-infraestructura-tecnica)
3. [Seccion 2: Evaluacion de necesidad y proporcionalidad](#3-seccion-2-evaluacion-de-necesidad-y-proporcionalidad)
   - 3.1 [Justificacion de cada tipo de dato recogido](#31-justificacion-de-cada-tipo-de-dato-recogido)
   - 3.2 [Datos NO recogidos (minimizacion por diseno)](#32-datos-no-recogidos-minimizacion-por-diseno)
   - 3.3 [Adecuacion de la base legal](#33-adecuacion-de-la-base-legal)
   - 3.4 [Proporcionalidad del tratamiento](#34-proporcionalidad-del-tratamiento)
4. [Seccion 3: Evaluacion de riesgos](#4-seccion-3-evaluacion-de-riesgos)
   - 4.1 [Metodologia de evaluacion](#41-metodologia-de-evaluacion)
   - 4.2 [Matriz de riesgos](#42-matriz-de-riesgos)
   - 4.3 [Desarrollo detallado de riesgos](#43-desarrollo-detallado-de-riesgos)
5. [Seccion 4: Medidas de mitigacion](#5-seccion-4-medidas-de-mitigacion)
   - 5.1 [Medidas por riesgo](#51-medidas-por-riesgo)
   - 5.2 [Resumen de riesgo residual](#52-resumen-de-riesgo-residual)
6. [Conclusion y dictamen](#6-conclusion-y-dictamen)
7. [Referencias bibliograficas](#7-referencias-bibliograficas)

---

## 1. Justificacion de la obligatoriedad de la EIPD

El **Articulo 35.1 del RGPD** establece que el responsable del tratamiento debe realizar una Evaluacion de Impacto relativa a la Proteccion de Datos cuando un tipo de tratamiento *«entrane un alto riesgo para los derechos y libertades de las personas fisicas»*. El apartado 35.3 enumera supuestos en los que la EIPD es obligatoria, y el apartado 35.4 faculta a las autoridades de control para publicar listas de tipos de tratamiento que la requieran.

La **Agencia Espanola de Proteccion de Datos (AEPD)**, en cumplimiento del Art. 35.4 RGPD, publico en 2019 la *Lista de tipos de tratamientos de datos que requieren evaluacion de impacto relativa a proteccion de datos*. Esta lista establece que la EIPD es **obligatoria** cuando el tratamiento cumple **dos o mas** de los criterios enumerados.

La plataforma Eduplay cumple los siguientes criterios de la lista de la AEPD:

| Criterio AEPD | Aplicabilidad en Eduplay |
|----------------|--------------------------|
| **Criterio 5: Datos de sujetos vulnerables** | Los interesados son **menores de 4 a 8 anos**, colectivo expresamente reconocido como vulnerable por el Considerando 38 del RGPD y por la AEPD en su Guia para Centros Educativos |
| **Criterio 3: Evaluacion o puntuacion** | La plataforma realiza una **evaluacion sistematica** del rendimiento educativo de los menores: puntuaciones, tiempos de respuesta, patrones de acierto/error, metricas agregadas y clasificacion por rangos (risk, average, good, excellent) |

El cumplimiento de al menos dos criterios hace **obligatoria** la realizacion de esta EIPD. Adicionalmente, las **Directrices del Grupo de Trabajo del Articulo 29** (WP 248 rev.01, adoptadas por el EDPB) senalan que el tratamiento de datos de menores, por su condicion de sujetos especialmente vulnerables, justifica por si solo una evaluacion de impacto reforzada.

---

## 2. Seccion 1: Descripcion sistematica del tratamiento

*Seccion requerida por el Art. 35.7.a) del RGPD: «una descripcion sistematica de las operaciones de tratamiento previstas y de los fines del tratamiento, inclusive, cuando proceda, el interes legitimo perseguido por el responsable del tratamiento».*

### 2.1 Naturaleza del tratamiento

**Eduplay** es una plataforma educativa interactiva que permite a profesores de educacion infantil y primaria crear sesiones de juego con tarjetas RFID fisicas para alumnos de entre 4 y 8 anos. El flujo de datos se estructura de la siguiente manera:

1. **Creacion de estudiantes:** El profesor registra a cada alumno en la plataforma con datos identificativos minimos (nombre, edad, aula). El alumno **no tiene credenciales de acceso** (ni email, ni contrasena).
2. **Configuracion de sesiones de juego:** El profesor crea sesiones de juego (GameSession) seleccionando un contexto tematico, una mecanica de juego y un mazo de tarjetas RFID.
3. **Ejecucion de partidas:** Cada alumno juega una partida individual (GamePlay). El alumno interactua fisicamente con tarjetas RFID que son leidas por un lector RC522 conectado a un microcontrolador ESP8266. El navegador del profesor lee las tarjetas via Web Serial API y transmite los datos al backend via WebSocket (Socket.IO).
4. **Registro de eventos:** Cada interaccion del alumno (acierto, error, timeout) se registra como un evento con timestamp y tiempo de respuesta en milisegundos.
5. **Analisis de rendimiento:** El profesor consulta dashboards con metricas agregadas de sus alumnos: puntuaciones medias, distribucion por rangos, tendencias, alertas de riesgo academico.

### 2.2 Ambito del tratamiento

| Parametro | Descripcion |
|-----------|-------------|
| **Responsable del tratamiento** | Centro educativo que adopta la plataforma Eduplay |
| **Encargado del tratamiento** | Plataforma Eduplay (desarrollador del TFG) |
| **Ambito territorial** | Espana (centros educativos espanoles) |
| **Categorias de interesados** | Menores de 4-8 anos (alumnos), profesores (adultos), super_admins (adultos) |
| **Volumen estimado** | Hasta cientos de estudiantes por centro, con multiples centros potenciales |
| **Frecuencia del tratamiento** | Continuo durante el curso escolar; cada sesion de juego genera multiples registros por alumno |

### 2.3 Contexto del tratamiento

La plataforma opera dentro del contexto educativo espanol, sujeto al RGPD y a la LOPDGDD. Los alumnos son menores cuya interaccion con la plataforma es **indirecta** (solo manipulan tarjetas RFID fisicas) y **supervisada** en todo momento por el profesor. Los menores no acceden en ningun caso a interfaces digitales ni proporcionan datos por si mismos.

El profesor actua como intermediario entre el menor y el sistema: es el quien crea la cuenta del alumno, inicia las sesiones de juego, supervisa la interaccion y consulta los resultados. Los datos son introducidos por el profesor y generados automaticamente por el sistema durante la interaccion del menor con las tarjetas.

### 2.4 Finalidades del tratamiento

Las finalidades del tratamiento se detallan en el Registro de Actividades de Tratamiento (RAT, actividades AT-01 a AT-07). Se resumen a continuacion:

| Finalidad | Actividades RAT asociadas | Descripcion |
|-----------|---------------------------|-------------|
| **Gestion de identidad de alumnos** | AT-01 | Crear, identificar y gestionar las cuentas de alumnos para permitir su participacion en sesiones de juego y el seguimiento pedagogico |
| **Seguimiento pedagogico** | AT-02, AT-03 | Registrar el rendimiento de cada alumno en las partidas (aciertos, errores, tiempos) y proporcionar al profesor informacion agregada para la intervencion pedagogica |
| **Gestion de sesiones de juego RFID** | AT-07 | Procesar en tiempo real las interacciones de los alumnos con las tarjetas RFID durante las sesiones de juego |
| **Autenticacion y seguridad** | AT-04, AT-05 | Gestionar el acceso seguro de profesores a la plataforma y registrar eventos de seguridad para la deteccion de incidentes |
| **Monitorizacion tecnica** | AT-06 | Capturar errores del sistema para diagnostico y mejora continua de la plataforma |

### 2.5 Base legal del tratamiento

La base legal para cada actividad de tratamiento se documenta en el RAT. Para las actividades que involucran datos de menores, la base legal es:

**Consentimiento del titular de la patria potestad o tutela** — Art. 6.1.a) RGPD en combinacion con el Art. 8 RGPD y el Art. 7 LOPDGDD.

**Justificacion de la eleccion de esta base legal:**

El Art. 7 de la LOPDGDD fija en 14 anos la edad minima para que un menor pueda prestar consentimiento por si mismo para el tratamiento de sus datos personales en Espana. Los alumnos de Eduplay tienen entre 4 y 8 anos, muy por debajo de este umbral. Por tanto, el consentimiento debe ser otorgado por el titular de la patria potestad o tutela.

Se ha descartado el **interes publico** (Art. 6.1.e RGPD) como base legal porque, aunque la funcion educativa del centro puede ampararse en este fundamento para las actividades propias del curriculo (segun la Ley Organica 2/2006, de 3 de mayo, de Educacion), Eduplay es una **plataforma externa** que no forma parte del sistema de gestion academica del centro. La AEPD senala en su Guia para Centros Educativos que el uso de plataformas externas no esenciales para la funcion docente requiere consentimiento expreso de los tutores.

Se ha descartado el **interes legitimo** (Art. 6.1.f RGPD) porque el Considerando 47 del RGPD establece que este fundamento requiere una ponderacion entre los intereses del responsable y los derechos del interesado, y que *«los intereses y los derechos fundamentales del interesado podrian prevalecer sobre los intereses del responsable del tratamiento en particular cuando el tratamiento de los datos personales se realice en circunstancias en las que el interesado no espera razonablemente que se realice un tratamiento ulterior»*. Tratandose de menores de corta edad, la ponderacion se inclina sistematicamente hacia la proteccion de sus derechos.

Para las actividades que no involucran datos de menores (autenticacion de profesores, logging de seguridad, monitorizacion tecnica), las bases legales son la ejecucion de contrato (Art. 6.1.b) y el interes legitimo (Art. 6.1.f), segun se detalla en el RAT.

### 2.6 Datos tratados por actividad

El inventario completo de datos personales tratados se documenta en el RAT (actividades AT-01 a AT-07). A continuacion se presenta un resumen estructurado por categoria:

**Datos identificativos de alumnos (AT-01):**

| Dato | Campo tecnico | Justificacion |
|------|---------------|---------------|
| Nombre completo | `name` | Identificacion por el profesor en el aula |
| Edad | `profile.age` | Contextualizar rendimiento por grupo de edad |
| Aula | `profile.classroom` | Organizacion de alumnos por grupos |
| Avatar | `profile.avatar` | Personalizacion visual (opcional) |
| Profesor responsable | `createdBy`, `assignedTeacher` | Vinculacion profesor-alumno para acceso |

**Datos de rendimiento educativo (AT-02, AT-03):**

| Dato | Campo tecnico | Justificacion |
|------|---------------|---------------|
| Puntuacion de partida | `score` | Retroalimentacion pedagogica inmediata |
| Metricas de partida | `metrics.*` (6 campos) | Analisis de rendimiento por partida |
| Eventos de interaccion | `events[]` (hasta 500) | Detalle de cada intento del alumno |
| Tiempos de respuesta | `events[].timeElapsed` | Diagnostico de dificultades de aprendizaje |
| Metricas agregadas del alumno | `studentMetrics.*` (8 campos) | Seguimiento longitudinal del progreso |

**Datos de sesion RFID (AT-07):**

| Dato | Campo tecnico | Justificacion |
|------|---------------|---------------|
| UID de tarjeta RFID | `cardUid` | Asociacion tarjeta-contenido durante la partida |
| Timestamps de escaneo | `events[].timestamp` | Secuencia temporal de la partida |

**Datos de profesores (AT-04, AT-05):**

| Dato | Campo tecnico | Justificacion |
|------|---------------|---------------|
| Email | `email` | Credenciales de acceso |
| Contrasena (hash bcrypt) | `password` | Autenticacion segura |
| IP, User-Agent | Logs de seguridad | Auditoria y deteccion de anomalias |
| Fingerprint de dispositivo | Hash SHA-256 en JWT | Deteccion de robo de tokens |

### 2.7 Infraestructura tecnica

| Componente | Tecnologia | Funcion en el tratamiento |
|------------|------------|---------------------------|
| **Base de datos principal** | MongoDB 7 | Almacenamiento persistente de usuarios, partidas, metricas y sesiones |
| **Cache y estado transitorio** | Redis 7 | Tokens de sesion (TTL automatico), blacklist de tokens revocados, estado RFID en tiempo real, cache de analytics |
| **Comunicacion en tiempo real** | Socket.IO 4 | Transmision de eventos RFID desde el navegador del profesor al backend |
| **Monitorizacion de errores** | Sentry | Captura de errores inesperados del sistema (procesador externo — ver AT-06 del RAT) |
| **Backend** | Node.js + Express 5 | API REST, autenticacion, logica de negocio, motor de juego |
| **Frontend** | React 19 + Vite 7 | Interfaz del profesor (dashboards, gestion de alumnos, sesiones de juego) |
| **IoT** | ESP8266 + RC522 | Lectura de tarjetas RFID fisicas (Web Serial API) |
| **Logging** | Pino | Logging estructurado con redaccion automatica de datos sensibles |

---

## 3. Seccion 2: Evaluacion de necesidad y proporcionalidad

*Seccion requerida por el Art. 35.7.b) del RGPD: «una evaluacion de la necesidad y la proporcionalidad de las operaciones de tratamiento con respecto a su finalidad».*

### 3.1 Justificacion de cada tipo de dato recogido

Cada dato personal recogido por la plataforma responde a una necesidad funcional especifica. Se evalua a continuacion la necesidad de cada campo conforme al principio de minimizacion (Art. 5.1.c RGPD):

| Dato | Necesidad | Justificacion detallada |
|------|-----------|-------------------------|
| **Nombre del alumno** (`name`) | **Alta** | Imprescindible para que el profesor identifique a cada alumno en el dashboard y pueda intervenir pedagogicamente. Sin este dato, el profesor no podria asociar los resultados de rendimiento a un alumno concreto de su aula |
| **Edad** (`profile.age`) | **Media** | Permite contextualizar el rendimiento del alumno segun su grupo de edad. Un tiempo de respuesta de 5 segundos tiene distinta significacion pedagogica para un alumno de 4 anos que para uno de 8. Se almacena como numero entero, no como fecha de nacimiento |
| **Aula** (`profile.classroom`) | **Alta** | Necesaria para la organizacion de alumnos por grupos. El profesor gestiona multiples aulas y necesita filtrar y agrupar a sus alumnos |
| **Avatar** (`profile.avatar`) | **Baja** | Elemento opcional de personalizacion visual. No se recoge por defecto (valor por defecto nulo). No contribuye al seguimiento pedagogico |
| **Puntuacion** (`score`) | **Alta** | Dato central del seguimiento pedagogico. Permite al profesor evaluar el progreso del alumno en cada partida y a lo largo del tiempo |
| **Metricas de partida** (`metrics.*`) | **Alta** | Desglosan la puntuacion en componentes utiles para el diagnostico pedagogico: intentos totales, aciertos, errores, timeouts. Permiten distinguir entre un alumno que falla mucho pero intenta y uno que abandona |
| **Eventos de interaccion** (`events[]`) | **Media** | Proporcionan el detalle granular de cada intento. Su necesidad pedagogica disminuye con el tiempo, por lo que se aplica una politica de retencion de 12 meses (AT-02 del RAT) |
| **Tiempos de respuesta** (`events[].timeElapsed`) | **Media** | Indicador indirecto de dificultad o facilidad del alumno con un contenido. Dato potencialmente sensible porque puede revelar informacion sobre capacidades cognitivas — se trata con proteccion reforzada |
| **UID de tarjeta RFID** (`cardUid`) | **Baja tras la partida** | Necesario durante la partida para asociar el escaneo fisico con el contenido esperado. Tras la partida pierde utilidad identificativa (las tarjetas son tokens fungibles, no vinculados a un alumno concreto) |
| **Metricas agregadas** (`studentMetrics.*`) | **Alta** | Permiten el seguimiento longitudinal del progreso del alumno sin necesidad de recalcular a partir de partidas individuales. Son el dato primario del dashboard del profesor |

### 3.2 Datos NO recogidos (minimizacion por diseno)

El diseno de la plataforma ha excluido deliberadamente los siguientes datos, aplicando el principio de minimizacion desde la fase de diseno (Art. 25 RGPD — proteccion de datos desde el diseno y por defecto):

| Dato NO recogido | Justificacion de la exclusion |
|-------------------|-------------------------------|
| **Email del alumno** | Los alumnos de 4-8 anos no tienen email propio. Recogerlo seria innecesario y contrario al principio de minimizacion. Los alumnos no necesitan credenciales de acceso porque no interactuan directamente con la plataforma web |
| **Contrasena del alumno** | Los alumnos no inician sesion en la plataforma. Su participacion se canaliza a traves del profesor, que gestiona las sesiones de juego. El modelo `User` valida activamente que un usuario con rol `student` **no tenga contrasena** (validacion en el middleware del modelo) |
| **Fecha de nacimiento completa** | La edad simple (`profile.age`) es suficiente para la funcion educativa. La fecha de nacimiento completa tiene un potencial identificativo significativamente mayor: un menor de 5 anos nacido el 15 de marzo de 2021 es identificable en un aula de 20 alumnos; un menor de «5 anos» en la misma aula tiene menor riesgo de identificacion. La eliminacion de `profile.birthdate` es una medida de minimizacion implementada en la tarea T-702 |
| **Direccion postal** | Sin relevancia para la funcion educativa de la plataforma |
| **Telefono del alumno o de los tutores** | Sin relevancia para la funcion educativa. La comunicacion con las familias se realiza a traves de los canales habituales del centro educativo, fuera de la plataforma |
| **Datos biometricos** | El UID de la tarjeta RFID **no es un dato biometrico**: es un identificador del objeto fisico (la tarjeta), no del alumno. Las tarjetas son intercambiables entre alumnos y no estan vinculadas a la identidad biologica de ningun menor |
| **Datos de salud** | La plataforma no recoge ni pretende inferir datos de salud. Aunque los tiempos de respuesta podrian correlacionarse con determinadas condiciones cognitivas, la plataforma no realiza este tipo de inferencias ni las facilita |
| **Geolocalizacion** | No se recoge la ubicacion del alumno ni del dispositivo. La IP del profesor se registra en logs de seguridad pero no se geolocaliza |
| **Imagenes o video del alumno** | La plataforma no utiliza camaras ni captura imagenes de los alumnos. El avatar es una imagen generica seleccionada por el profesor, no una fotografia del menor |

### 3.3 Adecuacion de la base legal

**Base legal elegida para datos de menores:** Consentimiento del titular de la patria potestad o tutela (Art. 6.1.a + Art. 8 RGPD + Art. 7 LOPDGDD).

**Evaluacion de adecuacion:**

El consentimiento parental es la base legal mas apropiada para este tratamiento por las siguientes razones:

1. **Edad de los interesados:** Los alumnos tienen entre 4 y 8 anos, muy por debajo del umbral de 14 anos establecido por el Art. 7 de la LOPDGDD. El consentimiento debe proceder necesariamente del titular de la patria potestad o tutela.

2. **Naturaleza de la plataforma:** Eduplay es una herramienta complementaria, no un componente esencial del sistema educativo formal. No sustituye al expediente academico ni al sistema de evaluacion curricular. La AEPD distingue entre actividades propias de la funcion docente (amparables en el interes publico) y el uso de plataformas externas (que requieren consentimiento).

3. **Proporcionalidad:** El consentimiento es la base legal que otorga mayor control a las familias. Dado que los interesados son menores de corta edad, maximizar el control parental es coherente con el principio de proteccion reforzada que el RGPD reserva a este colectivo.

4. **Registro verificable:** La plataforma implementa un mecanismo de registro de consentimiento (`consent.granted`, `consent.grantedBy`, `consent.grantedAt`, `consent.purposes[]`, `consent.policyVersion`) que cumple con el Art. 7.1 RGPD — la carga de la prueba del consentimiento recae en el responsable. Tarea T-702 (fase B).

5. **Revocabilidad:** El consentimiento puede ser retirado en cualquier momento sin efecto retroactivo (Art. 7.3 RGPD). La revocacion desencadena el borrado efectivo de los datos del alumno (tarea T-704).

### 3.4 Proporcionalidad del tratamiento

El tratamiento es **proporcionado** respecto a sus finalidades por las siguientes razones:

1. **Solo se recogen datos necesarios:** Cada campo de datos esta vinculado a una necesidad funcional especifica documentada en la seccion 3.1. Los campos sin necesidad funcional directa (email, contrasena, fecha de nacimiento) han sido excluidos por diseno.

2. **Los datos tienen plazos de conservacion definidos:** Los eventos detallados se retienen 12 meses; las cuentas inactivas se borran tras 24 meses de inactividad; los tokens de sesion expiran automaticamente por TTL de Redis. Estos plazos se documentan en el RAT (actividades AT-01 a AT-07).

3. **El acceso a datos esta restringido:** Cada profesor solo accede a los datos de sus propios alumnos (ownership). Los endpoints de analytics no exponen PII directamente. El acceso se controla mediante RBAC (tres roles: teacher, student, super_admin) y validacion de ownership.

4. **Existen mecanismos para ejercer los derechos del interesado:** Borrado efectivo (Art. 17 — tarea T-704), exportacion de datos en formato estructurado (Art. 20 — tarea T-706), y el profesor puede consultar en cualquier momento los datos del alumno (Art. 15 — funcionalidad nativa del dashboard).

5. **No se toman decisiones automatizadas con efectos juridicos:** La clasificacion de alumnos por rangos (risk, average, good, excellent) es una ayuda visual para el profesor, no una decision automatizada en el sentido del Art. 22 RGPD. La interpretacion de los datos y las decisiones pedagogicas son siempre responsabilidad del profesor humano.

---

## 4. Seccion 3: Evaluacion de riesgos

*Seccion requerida por el Art. 35.7.c) del RGPD: «una evaluacion de los riesgos para los derechos y libertades de los interesados».*

### 4.1 Metodologia de evaluacion

La evaluacion de riesgos sigue la metodologia recomendada por el EDPB en sus Directrices sobre la evaluacion de impacto relativa a la proteccion de datos (WP 248 rev.01), combinada con el enfoque de la AEPD en su Guia practica para las evaluaciones de impacto en la proteccion de los datos sujetas al RGPD (2021).

Cada riesgo se evalua segun dos parametros:

**Probabilidad de materializacion:**

| Nivel | Descripcion |
|-------|-------------|
| **Baja** | El evento es improbable dadas las medidas de seguridad existentes y el contexto de uso |
| **Media** | El evento es posible y se han documentado incidentes similares en plataformas comparables |
| **Alta** | El evento es probable si no se implementan medidas de mitigacion adicionales |

**Impacto sobre los derechos y libertades de los interesados:**

| Nivel | Descripcion |
|-------|-------------|
| **Bajo** | Inconveniente menor que el interesado puede superar sin dificultad |
| **Medio** | Dificultades significativas que el interesado puede superar con esfuerzo |
| **Alto** | Consecuencias significativas que el interesado podria tener dificultad para superar |
| **Muy Alto** | Consecuencias irreversibles o muy dificiles de superar para el interesado |

**Nivel de riesgo resultante:**

| Probabilidad \ Impacto | Bajo | Medio | Alto | Muy Alto |
|-------------------------|------|-------|------|----------|
| **Baja** | Bajo | Bajo | Medio | Alto |
| **Media** | Bajo | Medio | Alto | Critico |
| **Alta** | Medio | Alto | Critico | Critico |

### 4.2 Matriz de riesgos

| ID | Riesgo | Probabilidad | Impacto | Nivel resultante |
|----|--------|--------------|---------|------------------|
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

### 4.3 Desarrollo detallado de riesgos

#### R-01: Re-identificacion de menores en aulas pequenas

**Descripcion:** En un aula de 15-25 alumnos, la combinacion de nombre + edad + aula permite la identificacion unica del menor incluso si los datos se presentan de forma aparentemente anonimizada. La AEPD advierte en su Guia practica de anonimizacion (2019) que *«la anonimizacion absoluta no existe»* y que el riesgo de re-identificacion depende del contexto. En aulas pequenas, datos como «alumno de 5 anos con puntuacion media de 72 en el aula 1oA» pueden ser suficientes para identificar al menor.

**Derechos afectados:** Derecho a la intimidad (Art. 18 CE), derecho a la proteccion de datos (Art. 8 CDFUE).

**Escenario:** Un tercero obtiene acceso a datos de analytics que no incluyen el nombre del alumno pero si la edad, el aula y las metricas de rendimiento. En un aula de 20 alumnos, la combinacion edad + rendimiento puede ser suficiente para inferir la identidad del menor.

---

#### R-02: Acceso no autorizado a datos de rendimiento educativo

**Descripcion:** Una brecha de seguridad en la API o en la base de datos podria exponer los datos de rendimiento educativo de los menores (puntuaciones, tiempos de respuesta, patrones de acierto/error). Estos datos, aunque no constituyen categorias especiales del Art. 9 RGPD, revelan informacion sobre las capacidades cognitivas y ritmos de aprendizaje de menores de corta edad.

**Derechos afectados:** Derecho a la proteccion de datos (Art. 8 CDFUE), interes superior del menor.

**Escenario:** Una vulnerabilidad en la validacion de parametros de un endpoint de analytics permite a un profesor acceder a datos de alumnos que no le pertenecen, o un atacante externo explota una vulnerabilidad para acceder a la base de datos MongoDB.

---

#### R-03: Retencion indefinida de datos sin base legal vigente

**Descripcion:** Si los datos de los alumnos y sus partidas se conservan indefinidamente tras la finalizacion de la relacion educativa, el tratamiento careceria de base legal vigente (el consentimiento se otorga para una finalidad activa, no para un almacenamiento indefinido). El Art. 5.1.e) del RGPD establece que los datos deben conservarse *«durante no mas tiempo del necesario para los fines del tratamiento»*.

**Derechos afectados:** Principio de limitacion del plazo de conservacion (Art. 5.1.e RGPD).

**Escenario:** Un alumno termina el curso escolar y no vuelve a usar la plataforma. Sus datos permanecen en la base de datos durante anos sin que el profesor ni los tutores sean conscientes de ello.

---

#### R-04: Ausencia de consentimiento parental verificable

**Descripcion:** Si la plataforma no registra tecnicamente el consentimiento parental, el responsable del tratamiento no podra demostrar que se obtuvo dicho consentimiento (Art. 7.1 RGPD: *«el responsable debera ser capaz de demostrar que el interesado consintio el tratamiento»*). Para menores de 14 anos, el Art. 8.2 RGPD exige ademas que el responsable haga *«esfuerzos razonables»* para verificar que el consentimiento fue otorgado por el titular de la patria potestad.

**Derechos afectados:** Principio de licitud del tratamiento (Art. 5.1.a RGPD), derecho a la proteccion de datos del menor (Considerando 38 RGPD).

**Escenario:** Un padre solicita al centro educativo que demuestre que otorgo su consentimiento para el tratamiento de datos de su hijo en la plataforma. Sin un registro tecnico, ni el centro ni el desarrollador pueden acreditarlo.

---

#### R-05: Fuga de PII de menores en logs de aplicacion

**Descripcion:** Los logs de la aplicacion (Pino) y el security logger podrian registrar inadvertidamente datos identificativos de menores (nombre, aula, identificadores) en mensajes de error, breadcrumbs o contexto de debugging. Los logs pueden persistir en sistemas de monitorizacion con un regimen de acceso distinto al de la base de datos principal.

**Derechos afectados:** Principio de proteccion de datos desde el diseno (Art. 25 RGPD), derecho a la confidencialidad.

**Escenario:** Un error en el motor de juego registra un log de tipo `"Error procesando partida del estudiante Maria Garcia, aula 1oA"`. Este log persiste en el sistema de monitorizacion y es accesible para el equipo de desarrollo, que no necesita conocer la identidad del menor para diagnosticar el error tecnico.

---

#### R-06: Transferencia internacional a Sentry sin garantias documentadas

**Descripcion:** Sentry, Inc. tiene sede en Estados Unidos. El envio de datos de errores a Sentry constituye una transferencia internacional de datos personales que debe ampararse en un mecanismo de transferencia valido conforme al Capitulo V del RGPD. Tras la invalidacion del Privacy Shield por la sentencia Schrems II (TJUE, C-311/18, 16 de julio de 2020), las transferencias a EE.UU. deben apoyarse en Standard Contractual Clauses (SCCs) u otro mecanismo valido. La Decision de Adecuacion de la Comision Europea (EU-US Data Privacy Framework, Decision de 10 de julio de 2023) proporciona un marco actualizado, pero debe verificarse que Sentry esta acogida a dicho marco.

**Derechos afectados:** Derechos del Capitulo V RGPD, derecho a un nivel de proteccion adecuado.

**Escenario:** Sentry captura un evento de error que contiene metadatos del contexto de la peticion (ID de usuario, URL con parametros). Aunque el filtro `beforeSend` redacta emails y contrasenas, podrian filtrarse identificadores internos o datos de contexto no previstos.

---

#### R-07: Imposibilidad de ejercer derecho de supresion

**Descripcion:** Si la plataforma solo implementa soft delete (cambiar `status` a `'inactive'`), los datos del menor permanecen en la base de datos y podrian ser consultados. El Art. 17 RGPD establece el derecho a obtener la supresion de los datos personales. El Considerando 65 enfatiza que este derecho es *«pertinente en particular cuando el interesado dio su consentimiento siendo nino y no era plenamente consciente de los riesgos»*.

**Derechos afectados:** Derecho de supresion (Art. 17 RGPD), derechos reforzados del menor (Considerando 65 RGPD).

**Escenario:** Un padre solicita la eliminacion de todos los datos de su hijo. El profesor desactiva la cuenta (soft delete), pero los datos permanecen en MongoDB: el documento User, todos los GamePlays asociados, las metricas y los eventos detallados. Los datos siguen existiendo y podrian ser recuperados.

---

#### R-08: Imposibilidad de ejercer derecho de portabilidad

**Descripcion:** El Art. 20 RGPD establece el derecho del interesado a recibir los datos personales que haya proporcionado al responsable *«en un formato estructurado, de uso comun y lectura mecanica»*. Sin un mecanismo tecnico de exportacion, la plataforma no puede cumplir este derecho de forma efectiva.

**Derechos afectados:** Derecho a la portabilidad (Art. 20 RGPD).

**Escenario:** Un tutor solicita que se le entreguen todos los datos de su hijo para migrar a otra plataforma educativa. Sin un endpoint de exportacion, la unica opcion seria una extraccion manual de la base de datos, un proceso que no cumple el requisito de formato estructurado y de uso comun.

---

#### R-09: Perfilado inadvertido de capacidades cognitivas de menores

**Descripcion:** La combinacion de tiempos de respuesta, patrones de error, tasas de acierto y metricas agregadas puede revelar indirectamente informacion sobre las capacidades cognitivas, dificultades de aprendizaje o trastornos del desarrollo del menor. Aunque estos datos no constituyen categorias especiales del Art. 9 RGPD, el Art. 35.3.a) del RGPD senala que la evaluacion sistematica de aspectos personales que se base en un tratamiento automatizado y que produzca efectos juridicos o afecte significativamente al interesado requiere una EIPD.

**Derechos afectados:** Derecho a no ser objeto de decisiones automatizadas (Art. 22 RGPD), derecho a la proteccion reforzada del menor (Considerando 38 RGPD).

**Escenario:** Un alumno muestra consistentemente tiempos de respuesta muy superiores a la media y altas tasas de error. Estos datos, interpretados incorrectamente o compartidos sin contexto, podrian llevar a un etiquetado inadecuado del menor (por ejemplo, asociarlo con una dificultad de aprendizaje sin diagnostico profesional).

---

#### R-10: Brecha de seguridad con exposicion masiva de datos de menores

**Descripcion:** Una brecha de seguridad que exponga la base de datos MongoDB tendria un impacto muy alto al tratarse de datos de menores de corta edad. La notificacion de brechas a la AEPD (Art. 33 RGPD) y a los interesados (Art. 34 RGPD) seria obligatoria si la brecha entrana un riesgo para los derechos y libertades de los menores. El dano reputacional y la perdida de confianza de los centros educativos serian significativos.

**Derechos afectados:** Todos los derechos del interesado. Interes superior del menor.

**Escenario:** Un atacante explota una vulnerabilidad de la infraestructura (MongoDB expuesto sin autenticacion, inyeccion NoSQL, o credenciales comprometidas) y obtiene acceso a toda la base de datos, incluyendo nombres, edades, aulas y metricas de rendimiento de todos los alumnos.

---

#### R-11: Uso indebido de datos analiticos por profesor no autorizado

**Descripcion:** Si los mecanismos de control de acceso basados en ownership fallan o son eludidos, un profesor podria acceder a los datos de alumnos de otro profesor. Aunque todos los profesores son adultos verificados, el acceso a datos de alumnos ajenos no esta amparado por el consentimiento parental otorgado (que se refiere al profesor responsable del alumno).

**Derechos afectados:** Principio de limitacion de la finalidad (Art. 5.1.b RGPD), confidencialidad de los datos.

**Escenario:** Un profesor modifica el ID de estudiante en la URL de un endpoint de analytics para acceder a los datos de un alumno de otro profesor. Si la validacion de ownership falla, obtiene acceso a datos para los que no tiene autorizacion.

---

#### R-12: Perdida de datos por fallo tecnico sin backup verificado

**Descripcion:** La perdida de datos de rendimiento educativo impediria al profesor realizar el seguimiento pedagogico de sus alumnos. Aunque la perdida de datos tiene un impacto menor sobre los derechos del menor que una exposicion no autorizada, la disponibilidad de los datos es un componente del Art. 32.1.b) del RGPD (capacidad de restaurar la disponibilidad y el acceso a los datos personales de forma rapida).

**Derechos afectados:** Art. 32.1.b) RGPD (disponibilidad), derecho de acceso (Art. 15 RGPD).

**Escenario:** Un fallo en el servidor de MongoDB o una corrupcion de datos elimina las partidas de un grupo de alumnos. Sin un sistema de backup verificado, los datos son irrecuperables.

---

## 5. Seccion 4: Medidas de mitigacion

*Seccion requerida por el Art. 35.7.d) del RGPD: «las medidas previstas para afrontar los riesgos, incluidas garantias, medidas de seguridad y mecanismos que garanticen la proteccion de datos personales».*

### 5.1 Medidas por riesgo

#### R-01: Re-identificacion de menores en aulas pequenas

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-01.1** Eliminacion de `profile.birthdate` | Tecnica | **Implementada** | T-702 | Se elimina la fecha de nacimiento completa del modelo de estudiante, conservando solo `profile.age`. Reduce la combinacion de atributos identificativos |
| **M-01.2** Seudonimizacion en endpoints de analytics | Tecnica | **Planificada** | T-703 | Los endpoints de analytics retornan `studentPseudoId` en lugar de `playerId`/`name`. La resolucion nombre-pseudoId se realiza solo en la capa de presentacion del profesor autorizado |
| **M-01.3** Separacion PII / datos analiticos en DTOs | Tecnica | **Planificada** | T-703 | Los DTOs de analytics no incluyen datos identificativos. Si se compromete el subsistema de analytics, los datos expuestos no permiten identificar a los menores |
| **M-01.4** Anonimizacion diferida de eventos | Tecnica | **Implementada** | T-704 | Tras 12 meses, los eventos detallados se anonimizan eliminando `playerId` y `cardUid`. Las metricas agregadas anonimas se conservan indefinidamente (Considerando 26 RGPD) |

**Riesgo residual tras mitigacion:** **Bajo** — La combinacion de minimizacion, seudonimizacion y separacion de datos reduce significativamente el potencial de re-identificacion. El riesgo residual se limita al acceso legitimo del profesor a los datos de sus propios alumnos, acceso que esta amparado por el consentimiento parental.

---

#### R-02: Acceso no autorizado a datos de rendimiento educativo

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-02.1** Control de acceso por roles (RBAC) | Tecnica | **Implementada** | --- | Tres roles (teacher, student, super_admin) con permisos diferenciados. Middleware `auth.js` valida rol y ownership en cada peticion |
| **M-02.2** Validacion de ownership en endpoints | Tecnica | **Implementada** | --- | Cada endpoint de datos de estudiantes verifica que el profesor solicitante es el `createdBy` o `assignedTeacher` del alumno |
| **M-02.3** Autenticacion JWT con rotacion y deteccion de robo | Tecnica | **Implementada** | --- | Access tokens de 15 minutos, refresh tokens de 30 dias con rotacion, deteccion de robo de tokens mediante familias |
| **M-02.4** Rate limiting en endpoints de analytics | Tecnica | **Implementada** | T-521 | 30 peticiones/minuto por profesor en endpoints de analytics. Rate limiting con Redis store en produccion |
| **M-02.5** Validacion de entrada con Zod | Tecnica | **Implementada** | --- | Todos los endpoints validan parametros de entrada (body, query, params) con esquemas Zod, previniendo inyeccion NoSQL y manipulacion de parametros |
| **M-02.6** Proteccion contra NoSQL injection y prototype pollution | Tecnica | **Implementada** | --- | Payload guard en middleware que sanitiza la entrada |
| **M-02.7** Helmet/CSP y CORS whitelist | Tecnica | **Implementada** | --- | Headers de seguridad HTTP y lista blanca de origenes permitidos |

**Riesgo residual tras mitigacion:** **Bajo** — Las multiples capas de seguridad (autenticacion, autorizacion, validacion, rate limiting) reducen la probabilidad de acceso no autorizado a un nivel bajo. El riesgo residual principal es una vulnerabilidad desconocida (zero-day) en alguna dependencia.

---

#### R-03: Retencion indefinida de datos sin base legal vigente

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-03.1** Politica de retencion con plazos definidos | Organizativa | **Implementada** | T-704 | Plazos documentados en el RAT: eventos detallados 12 meses, cuentas inactivas 24 meses, tokens TTL automatico en Redis |
| **M-03.2** Script de retencion automatica | Tecnica | **Implementada** | T-704 | Script ejecutable (`npm run data:retention`) que aplica los plazos de retencion y genera informe de acciones realizadas |
| **M-03.3** Anonimizacion diferida | Tecnica | **Implementada** | T-704 | Tras el periodo de retencion, los datos se anonimizan (eliminacion de `playerId`, `cardUid`) en lugar de eliminarse completamente, preservando el valor estadistico |
| **M-03.4** Documentacion de plazos en RAT | Organizativa | **Implementada** | T-701 | Cada actividad de tratamiento tiene plazos de conservacion documentados y justificados |

**Riesgo residual tras mitigacion:** **Bajo** — Los plazos de retencion definidos y el script automatico garantizan que los datos no se conservan mas alla de lo necesario. El riesgo residual se limita a un fallo en la ejecucion periodica del script.

---

#### R-04: Ausencia de consentimiento parental verificable

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-04.1** Registro tecnico de consentimiento en el modelo User | Tecnica | **Implementada** | T-702 | Campos `consent.granted`, `consent.grantedBy`, `consent.grantedAt`, `consent.purposes[]`, `consent.policyVersion` en el schema de estudiantes |
| **M-04.2** Validacion obligatoria de consentimiento al crear estudiante | Tecnica | **Implementada** | T-702 | La creacion de un estudiante requiere que el campo `consent.granted` sea `true`. Sin consentimiento registrado, la API rechaza la creacion |
| **M-04.3** Registro del otorgante y fecha | Tecnica | **Implementada** | T-702 | Se registra quien otorgo el consentimiento (`grantedBy`), cuando (`grantedAt`) y para que finalidades (`purposes[]`), cumpliendo Art. 7.1 RGPD |
| **M-04.4** Versionado de la politica de privacidad | Organizativa | **Recomendada** | T-710 | El consentimiento se vincula a una version especifica de la politica de privacidad. Si la politica cambia, se requiere renovacion del consentimiento |

**Riesgo residual tras mitigacion:** **Bajo** — El registro tecnico del consentimiento permite al responsable demostrar que se obtuvo el consentimiento parental. El riesgo residual es que el mecanismo no verifica la identidad del otorgante (verificacion presencial, por ejemplo), pero el Art. 8.2 RGPD exige *«esfuerzos razonables»*, no certeza absoluta. En el contexto escolar, la entrega del formulario de consentimiento a traves del tutor del aula se considera un esfuerzo razonable.

---

#### R-05: Fuga de PII de menores en logs de aplicacion

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-05.1** Redaccion automatica de datos sensibles en Pino | Tecnica | **Implementada** | --- | El logger Pino tiene configurados 11 paths de redaccion que eliminan automaticamente passwords, tokens, headers de autorizacion y cookies de los logs |
| **M-05.2** Seudonimizacion de identificadores de estudiantes en logs | Tecnica | **Planificada** | T-703 | Los identificadores de estudiantes en logs operativos se registran como hash truncado (pseudoId) del ObjectId, impidiendo la asociacion directa con el menor |
| **M-05.3** Prohibicion de datos identificativos de estudiantes en logs de seguridad | Organizativa | **Implementada** | --- | El security logger no registra nombres ni aulas de estudiantes. Documentado en AT-05 del RAT |
| **M-05.4** Filtro `beforeSend` en Sentry | Tecnica | **Implementada** | --- | El filtro `beforeSend` de Sentry redacta emails, contrasenas, tokens y cookies antes de enviar el evento al servidor externo |

**Riesgo residual tras mitigacion:** **Bajo** — La combinacion de redaccion automatica, seudonimizacion y filtros de Sentry minimiza la probabilidad de fuga de PII en logs. El riesgo residual es un log ad hoc anadido por un desarrollador que no siga las convenciones de logging.

---

#### R-06: Transferencia internacional a Sentry sin garantias documentadas

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-06.1** Filtro `beforeSend` que redacta PII | Tecnica | **Implementada** | --- | Minimiza los datos personales enviados a Sentry. Se eliminan: email, password, tokens, cookies |
| **M-06.2** Sentry configurable y desactivable | Tecnica | **Implementada** | --- | Sentry solo se activa si `SENTRY_ENABLED=true` y existe `SENTRY_DSN`. En caso de duda sobre garantias, se puede desactivar sin afectar la funcionalidad |
| **M-06.3** Documentacion formal de la transferencia | Organizativa | **Recomendada** | T-710 | Documentar formalmente la transferencia: identificar el mecanismo de transferencia aplicable (Decision de Adecuacion EU-US Data Privacy Framework o Standard Contractual Clauses), verificar que Sentry esta acogida al marco correspondiente, y mantener documentacion actualizada |
| **M-06.4** Minimizacion de datos en breadcrumbs | Tecnica | **Recomendada** | --- | Revisar la configuracion de Sentry para asegurar que los breadcrumbs no incluyen datos identificativos de menores |

**Riesgo residual tras mitigacion:** **Bajo** — Sentry es desactivable y los filtros minimizan los datos transferidos. El riesgo residual es la posibilidad de que un dato imprevisto se incluya en el contexto del error. La documentacion formal de la transferencia (M-06.3) cierra la brecha documental.

---

#### R-07: Imposibilidad de ejercer derecho de supresion

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-07.1** Borrado efectivo (hard delete) con cascada | Tecnica | **Implementada** | T-704 | Endpoint `DELETE /api/users/:id/data` que elimina permanentemente: documento User, todos los GamePlays asociados (por `playerId`), tokens en Redis y referencias en GameSessions |
| **M-07.2** Confirmacion explicita e irreversibilidad comunicada | Tecnica | **Implementada** | T-704 | El frontend muestra un dialogo de confirmacion que advierte claramente de la irreversibilidad de la accion |
| **M-07.3** Registro de la accion de supresion | Tecnica | **Implementada** | T-704 | Se registra un log (sin PII del estudiante eliminado) documentando que se ejercio el derecho de supresion, cuando, y por quien |
| **M-07.4** Mantenimiento del soft delete para desactivacion | Tecnica | **Implementada** | --- | El soft delete se mantiene como mecanismo de desactivacion (operacion reversible). El borrado efectivo es una operacion separada, explicita e irreversible |

**Riesgo residual tras mitigacion:** **Bajo** — El borrado efectivo con cascada cumple el Art. 17 RGPD. El riesgo residual se limita a posibles copias de seguridad que podrian contener los datos eliminados, lo cual esta amparado por el Considerando 66 RGPD que reconoce que la supresion no exige la destruccion de soportes fisicos cuando sea desproporcionado.

---

#### R-08: Imposibilidad de ejercer derecho de portabilidad

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-08.1** Endpoint de exportacion de datos | Tecnica | **Planificada** | T-706 | `GET /api/users/:id/export-data` retorna todos los datos personales del estudiante en formato JSON estructurado: perfil, historial de partidas, metricas agregadas, estado del consentimiento |
| **M-08.2** Formato estructurado y de uso comun | Tecnica | **Planificada** | T-706 | La exportacion se realiza en formato JSON, que cumple con el requisito del Art. 20 RGPD de *«formato estructurado, de uso comun y lectura mecanica»* |
| **M-08.3** Acceso restringido a la exportacion | Tecnica | **Planificada** | T-706 | Solo el profesor propietario del alumno o un super_admin pueden ejecutar la exportacion, previniendo el acceso no autorizado a datos completos del menor |

**Riesgo residual tras mitigacion:** **Bajo** — El endpoint de exportacion cumple los requisitos del Art. 20 RGPD. El riesgo residual es la ausencia de un formato estandarizado interoperable con otras plataformas educativas (no existe un estandar universal para datos de rendimiento educativo).

---

#### R-09: Perfilado inadvertido de capacidades cognitivas de menores

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-09.1** No se toman decisiones automatizadas con efectos juridicos | Organizativa | **Implementada** | --- | La clasificacion por rangos (risk, average, good, excellent) es una ayuda visual para el profesor. La interpretacion y las decisiones pedagogicas son siempre del profesor humano. Esto se documenta en AT-03 del RAT |
| **M-09.2** Los datos de rendimiento no se comparten con terceros | Organizativa | **Implementada** | --- | Los datos de rendimiento solo son accesibles para el profesor propietario del alumno. No se envian a servicios externos de analisis, no se venden y no se comparten con otros centros educativos |
| **M-09.3** Informacion al profesor sobre los limites de la interpretacion | Organizativa | **Recomendada** | T-710 | La pagina de informacion de privacidad debe incluir una nota indicando que los datos de rendimiento son indicadores pedagogicos y no constituyen un diagnostico medico o psicologico |
| **M-09.4** Anonimizacion temporal de datos granulares | Tecnica | **Implementada** | T-704 | Los eventos detallados (tiempos de respuesta individuales) se anonimizan tras 12 meses, limitando la ventana temporal en la que es posible un perfilado granular |

**Riesgo residual tras mitigacion:** **Medio** — Aunque no se toman decisiones automatizadas y los datos no se comparten con terceros, el profesor tiene acceso a datos de rendimiento detallados que podrian ser interpretados como indicadores de capacidades cognitivas. Este riesgo es inherente a cualquier sistema de seguimiento pedagogico y se mitiga con informacion al profesor sobre los limites de la interpretacion.

---

#### R-10: Brecha de seguridad con exposicion masiva de datos de menores

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-10.1** Cifrado en transito (HTTPS/TLS) | Tecnica | **Implementada** | --- | Todas las comunicaciones entre el navegador y el servidor se cifran con TLS |
| **M-10.2** Autenticacion en MongoDB y Redis | Tecnica | **Implementada** | --- | Las bases de datos requieren autenticacion. Las credenciales se gestionan mediante variables de entorno, nunca hardcodeadas en el codigo |
| **M-10.3** CSRF double-submit cookie | Tecnica | **Implementada** | --- | Proteccion contra ataques de falsificacion de peticiones entre sitios |
| **M-10.4** Rate limiting global y por endpoint | Tecnica | **Implementada** | T-521 | Limita el numero de peticiones por IP y por usuario, dificultando ataques de fuerza bruta y extraccion masiva de datos |
| **M-10.5** DTOs para control de exposicion | Tecnica | **Implementada** | --- | Las respuestas de la API nunca retornan documentos MongoDB sin transformar. Los DTOs controlan exactamente que campos se exponen |
| **M-10.6** Validacion de entrada y proteccion contra inyeccion | Tecnica | **Implementada** | --- | Zod valida todos los inputs; payload guard protege contra prototype pollution y NoSQL injection |
| **M-10.7** Minimizacion de datos almacenados | Tecnica | **Implementada** | T-702 | Menos datos almacenados = menor impacto en caso de brecha. La eliminacion de `birthdate` y la seudonimizacion reducen la superficie de datos expuesta |
| **M-10.8** Monitorizacion con Sentry y logging estructurado | Tecnica | **Implementada** | --- | Deteccion temprana de anomalias y errores. El security logger registra intentos de acceso sospechosos |

**Riesgo residual tras mitigacion:** **Bajo** — Las multiples capas de seguridad (perimetral, aplicacion, datos) reducen tanto la probabilidad como el impacto de una brecha masiva. El riesgo residual principal son vulnerabilidades desconocidas en dependencias de terceros, mitigadas parcialmente por las auditorias de seguridad periodicas (`npm run audit:prod`).

---

#### R-11: Uso indebido de datos analiticos por profesor no autorizado

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-11.1** Validacion de ownership en todos los endpoints | Tecnica | **Implementada** | --- | Cada endpoint que expone datos de estudiantes verifica que el profesor autenticado es el `createdBy` o `assignedTeacher` del alumno consultado |
| **M-11.2** Rate limiting en endpoints de analytics | Tecnica | **Implementada** | T-521 | 30 peticiones/minuto limita la velocidad de extraccion de datos, incluso si un profesor intenta enumerar IDs |
| **M-11.3** Audit trail de acceso a datos | Tecnica | **Planificada** | T-710 | Registro de acciones: `DATA_ACCESS`, `DATA_EXPORT`, `DATA_DELETE`, `DATA_CONSENT_CHANGE`. Permite detectar patrones de acceso anomalos |
| **M-11.4** Validacion de ObjectId en parametros de URL | Tecnica | **Implementada** | --- | Los validadores Zod verifican que los IDs en las URLs son ObjectIds validos, previniendo la enumeracion aleatoria |

**Riesgo residual tras mitigacion:** **Bajo** — La validacion de ownership combinada con el audit trail garantiza que cada acceso esta autorizado y registrado. El riesgo residual es un fallo en la logica de ownership de un endpoint especifico, mitigado por las pruebas automatizadas.

---

#### R-12: Perdida de datos por fallo tecnico sin backup verificado

| Medida | Tipo | Estado | Tarea | Descripcion |
|--------|------|--------|-------|-------------|
| **M-12.1** Docker Compose con volumenes persistentes | Tecnica | **Implementada** | --- | Los datos de MongoDB y Redis se almacenan en volumenes Docker persistentes que sobreviven a reinicios del contenedor |
| **M-12.2** MongoDB replica set (recomendado para produccion) | Tecnica | **Recomendada** | --- | Configurar MongoDB con replica set para redundancia de datos y recuperacion automatica ante fallos de nodo |
| **M-12.3** Backups periodicos automatizados | Tecnica | **Recomendada** | --- | Implementar `mongodump` periodico con almacenamiento cifrado en ubicacion separada del servidor principal |
| **M-12.4** Pruebas de restauracion periodicas | Organizativa | **Recomendada** | --- | Verificar periodicamente que los backups son restaurables y completos |

**Riesgo residual tras mitigacion:** **Bajo** — Los volumenes persistentes y las medidas recomendadas de backup proporcionan una proteccion razonable contra la perdida de datos. En un entorno de TFG, el riesgo se considera aceptable; en un despliegue en produccion, las medidas M-12.2, M-12.3 y M-12.4 deberian implementarse obligatoriamente.

---

### 5.2 Resumen de riesgo residual

| ID | Riesgo | Nivel original | Nivel residual | Reduccion |
|----|--------|----------------|----------------|-----------|
| R-01 | Re-identificacion en aulas pequenas | Alto | **Bajo** | 2 niveles |
| R-02 | Acceso no autorizado a rendimiento educativo | Medio | **Bajo** | 1 nivel |
| R-03 | Retencion indefinida sin base legal | Medio | **Bajo** | 1 nivel |
| R-04 | Ausencia de consentimiento parental verificable | Critico | **Bajo** | 3 niveles |
| R-05 | Fuga de PII en logs | Alto | **Bajo** | 2 niveles |
| R-06 | Transferencia internacional a Sentry | Medio | **Bajo** | 1 nivel |
| R-07 | Imposibilidad de supresion efectiva | Critico | **Bajo** | 3 niveles |
| R-08 | Imposibilidad de portabilidad | Medio | **Bajo** | 1 nivel |
| R-09 | Perfilado inadvertido de capacidades cognitivas | Alto | **Medio** | 1 nivel |
| R-10 | Brecha de seguridad masiva | Alto | **Bajo** | 2 niveles |
| R-11 | Uso indebido por profesor no autorizado | Medio | **Bajo** | 1 nivel |
| R-12 | Perdida de datos por fallo tecnico | Bajo | **Bajo** | 0 niveles |

**Riesgo residual global:** Tras la aplicacion de las medidas de mitigacion, 11 de los 12 riesgos se situan en nivel **Bajo**. El unico riesgo con nivel residual **Medio** (R-09, perfilado inadvertido) es inherente a cualquier sistema de seguimiento pedagogico y se mitiga con medidas organizativas de informacion al profesor.

---

## 6. Conclusion y dictamen

### Dictamen de la evaluacion

Esta Evaluacion de Impacto en Proteccion de Datos concluye que el tratamiento de datos personales de menores realizado por la plataforma Eduplay es **viable** siempre que se implementen y mantengan las medidas de mitigacion descritas en la Seccion 4.

**Justificacion:**

1. **El tratamiento es necesario y proporcionado:** Cada dato recogido tiene una justificacion funcional documentada. Se han excluido por diseno datos innecesarios (email, contrasena, fecha de nacimiento, datos biometricos) y se aplica minimizacion activa.

2. **La base legal es adecuada:** El consentimiento parental es la base legal mas protectora para el colectivo de menores de 4-8 anos, y se implementa un mecanismo tecnico de registro verificable.

3. **Los riesgos estan mitigados:** De los 12 riesgos identificados, 11 se reducen a nivel Bajo tras las medidas de mitigacion. El unico riesgo residual Medio es inherente al seguimiento pedagogico y no es eliminable sin renunciar a la finalidad educativa del sistema.

4. **Se garantizan los derechos del interesado:** La plataforma proporciona mecanismos tecnicos para ejercer los derechos de supresion (borrado efectivo), portabilidad (exportacion JSON) y acceso (dashboard del profesor).

5. **El tratamiento cumple los principios del RGPD:** Minimizacion (Art. 5.1.c), limitacion del plazo de conservacion (Art. 5.1.e), proteccion desde el diseno (Art. 25) y responsabilidad proactiva (Art. 5.2) se materializan en medidas tecnicas y organizativas concretas.

### Medidas pendientes de implementacion

Las siguientes medidas estan clasificadas como **Planificadas** o **Recomendadas** y deben completarse antes del despliegue en un entorno de produccion con datos reales de menores:

| Medida | Estado | Tarea | Prioridad |
|--------|--------|-------|-----------|
| Seudonimizacion en endpoints de analytics | Planificada | T-703 | Alta |
| Separacion PII / datos analiticos en DTOs | Planificada | T-703 | Alta |
| Endpoint de exportacion de datos (portabilidad) | Planificada | T-706 | Alta |
| Audit trail de acceso a datos | Planificada | T-710 | Media |
| Documentacion formal de transferencia a Sentry | Recomendada | T-710 | Media |
| Informacion al profesor sobre limites de la interpretacion | Recomendada | T-710 | Media |
| Versionado de la politica de privacidad | Recomendada | T-710 | Baja |
| MongoDB replica set | Recomendada | --- | Baja (produccion) |
| Backups periodicos automatizados | Recomendada | --- | Baja (produccion) |
| Pruebas de restauracion periodicas | Recomendada | --- | Baja (produccion) |

### Revision periodica

Esta EIPD debe revisarse en los siguientes supuestos:

- **Cambio en el tratamiento:** Si se anaden nuevas categorias de datos, nuevas finalidades o nuevos destinatarios.
- **Cambio normativo:** Si se modifica el RGPD, la LOPDGDD, o las directrices de la AEPD/EDPB en materia relevante.
- **Incidente de seguridad:** Si se produce una brecha de datos o un intento de acceso no autorizado.
- **Periodicidad minima:** Al menos una vez al ano o al inicio de cada curso escolar.

---

## 7. Referencias bibliograficas

### Legislacion y regulacion

1. **Reglamento (UE) 2016/679** del Parlamento Europeo y del Consejo, de 27 de abril de 2016, relativo a la proteccion de las personas fisicas en lo que respecta al tratamiento de datos personales y a la libre circulacion de estos datos (Reglamento General de Proteccion de Datos). *Diario Oficial de la Union Europea*, L 119, 4 de mayo de 2016.

2. **Ley Organica 3/2018**, de 5 de diciembre, de Proteccion de Datos Personales y garantia de los derechos digitales (LOPDGDD). *Boletin Oficial del Estado*, num. 294, de 6 de diciembre de 2018. BOE-A-2018-16673.

3. **Ley Organica 2/2006**, de 3 de mayo, de Educacion (LOE), modificada por la Ley Organica 3/2020, de 29 de diciembre (LOMLOE). *Boletin Oficial del Estado*, num. 106, de 4 de mayo de 2006. BOE-A-2006-7899.

### Directrices y documentos interpretativos

4. **Grupo de Trabajo del Articulo 29 (WP 248 rev.01)**: *Directrices sobre la evaluacion de impacto relativa a la proteccion de datos (EIPD) y para determinar si el tratamiento «entrana probablemente un alto riesgo» a efectos del Reglamento (UE) 2016/679*. Adoptadas el 4 de abril de 2017, revisadas el 4 de octubre de 2017. Refrendadas por el EDPB.

5. **AEPD (2019)**: *Listas de tipos de tratamientos de datos que requieren evaluacion de impacto relativa a proteccion de datos (Art. 35.4 RGPD)*. Publicada conforme al procedimiento del Art. 35.6 RGPD con dictamen del Comite Europeo de Proteccion de Datos.

6. **AEPD (2018, actualizada)**: *Guia para Centros Educativos*. Responde a mas de 80 preguntas frecuentes de la comunidad educativa sobre proteccion de datos.

7. **AEPD (2021)**: *Guia practica para las evaluaciones de impacto en la proteccion de los datos sujetas al RGPD*. Proporciona la metodologia de evaluacion de riesgos y plantillas para la EIPD.

8. **AEPD (2019)**: *Guia practica de anonimizacion*. Describe tecnicas de anonimizacion y advierte sobre los limites de la anonimizacion absoluta.

9. **EDPB (2025)**: *Directrices 01/2025 sobre Seudonimizacion*. Adoptadas en enero de 2025. Proporcionan orientacion detallada sobre la seudonimizacion como medida tecnica conforme al Art. 25 RGPD.

10. **Comision Europea**: *Decision de Ejecucion de 10 de julio de 2023, con arreglo al Reglamento (UE) 2016/679, sobre el nivel adecuado de proteccion de los datos personales garantizado por el Marco de Privacidad de Datos UE-EE.UU.* (EU-US Data Privacy Framework). C(2023) 4745 final.

### Jurisprudencia

11. **TJUE, Sentencia de 16 de julio de 2020**, Asunto C-311/18, *Data Protection Commissioner contra Facebook Ireland Ltd y Maximillian Schrems* (Schrems II). Invalida la Decision 2016/1250 (Privacy Shield) y establece requisitos reforzados para las transferencias internacionales de datos.

### Normas tecnicas

12. **ISO/IEC 27701:2019**: *Extension to ISO/IEC 27001 and ISO/IEC 27002 for privacy information management*. Proporciona un marco de referencia para la gestion de la privacidad alineado con el RGPD.

### Documentacion interna del proyecto

13. **RAT — Registro de Actividades de Tratamiento**: `backend/docs/RAT_Registro_Actividades_Tratamiento.md`. Actividades AT-01 a AT-07.

14. **Estrategia de Proteccion de Datos de Menores**: `documentation/Sprint5_Proteccion_Datos_Menores.md`. Analisis del estado actual, medidas tecnicas y organizativas, y justificacion de las decisiones.

15. **Sprint 5 — Plan de Tareas**: `documentation/Sprint5_Tareas.md`. Tareas T-701 a T-710 del eje de proteccion de datos.

16. **Architecture Decision Records**: `backend/docs/Architecture_Decisions.md`. ADRs 014-029 que documentan las decisiones arquitectonicas del Sprint 5.

---

*Documento elaborado como parte de la tarea T-701 (Fase B) del Sprint 5 del TFG «Plataforma de Juegos Educativos con RFID», en cumplimiento del Articulo 35 del Reglamento (UE) 2016/679 (RGPD). Este documento debe leerse en conjunto con el Registro de Actividades de Tratamiento (RAT) y la Estrategia de Proteccion de Datos de Menores.*