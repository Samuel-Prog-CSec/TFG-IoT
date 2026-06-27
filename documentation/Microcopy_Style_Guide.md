# Guía de microcopy de EduPlay

> **Fuente de verdad operativa**: `frontend/src/constants/microcopy.js` (esqueleto en T-951; migración masiva en T-959).

EduPlay habla a docentes hispanohablantes y a la dirección de centros educativos. La voz de la app debe sentirse como una compañera de claustro — cercana, clara, segura — no como un panel administrativo de software empresarial.

## Los 7 principios

### 1. Segunda persona ("tú")

El docente lee a la app como si le hablase un colega. Evita la tercera persona impersonal ("el usuario debe…") y la primera del plural distante ("nosotros recomendamos…").

| ❌ | ✅ |
|---|---|
| El usuario debe iniciar sesión | Inicia sesión |
| Se recomienda crear primero un mazo | Crea primero un mazo |
| Por favor, completa los campos requeridos | Revisa los campos marcados en rojo |

### 2. Verbos directos en CTAs

Las CTAs siempre arrancan con un verbo accionable. Evita sustantivos ("Sesión nueva") y eufemismos ("Comenzar el proceso").

| ❌ | ✅ |
|---|---|
| Sesión nueva | Crear sesión |
| Comenzar el proceso de creación | Crear mazo |
| Aceptar | Confirmar / Guardar / Crear (según contexto) |
| Continuar | Siguiente / Guardar y continuar |

### 3. Sin tecnicismos

EduPlay maneja datos pedagógicos, no infraestructura. Las palabras "endpoint", "ID", "JSON", "API", "request" no aparecen nunca en la UI. Si un mensaje de error de bajo nivel se escapa, lo traducimos.

| ❌ | ✅ |
|---|---|
| El endpoint /api/users devolvió 500 | No hemos podido conectar con el servidor. Vuelve a intentarlo. |
| ID inválido | Esta sesión ya no existe. |
| Error de payload JSON | Revisa los datos del formulario. |
| Selecciona un asset del contexto | Selecciona un recurso del contexto |
| 12 assets disponibles | 12 recursos disponibles |
| Asset asignado | Recurso asignado |
| Insights (apartado del navbar) | Análisis |
| Seguridad (MFA) | Seguridad de la cuenta |

**Caso especial — "asset" vs "recurso":** el término inglés "asset" pertenece al vocabulario interno (multimedia, design ops, nombres de componentes). En la superficie visible al docente usamos siempre **"recurso"** porque encaja con el campo semántico del aula (RAE: cosa de la que se sirve uno para conseguir un fin). La distinción aplica solo a strings que el usuario lee — el código mantiene `AssetSelector`, `assets`/`assetUsageCounts` como nombres de prop, etc., para no fragmentar la búsqueda en codebase.

**Caso especial — "engagement" → "implicación" (ADR-200, completado en ADR-210):** misma regla que "asset". El anglicismo "engagement" es jerga; de cara al docente usamos **"Implicación"** (término pedagógico estándar; el sufijo `/100` desambigua que es un score). El código puede conservar `EngagementRadar`/`engagement` como nombres internos. ADR-210 cierra las superficies visibles que aún decían "Engagement" (título del radar, leyenda, estado vacío, resumen accesible, lista de secciones del informe).

**Caso especial — navegación y siglas (ADR-210):** un apartado de menú debe decir qué hace, no llevar un anglicismo ni una sigla. **"Insights" → "Análisis"** (la URL `/analytics/insights` y el identificador interno no cambian — al usuario solo le llega la etiqueta). **"Seguridad (MFA)" → "Seguridad de la cuenta"** (la sigla MFA no la reconoce un perfil no técnico).

