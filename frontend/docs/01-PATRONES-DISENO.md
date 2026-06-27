# 🏗️ Patrones de Diseño

## 1. Component Composition Pattern

**Qué es:** Construir componentes complejos combinando componentes más pequeños y reutilizables.

**Por qué lo usamos:**
- Facilita testing unitario
- Mejora la reutilización
- Reduce acoplamiento

**Ejemplo en el proyecto:**
```jsx
// GameSession.jsx combina múltiples componentes especializados
<GameSession>
  <TimerBar />        // Solo maneja el tiempo
  <ScoreDisplay />    // Solo muestra puntuación
  <ChallengeDisplay /> // Solo muestra el desafío
  <CharacterMascot /> // Solo reacciona al juego
</GameSession>
```

---

## 2. Container/Presentational Pattern

**Qué es:** Separar la lógica de negocio (containers) de la presentación (components).

**Por qué lo usamos:**
- Componentes de UI puros y reutilizables
- Lógica centralizada y testeable
- Facilita cambios de UI sin afectar lógica

**Ejemplo:**
```
pages/           → Containers (lógica, estado, fetch)
components/      → Presentational (solo UI, reciben props)
```

| Tipo | Responsabilidad | Ejemplo |
|------|-----------------|---------|
| Container | Estado, efectos, API calls | `GameSession.jsx` |
| Presentational | Renderizado, estilos | `TimerBar.jsx` |

---

## 3. Custom Hooks Pattern

**Qué es:** Extraer lógica reutilizable a funciones que empiezan con `use`.

**Por qué lo usamos:**
- Reutilización de lógica entre componentes
- Separación de concerns
- Testing más sencillo

**Hooks creados:**

| Hook | Propósito |
|------|-----------|
| `useIsMobile` | Detectar viewport móvil |
| `useDocumentTitle` | Cambiar título de página |
| `useGameTimer` | Lógica del temporizador |
| `useFetch` | Peticiones HTTP genéricas |

```jsx
// hooks/useGameTimer.js
export function useGameTimer(initialTime, onTimeout) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  // ... lógica del timer
  return { timeLeft, pause, resume, reset };
}
```

---

## 4. Context + Reducer Pattern

**Qué es:** Combinar Context API con useReducer para estado global predecible.

**Por qué lo usamos:**
- Estado complejo del juego (múltiples propiedades relacionadas)
- Acciones tipadas y predecibles
- Evita prop drilling profundo
- Alternativa ligera a Redux

**Implementación:**
```jsx
// context/GameContext.jsx
const gameReducer = (state, action) => {
  switch (action.type) {
    case 'START_GAME': return { ...state, status: 'playing' };
    case 'CORRECT_ANSWER': return { 
      ...state, 
      score: state.score + action.payload 
    };
    // ...más acciones
  }
};
```

**Cuándo usar Context vs Props:**
- **Props:** 1-2 niveles de profundidad
- **Context:** 3+ niveles o estado compartido entre hermanos

---

## 5. Render Props / Children as Function

**Qué es:** Pasar funciones como children para compartir lógica de renderizado.

**Por qué lo usamos:**
- Flexibilidad en el renderizado
- Inversión de control

**Ejemplo con ErrorBoundary:**
```jsx
<ErrorBoundary fallback={<CustomError />}>
  <MyComponent />
</ErrorBoundary>
```

---

## 6. Higher-Order Component (HOC) - Limitado

**Qué es:** Función que recibe un componente y retorna uno mejorado.

**Por qué lo usamos con moderación:**
- Preferimos Hooks para nueva lógica
- HOCs solo cuando es estrictamente necesario (ej: ErrorBoundary es una Class Component)

---

## 7. Compound Components Pattern

**Qué es:** Componentes que trabajan juntos compartiendo estado implícito.

**Ejemplo futuro para formularios:**
```jsx
<Form onSubmit={handleSubmit}>
  <Form.Field name="email" />
  <Form.Field name="password" type="password" />
  <Form.Submit>Enviar</Form.Submit>
</Form>
```

---

## 8. Controlled vs Uncontrolled Components

**Qué es:** Decidir si React controla el estado del input o el DOM.

**Nuestra regla:**
- **Controlled** para formularios que necesitan validación en tiempo real
- **Uncontrolled** (refs) para formularios simples de envío único

---

## 9. Patrón Singleton para Servicios de Comunicación

Los servicios de comunicación del frontend (`SocketService` y `WebSerialService`) implementan el patrón singleton para garantizar una única instancia compartida por toda la aplicación.

