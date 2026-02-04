# CardDecks - Documentación de Arquitectura

## Descripción General

El sistema de **Gestión de Mazos de Cartas (CardDecks)** permite a los profesores crear, editar y administrar conjuntos de tarjetas RFID preconfiguradas con assets de un contexto temático. Estos mazos se reutilizan en múltiples sesiones de juego, simplificando el flujo de creación.

## Arquitectura del Sistema

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │CardDecksPage │   │DeckCreation  │   │ DeckEditPage │        │
│  │   (lista)    │   │   Wizard     │   │   (edición)  │        │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘        │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │                                    │
│  ┌─────────────────────────┴─────────────────────────┐         │
│  │              Componentes UI Premium                │         │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────┐   │         │
│  │  │WizardStep │ │ DeckCard  │ │AssetSelector  │   │         │
│  │  │   per     │ │           │ │               │   │         │
│  │  └───────────┘ └───────────┘ └───────────────┘   │         │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────────┐   │         │
│  │  │RFIDScanner│ │  Card     │ │  GlassCard    │   │         │
│  │  │   Panel   │ │ Selector  │ │               │   │         │
│  │  └───────────┘ └───────────┘ └───────────────┘   │         │
│  └───────────────────────────────────────────────────┘         │
│                            │                                    │
│  ┌─────────────────────────┴─────────────────────────┐         │
│  │                    Hooks                           │         │
│  │  ┌────────────────────┐                           │         │
│  │  │useDeckWizardDraft  │ (localStorage persistence)│         │
│  │  └────────────────────┘                           │         │
│  └───────────────────────────────────────────────────┘         │
│                            │                                    │
│  ┌─────────────────────────┴─────────────────────────┐         │
│  │                   API Services                     │         │
│  │  decksAPI | contextsAPI | cardsAPI | mechanicsAPI │         │
│  └───────────────────────────────────────────────────┘         │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │ HTTP (Axios)
┌────────────────────────────┼────────────────────────────────────┐
│                        Backend                                   │
├────────────────────────────┴────────────────────────────────────┤
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │cardDeckContr.│   │cardDeckRoutes│   │ CardDeck     │        │
│  │              │   │              │   │  Model       │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│         │                                      │                │
│         └──────────────────────────────────────┘                │
│                            │                                    │
│  ┌─────────────────────────┴─────────────────────────┐         │
│  │                    MongoDB                         │         │
│  │  carddecks | cards | contexts | users             │         │
│  └───────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### Modelo de Datos

```javascript
// CardDeck Schema
{
  _id: ObjectId,
  name: String (required, 3-100 chars),
  contextId: ObjectId (ref: GameContext),
  cards: [{
    cardId: ObjectId (ref: Card),
    assignedAsset: {
      key: String,
      display: String,
      value: String,
      audioUrl: String,
      imageUrl: String
    }
  }],
  status: 'active' | 'archived',
  createdBy: ObjectId (ref: User, teacher),
  createdAt: Date,
  updatedAt: Date
}
```

## Flujos de Usuario

### 1. Crear Mazo (DeckCreationWizard)

```
Paso 1: Capturar Cartas
├── Modo RFID (mock) → Escanear tarjetas físicas
└── Modo Manual → Seleccionar de lista

Paso 2: Elegir Contexto
└── Grid de contextos disponibles con preview de assets

Paso 3: Asignar Assets
├── Lista de cartas seleccionadas (izquierda)
└── Grid de assets del contexto (derecha)
    └── Click para asignar a carta activa

Paso 4: Confirmar
├── Input nombre del mazo
├── Resumen de configuración
└── Botón "Crear Mazo" → confetti 🎉
```

### 2. Editar Mazo (DeckEditPage)

```
Tabs:
├── Cartas → Añadir/quitar cartas del mazo
├── Contexto → Cambiar contexto (resetea asignaciones)
└── Asignaciones → Reasignar assets

Footer fijo:
└── Indicador de cambios sin guardar
```

### 3. Crear Sesión (CreateSession simplificado)

```
Paso 1: Seleccionar Mazo
└── Grid de mazos activos del profesor

Paso 2: Seleccionar Mecánica
└── Association | Sequence | Memory

Paso 3: Configurar Reglas
├── Presets de dificultad (Fácil/Normal/Difícil)
└── Sliders manuales (rondas, tiempo, puntos)

Paso 4: Revisar y Crear
├── Input nombre de sesión
├── Resumen completo
└── Botón "Crear Sesión"
```

## Decisiones de Diseño

