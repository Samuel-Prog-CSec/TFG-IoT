/**
 * @fileoverview Edición de sesión de juego (configuración).
 * Permite ajustar reglas y cambiar el mazo antes de iniciar.
 *
 * @module pages/SessionEdit
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m as motion } from 'framer-motion';
import { Save, Map as MapIcon, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, decksAPI, extractData, extractErrorMessage, isAbortError } from '../services/api';
import { ROUTES } from '../constants/routes';
import { getId, findById } from '../lib/entityId';
import ButtonPremium from '../components/ui/ButtonPremium';
import GlassCard from '../components/ui/GlassCard';
import InputPremium from '../components/ui/InputPremium';
import SelectPremium from '../components/ui/SelectPremium';
import StatusBadge from '../components/ui/StatusBadge';
import Breadcrumb from '../components/ui/Breadcrumb';
import InlineSuccessBadge from '../components/ui/InlineSuccessBadge';
import { pageVariants } from '../lib/utils';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import useInlineSuccess from '../hooks/useInlineSuccess';
import ConfirmationModal from '../components/ui/ConfirmationModal';

const statusToBadge = (status) => {
  switch (status) {
    case 'created':
      return { tone: 'warning', label: 'Borrador' };
    case 'active':
      return { tone: 'active', label: 'Activa' };
    case 'completed':
      return { tone: 'success', label: 'Completada' };
    default:
      return { tone: 'info', label: 'Sin estado' };
  }
};

const normalizeMechanicName = value => (value || '').toString().trim().toLowerCase();

const toDeckCards = mappings =>
  Array.isArray(mappings)
    ? mappings.map(mapping => ({
        uid: mapping.uid,
        assignedValue: mapping.assignedValue,
        displayData: mapping.displayData || {}
      }))
    : [];

const buildAssociationPlanByRounds = ({ currentPlan, cards, numberOfRounds }) => {
  const safeCards = Array.isArray(cards) ? cards : [];
  const rounds = Number(numberOfRounds);

  if (safeCards.length === 0 || !Number.isFinite(rounds) || rounds < 1) {
    return [];
  }

  const cardByUid = new Map(safeCards.map(card => [card.uid, card]));
  const previousByRound = new Map(
    (Array.isArray(currentPlan) ? currentPlan : []).map(item => [Number(item.roundNumber), item])
  );

  return Array.from({ length: rounds }, (_, index) => {
    const roundNumber = index + 1;
    const previousItem = previousByRound.get(roundNumber);
    const preservedCard = previousItem?.uid ? cardByUid.get(previousItem.uid) : null;
    const card = preservedCard || safeCards[index % safeCards.length];

    return {
      roundNumber,
      uid: card.uid,
      assignedValue: card.assignedValue,
      displayData: card.displayData || {},
      promptText: previousItem?.promptText || ''
    };
  });
};

export default function SessionEdit() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  useDocumentTitle('Editar Sesión');
  // Inline success badge: aparece junto al botón Guardar y queda visible
  // 1.2s antes de navegar al detalle de la sesión. T-955.
  const saveBadge = useInlineSuccess();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decks, setDecks] = useState([]);

  const [deckId, setDeckId] = useState('');
  const [numberOfRounds, setNumberOfRounds] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [pointsPerCorrect, setPointsPerCorrect] = useState('');
  const [penaltyPerError, setPenaltyPerError] = useState('');
  const [associationChallengePlan, setAssociationChallengePlan] = useState([]);

  // Snapshot of initial values for dirty detection
  const initialValuesRef = useRef(null);

  const isDirty = useMemo(() => {
    if (!initialValuesRef.current) return false;
    const current = JSON.stringify({ deckId, numberOfRounds, timeLimit, pointsPerCorrect, penaltyPerError });
    return current !== initialValuesRef.current;
  }, [deckId, numberOfRounds, timeLimit, pointsPerCorrect, penaltyPerError]);

  // T-957: confirmExit envuelve callbacks de navegación programática
  // (botones "Cancelar", "Ver mapping", "Configurar tablero") con un
  // modal warning cuando hay cambios sin guardar.
  const { confirmExit, confirmExitModalProps } = useUnsavedChanges(isDirty);

  const loadSession = useCallback(async (signal) => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const response = await sessionsAPI.getSessionById(sessionId, signal ? { signal } : {});
      const data = extractData(response);
      setSession(data);
      setDeckId(data.deckId || data.deck?.id || '');
      setNumberOfRounds(String(data.config?.numberOfRounds ?? ''));
      setTimeLimit(String(data.config?.timeLimit ?? ''));
      setPointsPerCorrect(String(data.config?.pointsPerCorrect ?? ''));
      setPenaltyPerError(String(data.config?.penaltyPerError ?? ''));
      setAssociationChallengePlan(Array.isArray(data.associationChallengePlan) ? data.associationChallengePlan : []);

      // Store initial snapshot for dirty detection
      initialValuesRef.current = JSON.stringify({
        deckId: data.deckId || data.deck?.id || '',
        numberOfRounds: String(data.config?.numberOfRounds ?? ''),
        timeLimit: String(data.config?.timeLimit ?? ''),
        pointsPerCorrect: String(data.config?.pointsPerCorrect ?? ''),
        penaltyPerError: String(data.config?.penaltyPerError ?? '')
      });
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      toast.error('No se pudo cargar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [sessionId]);

  const loadDecks = useCallback(async (signal) => {
    try {
      const response = await decksAPI.getDecks({ status: 'active', limit: 100 }, signal ? { signal } : {});
      const data = response.data?.data || [];
      setDecks(Array.isArray(data) ? data : []);
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      toast.error('No se pudieron cargar los mazos', {
        description: extractErrorMessage(err)
      });
    }
  }, []);

  useEffect(() => {
    const sessionController = new AbortController();
    const decksController = new AbortController();

    loadSession(sessionController.signal);
    loadDecks(decksController.signal);

    return () => {
      sessionController.abort();
      decksController.abort();
    };
  }, [loadSession, loadDecks]);

  const refetchAll = useCallback(() => {
    const sessionController = new AbortController();
    const decksController = new AbortController();

    loadSession(sessionController.signal);
    loadDecks(decksController.signal);

    return () => {
      sessionController.abort();
      decksController.abort();
    };
  }, [loadSession, loadDecks]);

  useRefetchOnFocus({
    refetch: refetchAll,
    isLoading: loading,
    hasData: Boolean(session)
  });

  const deckOptions = useMemo(() => decks.map((deck) => ({
    value: getId(deck),
    label: deck.name
  })), [decks]);

  const selectedDeckFromCatalog = useMemo(
    () => findById(decks, deckId) || null,
    [decks, deckId]
  );

  const associationCards = useMemo(() => {
    const cardsFromSelectedDeck = toDeckCards(selectedDeckFromCatalog?.cardMappings);
    if (cardsFromSelectedDeck.length > 0) {
      return cardsFromSelectedDeck;
    }

    return toDeckCards(session?.cardMappings);
  }, [selectedDeckFromCatalog, session]);

  const statusInfo = statusToBadge(session?.status);
  const canEdit = session?.status === 'created';
  const isAssociationSession = normalizeMechanicName(session?.mechanic?.name) === 'association';
  const isMemorySession = normalizeMechanicName(session?.mechanic?.name) === 'memory';
  const hasMemoryBoardConfigured = Array.isArray(session?.boardLayout) && session.boardLayout.length > 0;

  useEffect(() => {
    if (!isAssociationSession) {
      setAssociationChallengePlan([]);
      return;
    }

    setAssociationChallengePlan(prev =>
      buildAssociationPlanByRounds({
        currentPlan: prev,
        cards: associationCards,
        numberOfRounds: Number.parseInt(numberOfRounds, 10)
      })
    );
  }, [isAssociationSession, associationCards, numberOfRounds]);

  const handleSave = async () => {
    if (!session || !canEdit) return;

    const parsedConfig = {
      numberOfRounds: Number.parseInt(numberOfRounds, 10),
      timeLimit: Number.parseInt(timeLimit, 10),
      pointsPerCorrect: Number.parseInt(pointsPerCorrect, 10),
      penaltyPerError: Number.parseInt(penaltyPerError, 10)
    };

    if (Object.values(parsedConfig).some((value) => Number.isNaN(value))) {
      toast.error('Revisa los valores numéricos antes de guardar');
      return;
    }

    const payload = {
      deckId,
      config: parsedConfig
    };

    if (isAssociationSession) {
      if (associationChallengePlan.length !== parsedConfig.numberOfRounds) {
        toast.error('Configura todos los retos de Asociación antes de guardar');
        return;
      }

      payload.associationChallengePlan = associationChallengePlan.map(item => ({
        roundNumber: item.roundNumber,
        uid: item.uid,
        assignedValue: item.assignedValue,
        displayData: item.displayData || {},
        promptText: item.promptText || undefined
      }));
    }

    try {
      setSaving(true);
      await sessionsAPI.updateSession(sessionId, payload);
      saveBadge.trigger();
      toast.success('Sesión actualizada');
      // Pequeño respiro para que el badge inline sea perceptible antes de
      // navegar. Si reducedMotion el toast sigue siendo informativo.
      setTimeout(() => navigate(ROUTES.SESSION_DETAIL(sessionId)), 900);
    } catch (err) {
      toast.error('No se pudo guardar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setSaving(false);
    }
  };

  const updateAssociationRoundCard = (roundNumber, cardUid) => {
    const selectedCard = associationCards.find(card => card.uid === cardUid);
    if (!selectedCard) {
      return;
    }

    setAssociationChallengePlan(prev =>
      prev.map(candidate =>
        candidate.roundNumber === roundNumber
          ? {
              ...candidate,
              uid: selectedCard.uid,
              assignedValue: selectedCard.assignedValue,
              displayData: selectedCard.displayData || {}
            }
          : candidate
      )
    );
  };

  const updateAssociationRoundPrompt = (roundNumber, promptText) => {
    setAssociationChallengePlan(prev =>
      prev.map(candidate =>
        candidate.roundNumber === roundNumber
          ? { ...candidate, promptText }
          : candidate
      )
    );
  };

  if (loading && !session) {
    return (
      <div className="p-8 text-text-secondary">Cargando sesión…</div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-text-secondary">Sesión no encontrada.</div>
    );
  }

  return (
    <motion.div
      className="p-6 lg:p-8 max-w-5xl mx-auto"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[
          { label: 'Sesiones', to: ROUTES.SESSIONS },
          { label: session.deck?.name || 'Sesión', to: ROUTES.SESSION_DETAIL(sessionId) },
          { label: 'Editar' },
        ]} />
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary font-display">Editar sesión</h1>
            <p className="text-text-muted">
              {session.deck?.name || 'Sesión'} · {session.context?.name}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
            <ButtonPremium
              variant="secondary"
              onClick={() =>
                confirmExit(() => navigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId)))
              }
            >
              <MapIcon size={16} />
              Ver mapping
            </ButtonPremium>
          </div>
        </header>

        {!canEdit && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base" contentClassName="flex items-center gap-3">
            <AlertTriangle size={18} />
            Esta sesión ya no está en borrador y no se puede editar.
          </GlassCard>
        )}

        {canEdit && isAssociationSession && session.requiresAssociationPlanConfiguration && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base" contentClassName="flex items-center gap-3">
            <AlertTriangle size={18} />
            Esta sesión clonada tiene un borrador de retos precargado. Revísalo y guarda para confirmar antes de iniciar.
          </GlassCard>
        )}

        {canEdit && isMemorySession && !hasMemoryBoardConfigured && (
          <GlassCard className="p-4 border border-warning-base/40 text-warning-base" contentClassName="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertTriangle size={18} />
              Esta sesión de memoria requiere configurar el tablero antes de iniciar.
            </div>
            <ButtonPremium
              variant="secondary"
              onClick={() =>
                confirmExit(() => navigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId)))
              }
            >
              <MapIcon size={16} />
              Configurar tablero
            </ButtonPremium>
          </GlassCard>
        )}

        <GlassCard className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SelectPremium
              label="Mazo"
              options={deckOptions}
              value={deckId}
              onChange={setDeckId}
              placeholder="Selecciona un mazo"
              disabled={!canEdit}
            />
            <InputPremium
              label="Número de tarjetas"
              value={session.config?.numberOfCards?.toString() || ''}
              disabled
              hint="El número de tarjetas depende del mazo"
            />
          </div>

          {isAssociationSession && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-text-primary">Retos de Asociación por ronda</h2>
              {associationChallengePlan.length === 0 ? (
                <p className="text-sm text-warning-base">
                  No hay retos configurables. Revisa el mazo o el número de rondas.
                </p>
              ) : (
                associationChallengePlan.map(item => (
                  <div
                    key={`edit-association-round-${item.roundNumber}`}
                    className="rounded-xl border border-border-default bg-background-base/40 p-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    <SelectPremium
                      label={`Ronda ${item.roundNumber}: tarjeta objetivo`}
                      options={associationCards.map(card => ({
                        value: card.uid,
                        label: `${card.assignedValue || card.uid} · ${card.uid}`
                      }))}
                      value={item.uid || ''}
                      onChange={value => updateAssociationRoundCard(item.roundNumber, value)}
                      disabled={!canEdit}
                    />
                    <InputPremium
                      label="Consigna opcional"
                      value={item.promptText || ''}
                      onChange={event =>
                        updateAssociationRoundPrompt(item.roundNumber, event.target.value)
                      }
                      maxLength={180}
                      disabled={!canEdit}
                      placeholder="Ej: Encuentra la tarjeta que representa un río"
                    />
                  </div>
                ))
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputPremium
              label="Rondas"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={numberOfRounds}
              onChange={(e) => setNumberOfRounds(e.target.value)}
              disabled={!canEdit}
            />
            <InputPremium
              label="Tiempo por ronda (seg)"
              type="number"
              inputMode="numeric"
              min={3}
              max={60}
              value={timeLimit}
              onChange={(e) => setTimeLimit(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputPremium
              label="Puntos por acierto"
              type="number"
              inputMode="numeric"
              min={1}
              value={pointsPerCorrect}
              onChange={(e) => setPointsPerCorrect(e.target.value)}
              disabled={!canEdit}
            />
            <InputPremium
              label="Penalización"
              type="number"
              inputMode="numeric"
              max={-1}
              value={penaltyPerError}
              onChange={(e) => setPenaltyPerError(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <ButtonPremium
              variant="secondary"
              onClick={() =>
                confirmExit(() => navigate(ROUTES.SESSION_DETAIL(sessionId)))
              }
            >
              Cancelar
            </ButtonPremium>
            <div className="relative">
              <ButtonPremium
                variant="primary"
                onClick={handleSave}
                disabled={!canEdit || saving}
              >
                <Save size={16} />
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </ButtonPremium>
              <InlineSuccessBadge visible={saveBadge.visible} label="Sesión guardada" placement="left" />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* T-957: modal de confirmación al salir con cambios sin guardar
          (botones "Cancelar", "Ver mapping", "Configurar tablero"). */}
      <ConfirmationModal {...confirmExitModalProps} />
    </motion.div>
  );
}
