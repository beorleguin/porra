import { getAppStateFromSupabase, jsonResponse, normalizeAppState } from './_shared';

export const handler = async () => {
  try {
    const state = await getAppStateFromSupabase();
    const normalizedState = normalizeAppState(state);

    return jsonResponse(200, normalizedState);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return jsonResponse(500, {
      error: message,
    });
  }
};
