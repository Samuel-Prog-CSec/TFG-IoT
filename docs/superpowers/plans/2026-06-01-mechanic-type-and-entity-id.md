# `mechanicType` explícito + normalizador `id`/`_id` — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: usar superpowers:executing-plans para implementar task por task. Los steps usan checkbox (`- [ ]`).

**Goal:** Sustituir la detección frágil del tipo de mecánica "por huella de datos" por un campo explícito `mechanicType` en `GameSession` (con fallback a la huella para datos legacy), y centralizar la resolución `id`/`_id` del frontend en un helper único, eliminando ambas familias de bugs recurrentes. Con tests y verificación E2E en la app.

**Architecture:**
- **Backend:** `GameSession.mechanicType` (enum, denormalizado de `GameMechanic.name` en cada vía de creación). El cálculo de techo de puntuación se extrae a una función pura `computeMaxScore(session)` que usa `mechanicType` y, si falta, infiere por huella (legacy). Migración de backfill para sesiones existentes.
- **Frontend:** `lib/entityId.js` con `getId`/`sameId`/`findById`; migración completa de los sitios que resuelven `id`/`_id` de entidades de dominio (excluye campos semánticos propios como `studentId`/`contextId`/`uid`).

**Tech Stack:** Node/Express/Mongoose/Jest (backend) · React/Vite/Vitest (frontend).

---

## PARTE A — Backend: `mechanicType` explícito + `computeMaxScore`

### Task A1: Función pura `computeMaxScore` (TDD primero)

**Files:**
- Create: `backend/src/services/gamePlayScoring.js`
- Test: `backend/tests/gamePlayScoring.test.js`

- [ ] **Step 1: Test que falla** (`backend/tests/gamePlayScoring.test.js`)

```js
const { computeMaxScore, MECHANIC_TYPES } = require('../src/services/gamePlayScoring');

describe('computeMaxScore — techo de puntuación por mecánica', () => {
  const cfg = (numberOfRounds, pointsPerCorrect) => ({ config: { numberOfRounds, pointsPerCorrect } });

  describe('por mechanicType explícito', () => {
    it('Asociación = rondas × puntos (aunque haya boardLayout: regresión del bug ALTO)', () => {
      const session = { mechanicType: 'association', ...cfg(6, 10),
        boardLayout: Array.from({ length: 12 }, (_, i) => ({ slot: i })) };
      expect(computeMaxScore(session)).toBe(60); // 6×10, NO 30 (12/2×10)
    });
    it('Memoria = parejas × puntos', () => {
      const session = { mechanicType: 'memory', ...cfg(1, 10),
        boardLayout: Array.from({ length: 12 }, (_, i) => ({ slot: i })) };
      expect(computeMaxScore(session)).toBe(60); // 6 parejas × 10
    });
    it('Secuencia = Σ longitud × puntos', () => {
      const session = { mechanicType: 'sequence', ...cfg(2, 15),
        sequencePlan: [{ length: 3 }, { length: 4 }] };
      expect(computeMaxScore(session)).toBe(105); // (3+4)×15
    });
  });

  describe('fallback por huella cuando falta mechanicType (legacy)', () => {
    it('infiere Asociación por associationChallengePlan aun con boardLayout', () => {
      const session = { ...cfg(6, 10),
        associationChallengePlan: [{ round: 1 }],
        boardLayout: Array.from({ length: 12 }, (_, i) => ({ slot: i })) };
      expect(computeMaxScore(session)).toBe(60);
    });
    it('infiere Memoria solo por boardLayout', () => {
      const session = { ...cfg(1, 10), boardLayout: Array.from({ length: 8 }, (_, i) => ({ slot: i })) };
      expect(computeMaxScore(session)).toBe(40); // 4 parejas × 10
    });
    it('infiere Secuencia por sequencePlan', () => {
      const session = { ...cfg(1, 10), sequencePlan: [{ length: 5 }] };
      expect(computeMaxScore(session)).toBe(50);
    });
    it('fallback genérico rondas × puntos sin ninguna huella', () => {
      expect(computeMaxScore({ ...cfg(3, 10) })).toBe(30);
    });
  });

  describe('robustez', () => {
    it('nunca devuelve menos de 1', () => {
      expect(computeMaxScore({ mechanicType: 'association', config: {} })).toBeGreaterThanOrEqual(1);
    });
    it('mechanicType inválido cae al fallback genérico', () => {
      expect(computeMaxScore({ mechanicType: 'zzz', ...cfg(4, 10) })).toBe(40);
    });
    it('expone el enum de tipos', () => {
      expect(MECHANIC_TYPES).toEqual({ ASSOCIATION: 'association', SEQUENCE: 'sequence', MEMORY: 'memory' });
    });
  });
});
```

