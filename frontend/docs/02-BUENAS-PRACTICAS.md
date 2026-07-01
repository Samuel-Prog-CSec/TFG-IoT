# ✅ Buenas Prácticas

## 1. Estructura de Carpetas

```
src/
├── components/       # Componentes reutilizables
│   ├── common/       # Genéricos (ErrorBoundary, Loader)
│   ├── ui/           # Primitivos de UI (Button, Input, Card)
│   ├── game/         # Específicos del juego
│   ├── dashboard/    # Específicos del dashboard
│   ├── effects/      # Efectos visuales (Confetti, Sparkles)
│   └── layout/       # Layout y navegación
├── pages/            # Vistas/rutas principales
├── hooks/            # Custom hooks
├── context/          # Context providers
├── constants/        # Configuración y constantes
├── services/         # API calls y servicios externos
├── lib/              # Utilidades genéricas
└── assets/           # Imágenes, fuentes, etc.
```

**¿Por qué esta estructura?**
- **Escalabilidad:** Fácil añadir nuevas features
- **Descubribilidad:** Saber dónde buscar cada cosa
- **Co-locación:** Archivos relacionados juntos

---

## 2. Nomenclatura

### Archivos
| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Componentes | PascalCase | `StatCard.jsx` |
| Hooks | camelCase con `use` | `useGameTimer.js` |
| Utilidades | camelCase | `utils.js` |
| Constantes | camelCase | `gameConfig.js` |
| Context | PascalCase | `GameContext.jsx` |

### Variables y Funciones
```jsx
// ✅ Bueno
const [isLoading, setIsLoading] = useState(false);
const handleSubmit = () => {};
const MAX_ROUNDS = 10;

// ❌ Evitar
const [loading, setloading] = useState(false);
const submit = () => {};
const maxrounds = 10;
```

---

## 3. Props y PropTypes

### Siempre definir PropTypes
```jsx
import PropTypes from 'prop-types';

function Button({ variant, children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}

Button.propTypes = {
  variant: PropTypes.oneOf(['primary', 'secondary']),
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
};
```

### Desestructurar props con valores por defecto
```jsx
// ✅ Bueno
function Card({ title, subtitle = 'Sin descripción', ...rest }) {}

// ❌ Evitar
function Card(props) {
  const title = props.title;
  const subtitle = props.subtitle || 'Sin descripción';
}
```

---

## 4. Performance

### React.memo para componentes puros
```jsx
import { memo } from 'react';

// Solo re-renderiza si props cambian
const StatCard = memo(function StatCard({ title, value }) {
  return <div>{title}: {value}</div>;
});
```

### useCallback para funciones pasadas como props
```jsx
const handleClick = useCallback(() => {
  // lógica
}, [dependencias]);

<Button onClick={handleClick} />
```

### useMemo para cálculos costosos
```jsx
const sortedItems = useMemo(() => {
  return items.sort((a, b) => a.score - b.score);
}, [items]);
```

### Lazy loading de páginas
```jsx
const Dashboard = lazy(() => import('./pages/Dashboard'));
```

---

## 5. Accesibilidad (A11y)

### HTML Semántico
```jsx
// ✅ Bueno
<main>
  <header>...</header>
  <section aria-labelledby="stats-title">
    <h2 id="stats-title">Estadísticas</h2>
    <article>...</article>
  </section>
  <aside>...</aside>
</main>

// ❌ Evitar
<div>
  <div>...</div>
  <div>
    <div>Estadísticas</div>
    <div>...</div>
  </div>
</div>
```

### Atributos ARIA
```jsx
// Diálogos
<div role="dialog" aria-modal="true" aria-labelledby="title">

// Regiones en vivo
<div aria-live="polite">Puntuación: {score}</div>

// Elementos decorativos
<span aria-hidden="true">🎉</span>
```

### Labels para formularios
```jsx
<label htmlFor="email">Email</label>
<input id="email" type="email" />

// O con aria-label
<input aria-label="Buscar estudiantes" type="search" />
```

---

## 6. Estado

