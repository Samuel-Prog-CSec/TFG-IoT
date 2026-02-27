# Revisión de Consistencia de Assets en Cartas

**Fecha:** 2026-02-23  
**Ámbito:** Frontend + Backend + Contrato API + UX de subida  
**Contexto:** TFG IoT (RFID + Game Sessions + CardDeck + Contexts)

---

## 1. Problema observado

Se detectaron tres síntomas recurrentes:

1. Algunas vistas mostraban cartas sin su asset asignado, aun cuando la asignación existía conceptualmente.
2. El encaje visual (`fit`) del asset variaba por pantalla (recortes/agujeros/deformaciones percibidas).
3. Existía desalineación entre límites/validaciones de subida declarados en frontend y reglas efectivas backend.

Adicionalmente, se encontró una causa estructural de inconsistencia: coexistencia de dos formas de representar cartas en frontend (`cards + assignedAsset`) frente al contrato backend (`cardMappings + displayData/assignedValue`).

---

## 2. Principios de diseño usados

### 2.1 Source of Truth
Se priorizó el contrato runtime del backend y DTOs activos (`cardMappings`) por encima de convenciones históricas de UI.

### 2.2 Minimal disruption
Se evitó rediseñar rutas o introducir nuevas entidades. La solución adapta frontend al contrato canónico existente y encapsula la lógica repetida de render/mapping.

### 2.3 UX predecible
Se definió una política explícita de fallback visual y ajuste por contexto para evitar resultados "raros" con imágenes heterogéneas.

### 2.4 Seguridad y calidad
Se reforzó validación de audio con metadata real (duración), manteniendo controles existentes de tamaño, formato y magic bytes.

---

## 3. Decisiones arquitectónicas y "por qué"

## 3.1 Mantener `cardMappings` como contrato público

**Decisión:** no versionar un nuevo contrato externo en esta iteración.

**Por qué:**
- Backend ya valida y usa `cardMappings` en mazos/sesiones.
- Evita ruptura de API y complejidad de migración simultánea.
- Permite corregir la raíz del fallo con menor riesgo operativo.

**Resultado esperado:** todas las fases (mazo → sesión → juego) comparten estructura única de datos.

---

## 3.2 Introducir capa de adaptación de mapping en frontend

**Decisión:** crear helpers de mapeo en `frontend/src/lib/cardMapping.js`.

**Por qué:**
- El mismo mapeo se repetía en varias páginas con variantes semánticas.
- Centralizar reduce bugs de serialización y facilita mantenimiento.

**Resultado esperado:** payload consistente en creación/edición y carga consistente al abrir mazos existentes.

---

## 3.3 Unificar render de assets de carta

**Decisión:** crear `CardAssetPreview` para uso transversal.

**Por qué:**
- Había implementaciones ad-hoc por pantalla con resultados visuales distintos.
- Encapsular fallback/fit/error handling evita divergencias futuras.

**Resultado esperado:** comportamiento visual consistente con menor duplicación.

---

## 3.4 Política de ajuste visual híbrida

**Decisión:**
- `object-cover` en tarjetas compactas (listas, tablero memory, mini previews).
- `object-contain` en vista de challenge principal de juego.

**Por qué:**
- En celdas pequeñas, `cover` evita bandas vacías y mejora legibilidad rápida.
- En desafío principal, `contain` evita recortes que comprometan la identificación pedagógica.

**Resultado esperado:** equilibrio entre estética y comprensión del contenido.

---

## 3.5 End-to-end real en GameSession

**Decisión:** reemplazar pool mock por `cardMappings` reales de `GET /sessions/:id`.

**Por qué:**
- El mock rompía la trazabilidad funcional mazo→sesión→partida.
- La validación funcional del TFG requiere comportamiento verificable con datos reales.

**Resultado esperado:** partida refleja exactamente el contenido del mazo/sesión configurados.

---

## 3.6 Hardening de audio: validar duración real

**Decisión:** añadir validación de duración server-side con metadata real.

**Parámetros establecidos:**
- `MIN_DURATION_SECONDS = 0.3`
- `MAX_DURATION_SECONDS = 45`

**Por qué:**
- Tamaño y MIME no garantizan usabilidad pedagógica.
- Audios excesivos o inválidos degradan experiencia en mecánicas temporizadas.

**Resultado esperado:** mayor calidad de assets aceptados y menos errores en ejecución.

---

## 3.7 Alinear UX de subida con backend

**Decisión:** consumir `GET /contexts/upload-config` en frontend para mostrar límites reales y validar temprano.

**Por qué:**
- Evita mensajes contradictorios (ej. UI permitiendo WAV/10MB cuando backend rechaza).
- Reduce intentos fallidos y frustración del usuario.

**Resultado esperado:** feedback coherente y menor tasa de error en uploads.

---

## 4. Impacto por flujo

### 4.1 Creación de mazo
- Persistencia con `cardMappings` canónico.
- Vista de asignación y confirmación con preview real del asset.

### 4.2 Edición de mazo
- Carga y reconstrucción de asignaciones desde `cardMappings`.
- Render homogéneo de previews en listado de cartas.

### 4.3 Board Setup (Memory)
- Cartas de librería/slot/overlay muestran asset asignado real (thumbnail/image/fallback).

### 4.4 Partida (`GameSession`)
- Challenges construidos desde `session.cardMappings` reales.
- Menor divergencia entre configuración y ejecución real.

### 4.5 Upload de assets
- Audio reforzado con validación de duración.
- UI informada por configuración real del backend.

---

## 5. Trade-offs asumidos

1. **No se introduce migración de contrato pública** para minimizar riesgo inmediato.
2. **No se añadió suite de tests frontend completa** por inexistencia de infraestructura actual en este paquete.
3. **Se mantiene política visual híbrida** (en lugar de única) por razones de legibilidad/UX contextual.

---

## 6. Validación técnica ejecutada

- Test backend focalizado: `audioValidationService.test.js` (OK).
- Lint backend focalizado en archivos modificados (OK).
- Lint frontend focalizado en `GameSession.jsx` (error corregido).

Nota: persisten warnings legacy (principalmente PropTypes y a11y en componentes históricos), fuera del alcance funcional estricto de esta iteración.

---

## 7. Recomendaciones de continuidad (post-entrega)

1. Añadir tests frontend para:
   - render/fallback de `CardAssetPreview`
   - serialización `cardMappings` en wizard/edición
   - render de board memory con assets
2. Añadir métricas de observabilidad de uploads (rechazos por tipo/tamaño/duración).
3. Evaluar normalización opcional de audio (transcodificación) si aparecen variaciones de compatibilidad entre navegadores.
4. Reducir warnings de lint legacy para aumentar señal de calidad en CI.

---

## 8. Conclusión

La intervención corrige la causa raíz de inconsistencia (contrato de cartas), homogeneiza visualización de assets en los tres flujos críticos solicitados y fortalece la calidad de subida de audio con validación objetiva de duración. El resultado mejora confiabilidad funcional, trazabilidad arquitectónica y defendibilidad técnica de decisiones para memoria/defensa del TFG.