- [ ] **Step 2:** `cd backend; npx jest tests/gamePlayScoring.test.js` → FALLA (módulo inexistente).

- [ ] **Step 3: Implementación** (`backend/src/services/gamePlayScoring.js`)

```js
/**
 * @fileoverview Cálculo puro del techo de puntuación (`maxScore`) de una partida.
 *
 * Extraído de `gamePlayService.createPlay` (ADR-114) para hacerlo testeable y
 * eliminar la detección frágil "por huella de datos". Usa el campo explícito
 * `session.mechanicType`; si falta (sesiones legacy aún sin migrar) infiere el
 * tipo por la huella de planes, manteniendo el orden correcto
 * Secuencia → Asociación → Memoria (Asociación TAMBIÉN persiste `boardLayout`,
 * así que NO puede distinguirse de Memoria por el tablero — su huella propia es
 * `associationChallengePlan` y debe comprobarse antes).
 */
const MECHANIC_TYPES = Object.freeze({
  ASSOCIATION: 'association',
  SEQUENCE: 'sequence',
  MEMORY: 'memory'
});

const MEMORY_GROUP_SIZE = 2;

/** Infiere el tipo por la presencia de planes (fallback legacy). */
function inferMechanicTypeFromShape(session) {
  const sequencePlan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
  const associationPlan = Array.isArray(session.associationChallengePlan)
    ? session.associationChallengePlan : [];
  const boardLayout = Array.isArray(session.boardLayout) ? session.boardLayout : [];
  const totalSequenceCards = sequencePlan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);
  if (totalSequenceCards > 0) return MECHANIC_TYPES.SEQUENCE;
  if (associationPlan.length > 0) return MECHANIC_TYPES.ASSOCIATION;
  if (boardLayout.length > 0) return MECHANIC_TYPES.MEMORY;
  return null;
}

/**
 * @param {Object} session - Documento/objeto de sesión (mechanicType?, config, planes).
 * @returns {number} maxScore teórico (techo de score, mínimo 1).
 */
function computeMaxScore(session) {
  const rounds = Number(session.config?.numberOfRounds) || 1;
  const points = Number(session.config?.pointsPerCorrect) || 10;
  const known = Object.values(MECHANIC_TYPES);
  const mechanicType = known.includes(session.mechanicType)
    ? session.mechanicType
    : inferMechanicTypeFromShape(session);

  switch (mechanicType) {
    case MECHANIC_TYPES.SEQUENCE: {
      const plan = Array.isArray(session.sequencePlan) ? session.sequencePlan : [];
      const total = plan.reduce((acc, r) => acc + (Number(r.length) || 0), 0);
      return Math.max(1, total * points);
    }
    case MECHANIC_TYPES.ASSOCIATION:
      return Math.max(1, rounds * points);
    case MECHANIC_TYPES.MEMORY: {
      const board = Array.isArray(session.boardLayout) ? session.boardLayout : [];
      const pairs = Math.max(1, Math.floor(board.length / MEMORY_GROUP_SIZE));
      return Math.max(1, pairs * points);
    }
    default:
      return Math.max(1, rounds * points);
  }
}

module.exports = { computeMaxScore, inferMechanicTypeFromShape, MECHANIC_TYPES };
```

- [ ] **Step 4:** `npx jest tests/gamePlayScoring.test.js` → PASA.

### Task A2: `createPlay` usa `computeMaxScore`

**Files:** Modify `backend/src/services/gamePlayService.js` (zona ~114-167 e import).

