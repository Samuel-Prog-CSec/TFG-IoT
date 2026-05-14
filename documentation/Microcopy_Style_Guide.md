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

### 4. Errores accionables

Cada error apunta al siguiente paso. "Inténtalo de nuevo" sin contexto no ayuda — explica QUÉ ha fallado y CÓMO arreglarlo.

| ❌ | ✅ |
|---|---|
| Fecha inválida | La fecha de inicio no puede ser anterior a hoy. |
| El campo es obligatorio | Pon un nombre al mazo (mínimo 3 caracteres). |
| Sin permisos | No tienes permiso para hacer esto. Si crees que es un error, contacta con la dirección del centro. |

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

## Quick wins aplicados en T-951

- "Panel de administración" → **"Panel de dirección"** (rol semántico real).
- "Portal del profesor" → **"Aula de [Nombre]"** — personalización con el primer nombre del docente para refuerzo de pertenencia.
- Sidebar header del super_admin "Administración" → **"Gestión del centro"**.
- Toggle de animaciones con `title` accionable: `'Reducir animaciones'` / `'Activar animaciones'` (antes describía el estado: "Animaciones desactivadas/activadas").
- Onboarding super_admin: lenguaje completamente reescrito sin tecnicismos (ver `Onboarding_Tracks.md`).

## Migración masiva pendiente (T-959)

T-951 sienta los pilares y centraliza categorías iniciales en `microcopy.js` (`EMPTY_STATES`, `TOOLTIPS`, `CTAS`, `ERRORS`). T-959 (Sprint 6, P2) hará la pasada masiva: empty states de todas las páginas, tooltips de KPIs en el panel de dirección, mensajes de error de validadores, y CTAs históricos.
