import {
  ensureRealResults,
  getAppStateFromSupabase,
  isAdminPasswordValid,
  jsonResponse,
  saveAppStateToSupabase,
} from './_shared';

export const handler = async (event: any) => {
  try {
    if (event.httpMethod !== 'POST') {
      return jsonResponse(405, {
        success: false,
        error: 'Método no permitido',
      });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const adminPassword = body.adminPassword;

    if (!isAdminPasswordValid(adminPassword)) {
      return jsonResponse(403, {
        success: false,
        error: 'No autorizado. Solo el administrador puede guardar resultados reales.',
      });
    }

    const newResults = body.realResults || body;

    if (!newResults || typeof newResults !== 'object') {
      return jsonResponse(400, {
        success: false,
        error: 'Formato inválido para resultados reales',
      });
    }

    const state = await getAppStateFromSupabase();
    ensureRealResults(state);

    state.realResults = {
      ganadorFinal: newResults.ganadorFinal || '',
      maxGoleador: newResults.maxGoleador || '',
      maxAsistente: newResults.maxAsistente || '',
      mvp: newResults.mvp || '',
      faseEspana: newResults.faseEspana || '',
      matches: newResults.matches || {},
    };

    if (Array.isArray(state.matches)) {
      for (const match of state.matches) {
        const result = state.realResults.matches[match.id];
        match.realResult = result || undefined;
      }
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
