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
