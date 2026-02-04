/**
 * @fileoverview Edición de sesión de juego (configuración).
 * Permite ajustar reglas y cambiar el mazo antes de iniciar.
 *
 * @module pages/SessionEdit
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Map, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { sessionsAPI, decksAPI, extractData, extractErrorMessage } from '../services/api';
import { ROUTES } from '../constants/routes';
import {
  ButtonPremium,
  GlassCard,
  InputPremium,
  SelectPremium,
  StatusBadge
} from '../components/ui';
import { pageVariants } from '../lib/utils';

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

export default function SessionEdit() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [decks, setDecks] = useState([]);

  const [deckId, setDeckId] = useState('');
  const [numberOfRounds, setNumberOfRounds] = useState('');
  const [timeLimit, setTimeLimit] = useState('');
  const [pointsPerCorrect, setPointsPerCorrect] = useState('');
  const [penaltyPerError, setPenaltyPerError] = useState('');

  const loadSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const response = await sessionsAPI.getSessionById(sessionId);
      const data = extractData(response);
      setSession(data);
      setDeckId(data.deckId || data.deck?.id || '');
      setNumberOfRounds(String(data.config?.numberOfRounds ?? ''));
      setTimeLimit(String(data.config?.timeLimit ?? ''));
      setPointsPerCorrect(String(data.config?.pointsPerCorrect ?? ''));
      setPenaltyPerError(String(data.config?.penaltyPerError ?? ''));
    } catch (err) {
      toast.error('No se pudo cargar la sesión', {
        description: extractErrorMessage(err)
      });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const loadDecks = useCallback(async () => {
    try {
      const response = await decksAPI.getDecks({ status: 'active', limit: 100 });
      const data = response.data?.data || [];
      setDecks(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('No se pudieron cargar los mazos', {
        description: extractErrorMessage(err)
      });
    }
  }, []);

  useEffect(() => {
    loadSession();
    loadDecks();
  }, [loadSession, loadDecks]);

  const deckOptions = useMemo(() => decks.map((deck) => ({
    value: deck.id || deck._id,
    label: deck.name
  })), [decks]);

  const statusInfo = statusToBadge(session?.status);
  const canEdit = session?.status === 'created';

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

    try {
      setSaving(true);
      await sessionsAPI.updateSession(sessionId, payload);
      toast.success('Sesión actualizada');
      navigate(ROUTES.SESSION_DETAIL(sessionId));
    } catch (err) {
      toast.error('No se pudo guardar', {
        description: extractErrorMessage(err)
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-slate-300">Cargando sesión...</div>
    );
  }

  if (!session) {
    return (
      <div className="p-8 text-slate-300">Sesión no encontrada.</div>
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
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ButtonPremium variant="ghost" onClick={() => navigate(ROUTES.SESSION_DETAIL(sessionId))}>
              <ArrowLeft size={16} />
              Volver
            </ButtonPremium>
            <div>
              <h1 className="text-2xl font-bold text-white font-display">Editar sesión</h1>
              <p className="text-slate-400">
                {session.deck?.name || 'Sesión'} · {session.context?.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={statusInfo.tone}>{statusInfo.label}</StatusBadge>
            <ButtonPremium
              variant="secondary"
              onClick={() => navigate(ROUTES.BOARD_SETUP_WITH_ID(sessionId))}
            >
              <Map size={16} />
              Ver mapping
            </ButtonPremium>
          </div>
        </header>

        {!canEdit && (
          <GlassCard className="p-4 border border-amber-500/30 text-amber-300 flex items-center gap-3">
            <AlertTriangle size={18} />
            Esta sesión ya no está en borrador y no se puede editar.
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputPremium
              label="Rondas"
              type="number"
              min={1}
              max={20}
              value={numberOfRounds}
              onChange={(e) => setNumberOfRounds(e.target.value)}
              disabled={!canEdit}
            />
            <InputPremium
              label="Tiempo por ronda (seg)"
              type="number"
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
              min={1}
              value={pointsPerCorrect}
              onChange={(e) => setPointsPerCorrect(e.target.value)}
              disabled={!canEdit}
            />
            <InputPremium
              label="Penalización"
              type="number"
              max={-1}
              value={penaltyPerError}
              onChange={(e) => setPenaltyPerError(e.target.value)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3">
            <ButtonPremium
              variant="secondary"
              onClick={() => navigate(ROUTES.SESSION_DETAIL(sessionId))}
            >
              Cancelar
            </ButtonPremium>
            <ButtonPremium
              variant="primary"
              onClick={handleSave}
              disabled={!canEdit || saving}
            >
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </ButtonPremium>
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}
