# Sprint 4 - Avance de Documentación

## T-023: Staging Environment 📋

**Prioridad:** P3 | **Tamaño:** S | **Dependencias:** T-033

**Descripción:**  
Documentación para despliegue en entorno de staging pre-producción.

**Sub-tareas:**

1. **Documento `docs/Deployment_Staging.md`:**
   - Requisitos de infraestructura
   - Variables de entorno
   - Proceso de despliegue
   - Checklist pre-deploy

2. **Script de deploy:**
   - Automatizar con shell script o CI

3. **Monitorización:**
   - Health checks
   - Logs centralizados

**Criterios de Aceptación:**

- [ ] Documentación completa
- [ ] Proceso replicable
- [ ] Staging desplegable siguiendo docs

---

## T-007: GDPR Anonimización (Duda #31) 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** Ninguna  
**Origen:** Duda #31 de Diciembre (Derecho al olvido)

**Descripción:**  
Endpoint para anonimizar datos de alumnos cumpliendo con GDPR. Los datos personales se eliminan pero las métricas se mantienen para estadísticas agregadas.

**Sub-tareas:**

1. **Crear endpoint `DELETE /api/users/:id/anonymize`:**
   - Solo para rol `teacher` propietario o `super_admin`
   - No eliminar, sino anonimizar

2. **Proceso de anonimización:**
   - `name` → `"Alumno Anónimo #XXXX"` (últimos 6 chars del ID)
   - `profile` → `{}`
   - `email` → `null`
   - `status` → `'anonymized'`
   - **Mantener:** `studentMetrics`, `createdAt`

3. **Validaciones:**
   - No permitir anonimizar profesores
   - No permitir anonimizar usuarios ya anónimos

4. **Log de auditoría:**
   - Registrar quién anonimizó y cuándo
   - Motivo opcional

5. **Tests:**
   - Anonimización exitosa
   - Métricas preservadas
   - Rechazo de roles no autorizados

**Criterios de Aceptación:**

- [ ] Datos personales eliminados/reemplazados
- [ ] Métricas preservadas para estadísticas
- [ ] Log de auditoría generado
- [ ] No se puede revertir la anonimización

---

### T-050: Mockup Interactivo de Pantalla de Partida 📋

**Prioridad:** P2 | **Tamaño:** M | **Dependencias:** Ninguna  
**Origen:** Preparación para Sprint 4 - Gameplay funcional

**Descripción:**  
Crear un mockup visual e interactivo de la pantalla de juego (GamePlay) que muestre el diseño, animaciones, colores y flujo de interacción **sin conexión al backend**. El objetivo es validar la experiencia de usuario antes de implementar la lógica real en el Sprint 4.

El mockup debe simular:
- Presentación del desafío (qué debe responder el alumno)
- Feedback visual de acierto/error
- Progreso de la partida (rondas, puntuación)
- Animaciones de transición entre estados
- Temporizador visual

**Público objetivo:** Niños de 4-6 años, por lo que el diseño debe ser:
- Colorido y atractivo
- Con formas grandes y redondeadas
- Feedback inmediato y claro (sonidos + visuales)
- Sin texto complejo (usar iconos/emojis)

**Sub-tareas:**

1. **Crear página `GamePlayMockup.jsx`:**
   - Ruta temporal `/game-mockup` (solo desarrollo)
   - Estado local simulado (no Redux/Context)
   - Botones para simular eventos RFID

2. **Componente `ChallengeDisplay.jsx`:**
   - Área central grande para mostrar el desafío
   - Soportar: imagen, emoji, texto grande, audio (icono de speaker)
   - Animación de entrada (scale + fade)
   - Diseño adaptado a niños (bordes redondeados, sombras suaves)

3. **Componente `ScoreBoard.jsx`:**
   - Puntuación actual con animación de incremento
   - Indicador de ronda actual (ej: ⭐⭐⭐○○ para 3/5)
   - Animación de "combo" si aciertos consecutivos
   - Posición fija en esquina superior

4. **Componente `TimerBar.jsx`:**
   - Barra de progreso que se vacía con el tiempo
   - Cambio de color según urgencia (verde → amarillo → rojo)
   - Animación de "shake" cuando queda poco tiempo
   - Sonido de tick-tock en últimos 5 segundos (opcional)

