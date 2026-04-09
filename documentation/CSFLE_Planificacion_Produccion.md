# Planificacion de Atlas CSFLE para Produccion

**Plataforma Eduplay -- Juegos Educativos con RFID**

| Campo | Valor |
|-------|-------|
| **Tarea** | T-716 |
| **Autor** | Samuel Blanchart Perez |
| **Fecha de elaboracion** | 08-04-2026 |
| **Version** | 1.0 |
| **Clasificacion** | Documento tecnico -- Planificacion de seguridad |
| **Base normativa** | Articulo 32.1.a) del Reglamento (UE) 2016/679 (RGPD) |
| **Referencia EIPD** | `documentation/EIPD_Evaluacion_Impacto.md` |

---

## Indice

1. [Contexto y motivacion](#1-contexto-y-motivacion)
2. [Requisitos de infraestructura](#2-requisitos-de-infraestructura)
3. [Campos candidatos a CSFLE](#3-campos-candidatos-a-csfle)
4. [CSFLE vs Queryable Encryption (MongoDB 7.0+)](#4-csfle-vs-queryable-encryption-mongodb-70)
5. [Impacto en codigo](#5-impacto-en-codigo)
6. [Roadmap de implementacion](#6-roadmap-de-implementacion)
7. [Referencias](#7-referencias)

---

## 1. Contexto y motivacion

### 1.1 Estado actual del cifrado en Eduplay

La plataforma Eduplay gestiona datos personales de menores de entre 4 y 8 anos, un colectivo reconocido como especialmente vulnerable por el Considerando 38 del RGPD y por la Agencia Espanola de Proteccion de Datos (AEPD). Actualmente, la plataforma implementa las siguientes capas de cifrado:

| Capa | Mecanismo | Estado |
|------|-----------|--------|
| **Cifrado en transito** | TLS/HTTPS en todas las comunicaciones cliente-servidor | Implementado |
| **Cifrado en reposo** | AES-256 proporcionado por MongoDB Atlas de forma transparente | Implementado |
| **Cifrado de credenciales** | bcrypt con factor de coste configurable para contrasenas de profesores | Implementado |
| **Cifrado a nivel de campo** | No implementado | Pendiente |

### 1.2 Justificacion normativa

El **Articulo 32.1.a) del RGPD** establece que el responsable y el encargado del tratamiento deben aplicar medidas tecnicas apropiadas para garantizar un nivel de seguridad adecuado al riesgo, mencionando expresamente:

> *"la seudonimizacion y el cifrado de datos personales"*

El cifrado en reposo de Atlas protege contra el acceso no autorizado al almacenamiento fisico (disco), pero **no protege** contra los siguientes escenarios:

- **Acceso no autorizado a la base de datos con credenciales validas:** un atacante que obtenga las credenciales de conexion a MongoDB (por ejemplo, mediante una filtracion de la variable de entorno `MONGO_URI`) podria leer todos los datos en texto claro a traves de consultas estandar.
- **Acceso privilegiado del administrador de infraestructura:** los operadores de Atlas con acceso administrativo al cluster pueden inspeccionar los datos almacenados, ya que el cifrado en reposo se descifra de forma transparente en el servidor.
- **Dump o backup comprometido:** si un backup de la base de datos es exfiltrado, los datos personales serian legibles una vez restaurados, dado que el cifrado en reposo se aplica a nivel de almacenamiento y no a nivel de contenido del documento.

Client-Side Field Level Encryption (CSFLE) mitiga estos tres escenarios cifrando los campos sensibles **antes de que abandonen la aplicacion**, de modo que el servidor MongoDB nunca tiene acceso al texto claro. Esto constituye una implementacion directa del principio de cifrado del Art. 32.1.a) como medida complementaria al cifrado en reposo.

### 1.3 Relevancia especifica para datos de menores

La EIPD de Eduplay (`documentation/EIPD_Evaluacion_Impacto.md`) identifica el riesgo R-01 (acceso no autorizado a datos personales de menores) como un riesgo de severidad alta. CSFLE actua como medida de defensa en profundidad, anadiendo una capa de proteccion que mantiene los datos cifrados incluso en caso de compromiso parcial de la infraestructura.

---

## 2. Requisitos de infraestructura

### 2.1 Tier de MongoDB Atlas

CSFLE con cifrado automatico requiere un cluster Atlas de **tier M10 o superior**. Los clusters compartidos (M0, M2, M5) no soportan CSFLE automatico.

| Aspecto | Requisito |
|---------|-----------|
| **Tier minimo** | M10 (Dedicated) |
| **Version de MongoDB** | 4.2+ para CSFLE, 7.0+ para Queryable Encryption |
| **Coste estimado** | Desde ~57 USD/mes (M10, region EU) |
| **Cluster actual** | Verificar tier actual en la consola de Atlas |

**Nota:** El tier M10 es tambien el minimo recomendado para entornos de produccion por motivos de rendimiento y disponibilidad, independientemente de CSFLE.

### 2.2 Servicio de gestion de claves (KMS)

CSFLE requiere un Key Management Service (KMS) externo para almacenar la Customer Master Key (CMK). La CMK se utiliza para cifrar las Data Encryption Keys (DEK) que, a su vez, cifran los campos individuales. Las opciones son:

| Proveedor | Servicio | Ventaja principal | Coste orientativo |
|-----------|----------|-------------------|-------------------|
| **AWS** | AWS KMS | Integracion nativa con Atlas, amplia documentacion | ~1 USD/mes por clave + 0,03 USD/10k solicitudes |
| **Azure** | Azure Key Vault | Integracion con ecosistema Microsoft | ~0,03 USD/10k operaciones |
| **GCP** | Cloud KMS | Integracion con ecosistema Google | ~0,06 USD/10k operaciones |
| **Local** | Local Key Provider | Sin coste, **solo para desarrollo y pruebas** | Gratuito |

**Recomendacion para Eduplay:** Dado que el proyecto es un TFG y el presupuesto es limitado, se recomienda:

- **Desarrollo/pruebas:** Local Key Provider (clave almacenada en fichero local, nunca en el repositorio).
- **Produccion:** AWS KMS o el KMS del proveedor cloud donde se despliegue, por su bajo coste y amplia documentacion con MongoDB.

### 2.3 Requisitos del driver y dependencias

| Dependencia | Version minima | Version actual en Eduplay |
|-------------|----------------|---------------------------|
| `mongoose` | 6.0+ (soporte CSFLE via opciones de conexion) | 9.4.1 |
| `mongodb` (driver nativo) | 6.0+ | Gestionado por Mongoose 9.x |
| `mongodb-client-encryption` | 6.0+ | **No instalado** (nueva dependencia) |
| `mongocryptd` o `crypt_shared` | Incluido con MongoDB Enterprise o descargable | **No instalado** |

La libreria `mongodb-client-encryption` es la que proporciona el cifrado/descifrado en el lado del cliente. Se instala como dependencia adicional:

```bash
npm install mongodb-client-encryption
```

Adicionalmente, se necesita la shared library `mongo_crypt_v1.so` (o su equivalente en el sistema operativo), que puede obtenerse de dos formas:

1. **Automatic Encryption Shared Library** (`crypt_shared`): descargable desde el MongoDB Download Center. Es la opcion recomendada para entornos sin MongoDB Enterprise.
2. **mongocryptd**: proceso auxiliar incluido en MongoDB Enterprise Server. Requiere ejecutar un demonio adicional.

Para Eduplay, la opcion recomendada es `crypt_shared` por no requerir un proceso separado ni licencia Enterprise.

---

## 3. Campos candidatos a CSFLE

### 3.1 Modelo de datos actual (User, rol student)

El modelo `User` (`backend/src/models/User.js`) almacena los siguientes campos con datos personales de estudiantes (menores):

| Campo | Tipo | Contenido | Clasificacion PII |
|-------|------|-----------|-------------------|
| `name` | String | Nombre completo del alumno | Dato identificativo directo |
| `profile.age` | Number | Edad del alumno (3-99) | Dato demografico sensible (menor) |
| `profile.classroom` | String | Aula a la que pertenece | Dato de contexto educativo |
| `createdBy` | ObjectId | Referencia al profesor que lo creo | Dato relacional |

Nota: `profile.birthdate` fue eliminado como medida de minimizacion (T-701), reemplazandolo por `profile.age` como campo menos identificativo.

### 3.2 Analisis campo por campo

#### 3.2.1 `name` (nombre del estudiante)

**Relevancia:** Es el campo mas identificativo. El nombre completo de un menor es un dato personal directo segun el Art. 4.1 del RGPD.

**Tipo de cifrado aplicable:**

- **Deterministic encryption:** Permite busquedas de igualdad exacta (`{name: "Maria Lopez"}`). El mismo valor de entrada produce siempre el mismo texto cifrado, lo que habilita comparaciones exactas en el servidor.
- **Random encryption:** Cada cifrado produce un texto diferente. No permite ninguna consulta sobre el campo.

**Consultas afectadas:**

| Consulta | Ubicacion en codigo | Tipo de busqueda | Compatible con deterministic |
|----------|---------------------|------------------|------------------------------|
| Busqueda de duplicados | `userService.findDuplicateStudent()` | Regex case-insensitive: `$regex: ^nombre$, $options: 'i'` | **NO** -- regex no funciona sobre campos cifrados |
| Busqueda general (search) | `userController` via `filterBuilder` | Regex parcial: `$regex: termino, $options: 'i'` | **NO** -- regex no funciona sobre campos cifrados |
| Listado de estudiantes | `userController.getMyStudents()` | Sin filtro por nombre | Si (no afectado) |

**Impacto critico:** La busqueda de duplicados utiliza regex case-insensitive (`$regex: ^nombre$, $options: 'i'`), que **no es compatible** con cifrado deterministico. Seria necesario:

1. Normalizar el nombre antes de cifrar (lowercase + trim), para que la comparacion exacta funcione como sustituto de la comparacion case-insensitive.
2. Adaptar `findDuplicateStudent()` para buscar por igualdad exacta sobre el nombre normalizado cifrado.
3. Aceptar la perdida de la busqueda parcial de texto (search) sobre el nombre, o implementar un indice de busqueda separado con datos seudonimizados.

**Veredicto:** Candidato a cifrado deterministico, con refactorizacion obligatoria de las consultas regex.

#### 3.2.2 `profile.age` (edad del alumno)

**Relevancia:** Dato demografico que, combinado con otros campos (nombre, aula), puede contribuir a la identificacion del menor.

**Tipo de cifrado aplicable:**

- **Deterministic encryption:** Tecnicamente posible, pero **desaconsejado** para este campo. El espacio de valores posibles es extremadamente reducido (rango 3-12 en la practica, limitado por las validaciones del schema). Un atacante con acceso a los datos cifrados podria realizar un ataque de analisis de frecuencia: al conocer que solo existen ~10 valores posibles, podria construir una tabla de correspondencia cifrando cada valor posible y comparando con los textos cifrados almacenados.
- **Random encryption:** Seguro contra analisis de frecuencia, pero imposibilita cualquier consulta o filtro por edad.

**Consultas afectadas:**

| Consulta | Tipo de busqueda | Compatible con deterministic |
|----------|------------------|------------------------------|
| Filtrado de alumnos por edad | Igualdad o rango | Igualdad si, rango **NO** |
| Analytics por distribucion de edad | Agregacion | **NO** -- no se puede agregar sobre campos cifrados |

**Veredicto:** No recomendado para cifrado deterministico por la vulnerabilidad a analisis de frecuencia. Podria considerarse cifrado random si se acepta perder la capacidad de filtrado y agregacion por edad, o bien evaluar Queryable Encryption (seccion 4) que mitiga este problema.

#### 3.2.3 `profile.classroom` (aula del alumno)

**Relevancia:** Dato de contexto educativo. Por si solo no identifica a un menor, pero combinado con nombre y edad facilita la identificacion.

**Tipo de cifrado aplicable:**

- **Deterministic encryption:** Adecuado. El espacio de valores es moderado (mas amplio que la edad) y la busqueda de igualdad exacta es el patron de consulta principal.

**Consultas afectadas:**

| Consulta | Tipo de busqueda | Compatible con deterministic |
|----------|------------------|------------------------------|
| Filtrado de alumnos por aula | Igualdad exacta | **Si** |
| Busqueda de duplicados | Igualdad exacta dentro de `findDuplicateStudent()` | **Si** |
| Indice compuesto `{role, profile.classroom}` | Indice | **Si** (CSFLE soporta indices sobre campos deterministicos) |

**Veredicto:** Buen candidato a cifrado deterministico. Impacto minimo en las consultas existentes.

### 3.3 Resumen de candidatos

| Campo | Tipo de cifrado recomendado | Impacto en queries | Dificultad de adaptacion |
|-------|----------------------------|--------------------|--------------------------| 
| `name` | Deterministico (con normalizacion) | Alto (refactorizar regex a igualdad exacta) | Media-Alta |
| `profile.age` | No recomendado (CSFLE) / Evaluar QE | Alto (pierde filtros y agregaciones) | Alta |
| `profile.classroom` | Deterministico | Bajo (consultas ya usan igualdad) | Baja |

---

## 4. CSFLE vs Queryable Encryption (MongoDB 7.0+)

### 4.1 Comparativa tecnica

MongoDB ofrece dos tecnologias de cifrado a nivel de campo. La siguiente tabla resume sus diferencias:

| Caracteristica | CSFLE (Client-Side Field Level Encryption) | Queryable Encryption (QE) |
|----------------|---------------------------------------------|---------------------------|
| **Disponibilidad** | MongoDB 4.2+ | MongoDB 7.0+ (GA) |
| **Donde se cifra** | En el driver del cliente, antes de enviar al servidor | En el driver del cliente, antes de enviar al servidor |
| **Tipos de cifrado** | Deterministico y Random | Cifrado estructurado (basado en esquema) |
| **Consultas de igualdad** | Solo con cifrado deterministico | Si, sobre campos cifrados |
| **Consultas de rango** | No soportadas | Si (desde MongoDB 8.0 en GA; preview en 7.0) |
| **Consultas regex/texto** | No soportadas | No soportadas |
| **Agregaciones** | No sobre campos cifrados | Limitadas (igualdad en `$match`) |
| **Vulnerabilidad a analisis de frecuencia** | Si (cifrado deterministico) | No (cada valor cifrado es unico) |
| **Almacenamiento adicional** | Coleccion `__keyVault` para DEKs | Coleccion `__keyVault` + colecciones auxiliares de metadatos (indice cifrado) |
| **Soporte en Mongoose** | Via opciones de `MongoClient` subyacente | Via opciones de `MongoClient` subyacente |
| **Complejidad de configuracion** | Media | Media-Alta |
| **Impacto en rendimiento** | Bajo (cifrado/descifrado local) | Medio (indices cifrados adicionales, mayor almacenamiento) |

### 4.2 Implicaciones para Eduplay

#### Con CSFLE

- `profile.classroom` puede cifrarse de forma deterministica sin impacto significativo.
- `name` requiere refactorizacion de queries regex pero es viable.
- `profile.age` no deberia cifrarse de forma deterministica por su espacio de valores reducido.

#### Con Queryable Encryption

- `profile.age` **si podria cifrarse** de forma segura, ya que QE no es vulnerable a analisis de frecuencia (cada cifrado produce un texto diferente, pero aun permite consultas de igualdad).
- `name` se beneficia igualmente (consultas de igualdad sin exposicion a frecuencia).
- `profile.classroom` funciona igual de bien que con CSFLE.
- Las consultas regex seguirian sin estar soportadas en ningun caso.

### 4.3 Recomendacion

Se recomienda **Queryable Encryption** como tecnologia objetivo por las siguientes razones:

1. **Mayor seguridad:** No es vulnerable a analisis de frecuencia, lo que lo hace adecuado para campos con espacio de valores reducido como `profile.age`.
2. **Compatibilidad con el stack:** Eduplay utiliza MongoDB 7.0+ (requisito del `docker-compose.yml`), por lo que QE esta disponible.
3. **Futuro de MongoDB:** MongoDB esta invirtiendo su desarrollo activo en Queryable Encryption como sucesor de CSFLE. Las consultas de rango (GA desde 8.0) amplian las posibilidades futuras.
4. **Mismo modelo de amenazas:** Ambas tecnologias cifran en el cliente, por lo que ofrecen la misma proteccion contra acceso no autorizado al servidor.

**Contrapartida a considerar:** Queryable Encryption genera colecciones auxiliares de metadatos y requiere mas almacenamiento. En el contexto de Eduplay (cientos de estudiantes, no millones), este incremento es despreciable.

**Estrategia hibrida:** Dado que las consultas regex sobre `name` no estan soportadas por ninguna de las dos tecnologias, se debera:

1. Normalizar el campo `name` antes de cifrar (lowercase + trim).
2. Reemplazar las busquedas regex por busquedas de igualdad exacta sobre el valor normalizado.
3. Si se necesita busqueda parcial de texto en el futuro, mantener un campo derivado seudonimizado (por ejemplo, iniciales + hash parcial) como indice de busqueda no cifrado.

---

## 5. Impacto en codigo

### 5.1 Configuracion de conexion (database.js)

El archivo `backend/src/config/database.js` utiliza `mongoose.connect()` con la URI de conexion. Para habilitar cifrado automatico, se debe pasar un objeto `autoEncryption` en las opciones de conexion del driver nativo subyacente:

```javascript
// Ejemplo conceptual — NO implementar directamente
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const autoEncryptionOpts = {
  keyVaultNamespace: 'encryption.__keyVault',
  kmsProviders: {
    // AWS KMS (produccion)
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
    // O Local Key Provider (solo desarrollo)
    // local: { key: localMasterKey }
  },
  schemaMap: {
    'eduplay.users': {
      bsonType: 'object',
      encryptMetadata: {
        keyId: [dataKeyId]
      },
      properties: {
        name: {
          encrypt: {
            bsonType: 'string',
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
            // O 'Indexed' para Queryable Encryption
          }
        },
        'profile.classroom': {
          encrypt: {
            bsonType: 'string',
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic'
          }
        }
      }
    }
  },
  extraOptions: {
    cryptSharedLibPath: '/ruta/a/mongo_crypt_v1.so'
  }
};

// Con Mongoose, las opciones se pasan al driver subyacente
await mongoose.connect(process.env.MONGO_URI, {
  autoEncryption: autoEncryptionOpts
});
```

### 5.2 Schema map para campos cifrados

Se necesita definir un JSON schema map que declare que campos deben cifrarse y con que algoritmo. Este schema map se puede:

1. **Especificar en el cliente** (opcion `schemaMap` en `autoEncryption`): el driver aplica el cifrado sin depender del servidor. Es la opcion mas segura.
2. **Almacenar en el servidor** (schema validation en la coleccion): menos seguro, ya que depende de que el servidor aplique el schema.

**Recomendacion:** Especificar el schema map en el cliente para maxima seguridad.

### 5.3 Impacto en repositorios y servicios

| Componente | Cambio necesario | Esfuerzo |
|------------|------------------|----------|
| `config/database.js` | Anadir opciones `autoEncryption` a la conexion de Mongoose | Bajo |
| `models/User.js` | Sin cambios directos (el cifrado es transparente para Mongoose) | Ninguno |
| `services/userService.js` | Refactorizar `findDuplicateStudent()`: reemplazar regex por igualdad exacta sobre nombre normalizado | Medio |
| `controllers/userController.js` | Adaptar filtro `search` del `filterBuilder`: eliminar regex sobre `name` para estudiantes, o implementar mecanismo alternativo de busqueda | Medio |
| `controllers/adminController.js` | Mismo impacto que `userController` para la busqueda por nombre | Medio |
| `repositories/userRepository.js` | Sin cambios (las queries se adaptan en los servicios/controllers) | Ninguno |
| `utils/filterBuilder.js` | Evaluar si los filtros tipo `search` y `regex` deben excluir campos cifrados | Bajo |
| Tests (`tests/`) | Actualizar tests de integracion para configurar el cifrado en el entorno de test | Medio |
| Variables de entorno | Anadir credenciales KMS, ruta de `crypt_shared`, namespace del key vault | Bajo |

### 5.4 Migracion de datos existentes

Los datos existentes en la coleccion `users` estan almacenados en texto claro. La activacion de CSFLE/QE no cifra retroactivamente los documentos existentes. Se necesita un script de migracion que:

1. Lea cada documento de la coleccion con el driver sin cifrado.
2. Escriba el documento actualizado con el driver configurado con cifrado (lo que cifra automaticamente los campos declarados en el schema map).
3. Verifique la integridad de los datos migrados.
4. Elimine los documentos originales en texto claro.

Este script debe ejecutarse en una ventana de mantenimiento y tener un mecanismo de rollback.

---

## 6. Roadmap de implementacion

### 6.1 Vision general

La implementacion se divide en tres fases, siguiendo un enfoque incremental que minimiza el riesgo:

```
Fase 1: Infraestructura         Fase 2: PoC                    Fase 3: Rollout
(preparacion)                   (validacion)                   (produccion)
                                
  Atlas M10+                      Cifrar `name`                  Cifrar todos los campos
  KMS configurado                 Adaptar queries                Migracion de datos
  crypt_shared instalado          Tests de integracion           Validacion completa
  Key vault creado                Benchmark rendimiento          Documentacion EIPD
                                
  ~1-2 dias                       ~2-3 dias                      ~2-3 dias
```

### 6.2 Fase 1: Configuracion de infraestructura

**Objetivo:** Preparar todos los componentes de infraestructura necesarios para CSFLE/QE.

**Tareas:**

| # | Tarea | Detalle | Esfuerzo |
|---|-------|---------|----------|
| 1.1 | Escalar cluster Atlas a M10+ | Verificar tier actual, planificar escalado, evaluar coste mensual | 1h |
| 1.2 | Configurar KMS | Crear clave maestra (CMK) en AWS KMS (o equivalente). Configurar IAM con permisos minimos (kms:Encrypt, kms:Decrypt) | 2h |
| 1.3 | Instalar `mongodb-client-encryption` | Anadir dependencia al proyecto. Verificar compatibilidad con Mongoose 9.x | 0,5h |
| 1.4 | Obtener `crypt_shared` library | Descargar la Automatic Encryption Shared Library para el sistema operativo de produccion. Configurar ruta | 1h |
| 1.5 | Crear key vault | Inicializar la coleccion `encryption.__keyVault` con un indice unico en `keyAltNames`. Generar la Data Encryption Key (DEK) | 1h |
| 1.6 | Configurar Local Key Provider para desarrollo | Crear script que genere una clave local de 96 bytes para el entorno de desarrollo/test | 0,5h |

**Esfuerzo total estimado:** 1 dia (6 horas efectivas).

**Criterios de completitud:**

- Cluster Atlas en tier M10+ operativo.
- CMK creada en KMS con politica IAM configurada.
- `mongodb-client-encryption` instalado y verificado.
- DEK generada y almacenada en el key vault.
- Entorno de desarrollo con Local Key Provider funcional.

### 6.3 Fase 2: Prueba de concepto con `name`

**Objetivo:** Validar la tecnologia cifrando el campo `name` de los estudiantes y adaptando las queries afectadas.

**Tareas:**

| # | Tarea | Detalle | Esfuerzo |
|---|-------|---------|----------|
| 2.1 | Definir schema map para `name` | Crear el JSON schema map con cifrado deterministico (CSFLE) o indexed (QE) para el campo `name` | 1h |
| 2.2 | Modificar `database.js` | Integrar opciones de `autoEncryption` en la conexion de Mongoose. Parametrizar con variables de entorno | 2h |
| 2.3 | Normalizar `name` antes de cifrar | Implementar middleware pre-save que normalice (lowercase + trim) el nombre antes del cifrado. Garantizar que `findDuplicateStudent()` compare sobre el mismo formato | 2h |
| 2.4 | Refactorizar queries regex sobre `name` | Adaptar `userService.findDuplicateStudent()` para usar igualdad exacta. Adaptar `filterBuilder` search para excluir `name` de regex o usar campo derivado | 3h |
| 2.5 | Actualizar tests | Adaptar tests de integracion de usuarios para configurar cifrado en el entorno de test. Anadir tests especificos para cifrado/descifrado | 3h |
| 2.6 | Benchmark de rendimiento | Medir latencia de operaciones CRUD con y sin cifrado. Verificar que el impacto es aceptable para el caso de uso educativo | 1h |

**Esfuerzo total estimado:** 2 dias (12 horas efectivas).

**Criterios de completitud:**

- Campo `name` cifrado en la base de datos (texto cifrado visible en Atlas Data Explorer).
- Todas las queries existentes funcionan correctamente.
- Tests de integracion pasan.
- Benchmark documentado con resultados aceptables.

### 6.4 Fase 3: Rollout completo a produccion

**Objetivo:** Extender el cifrado a todos los campos candidatos y migrar los datos existentes.

**Tareas:**

| # | Tarea | Detalle | Esfuerzo |
|---|-------|---------|----------|
| 3.1 | Extender schema map | Anadir `profile.classroom` al schema map. Evaluar inclusion de `profile.age` si se opta por QE | 1h |
| 3.2 | Script de migracion de datos | Crear script que lea documentos existentes y los reescriba con cifrado. Incluir validacion de integridad y mecanismo de rollback | 4h |
| 3.3 | Ejecutar migracion en staging | Probar el script de migracion contra una copia de los datos de produccion | 1h |
| 3.4 | Ejecutar migracion en produccion | Planificar ventana de mantenimiento. Ejecutar migracion con backup previo | 1h |
| 3.5 | Validacion end-to-end | Verificar todos los flujos de la aplicacion: crear alumno, listar alumnos, buscar duplicados, analytics, exportacion de datos | 2h |
| 3.6 | Actualizar EIPD | Documentar CSFLE/QE como medida implementada en la EIPD (riesgo R-01, seccion de medidas de mitigacion) | 1h |
| 3.7 | Actualizar RAT | Actualizar el RAT con la nueva medida de cifrado a nivel de campo | 0,5h |
| 3.8 | Documentar procedimiento de rotacion de claves | Crear procedimiento operativo para la rotacion periodica de la DEK y la CMK | 1h |

**Esfuerzo total estimado:** 2 dias (11,5 horas efectivas).

**Criterios de completitud:**

- Todos los campos candidatos cifrados en produccion.
- Datos existentes migrados y verificados.
- EIPD y RAT actualizados.
- Procedimiento de rotacion de claves documentado.
- Todos los tests pasan.

### 6.5 Resumen de esfuerzo total

| Fase | Descripcion | Esfuerzo estimado |
|------|-------------|-------------------|
| Fase 1 | Infraestructura | 1 dia |
| Fase 2 | PoC (campo `name`) | 2 dias |
| Fase 3 | Rollout completo | 2 dias |
| **Total** | | **5 dias** |

Este esfuerzo es compatible con la estimacion original de la tarea T-716 (tamano L, 1-2 dias para la planificacion; la implementacion efectiva se realizaria en un sprint posterior).

---

## 7. Referencias

### 7.1 Normativa

- **Reglamento (UE) 2016/679 (RGPD)**, Articulo 32.1.a): Seguridad del tratamiento -- cifrado de datos personales.
- **Reglamento (UE) 2016/679 (RGPD)**, Considerando 83: El responsable debe evaluar los riesgos del tratamiento y aplicar medidas para mitigarlos, como el cifrado.
- **Ley Organica 3/2018 (LOPDGDD)**, Articulo 7: Consentimiento de los menores de edad.
- **EIPD de Eduplay**: `documentation/EIPD_Evaluacion_Impacto.md`.

### 7.2 Documentacion tecnica de MongoDB

- MongoDB CSFLE Overview: https://www.mongodb.com/docs/manual/core/csfle/
- Queryable Encryption Overview: https://www.mongodb.com/docs/manual/core/queryable-encryption/
- CSFLE con Node.js: https://www.mongodb.com/docs/manual/core/csfle/tutorials/aws/node/
- Queryable Encryption con Node.js: https://www.mongodb.com/docs/manual/core/queryable-encryption/tutorials/
- Automatic Encryption Shared Library: https://www.mongodb.com/docs/manual/core/queryable-encryption/reference/shared-library/
- Key Management Interoperability (KMIP): https://www.mongodb.com/docs/manual/core/csfle/reference/kms-providers/

### 7.3 Documentacion interna del proyecto

- Modelo User: `backend/src/models/User.js`
- Configuracion de base de datos: `backend/src/config/database.js`
- Servicio de usuarios: `backend/src/services/userService.js`
- FilterBuilder: `backend/src/utils/filterBuilder.js`
- EIPD: `documentation/EIPD_Evaluacion_Impacto.md`
- RAT: `backend/docs/RAT_Registro_Actividades_Tratamiento.md`
- Proteccion de datos de menores (Sprint 5): `documentation/Sprint5_Proteccion_Datos_Menores.md`
