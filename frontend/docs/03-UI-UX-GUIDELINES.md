# 🎨 UI/UX Guidelines

## Contexto del Usuario

### Perfil de Usuario Principal
- **Profesores:** Usuarios principales que interactúan con el dashboard y configuración
- **Niños (4-6 años):** Solo interactúan con la pantalla de juego mediante tarjetas RFID

### Implicaciones de Diseño
| Usuario | Necesidad | Solución |
|---------|-----------|----------|
| Profesores | Eficiencia y datos claros | Dashboard con métricas, tablas, filtros |
| Niños | Diversión y simplicidad | Colores vivos, animaciones, sin texto |

---

## Paleta de Colores

### Sistema de Colores
```css
/* Primarios - Gradiente marca */
--brand-primary: #8b5cf6;    /* Violeta */
--brand-secondary: #06b6d4;  /* Cyan */
--gradient-brand: linear-gradient(135deg, #8b5cf6, #06b6d4);

/* Semánticos */
--success: #22c55e;   /* Verde - Respuesta correcta */
--error: #ef4444;     /* Rojo - Respuesta incorrecta */
--warning: #f59e0b;   /* Ámbar - Tiempo acabándose */

/* Neutros */
--bg-primary: #0f172a;    /* Fondo principal */
--bg-secondary: #1e293b;  /* Cards y superficies */
--text-primary: #ffffff;
--text-secondary: #94a3b8;
```

### ¿Por qué estos colores?
- **Violeta/Cyan:** Moderno, tecnológico, divertido para niños
- **Fondo oscuro:** Reduce fatiga visual, contraste con contenido colorido
- **Verde/Rojo semánticos:** Universalmente reconocidos para éxito/error

---

## Tipografía

```css
/* Display - Títulos y números grandes */
font-family: 'Space Grotesk', sans-serif;

/* Body - Texto general */
font-family: 'Inter', sans-serif;
```

### Escala Tipográfica
| Uso | Tamaño | Peso |
|-----|--------|------|
| H1 (Títulos página) | 2.25rem (36px) | 700 |
| H2 (Secciones) | 1.5rem (24px) | 700 |
| H3 (Cards) | 1.25rem (20px) | 600 |
| Body | 1rem (16px) | 400 |
| Small | 0.875rem (14px) | 400 |
| Caption | 0.75rem (12px) | 500 |

### ¿Por qué Space Grotesk + Inter?
- **Space Grotesk:** Geométrica, moderna, excelente para números
- **Inter:** Legibilidad superior en pantallas, amplio soporte de caracteres

---

## Sistema de Espaciado

Base: **4px** (Tailwind default)

```
4px  → gap-1, p-1
8px  → gap-2, p-2
12px → gap-3, p-3
16px → gap-4, p-4
24px → gap-6, p-6
32px → gap-8, p-8
```

### Reglas de Espaciado
- Padding interno de cards: `p-6` (24px)
- Gap entre cards: `gap-4` o `gap-6`
- Margen entre secciones: `space-y-8`

---

## Componentes de UI

### Cards (Glassmorphism)
```css
/* Efecto glass premium */
background: rgba(30, 41, 59, 0.4);
backdrop-filter: blur(16px);
border: 1px solid rgba(255, 255, 255, 0.05);
border-radius: 16px;
```

**¿Por qué Glassmorphism?**
- Sensación de profundidad y modernidad
- Permite fondos dinámicos/animados
- Tendencia actual que se siente premium

### Botones
| Variante | Uso | Estilo |
|----------|-----|--------|
| Primary | Acción principal | Gradiente violeta, glow |
| Secondary | Acción secundaria | Borde sutil, transparente |
| Ghost | Acciones terciarias | Sin fondo, solo hover |
| Danger | Eliminar/Cancelar | Rojo con confirmación |

### Estados Interactivos
```css
/* Todos los elementos interactivos */
transition: all 0.2s ease;

/* Hover */
transform: translateY(-2px);
box-shadow: 0 4px 12px rgba(0,0,0,0.2);

/* Active/Press */
transform: scale(0.98);
```

---

## Animaciones

### Filosofía
> "Las animaciones deben informar, no distraer"

### Librería: Framer Motion

### Tipos de Animaciones

| Tipo | Duración | Uso |
|------|----------|-----|
| Micro | 150-200ms | Hover, focus |
| Standard | 200-300ms | Transiciones de estado |
| Emphasis | 300-500ms | Feedback, celebraciones |
| Page | 400-600ms | Navegación entre páginas |

### Ejemplos Implementados

