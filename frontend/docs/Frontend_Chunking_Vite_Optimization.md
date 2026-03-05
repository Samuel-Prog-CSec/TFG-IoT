# Optimización de Chunks en Frontend (Vite) - 2026-03-01

## 1. Contexto

Durante la validación final de Sprint 4, el build de frontend pasó correctamente pero mostró advertencias de tamaño de chunks (`> 500 kB`).

Objetivo del trabajo:

- Reducir riesgo de degradación de rendimiento en carga inicial.
- Mantener estabilidad funcional y visual (sin romper UX, animaciones ni contratos de runtime).
- Mejorar la estrategia de empaquetado en `vite.config.js` con cambios de bajo riesgo.

---

## 2. Problema detectado

Antes de la optimización, la estrategia de `manualChunks` agrupaba demasiadas librerías en un único chunk de UI.

Síntomas observados:

- Chunk `ui` sobredimensionado (~781 kB minificado).
- Advertencia recurrente de Vite sobre chunks grandes.
- Riesgo de afectar `First Load JS`, caché granular y tiempo de descarga en redes lentas.

Importante:

- No era un error bloqueante de compilación.
- Sí era una deuda de performance razonable a corregir.

---

## 3. Descubrimientos técnicos

1. **El warning de chunks grandes no implica bug funcional**, pero sí puede impactar experiencia percibida.
2. **Agrupar por “familias demasiado amplias”** (`ui`) concentra peso y empeora caché por cambio pequeño.
3. **Forzar chunks globales tipo `vendor-misc`** puede introducir complejidad extra e incluso dependencias circulares de chunking.
4. **`lucide-react` es uno de los pesos dominantes** en este proyecto; separarlo ayuda a aislar coste, aunque siga siendo grande.

---

## 4. Estrategia aplicada

Se aplicó estrategia **incremental y segura**:

1. Medir estado base (build + tamaños).
2. Probar división más granular por librería.
3. Detectar efectos secundarios (circular chunk / empeoramiento del `index`).
4. Ajustar hasta una versión equilibrada (sin ciclos, build estable, menor presión en bundle principal).

### Principio rector

Optimizar empaquetado **sin tocar código de interacción** ni componentes visuales:

- Sin cambios en animaciones (`framer-motion`).
- Sin cambios en lógica de juego/realtime.
- Sin cambios de diseño o estilos.

---

## 5. Estrategia final en `vite.config.js`

Se mantiene una función `manualChunks` basada en `id` de `node_modules`.

Separaciones explícitas finales:

- `react-core` → `react`, `react-dom`, `react-router-dom`
- `motion` → `framer-motion`
- `icons` → `lucide-react`
- `dnd` → `@dnd-kit/*`
- `charts` → `recharts`
- `socket` → `socket.io-client`
- `http` → `axios`
- `ui-utils` → `sonner`, `clsx`, `tailwind-merge`, `class-variance-authority`

Razón de diseño:

- Mejor caché por dominio funcional.
- Menor probabilidad de invalidar todo el vendor por cambios puntuales.
- Balance entre granularidad y estabilidad de resolución de chunks.

---

## 6. Iteraciones realizadas

### Iteración A (base)

- Config inicial: chunks amplios (`vendor`, `ui`, `charts`, `dnd`).
- Resultado: `ui` muy grande y warning persistente.

### Iteración B (división muy agresiva)

- Se intentó separar más grupos con fallback amplio.
- Resultado: apareció aviso de circularidad entre chunks (`vendor-misc` ↔ `react-core`) y no era una base limpia.

### Iteración C (dejar casi todo auto-split)

- Se retiró gran parte de segmentación manual.
- Resultado: chunk principal `index` subió demasiado (peor equilibrio general).

### Iteración D (equilibrada - adoptada)

- Segmentación explícita por librerías clave, sin fallback de “cajón desastre”.
- Resultado: build estable, sin circular chunk, distribución más saludable del peso.

---

## 7. Resultado final observado

Estado final:

- Build `frontend` en verde.
- Sin roturas funcionales detectadas.
- Sin impacto en estética ni animaciones.
- Mejor reparto de chunks respecto al estado inicial.

Riesgo residual:

- `icons` sigue por encima del umbral de 500 kB (advertencia no bloqueante).

Interpretación práctica:

- La situación es **mejor que la base** y estable para merge.
- Aún hay margen de optimización específica en iconografía.

---

## 8. Por qué estas mejoras son correctas para este sprint

1. **Bajo riesgo**: solo se modifica configuración de bundling.
2. **Alto retorno técnico**: mejora distribución de peso y caché.
3. **Compatibilidad total** con la arquitectura React/Vite actual.
4. **Sin alterar UX de gameplay** (requisito crítico de Sprint 4).

---

## 9. Próximos pasos recomendados (opcional)

Para reducir el chunk `icons` sin romper UX:

1. Auditar imports de `lucide-react` en páginas de alto peso.
2. Mover iconos raramente usados a rutas lazy.
3. Confirmar que no existan barrel imports indirectos de icon packs completos.
4. Re-medición con build y comparación de tamaños.

Nota:

- Este siguiente paso sí implica tocar código de consumo de iconos (más sensible) y conviene hacerlo en una tarea separada.

---

## 10. Referencia técnica

Configuración vigente en:

- `frontend/vite.config.js`

Comando de verificación usado:

- `npm --prefix frontend run build`
