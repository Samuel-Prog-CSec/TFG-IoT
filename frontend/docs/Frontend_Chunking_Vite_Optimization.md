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

- `icons`: **41 KB raw / 11 KB brotli** (lucide v1.x tree-shakea correctamente). *(Corregido en la revisión de mantenimiento 2026-06-12: la nota previa de «por encima de 500 kB» quedó obsoleta — el chunk servido es despreciable.)*

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

---

## 11. Iteración E — T-907 pre-release v1.0.0 (2026-05-17)

Tras Iteración D el bundle estaba en buena forma estructural (chunks granulares por librería) pero seguía cargando Sentry, Recharts y `qrcode.react` antes del primer paint útil. Iteración E consolida cinco optimizaciones de bajo riesgo + alto retorno orientadas al primer arranque tras login.

### 11.1 Cambios aplicados

**A. Visualizer condicional (`rollup-plugin-visualizer`)**

```js
// vite.config.js
shouldAnalyze &&
  visualizer({
    filename: 'dist/stats.html',
    gzipSize: true,
    brotliSize: true,
    open: false,
    template: 'treemap'
  })
```

Activación: `BUILD_ANALYZE=true npm run build`. Genera `dist/stats.html` con treemap por chunk. Comparación visual entre commits.

**B. Compresión pre-built (`vite-plugin-compression2`)**

```js
isProd &&
  compression({ algorithm: 'brotliCompress', threshold: 1024, deleteOriginalAssets: false }),
isProd &&
  compression({ algorithm: 'gzip', threshold: 1024, deleteOriginalAssets: false })
```

Genera `<asset>.br` y `<asset>.gz` junto al original. Cloudflare Pages / CDN sirven la variante adecuada por `Accept-Encoding` sin coste runtime → ~20-30% menos peso transferido sin tocar el origen.

**C. `sourcemap: 'hidden'` en producción**

```js
build: {
  sourcemap: isProd ? 'hidden' : true,
  ...
}
```

`sentryVitePlugin` sigue subiendo los maps a Sentry; el navegador no los descarga porque no quedan enlazados en los bundles. Ahorra ~15-25% del peso transferido y evita exponer código fuente original.

**D. Sentry init no bloqueante (`main.jsx`)**

Antes:
```js
import { initSentry } from './lib/sentry'
initSentry()
```

Ahora:
```js
const initSentryDeferred = () => {
  import('./lib/sentry').then((m) => m.initSentry()).catch(() => {});
};
if ('requestIdleCallback' in window) {
  window.requestIdleCallback(initSentryDeferred, { timeout: 2000 });
} else {
  setTimeout(initSentryDeferred, 200);
}
```

El SDK Sentry queda en un chunk independiente (`sentry` definido en `manualChunks`) que se descarga **después** del primer paint. Errores en los primeros ~200 ms son raros (módulos ya validados) y `window.onerror` nativo los recoge igual antes de que Sentry se anexe.

**E. Charts del Dashboard via `lazy()` con `Suspense + SkeletonChart`**

`Dashboard.jsx` ahora:
```js
const StudentProgressChart = lazy(() => import('../components/dashboard/StudentProgressChart'));
const ClassroomOverview = lazy(() => import('../components/dashboard/ClassroomOverview'));
const DifficultyHeatmap = lazy(() => import('../components/dashboard/DifficultyHeatmap'));
const ActivityHeatmap = lazy(() => import('../components/analytics/ActivityHeatmap'));
```

Cada uno se envuelve en `<Suspense fallback={<SkeletonChart height={...} />}>`. KPIs hero y AlertsPanel aparecen antes de que el chunk `charts` (Recharts) termine de descargarse. El usuario percibe el Dashboard útil en menos tiempo.

**F. `qrcode.react` lazy en `MfaSetup.jsx`**

```js
const QRCodeSVG = lazy(() =>
  import('qrcode.react').then((mod) => ({ default: mod.QRCodeSVG }))
);
```

