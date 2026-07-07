# 🎨 UI/UX Guidelines

## Contexto del Usuario

### Perfil de Usuario Principal
- **Profesores:** Usuarios principales que interactúan con el dashboard y configuración
- **Niños (4-8 años):** Interactúan con la pantalla de juego mediante tarjetas RFID

### Implicaciones de Diseño
| Usuario | Necesidad | Solución |
|---------|-----------|----------|
| Profesores | Eficiencia y datos claros | Dashboard con métricas, tablas, filtros |
| Niños | Diversión, claridad y feedback inmediato | Colores vivos, animaciones controladas y copy breve |

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

### Fondo de ventana: lo pinta el layout, no las páginas (ADR-205)

Invariante de fondo a sangre completa para evitar el "escalón de color" (el fondo
se corta a la altura del contenido y por debajo asoma otro tono):

- **El layout es el único que pinta el fondo de ventana.** `AppLayout` lo garantiza
  en su raíz (`flex min-h-screen bg-background-base`, que crece con el contenido) +
  la aurora `fixed inset-0`. `GameLayout` usa `game-bg` sobre `h-[100dvh]`.
- **Las páginas embebidas en un layout son transparentes:** no declaran su propio
  `bg-*` de página ni usan `min-h-full` para rellenar. Bajo `AppLayout` el scroll vive
  en el `body` (PROP-100) y el `<Outlet>` se envuelve en un `motion.div` de altura
  automática → un `min-height: 100%` (`min-h-full`) **no resuelve** y colapsa a la
  altura del contenido, dejando ver el fondo del layout por debajo.
- **Si una pantalla necesita atmósfera propia** (lienzo distinto, inmersión), se modela
  como ruta *standalone* con su propio layout y unidades de **viewport**
  (`min-h-screen` / `h-[100dvh]`), nunca con `min-height` porcentual bajo scroll de `body`
  (así lo hacen Login, Registro, Privacidad y `GameSession`).

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

### Sliders y rangos: el relleno SIEMPRE sigue al thumb (ADR-210)

Cuando un `<input type="range">` pinta un relleno custom (gradiente inline), el porcentaje del relleno debe ser **exactamente** la fracción que el navegador usa para posicionar el thumb: `(value - min) / (max - min) · 100`. Usar otra fórmula (p. ej. `|value| / max`) hace que el relleno y el punto se muevan desacoplados.

- Para un rango con semántica negativa (penalización), trabajar en **magnitud** (`min=0`, `value = |negativo|`) y guardar el negativo en `onChange`. Así "más a la derecha = más relleno" es intuitivo y el relleno coincide con el thumb. Helper: `getRangeFillPercent(value, min, max)` en `components/session/sessionHelpers.js`.
- Si no se necesita relleno custom, el `accent-color` nativo ya rellena hasta el thumb correctamente (no reinventar).

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

### Principios para Niños (4-8 años)

1. **Texto mínimo y directo** → Frases cortas con verbo de acción
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

### Métricas de la partida: cada dato distinto y con etiqueta veraz (ADR-210)

La cabecera lleva puntuación (marcador) y progreso (Ronda/Parejas). La barra inferior (`CurrentPlayMetrics`) **no repite** esos datos: muestra tres métricas de rendimiento por mecánica (aciertos / fallos / racha o intentos) y **la etiqueta describe siempre su valor exacto**. Regla: nunca etiquetar un contador con algo que no es (el caso original era "Ronda" mostrando los aciertos en Secuencia). El cambio de puntuación se anima en el marcador en ambos sentidos: `+N` verde hacia arriba al sumar, `−N` rojo hacia abajo al penalizar.

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

### Estrategia Desktop-First

La aplicación se diseña para escritorio porque el hardware del TFG (lector
RFID ESP8266) se conecta por cable USB al equipo del profesor. Tablet es
un secundario aceptable (clase sin torre) y mobile es degradación de emergencia,
no un destino objetivo. La prioridad de breakpoints es:

1. **Desktop (`lg`+, 1024px en adelante) — objetivo principal.** Diseño,
   densidad y flujos se validan aquí. Es donde corre una sesión real.
2. **Tablet (`md`, 768–1023px) — adaptación útil.** Grid de 2 columnas,
   sidebar mantenible. El sensor RFID puede no estar disponible; el
   `FallbackTouchPanel` cubre la gameplay sin hardware.