### 1. Límite de 50 Mazos por Profesor

**Justificación:**
- **Rendimiento**: Evitar cargas excesivas en las queries
- **UX**: Mantener la lista manejable
- **Negocio**: Límite razonable para uso educativo

**Implementación:**
```javascript
// backend/src/controllers/cardDeckController.js
const MAX_DECKS_PER_TEACHER = 50;

const createDeck = async (req, res, next) => {
  const count = await CardDeck.countDocuments({ 
    createdBy: req.user.id, 
    status: 'active' 
  });
  
  if (count >= MAX_DECKS_PER_TEACHER) {
    throw new ValidationError(`Límite de ${MAX_DECKS_PER_TEACHER} mazos alcanzado`);
  }
  // ...
};
```

### 2. Persistencia de Borrador (localStorage)

**Justificación:**
- Evitar pérdida de trabajo por navegación accidental
- No saturar backend con borradores temporales

**Implementación:**
```javascript
// Hook useDeckWizardDraft
const DRAFT_KEY = 'deck_wizard_draft';
const DRAFT_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 días

// Guarda automáticamente con debounce de 500ms
// Ofrece restaurar al abrir el wizard
// Limpia al completar la creación
```

### 3. RFID Mock vs Web Serial

**Estado Actual:**
- RFID Scanner usa simulación con tarjetas predefinidas
- Botón "Simular escaneo" para testing

**Pendiente (T-044):**
- Implementación real con Web Serial API
- Conexión directa con lector RC522

### 4. Separación Mazo ↔ Sesión

**Antes:** CreateSession tenía 6 pasos incluyendo selección de cartas y contexto

**Ahora:** 
- Mazos son entidades independientes reutilizables
- CreateSession usa mazos predefinidos (4 pasos)
- Sesiones referencian el mazo sin duplicar datos

## API Endpoints

### Decks

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/decks` | Lista mazos (paginado, filtros) |
| GET | `/api/decks/:id` | Obtener mazo por ID |
| GET | `/api/decks/count` | Contador activos/archivados |
| POST | `/api/decks` | Crear nuevo mazo |
| PUT | `/api/decks/:id` | Actualizar mazo |
| DELETE | `/api/decks/:id` | Archivar mazo (soft delete) |

### Query Params (GET /api/decks)

```
?page=1
&limit=12
&status=active|archived
&contextId=<ObjectId>
&search=<string>
&sortBy=createdAt|name
&order=asc|desc
```

## Componentes UI

### WizardStepper
- Indicador visual de progreso
- Animación líquida de avance
- Confetti al completar último paso

### DeckCard
- Efecto 3D tilt con parallax
- Borde con gradiente animado
- Acciones en hover

### RFIDScannerPanel
- Animación de ondas radar
- Contador de cartas escaneadas
- Lista con fly-in animation

### AssetSelector
- Grid responsivo con stagger
- Filtro por texto
- Badge "asignado" con pulse

## Testing

### Componentes a Probar

```bash
# Unit tests
- DeckCreationWizard: validaciones por paso
- useDeckWizardDraft: persistence, expiry, restore
- CreateSession: flujo simplificado

# Integration tests
- Crear mazo completo → verificar en backend
- Editar mazo → verificar cambios persistidos
- Crear sesión con mazo → verificar referencias
```

## Mejoras Futuras

1. **T-044**: Implementar Web Serial API para RFID real
2. **T-052**: Soporte prefers-reduced-motion
3. **Drag & Drop**: Reordenar cartas en el mazo
4. **Duplicar Mazo**: Crear copia de un mazo existente
5. **Plantillas**: Mazos predefinidos por contexto
6. **Estadísticas**: Uso de mazos en sesiones

## Archivos Relacionados

### Frontend
- `src/pages/CardDecksPage.jsx`
- `src/pages/DeckCreationWizard.jsx`
- `src/pages/DeckEditPage.jsx`
- `src/pages/CreateSession.jsx` (modificado)
- `src/components/ui/WizardStepper.jsx`
- `src/components/ui/DeckCard.jsx`
- `src/components/ui/AssetSelector.jsx`
- `src/components/ui/RFIDScannerPanel.jsx`
- `src/components/ui/CardSelector.jsx`
- `src/hooks/useDeckWizardDraft.js`
- `src/services/api.js` (decksAPI añadido)
- `src/constants/routes.js` (CARD_DECKS rutas)

### Backend
- `src/models/CardDeck.js`
- `src/controllers/cardDeckController.js` (límite 50)
- `src/routes/cardDeckRoutes.js`