**Caso especial — la función MFA se llama "verificación en dos pasos" (ADR-210):** en TODA la superficie visible (página de seguridad, modal de challenge step-up, formulario de desbloqueo de cuentas) la función es **"verificación en dos pasos"** y el código TOTP es **"código de tu app" / "código de verificación"**. Nunca "MFA", "TOTP", "doble factor" ni "segundo factor" de cara al usuario. Los nombres internos (`MfaSetup`, `mfaTokenStore`, códigos de error `MFA_*`, `X-MFA-Token`, slugs de fichero) se mantienen.

**Consistencia de términos — un dato, una palabra:** el mismo valor no puede llamarse de dos formas en la misma vista. Casos cerrados en ADR-200: la dificultad `medium` es **"Normal"** en todas partes (antes el filtro de Sesiones decía "Media" mientras cards y detalle decían "Normal"); los valores internos del toggle de barra lateral (`compact`/`expanded`/`auto`) se traducen a "Compacta"/"Amplia"/"Automático" y nunca se exponen crudos. Regla general: derivar las etiquetas visibles de un único mapa fuente (p. ej. `DIFFICULTY_LABELS_ES`) para que no puedan divergir.

### 4. Errores accionables

Cada error apunta al siguiente paso. "Inténtalo de nuevo" sin contexto no ayuda — explica QUÉ ha fallado y CÓMO arreglarlo.

| ❌ | ✅ |
|---|---|
| Fecha inválida | La fecha de inicio no puede ser anterior a hoy. |
| El campo es obligatorio | Pon un nombre al mazo (mínimo 3 caracteres). |
| Sin permisos | No tienes permiso para hacer esto. Si crees que es un error, contacta con la dirección del centro. |
| Error al cargar datos | No pudimos cargar tu panel. Vuelve a intentarlo. |
| Error al crear mazo | No pudimos crear el mazo. |

**Convención de fallos de carga/acción (ADR-210):** evitamos empezar un mensaje con un escueto **"Error al…"** (frío y poco accionable). El patrón es **"No pudimos [acción] [qué]"** y, en mensajes terminales (no toasts con detalle técnico debajo), se añade la recuperación: **"…Vuelve a intentarlo."**. Los títulos genéricos ("Error al cargar datos") se concretan a la entidad de la pantalla ("No pudimos cargar tus alumnos / tu panel / tus mazos"). El detalle técnico del backend sigue yendo en la línea secundaria del toast.

### 5. Tooltips útiles, no decorativos

El tooltip explica QUÉ HACE el botón o QUÉ SIGNIFICA un valor — nunca repite el label visible. Si no añade información, no se pone.

| ❌ | ✅ |
|---|---|
| Tooltip sobre "Eliminar": "Eliminar" | Tooltip sobre "Eliminar": "Borra esta sesión y todas sus partidas. No se puede deshacer." |
| Tooltip sobre KPI "Engagement": "Engagement" | Tooltip sobre KPI "Engagement": "Cuánto se 'engancha' tu alumnado: aciertos, tiempo de respuesta y rondas completadas." |

### 6. Tono docente — cercano, sin paternalismo

Tratamos al docente y a la dirección como adultos profesionales. Sin "¡bien hecho!" gratuitos, sin emojis decorativos cada dos líneas (sólo cuando el feedback es de juego — la mascota habla a niños). Sin condescendencia ("¡Esto es muy fácil!").

| ❌ | ✅ |
|---|---|
| ¡Bien hecho! Has creado un mazo. | Mazo creado. |
| ¡Esto es muy fácil! | (omitir) |
| Lo sentimos mucho 😢 | No hemos podido completar la operación. |

### 7. Longitud apropiada

- **Empty states**: 1-2 frases con un siguiente paso explícito (CTA debajo).
- **Tooltips**: 1 frase. Máx 2 si la primera necesita ejemplificar.
- **Errores**: 1-2 frases. Cause + recovery.
- **Toasts**: 1 frase. El detalle va en el modal o panel.
- **Onboarding pasos modal**: 3-5 frases. Suficiente para enmarcar pero no abrumar.

## Vocabulario para la dirección (super_admin)

El jefe de estudios es un perfil **no técnico**. Usar palabras que reconocería cualquier directivo de centro educativo, no de software.