3. **Mobile (`<md`, <768px) — funcional pero no prioritario.** Evitamos
   romper la app, pero no optimizamos estética ni densidad para esta
   franja. Sidebar pasa a overlay con `motion.aside` + backdrop.

```jsx
// Patron real: arrancamos con la densidad de desktop y degradamos hacia
// breakpoints menores solo donde aporta (p.ej. pasar de 4 cols a 2 en
// tablet y a 1 en mobile). No es "mobile-first" porque no rediseñamos
// la experiencia para mobile — solo la mantenemos navegable.
<div className="
  grid grid-cols-1         /* Mobile: 1 columna (fallback) */
  md:grid-cols-2           /* Tablet: 2 columnas */
  lg:grid-cols-3 xl:grid-cols-4   /* Desktop: densidad prevista */
  gap-4 lg:gap-6
">
```

### Consideraciones Específicas
- **Dashboard:** densidad pensada para desktop; sidebar sticky. En tablet
  se apila a 2 columnas; en mobile pasa a 1 columna sin intentar mantener
  la disposición visual del desktop.
- **GameSession:** fullscreen sin navegación durante la partida en
  cualquier viewport.
- **BoardSetup:** drag & drop desktop como patrón nativo; `FallbackTouchPanel`
  cubre el escenario tablet/mobile sin sensor.

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
| Copy breve en juego | Público objetivo infantil (4-8) con distintos niveles de lectura |
| Mascota animada | Conexión emocional, guía visual |
| Feedback instantáneo | Refuerzo positivo del aprendizaje |
| Estrellas como puntuación | Universalmente entendido por niños |

---

## Accesibilidad Gameplay (T-069)

### Contrato de anuncios dinámicos

- El temporizador **no** anuncia cada tick.
- Los anuncios SR del tiempo se limitan a umbrales críticos: `10`, `5`, `3`, `2`, `1`, `0`.
- Estados de runtime (`connecting`, `connected`, `reconnecting`, `disconnected`) se anuncian con región `status` en modo `polite`.
- Los errores realtime se anuncian una sola vez por evento para evitar ruido.

### Controles interactivos

- Toggles de gameplay (`sonido`, `pausa/reanudar`) deben usar `button` nativo con `aria-pressed`.
- Todos los controles críticos deben funcionar con `Enter` y `Space` sin handlers personalizados extra.
- Focus visible obligatorio en toda interacción.

### Diálogo de pausa

- Overlay de pausa tratado como diálogo accesible (`role="dialog"`, `aria-modal="true"`).
- Al abrir pausa: foco inicial en botón principal de continuar.
- Al cerrar pausa: retorno de foco al trigger original.
- `Escape` debe reanudar/cerrar pausa de forma consistente.

### Motion y confort visual

- En reduced-motion, desactivar loops infinitos, confeti y shake agresivo.
- Mantener feedback visual claro sin depender de animaciones complejas.
- Priorizar transición corta y estable frente a efectos continuos.

### Checklist QA manual (T-069)

- [ ] Navegación completa de gameplay solo con teclado.
- [ ] Temporizador anuncia solo umbrales críticos.
- [ ] Toggles de sonido/pausa exponen estado ARIA correcto.
- [ ] Al pausar, el foco cae en “Continuar” y vuelve al botón origen al reanudar.
- [ ] Estados realtime y errores se anuncian sin duplicados en lector.
- [ ] Con reduced-motion activo no hay efectos intensos ni loops infinitos en runtime.

---

## Contrato Motion (T-060)

### Regla principal
- **Por defecto:** animaciones y microinteracciones activas.
- **Reduced motion:** solo cuando existe preferencia explícita del usuario:
  - Preferencia del sistema (`prefers-reduced-motion`), o
  - Preferencia guardada en app.

### Nota de producto (pendiente de decisión)
- **Estado actual implementado:** si no hay preferencia guardada en app, se respeta `prefers-reduced-motion` del sistema operativo.
- **Alternativa futura a valorar:** modo estricto **opt-in** (reduced motion solo por preferencia explícita en app, ignorando la preferencia del sistema).
- **Estado de esta decisión:** documentada para evaluación futura; **no aplicada** en la implementación actual.

