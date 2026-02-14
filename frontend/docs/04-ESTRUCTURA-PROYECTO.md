# 📁 Estructura del Proyecto

## Vista General

```
frontend/
├── docs/                    # 📚 Documentación (este directorio)
├── public/                  # 📦 Assets estáticos (favicon, etc.)
├── src/
│   ├── assets/              # 🖼️ Imágenes, SVGs importados
│   ├── components/          # 🧩 Componentes React
│   │   ├── common/          # Componentes genéricos reutilizables
│   │   ├── dashboard/       # Componentes del dashboard
│   │   ├── effects/         # Efectos visuales (confetti, sparkles)
│   │   ├── game/            # Componentes del juego
│   │   ├── layout/          # Layout principal (AppLayout)
│   │   └── ui/              # Primitivos de UI (Button, Input, Card)
│   ├── constants/           # ⚙️ Configuración y constantes
│   ├── context/             # 🌐 Context providers (estado global)
│   ├── hooks/               # 🪝 Custom hooks
│   ├── lib/                 # 🔧 Utilidades genéricas
│   ├── pages/               # 📄 Páginas/vistas principales
│   ├── services/            # 🌍 API calls y servicios
│   ├── index.css            # 🎨 Estilos globales + Tailwind
│   ├── main.jsx             # 🚀 Punto de entrada
│   └── router.jsx           # 🛣️ Configuración de rutas
├── .gitignore
├── eslint.config.js         # Configuración ESLint
├── index.html               # HTML principal + SEO
├── package.json
├── tailwind.config.js       # Configuración Tailwind (si existe)
└── vite.config.js           # Configuración Vite
```

---

## Detalle por Carpeta

### `/components/common/`
Componentes genéricos reutilizables en toda la app.

| Archivo | Propósito |
|---------|-----------|
| `ErrorBoundary.jsx` | Captura errores de renderizado |
| `index.js` | Barrel export |

**Criterio:** Un componente va aquí si es independiente del dominio (juego, dashboard) y puede usarse en cualquier proyecto React.

---

### `/components/ui/`
Primitivos de UI del design system.

| Archivo | Propósito |
|---------|-----------|
| `ButtonPremium.jsx` | Botón con variantes y estados |
| `InputPremium.jsx` | Input con estilos premium |
| `SelectPremium.jsx` | Select estilizado |
| `GlassCard.jsx` | Card con efecto glassmorphism |
| `SpotlightCard.jsx` | Card con efecto spotlight hover |
| `ProgressBarPremium.jsx` | Barra de progreso animada |
| `SkeletonShimmer.jsx` | Skeleton loading |
| `StatusBadge.jsx` | Badge de estado (activo, inactivo) |

**Criterio:** Componentes "tontos" que solo reciben props y renderizan. Sin lógica de negocio.

---

### `/components/game/`
Componentes específicos de la mecánica de juego.

| Archivo | Propósito |
|---------|-----------|
| `ChallengeDisplay.jsx` | Muestra el desafío actual |
| `TimerBar.jsx` | Barra de tiempo visual |
| `ScoreDisplay.jsx` | Puntuación con estrellas |
| `FeedbackOverlay.jsx` | Overlay de éxito/error |
| `GameOverScreen.jsx` | Pantalla de fin de juego |
| `CharacterMascot.jsx` | Mascota animada |

**Criterio:** Todo lo relacionado con la experiencia de juego del niño.

---

### `/components/dashboard/`
Componentes del panel de control para profesores.

| Archivo | Propósito |
|---------|-----------|
| `StatCard.jsx` | Tarjeta de estadística |
| `ChartSection.jsx` | Sección contenedora de gráficos |
| `StudentsList.jsx` | Lista de mejores estudiantes |

---

### `/components/effects/`
Efectos visuales y decorativos.

| Archivo | Propósito |
|---------|-----------|
| `Confetti.jsx` | Lluvia de confeti para celebraciones |
| `Sparkles.jsx` | Efecto de brillos/partículas |

---

### `/components/layout/`
Estructura principal de la aplicación.

| Archivo | Propósito |
|---------|-----------|
| `AppLayout.jsx` | Layout con sidebar, header, contenido |