- [ ] **Step 1:** Importar al inicio: `const { computeMaxScore } = require('./gamePlayScoring');`
- [ ] **Step 2:** Reemplazar TODO el bloque de cálculo inline (el comentario largo + `const rounds…` hasta el `} else { maxScore = … }`) por:

```js
  // Techo de puntuación teórico (ADR-114): usa el tipo explícito de la sesión
  // y, si falta (legacy), infiere por huella. Lógica en gamePlayScoring.js.
  const maxScore = computeMaxScore(session);
```

- [ ] **Step 3:** `cd backend; npx jest tests/gamePlayScoring.test.js && npm run lint` → verde. (Los tests de integración de createPlay siguen pasando porque el resultado numérico es idéntico.)

### Task A3: Campo `mechanicType` en el modelo

**Files:** Modify `backend/src/models/GameSession.js` (tras `mechanicId`, ~línea 85).

- [ ] **Step 1:** Añadir tras el bloque `mechanicId`:

```js
    // Tipo de mecánica denormalizado desde GameMechanic.name. Fuente de verdad
    // explícita para scoring y flujo de juego (evita inferir por "huella de
    // datos"). No required: las sesiones legacy se rellenan por migración y el
    // scoring tiene fallback por huella mientras tanto.
    mechanicType: {
      type: String,
      enum: ['association', 'sequence', 'memory'],
      index: true
    },
```

### Task A4: Asignar `mechanicType` en todas las vías de creación

**Files:** Modify `backend/src/services/gameSessionService.js` (`createSession:276`, `createSessionFromDeck:454`, `cloneSession:129`) y `backend/seeders/06-sessions.js`.

- [ ] **Step 1:** `createSession` — añadir `mechanicType: mechanic.name` al objeto de `gameSessionRepository.create({...})`.
- [ ] **Step 2:** `createSessionFromDeck` — añadir `mechanicType: mechanicName` al objeto de `gameSessionRepository.build({...})` (ya existe `const mechanicName = normalizeMechanicName(mechanic.name)`).
- [ ] **Step 3:** `cloneSession` — añadir `mechanicType: normalizeMechanicName(mechanic.name)` al `build({...})`.
- [ ] **Step 4:** Seeder `06-sessions.js` — al construir cada sesión, añadir `mechanicType: mechanic.name` (la mecánica ya se resuelve con `findMechanic`).
- [ ] **Step 5:** `npm run lint` backend → verde.

### Task A5: Migración de backfill

**Files:** Create `backend/scripts/migrate-mechanic-type.js`; Modify `backend/package.json` (script `migrate:mechanic-type`).

- [ ] **Step 1:** Script que recorre `GameSession` sin `mechanicType`, popula `mechanicId` (name) → asigna; si no resuelve, usa `inferMechanicTypeFromShape`. Idempotente, con `--dry-run`. Patrón de los `scripts/migrate-*.js` existentes (conexión Mongo + logger + resumen).
- [ ] **Step 2:** Añadir a `package.json`: `"migrate:mechanic-type": "node scripts/migrate-mechanic-type.js"`.

### Task A6: Test de integración del campo (creación asigna mechanicType)

**Files:** Test `backend/tests/sessionMechanicType.test.js`.

- [ ] **Step 1:** Test supertest (patrón de `sessionDetailSequencePlan.test.js`): crear sesión de Asociación vía API → recargar de BD → `session.mechanicType === 'association'`. Crear de Secuencia → `'sequence'`. (Confirma el camino de creación end-to-end.)
- [ ] **Step 2:** `npx jest tests/sessionMechanicType.test.js` → PASA.

---

## PARTE B — Frontend: normalizador `id`/`_id`

### Task B1: `lib/entityId.js` (TDD)

**Files:** Create `frontend/src/lib/entityId.js`; Test `frontend/src/lib/__tests__/entityId.test.js`.

- [ ] **Step 1: Test que falla** (Vitest, convención de `lib/__tests__/utils.test.js`)

