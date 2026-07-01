import {
  ensureRealResults,
  getAppStateFromSupabase,
  isAdminPasswordValid,
  isMatchLockedForUser,
  jsonResponse,
  saveAppStateToSupabase,
} from './_shared';

function normalizeName(value: string) {
  return String(value || '').trim().toLowerCase();
}

function getLockedPredictionChanges(state: any, currentPredictions: any, nextPredictions: any) {
  const lockedChanges: Array<{ matchId: string; current: string; next: string }> = [];

  const matches = Array.isArray(state.matches) ? state.matches : [];
  const currentMatches = currentPredictions?.matches || {};
  const nextMatches = nextPredictions?.matches || {};

  for (const match of matches) {
    const matchId = match.id;
    const isLocked = !!state.realResults?.matches?.[matchId] || isMatchLockedForUser(match, false);

    if (!isLocked) continue;

    const currentValue = currentMatches[matchId] || '';
    const nextValue = nextMatches[matchId] || '';

    if (currentValue !== nextValue) {
      lockedChanges.push({
        matchId,
        current: currentValue,
        next: nextValue,
      });
    }
  }

  return lockedChanges;
}

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, {
        success: false,
        error: 'Método no permitido',
      });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const name = String(body.name || '').trim();
    const predictions = body.predictions;
    const password = typeof body.password === 'string' ? body.password.trim() : undefined;
    const isAdmin = isAdminPasswordValid(body.adminPassword);

    if (!name) {
      return jsonResponse(400, {
        success: false,
        error: 'Falta el nombre del participante',
      });
    }

    if (!predictions || typeof predictions !== 'object') {
      return jsonResponse(400, {
        success: false,
        error: 'Faltan predicciones válidas',
      });
    }

    const state = await getAppStateFromSupabase();
    ensureRealResults(state);

    if (!Array.isArray(state.participants)) {
      state.participants = [];
    }

    const participantIndex = state.participants.findIndex((participant: any) => normalizeName(participant.name) === normalizeName(name));
    const currentParticipant = participantIndex >= 0 ? state.participants[participantIndex] : null;

    if (!isAdmin && currentParticipant) {
      const lockedChanges = getLockedPredictionChanges(state, currentParticipant.predictions, predictions);

      if (lockedChanges.length > 0) {
        return jsonResponse(403, {
          success: false,
          error: `No se pueden modificar predicciones bloqueadas. Ya faltan menos de 20 minutos o el partido ya tiene resultado real. Primer partido bloqueado: ${lockedChanges[0].matchId}`,
          lockedChanges,
        });
      }
    }

    const nextParticipant = {
      ...(currentParticipant || {}),
      name,
      predictions: {
        ganadorFinal: predictions.ganadorFinal || '',
        maxGoleador: predictions.maxGoleador || '',
        maxAsistente: predictions.maxAsistente || '',
        mvp: predictions.mvp || '',
        faseEspana: predictions.faseEspana || '',
        matches: predictions.matches || {},
      },
      password: password || currentParticipant?.password,
      points: currentParticipant?.points || {
        total: 0,
        ganadorFinal: 0,
        maxGoleador: 0,
        maxAsistente: 0,
        mvp: 0,
        faseEspana: 0,
        matches: {},
      },
    };

    if (participantIndex >= 0) {
      state.participants[participantIndex] = nextParticipant;
    } else {
      state.participants.push(nextParticipant);
    }

    await saveAppStateToSupabase(state);

    return jsonResponse(200, {
      success: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return jsonResponse(500, {
      success: false,
      error: message,
    });
  }
};
