# CardDecks - Decisiones de UX/UI

## Visión General

El diseño de la gestión de mazos prioriza una **experiencia premium y delightful** para profesores. Los elementos clave son:

- **Animaciones fluidas** que guían la atención
- **Feedback visual inmediato** en cada interacción
- **Celebraciones** al completar tareas importantes
- **Persistencia de estado** para evitar frustraciones

---

## Paleta de Colores

### Sistema de Gradientes

```css
/* Primario - Acciones principales */
--gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Éxito - Confirmaciones */
--gradient-success: linear-gradient(135deg, #10b981 0%, #059669 100%);

/* Peligro - Acciones destructivas */
--gradient-danger: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
```

### Glass Effect (Glassmorphism)

```css
.glass-card {
  background: rgba(30, 41, 59, 0.6);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}
```

---

## Micro-interacciones

### 1. WizardStepper

| Elemento | Animación | Propósito |
|----------|-----------|-----------|
| Paso activo | Scale 1.1 + glow pulse | Indicar posición actual |
| Progreso | Líquido con gradiente | Sensación de avance fluido |
| Completado | Check con bounce | Celebrar micro-logro |
| Último paso | Confetti explosion | Celebración final |

### 2. DeckCard

| Elemento | Animación | Propósito |
|----------|-----------|-----------|
| Hover | 3D tilt (15°) + sombra | Sensación de profundidad |
| Borde | Gradiente giratorio | Destacar elemento seleccionado |
| Assets | Parallax suave | Añadir dimensión |
| Acciones | Slide-up desde abajo | Revelar opciones |

### 3. RFIDScannerPanel

| Elemento | Animación | Propósito |
|----------|-----------|-----------|
| Radar | Ondas concéntricas | Indicar "escuchando" |
| Card detected | Fly-in + confetti | Feedback positivo |
| Counter | Bounce + scale | Destacar progreso |
| Pulse ring | Expansión infinita | Mantener atención |

### 4. AssetSelector

| Elemento | Animación | Propósito |
|----------|-----------|-----------|
| Grid items | Stagger entrance | Carga progresiva |
| Selección | Scale 1.05 + ring | Confirmar selección |
| Badge asignado | Pulse glow | Indicar ocupado |
| Búsqueda | Highlight match | Guiar la vista |

---

## Estados de UI

### Loading States

```jsx
// Skeleton con shimmer animado
<SkeletonCard>
  <div className="animate-pulse bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800" />
</SkeletonCard>

// Spinner con doble anillo
<Spinner>
  <div className="border-4 border-t-indigo-500 animate-spin" />
  <div className="absolute border-4 border-t-purple-500 animate-ping" />
</Spinner>
```

### Empty States

| Escenario | Mensaje | CTA |
|-----------|---------|-----|
| Sin mazos | "Crea tu primer mazo" | Botón crear |
| Sin resultados de filtro | "No hay resultados" | Limpiar filtros |
| Error de carga | "Error al cargar datos" | Reintentar |

### Validaciones

```jsx
// Inline validation con icono y color
{!isValid && (
  <motion.div 
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="text-amber-400 flex items-center gap-2"
  >
    <AlertTriangle size={14} />
    <span>Mensaje de validación</span>
  </motion.div>
)}
```

---

## Modales y Confirmaciones

### Patrón de Modal

```jsx
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-slate-900 rounded-2xl border border-white/10"
      >
        {/* Contenido */}
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>
```

### Confirmaciones Destructivas

- **Color**: Gradiente rosa/rojo
- **Icono**: Warning o Trash
- **Texto**: Explicar consecuencias
- **Botones**: Cancelar (ghost) + Confirmar (danger)

---

## Formularios

### Inputs Premium

```jsx
<InputPremium
  label="Nombre del mazo"
  value={name}
  onChange={onChange}
  helperText="3-100 caracteres"
  error={errors.name}
  icon={<Layers size={16} />}
/>
```

**Características:**
- Focus ring con gradiente
- Label flotante animado
- Helper text con contador
- Error state con shake animation

