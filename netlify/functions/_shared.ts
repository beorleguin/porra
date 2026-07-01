const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

export function jsonResponse(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

export function assertSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('Faltan variables SUPABASE_URL o SUPABASE_SECRET_KEY');
  }

  return {
    url: SUPABASE_URL,
    key: SUPABASE_SECRET_KEY,
  };
}

function supabaseHeaders() {
  const { key } = assertSupabaseEnv();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

export async function getAppStateFromSupabase() {
  const { url } = assertSupabaseEnv();

  const response = await fetch(`${url}/rest/v1/app_state?id=eq.main&select=data`, {
    method: 'GET',
    headers: supabaseHeaders(),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase GET app_state failed: HTTP ${response.status} - ${text}`);
  }

  const rows = text ? JSON.parse(text) : [];

  if (!Array.isArray(rows) || !rows[0]?.data) {
    throw new Error('No existe app_state con id main');
  }

  return rows[0].data;
}

export async function saveAppStateToSupabase(state: unknown) {
  const { url } = assertSupabaseEnv();

  const response = await fetch(`${url}/rest/v1/app_state?on_conflict=id`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: 'main',
      data: state,
      updated_at: new Date().toISOString(),
    }),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase SAVE app_state failed: HTTP ${response.status} - ${text}`);
  }
}

export function ensureRealResults(state: any) {
  if (!state.realResults) {
    state.realResults = {
      ganadorFinal: '',
      maxGoleador: '',
      maxAsistente: '',
      mvp: '',
      faseEspana: '',
      matches: {},
    };
  }

  if (!state.realResults.matches) {
    state.realResults.matches = {};
  }
}

export function normalizeAppState(state: any) {
  if (!state) return state;

  ensureRealResults(state);

  if (Array.isArray(state.matches)) {
    for (const match of state.matches) {
      if (match?.id && match?.realResult) {
        state.realResults.matches[match.id] = match.realResult;
      }
    }
  }

  return state;
}

export function isAdminPasswordValid(adminPassword?: string) {
  const expected = process.env.ADMIN_PASSWORD || 'root';
  return !!adminPassword && adminPassword === expected;
}

export const LOCK_BEFORE_KICKOFF_MS = 20 * 60 * 1000; // 20 minutes

export function parseKickoffAtUtcFromLocalOffset(date?: string, time?: string): string | undefined {
  if (!date || !time) return undefined;

  const dateMatch = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return undefined;

  const [, yearRaw, monthRaw, dayRaw] = dateMatch;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if ([year, month, day].some(value => !Number.isFinite(value))) {
    return undefined;
  }

  const value = String(time).trim();

  const timeWithUtcOffset = value.match(/^(\d{1,2}):(\d{2})\s*UTC\s*([+-]\d{1,2})$/i);
  if (timeWithUtcOffset) {
    const [, hourRaw, minuteRaw, offsetRaw] = timeWithUtcOffset;
    const hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const offset = Number(offsetRaw);

    if ([hour, minute, offset].some(v => !Number.isFinite(v))) return undefined;

    const utcMs = Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0);
    return new Date(utcMs).toISOString();
  }

  const timeWithAbbr = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*([A-Z]{2,5})$/i);
  if (timeWithAbbr) {
    const [, hourRaw, minuteRaw = '00', ampmRaw, abbrRaw] = timeWithAbbr;
    const offsets: Record<string, number> = {
      UTC: 0,
      GMT: 0,
      EDT: -4,
      EST: -5,
      CDT: -5,
      CST: -6,
      MDT: -6,
      MST: -7,
      PDT: -7,
      PST: -8,
      CET: 1,
      CEST: 2,
    };

    const abbr = abbrRaw.toUpperCase();
    if (!(abbr in offsets)) return undefined;

    let hour = Number(hourRaw);
    const minute = Number(minuteRaw);
    const ampm = ampmRaw.toUpperCase();

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;

    const utcMs = Date.UTC(year, month - 1, day, hour - offsets[abbr], minute, 0, 0);
    return new Date(utcMs).toISOString();
  }

  return undefined;
}

export function isMatchLockedForUser(match: any, isAdmin = false) {
  if (isAdmin) return false;

  const kickoffAtUtc = match?.kickoffAtUtc || parseKickoffAtUtcFromLocalOffset(match?.date, match?.time);
  if (!kickoffAtUtc) return false;

  const kickoffTime = new Date(kickoffAtUtc).getTime();
  if (!Number.isFinite(kickoffTime)) return false;

  return Date.now() >= kickoffTime - LOCK_BEFORE_KICKOFF_MS;
}