```js
import { describe, it, expect } from 'vitest';
import { getId, sameId, findById } from '../entityId';

describe('entityId', () => {
  describe('getId', () => {
    it('prioriza id sobre _id', () => expect(getId({ id: 'a', _id: 'b' })).toBe('a'));
    it('cae a _id', () => expect(getId({ _id: 'b' })).toBe('b'));
    it('null/undefined/sin id → null', () => {
      expect(getId(null)).toBeNull();
      expect(getId(undefined)).toBeNull();
      expect(getId({})).toBeNull();
    });
    it('normaliza a string (ObjectId-like con toString)', () => {
      expect(getId({ _id: { toString: () => 'x' } })).toBe('x');
    });
  });
  describe('sameId', () => {
    it('true si resuelven al mismo id aunque difieran id/_id', () =>
      expect(sameId({ id: 'a' }, { _id: 'a' })).toBe(true));
    it('false si distinto', () => expect(sameId({ id: 'a' }, { id: 'b' })).toBe(false));
    it('false si alguno es null o sin id (no colisiona undefined===undefined)', () => {
      expect(sameId(null, { id: 'a' })).toBe(false);
      expect(sameId({}, {})).toBe(false);
    });
    it('acepta un id string como segundo argumento', () =>
      expect(sameId({ id: 'a' }, 'a')).toBe(true));
  });
  describe('findById', () => {
    const list = [{ id: 'a', n: 1 }, { _id: 'b', n: 2 }];
    it('encuentra por string', () => expect(findById(list, 'b')?.n).toBe(2));
    it('encuentra por entidad', () => expect(findById(list, { id: 'a' })?.n).toBe(1));
    it('undefined si no está o lista no-array', () => {
      expect(findById(list, 'z')).toBeUndefined();
      expect(findById(null, 'a')).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2:** `cd frontend; npx vitest run src/lib/__tests__/entityId.test.js` → FALLA.

- [ ] **Step 3: Implementación** (`frontend/src/lib/entityId.js`)

```js
/**
 * @fileoverview Resolución central del identificador de una entidad de dominio.
 *
 * El backend expone los DTO con `id` Y `_id`; mezclarlos provocaba bugs
 * recurrentes (etiquetas "Desconocido" por `.find(x => x._id === filtro)` que no
 * casaba, o `undefined === undefined → true`). `getId` unifica el orden
 * (id primero, _id de respaldo) y `sameId`/`findById` comparan con guardas de
 * verdad. No cubre campos semánticos propios (`studentId`, `contextId`, `uid`).
 */