### Sliders de Configuración

```jsx
<div className="flex items-center gap-4">
  <input
    type="range"
    min={1}
    max={15}
    className="flex-1 accent-indigo-500"
  />
  <span className="w-12 text-center bg-slate-800 rounded-lg py-1">
    {value}
  </span>
</div>
```

---

## Navegación

### Breadcrumbs

```jsx
<button className="text-slate-400 hover:text-white flex items-center gap-2">
  <ArrowLeft size={18} />
  Volver a Mis Mazos
</button>
```

### Tabs

```jsx
<div className="flex bg-slate-800/50 rounded-xl p-1">
  {tabs.map(tab => (
    <button
      className={cn(
        'px-4 py-2 rounded-lg transition-all',
        activeTab === tab.id
          ? 'bg-indigo-500 text-white'
          : 'text-slate-400 hover:text-white'
      )}
    >
      <tab.icon size={16} />
      {tab.label}
    </button>
  ))}
</div>
```

---

## Feedback al Usuario

### Toast Notifications

```jsx
// Éxito
toast.success('¡Mazo creado!', {
  description: '"Capitales" está listo para usar'
});

// Error
toast.error('Error al guardar', {
  description: 'Verifica tu conexión e intenta de nuevo'
});

// Warning
toast.warning('Límite alcanzado', {
  description: 'Máximo 50 mazos activos'
});
```

### Celebraciones (canvas-confetti)

```javascript
// Al crear mazo
confetti({
  particleCount: 150,
  spread: 80,
  origin: { y: 0.6 },
  colors: ['#8b5cf6', '#6366f1', '#a855f7', '#ec4899']
});

// Al guardar cambios
confetti({
  particleCount: 100,
  spread: 60,
  origin: { y: 0.6 },
  colors: ['#10b981', '#059669', '#34d399']
});
```

---

## Accesibilidad (a11y)

### Implementado

- ✅ Contraste de colores suficiente
- ✅ Focus visible en elementos interactivos
- ✅ Textos descriptivos en iconos
- ✅ Keyboard navigation básica

### Pendiente (T-052)

- ⏳ `prefers-reduced-motion` para deshabilitar animaciones
- ⏳ ARIA labels completos
- ⏳ Screen reader announcements
- ⏳ Skip links

---

## Responsive Design

### Breakpoints

| Breakpoint | Columnas Grid | Comportamiento |
|------------|--------------|----------------|
| < 640px (sm) | 1 | Stack vertical |
| 640-768px | 2 | Grid compacto |
| 768-1024px | 2-3 | Grid estándar |
| > 1024px (lg) | 3 | Grid expandido |

### Mobile Considerations

- Touch targets mínimo 44x44px
- Swipe gestures para navegación (futuro)
- Bottom sheet para modales en mobile (futuro)

---

## Patrones de Interacción

### Wizard

1. **Progreso lineal**: No permitir saltar pasos hacia adelante
2. **Navegación libre hacia atrás**: Revisar pasos anteriores
3. **Validación por paso**: No avanzar sin completar
4. **Persistencia de borrador**: localStorage cada 500ms
5. **Confirmación al salir**: Advertir si hay cambios sin guardar

### CRUD de Mazos

1. **Crear**: Wizard de 4 pasos
2. **Leer**: Grid con cards + modal detalle (futuro)
3. **Editar**: Página dedicada con tabs
4. **Eliminar**: Soft delete con confirmación

---

## Métricas de UX (propuestas)

| Métrica | Objetivo |
|---------|----------|
| Tiempo crear mazo | < 2 minutos |
| Clics para crear sesión | < 10 clics |
| Tasa abandono wizard | < 15% |
| Satisfacción (NPS) | > 8/10 |

---

## Referencias de Diseño

- **Animaciones**: Framer Motion
- **Colores**: Tailwind CSS palette
- **Iconos**: Lucide React
- **Celebraciones**: canvas-confetti
- **Toasts**: Sonner
