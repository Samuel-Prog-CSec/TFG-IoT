# Atajos de teclado globales

> **Fuente de verdad operativa**: `frontend/src/components/layout/AppLayout.jsx` — `shortcutSections` por rol.
> **Hook genérico**: `frontend/src/hooks/useKeyboardShortcuts.js`.
> **Overlay de ayuda**: `frontend/src/components/ui/KeyboardShortcutsOverlay.jsx`. Accesible vía `Shift+?` desde cualquier pantalla autenticada.

T-951 introduce un sistema de atajos de teclado globales para acelerar la navegación de docentes y dirección. Los atajos se documentan aquí y en el overlay accesible vía `Shift+?` (también funciona dentro de modales — los atajos están bloqueados dentro de campos de texto).

## Diseño

- **Convención `g` + letra** para "go to": Linear / GitHub la usan, los teachers familiarizados con productos modernos no se sorprenden.
- **`Shift+N`** (no `n` solo) para "Nueva sesión": evita disparar accidentalmente al escribir notas.
- **`Shift+?`** (no `?` solo): en QWERTY ES `?` requiere `Shift+'`, así que el contrato `Shift+?` cubre el shortcut esperado por el usuario.
- **`Escape`**: tecla de "salida segura" — cierra modales y el propio overlay de ayuda.

## Guard contra inputs

El listener inspecciona `event.target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')`. Si el usuario está escribiendo, no se dispara ningún chord ni atajo, salvo los que declaran `allowInInput: true` (sólo `Escape` lo hace por defecto, para que cerrar un modal con `Esc` sea siempre posible).

## Docente (`teacher`)

### Navegación

| Atajo | Destino | Ruta |
|---|---|---|
| `g` luego `d` | Dashboard | `/dashboard` |
| `g` luego `s` | Sesiones | `/sessions` |
| `g` luego `m` | Mis Mazos | `/decks` |
| `g` luego `a` | Mis Alumnos | `/analytics/students` |
| `g` luego `c` | Contextos | `/contexts` |
| `g` luego `i` | Insights | `/analytics/insights` |

### Acciones

| Atajo | Acción |
|---|---|
| `Shift+N` | Crear nueva sesión |

### Sistema

| Atajo | Acción |
|---|---|
| `Shift+?` | Abrir overlay de atajos |
| `Esc` | Cerrar diálogos abiertos |

## Dirección (`super_admin`)

### Navegación (gestión del centro)

| Atajo | Destino | Ruta |
|---|---|---|
| `g` luego `x` | Aprobaciones | `/admin/approvals` |
| `g` luego `a` | Alumnado del centro | `/admin/students` |
| `g` luego `c` | Contextos del centro | `/admin/contexts` |

### Sistema

| Atajo | Acción |
|---|---|
| `Shift+?` | Abrir overlay de atajos |
| `Esc` | Cerrar diálogos abiertos |

## Decisiones explícitas

- **No hay atajo `/`**: en T-951 no existe búsqueda global en EduPlay. Añadirlo sin destino frustra al usuario. Si una tarea futura introduce búsqueda, se reserva esta tecla para ello.
- **Chord timeout 1500ms**: tras pulsar `g`, el usuario tiene 1.5 segundos para pulsar la segunda tecla. Si transcurre más, el buffer se vacía y se considera que `g` solo no era intencional.
- **El overlay no atrapa el foco** dentro de un input de la app — se abre con `Shift+?`, se cierra con `Esc` o clicando fuera. La ARIA del overlay es `role="dialog" aria-modal="true"`.

## Tests

- `frontend/src/hooks/__tests__/useKeyboardShortcuts.test.js` cubre los siete escenarios clave: atajo simple, atajo con modificador, chord completo, chord con timeout, no disparar dentro de input, `allowInInput`, hook deshabilitado.
