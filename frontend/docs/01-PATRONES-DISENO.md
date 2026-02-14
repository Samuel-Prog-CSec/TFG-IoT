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
  <FeedbackOverlay /> // Solo muestra feedback
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

## Resumen de Decisiones

| Patrón | Uso Principal | Archivos Clave |
|--------|---------------|----------------|
| Composition | Toda la app | Todos los componentes |
| Custom Hooks | Lógica reutilizable | `/hooks/*` |
| Context + Reducer | Estado del juego | `/context/GameContext.jsx` |
| Container/Presentational | Separar lógica/UI | `/pages` vs `/components` |
| Error Boundary | Manejo de errores | `/components/common/ErrorBoundary.jsx` |

---

*Referencia: [React Patterns](https://reactpatterns.com/)*