### Motivación

- **Socket.IO**: Solo una conexión WebSocket activa por usuario. Múltiples instancias crearían conexiones duplicadas y conflictos de autenticación.
- **Web Serial**: Solo un puerto serial abierto simultáneamente. El navegador no permite que dos instancias lean del mismo puerto.

### Implementación

Cada servicio se exporta como instancia única:

```javascript
// services/socket.js
class SocketService {
  // Métodos de conexión, emisión y suscripción
}
export const socketService = new SocketService();

// services/webSerialService.js
class WebSerialService {
  // Métodos de conexión serial, parsing y deduplicación
}
export const webSerialService = new WebSerialService();
```

### Patrones de Emisión

Los servicios usan dos patrones de emisión diferenciados:

| Patrón | Método | Uso | Ejemplo |
| --- | --- | --- | --- |
| **Con ACK** | `emit(event, data)` | Comandos que requieren confirmación | `join_play`, `start_play` |
| **Fire-and-forget** | `emitFireAndForget(event, data)` | Eventos de alta frecuencia sin confirmación | `rfid_scan_from_client`, `play_state_sync` |

La elección se basa en la criticidad: comandos de gameplay usan ACK; escaneos RFID usan fire-and-forget porque el rate limiter del backend elimina el callback y la cola de pendientes del frontend gestiona las desconexiones.

### Comunicación Event-Driven entre Servicios

Los servicios se comunican mediante eventos del DOM y eventos internos:

```text
┌──────────────────┐     socket_reconnected      ┌─────────────────┐
│  WebSerialService│◄──── (CustomEvent DOM) ──────│  SocketService  │
│                  │                              │                 │
│ flushPendingScans│                              │ _wasConnected   │
│ (envía cola)     │                              │ → dispatch event│
└──────────────────┘                              └─────────────────┘
```

Cuando el `SocketService` detecta una reconexión exitosa, emite un `CustomEvent` en `window`. El `GameSession.jsx` escucha este evento y llama a `webSerialService.flushPendingScans()` para enviar los scans encolados durante la desconexión.

### Cola de Pendientes (WebSerialService)

El `WebSerialService` implementa una cola interna para scans que no pueden enviarse por desconexión del socket:

- **Capacidad**: 200 scans máximo
- **TTL**: 30 segundos por scan
- **Poda**: Automática al añadir nuevos scans (elimina expirados)
- **Flush**: Al reconectar el socket, se envían todos los scans no expirados

---

## Resumen de Decisiones

| Patrón | Uso Principal | Archivos Clave |
|--------|---------------|----------------|
| Composition | Toda la app | Todos los componentes |
| Custom Hooks | Lógica reutilizable | `/hooks/*` |
| Context + Reducer | Estado del juego | `/context/GameContext.jsx` |
| Container/Presentational | Separar lógica/UI | `/pages` vs `/components` |
| Error Boundary | Manejo de errores | `/components/common/ErrorBoundary.jsx` |
| Singleton | Servicios de comunicación | `/services/socket.js`, `/services/webSerialService.js` |

---

## Convenciones de Framer Motion (lecciones de QA pre-release v0.5.0)

La suite de QA del 18/04/2026 descubrió dos bugs graves provocados por el mismo malentendido sobre la propagación de variants. Documentado en ADR-059 y ADR-060.

### Regla 1 — Propagación explícita de variants

**Síntoma**: una lista tiene datos pero no se renderiza porque los items quedan atascados en `opacity:0; transform:translateY(...)` (el estado `hidden` del variant).

**Causa**: el `motion.child` tiene `variants={...}` pero su padre:
- No es un `motion.container` con `initial` + `animate`, o
- Es un `motion.container` pero hay un `<AnimatePresence>` en medio, o
- El padre se montó antes que los children y no vuelve a disparar `animate` al añadirse datos.

**Regla**: cuando el padre no garantiza la propagación, añadir `initial="hidden" animate="visible"` directos al child. Es ligeramente redundante si el padre está OK, pero es robusto frente a refactors.

```jsx
// Antes (frágil)
<ul>
  {items.map(i => <motion.li variants={staggerItem}>...</motion.li>)}
</ul>

// Después (robusto)
<motion.ul variants={staggerContainer} initial="hidden" animate="show">
  {items.map(i => <motion.li variants={staggerItem}>...</motion.li>)}
</motion.ul>

// Alternativa cuando no se quiere orchestrator
<ul>
  {items.map(i => (
    <motion.li variants={staggerItem} initial="hidden" animate="visible">...</motion.li>
  ))}
</ul>
```