Solo se descarga cuando el wizard llega al paso `Step.QR`. El chunk `qrcode` (~12 KB gzipped) queda separado del bundle de la página.

**G. `<link rel="preload" as="style">` para Google Fonts (`index.html`)**

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter+Tight...">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight..." rel="stylesheet">
```

El navegador descubre y descarga la hoja CSS antes del CSSOM tree → reduce FOUT/FOIT manteniendo `display=swap`.

**H. Nuevos chunks en `manualChunks`**

```js
if (id.includes('@sentry/')) return 'sentry';
if (id.includes('qrcode.react') || id.includes('/qrcode/')) return 'qrcode';
```

Separación explícita para que el split lazy de Sentry y qrcode sea limpio en lugar de ir al chunk `vendor` generic.

**I. Memo en componentes hot del gameplay**

`CharacterMascot.jsx` (re-renderiza con cada scan RFID por prop drilling desde `GameSession.jsx`) ahora se exporta como `memo(CharacterMascot)`. Las props (`mood`, `message`, `mechanicType`) son primitivas o estables, así que el shallow compare por defecto detecta cuándo no hay cambio real.

`TimerBar` y `CurrentPlayMetrics` ya estaban memoizados desde sprints anteriores; documentado por completitud.

### 11.2 Lo que NO se aplicó (y por qué)

- **LazyMotion de Framer Motion** — *Actualizado (revisión de mantenimiento 2026-06-12): YA APLICADO.* En T-907 se difirió (requería migrar ~100 `motion.X`→`m.X`), pero **la migración se completó después** (T-907 INT2 / QA 2026-05-30): `App.jsx` envuelve con `<LazyMotion features={domMax}>` y los componentes importan `m as motion`. Se usa **`domMax` (no `domAnimation`)** a propósito: las shared-element/layout transitions del proyecto no están incluidas en `domAnimation`. ⚠️ **No bajar a `domAnimation`** — rompería esas animaciones (regresión visual). Chunk `motion` servido actualmente: **~40 KB brotli**.
- **Lazy wrappers individuales por chart Recharts**: la arquitectura actual ya separa Recharts en chunk `charts` via `manualChunks` y todas las páginas que lo consumen (Analytics, etc.) son lazy en `App.jsx`. Crear wrappers individuales por chart añadiría un `Suspense fallback` adicional por componente sin reducir el bundle (Recharts ya se descarga 1 vez y se reutiliza). Cambio descartado por relación coste/beneficio.
- **Sustituir Recharts por librería más ligera**: cambio masivo, riesgo alto de regresión visual en 11 charts distintos. Fuera de scope.

### 11.3 Verificación

```bash
npm --prefix frontend run build
BUILD_ANALYZE=true npm --prefix frontend run build  # abre dist/stats.html para revisar
```

Tras la build, comprobar:
- `dist/assets/*.br` y `dist/assets/*.gz` se generan.
- `dist/assets/index-*.js.map` existe pero el bundle `.js` no contiene `sourceMappingURL` (sourcemap hidden).
- `dist/stats.html` muestra chunks `react-core`, `motion`, `icons`, `dnd`, `charts`, `socket`, `http`, `sentry`, `qrcode`, `ui-utils` separados.

### 11.4 Compatibilidad

- 396 tests frontend (`npm run test`) siguen verdes tras los cambios.
- Lint frontend (`npm run lint`): 0 errores.
- Sin cambios en componentes o animaciones — solo carga diferida.
- Compatible con Cloudflare Pages (sirve `.br`/`.gz` automáticamente por `Accept-Encoding`).

---

## 12. Iteración F — pase de "jank" de transiciones + entrega (2026-07-10)

Ver **ADR-235** para el diagnóstico completo (traza Chrome DevTools sobre el build de producción del VPS, con throttling de CPU 4× para el peor caso 1366×768). Resumen: el jank de cambio de pantalla es **coste de render en el navegador**, no de recursos del VPS (que estaba ocioso: load ~0,2 sobre 6 vCPU). Se atacaron los sospechosos medidos con cambios de bajo riesgo.

> ⚠️ **Corrección de una asunción de §11.1-B/§11.4.** Aquella nota daba por hecho que **Cloudflare Pages** servía las variantes `.br`/`.gz` pre-generadas "automáticamente por `Accept-Encoding`". Tras la migración a VPS autoalojada (ADR-233) **eso dejó de ser cierto**: ya no hay CDN por delante y el Nginx del contenedor (`frontend/nginx.conf`) solo tenía `gzip on` (recompresión al vuelo, nivel 6), **ignorando** los `.br`/`.gz` que Vite genera. La variante F.1 corrige exactamente ese hueco.

### 12.1 Entrega — `gzip_static on` en el Nginx del contenedor

`frontend/nginx.conf` añade `gzip_static on;` para servir el `.gz` pre-generado por `vite-plugin-compression2` (mejor ratio que el nivel 6 al vuelo y **cero CPU** en runtime; si falta el `.gz`, cae al `gzip on` de siempre). El módulo `ngx_http_gzip_static_module` está compilado en la imagen oficial (verificado en el contenedor real: `nginx -V` → `--with-http_gzip_static_module`; y hay 86 `.gz` en `dist/assets`). **Brotli (`.br`) queda pendiente**: `nginx:alpine` no trae `ngx_brotli`; servir el `.br` (mejor ratio aún) requeriría una imagen con ese módulo compilado.

### 12.2 Entrega — HTTP/2 en el Nginx del host (VPS)

El sitio se servía por **HTTP/1.1** (`nextHopProtocol` confirmado en la sonda; Certbot dejó `listen 443 ssl;` sin `http2`). Con muchos chunks en la carga inicial, la falta de multiplexado serializa descargas. Se pasa a `listen 443 ssl http2;` en los server blocks del host (nginx 1.24, módulo `--with-http_v2_module` ya presente). Es config **fuera del repo** (vive en la VPS), aplicada por el operador — ver `documentation/Deploy_VPS.md`.

### 12.3 Prefetch en idle de los chunks con gráficos

`charts` (Recharts) pesa **420 KB / 118 KB gzip** y no se precargaba (`index.html` solo emite `modulepreload` de los chunks de entrada, sin `prefetch` de rutas), así que la primera navegación a Dashboard/Análisis pagaba descarga+parseo en frío durante la animación de entrada. `AppContent` (`src/App.jsx`) calienta ahora `Dashboard` (arrastra `charts`) e `Insights` en `requestIdleCallback` tras el primer paint (con `setTimeout` de respaldo). No compite con el render inicial y, con `cache-control immutable`, se paga una vez. Nota: esto ataca el coste de **carga** del chunk; el coste de **montaje** de Recharts (SVG + `ResponsiveContainer` remidiendo al montar) es un problema aparte y **mayor**, pendiente de un rework de diseño (ADR-235, "qué NO se toca").

### 12.4 Movimiento — menos trabajo siempre-activo en el shell

- **Parallax de la aurora retirado** (`AppLayout.jsx`): `useScroll()` remedía la geometría del viewport tras cada mutación del DOM → forced reflow `measureScroll` de **134 ms** por transición (el mayor de la traza), para un desplazamiento de orbes ≤90px imperceptible. Orbes ahora estáticos (conservan color de atmósfera, `blur`, `mix-blend`).
- **Anillos "radar" del widget RFID gateados con `reduced-motion`** (`RFIDModeHandler.jsx`): eran dos `motion.span` con `repeat: Infinity` montados globalmente sin gate, un bucle rAF permanente. Ahora solo con animaciones activas.

### 12.5 Verificación

- **698/698 tests Vitest** (`npm --prefix frontend test`), **lint 0/0**, build de producción correcto.
- El reflow `measureScroll` se elimina **por construcción** (el hook `useScroll` ya no existe).
- Módulo `gzip_static` y flag `--with-http_v2_module` verificados por SSH sobre contenedor y host.
- Re-traza empírica sobre staging tras el próximo deploy: pendiente.
