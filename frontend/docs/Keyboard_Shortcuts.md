# Atajos de teclado

Última actualización: 2026-05-11 (T-952 — `Shift+T` para tema añadido).

EduPlay dispone de un sistema de atajos de teclado a dos niveles:

1. **Globales** — funcionan en CUALQUIER pantalla de la app, incluso antes de
   autenticarse (Login, Register), en el AppLayout y durante el gameplay
   (GameLayout). Los registra `<GlobalShortcuts />` montado en el root de la app.
2. **Contextuales** — dependen del layout activo (sidebar, ruta, rol). Los
   registra cada layout via `useRegisterShortcutSource()`.

El overlay accesible con `Shift+?` muestra los atajos aplicables al contexto
actual: en Login/Register solo el set "Sistema"; en AppLayout además
"Navegación", "Acciones" y "Vista".

---

## Atajos globales (Sistema)

| Atajo | Acción | Notas |
|---|---|---|
| `Shift + T` | Alternar tema claro / oscuro | Anima con View Transition API en Chrome/Edge ≥111 y Safari ≥18; fallback CSS suave en el resto. Respeta `prefers-reduced-motion`. |
| `Shift + ?` | Abrir overlay de atajos | Lista de atajos del contexto actual con `<kbd>` semánticos. |
| `Escape` | Cerrar diálogos abiertos | Se permite dentro de inputs (`allowInInput: true`). |

---

## Atajos contextuales — AppLayout (rol profesor)

### Navegación

| Atajo | Acción |
|---|---|
| `g d` | Ir al Dashboard |
| `g s` | Ir a Sesiones |
| `g m` | Ir a Mis Mazos |
| `g a` | Ir a Mis Alumnos |
| `g c` | Ir a Contextos |
| `g i` | Ir a Insights |

### Acciones

| Atajo | Acción |
|---|---|
| `Shift + N` | Nueva sesión |

### Vista

| Atajo | Acción |
|---|---|
| `[` | Alternar tamaño de la sidebar |

---

## Atajos contextuales — AppLayout (rol super_admin)

### Navegación (dirección del centro)

| Atajo | Acción |
|---|---|
| `g x` | Ir a Aprobaciones |
| `g a` | Ir al alumnado del centro |
| `g c` | Ir a Contextos |

### Vista

| Atajo | Acción |
|---|---|
| `[` | Alternar tamaño de la sidebar |

---

## Detalles técnicos

- **Implementación:** `frontend/src/hooks/useKeyboardShortcuts.js`,
  `frontend/src/context/ShortcutRegistryContext.jsx`,
  `frontend/src/components/system/GlobalShortcuts.jsx`,
  `frontend/src/components/ui/KeyboardShortcutsOverlay.jsx`.
- **Guard contra inputs:** los atajos no se disparan dentro de `input`,
  `textarea`, `contenteditable` ni `role="textbox"` salvo que se marquen
  `allowInInput: true` (Escape lo hace).
- **Chords:** la sintaxis `g s` significa "pulsa `g`, luego `s` en ≤1500ms"
  (`CHORD_TIMEOUT_MS`).
- **Canonical de teclas:** `Shift+letra` preserva la mayúscula nativa de
  `event.key`. Letras sin modificador van en minúscula. Caracteres especiales
  con Shift (`?`, `/`) reciben prefijo `Shift+` explícito.

### Cómo añadir un atajo nuevo

1. **Global:** modificar `systemSections` en
   `frontend/src/components/system/GlobalShortcuts.jsx`. Vivirá en Login,
   Register, AppLayout y GameLayout sin acoplarse a ninguno.
2. **Contextual a un layout:** en el layout (e.g. `AppLayout.jsx`) añadir el
   atajo a `layoutShortcutSections` y registrarlo con
   `useRegisterShortcutSource('id-unico', sections)`. El atajo aparece y
   desaparece automáticamente con el ciclo de vida del layout.

### ADRs relacionados

- ADR-115 — Tema light + onboarding + atajos T-951 base.
- ADR-123 — Atajo `Shift+T` global, View Transition API, GlobalShortcuts y ShortcutRegistry (T-952 Fase 1).