### Regla 2 — `pointer-events` en exit animations

**Síntoma**: al navegar de una ruta a otra, el botón de la nueva página no responde a clicks en el primer segundo. En el DOM aparecen dos copias (entrante + saliente) bajo StrictMode.

**Causa**: `AnimatePresence mode="popLayout"` permite que el exit conviva con el enter. El wrapper saliente tiene `opacity:0` pero `pointer-events:auto` por defecto, interceptando clicks.

**Regla**: siempre que uses AnimatePresence para transiciones de ruta o contenido que se reemplaza, el `exit` debe incluir `pointerEvents: 'none'` y el `animate` debe restaurar `pointerEvents: 'auto'`.

```jsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1, pointerEvents: 'auto' }}
  exit={{ opacity: 0, pointerEvents: 'none' }}
>
```

Referencias: ADR-059, ADR-060, PROP-30, PROP-31, PROP-32.

---

## 14. Empty states contextualizados (ADR-069)

**Qué es:** Patrón para estados vacíos con tres variantes de UX y una ilustración SVG por dominio que sustituye al icono genérico.

**Por qué lo usamos:**
- Alejar la app de la estética "AI-slop" donde todos los empty states se ven iguales
- Transmitir identidad de producto (tokens OKLCH compartidos con el tema)
- UX contextual: el mensaje cambia según por qué la lista está vacía (sin datos vs. filtro activo)

**Ejemplo:**
```jsx
import { EmptySessionsIllustration } from '../components/ui/illustrations';

<EmptyState
  illustration={<EmptySessionsIllustration size={180} />}
  variant={hasActiveFilters ? 'filtered' : 'first-use'}
  title={hasActiveFilters ? 'Ninguna sesión coincide' : 'Aún no tienes sesiones'}
  description="..."
  action={<ButtonPremium>CTA</ButtonPremium>}
/>
```

**Contrato del componente (`components/ui/EmptyState.jsx`):**
| Prop | Tipo | Descripción |
|------|------|-------------|
| `illustration` | React node | SVG inline de la carpeta `illustrations/`. Sustituye a `icon` y se renderiza a ~180px. Recomendado para páginas principales. |
| `icon` | React node | Fallback al icono Lucide dentro del círculo si no hay ilustración. |
| `variant` | `'default' \| 'filtered' \| 'first-use'` | `filtered` muestra chip "Sin resultados" + CTA "Limpiar". `first-use` habilita `secondaryAction`. |
| `title`, `description`, `action`, `secondaryAction` | node | El `title` se renderiza como `<h2>` (configurable con `titleLevel`). |

**Ilustraciones disponibles** (en `components/ui/illustrations/`):
- `EmptySessionsIllustration` — mesa con cartas en abanico, glow radar
- `EmptyDecksIllustration` — stack de cartas en perspectiva
- `EmptyContextsIllustration` — libro + globo + huella animal
- `EmptyStudentsIllustration` — grupo de avatares con "+" central
- `EmptyAlertsIllustration` — campana en reposo con ondas apagadas (ADR-070)

Todas respetan `useReducedMotion` y usan tokens CSS para adaptarse al tema. El wrapper
de `illustration` dentro de `EmptyState` aplica `animate-float` automaticamente para
que las ilustraciones respiren con un leve up/down (reset global de `prefers-reduced-motion`
las desactiva).

Referencias: ADR-069, ADR-070, PROP-41A (primera iteración de empty states en DeckCard), skill `ui-ux-pro-max`.

---

## 14. Signature motion primitives: `ScanlineOverlay` y patron "Paper exit" (ADR-070)

### `<ScanlineOverlay>` — primitivo reutilizable

Una linea sutil que barre top→bottom reforzando la metafora "tactile/scan" del
producto RFID. Se aplica sobre tarjetas de listado secundarias (SessionCard,
ContextCard) que carecen de signature propia; **DeckCard no lo usa** porque
ya tiene gradient-shift en el borde como firma.

**Diseño CSS-controlled:** el componente renderiza siempre la animacion loop
(`motion.span` con infinite repeat). La visibilidad se controla desde fuera con
`opacity-0 group-hover:opacity-100 transition-opacity duration-300` en el wrapper
padre que debe llevar class `group`. Decision deliberada: evita anadir state JS
y handlers de mouse/pointer al padre, porque en tests con `userEvent.click`
romperian la propagacion del click cuando el padre es un motion.div con whileTap
(framer-motion 12 + jsdom).