| ❌ Palabra de software | ✅ Palabra de centro |
|---|---|
| Usuarios | Docentes / claustro / alumnado |
| Recursos | Material |
| Permisos | Acceso / aprobación |
| Base de datos | Padrón |
| Panel administrativo | Panel de dirección |
| Sistema | Plataforma / EduPlay |

### Alertas del sistema — impacto en el título, detalle técnico aparte (ADR-210)

Las alertas operativas del super_admin **nunca** llevan nombres de infraestructura en el título ni en el badge de subsistema. El patrón es **título en lenguaje de impacto + detalle técnico en la segunda línea** (descripción del detector) y en el desplegable "Detalles técnicos". El título sale de `label` en `backend/src/config/systemAlerts.js` (el detector lo usa como `title`); sincronizar el espejo `frontend/src/constants/systemAlertTypes.js`.

| ❌ Título técnico | ✅ Título de impacto |
|---|---|
| MongoDB desconectado | La base de datos no responde |
| Latencia elevada en Redis | El sistema responde con lentitud |
| Memoria al límite | Memoria del servidor casi llena |
| Token comprometido detectado | Posible acceso no autorizado |
| Comandos Upstash cerca del límite | Cerca del límite del plan gratuito |
| Intentos anómalos RFID (HMAC/replay) | Actividad sospechosa en los lectores RFID |

Badges de subsistema (`SOURCE_STYLES`): "Redis" → **Rendimiento**, "MongoDB" → **Base de datos**, "Colas" → **Tareas**, "Compliance" → **Protección de datos**. El `component` en monospace (`process:heap`, `redis:primary`) y el JSON de "Detalles técnicos" SÍ son técnicos: es su sitio.

## Quick wins aplicados en T-951

- "Panel de administración" → **"Panel de dirección"** (rol semántico real).
- "Portal del profesor" → **"Aula de [Nombre]"** — personalización con el primer nombre del docente para refuerzo de pertenencia.
- Sidebar header del super_admin "Administración" → **"Gestión del centro"**.
- Toggle de animaciones con `title` accionable: `'Reducir animaciones'` / `'Activar animaciones'` (antes describía el estado: "Animaciones desactivadas/activadas").
- Onboarding super_admin: lenguaje completamente reescrito sin tecnicismos (ver `Onboarding_Tracks.md`).

## Voz de Otto, la mascota (ADR-209/212)

Otto habla a **niños 4-8** en partida y, desde ADR-212, **guía al docente/dirección** en el onboarding. Tono: cálido, corto, en presente, sin condescendencia ni jerga.

- **En partida**: frases por mecánica × evento en `lib/mascotDialog.js` (acierto/fallo/timeout/racha…). Mayúsculas solo en celebración. Sin emojis (la mascota ya tiene accesorios SVG).
- **En el onboarding (tour)**: una `mascotLine` por paso en `onboardingTracks.js` — una frase que **anima/orienta** (no duplica la descripción del paso). ≤~32 caracteres. Es la voz del guía, no un eco del card.
  - Bienvenida: *"¡Hola! Soy Otto, te guío."* (docente) / *"¡Hola! Te enseño tu panel."* (dirección).
  - Spotlight: *"Empezamos por tus mazos."*, *"Aquí decides quién entra."* — señalan lo que el anillo resalta.
  - Cierre: *"¡Y a pasar tarjetas!"* / *"Si te pierdes, vuelve aquí."*

Regla: la frase de Otto **complementa**, nunca repite el título/descripción del paso.

## Migración masiva pendiente (T-959)

T-951 sienta los pilares y centraliza categorías iniciales en `microcopy.js` (`EMPTY_STATES`, `TOOLTIPS`, `CTAS`, `ERRORS`). T-959 (Sprint 6, P2) hará la pasada masiva: empty states de todas las páginas, tooltips de KPIs en el panel de dirección, mensajes de error de validadores, y CTAs históricos.
