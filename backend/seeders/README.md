# Seeders - Datos de Prueba

Sistema de seeders para poblar la base de datos con datos de prueba realistas.

## Uso

```bash
# Ejecutar todos los seeders (agrega a datos existentes)
npm run seed

# Limpiar BD y ejecutar seeders desde cero (RECOMENDADO)
npm run seed:reset
```

## Orden de Ejecución

Los seeders se ejecutan en orden numérico para respetar las dependencias:

| # | Archivo | Descripción | Dependencias |
|---|---------|-------------|--------------|
| 0 | `00-super-admin.js` | Super administrador inicial | - |
| 1 | `01-users.js` | Profesores (3) y alumnos (15) | - |
| 2 | `02-cards.js` | Tarjetas RFID (50) | - |
| 3 | `03-mechanics.js` | Mecánicas de juego (5) | - |
| 4 | `04-contexts.js` | Contextos temáticos (15) | - |
| 5 | `05-carddecks.js` | Mazos de tarjetas (~48) | Users, Contexts, Cards |
| 6 | `06-sessions.js` | Sesiones de juego (~30) | Users, Mechanics, Contexts, Decks |
| 7 | `07-gameplays.js` | Partidas individuales (~35) | Sessions, Students |

## Datos Generados

### Super Admin
- **Email**: `admin@test.com`
- **Password**: `Admin1234!`
- **Rol**: `super_admin`

### Profesores (3)
| Email | Password | Nombre |
|-------|----------|--------|
| `maria@test.com` | `Test1234!` | María García |
| `carlos@test.com` | `Test1234!` | Carlos López |
| `ana@test.com` | `Test1234!` | Ana Martínez |

### Alumnos (15)
- 5 alumnos por profesor
- Edades: 4-6 años
- Métricas de juego simuladas (partidas jugadas, puntuaciones, etc.)
- Asignados a diferentes aulas (Girasoles, Mariposas, Estrellas)

### Tarjetas RFID (50)
- **40 secuenciales**: UIDs AA000001 - AA000028 (formatos MIFARE y NTAG)
- **10 especiales**: UIDs fáciles de recordar para testing manual
  - `AAAAAAAA`, `BBBBBBBB`, `CCCCCCCC`, `DDDDDDDD`
  - `EEEEEEEE`, `FFFFFFFF`, `12345678`, `87654321`
  - `04AABBCCDD1234`, `04112233445566` (14 caracteres)

### Mecánicas de Juego (5)
| Mecánica | Estado | Descripción |
|----------|--------|-------------|
| `association` | Activa | Emparejar elementos |
| `sequence` | Activa | Ordenar secuencias |
| `memory` | Activa | Memorizar patrones |
| `classification` | Activa | Clasificar en categorías |
| `speed` | Inactiva | Respuesta rápida (avanzada) |

### Contextos Temáticos (15)
- **Geografía**: Países de Europa
- **Animales**: Granja, Salvajes, Marinos
- **Educativos**: Colores, Números, Vocales, Letras
- **Alimentos**: Frutas, Verduras
- **Conceptos**: Formas, Días, Estaciones, Transportes, Emociones

### Mazos de Tarjetas (~48)
- ~16 mazos por profesor
- Cada mazo asocia tarjetas RFID con valores de un contexto
- Ejemplos: "Animales de la Granja", "Colores del Arcoíris", "Números Mágicos"

### Sesiones de Juego (~30)
- ~10 sesiones por profesor
- **Estados variados**: 
  - `active` (en progreso)
  - `created` (pendientes)
  - `completed` (históricas)
  - `paused` (pausadas)
- **Dificultades**: easy, medium, hard

### Partidas GamePlays (~35)
- Partidas individuales de alumnos
- Estados: `in-progress` y `completed`
- Eventos de juego simulados (escaneos, aciertos, errores)
- Métricas calculadas (puntuación, tiempo, intentos)

## Estructura de Archivos

```
seeders/
├── index.js            # Ejecutor principal
├── 00-super-admin.js   # Super administrador
├── 01-users.js         # Profesores y alumnos
├── 02-cards.js         # Tarjetas RFID
├── 03-mechanics.js     # Mecánicas de juego
├── 04-contexts.js      # Contextos temáticos
├── 05-carddecks.js     # Mazos de tarjetas
├── 06-sessions.js      # Sesiones de juego
├── 07-gameplays.js     # Partidas individuales
└── README.md           # Esta documentación
```

## Notas Importantes

1. **Siempre usar `--reset`** para empezar con datos limpios
2. Las tarjetas especiales (`AAAAAAAA`, etc.) son útiles para testing manual
3. Los mazos usan tarjetas diferentes por profesor para evitar conflictos
4. Las sesiones `completed` tienen fechas pasadas (hace 2-7 días)
5. Los alumnos tienen métricas coherentes basadas en las partidas simuladas

## Personalización

Para modificar la cantidad de datos generados, edita las constantes en cada seeder:

```javascript
// 01-users.js - Cambiar número de alumnos por profesor
generateStudentsData(teacher, studentNames, index * 5, 5); // último arg = cantidad

// 02-cards.js - Cambiar cantidad de tarjetas
const sequentialCards = generateCardsData(40); // cantidad de tarjetas secuenciales
```
