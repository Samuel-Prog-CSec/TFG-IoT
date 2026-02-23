<!-- markdownlint-disable MD025 MD031 MD032 MD036 MD058 MD060 -->

# Documento de Requisitos del Sistema

## Plataforma de Juegos Educativos con RFID

**Proyecto:** Trabajo de Fin de Grado (TFG)  
**Autor:** Samuel Blanchart Pérez  
**Versión:** 0.1.0  
**Fecha:** Diciembre 2025  
**Última Actualización:** Actualizado con decisiones de Dudas Diciembre 2025

---

## Índice

1. [Descripción General](#1-descripción-general)
2. [Requisitos Funcionales (RF)](#requisitos-funcionales-rf)
   - [Gestión de Usuarios (RF-USR)](#rf-usr-gestión-de-usuarios)
   - [Sistema de Juegos (RF-JGO)](#rf-jgo-sistema-de-juegos)
   - [Hardware RFID (RF-RFID)](#rf-rfid-sistema-de-tarjetas-y-sensor-rfid)
   - [Comunicación Tiempo Real (RF-RT)](#rf-rt-comunicación-en-tiempo-real)
   - [Requisitos Futuros (RF-FUT)](#rf-fut-requisitos-futuros)
3. [Requisitos No Funcionales (RNF)](#requisitos-no-funcionales-rnf)
   - [Seguridad (RNF-SEG)](#rnf-seg-seguridad)
   - [Rendimiento (RNF-REN)](#rnf-ren-rendimiento)
   - [Calidad (RNF-CAL)](#rnf-cal-calidad)

---

## 1. Descripción General

### 1.1 Propósito

El sistema es una **plataforma de juegos educativos interactivos** que utiliza **tecnología RFID** para permitir a estudiantes de educación infantil (4-6 años) responder desafíos de aprendizaje mediante tarjetas físicas. Los profesores configuran y supervisan las sesiones de juego, mientras que los alumnos interactúan únicamente con el sensor RFID.

### 1.2 Usuarios del Sistema

| Rol | Descripción | Acceso |
|-----|-------------|--------|
| **Super Admin** | Administrador que valida nuevas cuentas de profesores | Panel de administración |
| **Profesor** | Usuario adulto que gestiona la plataforma, crea sesiones y supervisa alumnos | Aplicación web completa |
| **Alumno** | Niño de 4-6 años que juega partidas asignadas | Solo sensor RFID físico |

### 1.3 Decisiones Arquitectónicas Clave

> **Nota:** Las siguientes decisiones fueron tomadas en las reuniones de Diciembre 2025.

| Decisión | Descripción |
|----------|-------------|
| **Sistema Centralizado** | Todos los centros educativos usan el mismo sistema. No hay distinción entre centros. |
| **Sin Límites de Uso** | No hay límite de alumnos por profesor ni de partidas simultáneas. |
| **Datos Compartidos** | Las tarjetas y contextos son compartidos entre todos los profesores. |
| **Redis para Estado** | El estado de partidas activas y tokens se almacena en Redis. |

---

# Requisitos Funcionales (RF)

---

## RF-USR: Gestión de Usuarios

### RF-USR-001: Registro de Profesores ✅

**Descripción:** El sistema debe permitir el registro de usuarios con rol "profesor" mediante email y contraseña.

**Criterios de Aceptación:**
- El email debe ser único en el sistema
- La contraseña debe tener mínimo 6 caracteres
- El nombre es obligatorio (2-100 caracteres)
- El sistema debe encriptar la contraseña con bcrypt (10 rounds)
- El rol se asigna automáticamente como "teacher"

**Endpoint:** `POST /api/auth/register`

---

### RF-USR-002: Inicio de Sesión de Profesores ✅

**Descripción:** El sistema debe permitir el inicio de sesión de profesores mediante email y contraseña.

**Criterios de Aceptación:**
- Validar credenciales contra la base de datos
- Generar par de tokens JWT (access + refresh)
- Actualizar campo `lastLoginAt` del usuario
- Implementar device fingerprinting para seguridad

**Endpoint:** `POST /api/auth/login`

---

### RF-USR-003: Cierre de Sesión ✅

**Descripción:** El sistema debe permitir cerrar sesión revocando los tokens activos.

**Criterios de Aceptación:**
- Añadir access token a blacklist
- Opcionalmente revocar refresh token si se proporciona
- Tokens revocados no pueden usarse hasta su expiración natural

**Endpoint:** `POST /api/auth/logout`

---

### RF-USR-004: Renovación de Token ✅

**Descripción:** El sistema debe permitir renovar el access token usando un refresh token válido.

**Criterios de Aceptación:**
- Verificar validez del refresh token
- Verificar fingerprint del dispositivo
- Generar nuevo par de tokens (rotación)
- Revocar el refresh token anterior

**Endpoint:** `POST /api/auth/refresh`

---

### RF-USR-005: Consulta de Perfil Propio ✅

**Descripción:** Un profesor autenticado debe poder consultar su información de perfil.

**Criterios de Aceptación:**
- Retornar datos del usuario sin contraseña
- Requiere autenticación JWT

**Endpoint:** `GET /api/auth/me`

---

### RF-USR-006: Actualización de Perfil Propio ✅

**Descripción:** Un profesor autenticado debe poder actualizar su información de perfil.

**Criterios de Aceptación:**
- Permitir actualizar nombre y avatar
- No permitir cambiar email ni rol
- Validar datos de entrada

**Endpoint:** `PUT /api/auth/me`

---

### RF-USR-007: Cambio de Contraseña ✅

**Descripción:** Un profesor autenticado debe poder cambiar su contraseña.

**Criterios de Aceptación:**
- Verificar contraseña actual
- Validar nueva contraseña (mínimo 6 caracteres)
- Encriptar y guardar nueva contraseña

**Endpoint:** `PUT /api/auth/change-password`

---

### RF-USR-008: Creación de Alumnos ✅

**Descripción:** Un `super_admin` debe poder crear usuarios alumnos SIN credenciales de acceso.

**Criterios de Aceptación:**
- Los alumnos NO tienen email ni contraseña
- Campo `createdBy` se asigna según el `teacherId` enviado por `super_admin`
- Validar que no exista alumno activo con mismo nombre en la misma clase del mismo profesor
- Campos requeridos: nombre, edad (3-99), `teacherId`
- Campos opcionales: edad (3-99), aula, fecha de nacimiento

**Endpoint:** `POST /api/users`

---

### RF-USR-009: Listado de Usuarios ✅

**Descripción:** Usuarios con rol `teacher` y `super_admin` deben poder listar usuarios del sistema.

**Criterios de Aceptación:**
- Soportar filtros por rol, estado, aula
- Implementar paginación
- `teacher`: solo puede listar sus alumnos
- `super_admin`: puede listar usuarios según filtros

**Endpoint:** `GET /api/users`

---

### RF-USR-010: Consulta de Usuario Individual ✅

**Descripción:** Un profesor debe poder consultar los detalles de un usuario específico.

**Criterios de Aceptación:**
- Retornar información completa del usuario (sin contraseña)
- Incluir métricas si es alumno

**Endpoint:** `GET /api/users/:id`

---

### RF-USR-011: Actualización de Alumno ✅

**Descripción:** Un profesor debe poder actualizar la información de un alumno.

**Criterios de Aceptación:**
- Permitir cambiar nombre, aula, edad, profesor asignado
- Validar duplicados de nombre en la misma clase
- No permitir añadir email/password a alumnos

**Endpoint:** `PUT /api/users/:id`

---

### RF-USR-012: Desactivación de Usuario ✅

**Descripción:** Un profesor debe poder desactivar un usuario (soft delete).

**Criterios de Aceptación:**
- Cambiar estado a "inactive"
- El usuario desactivado no puede participar en partidas
- Mantener historial de partidas anteriores

**Endpoint:** `DELETE /api/users/:id`

---

### RF-USR-013: Consulta de Estadísticas de Alumno ✅

**Descripción:** Un profesor debe poder consultar las métricas de aprendizaje de un alumno.

**Criterios de Aceptación:**
- Retornar: totalGamesPlayed, totalScore, averageScore, bestScore
- Retornar: totalCorrectAnswers, totalErrors, averageResponseTime
- Retornar: lastPlayedAt

**Endpoint:** `GET /api/users/:id/stats`

---

### RF-USR-014: Listado de Alumnos por Profesor ✅

**Descripción:** Un profesor debe poder listar todos los alumnos que ha creado.

**Criterios de Aceptación:**
- Filtrar por campo `createdBy`
- Soportar ordenamiento y paginación

**Endpoint:** `GET /api/users/teacher/:teacherId/students`

---

### RF-USR-015: Actualización Automática de Métricas ✅

**Descripción:** El sistema debe actualizar automáticamente las métricas del alumno al completar una partida.

**Criterios de Aceptación:**
- Incrementar totalGamesPlayed
- Actualizar totalScore, averageScore, bestScore
- Actualizar totalCorrectAnswers, totalErrors
- Recalcular averageResponseTime (promedio ponderado)
- Actualizar lastPlayedAt

**Método:** `User.updateStudentMetrics(playResults)`

---

### RF-USR-016: Sistema de Super Admin 📋 **[NUEVO - Duda #51]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El sistema debe tener un rol "super_admin" que valide las cuentas de profesores nuevos.

**Criterios de Aceptación:**
- Los profesores recién registrados tienen `accountStatus: 'pending_approval'`
- Solo super_admin puede cambiar el estado a `approved` o `rejected`
- Los profesores con estado `pending_approval` o `rejected` no pueden hacer login
- El primer super_admin se crea mediante seeder

**Endpoints:**
- `POST /api/admin/users/:id/approve` - Aprobar profesor
- `POST /api/admin/users/:id/reject` - Rechazar profesor

---

### RF-USR-017: Sesión Única por Dispositivo 📋 **[NUEVO - Duda #48]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Un profesor NO puede tener sesiones activas en múltiples dispositivos simultáneamente.

**Criterios de Aceptación:**
- Al iniciar sesión en un nuevo dispositivo, la sesión anterior se invalida automáticamente
- El dispositivo anterior recibe notificación WebSocket `session_invalidated`
- Se almacena `currentSessionId` en el usuario

---

### RF-USR-018: Transferencia de Alumnos 📋 **[NUEVO - Duda #32]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Los alumnos pueden transferirse a otro profesor manteniendo sus métricas históricas.

**Criterios de Aceptación:**
- Solo se modifica `createdBy` (profesor asignado) y `profile.classroom`
- Las métricas del alumno se mantienen íntegramente
- Solo `super_admin` puede realizar transferencias

**Endpoint:** `POST /api/users/:id/transfer`

---

### RF-USR-019: Anonimización de Datos (GDPR) 📋 **[NUEVO - Duda #31]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El sistema debe permitir anonimizar datos de alumnos cumpliendo con GDPR/LOPD.

**Criterios de Aceptación:**
- El nombre se reemplaza por "Usuario Anónimo #ID"
- Los datos sensibles del perfil se eliminan
- Las métricas se mantienen para estadísticas agregadas
- Se marca `isAnonymized: true`
- Se registra `anonymizedAt` con la fecha

**Endpoint:** `POST /api/users/:id/anonymize`

---

## RF-JGO: Sistema de Juegos

### RF-JGO-001: Gestión de Mecánicas de Juego ✅

**Descripción:** El sistema debe permitir gestionar las mecánicas de juego disponibles (Asociación, Secuencia, Memoria).

**Criterios de Aceptación:**
- CRUD completo de mecánicas
- Campos: name (único, lowercase), displayName, description, icon, rules, isActive
- Las mecánicas son independientes de los contextos (compatibilidad absoluta)

**Endpoints:**
- `GET /api/mechanics` - Listar mecánicas
- `GET /api/mechanics/active` - Listar mecánicas activas (público)
- `GET /api/mechanics/:id` - Obtener mecánica
- `POST /api/mechanics` - Crear mecánica
- `PUT /api/mechanics/:id` - Actualizar mecánica
- `DELETE /api/mechanics/:id` - Desactivar mecánica

---

### RF-JGO-002: Mecánica de Asociación ✅

**Descripción:** El sistema debe soportar la mecánica de "Asociación" donde el jugador empareja elementos.

**Criterios de Aceptación:**
- El sistema muestra un elemento (ej: bandera)
- El jugador debe escanear la tarjeta que corresponde al valor asociado (ej: país)
- Validación inmediata de respuesta correcta/incorrecta
- **Solo una respuesta correcta por ronda** (Duda #27)

---

### RF-JGO-003: Mecánica de Secuencia 📋

**Descripción:** El sistema debe soportar la mecánica de "Secuencia" donde el jugador ordena elementos.

**Estado:** Planificado para implementación futura

---

### RF-JGO-004: Mecánica de Memoria 📋

**Descripción:** El sistema debe soportar la mecánica de "Memoria" donde el jugador recuerda patrones.

**Estado:** Planificado para implementación futura

---

### RF-JGO-005: Extensibilidad de Mecánicas ✅

**Descripción:** El sistema debe permitir añadir nuevas mecánicas sin modificar el código existente.

**Criterios de Aceptación:**
- Estructura de datos flexible con campo `rules` de tipo Mixed
- Patrón Open/Closed aplicado
- Nuevas mecánicas se añaden vía seeders o API

---

### RF-JGO-006: Gestión de Contextos Temáticos ✅

**Descripción:** El sistema debe permitir gestionar contextos temáticos para los juegos.

**Criterios de Aceptación:**
- CRUD completo de contextos
- Campos: contextId (único), name, isActive, assets[]
- Los contextos son compatibles con TODAS las mecánicas (Duda #15.1)

**Endpoints:**
- `GET /api/contexts` - Listar contextos
- `GET /api/contexts/:id` - Obtener contexto
- `POST /api/contexts` - Crear contexto
- `PUT /api/contexts/:id` - Actualizar contexto
- `DELETE /api/contexts/:id` - Eliminar contexto

---

### RF-JGO-007: Assets de Contexto ✅

**Descripción:** Cada contexto debe contener un array de assets (elementos del tema).

**Estructura de Asset:**
```json
{
  "key": "spain",
  "display": "🇪🇸",
  "value": "España",
  "audioUrl": "https://supabase.../spain.mp3",
  "imageUrl": "https://supabase.../spain.png"
}
```

**Criterios de Aceptación:**
- Campo `key` único dentro del contexto (lowercase)
- Campo `value` requerido (texto descriptivo)
- Campos `display`, `audioUrl`, `imageUrl` opcionales
- El array de assets no puede estar vacío

---

### RF-JGO-008: Contextos Predefinidos ✅

**Descripción:** El sistema debe incluir contextos predefinidos mediante seeders.

**Contextos Base:**
- Geografía (países, banderas, capitales)
- Historia (eventos, fechas, personajes)
- Ciencias (elementos, fórmulas, procesos)
- Números (1-10 con representación visual)

---

### RF-JGO-009: Creación de Contextos por Profesor ✅

**Descripción:** Los profesores deben poder crear contextos personalizados.

**Criterios de Aceptación:**
- Interfaz para definir contextId y name
- Añadir assets con todos los campos
- Subir archivos multimedia a Supabase

---

### RF-JGO-010: Gestión de Assets Individual ✅

**Descripción:** El sistema debe permitir añadir y eliminar assets de un contexto.

**Endpoints:**
- `POST /api/contexts/:id/assets` - Añadir asset
- `DELETE /api/contexts/:id/assets/:key` - Eliminar asset
- `GET /api/contexts/:id/assets` - Listar assets

---

### RF-JGO-011: Almacenamiento de Multimedia ✅

**Descripción:** Los archivos multimedia deben almacenarse en Supabase Storage.

**Criterios de Aceptación:**
- Bucket: `game-assets`
- Nomenclatura: `{folder}/{timestamp}-{filename}`
- **Tipos permitidos: WebP para imágenes; MP3, OGG para audio** (Duda #44, actualizado: SVG rechazado por XSS)
- Tamaño máximo: 5MB por archivo
- URLs públicas retornadas
- **Conversión automática de PNG/JPG a WebP** (Duda #44)

**Endpoint:** `POST /api/assets/upload`

> **ACTUALIZACIÓN [Duda #44]:** Se modifican los formatos permitidos. Anteriormente se permitían PNG, JPG, GIF. Ahora **solo WebP** para imágenes (SVG rechazado por riesgos de seguridad XSS) para optimizar ancho de banda y almacenamiento.

---

### RF-JGO-012: Validación de Assets ✅

**Descripción:** El sistema debe validar los assets antes de guardarlos.

**Criterios de Aceptación:**
- Validar tipo MIME de archivos
- Validar tamaño máximo
- Sanitizar nombres de archivo
- Verificar URLs de Supabase válidas

---

### RF-JGO-013: Creación de Sesión de Juego ✅

**Descripción:** Un profesor debe poder crear una sesión de juego configurada.

**Criterios de Aceptación:**
- Seleccionar mecánica existente
- Seleccionar contexto existente
- Configurar reglas (rondas, tiempo, puntos)
- Asignar tarjetas RFID a valores del contexto
- Estado inicial: "created"

**Endpoint:** `POST /api/sessions`

---

### RF-JGO-014: Validación de Sesión ✅

**Descripción:** El sistema debe validar la configuración de la sesión antes de crearla.

**Criterios de Aceptación:**
- `numberOfCards` debe coincidir con `cardMappings.length`
- Todas las tarjetas deben existir y estar activas
- `assignedValue` debe corresponder a un asset del contexto
- Valores de config dentro de rangos permitidos

---

### RF-JGO-015: Cálculo Automático de Dificultad ✅

**Descripción:** El sistema debe calcular automáticamente la dificultad basándose en numberOfCards.

**Reglas:**
- Easy: 2-5 tarjetas
- Medium: 6-12 tarjetas
- Hard: 13-30 tarjetas

---

### RF-JGO-016: Estados de Sesión ✅

**Descripción:** Las sesiones deben tener estados que controlen su ciclo de vida.

**Estados:**
- `created`: Sesión configurada, no iniciada
- `active`: Sesión en curso, partidas pueden jugarse
- `paused`: Sesión pausada temporalmente
- `completed`: Sesión finalizada

---

### RF-JGO-017: Denormalización de UID ✅

**Descripción:** El UID de las tarjetas debe estar denormalizado en cardMappings para búsquedas O(1).

**Criterios de Aceptación:**
- Campo `uid` incluido en cada cardMapping
- Permite búsqueda directa sin JOIN a colección de cards
- Sincronizado con el cardId referenciado

---

### RF-JGO-018: CRUD de Sesiones ✅

**Descripción:** El sistema debe proporcionar operaciones CRUD completas para sesiones.

**Endpoints:**
- `GET /api/sessions` - Listar sesiones
- `GET /api/sessions/:id` - Obtener sesión
- `POST /api/sessions` - Crear sesión
- `PUT /api/sessions/:id` - Actualizar sesión
- `DELETE /api/sessions/:id` - Eliminar sesión
- `POST /api/sessions/:id/start` - Iniciar sesión
- `POST /api/sessions/:id/pause` - Pausar sesión
- `POST /api/sessions/:id/end` - Finalizar sesión

---

### RF-JGO-019: Múltiples Partidas por Sesión ✅

**Descripción:** Una sesión puede tener múltiples partidas asociadas (una por alumno).

**Criterios de Aceptación:**
- Varios alumnos pueden jugar la misma sesión
- Cada alumno tiene su propia partida (GamePlay)
- Las partidas son independientes entre sí
- Los alumnos juegan a su propio ritmo

---

### RF-JGO-020: Propiedad de Sesiones ✅

**Descripción:** Las sesiones deben estar asociadas al profesor que las creó.

**Criterios de Aceptación:**
- Campo `createdBy` referencia al profesor
- Solo el creador puede modificar/eliminar la sesión
- Profesores pueden ver sesiones de otros profesores (lectura)

---

### RF-JGO-021: Creación de Partida ✅

**Descripción:** Un profesor debe poder crear partidas asignando alumnos a sesiones.

**Criterios de Aceptación:**
- Asociar sessionId y playerId
- playerId debe ser un usuario con role='student'
- Estado inicial: "in-progress"
- Registrar startedAt automáticamente

**Endpoint:** `POST /api/plays`

---

### RF-JGO-022: Registro de Eventos ✅

**Descripción:** El sistema debe registrar todos los eventos durante una partida.

**Tipos de Eventos:**
- `round_start`: Inicio de ronda
- `card_scanned`: Tarjeta escaneada
- `correct`: Respuesta correcta
- `error`: Respuesta incorrecta
- `timeout`: Tiempo agotado
- `round_end`: Fin de ronda

---

### RF-JGO-023: Métricas de Partida ✅

**Descripción:** El sistema debe calcular y mantener métricas de cada partida.

**Métricas:**
- totalAttempts: Total de intentos
- correctAttempts: Respuestas correctas
- errorAttempts: Respuestas incorrectas
- timeoutAttempts: Timeouts
- averageResponseTime: Tiempo medio de respuesta (ms)
- completionTime: Duración total de la partida (ms)

---

### RF-JGO-024: Estados de Partida ✅

**Descripción:** Las partidas deben tener estados que controlen su ciclo de vida.

**Estados:**
- `in-progress`: Partida en curso
- `paused`: Partida pausada **(NUEVO - Duda #30)**
- `completed`: Partida finalizada exitosamente
- `abandoned`: Partida abandonada/cancelada

> **ACTUALIZACIÓN [Duda #30]:** Se añade estado `paused` para soportar pausa/reanudación de partidas.

---

### RF-JGO-025: CRUD de Partidas ✅

**Descripción:** El sistema debe proporcionar operaciones para gestionar partidas.

**Endpoints:**
- `GET /api/plays` - Listar partidas
- `GET /api/plays/:id` - Obtener partida
- `POST /api/plays` - Crear partida
- `POST /api/plays/:id/events` - Añadir evento
- `POST /api/plays/:id/complete` - Completar partida
- `POST /api/plays/:id/abandon` - Abandonar partida
- `POST /api/plays/:id/pause` - Pausar partida **(NUEVO)**
- `POST /api/plays/:id/resume` - Reanudar partida **(NUEVO)**
- `GET /api/plays/stats/:playerId` - Estadísticas del jugador

---

### RF-JGO-026: Orden Aleatorio de Rondas 📋 **[NUEVO - Duda #28]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Las rondas/desafíos deben presentarse en orden aleatorio.

**Criterios de Aceptación:**
- Los desafíos se seleccionan aleatoriamente de los cardMappings
- Las rondas fallidas NO se repiten al final
- No hay opción de orden secuencial (de momento)

---

### RF-JGO-027: Pausa y Reanudación de Partidas 📋 **[NUEVO - Duda #30]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Las partidas pueden pausarse y reanudarse, congelando el tiempo de la ronda actual.

**Criterios de Aceptación:**
- Al pausar, el timer se detiene y se guarda el tiempo restante
- Al reanudar, el timer continúa desde donde quedó
- Solo el profesor puede pausar/reanudar partidas
- Se emite evento WebSocket `play_paused` y `play_resumed`

---

### RF-JGO-028: Sistema de Mazos de Cartas 📋 **[NUEVO - Duda #36]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Los profesores pueden crear mazos de cartas preconfigurados para reutilizar en sesiones.

**Criterios de Aceptación:**
- Un mazo tiene: nombre, descripción, lista de cartas con valores predefinidos
- Opcionalmente asociado a un contexto
- Al crear una sesión, se puede seleccionar un mazo existente
- Las cartas del mazo se copian a cardMappings de la sesión

**Endpoints:**
- `GET /api/decks` - Listar mazos del profesor
- `GET /api/decks/:id` - Obtener mazo
- `POST /api/decks` - Crear mazo
- `PUT /api/decks/:id` - Actualizar mazo
- `DELETE /api/decks/:id` - Eliminar mazo

---

### RF-JGO-029: Contextos Compartidos 📋 **[NUEVO - Duda #45]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Los contextos creados por un profesor son visibles y usables por todos los profesores.

**Criterios de Aceptación:**
- Todos los contextos son públicos por defecto
- Opcionalmente un profesor puede marcar un contexto como privado
- Los contextos predefinidos (seeders) siempre son públicos

---

### RF-JGO-030: Sin Moderación de Contenido 📋 **[NUEVO - Duda #46]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** No se implementa moderación de assets subidos por profesores.

**Criterios de Aceptación:**
- Los profesores pueden subir assets sin revisión previa
- Se confía en que el contenido es apropiado
- Los profesores son responsables del contenido que suben

---

## RF-RFID: Sistema de Tarjetas y Sensor RFID

### RF-RFID-001: Registro de Tarjetas RFID ✅

**Descripción:** El sistema debe permitir registrar tarjetas RFID físicas en la base de datos.

**Criterios de Aceptación:**
- UID único en formato hexadecimal (8 o 14 caracteres)
- Conversión automática a mayúsculas
- Tipos soportados: MIFARE 1KB, MIFARE 4KB, NTAG, UNKNOWN
- Estado inicial: "active"

**Endpoint:** `POST /api/cards`

---

### RF-RFID-002: Validación de UID ✅

**Descripción:** El sistema debe validar el formato del UID de las tarjetas.

**Criterios de Aceptación:**
- Regex: `/^[0-9A-F]{8}$|^[0-9A-F]{14}$/`
- 8 caracteres: UID de 4 bytes (MIFARE Classic)
- 14 caracteres: UID de 7 bytes (NTAG, MIFARE Plus)
- Rechazo de formatos inválidos con error 400

---

### RF-RFID-003: Estados de Tarjeta ✅

**Descripción:** Las tarjetas deben tener estados que controlen su disponibilidad.

**Estados:**
- `active`: Tarjeta disponible para uso en juegos
- `inactive`: Tarjeta deshabilitada temporalmente
- `lost`: Tarjeta reportada como perdida

---

### RF-RFID-004: CRUD de Tarjetas ✅

**Descripción:** El sistema debe proporcionar operaciones CRUD para tarjetas.

**Endpoints:**
- `GET /api/cards` - Listar tarjetas
- `GET /api/cards/:id` - Obtener tarjeta
- `POST /api/cards` - Crear tarjeta
- `PUT /api/cards/:id` - Actualizar tarjeta
- `DELETE /api/cards/:id` - Desactivar tarjeta
- `POST /api/cards/batch` - Crear múltiples tarjetas
- `GET /api/cards/stats` - Estadísticas de tarjetas

---

### RF-RFID-005: Tarjetas Compartidas 📋 **[ACTUALIZADO - Duda #36]**

> **Este requisito ha sido ACTUALIZADO según las Dudas de Diciembre 2025.**

**Descripción:** Las tarjetas no están relacionadas con profesores específicos. Todos los profesores pueden usar todas las tarjetas.

**Criterios de Aceptación:**
- No hay campo `createdBy` obligatorio en las tarjetas
- Cualquier profesor puede asignar cualquier tarjeta a sus sesiones
- Los mazos permiten organizar tarjetas por profesor

> **NOTA:** El requisito anterior implicaba que las tarjetas podrían estar vinculadas a profesores. Esta actualización clarifica que son compartidas.

---

### RF-RFID-006: Comunicación Web Serial ✅

**Descripción:** El navegador del profesor debe comunicarse con el sensor RFID vía Web Serial y enviar eventos al backend.

**Criterios de Aceptación:**
- Lectura serial en el frontend con Web Serial API
- Normalización a contrato estable `{ uid, type, sensorId, timestamp, source }`
- Emisión al backend por Socket.IO (`rfid_scan_from_client`)
- Control de habilitación por variable de entorno (`RFID_SOURCE=client|disabled`)

---

### RF-RFID-007: Control de Conexión en Cliente ✅

**Descripción:** La UI debe permitir conectar y desconectar el sensor RFID de forma explícita.

**Criterios de Aceptación:**
- Botón de conectar/desconectar en las pantallas que lo requieran
- Indicador visual de estado (conectado, leyendo, desconectado)
- Mensaje claro si el navegador no soporta Web Serial

---

### RF-RFID-008: Eventos del Sensor ✅

**Descripción:** El sensor debe emitir eventos en formato JSON que el frontend procesa y reenvía al backend.

**Eventos Soportados:**
| Evento | Descripción | Payload |
|--------|-------------|---------|
| `init` | Sensor inicializado | `{ status, version }` |
| `card_detected` | Tarjeta detectada | `{ uid, type, size, sensor_id }` |
| `card_removed` | Tarjeta retirada | `{ uid, sensor_id }` |
| `error` | Error del sensor | `{ type, message }` |
| `status` | Heartbeat periódico | `{ uptime, cards_detected, free_heap }` |

> **ACTUALIZACIÓN [Duda #22]:** Los eventos ahora incluyen `sensor_id` para soportar múltiples sensores.

---

### RF-RFID-009: Buffer de Eventos ✅

**Descripción:** El servicio debe mantener un buffer circular de eventos recientes.

**Criterios de Aceptación:**
- Tamaño configurable (default: 100 eventos)
- Útil para debugging y auditoría
- Timestamp añadido a cada evento

---

### RF-RFID-010: Métricas del Servicio RFID ✅

**Descripción:** El servicio debe exponer métricas de rendimiento.

---

### RF-RFID-011: Soporte Múltiples Sensores 📋 **[NUEVO - Duda #22]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El sistema debe soportar múltiples sensores RFID conectados simultáneamente.

**Criterios de Aceptación:**
- Cada sensor tiene un ID único que se envía junto con la lectura
- El backend asocia la lectura a la partida correcta usando el sensor_id
- Se puede registrar y gestionar sensores independientemente

**Endpoints:**
- `POST /api/sensors/register` - Registrar sensor
- `GET /api/sensors` - Listar sensores
- `GET /api/sensors/:id` - Estado del sensor

---

### RF-RFID-012: Control de Procesamiento desde Frontend 📋 **[NUEVO - Dudas #25, #26]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El frontend indica al backend cuándo procesar eventos RFID.

**Criterios de Aceptación:**
- El frontend emite evento `rfid_mode` con modos: `idle`, `gameplay`, `card_register`, `card_assign`
- El backend solo procesa eventos RFID cuando el frontend lo ha solicitado
- Si el frontend no ha indicado modo, el backend ignora los eventos RFID

---

### RF-RFID-013: Descarte de Lecturas sin Backend 📋 **[NUEVO - Duda #23]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Si el backend pierde conexión, el ESP8266 descarta las lecturas (no hay buffer).

**Criterios de Aceptación:**
- El sensor no implementa buffer local (de momento)
- Las lecturas sin conexión se pierden
- Simplifica el diseño del firmware

---

### RF-RFID-014: Debounce en Frontend 📋 **[NUEVO - Duda #24]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El debounce para evitar lecturas duplicadas se gestiona en el frontend.

**Criterios de Aceptación:**
- El backend envía TODOS los eventos de tarjeta al frontend
- El frontend implementa debounce si es necesario
- Simplifica la lógica del backend

---

## RF-RT: Comunicación en Tiempo Real

### RF-RT-001: Gestión de Partidas Activas ✅

**Descripción:** El motor de juego debe mantener el estado de todas las partidas activas.

**Criterios de Aceptación:**
- **Estado almacenado en Redis** (Duda #39)
- Límite configurable de partidas simultáneas (**sin límite de momento** - Duda #21)
- Estado incluye: documentos, índices, timers, flags
- Estado recuperable tras reinicio del servidor

> **ACTUALIZACIÓN [Dudas #19, #39]:** El estado de partidas activas se almacena en Redis para persistencia y escalabilidad.

---

### RF-RT-002: Inicio de Partida ✅

**Descripción:** El motor debe iniciar una partida preparando el estado necesario.

**Criterios de Aceptación:**
- Verificar límite de partidas activas (si existe)
- Construir índice O(1) para búsqueda por UID
- Emitir primer desafío automáticamente

---

### RF-RT-003: Generación de Desafíos ✅

**Descripción:** El motor debe generar desafíos aleatorios para cada ronda.

**Criterios de Aceptación:**
- Selección aleatoria de cardMapping (Duda #28)
- Registrar checkpoint de ronda según política de persistencia (`round_start` opcional por configuración)
- Emitir desafío al cliente con displayData
- Iniciar timer de timeout

---

### RF-RT-004: Procesamiento de Escaneos ✅

**Descripción:** El motor debe procesar los escaneos RFID y validar respuestas.

**Criterios de Aceptación:**
- Búsqueda O(1) de partida por UID de tarjeta
- Verificar que la partida espera respuesta
- Cancelar timer de timeout
- Calcular puntuación y tiempo de respuesta
- Registrar evento en BD

---

### RF-RT-005: Cálculo de Puntuación ✅

**Descripción:** El motor debe calcular puntos según la configuración de la sesión.

**Reglas:**
- Respuesta correcta: `+config.pointsPerCorrect`
- Respuesta incorrecta: `+config.penaltyPerError` (negativo)
- Timeout: 0 puntos

---

### RF-RT-006: Manejo de Timeout ✅

**Descripción:** El motor debe manejar timeouts cuando el jugador no responde.

**Criterios de Aceptación:**
- Timer programado con `config.timeLimit` segundos
- Registrar evento `timeout` en BD
- No otorgar ni restar puntos
- Avanzar a siguiente ronda automáticamente

---

### RF-RT-007: Finalización de Partida ✅

**Descripción:** El motor debe finalizar partidas correctamente liberando recursos.

**Criterios de Aceptación:**
- Limpiar timers pendientes
- Guardar estado final en BD
- Emitir evento `game_over` con puntuación final
- Eliminar partida de Redis
- Actualizar métricas del alumno

---

### RF-RT-008: Cleanup de Partidas Abandonadas ✅

**Descripción:** El motor debe detectar y limpiar partidas abandonadas automáticamente.

**Criterios de Aceptación:**
- Verificación periódica cada 5 minutos
- Timeout configurable (default: 1 hora)
- Finalizar partidas que exceden el timeout

---

### RF-RT-009: Gestión de Conexiones WebSocket ✅

**Descripción:** El servidor debe gestionar conexiones WebSocket con Socket.IO.

---

### RF-RT-010: Salas de Partida (Rooms) ✅

**Descripción:** Cada partida debe tener su propia sala para emisión de eventos.

---

### RF-RT-011: Eventos Cliente → Servidor ✅

**Descripción:** El cliente puede emitir eventos para controlar la partida.

**Eventos Soportados:**
| Evento | Payload | Descripción |
|--------|---------|-------------|
| `join_play` | `{ playId }` | Unirse a partida |
| `leave_play` | `{ playId }` | Abandonar partida |
| `start_play` | `{ playId }` | Iniciar partida |
| `pause_play` | `{ playId }` | Pausar partida **(NUEVO)** |
| `resume_play` | `{ playId }` | Reanudar partida **(NUEVO)** |
| `rfid_mode` | `{ mode }` | Cambiar modo RFID **(NUEVO)** |

---

### RF-RT-012: Eventos Servidor → Cliente ✅

**Descripción:** El servidor emite eventos para actualizar el estado del cliente.

**Eventos Emitidos:**
| Evento | Descripción |
|--------|-------------|
| `rfid_event` | Evento del sensor RFID |
| `rfid_status` | Estado de conexión del sensor |
| `play_state` | Estado inicial de partida |
| `new_round` | Nuevo desafío |
| `validation_result` | Resultado de respuesta |
| `game_over` | Partida finalizada |
| `play_paused` | Partida pausada **(NUEVO)** |
| `play_resumed` | Partida reanudada **(NUEVO)** |
| `session_invalidated` | Sesión invalidada **(NUEVO)** |
| `error` | Error en la partida |

---

## RF-FUT: Requisitos Futuros

> Estos requisitos están planificados para versiones futuras y no forman parte del MVP.

### RF-FUT-001: Aplicación Web para Profesores 📋

**Descripción:** Desarrollar aplicación React completa para profesores.

---

### RF-FUT-002: Mecánica de Secuencia Completa 📋

**Descripción:** Implementar completamente la mecánica de secuencia.

---

### RF-FUT-003: Mecánica de Memoria Completa 📋

**Descripción:** Implementar completamente la mecánica de memoria.

---

### RF-FUT-004: Sistema de Logros 📋

**Descripción:** Gamificación con logros y badges.

---

### RF-FUT-005: Exportación de Datos 📋 **[Duda #42]**

**Descripción:** Exportar estadísticas de alumnos a CSV/PDF.

---

### RF-FUT-006: Modo Multijugador Competitivo 📋

**Descripción:** Partidas con múltiples jugadores compitiendo.

---

### RF-FUT-007: Integración con LMS 📋

**Descripción:** Integración con sistemas de gestión de aprendizaje (Moodle, Google Classroom).

---

### RF-FUT-008: Recuperación de Contraseña 📋 **[Duda #50]**

**Descripción:** Flujo de "olvidé mi contraseña" con email.

**Estado:** Pendiente de definición (¿automático o manual por admin?)

---

### RF-FUT-009: Sistema de Pistas 📋 **[Duda #29 - DESCARTADO]**

**Descripción:** Sistema de pistas para ayudar a los alumnos.

**Estado:** Descartado de momento.

---

### RF-FUT-010: Accesibilidad Avanzada 📋 **[Duda #56 - DESCARTADO]**

**Descripción:** Adaptaciones para alumnos con necesidades especiales.

**Estado:** Descartado de momento.

---

### RF-FUT-011: Multiidioma 📋 **[Duda #57 - DESCARTADO]**

**Descripción:** Soporte para múltiples idiomas.

**Estado:** Solo español de momento.

---

# Requisitos No Funcionales (RNF)

---

## RNF-SEG: Seguridad

### RNF-SEG-001: Autenticación JWT ✅

**Descripción:** El sistema debe implementar autenticación basada en JWT con access y refresh tokens.

**Especificaciones:**
- Access token: Corta duración (15 minutos por defecto)
- Refresh token: **7 días** (Duda #49)
- Algoritmo: HS256
- **Rotación de refresh tokens implementada** (Duda #49)

> **ACTUALIZACIÓN [Duda #49]:** La duración del refresh token se reduce a 7 días (antes 30 días) y se implementa rotación.

---

### RNF-SEG-002: Rotación de Tokens ✅

**Descripción:** Al refrescar un token, el refresh token anterior debe ser revocado.

**Criterios de Aceptación:**
- Cada refresh genera nuevo par de tokens
- Refresh token anterior añadido a blacklist en Redis
- Previene reutilización de tokens robados

---

### RNF-SEG-003: Device Fingerprinting ✅

**Descripción:** Los tokens deben estar vinculados al dispositivo/navegador.

---

### RNF-SEG-004: Blacklist de Tokens ✅

**Descripción:** El sistema debe mantener una blacklist de tokens revocados en Redis.

> **ACTUALIZACIÓN [Duda #39, #49]:** La blacklist se almacena en Redis (antes en memoria).

---

### RNF-SEG-005: Encriptación de Contraseñas ✅

**Descripción:** Las contraseñas deben almacenarse encriptadas con bcrypt.

---

### RNF-SEG-006: Bypass de Autenticación (Desarrollo) ✅

**Descripción:** Modo de desarrollo que permite bypass de autenticación para pruebas.

---

### RNF-SEG-007: Control de Acceso por Rol ✅

**Descripción:** El sistema debe implementar control de acceso basado en roles.

**Roles:**
- `super_admin`: Administrador del sistema **(NUEVO)**
- `teacher`: Acceso completo a la aplicación
- `student`: Solo puede jugar partidas asignadas (sin login)

---

### RNF-SEG-008: Verificación de Propiedad ✅

**Descripción:** Los usuarios solo deben acceder a sus propios recursos.

---

### RNF-SEG-009: Autenticación Opcional ✅

**Descripción:** Algunas rutas deben permitir acceso público con comportamiento diferenciado.

---

### RNF-SEG-010: Helmet Security Headers ✅

**Descripción:** El servidor debe incluir headers de seguridad HTTP.

---

### RNF-SEG-011: Content Security Policy ✅

**Descripción:** CSP restrictivo para prevenir XSS.

---

### RNF-SEG-012: CORS ✅

**Descripción:** El servidor debe implementar CORS con whitelist de orígenes.

---

### RNF-SEG-013: Protección CSRF ✅

**Descripción:** Protección contra Cross-Site Request Forgery.

---

### RNF-SEG-014: Rate Limit Global ✅

**Descripción:** Límite global de requests para prevenir DoS.

---

### RNF-SEG-015: Rate Limit de Autenticación ✅

**Descripción:** Límite estricto en endpoints de autenticación.

---

### RNF-SEG-016: Rate Limit de Creación ✅

**Descripción:** Límite en operaciones de creación de recursos.

---

### RNF-SEG-017: Rate Limit de Eventos de Juego ✅

**Descripción:** Límite permisivo para eventos durante partidas.

---

### RNF-SEG-018: Rate Limit de Uploads ✅

**Descripción:** Límite estricto en subida de archivos.

---

### RNF-SEG-019: Cumplimiento GDPR/LOPD 📋 **[NUEVO - Duda #31]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El sistema debe cumplir con GDPR/LOPD para protección de datos de menores.

**Criterios de Aceptación:**
- Encriptación de datos sensibles
- Anonimización en lugar de eliminación (mantiene estadísticas)
- Registro de consentimiento parental
- Documentación de cumplimiento normativo

---

### RNF-SEG-020: Sesión Única Activa 📋 **[NUEVO - Duda #48]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** Un profesor solo puede tener una sesión activa a la vez.

**Criterios de Aceptación:**
- Al iniciar sesión en nuevo dispositivo, la sesión anterior se invalida
- El dispositivo anterior recibe notificación

---

## RNF-REN: Rendimiento

### RNF-REN-001: Búsqueda O(1) de Tarjetas ✅

**Descripción:** La búsqueda de partidas por UID de tarjeta debe ser O(1).

---

### RNF-REN-002: Denormalización de Datos ✅

**Descripción:** Datos frecuentemente accedidos deben estar denormalizados.

---

### RNF-REN-003: Compresión de Respuestas ✅

**Descripción:** Las respuestas HTTP deben comprimirse.

---

### RNF-REN-004: Connection Pooling MongoDB ✅

**Descripción:** La conexión a MongoDB debe usar connection pooling.

---

### RNF-REN-005: Índices de Base de Datos ✅

**Descripción:** Las colecciones deben tener índices optimizados.

---

### RNF-REN-006: Latencia de Tiempo Real ✅

**Descripción:** Los eventos en tiempo real deben tener baja latencia.

---

### RNF-REN-007: Sin Límite de Partidas Simultáneas 📋 **[ACTUALIZADO - Duda #21]**

> **Este requisito ha sido ACTUALIZADO según las Dudas de Diciembre 2025.**

**Descripción:** No hay límite de partidas simultáneas (de momento).

> **CONFLICTO:** Anteriormente existía un límite configurable (MAX_ACTIVE_PLAYS). Este requisito lo **ANULA** temporalmente. Se debe implementar monitorización para alertar si se alcanzan límites de recursos.

---

### RNF-REN-008: Cleanup Automático ✅

**Descripción:** Las partidas abandonadas deben limpiarse automáticamente.

---

### RNF-REN-009: Graceful Shutdown ✅

**Descripción:** El servidor debe cerrarse de forma ordenada.

---

### RNF-REN-010: Estado en Redis 📋 **[ACTUALIZADO - Dudas #19, #39]**

> **Este requisito ha sido ACTUALIZADO según las Dudas de Diciembre 2025.**

**Descripción:** El estado de partidas activas se almacena en Redis para persistencia y escalabilidad.

> **CONFLICTO:** Anteriormente el estado se mantenía solo en memoria. Ahora se usa Redis para persistencia.

**Criterios de Aceptación:**
- Estado de partidas almacenado en Redis
- Recuperable tras reinicio del servidor
- Preparado para escalado horizontal futuro

---

### RNF-REN-011: Escalabilidad Horizontal 📋

**Descripción:** El sistema debe poder escalarse horizontalmente en el futuro.

---

### RNF-REN-012: Almacenamiento Externo ✅

**Descripción:** Los archivos multimedia deben almacenarse en Supabase Storage.

---

### RNF-REN-013: Historial Indefinido 📋 **[NUEVO - Duda #34]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El historial detallado de partidas (GamePlay.events) se mantiene indefinidamente.

**Criterios de Aceptación:**
- No se archivan ni eliminan partidas antiguas (de momento)
- Considerar índices para optimizar consultas históricas

---

## RNF-CAL: Calidad

### RNF-CAL-001: Patrón MVC ✅

**Descripción:** El backend debe seguir el patrón Modelo-Vista-Controlador con capa de servicios.

---

### RNF-CAL-002: Principios SOLID ✅

**Descripción:** El código debe adherirse a los principios SOLID.

---

### RNF-CAL-003: Principio DRY ✅

**Descripción:** El código no debe repetirse innecesariamente.

---

### RNF-CAL-004: Separación de Configuración ✅

**Descripción:** La configuración debe estar separada del código.

---

### RNF-CAL-005: Modularidad ✅

**Descripción:** El sistema debe estar organizado en módulos independientes.

---

### RNF-CAL-006: Clases de Error Personalizadas ✅

**Descripción:** El sistema debe usar clases de error específicas.

---

### RNF-CAL-007: Manejo Centralizado de Errores ✅

**Descripción:** Los errores deben manejarse de forma centralizada.

---

### RNF-CAL-008: Integración con Sentry ✅

**Descripción:** Los errores deben reportarse a Sentry para monitoreo.

---

### RNF-CAL-009: Validación con Zod ✅

**Descripción:** Todas las entradas deben validarse con Zod.

---

### RNF-CAL-010: Validación en Mongoose ✅

**Descripción:** Los esquemas Mongoose deben tener validación a nivel de BD.

---

### RNF-CAL-011: Validación de Variables de Entorno ✅

**Descripción:** Las variables de entorno críticas deben validarse al iniciar.

---

### RNF-CAL-012: Logging Estructurado ✅

**Descripción:** Los logs deben ser estructurados y categorizados.

---

### RNF-CAL-013: Contexto en Logs ✅

**Descripción:** Los logs deben incluir contexto relevante.

---

### RNF-CAL-014: Rotación de Logs 📋

**Descripción:** Los archivos de log deben rotarse.

**Estado:** Pendiente de implementar

---

### RNF-CAL-015: Documentación JSDoc ✅

**Descripción:** El código debe estar documentado con JSDoc.

---

### RNF-CAL-016: README por Carpeta ✅

**Descripción:** Cada carpeta principal debe tener un README explicativo.

---

### RNF-CAL-017: Documentación de API ✅

**Descripción:** La API debe estar documentada.

---

### RNF-CAL-018: Testing Unitario 📋

**Descripción:** El código crítico debe tener tests unitarios.

**Estado:** En progreso (cobertura ~31%, objetivo 70%)

---

### RNF-CAL-019: Testing de Integración 📋

**Descripción:** Los flujos principales deben tener tests de integración.

**Estado:** En progreso

---

### RNF-CAL-020: Health Checks 📋 **[NUEVO - Duda #55]**

> **Este requisito es NUEVO derivado de las Dudas de Diciembre 2025.**

**Descripción:** El sistema debe exponer endpoints de health check y métricas.

**Criterios de Aceptación:**
- Endpoint `/health` con estado de MongoDB, Redis, RFID
- Endpoint `/api/metrics` con métricas de rendimiento
- Métricas de latencia, memoria, conexiones

---

## Resumen de Conflictos y Actualizaciones

### Requisitos Actualizados (Diciembre 2025)

| Código | Cambio | Motivo |
|--------|--------|--------|
| RF-JGO-011 | Solo WebP (SVG rechazado XSS) | Duda #44: Optimizar almacenamiento |
| RF-JGO-024 | Estado `paused` añadido | Duda #30: Pausa de partidas |
| RF-RT-001 | Estado en Redis | Dudas #19, #39: Persistencia |
| RNF-SEG-001 | Refresh 7 días | Duda #49: Mayor seguridad |
| RNF-SEG-004 | Blacklist en Redis | Duda #39: Persistencia |
| RNF-REN-007 | Sin límite partidas | Duda #21: Sin restricciones |

### Requisitos Nuevos (Diciembre 2025)

| Código | Descripción | Duda |
|--------|-------------|------|
| RF-USR-016 | Super Admin | #51 |
| RF-USR-017 | Sesión única | #48 |
| RF-USR-018 | Transferencia alumnos | #32 |
| RF-USR-019 | Anonimización GDPR | #31 |
| RF-JGO-026 | Orden aleatorio | #28 |
| RF-JGO-027 | Pausa/Reanudación | #30 |
| RF-JGO-028 | Mazos de cartas | #36 |
| RF-JGO-029 | Contextos compartidos | #45 |
| RF-RFID-011 | Multi-sensor | #22 |
| RF-RFID-012 | Control RFID frontend | #25, #26 |
| RNF-SEG-019 | GDPR/LOPD | #31 |
| RNF-CAL-020 | Health checks | #55 |

---

*Documento generado automáticamente. Última actualización: Diciembre 2025*
