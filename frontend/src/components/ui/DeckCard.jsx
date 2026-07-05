/**
 * @fileoverview Componente DeckCard - Card visual premium para mostrar mazos de cartas
 * Incluye efecto 3D tilt, gradiente animado en borde, preview de assets con parallax,
 * y acciones hover con slide-up.
 * 
 * Optimizaciones de rendimiento:
 * - Animaciones reducidas cuando hay muchas cards (>15)
 * - Respeta prefers-reduced-motion del sistema
 * - will-change aplicado solo en hover
 * 
 * @module components/ui/DeckCard
 */

import { useState, useRef, useMemo, createContext, useContext } from 'react';
import { Link } from 'react-router-dom';
import { m as motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Edit2, Trash2, Eye, Calendar, CreditCard } from 'lucide-react';
import PropTypes from 'prop-types';
import { cn, formatDate } from '../../lib/utils';
import { ROUTES } from '../../constants/routes';
import { getContextTheme } from '../../lib/contextTheme';
import { getId } from '../../lib/entityId';

const MotionLink = motion.create(Link);
import { useSharedLayoutTransition } from '../../hooks/useSharedLayoutTransition';
import CardAssetPreview from './CardAssetPreview';
import InlineEditableText from './InlineEditableText';

const formatDeckDate = (dateString) => formatDate(dateString, 'short');

const deckContextShape = PropTypes.shape({
  name: PropTypes.string,
});

const displayDataShape = PropTypes.shape({
  display: PropTypes.string,
  emoji: PropTypes.string,
});

const cardMappingShape = PropTypes.shape({
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  displayData: displayDataShape,
});

const deckShape = PropTypes.shape({
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  context: deckContextShape,
  contextId: deckContextShape,
  createdAt: PropTypes.string,
  cardsCount: PropTypes.number,
  cardMappings: PropTypes.arrayOf(cardMappingShape),
});

const useDeckCardMotion = ({ reducedMotion }) => {
  const prefersReducedMotion = useMemo(() => {
    if (!globalThis.window?.matchMedia) {
      return false;
    }

    return globalThis.window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const useFullAnimations = !reducedMotion && !prefersReducedMotion;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springConfig = useFullAnimations
    ? { stiffness: 400, damping: 90 }
    : { stiffness: 200, damping: 50 };
  const mouseXSpring = useSpring(x, springConfig);
  const mouseYSpring = useSpring(y, springConfig);
  const rotationAmount = useFullAnimations ? 10 : 5;
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [`${rotationAmount}deg`, `-${rotationAmount}deg`]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [`-${rotationAmount}deg`, `${rotationAmount}deg`]);
  const parallaxAmount = useFullAnimations ? 10 : 4;
  const assetX = useTransform(mouseXSpring, [-0.5, 0.5], [parallaxAmount, -parallaxAmount]);
  const assetY = useTransform(mouseYSpring, [-0.5, 0.5], [parallaxAmount, -parallaxAmount]);

  return {
    x,
    y,
    useFullAnimations,
    rotateX,
    rotateY,
    assetX,
    assetY
  };
};

const useDeckCardInteraction = ({ reducedMotion, selectable, onSelect, deck }) => {
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef(null);
  const { x, y, useFullAnimations, rotateX, rotateY, assetX, assetY } = useDeckCardMotion({
    reducedMotion
  });

  const handlePointerMove = (event) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const xPos = (event.clientX - rect.left) / rect.width - 0.5;
    const yPos = (event.clientY - rect.top) / rect.height - 0.5;
    x.set(xPos);
    y.set(yPos);
    cardRef.current.style.setProperty('--mouse-x', `${event.clientX - rect.left}px`);
    cardRef.current.style.setProperty('--mouse-y', `${event.clientY - rect.top}px`);
  };

  const handlePointerLeave = () => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  };

  const handleClick = () => {
    if (selectable && onSelect) {
      onSelect(deck);
    }
  };

  const handleSelectableKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return {
    isHovered,
    setIsHovered,
    cardRef,
    useFullAnimations,
    rotateX,
    rotateY,
    assetX,
    assetY,
    handlePointerMove,
    handlePointerLeave,
    handleClick,
    handleSelectableKeyDown
  };
};

