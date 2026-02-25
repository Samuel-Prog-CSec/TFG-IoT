# Hardening de variantes estáticas en frontend

## 1. Contexto y alcance de T-068

T-068 aborda un riesgo técnico recurrente en proyectos con Tailwind: la pérdida de estilos en build de producción cuando las clases se generan mediante interpolación dinámica en runtime.

El alcance de este hardening se centra en estados visuales críticos de operación docente:

- Componentes de estado RFID (`RFIDModeHandler`).
- Variantes de interacción relevantes en flujos de edición/carga (`ContextDetailPage`).
- Contenedores de alerta con semántica por tipo (`AlertsPanel`).
- Refuerzo documental del contrato de implementación y verificación en guía UI/UX.

No forma parte de este cambio rediseñar componentes ni alterar semántica funcional de los flujos.

---

## 2. Decisiones técnicas adoptadas

1. **Sustitución de interpolación dinámica por mapas estáticos de variantes.**
   - Se eliminó la construcción de clases por segmentos dinámicos (`bg-${...}`/`text-${...}`).
   - Se introdujeron claves semánticas con strings Tailwind completas y literales.

2. **Composición de clases con `cn(...)` sobre claves de estado.**
   - Las decisiones visuales dependen de estado (`active`, `inactive`, `withFile`, `empty`, `idle`, `gameplay`, etc.) y no de concatenación de tokens.

3. **Fallback explícito para tipos no contemplados en alertas.**
   - `AlertsPanel` ahora usa variante `default` para robustez frente a tipos no mapeados.

4. **Formalización documental del contrato de variantes estáticas.**
   - Se añadió una sección específica en la guía UI/UX con política, riesgos, matriz mínima y evidencia de QA.

---

## 3. Alternativas descartadas y por qué

### A) Mantener interpolación y ampliar safelist de Tailwind

**Descartada** porque:
- Introduce deuda de mantenimiento al depender de listas manuales.
- Es más fácil omitir combinaciones futuras al evolucionar componentes.
- Reduce trazabilidad semántica respecto a mapas de variantes explícitos.

### B) Migrar todo el frontend a una abstracción global de variantes en esta tarea

**Descartada** porque:
- Amplía innecesariamente el alcance de T-068.
- Incrementa riesgo de regresión transversal en Sprint 4.
- El objetivo inmediato es hardening puntual de componentes críticos, no refactor masivo.

### C) Resolver con clases CSS personalizadas fuera de Tailwind

**Descartada** porque:
- Rompe consistencia con el sistema visual actual basado en utilidades Tailwind.
- Introduce una capa adicional de estilos difícil de auditar en estados críticos.

---

## 4. Impacto esperado

- Menor probabilidad de regresiones visuales entre entorno de desarrollo y build productiva.
- Mayor consistencia visual en estados críticos (dificultad/alertas/modo RFID).
- Mejor mantenibilidad al declarar explícitamente las variantes admitidas.
- Mayor auditabilidad en PR gracias a matriz mínima de validación y evidencia requerida.

---

## 5. Riesgos residuales

- Pueden existir interpolaciones dinámicas fuera del alcance actual de T-068 en otros módulos no tocados.
- Un nuevo estado funcional no añadido al mapa estático puede caer en variante `default` sin semántica específica.
- La validación visual manual sigue siendo necesaria para cubrir contrastes/percepción UX en rutas reales.

Mitigación propuesta:
- Revisiones incrementales por dominio (wizard, gameplay, dashboard) en tareas posteriores.
- Checklist de PR que fuerce evidencia visual de estados críticos.