---

### `/hooks/`
Custom hooks para lógica reutilizable.

| Hook | Propósito | Retorna |
|------|-----------|---------|
| `useIsMobile` | Detectar viewport móvil | `boolean` |
| `useDocumentTitle` | Cambiar título de página | `void` |
| `useGameTimer` | Temporizador del juego | `{ timeLeft, pause, resume, reset }` |
| `useFetch` | Peticiones HTTP | `{ data, loading, error, refetch }` |

---

### `/context/`
Providers de Context API.

| Archivo | Propósito |
|---------|-----------|
| `GameContext.jsx` | Estado global del juego (score, round, status) |

**Contenido del GameContext:**
```js
{
  status: 'idle' | 'playing' | 'paused' | 'finished',
  score: number,
  currentRound: number,
  totalRounds: number,
  correctAnswers: number,
  // ... más estado
}
```

---

### `/constants/`
Valores constantes y configuración.

| Archivo | Contenido |
|---------|-----------|
| `gameConfig.js` | `GAME_CONFIG`, `DIFFICULTY_CONFIG`, `GAME_STATES` |
| `routes.js` | `ROUTES` (paths), `NAV_ROUTES` (navegación) |

**Ejemplo gameConfig.js:**
```js
export const GAME_CONFIG = {
  DEFAULT_TIME_LIMIT: 15,
  DEFAULT_ROUNDS: 5,
  POINTS_CORRECT: 10,
  PENALTY_ERROR: -2,
};
```

---

### `/pages/`
Componentes de página (rutas principales).

| Archivo | Ruta | Descripción |
|---------|------|-------------|
| `Dashboard.jsx` | `/` | Panel principal |
| `CreateSession.jsx` | `/create-session` | Crear nueva sesión |
| `BoardSetup.jsx` | `/board-setup/:id` | Configurar tablero |
| `GameSession.jsx` | `/game/:id` | Pantalla de juego |

**Responsabilidades de una página:**
- Fetch de datos
- Manejo de estado de la vista
- Composición de componentes
- Conexión con Context si es necesario

---

### `/services/`
Comunicación con APIs externas.

| Archivo | Propósito |
|---------|-----------|
| `mockApi.js` | Datos mock para desarrollo |
| `api.js` (futuro) | Cliente HTTP real |
| `socket.js` (futuro) | Cliente WebSocket |

---

### `/lib/`
Utilidades genéricas.

| Archivo | Contenido |
|---------|-----------|
| `utils.js` | `cn()` (classnames), `calculateStars()`, animaciones |

---

## Convenciones de Archivos

### Nombrado
```
ComponentName.jsx      # Componente React
useSomething.js        # Custom hook
someUtil.js            # Utilidad
CONSTANT_NAME.js       # Constantes (aunque usamos camelCase en archivos)
```

### Barrel Exports
Cada carpeta con múltiples archivos tiene un `index.js`:

```js
// components/ui/index.js
export { default as ButtonPremium } from './ButtonPremium';
export { default as InputPremium } from './InputPremium';
// ...
```

Esto permite imports limpios:
```js
import { ButtonPremium, InputPremium } from '@/components/ui';
```

---

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────────┐
│                         PAGES                               │
│  (fetch data, manage view state, compose components)        │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      CONTEXT (opcional)                     │
│              (estado global compartido)                     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      COMPONENTS                             │
│            (reciben props, renderizan UI)                   │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    HOOKS / SERVICES                         │
│          (lógica reutilizable, API calls)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Añadir Nuevas Features

### Nueva Página
1. Crear archivo en `/pages/NuevaPage.jsx`
2. Añadir ruta en `/router.jsx`
3. Crear componentes específicos si son necesarios

### Nuevo Componente de UI
1. Crear en `/components/ui/NuevoComponente.jsx`
2. Añadir PropTypes
3. Exportar en `/components/ui/index.js`
4. Documentar props en JSDoc

### Nuevo Hook
1. Crear en `/hooks/useNuevoHook.js`
2. Exportar en `/hooks/index.js`
3. Añadir JSDoc con ejemplo de uso

---

*Referencia: [Bulletproof React](https://github.com/alan2207/bulletproof-react)*