/**
 * DeckCard - Card visual premium para mazos
 * 
 * @param {Object} props
 * @param {Object} props.deck - Datos del mazo
 * @param {string} props.deck.id - ID del mazo
 * @param {string} props.deck.name - Nombre del mazo
 * @param {string} [props.deck.description] - Descripción del mazo
 * @param {Object} props.deck.context - Contexto asociado
 * @param {string} props.deck.context.name - Nombre del contexto
 * @param {Array} props.deck.cardMappings - Mapeos de tarjetas
 * @param {string} props.deck.createdAt - Fecha de creación
 * @param {Function} [props.onView] - Callback al ver detalles
 * @param {Function} [props.onEdit] - Callback al editar
 * @param {Function} [props.onDelete] - Callback al eliminar
 * @param {Function} [props.onSelect] - Callback al seleccionar (para wizard)
 * @param {boolean} [props.selectable=false] - Modo seleccionable
 * @param {boolean} [props.selected=false] - Estado seleccionado
 * @param {boolean} [props.reducedMotion=false] - Reducir animaciones para rendimiento
 * @param {string} [props.className] - Clases adicionales
 */
// Contexto interno de la card: el wrapper computa el estado completo
// (interacción, motion, menú, preview) y lo provee una sola vez; `DeckCardView`
// lo consume en vez de recibir 30 props enhebradas una a una. Los
// subcomponentes (Header, Preview, Stats, Actions) mantienen sus props enfocadas
// —cohesivas— alimentadas desde DeckCardView, así que su wiring no cambia.
const DeckCardContext = createContext(null);
const useDeckCard = () => useContext(DeckCardContext);

export default function DeckCard({
  deck,
  onView,
  onEdit,
  onDelete,
  onRename,
  onSelect,
  selectable = false,
  selected = false,
  reducedMotion = false,
  className,
}) {
  const {
    isHovered,
    setIsHovered,
    cardRef,
    useFullAnimations,
    rotateX,
    rotateY,
    assetX,
    assetY,
    handlePointerMove,
    handlePointerLeave,
    handleClick,
    handleSelectableKeyDown
  } = useDeckCardInteraction({
    reducedMotion,
    selectable,
    onSelect,
    deck
  });
  // T-954 Fase B: shared element transition al detalle. Sólo cuando el
  // mazo NO está en modo selectable (selección dentro del wizard) — en
  // ese flujo no hay navegación al detalle, así que no aplica el hero.
  const heroLayoutId = useSharedLayoutTransition(
    selectable ? null : 'deck',
    getId(deck)
  );

  // Preview de hasta 6 miniaturas. El conteo REAL de tarjetas debe salir de
  // `deck.cardsCount` (longitud completa que envía el DTO de listado), NO de
  // `cardMappings.length`: en el listado el backend trunca `cardMappings` a 6
  // para el preview, así que usar su longitud hacía que un mazo de memoria de
  // 12 tarjetas mostrara "6 tarjetas" en la card mientras el detalle mostraba
  // 12 (QA 2026-05-25). Fallback a `cardMappings.length` por si falta el campo.
  const previewAssets = deck.cardMappings?.slice(0, 6) || [];
  const cardsCount = deck.cardsCount ?? deck.cardMappings?.length ?? 0;
  const remainingCount = Math.max(cardsCount - previewAssets.length, 0);
  const showActions = !selectable;

  const contextValue = {
    cardRef,
    className,
    handlePointerMove,
    onPointerEnter: () => setIsHovered(true),
    handlePointerLeave,
    handleClick,
    selectable,
    deck,
    selected,
    handleSelectableKeyDown,
    isHovered,
    useFullAnimations,
    rotateX,
    rotateY,
    onView,
    onEdit,
    onDelete,
    onRename,
    previewAssets,
    remainingCount,
    assetX,
    assetY,
    cardsCount,
    showActions,
    heroLayoutId
  };

  return (
    <DeckCardContext.Provider value={contextValue}>
      <DeckCardView />
    </DeckCardContext.Provider>
  );
}