### Implementación
- Hook compartido: `useReducedMotion`.
- Integrado en vistas críticas: `CreateSession`, `DeckCreationWizard`, `CardDecksPage`, `GameSession` y cabecera de `Dashboard`.
- Efectos costosos (confetti, loops infinitos, stagger agresivo) se degradan de forma progresiva cuando reduced motion está activo.

### QA visual/performance
- [x] Animaciones activas en flujo normal (sin reduced motion).
- [x] Con reduced motion activo, se desactivan efectos complejos sin romper navegación/feedback.
- [x] No hay saltos de layout ni pantallas en blanco al navegar entre rutas.
- [x] No hay listeners duplicados tras reconexión/pause-resume en pantalla de juego.
- [x] Las acciones principales siguen respondiendo con feedback visual claro.

Estado de validación (25-02-2026):
- `npm run lint` ejecutado en frontend (sin errores).
- `npm run build` ejecutado en frontend (build de producción en verde).
- `npm run preview -- --host 127.0.0.1 --port 4173` ejecutado (preview operativo).

---

## Contrato de Variantes Estáticas (T-068)

### Objetivo

Establecer una regla de implementación para que los estados visuales críticos del frontend usen **clases Tailwind detectables en análisis estático**. El objetivo no es cambiar la estética, sino garantizar que en builds de producción no desaparezcan estilos por no haber sido detectados durante el escaneo de clases. Este contrato aplica especialmente a flujos de creación de sesión y señalización de modo RFID, donde una regresión visual afecta directamente a la ejecución docente en aula.

### Riesgo técnico: purga y clases no detectadas en build

Tailwind genera CSS en función de clases encontradas en el código fuente. Cuando se construyen clases mediante interpolación dinámica (por ejemplo combinando segmentos de color o variantes en runtime), el analizador puede no reconocer todas las combinaciones posibles y omitirlas del bundle final.

Consecuencias típicas:
- Estados visuales que funcionan en desarrollo pero fallan en producción.
- Inconsistencias entre rutas o modos al reutilizar componentes.
- Pérdida de semántica visual (dificultad, modo activo, alerta) en contextos críticos de uso.

### Política de implementación

1. **Mapa estático o CVA para variantes:** los componentes críticos deben declarar variantes en objetos constantes o en utilidades equivalentes (ej. CVA), con strings completas y literales.
2. **Prohibición de interpolación dinámica en clases críticas:** no se permite concatenar segmentos de clase Tailwind en runtime para color, borde, fondo o tipografía de estados semánticos.
3. **Composición vía `cn(...)`:** la selección de estado se hace con claves semánticas (`active`, `inactive`, `withFile`, `gameplay`, etc.) y no con construcción dinámica de tokens.
4. **Fallback explícito:** cuando aplique, usar variante `default` para estados desconocidos y evitar render inconsistente.

### Matriz mínima de estados críticos

La verificación mínima de T-068 debe cubrir, como base, los siguientes estados:

| Área | Estado | Clase esperada | Resultado visual esperado |
|------|--------|----------------|---------------------------|
| CreateSession (selector dificultad) | dificultad activa | variante activa estática definida en mapa | Contraste alto, estado seleccionado inequívoco |
| CreateSession (selector dificultad) | dificultad inactiva | variante inactiva estática definida en mapa | Estado no seleccionado visible y consistente |
| RFIDModeHandler en rutas activas (`/game/session/:id`, vistas con control RFID) | `idle` | `bg-slate-500/20 text-slate-400` | Indicador neutro de espera |
| RFIDModeHandler en rutas activas (`/game/session/:id`, vistas con control RFID) | `gameplay` | `bg-emerald-500/20 text-emerald-400` | Indicador de ejecución de juego |
| RFIDModeHandler en rutas activas (`/game/session/:id`, vistas con control RFID) | `card_registration` | `bg-blue-500/20 text-blue-400` | Indicador de alta de tarjetas |
| RFIDModeHandler en rutas activas (`/game/session/:id`, vistas con control RFID) | `card_assignment` | `bg-purple-500/20 text-purple-400` | Indicador de vinculación tarjeta-estudiante |

> Nota: esta matriz es mínima; cualquier componente con semántica de estado equivalente debe adoptar el mismo contrato de variantes estáticas.

### Protocolo de verificación

