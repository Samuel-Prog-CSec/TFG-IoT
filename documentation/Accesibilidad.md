# Accesibilidad — EduPlay RFID

> Última auditoría: 2026-05-20 (Sprint 0 post-v0.5.0). WCAG 2.2 nivel AA.

Este documento describe la estrategia de accesibilidad del proyecto y el procedimiento de verificación pre-release.

---

## 1. Estrategia general

- **Estándar**: WCAG 2.2 nivel AA.
- **Tooling automatizado**: `jest-axe` a nivel componente (suite en `frontend/src/__tests__/accesibilidad/`).
- **Tooling manual**: axe-core 4.10 inyectado vía Claude Code Playwright MCP en QA pre-release.
- **Tokens semánticos**: el tema light usa la custom variant `light:` de Tailwind v4 (`@custom-variant light (&:where([data-theme="light"], [data-theme="light"] *))`). No usar `dark:` — el proyecto no lo registra como variant.

---

## 2. Cómo correr los tests automatizados

```bash
cd frontend
npm run test:accesibilidad
```

La suite corre solo `frontend/src/__tests__/accesibilidad/` con vitest + jest-axe + testing-library. Sin browser, sin Docker. Útil para pre-commit y CI.

### Qué cubre

| Archivo | Componentes | Casos |
|---|---|---|
| `StatusBadge.test.jsx` | StatusBadge (6 estados × 2 sizes) | 12 |
| `TierBadges.test.jsx` | TIER_CONFIG + TIER_BADGE (4 tiers × 2 mapas) | 8 |
| `SeverityStyles.test.jsx` | SEVERITY_STYLES (3 niveles teacher) | 3 |
| `SystemAlertBadges.test.jsx` | SOURCE_STYLES (7 fuentes) + ANNOUNCEMENT_SEVERITY_STYLES (3 niveles) | 10 |
| `MechanicChip.test.jsx` | Chip de mecánica (3 mecánicas × 4 tiers) | 12 |
| `ContentEffectivenessMatrix.test.jsx` | Matrix con datos representativos | 3 |

Cada test se corre en **dark + light** vía `expectSinViolacionesEnAmbosTemas` (helper en `helpers.js`).

### Qué NO cubre

- Atmosphere aurora compuesta (color-mix renderizado real del backdrop).
- Focus order y keyboard navigation a nivel página.
- Interacciones complejas (apertura de modales, dropdowns).

Para estos casos, se hace el checklist manual de la sección 4.

---

## 3. Patrón de uso de tokens semánticos

### Para texto sobre fondo de alpha del mismo tono (badges, alertas)

Usar **siempre** el patrón `text-{tone}-base light:text-{tone}-dark`:

```jsx
// ✅ CORRECTO
<span className="bg-warning-base/15 text-warning-base light:text-warning-dark">
  Promedio
</span>

// ❌ INCORRECTO — dark: no funciona en este proyecto
<span className="bg-warning-base/15 text-warning-base dark:text-warning-light">
  Promedio
</span>
```

### Para acentos críticos en dark con alpha rojo

`text-error-base` en dark + bg-error-base/15 da 4.13-4.35:1 (bajo AA). Usar **`text-red-300`**:

```jsx
<span className="bg-error-base/15 text-red-300 light:text-error-dark">
  Necesita apoyo
</span>
```

### Para chart text-muted sobre cards dark

`text-text-muted` sobre cards dark-elevated da 4.4:1 (bajo AA). Usar **`text-text-secondary`**:

```jsx
<p className="text-xs text-text-secondary">
  6 partidas
</p>
```

---

## 4. Checklist manual con Claude Code

Antes de cada release, ejecuta este checklist desde Claude Code con Playwright MCP:

### Setup

1. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` (esperar healthy).
2. Login como teacher: `maria@test.com` / `Test1234!`.
3. Inyectar axe-core en cada página:
   ```js
   const s = document.createElement('script');
   s.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js';
   document.head.appendChild(s);
   await new Promise(r => { s.onload = r; });
   const r = await axe.run({runOnly:['wcag2a','wcag2aa']});
   r.violations.length // → 0
   ```
4. Toggle de tema vía `Shift+T`. Verificar `document.documentElement.getAttribute('data-theme')` cambia.

### Páginas teacher (con Maria)

| Ruta | Validado | Notas |
|---|---|---|
| /login | ✓ | (logout primero) |
| /register | ✓ | |
| /privacy | ✓ | |
| /dashboard | ✓ | |
| /sessions | ✓ | |
| /sessions/{id} | ✓ | con mecánica Secuencia para verificar aurora amber |
| /sessions/{id}/edit | ✓ | |
| /create-session | ✓ | |
| /game/{id} | ✓ | partida activa en Asociación |
| /decks | ✓ | |
| /decks/new | ✓ | wizard completo |
| /decks/{id} | ✓ | |
| /decks/{id}/edit | ✓ | confirmar dialog de unsaved changes |
| /contexts | ✓ | |
| /contexts/{id} | ✓ | |
| /analytics/students | ✓ | filtros + CSV export |
| /analytics/insights | ✓ | tabs efectividad/alertas/informes |
| /students/{id} | ✓ | StudentProfile con TrajectoryChart |

### Páginas super_admin (con admin)

| Ruta | Validado | Notas |
|---|---|---|
| /admin/approvals | ✓ | header "DIRECCIÓN" eyebrow |
| /admin/contexts | ✓ | header "BIBLIOTECA" + botones delete |
| /admin/students | ✓ | tabla 36 alumnos + modal "Nuevo Alumno" |
| /admin/students/transfer | ✓ | 3 combobox + previsualización |
| /admin/system-alerts | ✓ | tabs alertas/anuncios/bloqueos |
| /admin/mfa-setup | ✓ | enroll + backup codes |

### Criterio de éxito

- `axe.run({runOnly:['wcag2a','wcag2aa']})` retorna `violations.length === 0` en **cada** página × **ambos** temas.
- Excepción aceptada: `image-alt` causado por extensiones del navegador del usuario (Klarna, etc.) — son `<img name="kl_...">` inyectados por extensiones y no del código del proyecto.

---

## 5. Decisiones de diseño relevantes

- **Aurora atmosphere a opacity-10 + color-mix con bg-base**: en `AppLayout.jsx` la capa decorativa se mezcla 10-12% con el fondo base. Más opacidad rompe contraste de breadcrumbs y subtítulos sobre la capa. Documentado en `Architecture_Decisions.md` (ADR pendiente Sprint 0).
- **Tokens `-on-light` semánticos (post-Sprint 0)**: planificado en `documentation/Architecture_Decisions.md` para eliminar los 57 workarounds `light:text-*-dark` por tokens semánticos puros.
- **Cards clicables operables por teclado (WCAG 2.1.1)**: los primitivos de tarjeta navegable (`HoverLiftCard`, `StatCard`), cuando reciben un manejador de activación, exponen `role="button"` + `tabIndex={0}` + activación con Enter/Espacio + anillo de foco; sin manejador no fingen interactividad. Evita que una tarjeta navegable con ratón quede fuera del alcance de teclado y lector de pantalla (caso real: las tarjetas de Contextos, que no llevan botón interno). Documentado en `Architecture_Decisions.md` (ADR-192).

---

## 6. Referencias

- WCAG 2.2 AA: https://www.w3.org/WAI/WCAG22/quickref/
- axe-core rules: https://dequeuniversity.com/rules/axe/4.10
- jest-axe: https://github.com/nickcolley/jest-axe
- Tailwind v4 `@custom-variant`: https://tailwindcss.com/docs/adding-custom-styles#adding-custom-variants