```jsx
import ScanlineOverlay from '@/components/ui/ScanlineOverlay';

<HoverLiftCard glowTint={glowTint} className="group">
  <GlassCard className="relative overflow-hidden ...">
    <ScanlineOverlay className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    {/* contenido */}
  </GlassCard>
</HoverLiftCard>
```

Reglas:
- Solo en tarjetas interactivas primarias; nunca en botones pequenos ni inputs.
- El contenedor padre debe tener `position: relative` + `overflow: hidden` + la
  clase `group` para que `group-hover:` tenga efecto.
- Respeta `prefers-reduced-motion`: si esta activado, no renderiza nada (guard
  interno via hook `useReducedMotion`).

### Patron "Paper exit" en listas

Cuando un item sale de una lista (archive/delete/clone) no debe desaparecer
instantaneo. Envolver el `.map()` con `<AnimatePresence>` (sin `mode="popLayout"`
ni `layout` para no romper tests) y dar variants con hidden/visible/exit:

```js
const buildCardVariants = (shouldReduceMotion) => shouldReduceMotion
  ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0 } } }
  : {
      hidden: { opacity: 0, y: -12, scale: 0.94 },
      visible: { opacity: 1, y: 0, scale: 1, transition: motionConfig.springGame },
      exit: { opacity: 0, x: -24, scale: 0.92, rotate: -2, transition: { duration: DURATION.exit, ease: EASING.outQuart } },
    };
```

El item nuevo "cae y se asienta" (settle spring) y al salir "vuela" con un rotate
sutil — refuerza la metafora de papel fisico que retiras de la mesa. Aplicado en
`SessionsPage`, `ContextsPage`, `CardDecksPage`.

Referencias: ADR-070, skill `framer-motion-animator`.

---

## 15. Acción destructiva con undo vs `ConfirmationModal` (ADR-136)

Decidir entre **toast persistente con "Deshacer"** y `ConfirmationModal` para acciones potencialmente destructivas. No son intercambiables — cada uno encaja en un patrón de uso distinto.

### Usar **toast + undo** cuando

- La acción es **reversible en una ventana corta** (≤ 5-10 s).
- Se ejecuta **con frecuencia** y el modal introduce fricción que el usuario aprende a despachar sin leer (pérdida de la protección).
- El estado a restaurar **vive 100% en cliente** (refs, contextos in-memory) o el backend acepta diferir la materialización.
- Ejemplos en el proyecto: cierre de sesión (`AppLayout` → `deferLogout` + toast con action — ADR-136).

```jsx
// AuthContext expone deferLogout/undoLogout; AppLayout solo orquesta el toast.
const { deferLogout, undoLogout, isLoggingOut } = useAuth();

const handleLogoutClick = () => {
  if (isLoggingOut) return;
  if (!deferLogout({ delayMs: 5000 })) return;
  toast.success('Sesión cerrada', {
    description: 'Volverás al login en unos segundos.',
    duration: 5000,
    action: { label: 'Deshacer', onClick: () => undoLogout() && toast.success('Sigues conectado') },
  });
};
```

Patrón clave: el contexto (AuthContext) encapsula el `setTimeout` + cleanup + listener `pagehide` con `fetch keepalive: true` (red de seguridad si la pestaña se cierra durante la ventana). El componente UI **solo orquesta el toast** y deshabilita el botón con `isLoggingOut`.

### Usar **`ConfirmationModal`** cuando

- La acción es **irreversible** una vez ejecutada (eliminación física en backend, borrado de assets en Storage, anonimización RGPD Art. 17).
- El usuario debe **revisar contexto antes** (qué se va a borrar, qué dependencias afecta).
- La acción es **poco frecuente** — el coste de fricción del modal no se acumula.
- Ejemplos: eliminar contexto (`AdminContexts`), eliminar asset/audio (`ContextDetailPage`), borrado RGPD (`ConsentDetailPanel`, `StudentManagement`), descartar borrador del wizard (`DeckCreationWizard.handleDiscardDraft` — ADR-136).

Variantes del componente: `danger` para irreversibles (animación flip 3D + blip radial + icono `Trash2`), `warning` para cambios sin guardar, `archive` para soft-delete, `info` para confirmación neutra.

### Patrón híbrido: `useUnsavedChanges` + `confirmExit` (ADR-136)