### Colocar estado lo más cerca posible
```jsx
// ✅ Estado local si solo lo usa este componente
function SearchBar() {
  const [query, setQuery] = useState('');
  return <input value={query} onChange={e => setQuery(e.target.value)} />;
}

// ✅ Levantar estado si lo comparten hermanos
function Parent() {
  const [selected, setSelected] = useState(null);
  return (
    <>
      <List onSelect={setSelected} />
      <Details item={selected} />
    </>
  );
}

// ✅ Context para estado global
<GameProvider>
  <GameSession />  // Accede al estado del juego
</GameProvider>
```

---

## 7. Imports

### Orden de imports
```jsx
// 1. React y bibliotecas externas
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

// 2. Componentes internos
import Button from '../ui/Button';

// 3. Hooks, context, utils
import { useGame } from '../context/GameContext';
import { cn } from '../lib/utils';

// 4. Constantes y tipos
import { GAME_CONFIG } from '../constants';

// 5. Estilos (si los hay)
import './styles.css';
```

### Barrel exports
```jsx
// components/ui/index.js
export { default as Button } from './ButtonPremium';
export { default as Input } from './InputPremium';

// Uso
import { Button, Input } from '../components/ui';
```

---

## 8. Manejo de Errores

### Error Boundaries para errores de renderizado
```jsx
<ErrorBoundary fallback={<ErrorPage />}>
  <App />
</ErrorBoundary>
```

### Try-catch para operaciones async
```jsx
const fetchData = async () => {
  try {
    setLoading(true);
    const data = await api.getData();
    setData(data);
  } catch (error) {
    setError(error.message);
    console.error('Error fetching data:', error);
  } finally {
    setLoading(false);
  }
};
```

---

## 9. Commits y Git

### Conventional Commits
```
feat: añadir componente TimerBar
fix: corregir cálculo de puntuación
docs: actualizar README
style: formatear código con Prettier
refactor: extraer lógica a useGameTimer
test: añadir tests para ScoreDisplay
chore: actualizar dependencias
```

---

## 10. Checklist de Code Review

- [ ] ¿Tiene PropTypes definidos?
- [ ] ¿Usa HTML semántico?
- [ ] ¿Tiene atributos ARIA donde corresponde?
- [ ] ¿El estado está en el nivel correcto?
- [ ] ¿Los efectos tienen dependencias correctas?
- [ ] ¿Hay console.logs que eliminar?
- [ ] ¿Los nombres son descriptivos?
- [ ] ¿Se puede simplificar alguna lógica?

---

## 11. Checklist UX Funcional (T-060)

- [ ] ¿Los botones visibles tienen acción real o están deshabilitados explícitamente?
- [ ] ¿Se evita affordance engañosa (cursor/hover de click) en elementos sin navegación?
- [ ] ¿Los selectores/filtros del dashboard están conectados a estado real?
- [ ] ¿`useReducedMotion` está aplicado en vistas críticas sin desactivar motion por defecto?
- [ ] ¿Los `setTimeout`/listeners tienen cleanup en `useEffect`?
- [ ] ¿Las acciones rápidas navegan con React Router y no con recarga completa?

---