function DeckCardView() {
  const {
    cardRef,
    className,
    handlePointerMove,
    onPointerEnter,
    handlePointerLeave,
    handleClick,
    selectable,
    deck,
    selected,
    handleSelectableKeyDown,
    isHovered,
    useFullAnimations,
    rotateX,
    rotateY,
    onView,
    onEdit,
    onDelete,
    onRename,
    previewAssets,
    remainingCount,
    assetX,
    assetY,
    cardsCount,
    showActions,
    heroLayoutId
  } = useDeckCard();
  return (
    <motion.div
      ref={cardRef}
      // T-954 Fase B: layoutId compartido para hero transition al detalle.
      // Undefined cuando reduced-motion o cuando la card está en modo
      // selectable (wizard, sin navegación al detalle).
      layoutId={heroLayoutId}
      className={cn(
        'relative group cursor-pointer perspective-1000',
        className
      )}
      onPointerMove={handlePointerMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ z: 20 }}
      // Feedback táctil sutil al pulsar la card. Gateado con useFullAnimations
      // para respetar reduced-motion (sistema o prop). Coexiste sin problema
      // con whileHover/layoutId (gesto transitorio sobre scale).
      whileTap={useFullAnimations ? { scale: 0.99 } : undefined}
      transition={{ duration: 0.3 }}
      role={selectable ? 'button' : 'article'}
      aria-label={selectable ? `Seleccionar mazo ${deck.name}` : `Mazo ${deck.name}`}
      aria-selected={selectable ? selected : undefined}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? handleSelectableKeyDown : undefined}
    >
      {/* Stack effect: dos cartas fantasma detras reforzando la metafora "deck fisico".
          pointer-events:none para no interferir; aria-hidden porque son decorativas. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-2xl border border-border-subtle/60 bg-background-elevated/30 translate-x-1.5 translate-y-1.5 transition-transform duration-300 group-hover:translate-x-2.5 group-hover:translate-y-2.5"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-20 rounded-2xl border border-border-subtle/40 bg-background-elevated/15 translate-x-3 translate-y-3 transition-transform duration-300 group-hover:translate-x-5 group-hover:translate-y-5"
      />
      <motion.div
        className={cn(
          'relative rounded-2xl overflow-hidden',
          'bg-gradient-to-br from-background-base/90 to-background-elevated/90',
          'border border-border-default',
          'backdrop-blur-xl',
          'transition-shadow duration-300',
          // Sombra hover delegada al token --shadow-lg (variante por tema).
          // El ring se tinta con `--color-atmosphere-primary` (T-954): si hay
          // contexto activo (Geografía, Animales…) el ring hereda el tinte;
          // sin contexto el token apunta al brand y se mantiene el aspecto
          // anterior (T-951 Fase 1).
          isHovered && 'shadow-[var(--shadow-lg)] ring-1 ring-[color-mix(in_oklab,var(--color-atmosphere-primary)_30%,transparent)]',
          selected && 'ring-2 ring-brand-base ring-offset-2 ring-offset-background-deep',
          selectable && 'hover:ring-2 hover:ring-brand-base/50 focus-ring'
        )}
        style={{
          rotateX: useFullAnimations && isHovered ? rotateX : 0,
          rotateY: useFullAnimations && isHovered ? rotateY : 0,
          transformStyle: 'preserve-3d',
          willChange: isHovered ? 'transform' : 'auto',
        }}
      >
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'linear-gradient(90deg, var(--color-accent-indigo), var(--color-brand-base), var(--color-accent-pink), var(--color-accent-indigo))',
              backgroundSize: '300% 100%',
              animation: 'gradient-shift 3s ease infinite',
              padding: '1px',
              WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'xor',
              maskComposite: 'exclude',
            }}
          />
        </div>

        {/* pb-20 reserva 80px al fondo para que el overlay absoluto
            DeckHoverActions (Ver/Editar/Archivar) no tape DeckStats
            (`X tarjetas · fecha`). El overlay aparece encima sin solaparse
            con texto vivo (HF-2 QA 2026-05-09). */}
        <div className="relative p-5 pb-20 z-10">
          {/* Galería (rediseño 2026-06-04): el contenido del mazo —sus cartas
              reales— es el HÉROE visual de la card y va arriba como banda
              tematizada por contexto. El nombre/contexto/menú quedan debajo.
              Antes el contenido era una fila pequeña secundaria. */}
          <DeckPreviewAssets
            previewAssets={previewAssets}
            remainingCount={remainingCount}
            useFullAnimations={useFullAnimations}
            isHovered={isHovered}
            assetX={assetX}
            assetY={assetY}
            deck={deck}
          />

          <DeckCardHeader
            deck={deck}
            selectable={selectable}
            onRename={onRename}
          />

          {/* La descripción reserva siempre 2 líneas (min-h) aunque el mazo no
              tenga, para que todas las cards de la galería midan igual en una
              fila (antes las sin descripción quedaban 36px más bajas). QA 2026-06-04. */}
          <p
            className="text-text-muted text-sm mb-4 line-clamp-2 min-h-[2.5rem]"
            title={deck.description || undefined}
          >
            {deck.description}
          </p>

          <DeckStats cardsCount={cardsCount} createdAt={deck.createdAt} />

          <DeckSelectionBadge selectable={selectable} selected={selected} />
        </div>

        <motion.div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none"
          style={{
            background: 'radial-gradient(800px circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.1) 0%, transparent 40%)',
          }}
        />
      </motion.div>

      {/* Acciones fuera del div con rotación 3D para que no se desplacen con el tilt */}
      <DeckHoverActions
        selectable={selectable}
        showActions={showActions}
        deck={deck}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />

    </motion.div>
  );
}