1. **Lint:** ejecutar validación estática para detectar inconsistencias de implementación.
2. **Build de producción:** generar bundle y comprobar ausencia de regresiones de estilos en componentes críticos.
3. **Preview manual:** levantar entorno de preview local y recorrer estados de la matriz mínima.
4. **QA manual dirigido:** validar en navegación real (no aislada) que los estados conservan color, contraste y jerarquía visual.

Checklist operativo sugerido para PR:
- Ejecutar `npm run lint` en frontend.
- Ejecutar `npm run build` en frontend.
- Adjuntar capturas de estados críticos en CreateSession y RFIDModeHandler.

### Criterio de aceptación y evidencia a adjuntar en PR

Para considerar T-068 cerrada en frontend:

- No existen interpolaciones dinámicas de clases Tailwind en componentes críticos definidos por la tarea.
- Los estados críticos mantienen apariencia esperada tras build de producción.
- La documentación de contrato y verificación está actualizada y enlazada en la PR.

Evidencia mínima requerida en la PR:
- Salida de `lint` y `build`.
- Capturas o clip corto mostrando estados activos/inactivos de dificultad en CreateSession.
- Capturas o clip mostrando los 4 modos de RFID (`idle`, `gameplay`, `card_registration`, `card_assignment`) en rutas activas.
- Riesgo residual declarado (si existe) y plan de seguimiento.

---

