/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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

export function parseKickoffAtUtcFromLocalOffset(date?: string, time?: string): string | undefined {
  if (!date || !time) return undefined;

  const dateMatch = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return undefined;

  const [, yearRaw, monthRaw, dayRaw] = dateMatch;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  const timeMatch = String(time).trim().match(/^(\d{2}):(\d{2})$/);
  let hour = 12;
  let minute = 0;

  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2]);
  }

  const offset = -5; // Default local offset in the project

  if ([hour, minute, offset].some(v => !Number.isFinite(v))) return undefined;

  const utcMs = Date.UTC(year, month - 1, day, hour - offset, minute, 0, 0);
  return new Date(utcMs).toISOString();
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

function ensureRealResults(state: any) {
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase environment variables' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const { data: appStateRow, error: getError } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main')
      .single()

    if (getError) {
      return res.status(500).json({ success: false, error: getError.message })
    }

    const state = appStateRow.data;
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
      return res.status(500).json({
        success: false,
        error: `No se pudo consultar OpenFootball. HTTP ${response.status}`,
      });
    }

    const openFootballData = await response.json();
    const openFootballMatches = extractOpenFootballMatches(openFootballData);

    if (!openFootballMatches.length) {
      return res.status(500).json({
        success: false,
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
        const kickoffAtUtc = parseKickoffAtUtcFromLocalOffset(match.date, match.time);
        if (match.date) stateMatch.date = match.date;
        if (match.time) stateMatch.time = match.time;
        if (match.stadium) stateMatch.ground = match.stadium;
        if (kickoffAtUtc) {
          stateMatch.kickoffAtUtc = kickoffAtUtc;
          kickoffUpdatedCount += 1;
        }

        if (code1 && code1.length === 3) stateMatch.team1 = code1;
        if (code2 && code2.length === 3) stateMatch.team2 = code2;

        const score = getFullTimeScore(match);
        if (score) {
          resultFoundCount += 1;
          const direct = stateMatch.team1 === code1 && stateMatch.team2 === code2;
          let result = direct ? `${score[0]}-${score[1]}` : `${score[1]}-${score[0]}`;

          if (match.score && Array.isArray(match.score.p)) {
            const p = match.score.p;
            const pResult = direct ? `(${p[0]}-${p[1]})` : `(${p[1]}-${p[0]})`;
            result += ` ${pResult}`;
          }

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

    const { error: upsertError } = await supabase
      .from('app_state')
      .upsert({
        id: 'main',
        data: state,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id'
      })

    if (upsertError) {
      return res.status(500).json({ success: false, error: upsertError.message })
    }

    return res.status(200).json({
      success: true,
      count: resultFoundCount,
      updatedCount: resultFoundCount,
      resultChangedCount,
      kickoffUpdatedCount,
      updatedMatches,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || String(err),
    })
  }
}