// DeckCardView no recibe props (consume DeckCardContext), por eso no lleva
// propTypes. La validación de forma vive en los subcomponentes (Header, Preview…)
// y en DeckCard.propTypes.

// El antiguo menú kebab ("Opciones": Ver/Editar/Archivar) se eliminó — era
// redundante con los mismos botones de acción siempre visibles al pie de la
// card (dos caminos a dos centímetros para la misma acción = ruido).
function DeckCardHeader({
  deck,
  selectable,
  onRename,
}) {
  const contextRef = deck.context || deck.contextId;
  const theme = getContextTheme(contextRef?.slug || contextRef?.name);

  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      {/* Galería 2026-06-04: sin icono genérico — la banda de contenido (arriba)
          ES la identidad visual del mazo. El nombre se expande a lo ancho. */}
      <div className="min-w-0">
          {onRename && !selectable ? (
            <InlineEditableText
              value={deck.name}
              onSave={onRename}
              validate={(v) => {
                const trimmed = (v || '').trim();
                if (!trimmed) return 'El nombre no puede estar vacío.';
                if (trimmed.length > 80) return 'Máximo 80 caracteres.';
                return null;
              }}
              ariaLabel={`nombre del mazo ${deck.name}`}
              maxLength={80}
              className="block w-full"
              textClassName="font-bold text-text-primary text-lg leading-tight line-clamp-1 font-display truncate block"
              inputClassName="text-lg font-bold font-display w-full"
              as="h2"
            />
          ) : (
            // h2 alineado con el header de página (h1 "Mis Mazos"); usar h3
            // directamente bajo h1 viola WCAG 1.3.1 / Lighthouse heading-order
            // (auditoría 24/05/2026 — mismo motivo que en SessionsPage).
            <h2 className="font-semibold text-text-primary text-lg leading-tight line-clamp-1 font-display truncate" title={deck.name}>
              {deck.name}
            </h2>
          )}
          {(() => {
            // Cuando el nombre del mazo coincide con el contexto (mazo "monotemático",
            // ej. "Números del 1 al 6" sobre contexto "Números del 1 al 6"), repetir el
            // nombre del contexto produce duplicación visual ruidosa. Mostramos el
            // conteo de cartas como tagline alternativo para conservar densidad
            // informativa pero sin redundancia.
            const ctxName = contextRef?.name?.trim();
            const deckName = deck.name?.trim();
            const isDuplicate = ctxName && deckName && ctxName.toLowerCase() === deckName.toLowerCase();
            if (isDuplicate) {
              return (
                <span className={cn('text-xs font-medium truncate block', theme.textClass)}>
                  Mazo monotemático
                </span>
              );
            }
            return (
              <span className={cn('text-xs font-medium truncate block', theme.textClass)}>
                {ctxName || 'Sin contexto'}
              </span>
            );
          })()}
        </div>

    </div>
  );
}

DeckCardHeader.propTypes = {
  deck: deckShape.isRequired,
  selectable: PropTypes.bool.isRequired,
  onRename: PropTypes.func,
};

// Banda héroe de la galería (rediseño 2026-06-04): el contenido del mazo —sus
// cartas reales (imágenes/emojis)— ocupa una banda protagonista arriba de la
// card, tematizada por contexto. Antes era una fila pequeña de 40px en el medio.
const HERO_TILE_COUNT = 4;

