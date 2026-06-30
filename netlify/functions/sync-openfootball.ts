import {
  ensureRealResults,
  getAppStateFromSupabase,
  jsonResponse,
  parseKickoffAtUtcFromLocalOffset,
  saveAppStateToSupabase,
} from './_shared';

function normalizeName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCodeFromOpenFootballName(name: string): string {
  const n = normalizeName(name);

  const map: Record<string, string> = {
    mexico: 'MEX',
    'south africa': 'RSA',
    'korea republic': 'KOR',
    'south korea': 'KOR',
    czechia: 'CZE',
    'czech republic': 'CZE',

    canada: 'CAN',
    'bosnia and herzegovina': 'BIH',
    bosnia: 'BIH',
    qatar: 'QAT',
    switzerland: 'SUI',

    brazil: 'BRA',
    morocco: 'MAR',
    haiti: 'HAI',
    scotland: 'SCO',

    'united states': 'USA',
    usa: 'USA',
    paraguay: 'PAR',
    australia: 'AUS',
    turkey: 'TUR',
    turkiye: 'TUR',

    germany: 'GER',
    curacao: 'CUW',
    'cote divoire': 'CIV',
    'ivory coast': 'CIV',
    ecuador: 'ECU',

    netherlands: 'NED',
    japan: 'JPN',
    sweden: 'SWE',
    tunisia: 'TUN',

    belgium: 'BEL',
    egypt: 'EGY',
    iran: 'IRN',
    'islamic republic of iran': 'IRN',
    'new zealand': 'NZL',

    spain: 'ESP',
    'cape verde': 'CPV',
    'saudi arabia': 'KSA',
    uruguay: 'URU',

    france: 'FRA',
    senegal: 'SEN',
    iraq: 'IRQ',
    norway: 'NOR',

    argentina: 'ARG',
    algeria: 'ALG',
    austria: 'AUT',
    jordan: 'JOR',

    portugal: 'POR',
    'dr congo': 'CGO',
    'congo dr': 'CGO',
    'democratic republic of congo': 'CGO',
    'dem rep congo': 'CGO',
    congo: 'CGO',
    uzbekistan: 'UZB',
    colombia: 'COL',

    england: 'ENG',
    croatia: 'CRO',
    ghana: 'GHA',
    panama: 'PAN',
  };

  return map[n] || '';
}

function extractOpenFootballMatches(data: any): any[] {
  if (Array.isArray(data?.matches)) return data.matches;

  if (Array.isArray(data?.rounds)) {
    return data.rounds.flatMap((round: any) => Array.isArray(round.matches) ? round.matches : []);
  }

  return [];
}

function findStateMatch(state: any, code1: string, code2: string) {
  if (!Array.isArray(state.matches)) return null;

  return state.matches.find((m: any) => {
    const direct = m.team1 === code1 && m.team2 === code2;
    const inverse = m.team1 === code2 && m.team2 === code1;
    return direct || inverse;
  }) || null;
}

function applyKickoffToState(state: any, code1: string, code2: string, openFootballMatch: any): boolean {
  const stateMatch = findStateMatch(state, code1, code2);
  if (!stateMatch) return false;

  const kickoffAtUtc = parseKickoffAtUtcFromLocalOffset(openFootballMatch.date, openFootballMatch.time);

  if (openFootballMatch.date) stateMatch.date = openFootballMatch.date;
  if (openFootballMatch.time) stateMatch.time = openFootballMatch.time;
  if (openFootballMatch.stadium) stateMatch.ground = openFootballMatch.stadium;
  if (kickoffAtUtc) stateMatch.kickoffAtUtc = kickoffAtUtc;

  return !!kickoffAtUtc;
}

function getFullTimeScore(match: any): [number, number] | null {
  const ft = match?.score?.ft;

  if (Array.isArray(ft) && ft.length === 2) {
    const home = Number(ft[0]);
    const away = Number(ft[1]);

    if (Number.isFinite(home) && Number.isFinite(away)) {
      return [home, away];
    }
  }

  return null;
}

