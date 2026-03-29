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

*Referencia: [React Patterns](https://reactpatterns.com/)*