function DeckPreviewAssets({
  previewAssets,
  remainingCount,
  useFullAnimations,
  isHovered,
  assetX,
  assetY,
  deck,
}) {
  const contextRef = deck?.context || deck?.contextId;
  const theme = getContextTheme(contextRef?.slug || contextRef?.name);
  const tiles = previewAssets.slice(0, HERO_TILE_COUNT);
  // Cartas no mostradas como tile: las que quedan del preview + las truncadas
  // por el backend (remainingCount). Acotado a >= 0.
  const hidden = Math.max(0, remainingCount + Math.max(0, previewAssets.length - HERO_TILE_COUNT));

  return (
    <div
      className={cn(
        'relative mb-4 overflow-hidden rounded-xl p-3 bg-background-elevated/50 ring-1 ring-inset',
        theme.ringClass
      )}
    >
      {/* Glow tenue del tono del contexto: identidad sin tapar el contenido */}
      <div
        className={cn('pointer-events-none absolute -top-10 -right-10 size-24 rounded-full blur-2xl opacity-20', theme.glowClass)}
        aria-hidden="true"
      />
      <motion.div
        className="relative flex items-center gap-2"
        style={{
          x: useFullAnimations && isHovered ? assetX : 0,
          y: useFullAnimations && isHovered ? assetY : 0,
        }}
      >
        {tiles.map((mapping, index) => {
          const label = mapping.displayData?.display || mapping.displayData?.emoji || '?';
          const hasImage = Boolean(mapping.displayData?.thumbnailUrl || mapping.displayData?.imageUrl);
          // Fallback a iniciales (1-2 chars) cuando no hay imagen; emoji tal cual.
          const initials = (() => {
            if (!label || label === '?') return label;
            const isEmoji = /\p{Emoji}/u.test(label);
            if (isEmoji) return label;
            const words = label.trim().split(/\s+/);
            if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
            return label.slice(0, 2).toUpperCase();
          })();
          return (
            <motion.div
              key={mapping._id || index}
              className="size-12 rounded-xl border border-white/10 flex items-center justify-center text-2xl overflow-hidden shadow-[var(--shadow-inset-card)] ring-1 ring-black/5 flex-shrink-0"
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
              title={label}
              style={{
                transform: `translateZ(${(index + 1) * 12}px)`,
                // Fondo con dominantColor del asset para continuidad visual
                backgroundColor: mapping.displayData?.dominantColor || 'var(--color-background-elevated)',
              }}
            >
              <CardAssetPreview
                asset={mapping.displayData}
                className="w-full h-full rounded-xl"
                showSkeleton={false}
                fallbackLabel={initials}
                fallbackClassName={!hasImage ? 'p-0.5 text-white/90 font-bold' : undefined}
              />
            </motion.div>
          );
        })}
        {hidden > 0 && (
          <motion.div
            className="size-12 rounded-xl bg-background-base/60 border border-border-default flex items-center justify-center text-sm font-bold text-text-secondary flex-shrink-0"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            +{hidden}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

DeckPreviewAssets.propTypes = {
  previewAssets: PropTypes.arrayOf(cardMappingShape).isRequired,
  remainingCount: PropTypes.number.isRequired,
  useFullAnimations: PropTypes.bool.isRequired,
  isHovered: PropTypes.bool.isRequired,
  assetX: PropTypes.oneOfType([PropTypes.number, PropTypes.object]).isRequired,
  assetY: PropTypes.oneOfType([PropTypes.number, PropTypes.object]).isRequired,
  deck: deckShape,
};

function DeckStats({ cardsCount, createdAt }) {
  return (
    <div className="flex items-center gap-4 text-xs text-text-muted">
      <div className="flex items-center gap-1.5">
        <CreditCard size={14} />
        <span>{cardsCount} tarjetas</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Calendar size={14} />
        <span>{formatDeckDate(createdAt)}</span>
      </div>
    </div>
  );
}

DeckStats.propTypes = {
  cardsCount: PropTypes.number.isRequired,
  createdAt: PropTypes.string,
};

function DeckHoverActions({ selectable, showActions, deck, onView, onEdit, onDelete }) {
  if (selectable) {
    return null;
  }

  const deckId = getId(deck);

  return (
    <motion.div
      className={cn(
        'absolute bottom-0 left-0 right-0 p-4 pt-8 rounded-b-2xl bg-gradient-to-t from-background-base via-background-base/95 to-transparent z-30',
        showActions ? 'pointer-events-auto' : 'pointer-events-none'
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: showActions ? 1 : 0,
        y: showActions ? 0 : 20
      }}
      transition={{ duration: 0.2 }}
      onPointerMove={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-center gap-2">
        {/* "Ver"/"Editar" son navegación → `<Link>` (no `<button>`): permite
            Ctrl/Cmd+clic para abrir en pestaña nueva, clic central, y los
            screen readers los anuncian como enlaces (auditoría 24/05/2026).
            `onClick` se conserva como hook opcional para el padre, pero la
            navegación la realiza el href. "Archivar" sigue `<button>` porque
            abre un modal, no navega. */}
        <ActionButton
          icon={Eye}
          label="Ver"
          href={deckId ? ROUTES.CARD_DECKS_DETAIL(deckId) : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onView?.(deck);
          }}
        />
        <ActionButton
          icon={Edit2}
          label="Editar"
          href={deckId ? ROUTES.CARD_DECKS_EDIT(deckId) : undefined}
          onClick={(event) => {
            event.stopPropagation();
            onEdit?.(deck);
          }}
        />
        <ActionButton
          icon={Trash2}
          label="Archivar"
          variant="subtle"
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(deck);
          }}
        />
      </div>
    </motion.div>
  );
}

DeckHoverActions.propTypes = {
  selectable: PropTypes.bool.isRequired,
  showActions: PropTypes.bool.isRequired,
  deck: deckShape.isRequired,
  onView: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
};

function DeckSelectionBadge({ selectable, selected }) {
  if (!selectable || !selected) {
    return null;
  }

  return (
    <motion.div
      className="absolute top-3 right-3 size-6 rounded-full bg-accent-indigo flex items-center justify-center"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: 'spring', stiffness: 500 }}
    >
      <svg className="size-4 text-text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    </motion.div>
  );
}