function applyResultToState(state: any, code1: string, code2: string, score: [number, number]): boolean {
  const stateMatch = findStateMatch(state, code1, code2);
  if (!stateMatch) return false;

  const direct = stateMatch.team1 === code1 && stateMatch.team2 === code2;
  const result = direct ? `${score[0]}-${score[1]}` : `${score[1]}-${score[0]}`;

  const previous = stateMatch.realResult || state.realResults.matches[stateMatch.id];

  stateMatch.realResult = result;
  state.realResults.matches[stateMatch.id] = result;

  return previous !== result;
}

export const handler = async () => {
  try {
    const state = await getAppStateFromSupabase();
    ensureRealResults(state);

    const response = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      {
        headers: {
          'Cache-Control': 'no-cache',
        },
      }
    );

    if (!response.ok) {
      return jsonResponse(500, {
        error: `No se pudo consultar OpenFootball. HTTP ${response.status}`,
      });
    }

    const openFootballData = await response.json();
    const openFootballMatches = extractOpenFootballMatches(openFootballData);

    if (!openFootballMatches.length) {
      return jsonResponse(500, {
        error: 'OpenFootball no devolvió partidos en un formato válido',
      });
    }

    let kickoffUpdatedCount = 0;
    let resultChangedCount = 0;
    let resultFoundCount = 0;

    const updatedMatches: Array<{
      id?: string;
      team1: string;
      team2: string;
      result?: string;
      kickoffAtUtc?: string;
    }> = [];

    for (let idx = 0; idx < openFootballMatches.length; idx++) {
      const match = openFootballMatches[idx];
      const code1 = getCodeFromOpenFootballName(match.team1);
      const code2 = getCodeFromOpenFootballName(match.team2);

      const team1Code = code1 || match.team1;
      const team2Code = code2 || match.team2;

      // Find the match in our state. If group stage, match by codes. If knockout, match by index.
      let stateMatch: any = null;
      if (idx < 72) {
        if (!code1 || !code2) continue;
        stateMatch = findStateMatch(state, code1, code2);
      } else {
        const matchId = `M${idx + 1}`;
        stateMatch = state.matches.find((m: any) => m.id === matchId);
        if (!stateMatch) {
          stateMatch = {
            id: matchId,
            team1: team1Code,
            team2: team2Code,
            group: 'Fase Eliminatoria',
            date: match.date || '',
            time: match.time || '',
            ground: match.stadium || '',
          };
          state.matches.push(stateMatch);
        }
      }

      if (stateMatch) {
        // Update date, time, venue, kickoff offset
        const kickoffAtUtc = parseKickoffAtUtcFromLocalOffset(match.date, match.time);
        if (match.date) stateMatch.date = match.date;
        if (match.time) stateMatch.time = match.time;
        if (match.stadium) stateMatch.ground = match.stadium;
        if (kickoffAtUtc) {
          stateMatch.kickoffAtUtc = kickoffAtUtc;
          kickoffUpdatedCount += 1;
        }
        
        // Update teams if decided
        if (code1 && code1.length === 3) stateMatch.team1 = code1;
        if (code2 && code2.length === 3) stateMatch.team2 = code2;

        // Apply results
        const score = getFullTimeScore(match);
        if (score) {
          resultFoundCount += 1;
          const direct = stateMatch.team1 === code1 && stateMatch.team2 === code2;
          const result = direct ? `${score[0]}-${score[1]}` : `${score[1]}-${score[0]}`;
          
          const previous = stateMatch.realResult || state.realResults.matches[stateMatch.id];
          if (previous !== result) {
            stateMatch.realResult = result;
            state.realResults.matches[stateMatch.id] = result;
            resultChangedCount += 1;
          }
        }

        updatedMatches.push({
          id: stateMatch.id,
          team1: stateMatch.team1,
          team2: stateMatch.team2,
          result: stateMatch.realResult,
          kickoffAtUtc: stateMatch.kickoffAtUtc,
        });
      }
    }

    await saveAppStateToSupabase(state);

    return jsonResponse(200, {
      success: true,
      count: resultFoundCount,
      updatedCount: resultFoundCount,
      resultChangedCount,
      kickoffUpdatedCount,
      updatedMatches,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return jsonResponse(500, {
      error: message,
    });
  }
};
