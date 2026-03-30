/**
 * @fileoverview Página de detalle de mazo de cartas.
 * Muestra información del mazo y permite navegar a edición.
 *
 * @module pages/CardDeckDetailPage
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Pencil, Layers, CreditCard, Calendar, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { decksAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import ButtonPremium from '../components/ui/ButtonPremium';
import CardAssetPreview from '../components/ui/CardAssetPreview';
import AudioPlayBadge from '../components/ui/AudioPlayBadge';
import EmptyState from '../components/ui/EmptyState';
import GlassCard from '../components/ui/GlassCard';
import { SkeletonCard } from '../components/ui/SkeletonShimmer';
import StatusBadge from '../components/ui/StatusBadge';
import Breadcrumb from '../components/ui/Breadcrumb';
import { pageVariants, formatDate } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';

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
    return { uid, label, assetLabel: 'Sin asset asignado', displayData: null };
  }

  if (displayData) {
    return { uid, label, assetLabel: displayData.value || displayData.display || 'Asset', displayData };
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
    'Asset asignado';

  return { uid, label, assetLabel: displayAsset, displayData: asset.displayData || null };
}

export default function CardDeckDetailPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();

  const [deck, setDeck] = useState(null);
  const [loading, setLoading] = useState(true);

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
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setDeck(null);
      toast.error('No se pudo cargar el mazo', {
        description: extractErrorMessage(error),
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
  const currentDeckId = deck?.id || deck?._id;

  if (loading && !deck) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <SkeletonCard className="h-28" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-2 h-64" />
          <SkeletonCard className="h-64" />
        </div>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <EmptyState
          title="Mazo no encontrado"
          description="El mazo solicitado no existe o no está disponible."
          icon={<Layers size={28} />}
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
      className="p-6 lg:p-8 max-w-6xl mx-auto"
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
            <ButtonPremium
              variant="secondary"
              onClick={() => currentDeckId && navigate(ROUTES.CARD_DECKS_EDIT(currentDeckId))}
            >
              <Pencil size={16} />
              Editar mazo
            </ButtonPremium>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <GlassCard className="p-6 lg:col-span-2 space-y-5">
            <h2 className="text-lg font-semibold text-text-primary">Información general</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-text-secondary">Descripción</h3>
              <div className="rounded-xl border border-border-default bg-background-elevated/30 px-4 py-3 text-sm text-text-secondary">
                {deck.description?.trim() || 'Sin descripción'}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-text-primary">Resumen</h2>
            <div className="divide-y divide-border-subtle">
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted">Nombre</span>
                <span className="text-sm text-text-primary font-medium">{deck.name || '—'}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted">Contexto</span>
                <span className="text-sm text-text-primary font-medium">{contextName}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted">Estado</span>
                <span className="text-sm text-text-primary font-medium">{statusLabel}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted">Creado</span>
                <span className="text-sm text-text-primary font-medium">{formatDeckDate(deck.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-text-muted">Actualizado</span>
                <span className="text-sm text-text-primary font-medium">{formatDeckDate(deck.updatedAt)}</span>
              </div>
            </div>
          </GlassCard>
        </div>

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
                      <p className="text-xs text-text-muted">UID: {uid}</p>
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
                      <p className="text-sm text-accent-indigo">{assetLabel}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>
    </motion.div>
  );
}