5. **Componente `FeedbackOverlay.jsx`:**
   - **Acierto:** confetti, checkmark verde grande, sonido de éxito
   - **Error:** shake de pantalla, X roja, sonido de error suave
   - **Timeout:** reloj con X, mensaje "¡Tiempo!"
   - Animación de 1.5-2 segundos antes de siguiente ronda

6. **Componente `RFIDWaitingIndicator.jsx`:**
   - Animación pulsante indicando "Esperando tarjeta..."
   - Icono de tarjeta RFID animado
   - Mensaje amigable: "¡Pasa tu tarjeta!" con emoji

7. **Componente `GameOverScreen.jsx`:**
   - Pantalla final con puntuación total
   - Estrellas según rendimiento (1-3 estrellas)
   - Animación de celebración (confetti, emojis flotantes)
   - Botón "Volver a jugar" (simulado)
   - Mensaje personalizado según resultado

8. **Implementar flujo simulado completo:**
   - Estado: `waiting` → `challenge_shown` → `waiting_scan` → `feedback` → `next_round` / `game_over`
   - Botones de debug para simular: scan correcto, scan incorrecto, timeout
   - Datos mock de 5 rondas con diferentes desafíos

9. **Sistema de sonidos:**
   - Crear hooks `useSound.js` para gestionar audio
   - Sonidos: inicio, correcto, incorrecto, timeout, fin
   - Usar Web Audio API o librería howler.js
   - Botón de mute visible

10. **Animaciones con Framer Motion o CSS:**
    - Transiciones suaves entre estados
    - Microinteracciones (hover, press)
    - Animación de números al cambiar puntuación
    - Particles/confetti para celebraciones