*Referencia: [React Best Practices](https://github.com/goldbergyoni/nodebestpractices)*

## Sprint 0 pre-v1.0.0 — Perf hooks y cleanup defensivo (ADR-164)

### `useInView` + `useReducedMotion` para gating de loops
`framer-motion` permite gatear animaciones `repeat: Infinity` con la combinación `useInView(ref)` + `useReducedMotion()`. Aplicado en `CharacterMascot.jsx`:

```jsx
const containerRef = useRef(null);
const isInView = useInView(containerRef, { once: false, margin: '0px' });
const animationsActive = isInView && !shouldReduceMotion;

<motion.div
  animate={animationsActive ? bodyAnimation[expr.bodyAnim] : { x:0,y:0,scale:1,rotate:0 }}
/>
```

Sin esto, los rAF de Framer Motion siguen activos cuando el componente está fuera de viewport (típicamente tras `Jugar de nuevo` → GameOver sigue montado en background, o scroll lejos en Dashboard). Con esto, CPU/rAF gastados se reducen a ~0 fuera de pantalla. `once: false` permite reanudar al volver a entrar.

**Regla:** cualquier componente con `repeat: Infinity` debe combinar `useInView` + `useReducedMotion` o documentar por qué no.

### Auto-cleanup de timers/intervals en custom hooks
Patrón: si un hook lanza `setInterval`, `setTimeout` o `requestAnimationFrame` que puede sobrevivir al unmount del consumer, almacenar los IDs en un `useRef(new Set())` y limpiar en cleanup de `useEffect([])`. Ver `useConfetti.js`:

```js
const activeIntervalsRef = useRef(new Set());

useEffect(() => {
  const intervals = activeIntervalsRef.current;
  return () => {
    for (const id of intervals) clearInterval(id);
    intervals.clear();
  };
}, []);
```

Esto cubre el caso "consumer ignora el cleanup return del callback" (común cuando el callback se llama desde un useEffect del consumer). Compatible con `canvas-confetti` que gestiona su propio rAF interno — solo limpiamos nuestros intervals adicionales.

### Tests regresivos de DTOs (red de seguridad)
Patrón backend que aplica también al frontend: cuando un serializador (DTO o transformer) tiene la responsabilidad de NO exponer campos, escribir un test que valide `expect(dto).not.toHaveProperty('password')`. Ver `backend/tests/security/dtoOutputSanitization.test.js` para el patrón completo.

---

## Pre-v1.0.0 — Fase D (cliente + FE↔BE)

### D.1 — AbortController universal en `useEffect` con fetch

Patrón aplicado en 6 páginas (`AdminContexts`, `SystemAlertsPage`, `StudentManagement`, `ContextDetailPage`, `ConsentDetailPanel`, `MfaSetup`) — ver ADR-173.

```jsx
useEffect(() => {
  const controller = new AbortController();
  fetchFn(controller.signal)
    .then(setData)
    .catch(err => { if (!isAbortError(err)) setError(err) });
  return () => controller.abort();
}, [deps]);
```

Reglas:
- **Solo GET**. POST/PUT/DELETE NO se abortan (riesgo de efectos secundarios mid-petición).
- El servicio API recibe `{ signal }` en su `config` (segundo arg de axios). Verificar firma del endpoint:
  - `usersAPI.getUser(userId, config)` ✓
  - `contextsAPI.getContexts(params, config)` ✓
  - `authAPI.mfaStatus(config)` ✓
- `isAbortError(err)` está exportado en `services/api.js` — silencia el error tras `controller.abort()`.

**No usar** SWR / React Query salvo que emerja necesidad de cache global / mutations / infinite queries. Decisión consciente — ADR-173 documenta el razonamiento.

### D.2 — In-flight dedup helper

`services/inFlight.js` exporta `dedupRequest(key, fetchFn)`. Si dos componentes llaman al mismo endpoint en paralelo, ambos reciben la misma promesa.

Aplicar **selectivamente** en endpoints calientes de bootstrap:
- `authAPI.getProfile()` — siempre (AuthContext + AppLayout post-login).
- `contextsAPI.getContexts(params, config)` — solo si `!params && !config.signal` (default call de bootstrap).
- `mechanicsAPI.getMechanics(params, config)` — idem.

**NO blanket policy**. Solo donde demostradamente hay race condition. Si el caller pasa `signal` o `params` específicos, NO se dedupa.

### D.4 — Width/height en `<img>` para CLS = 0

Cada `<img>` no decorativo lleva HTML attrs `width` + `height` + `loading="lazy"` + `decoding="async"`:

```jsx
<img
  src={avatar}
  alt=""
  width={40}
  height={40}
  loading="lazy"
  decoding="async"
  className="size-full rounded-full object-cover"
/>
```

Tailwind `size-N` NO sustituye los HTML attrs — el browser usa los atributos HTML para reservar layout box antes del fetch.

---

## Mantenimiento v1.0.0 — Resolución de identificadores `id` / `_id` (ADR-193)

Los DTO de dominio del backend exponen **tanto `id` como `_id`**. Resolverlos a mano (`x.id || x._id`) se filtraba como bugs recurrentes: etiquetas «Desconocido» cuando un `.find(x => x._id === filtro)` no casaba (el DTO traía `id`), o comparaciones `undefined === undefined` que daban `true`.

**Regla:** usar `lib/entityId.js`, no leer `id`/`_id` a mano.

```jsx
import { getId, sameId, findById } from '../lib/entityId';

getId(entity);              // entity.id ?? entity._id, normalizado a string o null
sameId(a, b);              // compara por id normalizado (b admite un id string); nunca true si ambos sin id
findById(list, idOrEntity); // .find por id normalizado; seguro ante listas no-array

// Evitar:
const m = mechanics.find(x => x._id === filtro); // "Desconocido" si el DTO trae `id`
const same = a._id === b._id;                    // undefined === undefined → true

// Preferir:
const m2 = findById(mechanics, filtro);
const same2 = sameId(a, b);
```

**Excepción:** no aplica a campos semánticos propios (`studentId`, `contextId`, `uid`, `sensorId`, `playerId`), que identifican por otro criterio y se leen explícitamente.

---

## Mantenimiento (ADR-224) — Distinguir "error" de "sin datos" y no anular `memo`

### Estados de error vs. vacío (patrón consistente)

Una pantalla que carga datos NO debe presentar un fallo de red/servidor como si fuera un "no encontrado" o un "no tienes nada": el usuario no técnico se queda sin acción y sin entender qué pasó. Regla aplicada en `SessionDetail`, `SessionEdit`, `CardDeckDetailPage`, `ContextDetailPage`, `StudentsAnalytics`, `BoardSetup` y el asistente de creación de sesión:

```jsx
// El estado de error distingue TRES casos, no dos.
catch (err) {
  setError({
    isNotFound: err?.response?.status === 404,   // no existe → EmptyState "no encontrado"
    isForbidden: err?.response?.status === 403,  // sin permiso → estado "Sin acceso"
    message: extractErrorMessage(err)
  });
}

// Render:
// - Error transitorio (red/5xx) → ErrorState CON reintento.
// - 403 → "Sin acceso" (icono candado, acción "Volver", SIN reintento: reintentar no da permiso).
// - 404 → "no encontrado" (acción "Volver").
if (error && !error.isNotFound && !error.isForbidden) {
  return <ErrorState message={error.message} onRetry={load} />;
}
const forbidden = Boolean(error?.isForbidden);
return <EmptyState title={forbidden ? 'Sin acceso' : 'No encontrado'} icon={forbidden ? <Lock/> : <NotFoundIcon/>} action={<VolverButton/>} />;
```

- Un `.catch(() => null)` que colapsa el error a "sin datos" oculta 500s en diagnóstico: si el fetch es secundario, degradar a `null` PERO reportar a Sentry (`captureException`) salvo abort.
- Si una función de render supera el umbral de complejidad ciclomática al añadir la rama de error, extraer el fallback a un sub-componente con `propTypes` (p. ej. `SessionEditLoadFallback`).

### No anular `React.memo` con props inline

`icon={<Icon/>}` y `onClick={() => nav()}` crean una referencia nueva por render → un componente `memo` (StatCard, HeroStatCard, CrossMatrix) se re-renderiza igualmente. Hoistear el JSX estático a constantes de módulo (`rendering-hoist-jsx`) y estabilizar los handlers con `useCallback`:

```jsx
// Módulo (fuera del componente): elemento estable entre renders.
const ICON_SCORE = <Trophy size={24} aria-hidden="true" />;

function Dashboard() {
  const goToStudents = useCallback(() => navigate('/analytics/students'), [navigate]);
  return <StatCard icon={ICON_SCORE} onClick={goToStudents} .../>;
}
```

- Componentes que se renderizan bajo un timer (p. ej. el panel táctil de fallback bajo el tick de partida) deben ir `memo` + `useMemo` en sus cálculos (`sort`, filtros) atados a las deps reales.
- Fetches independientes que dependen de las mismas entradas van en `Promise.all`, no en cascada (evita waterfalls en `StudentProfile`, `BoardSetup`).
