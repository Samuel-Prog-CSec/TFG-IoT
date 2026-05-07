# Onboarding interactivo — tracks por rol

> **Fuente de verdad operativa**: `frontend/src/constants/onboardingTracks.js` — exporta `TEACHER_TRACK`, `SUPER_ADMIN_TRACK` y `getTrackForRole(role)`.
> **Componente**: `frontend/src/components/onboarding/OnboardingOverlay.jsx`.
> **Hook**: `frontend/src/hooks/useOnboarding.js`.
> **Persistencia**: `User.profile.onboarding` en backend + migración del flag legacy `localStorage['eduplay:onboarding-completed']`.

T-951 sustituye el modal informativo de 4 pasos previo (sólo para teacher, persistencia local) por un onboarding multi-track con dos tipos de paso (`'modal'` y `'spotlight'`). El track se selecciona en `AppLayout` según el rol del usuario autenticado.

## Tipos de paso

- **`'modal'`** — panel centrado a pantalla completa con icono Lucide, título y descripción larga. Usado para apertura, cierre y mensajes "narrativos" del tour.
- **`'spotlight'`** — recorta visualmente un elemento real de la UI (referenciado por `data-tour="<key>"` en `AppLayout.jsx` y otros) con un agujero rectangular y un tooltip apuntador. Si el target no se encuentra, hay fallback automático a `'modal'`.

## `data-tour` keys (selectores estables)

Todos los keys viven en `frontend/src/constants/routes.js` (campo `dataTour` de cada `NAV_ROUTES` y `ADMIN_NAV_ROUTES` item) y se propagan automáticamente al `NavItem` en `AppLayout.jsx`. Mantener los keys aquí por si se añaden tours futuros que apunten a CTAs no incluidos en la sidebar.

| Key | Elemento real |
|---|---|
| `dashboard` | NavItem "Dashboard" |
| `my-students` | NavItem "Mis Alumnos" |
| `insights` | NavItem "Insights" |
| `sessions` | NavItem "Sesiones" |
| `contexts` | NavItem "Contextos" |
| `my-decks` | NavItem "Mis Mazos" |
| `new-session` | NavItem "Nueva Sesión" |
| `approvals` | NavItem admin "Aprobaciones" |
| `admin-transfers` | NavItem admin "Transferencias" |
| `admin-students` | NavItem admin "Alumnos" |
| `admin-contexts` | NavItem admin "Contextos" |

## Track docente — `TEACHER_TRACK` (6 pasos)

El profesor abre EduPlay por primera vez, normalmente en el aula con su clase ya esperando. El tour está pensado para enseñarle el flujo "crear contenido → jugar → analizar" sin interrumpir su día.

| # | Tipo | Icono | Título | Anclaje |
|---|---|---|---|---|
| 1 | modal | `GraduationCap` | ¡Bienvenido a EduPlay! | — |
| 2 | spotlight | `Layers` | Crea tu primer mazo | `data-tour="my-decks"` |
| 3 | spotlight | `Palette` | Elige un contexto | `data-tour="contexts"` |
| 4 | spotlight | `Rocket` | Configura una sesión | `data-tour="sessions"` |
| 5 | modal | `Gamepad2` | ¡A jugar! (RFID + táctil) | — |
| 6 | spotlight | `TrendingUp` | Analiza los resultados | `data-tour="my-students"` |

## Track dirección — `SUPER_ADMIN_TRACK` (5 pasos)

El jefe de estudios entra al panel desde su despacho, normalmente sin urgencia. El track está diseñado contra los **tres miedos del perfil no técnico**:

1. *"voy a romper algo del centro entero"* → primer paso explícito tranquilizador (paleta `warning`).
2. *"no entiendo esta métrica"* → ningún tecnicismo. Lenguaje "padrón, claustro, material".
3. *"no sé dónde está la cosa que necesito"* → spotlights apuntan a lo que la dirección usará el día a día.

| # | Tipo | Icono | Título | Anclaje | Variant |
|---|---|---|---|---|---|
| 1 | modal | `Shield` | Bienvenida, dirección | — | `warning` |
| 2 | spotlight | `UserCheck` | Aprobaciones — tu portero | `data-tour="approvals"` | default |
| 3 | spotlight | `Users` | Alumnado del centro | `data-tour="admin-students"` | default |
| 4 | spotlight | `BookMarked` | Contextos — el material común | `data-tour="admin-contexts"` | default |
| 5 | modal | `GraduationCap` | Si te pierdes, vuelves | — | default |

## Lenguaje de la dirección — palabras a evitar y palabras a usar

| ❌ No usar | ✅ Usar |
|---|---|
| endpoint, JSON, ID | — (eliminar de visión del usuario) |
| usuarios | docentes, claustro |
| recursos | material |
| base de datos | padrón |
| panel administrativo | panel de dirección |

## Persistencia y migración

- **Backend** (`User.profile.onboarding`): `teacherCompleted`, `superAdminCompleted`, `currentStep`, `currentTrack`, `version`, `lastSeenAt`.
- **Endpoint**: `PATCH /api/users/me/onboarding` (Zod validator `updateOnboardingSchema`).
- **Migración**: si al primer mount se detecta `localStorage['eduplay:onboarding-completed'] === 'true'`, se marca `teacherCompleted: true` en backend y se borra el flag local. El usuario no vuelve a ver el tour.

## Reanudar

`AppLayout.jsx` añade un botón "Ver tutorial" (icono `GraduationCap`) en el footer del sidebar. Click → `useOnboarding.resetOnboarding()` → reabre el overlay del rol actual desde paso 0 sin tocar `hasCompleted` (el tour ya completado puede repetirse).

## Versionado

`User.profile.onboarding.version` (default `1`) permite invalidar tours futuros: si un sprint posterior introduce pasos críticos nuevos, basta con incrementar la versión esperada por el cliente y el hook puede tratar `version < expectedVersion` como "tour pendiente". Esta lógica no está activada en T-951 (versión 1 vigente) pero el campo está reservado.
