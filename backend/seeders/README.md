# Seeders - Datos de prueba

Sistema de seeders para poblar la base de datos con datos realistas que simulen actividad previa al arrancar la aplicación. Están diseñados para que el estado inicial sea indistinguible del generado al usar la app a través del frontend (mismo formato, validaciones, hooks de modelo y normalizaciones).

## Cómo se ejecutan

### Docker (arranque automático)

Los tres compose (`docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`) invocan `npm run seed:if-empty` como parte del comando del contenedor de backend. Este script comprueba si la base de datos tiene datos y, en caso contrario, ejecuta `runSeeders()` sin limpieza previa.

### Manual

```bash
# Ejecutar todos los seeders; idempotentes: si algo ya existe, se salta
npm run seed

# Limpiar BD y ejecutar desde cero (recomendado cuando quieras un estado limpio)
npm run seed:reset

# Solo si la BD está completamente vacía (usado por Docker)
npm run seed:if-empty
```

## Orden de ejecución

Los seeders se ejecutan en orden numérico (definido en `index.js`) para respetar las dependencias entre entidades:

| # | Archivo | Crea | Depende de |
|---|---------|------|-----------|
| 0 | `00-super-admin.js` | 1 super administrador | — |
| 1 | `01-users.js` | 2 profesores + 36 alumnos (18 por profesor) | — |
| 3 | `03-mechanics.js` | 2 mecánicas (`association`, `memory`) | — |
| 4 | `04-contexts.js` | 5 contextos temáticos con 6 assets cada uno | — |
| 5 | `05-carddecks.js` | 12 mazos (6 por profesor) | Users, Contexts |
| 6 | `06-sessions.js` | 28 sesiones (14 por profesor) | Users, Mechanics, Contexts, Decks |
| 7 | `07-gameplays.js` | ~414 partidas + recalc de métricas y estados | Sessions, Students |

No existe `02-cards.js`: las tarjetas RFID no son entidad propia, se materializan como `cardMappings` dentro de cada mazo.

## Idempotencia

Todos los seeders comprueban si ya hay datos de su colección antes de crear. Si los hay, devuelven el set existente y el siguiente seeder continúa normalmente. Esto permite ejecutar `npm run seed` múltiples veces sin duplicados ni errores `E11000`.

Para forzar una regeneración completa, usar `npm run seed:reset` (limpia todas las colecciones con `deleteMany({})` antes de sembrar).

## Datos generados

### Super administrador (`00-super-admin.js`)

| Campo | Valor |
|-------|-------|
| Email | `admin@test.com` (override con `SUPER_ADMIN_EMAIL`) |
| Password | `Admin1234!` (override con `SUPER_ADMIN_PASSWORD`) |
| Rol | `super_admin` |
| `accountStatus` | `approved` |

### Profesores (`01-users.js`)

| Email | Password | Nombre |
|-------|----------|--------|
| `maria@test.com` | `Test1234!` | María García López |
| `carlos@test.com` | `Test1234!` | Carlos Rodríguez Pérez |

Los profesores se crean con `accountStatus: 'approved'` para que funcionen de inmediato en demos. El flujo de registro real (`POST /api/auth/register`) crearía a un profesor como `pending_approval`; los seeders lo "pre-aprueban" intencionadamente — no es un bug, es conveniencia para entornos de desarrollo/demo.

### Alumnos (`01-users.js`)

- 18 alumnos por profesor, 36 en total
- Edades entre 4 y 6 años (ciclan)
- Asignados a 3 aulas: `Infantil A`, `Infantil B`, `Infantil C`
- Sin email ni password (no inician sesión)
- **Sin `birthdate`** — minimización de datos, Art. 5.1.c RGPD
- Con consentimiento parental otorgado (Art. 8 RGPD + Art. 7 LOPDGDD):
  - `consent.granted: true`
  - `consent.grantedBy: "Tutor de <nombre>"`
  - `consent.purposes: ['educational_tracking', 'performance_analytics']`
  - `consent.policyVersion: '1.0'`
- `studentMetrics` inicializadas a cero; se recalculan al final desde las partidas (`07-gameplays.js`)

### Mecánicas de juego (`03-mechanics.js`)

Las mecánicas son **inmutables a nivel API**: solo se crean vía seeders. El seeder siembra únicamente las que el backend implementa:

| Mecánica | `displayName` | `isActive` | Notas |
|----------|---------------|------------|-------|
| `association` | Asociación | true | Consigna en pantalla + escaneo de tarjeta correcta |
| `memory` | Memoria | true | Parejas boca abajo; buscar coincidencias |

La mecánica `sequence` está reservada en el dominio pero **no se siembra hasta que haya implementación en `src/strategies/`** (evita mostrar opciones no funcionales en la UI).

### Contextos temáticos (`04-contexts.js`)

5 contextos, cada uno con 6 assets:

- `geography-europe` — Países de Europa (España, Francia, Italia, Alemania, Portugal, Grecia)
- `animals-farm` — Animales de granja (Vaca, Cerdo, Gallina, Caballo, Pato, Gato)
- `colors-basic` — Colores básicos (Rojo, Azul, Verde, Amarillo, Naranja, Morado)
- `numbers-1-6` — Números del 1 al 6
- `shapes-basic` — Formas básicas (Círculo, Cuadrado, Triángulo, Estrella, Corazón, Rombo)

