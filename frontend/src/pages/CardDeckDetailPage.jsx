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
import { ButtonPremium, EmptyState, GlassCard, SkeletonCard, StatusBadge } from '../components/ui';
import { pageVariants } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks';

function isDeckArchived(deck) {
  if (!deck) return false;
  if (deck.status) return deck.status === 'archived';
  if (typeof deck.isActive === 'boolean') return !deck.isActive;
  return Boolean(deck.archivedAt);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getContextName(deck) {
  if (!deck) return 'Sin contexto';
  return deck.contextId?.name || deck.context?.name || 'Sin contexto';
}

function getDeckCards(deck) {
  if (!deck || !Array.isArray(deck.cards)) return [];
  return deck.cards;
}

function getCardInfo(deckCard, index) {
  const card = deckCard?.cardId && typeof deckCard.cardId === 'object' ? deckCard.cardId : null;
  const uid = card?.uid || 'Sin UID';
  const label = card?.displayName || card?.name || `Tarjeta ${index + 1}`;
  const asset = deckCard?.assignedAsset;

  if (!asset) {
    return { uid, label, assetLabel: 'Sin asset asignado' };
  }

  if (typeof asset === 'string') {
    return { uid, label, assetLabel: asset };
  }

  const displayAsset =
    asset.displayData?.display ||
    asset.displayData?.emoji ||
    asset.displayData?.text ||
    asset.name ||
    asset.label ||
    asset._id ||
    'Asset asignado';

  return { uid, label, assetLabel: displayAsset };
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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ButtonPremium variant="ghost" onClick={() => navigate(ROUTES.CARD_DECKS)}>
              <ArrowLeft size={16} />
              Volver
            </ButtonPremium>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">{deck.name || 'Mazo de cartas'}</h1>
              <p className="text-slate-400">{contextName}</p>
            </div>
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
            <h2 className="text-lg font-semibold text-white">Información general</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <CreditCard size={16} />
                  Tarjetas
                </div>
                <p className="text-white text-xl font-semibold mt-2">{cards.length}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Calendar size={16} />
                  Creado
                </div>
                <p className="text-white text-xl font-semibold mt-2">{formatDate(deck.createdAt)}</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-400">
                  <Archive size={16} />
                  Estado
                </div>
                <p className="text-white text-xl font-semibold mt-2">{statusLabel}</p>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-300">Descripción</h3>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {deck.description?.trim() || 'Sin descripción'}
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Resumen</h2>
            <div className="text-sm text-slate-400 space-y-2">
              <p>Nombre: <span className="text-white">{deck.name || '—'}</span></p>
              <p>Contexto: <span className="text-white">{contextName}</span></p>
              <p>Estado: <span className="text-white">{statusLabel}</span></p>
              <p>Creado: <span className="text-white">{formatDate(deck.createdAt)}</span></p>
              <p>Actualizado: <span className="text-white">{formatDate(deck.updatedAt)}</span></p>
            </div>
          </GlassCard>
        </div>

        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Tarjetas del mazo</h2>

          {cards.length === 0 ? (
            <EmptyState
              title="Sin tarjetas asignadas"
              description="Este mazo todavía no tiene tarjetas vinculadas."
              icon={<Layers size={24} />}
              className="bg-transparent border border-white/5"
            />
          ) : (
            <div className="space-y-3">
              {cards.map((deckCard, index) => {
                const { uid, label, assetLabel } = getCardInfo(deckCard, index);
                const key = deckCard?._id || `${uid}-${index}`;

                return (
                  <div
                    key={key}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                  >
                    <div>
                      <p className="text-white font-medium">{label}</p>
                      <p className="text-xs text-slate-400">UID: {uid}</p>
                    </div>
                    <p className="text-sm text-indigo-300">{assetLabel}</p>
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
