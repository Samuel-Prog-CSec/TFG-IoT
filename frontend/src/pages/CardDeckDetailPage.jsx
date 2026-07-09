/**
 * @fileoverview Página de detalle de mazo de cartas.
 * Muestra información del mazo y permite navegar a edición.
 *
 * @module pages/CardDeckDetailPage
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import { ArrowLeft, Pencil, Printer, Layers, CreditCard, Calendar, Archive, Lock } from 'lucide-react';
import { decksAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import { getId } from '../lib/entityId';
import { consumePrintHint } from '../lib/printHint';
import ButtonPremium from '../components/ui/ButtonPremium';
import PrintDeckModal from '../components/print/PrintDeckModal';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import GlassCard from '../components/ui/GlassCard';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import StatusBadge from '../components/ui/StatusBadge';
import Breadcrumb from '../components/ui/Breadcrumb';
import { pageVariants, formatDate } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSharedLayoutTransition } from '../hooks/useSharedLayoutTransition';

function isDeckArchived(deck) {
  if (!deck) return false;
  if (deck.status) return deck.status === 'archived';
  if (typeof deck.isActive === 'boolean') return !deck.isActive;
  return Boolean(deck.archivedAt);
}

/**
 * Wrapper local que mantiene el guard de valores nulos/inválidos
 * y delega al formatDate centralizado.
 */
function formatDeckDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDate(date);
}

function getContextName(deck) {
  if (!deck) return 'Sin contexto';
  return deck.contextId?.name || deck.context?.name || 'Sin contexto';
}

function getDeckCards(deck) {
  if (!deck) return [];
  // Preferir cardMappings (estructura moderna) sobre cards
  if (Array.isArray(deck.cardMappings) && deck.cardMappings.length > 0) return deck.cardMappings;
  if (Array.isArray(deck.cards)) return deck.cards;
  return [];
}

function getCardInfo(deckCard, index) {
  const uid = deckCard?.uid || 'Sin UID';
  const label = deckCard?.assignedValue || `Tarjeta ${index + 1}`;

  // Estructura moderna: displayData en deckCard.displayData o deckCard.assignedAsset?.displayData
  const displayData = deckCard?.displayData || deckCard?.assignedAsset?.displayData || null;
  const asset = deckCard?.assignedAsset;

  if (!asset && !displayData) {
    return { uid, label, assetLabel: 'Sin recurso asignado', displayData: null };
  }

  if (displayData) {
    return { uid, label, assetLabel: displayData.value || displayData.display || 'Recurso', displayData };
  }

  if (typeof asset === 'string') {
    return { uid, label, assetLabel: asset, displayData: null };
  }

  const displayAsset =
    asset.displayData?.display ||
    asset.displayData?.emoji ||
    asset.displayData?.text ||
    asset.name ||
    asset.label ||
    asset._id ||
    'Recurso asignado';

  return { uid, label, assetLabel: displayAsset, displayData: asset.displayData || null };
}

