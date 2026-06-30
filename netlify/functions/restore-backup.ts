import { isAdminPasswordValid, jsonResponse, normalizeAppState, saveAppStateToSupabase } from './_shared';

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
        error: 'No autorizado. Solo el administrador puede restaurar copias de seguridad.',
      });
    }

    const backupData = body.backupData || body;

    if (!backupData || !Array.isArray(backupData.matches) || !Array.isArray(backupData.participants) || !backupData.realResults) {
      return jsonResponse(400, {
        success: false,
        error: 'El archivo no tiene el formato esperado de copia de seguridad',
      });
    }

    const normalizedState = normalizeAppState(backupData);
    await saveAppStateToSupabase(normalizedState);

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