Cada asset incluye `imageUrl` y `thumbnailUrl` apuntando a Supabase Storage público, `dominantColor` en hex y `uploadedBy: null` (assets del sistema, no eliminables individualmente desde la UI — ADR-053).

Si los archivos `.webp` de Supabase no están presentes, el frontend mostrará el fallback con `display` textual.

### Mazos de tarjetas (`05-carddecks.js`)

6 mazos por profesor, 12 en total:

- Banderas de Europa
- Animales de Granja
- Colores Básicos
- Números del 1 al 6
- Formas Básicas
- Formas Memoria (12 mapeos: 6 parejas, mecánica `memory`)

**UIDs de cartas**: se generan de forma determinista como hex de 8 caracteres en mayúsculas (formato compatible con MIFARE Classic), secuenciales desde `00000000`. Cada profesor ocupa un rango disjunto para evitar colisiones cross-teacher. Para mazos de memoria, cada asset produce 2 UIDs distintos (segunda copia desplazada por `count`).

Ejemplo: profesor 0 usa `00000000..00000029`, profesor 1 continúa desde `0000002A`.

### Sesiones de juego (`06-sessions.js`)

14 sesiones por profesor, 28 en total. Distribuidas a lo largo de 60 días (de `daysAgo: 58` a `daysAgo: 3`) y una marcada como `created` (pendiente) con `daysAgo: 0`. Todas las completadas duran 30 minutos entre `startedAt` y `endedAt`.

- La `difficulty` se calcula automáticamente vía hook pre-save en función de `config.numberOfCards`.
- Las sesiones con mecánica `association` incluyen `associationChallengePlan` generado determinísticamente.
- Las sesiones con mecánica `memory` incluyen `boardLayout` barajado determinísticamente.
- El seeder `07` recalcula el `status` final tras generar las partidas para mantener la coherencia de dominio (si hay partidas activas/paused, la sesión queda `active`).

### Partidas (`07-gameplays.js`)

Entre 8 y 15 partidas por alumno, ~414 en total. Cada alumno se asigna cíclicamente a uno de 6 perfiles de rendimiento:

| Perfil | Éxito base | Timeout | Velocidad | Evolución |
|--------|-----------|---------|-----------|-----------|
| `high_performer` | 92% | 2% | 2.5s | Estable con ligera mejora |
| `improving` | 45% | 12% | 6.5s | Mejora clara (+4% por partida) |
| `declining` | 75% | 5% | 3.5s | Empeora (-2.5% por partida) |
| `plateau` | 65% | 6% | 4.5s | Estancado |
| `struggling` | 35% | 18% | 8s | Ligera mejora lenta |
| `average` | 72% | 6% | 4s | Mejora moderada |

Las partidas incluyen:
- Fatiga simulada (tiempos crecientes en las rondas finales)
- Últimas 3 partidas por alumno en la última semana (horario escolar 9-14h) para alimentar métricas de "Partidas hoy" y "Alumnos activos"
- Distribución de estados: mayoría `completed`, una fracción `abandoned` según `abandonProbability` del perfil

Los eventos emitidos replican fielmente los del `GameEngine` real:
- `round_start` al comenzar cada ronda
- `card_scanned` (solo en memory, antes de resolverse el par)
- `correct` | `error` | `timeout` como outcome
- **No se emite `round_end`**: el enum lo contempla pero el engine real nunca lo invoca

Al final, `studentMetrics` se agrega a partir de las partidas y las sesiones recalculan su `status` de dominio.

## Estructura de archivos

```
seeders/
├── index.js           # Orquestador (runSeeders + cleanDatabase + main CLI)
├── 00-super-admin.js  # Super administrador inicial
├── 01-users.js        # Profesores y alumnos
├── 03-mechanics.js    # Mecánicas de juego (association, memory)
├── 04-contexts.js     # Contextos temáticos con assets
├── 05-carddecks.js    # Mazos de tarjetas
├── 06-sessions.js     # Sesiones de juego
├── 07-gameplays.js    # Partidas + agregación de métricas
└── README.md          # Este documento
```

## Criterios de sincronización con la app

Manda la app. Si detectas una divergencia entre lo que crea el seeder y lo que persiste un flujo real del frontend, corrige el seeder (no la app). Criterios concretos a respetar:

- Usar `Model.create(data)` (no `insertMany`) para que se ejecuten los hooks pre-save (bcrypt en password, `difficulty` en sesión, clamp de `score` en gameplay, validaciones de `consent`, etc.).
- Normalizar UIDs a hex mayúscula; el modelo aplica el regex `^[0-9A-F]{8}$|^[0-9A-F]{14}$`.
- No asignar `birthdate` a alumnos.
- No asignar `email` ni `password` a alumnos.
- Assets seedeados deben tener `uploadedBy: null`.
- Eventos de partida siguen el enum: `card_scanned`, `correct`, `error`, `timeout`, `round_start`, `round_end`, `server_restart`. El seeder emite solo los que el engine real emite.
- Respetar la inmutabilidad de `name` en mecánicas (índice unique; crear solo las implementadas).
