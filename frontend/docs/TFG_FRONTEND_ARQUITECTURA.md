# Arquitectura y Diseño Frontend: Eduplay V2

Este documento detalla las decisiones arquitectónicas, tecnológicas y de diseño adoptadas durante la reescritura de la capa de presentación (Frontend) de la plataforma Eduplay. El objetivo principal de esta refactorización técnica ha sido elevar el estándar de calidad del proyecto, garantizando no solo un código mantenible y escalable, sino también una experiencia de usuario (UX) inmersiva, profesional y de alto rendimiento.

---

## 1. Patrones de Diseño y Estructura de Componentes

### 1.1. Arquitectura Basada en Variantes (CVA)

En interfaces complejas, los componentes base (botones, tarjetas, _badges_, _inputs_) tienden a acumular una cantidad inmanejable de lógicas condicionales para alternar clases de estilos. Para resolver el clásico problema del "código espagueti" en la declaración dinámica de estilos, se ha adoptado el patrón **CVA (Class Variance Authority)**.

CVA permite estructurar la API visual de cada componente base definiendo un contrato estricto de variantes (por ejemplo: `variant: "primary" | "secondary" | "danger"` o `size: "sm" | "md" | "lg"`).

```javascript
// Ejemplo conceptual de implementación CVA
const buttonVariants = cva(
  "base-classes inline-flex items-center justify-center rounded-xl transition-all...",
  {
    variants: {
      variant: {
        primary: "bg-brand-base text-white hover:bg-brand-dark",
        destructive: "bg-error-base text-white hover:bg-error-dark",
      },
      size: { default: "h-10 px-4 py-2", sm: "h-9 px-3", lg: "h-11 px-8" },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);
```

### 1.2. Fusión Consistente de Clases (`cn` Utility)

Junto a CVA, se ha implementado la utilidad `cn`. Esta función compone `clsx` (para la evaluación condicional de clases) y `tailwind-merge` (para la resolución inteligente de conflictos). Esto garantiza que si un desarrollador pasa una clase a un componente que redefine un margen predeterminado (por ejemplo, `mt-4` sobrescribiendo `mt-2`), Tailwind-merge se asegurará de purgar la clase antigua, eliminando _bugs_ visuales causados por la cascada CSS y su orden de especificidad.

---

## 2. Sistema de Diseño con Tailwind CSS v4 y Espacio de Color OKLCH

### 2.1. Tailwind v4 y Directiva `@theme`

El sistema ha migrado hacia el motor optimizado de **Tailwind CSS v4**, reemplazando las antiguas configuraciones JavaScript pesadas (`tailwind.config.js`) en favor de la configuración directa en CSS mediante la directiva `@theme`. Esto proporciona un control más semántico y aprovecha el soporte nativo de variables CSS sin intermediarios.

### 2.2. Uniformidad Perceptiva: El Salto a OKLCH

El sistema de color se ha construido íntegramente utilizando el espacio cromático **OKLCH** (_Lightness, Chroma, Hue_). A diferencia del modelo RGB/HEX tradicional o incluso el HSL, OKLCH es **conceptualmente uniforme**. Esto significa que si mantenemos la "Luminosidad" y el "Croma" constantes y variamos únicamente el "Tono" (_Hue_), todos los colores generados tendrán exactamente el mismo contraste aparente ante el ojo humano.

Esto nos ha permitido generar una jerarquía semántica robusta (Brand, Backgrounds, Textos, Status) sin sorpresas de accesibilidad:

- `--color-background-base`: Superficies de fondo profundas.
- `--color-background-elevated`: Superficies superpuestas (tarjetas modales) con legibilidad asegurada.
- `--color-text-primary` / `--color-text-muted`: Jerarquía de lectura clara.
- `--color-success-base` / `--color-error-base`: Identificadores de estado en semáforo que comparten exactamente la misma "energía" visual.

### 2.3. Glassmorphism y la Estrategia "Squint Test"

Para dotar a la plataforma de un carácter "Premium", se ha abandonado el uso abusivo de sombras pesadas continuas. En su lugar, se ha optado por implementar texturas _Glassmorphism_ mediante el difuminado del fondo (`backdrop-blur`), la saturación controlada, y el establecimiento de **bordes perimetrales casi microscópicos** (`border-white/5` a `border-white/20`).

Esta técnica, guiada por el _Squint Test_ (test de entrecerrar los ojos para evaluar jerarquías visuales), permite que los elementos parezcan flotar sobre la interfaz, generando profundidad sin "ensuciar" la vista.

---

## 3. Experiencia de Usuario, Animaciones y Carga

### 3.1. Feedback Cinético (Framer Motion)

Se ha integrado `framer-motion` para dotar a la interfaz de feedback orgánico. En lugar de transiciones lineales abruptas, el proyecto apuesta por micro-animaciones basadas en físicas de resortes (`spring` physics). Los botones y las tarjetas responden tácticamente al toque (`whileTap={{ scale: 0.98 }}`) y a la presencia del ratón, reforzando la sensación de una aplicación verdaderamente nativa.

### 3.2. Eliminación del Layout Shift (_Skeletons_ de Alta Fidelidad)

Durante las llamadas asíncronas de datos (por ejemplo, obtener las métricas de un estudiante en el componente `Dashboard.jsx`), se prioriza la retención espacial.

En lugar de renderizar _spinners_ o componentes en blanco que provocan _Cumulative Layout Shift (CLS)_ —un efecto disruptivo donde la interfaz "da saltos" cuando la información se hidrata—, se han desarrollado componentes estructurados de tipo _Skeleton_ (`SkeletonShimmer`, `SkeletonCard`). Estos componentes, encapsulados en el mismo contenedor `GlassCard`, imitan píxel a píxel la geometría del contenido final (imágenes de perfil, títulos, valores numéricos). Una sutil animación fluida indica la actividad de la red de fondo.

Esto garantiza que al momento en el que el servidor entrega el _payload_ final, la inserción del contenido es matemáticamente continua y estáticamente estable.

---

## 4. Deep Analytics y Visualización de Datos

El núcleo del impacto pedagógico del TFG reside en cómo el profesor interacciona con los datos.

- **Recharts y Configuración Nativa:** La librería gráfica ha sido completamente configurada para leer del ecosistema nativo OKLCH; los `LinearGradients`, contornos de líneas, grillas Cartesianas y Tooltips ahora derivan sus tintes y brillos de las variables CSS estándar.
- **Foco en _Actionable Insights_:** Los Paneles como `ClassroomOverview` (Histograma Global de clases) y `DifficultyHeatmap` evolucionan la métrica. Especialmente el **Mapa de Calor de Dificultad (ScatterPlot)** permite cruzar el "Contexto" analizado contra la propia "Mecánica" para identificar y resaltar los puntos ciegos exactos (alta tasa de error) donde los estudiantes requieren soporte pedagógico activo, pasando de datos pasivos a intervenciones dirigidas.

---

Este enfoque holístico no compila únicamente pantallas; orquesta un sistema de diseño resiliente que asegura escalabilidad para el equipo de desarrollo y aporta un inmenso valor prescriptivo y analítico para el profesorado.