DeckSelectionBadge.propTypes = {
  selectable: PropTypes.bool.isRequired,
  selected: PropTypes.bool.isRequired,
};

/**
 * ActionButton - Acción para las cards. Renderiza `<Link>` si recibe `href`
 * (navegación: permite Ctrl+clic / pestaña nueva / semántica de enlace para
 * screen readers), o `<button>` si solo recibe `onClick` (acciones que no
 * navegan, p. ej. abrir un modal de archivar).
 */
function ActionButton({ icon: Icon, label, onClick, href, variant = 'default' }) {
  const sharedClassName = cn(
    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
    variant === 'default' && 'bg-border-default text-text-primary hover:bg-border-strong',
    // 'subtle' (Archivar): reposo neutro tipo ghost; warning solo en hover.
    // Antes "Archivar" pintaba en warning sólido (ring + bg) en reposo y se
    // confundía con destructive — pero archivar es reversible (no borra el
    // mazo). El reposo neutro comunica la naturaleza menos drástica de la
    // acción y deja warning para "casi destructivo" (QA 2026-05-07).
    variant === 'subtle' && 'bg-background-surface/40 text-text-secondary hover:bg-warning-base/15 hover:text-warning-base',
    variant === 'warning' && 'bg-warning-base/15 text-warning-base hover:bg-warning-base/25 ring-1 ring-inset ring-warning-base/20',
    variant === 'danger' && 'bg-error-base/20 text-error-base hover:bg-error-base/30'
  );

  if (href) {
    return (
      <MotionLink
        to={href}
        className={sharedClassName}
        onClick={onClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={label}
      >
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
      </MotionLink>
    );
  }

  return (
    <motion.button
      className={sharedClassName}
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={label}
    >
      <Icon size={14} aria-hidden="true" />
      <span>{label}</span>
    </motion.button>
  );
}

ActionButton.propTypes = {
  icon: PropTypes.elementType.isRequired,
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  href: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'subtle', 'warning', 'danger']),
};

DeckCard.propTypes = {
  deck: deckShape.isRequired,
  onView: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  onRename: PropTypes.func,
  onSelect: PropTypes.func,
  selectable: PropTypes.bool,
  selected: PropTypes.bool,
  reducedMotion: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * DeckCardSkeleton - Skeleton loading para DeckCard
 */
export function DeckCardSkeleton() {
  return (
    <div className="relative rounded-2xl overflow-hidden bg-background-base/50 border border-border-subtle p-5 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-xl bg-background-elevated" />
          <div className="space-y-2">
            <div className="w-32 h-5 bg-background-elevated rounded" />
            <div className="w-20 h-3 bg-background-elevated rounded" />
          </div>
        </div>
      </div>
      <div className="w-full h-4 bg-background-elevated rounded mb-4" />
      <div className="flex gap-2 mb-4">
        {[1, 2, 3, 4].map((slot) => (
          <div key={`deck-card-skeleton-${slot}`} className="size-10 rounded-lg bg-background-elevated" />
        ))}
      </div>
      <div className="flex gap-4">
        <div className="w-20 h-3 bg-background-elevated rounded" />
        <div className="w-24 h-3 bg-background-elevated rounded" />
      </div>
    </div>
  );
}