Para wizards y editores que persisten cambios solo al pulsar "Guardar", el hook `useUnsavedChanges` combina:

- `beforeunload` (cierre de pestaña / refresh).
- `confirmExit(callback, options?)`: ejecuta el callback inmediato si no hay cambios; si los hay, abre un `ConfirmationModal` warning con el callback como `onConfirm`.

```jsx
const { confirmExit, confirmExitModalProps } = useUnsavedChanges(isDirty);

// Botón "Volver" / "Cancelar" / "X" / etc.
<ButtonPremium onClick={() => confirmExit(() => navigate(ROUTES.LIST))}>
  Cancelar
</ButtonPremium>

// En el JSX, al final del componente:
<ConfirmationModal {...confirmExitModalProps} />
```

**Cobertura actual** (sin migrar a Data Router):

| Escenario | ¿Bloquea? |
|---|---|
| Refresh / cerrar pestaña | ✅ `beforeunload` |
| Botón programático que llama `navigate()` (Volver, Cancelar, X) | ✅ `confirmExit(callback)` |
| Click en `<Link>` / `<NavLink>` (sidebar, breadcrumb) | ❌ requiere `createBrowserRouter` |

El gap del `<Link>` está documentado en ADR-136 como candidato a PROP futura. La cobertura actual cubre todos los flujos críticos de los 4 wizards/editores principales (`DeckCreationWizard`, `DeckEditPage`, `SessionEdit`, `CreateSession`).

### Antipatrón: modal de confirmación para cierre de sesión cotidiano

PROP-85 (Sprint 5) había añadido un modal warning para evitar logout accidental. Cumplía pero introducía fricción innecesaria al final de la jornada. Tras unas semanas, el usuario aprende a despachar el modal sin leer — perdiendo la protección que pretendía dar. T-957 (ADR-136) lo sustituye por **toast + undo**, manteniendo la red de seguridad sin coste de fricción.

Referencias: ADR-136, ADR-070, ADR-069, skill `frontend-design`.

---

*Referencia: [React Patterns](https://reactpatterns.com/)*

## Sprint 0 pre-v1.0.0 — Extracción incremental sobre `GameSession.jsx` (ADR-164)

`pages/GameSession.jsx` venía con `eslint-disable cyclomatic-complexity` y 1847 líneas. Sprint 0 aplica una **extracción de unidades puras testeables** sin partir el render JSX (Container/View split queda para Sprint 1 con justificación de riesgo).

### Custom Hook + Reducer (`useGameSessionState`)
Patrón: `hooks/useGameSessionState.js` expone el reducer del juego como hook reutilizable.

```js
import { useReducer, useRef } from 'react';

export function useGameSessionState() {
  const [game, dispatch] = useReducer(gameReducer, INITIAL_GAME_STATE);
  const gameStateRef = useRef(game.gameState);
  gameStateRef.current = game.gameState; // espejo para closures de socket
  return { game, dispatch, gameStateRef };
}
```

Beneficios:
- Reducer testeable independiente del JSX (tests unitarios cubren cada acción).
- `gameStateRef` espejado permite que callbacks de socket lean el último estado sin re-suscripción.
- **No envuelve en Context** porque el state solo se consume dentro de `GameSession.jsx`. Promover a Context cuando hermanos lo necesiten.

### Helper puro extraído (`normalizeFinalSummary`)
`lib/finalSummary.js` exporta una función pura que normaliza el `metrics` del backend en el shape esperado por `GameOverScreen`. Cubre las inconsistencias conocidas:
- `correctAnswers` del reducer local puede desincronizarse con `game_over` event → prioriza `metrics.correctAttempts`.
- Tiempo total acepta `completionTime` / `totalTimePlayed` / `playDuration` como alias.
- `maxScore` (ADR-114) validado como número finito positivo o `null`.

Tests cubren los 3 modos (`memory`, `association`, `sequence`) y los edge cases (rawMetrics null, maxScore inválido, etc.).

### Cuándo extraer
- **Sí extraer:** reducer + actions, helpers puros, hooks reutilizables, sub-componentes con responsabilidad clara y reutilizable.
- **No extraer trivialmente:** lógica enredada en useCallback/useEffect que captura muchas closures distintas (Container/View artificial). Mover esto sin un objetivo claro genera "shadow API" entre componentes y aumenta el riesgo de regresión sin reducir la complejidad real.

Esta heurística aplica también a las 7 páginas restantes con `eslint-disable cyclomatic-complexity` (Sprint 1).