```jsx
// Entrada escalonada (stagger)
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

// Card con hover
<motion.div
  whileHover={{ y: -4, scale: 1.01 }}
  transition={{ type: 'spring', stiffness: 400 }}
/>

// Celebración de acierto
<motion.div
  animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
/>
```

### Consideraciones de Accesibilidad
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

---

## Diseño de la Pantalla de Juego

### Principios para Niños (4-6 años)

1. **Sin texto necesario** → Solo iconos y colores
2. **Feedback inmediato** → Animaciones de éxito/error
3. **Colores semánticos** → Verde = bien, Rojo = mal
4. **Elementos grandes** → Touch-friendly
5. **Mascota guía** → Personaje que reacciona

### Layout de GameSession
```
┌─────────────────────────────────────┐
│  [Score ⭐⭐⭐]      [Timer ⏰]      │
├─────────────────────────────────────┤
│                                     │
│         🎯 CHALLENGE AREA 🎯        │
│        (imagen/emoji grande)        │
│                                     │
├─────────────────────────────────────┤
│           🦊 MASCOTA 🦊             │
│         (reacciona al juego)        │
│                                     │
│      "¡Escanea la tarjeta!"        │
└─────────────────────────────────────┘
```

### Estados Visuales del Timer

| % Tiempo | Color | Comportamiento |
|----------|-------|----------------|
| 100-40% | Verde | Normal |
| 40-20% | Amarillo | Mensaje "¡Vamos!" |
| 20-0% | Rojo | Shake + "¡Rápido!" |

---

## Responsive Design

### Breakpoints (Tailwind)
```
sm: 640px   → Tablets verticales
md: 768px   → Tablets horizontales
lg: 1024px  → Laptops
xl: 1280px  → Desktops
2xl: 1536px → Pantallas grandes
```

### Estrategia Mobile-First
```jsx
// Primero móvil, luego ajustar para desktop
<div className="
  grid grid-cols-1      /* Móvil: 1 columna */
  sm:grid-cols-2        /* Tablet: 2 columnas */
  lg:grid-cols-3        /* Desktop: 3 columnas */
  gap-4 lg:gap-6
">
```

### Consideraciones Específicas
- **Dashboard:** Sidebar colapsable en móvil
- **GameSession:** Fullscreen, sin navegación visible
- **BoardSetup:** Drag & drop con alternativa táctil

---

## Accesibilidad Visual

### Contraste
- Texto normal: Ratio mínimo 4.5:1
- Texto grande: Ratio mínimo 3:1
- Validado con herramientas WCAG

### Focus Visible
```css
:focus-visible {
  outline: 2px solid #8b5cf6;
  outline-offset: 2px;
}
```

### Estados Claros
Cada estado debe ser distinguible no solo por color:
- ✅ Correcto: Verde + ✓ icono + animación positiva
- ❌ Error: Rojo + ✗ icono + shake

---

## Decisiones Clave y Razones

| Decisión | Razón |
|----------|-------|
| Fondo oscuro | Reduce fatiga, destaca contenido colorido |
| Glassmorphism | Premium feel, permite efectos de fondo |
| Framer Motion | API declarativa, mejor DX que CSS puro |
| Sin texto en juego | Público objetivo no lee (4-6 años) |
| Mascota animada | Conexión emocional, guía visual |
| Feedback instantáneo | Refuerzo positivo del aprendizaje |
| Estrellas como puntuación | Universalmente entendido por niños |

---

## Contrato Motion (T-060)

### Regla principal
- **Por defecto:** animaciones y microinteracciones activas.
- **Reduced motion:** solo cuando existe preferencia explícita del usuario:
  - Preferencia del sistema (`prefers-reduced-motion`), o
  - Preferencia guardada en app.

### Implementación
- Hook compartido: `useReducedMotion`.
- Integrado en vistas críticas: `CreateSession`, `DeckCreationWizard`, `CardDecksPage`, `GameSession` y cabecera de `Dashboard`.
- Efectos costosos (confetti, loops infinitos, stagger agresivo) se degradan de forma progresiva cuando reduced motion está activo.

### QA visual/performance
- [ ] Animaciones activas en flujo normal (sin reduced motion).
- [ ] Con reduced motion activo, se desactivan efectos complejos sin romper navegación/feedback.
- [ ] No hay saltos de layout ni pantallas en blanco al navegar entre rutas.
- [ ] No hay listeners duplicados tras reconexión/pause-resume en pantalla de juego.
- [ ] Las acciones principales siguen respondiendo con feedback visual claro.

---

*Inspiración: [Refactoring UI](https://www.refactoringui.com/), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)*