/** @param {object|null|undefined} entity @returns {string|null} */
export function getId(entity) {
  if (!entity) return null;
  const raw = entity.id ?? entity._id;
  if (raw === null || raw === undefined) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

/**
 * Compara dos entidades (o entidad vs id string) por id normalizado.
 * Nunca devuelve true por ausencia de id en ambos.
 */
export function sameId(a, b) {
  const idA = getId(a);
  const idB = typeof b === 'string' ? b : getId(b);
  return idA !== null && idB !== null && idA === idB;
}

/** Busca en `list` la entidad cuyo id normalizado coincide con `idOrEntity`. */
export function findById(list, idOrEntity) {
  if (!Array.isArray(list)) return undefined;
  const target = typeof idOrEntity === 'string' ? idOrEntity : getId(idOrEntity);
  if (target === null) return undefined;
  return list.find((e) => getId(e) === target);
}
```

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/entityId.test.js` → PASA.

### Task B2: Migrar sitios de MATCHING (impacto real — bug "Desconocido")

**Files (Modify):**
- `pages/SessionsPage.jsx` — chips de mecánica/contexto activos: `mechanics.find(m => m.id === filters.mechanicFilter)` → `findById(mechanics, filters.mechanicFilter)`; idem contexto.
- `pages/CardDecksPage.jsx:456` — `(c.id || c._id) === filters.contextFilter` → `sameId(c, filters.contextFilter)`.
- `pages/Dashboard.jsx:~87-95` — selects de contexto/mecánica: `c.id`/`m.id` directos → `getId(c)`/`getId(m)` en value y comparación.
- `components/ui/RFIDScannerPanel.jsx:192` — dedup: `(c.id||c._id)`/`(sc.id||sc._id)` → `sameId(sc, c) || (c.uid && sc.uid && c.uid === sc.uid)` (mantener rama `uid`).

- [ ] Importar `getId`/`sameId`/`findById` desde `../lib/entityId` (ajustar ruta relativa) en cada archivo.
- [ ] Aplicar los reemplazos. `cd frontend; npm run lint` → verde tras cada archivo.

### Task B3: Migrar sitios de LECTURA `id||_id` → `getId` (consistencia, completo)

**Files (Modify) — patrón único `x.id || x._id` / `x._id || x.id` → `getId(x)`** (excluye `studentId`/`contextId`/`uid`/`sensorId`):
`pages/SessionDetail.jsx` (×9), `pages/CardDecksPage.jsx` (112/356/363/380/415), `pages/ContextsPage.jsx` (163/302), `pages/ContextDetailPage.jsx` (90/123/255/285/608), `pages/DeckEditPage.jsx` (219/462/684), `pages/CardDeckDetailPage.jsx:145`, `pages/DeckCreationWizard.jsx:850`, `components/ui/DeckCard.jsx:705`, `components/session/StepDeck.jsx:76`, `components/session/StepMechanic.jsx:50`, `components/session/sessionHelpers.js:153` (deprecar `resolveMechanicId` → `getId`), `hooks/useWizardConfig.js` (113/139), `hooks/useGameSocket.js` (178/189/661 si son entidades id/_id puras), paneles de detalle de sesión (socket emit `session?.id || session?._id`).

- [ ] Migrar archivo por archivo, importando `getId`. Mantener los `?.` opcionales donde existan (`getId(session)` ya es null-safe). `npm run lint` tras cada uno.
- [ ] Para `resolveMechanicId`: reemplazar su cuerpo por `return getId(mechanic);` o sustituir usos por `getId` y eliminar el helper si queda huérfano (grep antes de borrar).

---

## PARTE C — Verificación y documentación

### Task C1: Suites + build
- [ ] `cd backend; npm run lint` → 0 errores · `$env:TEST_MONGO_URI=...; npm test -- --coverage=false` → verde (1499 + nuevos).
- [ ] `cd frontend; npm run lint` → 0 errores · `npm test -- --run` → verde (590 + nuevos) · `npm run build` (vía rebuild Docker prod).

### Task C2: E2E en la app (Docker) — impacto real, sin romper nada
- [ ] Rebuild backend+frontend; `docker compose restart backend` para cargar el código.
- [ ] Correr `migrate:mechanic-type` en el contenedor → todas las sesiones existentes con `mechanicType`. Verificar en BD (mongosh) que una sesión de Asociación tiene `mechanicType: 'association'`.
- [ ] Crear/abrir una sesión de Asociación, jugarla (táctil/serial) hasta GameOver → maxScore = rondas × puntos (p. ej. 60), porcentaje real (no "100% engañoso"). Verificar también Memoria y Secuencia.
- [ ] Frontend: filtros con chips (Sesiones/Mazos) muestran el nombre correcto (no "Desconocido"); navegación a detalle/edición OK; consola sin errores.

### Task C3: Documentación (obligatoria)
- [ ] ADR-193 en `documentation/Architecture_Decisions.md` (alcance Full-stack): decisión `mechanicType` denormalizado + fallback + migración; normalizador `entityId`. Actualizar `backend/docs/Analytics_Design_Rationale.md` (el % depende de maxScore correcto) y nota en `frontend/docs/02-BUENAS-PRACTICAS.md` (usar `getId`/`sameId`/`findById`, no `_id` crudo).

---

## Self-review
- **Cobertura spec:** mechanicType explícito (A3/A4) ✓ · usado en scoring (A1/A2) ✓ · tests scoring (A1) + creación (A6) ✓ · migración legacy (A5) ✓ · normalizador id/_id (B1) ✓ · migración completa frontend (B2/B3) ✓ · verificación app + no romper (C2) ✓.
- **Sin placeholders:** código real en helpers, tests, computeMaxScore, modelo. La migración masiva B3 es patrón único `x.id||x._id → getId(x)` (mecánico, mismo reemplazo), con lista explícita de archivos.
- **Consistencia de tipos:** `getId/sameId/findById` con firmas fijas usadas igual en B2/B3; `MECHANIC_TYPES` enum compartido A1↔A3 (mismos literales `association/sequence/memory`).