export default function CardDeckDetailPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Detalle del Mazo');
  // T-954 Fase B: receptor del shared layout id emitido por DeckCard.
  const heroLayoutId = useSharedLayoutTransition('deck', deckId);

  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);
  // (D2) 404 real (mazo inexistente) vs fallo de red/servidor (reintentable).
  const [error, setError] = useState(null);

  const loadDeck = useCallback(async (signal) => {
    if (!deckId) {
      setDeck(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const response = await decksAPI.getDeckById(deckId, signal ? { signal } : {});
      const deckData = extractData(response);
      setDeck(deckData || null);
      setError(null);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }

      setDeck(null);
      setError({
        isNotFound: err?.response?.status === 404,
        isForbidden: err?.response?.status === 403,
        message: extractErrorMessage(err)
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [deckId]);

  useEffect(() => {
    const controller = new AbortController();
    loadDeck(controller.signal);
    return () => controller.abort();
  }, [loadDeck]);

  useRefetchOnFocus({
    refetch: () => loadDeck(),
    isLoading: loading,
    hasData: Boolean(deck),
  });

  const cards = useMemo(() => getDeckCards(deck), [deck]);
  const archived = isDeckArchived(deck);
  const statusLabel = archived ? 'Archivado' : 'Activo';
  const contextName = getContextName(deck);
  const currentDeckId = getId(deck);

  const [printOpen, setPrintOpen] = useState(false);
  const [highlightPrint, setHighlightPrint] = useState(false);

  // Parte "Ambos": si venimos de crear/editar el mazo, resaltar el botón de
  // imprimir la primera vez que se abre su detalle.
  useEffect(() => {
    if (!currentDeckId || !consumePrintHint(currentDeckId)) {
      return undefined;
    }
    setHighlightPrint(true);
    const timer = setTimeout(() => setHighlightPrint(false), 4500);
    return () => clearTimeout(timer);
  }, [currentDeckId]);

  if (loading && !deck) {
    return (
      <div className="page-container py-[var(--space-fluid-section)] space-y-6">
        <SkeletonCard className="h-28" />
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-[var(--space-fluid-gutter)]">
          <SkeletonCard className="lg:col-span-2 h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    );
  }

  if (!deck) {
    // Error transitorio real (red/servidor) → ErrorState con reintento.
    if (error && !error.isNotFound && !error.isForbidden) {
      return (
        <div className="page-container py-[var(--space-fluid-section)]">
          <ErrorState
            title="No pudimos cargar el mazo"
            message={error.message || 'Hubo un problema al cargar el mazo. Inténtalo de nuevo.'}
            onRetry={() => loadDeck()}
          />
        </div>
      );
    }
    // 403 (sin permiso) y 404 (no existe) comparten el patrón "vuelve": estado
    // calmado con acción de salida y SIN reintento (reintentar no cambia el
    // resultado). El icono y el texto distinguen ambos casos.
    const forbidden = Boolean(error?.isForbidden);
    return (
      <div className="page-container py-[var(--space-fluid-section)]">
        <EmptyState
          title={forbidden ? 'Sin acceso' : 'Mazo no encontrado'}
          description={
            forbidden
              ? 'No tienes permiso para ver este mazo. Solo puedes acceder a los mazos que has creado.'
              : 'El mazo solicitado no existe o no está disponible.'
          }
          icon={forbidden ? <Lock size={28} /> : <Layers size={28} />}
          action={(
            <ButtonPremium variant="secondary" onClick={() => navigate(ROUTES.CARD_DECKS)}>
              <ArrowLeft size={16} />
              Volver a mazos
            </ButtonPremium>
          )}
        />
      </div>
    );
  }

  return (
    <motion.div
      // El hero transition aterriza en el motion.div principal de la
      // página: cuando DeckCard pulsa, su layoutId hace que Framer
      // anime el rectángulo de la card hasta el contenedor del detalle.
      layoutId={heroLayoutId}
      className="page-container py-[var(--space-fluid-section)]"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[
          { label: 'Mazos', to: ROUTES.CARD_DECKS },
          { label: deck.name || 'Mazo de cartas' },
        ]} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary font-display">{deck.name || 'Mazo de cartas'}</h1>
            <p className="text-text-muted">{contextName}</p>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge status={archived ? 'inactive' : 'active'} pulse={!archived}>
              {statusLabel}
            </StatusBadge>
            <div className="relative">
              {highlightPrint && (
                <motion.span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1 rounded-2xl ring-2 ring-brand-base"
                  initial={{ opacity: 0.7, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.12 }}
                  transition={{ duration: 1.1, repeat: 3, ease: 'easeOut' }}
                />
              )}
              <ButtonPremium variant="primary" onClick={() => setPrintOpen(true)}>
                <Printer size={16} />
                Imprimir cartas
              </ButtonPremium>
            </div>
            <ButtonPremium
              variant="secondary"
              onClick={() => currentDeckId && navigate(ROUTES.CARD_DECKS_EDIT(currentDeckId))}
            >
              <Pencil size={16} />
              Editar mazo
            </ButtonPremium>
          </div>
        </header>

        {/* Unificado en un solo panel: antes había "Información general" (4
            tiles) + "Resumen" (tabla key-value) que duplicaban Tarjetas/Creado/
            Estado/Contexto. Dejamos los 4 KPIs en tiles grandes + sección de
            metadatos (contexto, actualizado) sin repetir info. QA 22/04/2026. */}
        <GlassCard className="p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-lg font-semibold text-text-primary">Información general</h2>
            <span className="text-xs text-text-muted">
              Actualizado {formatDeckDate(deck.updatedAt)}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-[var(--space-fluid-gutter)]">
            <div className="bg-accent-indigo/10 rounded-xl p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <CreditCard size={16} className="text-accent-indigo" />
                Tarjetas
              </div>
              <p className="text-text-primary text-xl font-semibold font-display mt-2">{cards.length}</p>
            </div>
            <div className="bg-warning-base/10 rounded-xl p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <Calendar size={16} className="text-warning-base" />
                Creado
              </div>
              <p className="text-text-primary text-xl font-semibold font-display mt-2">{formatDeckDate(deck.createdAt)}</p>
            </div>
            <div className="bg-success-base/10 rounded-xl p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <Archive size={16} className="text-success-base" />
                Estado
              </div>
              <p className="text-text-primary text-xl font-semibold font-display mt-2">{statusLabel}</p>
            </div>
            <div className="bg-brand-base/10 rounded-xl p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <Layers size={16} className="text-brand-light" />
                Contexto
              </div>
              <p className="text-text-primary text-xl font-semibold font-display mt-2 truncate" title={contextName}>
                {contextName}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-text-secondary">Descripción</h3>
            <div className="rounded-xl border border-border-default bg-background-elevated/30 px-4 py-3 text-sm text-text-secondary">
              {deck.description?.trim() || 'Sin descripción'}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Tarjetas del mazo</h2>

          {cards.length === 0 ? (
            <EmptyState
              title="Sin tarjetas asignadas"
              description="Este mazo todavía no tiene tarjetas vinculadas."
              icon={<Layers size={24} />}
              className="bg-transparent border border-border-subtle"
            />
          ) : (
            <div className="space-y-3">
              {cards.map((deckCard, index) => {
                const { uid, label, assetLabel, displayData } = getCardInfo(deckCard, index);
                const key = deckCard?._id || `${uid}-${index}`;

                return (
                  <div
                    key={key}
                    className="rounded-xl border border-border-default bg-background-elevated/30 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                  >
                    <div>
                      <p className="text-text-primary font-medium">{label}</p>
                      {/* "Chip" en vez de "UID": mismo dato, sin jerga técnica
                          en una vista de solo lectura para docentes. */}
                      <p className="text-xs text-text-muted">Chip: {uid}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {displayData ? (
                        <div className="relative flex-shrink-0">
                          <CardAssetPreview
                            asset={displayData}
                            className="size-14 rounded-lg"
                          />
                          {displayData.audioUrl && (
                            <AudioPlayBadge
                              audioUrl={displayData.audioUrl}
                              size="xs"
                              className="absolute -top-1 -right-1"
                            />
                          )}
                        </div>
                      ) : null}
                      {/* assetLabel solo se muestra cuando no repite el label principal
                          (ej: cuando el label es genérico "Tarjeta 1" y el assetLabel
                          aporta el nombre real). Evita triple nombre en cards como
                          banderas donde label=`España`, assetLabel=`España` (QA 22/04/2026). */}
                      {assetLabel && assetLabel !== label && (
                        <p className="text-sm text-accent-indigo">{assetLabel}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      <PrintDeckModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        deckId={currentDeckId}
        deckName={deck.name || 'Mazo'}
        cards={cards}
      />
    </motion.div>
  );
}