11. **Paleta de colores para gameplay:**
    - Fondo: gradiente suave (no cansar vista)
    - Acierto: verde brillante (#4CAF50)
    - Error: rojo suave (#FF6B6B, no agresivo)
    - Primario: morado del branding (#667eea)
    - Elementos: bordes redondeados (20px+), sombras suaves

12. **Responsive y accesibilidad:**
    - Funciona en tablet (landscape preferido)
    - Botones grandes (mínimo 60x60px)
    - Contraste adecuado para visibilidad
    - Reducir movimiento si `prefers-reduced-motion`

**Criterios de Aceptación:**

- [ ] Mockup accesible en ruta `/game-mockup`
- [ ] Flujo completo de 5 rondas simulable sin backend
- [ ] Animaciones de acierto/error claramente diferenciadas
- [ ] Temporizador visual con cambio de color
- [ ] Pantalla de fin de juego con estrellas y celebración
- [ ] Sonidos implementados con opción de mute
- [ ] Diseño atractivo para niños de 4-6 años
- [ ] Botones de debug para simular eventos
- [ ] Funciona correctamente en tablet (1024x768)
- [ ] No hay conexión al backend (100% mock)

**Notas de Diseño:**
- Inspiración: apps educativas como Khan Academy Kids, Duolingo
- Evitar elementos que distraigan del desafío principal
- Feedback positivo incluso en errores (animar a seguir jugando)
- Considerar modo "alto contraste" para accesibilidad

**Entregables:**
- Componentes visuales listos para integrar con gameEngine
- Documentación de props esperadas por cada componente
- Guía de estados y transiciones del flujo de juego

---

### T-034: Swagger API Docs 📋

**Prioridad:** P2 | **Tamaño:** L | **Dependencias:** T-032

**Descripción:**  
Documentación OpenAPI 3.0 interactiva con Swagger UI para facilitar el desarrollo y testing de la API.

**Sub-tareas:**

1. **Instalar dependencias:**
   - `swagger-jsdoc`: generar spec desde comentarios
   - `swagger-ui-express`: servir UI interactiva

2. **Configurar swagger-jsdoc:**
   - Definir info del API (título, versión, descripción)
   - Definir servers (desarrollo, producción)
   - Configurar seguridad (Bearer token)

3. **Documentar endpoints con comentarios JSDoc:**
   - Cada ruta con `@openapi` annotations
   - Request body schemas
   - Response schemas con ejemplos
   - Posibles errores

4. **Montar Swagger UI:**
   - Ruta `/api-docs` para UI interactiva
   - Ruta `/api-docs/json` para spec raw

5. **Proteger en producción (opcional):**
   - Basic auth para acceder a docs

**Criterios de Aceptación:**

- [ ] Swagger UI accesible en `/api-docs`
- [ ] Todos los endpoints documentados
- [ ] Schemas de request/response definidos
- [ ] Ejemplos incluidos
- [ ] Se puede probar endpoints desde UI

---

### T-039: Sentry Setup Completo 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** Ninguna

**Descripción:**  
Completar integración de Sentry con Error Boundary en Frontend y tracing distribuido.

**Sub-tareas:**

1. **Frontend - Error Boundary:**
   - Usar `Sentry.ErrorBoundary` como wrapper
   - Fallback UI amigable
   - Captura automática de errores React

2. **Frontend - Tracing:**
   - `BrowserTracing` para rendimiento
   - Tracking de navegación

3. **Source maps en producción:**
   - Subir source maps a Sentry
   - Configurar en build de Vite

4. **Alertas configuradas:**
   - Email en errores críticos
   - Slack/Discord (opcional)

**Criterios de Aceptación:**

- [ ] Errores frontend capturados en Sentry
- [ ] Tracing de transacciones visible
- [ ] Stack traces con source maps
- [ ] Alertas funcionando

---

### T-037: Replicar Sesión 📋

**Prioridad:** P2 | **Tamaño:** S | **Dependencias:** T-021

**Descripción:**  
Permitir clonar una sesión existente para reutilizar su configuración.

**Sub-tareas:**

1. **Backend - Endpoint `POST /api/sessions/:id/clone`:**
   - Copiar: mechanicId, contextId, config, cardMappings
   - Resetear: status='created', startedAt=null, endedAt=null
   - Nuevo createdAt

2. **Frontend - Botón "Volver a jugar":**
   - Visible en sesiones completadas
   - Abre modal de confirmación
   - Opcional: permitir editar antes de crear

3. **Tests:**
   - Clonar sesión exitosamente
   - Verificar que es independiente de la original

**Criterios de Aceptación:**

- [ ] Sesión clonada con un click
- [ ] Configuración copiada correctamente
- [ ] Nueva sesión es independiente
- [ ] Estado inicial 'created'

---

## T-051: Migrar refreshToken a httpOnly Cookie 🔒

**Prioridad:** P1 (Seguridad) | **Tamaño:** M | **Dependencias:** Ninguna  
**Origen:** Auditoría de seguridad Sprint 3

**Descripción:**  
Actualmente el `refreshToken` se almacena en `localStorage`, lo que lo expone a ataques XSS. Debe migrarse a cookies `httpOnly` para mejorar la seguridad de la autenticación.

**Contexto de Seguridad:**
- `localStorage` es accesible desde JavaScript → vulnerable a XSS
- Cookies `httpOnly` no son accesibles desde JS del cliente
- Añadir `SameSite=Strict` para protección contra CSRF

**Sub-tareas:**

1. **Backend - Modificar `/api/auth/login`:**
   - En vez de devolver `refreshToken` en body JSON, enviarlo como cookie `httpOnly`
   - Configuración de cookie:
     ```javascript
     res.cookie('refreshToken', token, {
       httpOnly: true,
       secure: process.env.NODE_ENV === 'production',
       sameSite: 'strict',
       maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
       path: '/api/auth'
     });
     ```
   - Body solo retorna `{ accessToken, expiresIn, user }`

2. **Backend - Modificar `/api/auth/refresh`:**
   - Leer `refreshToken` desde `req.cookies` en vez de `req.body`
   - Renovar la cookie con nuevo token

3. **Backend - Modificar `/api/auth/logout`:**
   - Limpiar cookie con `res.clearCookie('refreshToken')`

4. **Backend - Middleware de cookies:**
   - Asegurar que `cookie-parser` está instalado y configurado
   - Añadir a la cadena de middlewares

5. **Frontend - `services/api.js`:**
   - Eliminar `localStorage.setItem('refreshToken', ...)`
   - Eliminar `localStorage.getItem('refreshToken')`
   - Eliminar `localStorage.removeItem('refreshToken')`
   - `authAPI.refreshToken()` ya no envía body, solo hace POST vacío
   - Axios con `withCredentials: true` ya maneja cookies automáticamente

6. **Frontend - `context/AuthContext.jsx`:**
   - Eliminar referencias a `refreshToken` en memoria
   - `hasSession()` debe verificar de otra forma (ej: intentar refresh)
   - Considerar nuevo endpoint `/api/auth/check` para verificar sesión

7. **Tests:**
   - Login establece cookie httpOnly
   - Refresh funciona leyendo cookie
   - Logout limpia cookie
   - Cookie no accesible desde JS
   - CORS configurado para credenciales

8. **Documentación:**
   - Actualizar API_v0.3.0.md con nuevos headers/cookies
   - Documentar cambios para desarrolladores

**Consideraciones de Migración:**
- Usuarios con sesión activa deberán re-loguearse
- Desplegar backend primero, luego frontend
- Mantener compatibilidad temporal si es necesario

**Criterios de Aceptación:**

- [ ] `refreshToken` NO aparece en `localStorage`
- [ ] `refreshToken` se envía como cookie `httpOnly`
- [ ] Cookie tiene flags `secure` (prod), `sameSite=strict`
- [ ] Frontend funciona sin cambios visibles para usuario
- [ ] Logout limpia correctamente la cookie
- [ ] Tests de seguridad pasan
- [ ] Documentación actualizada

**Notas de Seguridad:**
- Esta es una mejora de seguridad importante
- Considerar también implementar CSRF tokens si se usan más endpoints POST
- Monitorear logs de Sentry por errores de autenticación post-migración

---
## T-052: Soporte prefers-reduced-motion 📋

**Prioridad:** P3 | **Tamaño:** S | **Dependencias:** T-035 (CardDecks)  
**Origen:** Consideraciones de accesibilidad durante implementación de UI premium

**Descripción:**  
Implementar soporte para la media query `prefers-reduced-motion` en todos los componentes con animaciones. Usuarios con esta preferencia activada en su sistema operativo deben ver una versión simplificada sin animaciones.

**Contexto:**
Los componentes UI premium creados en T-035 (CardDecks) incluyen animaciones elaboradas que pueden causar problemas a usuarios con:
- Vestibular disorders
- Sensibilidad a movimiento
- Epilepsia fotosensible
- Preferencia personal por interfaces estáticas

**Sub-tareas:**

1. **Crear hook `useReducedMotion.js`:**
   ```javascript
   export function useReducedMotion() {
     const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
     
     useEffect(() => {
       const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
       setPrefersReducedMotion(mediaQuery.matches);
       
       const handler = (e) => setPrefersReducedMotion(e.matches);
       mediaQuery.addEventListener('change', handler);
       return () => mediaQuery.removeEventListener('change', handler);
     }, []);
     
     return prefersReducedMotion;
   }
   ```

2. **Aplicar en componentes con animaciones:**
   - `WizardStepper.jsx` - Deshabilitar confetti, simplificar transitions
   - `DeckCard.jsx` - Deshabilitar 3D tilt, solo hover opacity
   - `RFIDScannerPanel.jsx` - Deshabilitar radar waves
   - `AssetSelector.jsx` - Sin stagger, entrada inmediata
   - Todos los modales - Sin scale animation

3. **Variantes de Framer Motion:**
   ```javascript
   const variants = prefersReducedMotion 
     ? { hidden: { opacity: 0 }, visible: { opacity: 1 } }
     : { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };
   ```

4. **CSS fallback:**
   ```css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```

5. **Tests:**
   - Simular media query en tests
   - Verificar que componentes respetan la preferencia
   - Verificar que UX sigue siendo funcional sin animaciones

**Criterios de Aceptación:**

- [ ] Hook `useReducedMotion` creado y exportado
- [ ] Todos los componentes UI premium respetan la preferencia
- [ ] Confetti y particle effects deshabilitados
- [ ] Transiciones reducidas a opacity simple
- [ ] Tests cubren ambos modos
- [ ] Documentación actualizada

**Recursos:**
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [web.dev: prefers-reduced-motion](https://web.dev/prefers-reduced-motion/)
- [Framer Motion: Reduced Motion](https://www.framer.com/motion/guide-accessibility/)

---