*Inspiración: [Refactoring UI](https://www.refactoringui.com/), [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)*

---

## Accesibilidad actualizada 2026-04-21 (WCAG 2.2 AA)

Tras el audit senior del 2026-04-21 (ADR-069), los siguientes patrones son baseline obligatorio para todo nuevo componente. Cualquier PR que los ignore debe justificar explícitamente por qué.

### Mensajes de error en formularios

Los errores de validación inline deben:
- Usar `role="alert"` en el elemento del mensaje (ya aplicado en `InputPremium`).
- Asociarse al input con `aria-describedby={\`${id}-error\`}` y marcar el input con `aria-invalid={true}`.
- Respetar `prefers-reduced-motion`: la animación shake (WAAPI) no se dispara si el usuario tiene reduced-motion activado, pero el color rojo del borde se mantiene.

### Focus-on-first-invalid

Los formularios con validación inline de múltiples campos deben usar `useFormFocusFirstError(errors)`:

```jsx
import { useFormFocusFirstError } from '../hooks/useFormFocusFirstError';

const formRef = useFormFocusFirstError(validationErrors);
return <form ref={formRef} onSubmit={handleSubmit}>…</form>;
```

El hook observa el objeto `errors`; cuando cambia con errores nuevos, localiza el primer elemento con `aria-invalid="true"` y le transfiere el foco. No interfiere con wizards multi-paso (usa su propio stepper).

### Celdas y elementos interactivos en charts

Cualquier chart o heatmap con tooltip debe ser accesible por teclado:
- Convertir las celdas en `<button type="button">`.
- Añadir `onFocus` + `onBlur` que repliquen los handlers de `onMouseEnter` / `onMouseLeave`.
- `aria-label` descriptivo (ej. "Lunes a las 10:00 horas, 3 partidas").
- Focus-visible ring claro (`ring-brand-base` con offset del background).

Ejemplo: `components/analytics/ActivityHeatmap.jsx`.

### Alertas y estados críticos (colorblind-safe)

Nunca usar color rojo (`text-error-base` / `bg-error-base`) como único indicador de error o severidad crítica. Siempre acompañar con:
- Un icono Lucide (`AlertOctagon`, `AlertTriangle`, `XCircle`) o un patrón (líneas diagonales).
- Texto descriptivo (no solo el número).

Ver `AlertsHub.jsx` → `SeverityCounter` y `SEVERITY_STYLES`.

### Target size (WCAG 2.5.8 + Apple HIG)

Cualquier botón o target táctil usado por niños 4-6 años (gameplay, fallback) debe tener mínimo **56px de altura/ancho**. Para UI de profesor, WCAG 2.2 AA exige 24×24px, recomendado 44×44.

### Empty states contextualizados

Todo empty state debe usar `EmptyState` con prop `illustration` y prop `variant`:

```jsx
<EmptyState
  illustration={<EmptySessionsIllustration size={180} />}
  variant={hasActiveFilters ? 'filtered' : 'first-use'}
  title="Aún no tienes sesiones"
  description="Diseña tu primera sesión..."
  action={<ButtonPremium>Crear sesión</ButtonPremium>}
/>
```

Variantes:
- `default`: icono/ilustración + título + descripción + CTA.
- `filtered`: añade chip "Sin resultados para tu búsqueda" y redirige CTA a "Limpiar filtros".
- `first-use`: habilita `secondaryAction` (ej. "Ver guía") bajo el CTA principal.

Crear una ilustración nueva en `components/ui/illustrations/` si una página tiene empty state propio sin componente reutilizable aún. Seguir el patrón: SVG inline, tokens CSS (`var(--color-brand-base)`), bobbing sutil 3-4s que respeta `useReducedMotion`.

### Variantes de ConfirmationModal

Usar siempre el `variant` correcto:
- `danger`: destructivo (borrar definitivo).
- `warning`: acciones reversibles con consecuencias (desactivar algo temporalmente).
- `archive`: archivar/desarchivar (no pérdida).
- `info`: confirmaciones neutras.
- `success`: acciones positivas (confirmar publicar, confirmar guardar).

Cada variante tiene border, tint top gradient, glow del icono y animación del icono diferenciados (ver `ConfirmationModal.jsx:VARIANT_COLORS` y `getIconAnimation`).

### `prefers-reduced-motion`

Toda nueva animación (Framer Motion, CSS keyframes, `requestAnimationFrame`) debe comprobar `useReducedMotion` y desactivarse o reducir drasticamente cuando el usuario lo tiene activado. Ejemplo canónico: `components/effects/Confetti.jsx`.

### Tooltip sobre iconos

Si el trigger del `Tooltip` es un icono sin texto accesible, el componente promueve automáticamente el `content` (si es string) como `aria-label` del wrapper. Si el trigger es un botón con su propio `aria-label`, el tooltip actúa como `aria-describedby` adicional.

---

## Motion signature: Tactile RFID + Paper (ADR-070)

La app adopta un leitmotiv dual para diferenciarse de dashboards SaaS genericos.
Toda nueva signature motion debe pertenecer a una de estas dos familias.

### Scanline (Tactile RFID)

**Donde si**: tarjetas de listado interactivas secundarias (SessionCard, ContextCard
y cualquier futura). Refuerza la metafora de "escaneo RFID" en hover.

**Donde no**:
- DeckCard — tiene su propio signature (`gradient-shift` en el borde).
- Botones pequenos, inputs, badges, filas muy densas.
- Elementos sin tamano suficiente para percibir el barrido (≥160px de alto).

**Implementacion**: usar el primitivo `<ScanlineOverlay>` con visibilidad
controlada via CSS `group-hover` (ver `01-PATRONES-DISENO.md` §14).

### Blip radial (Tactile RFID)

**Donde si**: `ConfirmationModal` variantes `danger` y `warning` al abrir. **Un
unico pulso**, no infinite. Refuerza "estas tocando algo importante" en acciones
irreversibles.

**Donde no**:
- Como feedback positivo general (confeti o toast son mas apropiados).
- En acciones reversibles triviales (cancelar, cerrar).
- Como decoracion continua.

### Flip 3D (Paper)

**Donde si**: entrada del `ConfirmationModal` variante `danger`. `rotateX: -8deg → 0`
+ scale sutil + `transformPerspective: 1000` — transmite "estas manejando un
papel fisico, piensalo bien".

**Donde no**:
- Variantes no-danger del ConfirmationModal (usar spring estandar).
- Tarjetas de listado (el tilt 3D de DeckCard ya cubre esa metafora en listados).

### Paridad obligatoria entre tarjetas de lista

`DeckCard` define el baseline de calidad visual para tarjetas de listado
(tilt 3D, stack effect, parallax de assets, gradient-shift border). Todas las
demas tarjetas (`SessionCard`, `ContextCard`, `AlertCard`, futuras) deben
compartir al menos:

- Lift sutil en hover (`y: -4, scale: 1.01`) via `HoverLiftCard` o equivalente.
- Glow contextual tintado en hover (via `glowTint` prop de `HoverLiftCard`).
- Focus-visible claro (ring o border).
- Signature propia (scanline minimo, mascota/ilustracion para empty states).
- Entry settle (`motionConfig.springGame`) y exit "paper flying" (rotate sutil)
  si estan en un grid dinamico.

### Entradas/salidas en grids

Envolver `.map()` de tarjetas con `<AnimatePresence>` (sin `mode="popLayout"` ni
`layout` prop por incompatibilidad con tests) y variants con hidden/visible/exit.
Ver patron en `01-PATRONES-DISENO.md` §14.

---

## T-953 — ChartsTheme + Mascota expresiva (2026-05-09)

Documentado en ADRs 117 y 118.

### ChartsTheme — sistema unificado para Recharts

Ubicación: `frontend/src/components/analytics/ChartsTheme.jsx`. Exports:

- `<ChartsThemeDefs />` — componente que dropa `<defs>` global (gradients por mecánica + por semántica + área brand vertical + 3 patterns colorblind-safe + pattern para celdas "sin datos"). Se monta DENTRO del `<ResponsiveContainer>` de cada chart.
- `chartColors.byMechanic.{memory,association,sequence}.{stroke,fill,gradientId}` — paletas por mecánica.
- `chartColors.bySemantic.{brand,success,warning,error,info,muted}` — paletas semánticas.
- `chartTokens.{gridStroke,axisTickFill,axisTickFontSize,tooltipBg,tooltipBorder,legendFill,emptyPatternId}` — tokens compartidos.
- `<ThemedTooltipCard>` — wrapper canónico de tooltip (`bg-background-elevated/95 border border-border-default rounded-lg shadow-xl backdrop-blur`).
- `commonAxisProps` y `commonGridProps` — props pre-spread para `<XAxis>`/`<YAxis>`/`<CartesianGrid>`.
- `getChartPalette(key)` — helper que resuelve `'memory'|'association'|'sequence'|'brand'|...` a una paleta.

**Reglas para añadir colores**: solo tokens `var(--color-*)` del `index.css`. Nada hex hardcoded. Si un chart necesita un color one-off, debe pasar por `chartColors` como entrada nueva, no inline.

**Charts migrados**: `TrajectoryChart`, `EngagementRadar`, `SequenceProgressChart`, `PerformanceByDimension`. Charts CSS-based o con su propio sistema (`ContentEffectivenessMatrix`, `ActivityHeatmap`, `AlertsHub`, `LearningCurvesSection`) NO se migraron.

**Charts nuevos pequeños**: `StudentProgressSparkline` (~80px alto, sin ejes ni tooltip, solo tendencia) y `DifficultyBar` (CSS puro, RAG color + `bg-stripe-diagonal` colorblind-safe en valores `<50%`).

### Mascota expresiva

Ver `Gameplay_Feedback_Design.md` § "T-953" para detalle. Resumen rápido:

- 9 moods (3 nuevos: `pointing`, `worried`, `surprised`).
- Accesorios mecánica-aware en `thinking` (BookGlasses/LinkPendant/RhythmHeadphones).
- `mascotDialog.js` con eventos nuevos: `streakBroken`, `worriedRebound`, `greeting`.
- GameOver con mascota tier-aware en bottom-left (escala 1.4x, `aria-hidden`).
- FeedbackOverlay per-mecánica con iconos Lucide (no emojis Unicode).
- Sound effects nuevos en `soundEffectsService.js` (Web Audio nativo).
- **Fix crítico**: `mechanicTypeRef.current` dentro de `useGameFeedback.processValidationResult` para que los listeners de socket no capturen el valor stale.

### Empty states con mascota

`<EmptyState>` ahora acepta prop `mascot?: ReactNode` (mutuamente exclusiva con `illustration`/`icon`). La mascota se renderiza en el bloque hero centrado con altura reservada para que la burbuja no se recorte.

### Onboarding modal con mascota guía

`OnboardingOverlay.ModalStep` incrusta `<CharacterMascot>` en bottom-left con mood derivado del paso:
- Step 1 → `idle` con `isFirstAppearance: true` y "¡Hola!".
- Último step → `celebrating` + "¡Vamos!".
- Resto modales → `pointing` con fragmento del título.
- Steps tipo `'spotlight'` NO añaden mascota — el tooltip apuntador ya cumple.

---

## Sistema responsive (2026-05-09, ADR-119)

### Resoluciones objetivo
- **Mínimo soportado**: 1366×768 (peor caso de portátiles del tribunal del TFG).
- **Óptimo**: 1920×1080 (FHD, escenario habitual de despliegue en aulas).
- **Escalado fluido** hasta 4K (3840×2160).
- **Fuera de alcance**: mobile <640px (sensor RFID por USB hace inviable la mecánica).

### Tokens fluidos (en `index.css` `@theme`)
La tipografía y los spacings principales escalan con `clamp()`. Tokens disponibles:

```css
/* Tipografía fluida — usar como var(--text-fluid-*) */
--text-fluid-xs:   clamp(0.75rem,  0.7rem  + 0.25vw, 0.875rem);
--text-fluid-sm:   clamp(0.875rem, 0.82rem + 0.3vw,  1rem);
--text-fluid-base: clamp(1rem,     0.94rem + 0.3vw,  1.125rem);
--text-fluid-lg:   clamp(1.125rem, 1.04rem + 0.4vw,  1.375rem);
--text-fluid-xl:   clamp(1.375rem, 1.2rem  + 0.7vw,  1.875rem);
--text-fluid-2xl:  clamp(1.625rem, 1.35rem + 1.2vw,  2.5rem);
--text-fluid-3xl:  clamp(1.875rem, 1.45rem + 1.8vw,  3.5rem);
--text-fluid-hero: clamp(2.25rem,  1.5rem  + 3vw,    5rem);

/* Spacing fluido — para padding de página y gaps de grids principales */
--space-fluid-section: clamp(1rem,    0.5rem + 2vw,   2rem);
--space-fluid-gutter:  clamp(0.75rem, 0.4rem + 1.5vw, 1.5rem);

/* Gameplay — alturas de chrome con pendiente aditiva */
--game-hud-height:  clamp(56px, 4vh + 24px, 80px);
--game-mascot-size: clamp(72px, 6vw + 32px, 128px);

/* Sidebar — anchos por modo */
--sidebar-w-expanded: 18rem; /* 288px */
--sidebar-w-rail:     4.5rem; /* 72px */
```

**Uso**: `className="text-[var(--text-fluid-2xl)]"` o `className="gap-[var(--space-fluid-gutter)]"`.

**Convivencia con clases discretas**: las clases `text-Nxl`/`gap-N` de Tailwind siguen funcionando y NO necesitan migrarse. Solo se usa fluid en sitios que escalan agresivamente (heroes, scores, page titles, gaps de grids principales).

### Breakpoints
Defaults de Tailwind v4 (no se sobreescriben — Tailwind v4 NO permite override vía `@theme` de `--breakpoint-*` en runtime):

- `sm: 640px`
- `md: 768px`
- `lg: 1024px`
- `xl: 1280px`
- `2xl: 1536px`

### Escalera estándar de grids
- **KPIs/cards principales**: `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4`.
- **Layouts de detalle (sidebar+main)**: `grid-cols-1 lg:grid-cols-2 xl:grid-cols-3`.
- **Stats/chips densos**: `grid-cols-2 md:grid-cols-4`.
- **Galerías de assets**: `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6` con `aspect-square`.

Anti-patrón: NO usar `grid-cols-1 lg:grid-cols-N` (salto sin paso intermedio en md). Insertar siempre `md:` o `sm:`.

### Sidebar (3 estados)
Hook `useSidebarMode` coordina:
- `<lg` (≤1023px): drawer animado con hamburguesa.
- `lg` a `<xl-grande` (1024-1439px): rail 72px con tooltips. Caso del tribunal con 1366×768.
- `≥1440px`: expandida 288px.

**Toggle**: tecla `[` global o botón `PanelLeftClose`/`PanelLeft` en sidebar header. Cicla `auto → compact → expanded`. Persistencia en `localStorage` (`sidebar:mode`).

**NavItem `compact` mode**: solo icono 24px, label/description en tooltip nativo, indicador activo lateral (barra vertical 3px).

### GameLayout fullscreen
Las rutas `/game/*` montan `<GameLayout>` (no `<AppLayout>`). Ocupa `100dvh × 100vw`, sin sidebar ni topbar. Salida con botón "X" (top-right) o tecla `Escape`. Si hay partida activa (`globalThis.__gameActive=true`), pide confirmación antes de salir.

`GameSession` señaliza `__gameActive` en `useEffect`:
```javascript
useEffect(() => {
  globalThis.__gameActive = true;
  return () => { globalThis.__gameActive = false; };
}, []);
```

### Container estándar de página
Utility `page-container` para el wrapper raíz de cada página:
```css
@utility page-container {
  @apply mx-auto w-full px-[var(--space-fluid-section)];
  max-width: min(1600px, calc(100vw - 2 * var(--space-fluid-section)));
}
```

Aplicado en: Dashboard, Sessions, Decks, Students, Insights, Contexts, StudentManagement (admin), StudentProfile, StudentsAnalytics. Páginas con `max-w-5xl`/`max-w-6xl` (wizards de creación, detalle de mazo) conservan su ancho específico.

### Anti-overflow defensivo en cards
Cards con texto que puede crecer (nombres, descripciones):
- `min-w-0` al hijo `flex` que contiene texto largo (clave para que `truncate` funcione dentro de flex).
- `truncate` o `line-clamp-N` con atributo `title` para tooltip nativo.
- Iconos/badges del header con `flex-shrink-0`.

Aplicado en: `DeckCard`, `ContextsPage` cards, `SessionsPage` cards (ya cumplía).

### Charts Recharts
- Heights: `h-[clamp(220px,30vh,360px)]` (no `h-[300px]` fijo).
- Radar: `aspect-square w-full max-h-[360px] min-h-[220px]`.
- Tooltip: `<Tooltip wrapperStyle={{ maxWidth: '90vw' }}/>` para evitar desbordes.
- `ChartSection` con `min-h-0` en el wrapper del chart (permite contraer dentro de flex).
- `ActivityHeatmap`: wrapper con `overflow-x-auto custom-scrollbar`, `min-w-[320px]`.

### Modales
`ConfirmationModal` usa `max-w-[min(560px,92vw)] max-h-[88dvh] overflow-y-auto custom-scrollbar` para ser fluido y permitir scroll interno cuando el contenido excede el viewport.

`GameOverScreen` usa `max-w-[min(720px,92vw)] max-h-[92dvh]` con tipografía `text-fluid-3xl` (score) y `text-fluid-2xl` (título). Botones del footer con `flex-wrap`.


## Lecciones del polish final pre-entrega (ADR-230, 2026-07-05)

Reglas de implementación que evitan los defectos cazados en la última auditoría visual:

- **Decoraciones distribuidas: `left/top` CSS, nunca `x`/`y` en %.** Los transforms porcentuales de Framer Motion son relativos al PROPIO elemento, no al contenedor: 12 partículas con `x: 'N%'` acaban apiladas en (0,0). Posicionar con `style={{ left: 'N%' }}` y animar el desplazamiento en px/vh.
- **`truncate` necesita su cadena de constraints.** Sobre un contenedor flex recorta EN SECO sin elipsis. El patrón correcto: contenedor `flex min-w-0 flex-1` + texto en un hijo propio con `truncate`; el bloque fijo del otro lado lleva `shrink-0`.
- **Overlays anclados a elementos con scroll interno.** Antes de medir un target con `getBoundingClientRect` (spotlights, tooltips anclados), comprobar si está recortado por un ancestro con `overflow` y hacer `scrollIntoView({ block: 'nearest' })` instantáneo; y clampar SIEMPRE el popup resultante al viewport (el lado "bottom" también).
- **Offsets de la mascota en % de su propia altura.** El rig es fluido; cualquier offset en px produce fracciones visibles distintas por resolución. `AuthMascotPeek` ancla con `bottom-full` y usa `PEEK_Y/DUCK_Y/HIDDEN_Y` porcentuales.
- **Widgets flotantes: mínima intrusión.** El pill RFID vive en `bottom-4 right-4` con opacidad 75% en reposo (100% en hover/focus-within) para no tapar acciones de la última fila de cards en 1366×768.
- **Footers de wizard sticky.** `sticky bottom-4 z-30` en los footers de CreateSession/DeckCreationWizard: el CTA no puede quedar bajo el fold en 720-768px de alto.
- **Ids de `<mask>`/defs SVG únicos por instancia (`useId`)**: un icono repetido en la página con ids duplicados hace que todos los usos compartan la primera máscara definida.
- **Marca**: `EduPlayIcon` es una tarjeta RFID sólida en `currentColor` con chip perforado por máscara — no reintroducir rellenos translúcidos (<40%) en el mark: sobre el degradado morado se apagan.
