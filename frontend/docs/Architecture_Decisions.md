# Registro de Decisiones de Arquitectura (ADR) - Frontend

## ADR-001: Selección de Librería de Visualización (Recharts)

### Contexto

El dashboard requiere múltiples tipos de gráficos (áreas, mapas de calor, barras) para visualizar datos complejos de rendimiento. Necesitamos una librería que sea:

1.  **React-Nativa**: Para evitar wrappers y problemas de ciclo de vida.
2.  **Flexible**: Personalizable para adaptarse al sistema de diseño (Temas oscuros, gradientes).
3.  **Ligera**: Para no impactar negativamente en el tiempo de carga (LCP).

### Decisión

Se ha seleccionado **Recharts** sobre alternativas como Chart.js o Victory.

### Justificación

- **Composición**: Recharts usa un modelo de composición de componentes (`<AreaChart>`, `<XAxis>`, `<Tooltip>`) que encaja perfectamente con la filosofía de React, haciendo el código más legible y mantenible.
- **SVG**: Renderiza SVG, lo que garantiza nitidez en cualquier resolución (crucial para pantallas de retina en tablets) y facilita la animación con CSS/Framer Motion.
- **Payload**: Es Modular, permitiendo tree-shaking efectivo (solo importamos lo que usamos).

### Consecuencias

- **Curva de aprendizaje**: Requiere entender el modelo de composición en lugar de pasar un gran objeto de configuración.
- **Rendimiento**: Excelente para datasets medianos (<1000 puntos), que es nuestro caso de uso (clases de ~30 alumnos). Para Big Data habría que considerar Canvas, pero no aplica aquí.

---

## ADR-002: Patrón de Diseño de Dashboard (Jerarquía "F")

### Contexto

El dashboard es una herramienta de trabajo diaria para el profesor. La carga cognitiva debe ser mínima; el profesor debe poder entender el estado de la clase en segundos.

### Decisión

Se implementa un layout siguiendo el **Patrón de Lectura en F** y principios de Jerarquía Visual.

### Detalles de Implementación

1.  **Nivel Superior (Encabezado)**: Filtros globales (Contexto temporal). Afectan a toda la página.
2.  **Nivel 1 (Izquierda Superior)**: KPIs Críticos (Estudiantes en Riesgo). Es el primer punto donde se posa la vista. Usamos colores semánticos (Rojo = Alerta).
3.  **Nivel 2 (Centro)**: Gráfico de Tendencia. Proporciona contexto histórico inmediato.
4.  **Nivel 3 (Inferior/Derecha)**: Detalles y listas. Información para análisis profundo, accesible tras el escaneo inicial.

### Consecuencias

- **Usabilidad**: Reduce el tiempo de análisis del profesor.
- **Escalabilidad**: El layout permite añadir más "filas" de análisis verticalmente sin romper la jerarquía.

---

## ADR-003: Estrategia de Fetching de Datos (On-Mount + Polling Sincronizado)

### Contexto

Los datos de analíticas cambian cuando los alumnos terminan partidas. No es un sistema de trading (ms), pero tampoco puede ser estático.

### Decisión

Se opta por **Fetch en Paralelo al Montar** (`Promise.all`) para la carga inicial.

### Justificación

- **UX**: Evita el "efecto cascada" donde los gráficos van apareciendo uno a uno. El dashboard carga sus esqueletos y luego muestra todo el contenido de golpe (o con transiciones coordinadas).
- **Separación de Responsabilidades**:
  - `analyticsService.js`: Abstrae la lógica de llamadas HTTP.
  - `Dashboard.jsx`: Gestiona el estado y la presentación.
- **Simplicidad**: En esta fase, no se usan WebSockets para analíticas (solo para juego en tiempo real). La complejidad de mantener sockets para un dashboard que se consulta periódicamente no compensa el beneficio.

### Futuras Mejoras

- Implementar `SWR` o `TanStack Query` para revalidación automática en foco y caché inteligente, reduciendo llamadas innecesarias.

---

## ADR-004: Sistema de Alertas Basado en Reglas (Frontend)

### Contexto

El backend devuelve datos crudos o agregados, pero la "interpretación" pedagógica (¿es esto bueno o malo?) a veces depende del contexto del frontend o preferencias del usuario (futuro).

### Decisión

Se implementa un motor de reglas ligero en el cliente (`Dashboard.jsx` -> `alerts` logic) que consume los KPIs del backend.

### Justificación

- **Inmediatez**: Permite generar feedback visual instantáneo sin ida y vuelta al servidor para cada validación de UI.
- **Flexibilidad**: Podemos cambiar los umbrales de "Riesgo" (ej. subir de nota 50 a 60) en el frontend rápidamente según feedback de usabilidad, sin redeploy de backend.

### Consecuencias

- Lógica de negocio en cliente: Debe mantenerse sincronizada con cualquier lógica crítica de backend (ej. si el backend envía emails de alerta, debe usar los mismos criterios). Para visualización, es aceptable.
