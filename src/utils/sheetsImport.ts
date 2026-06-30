import Papa from 'papaparse';
import { AppState, Match, Participant } from '../domain/types';
import { getRealGroupOfTeam, normalizeTeamCode } from './flags';

const isValidScore = (value?: string) => /^\d+\s*-\s*\d+$/.test(String(value || '').trim());

function cleanCell(value: unknown): string {
  return String(value ?? '').trim();
}

const MATCH_HEADER_CORRECTIONS: Record<string, string> = {
  // El Google Sheet actual tiene este encabezado con una letra equivocada.
  // Debe ser Algeria vs Austria, no Algeria vs Australia.
  'ALG-AUS': 'ALG-AUT',
};

function normalizeMatchId(id: string): string {
  const cleaned = cleanCell(id).replace(/\s+/g, '').toUpperCase();
  const corrected = MATCH_HEADER_CORRECTIONS[cleaned] || cleaned;

  return corrected
    .split('-')
    .map(part => normalizeTeamCode(part.trim()))
    .join('-');
}

function getExistingMatchById(existingMatches: Match[], id: string): Match | undefined {
  const normalizedId = normalizeMatchId(id);

  return existingMatches.find(match => {
    const matchId = normalizeMatchId(match.id);
    const pairId = `${normalizeTeamCode(match.team1)}-${normalizeTeamCode(match.team2)}`;
    const reversePairId = `${normalizeTeamCode(match.team2)}-${normalizeTeamCode(match.team1)}`;

    return matchId === normalizedId || pairId === normalizedId || reversePairId === normalizedId;
  });
}

function getBoteFromRows(rows: string[][], participantNames: string[], previousBote?: AppState['bote']): AppState['bote'] {
  const total = cleanCell(rows[2]?.[5]) || previousBote?.total || `${participantNames.length * 10},00 €`;
  const first = cleanCell(rows[3]?.[5]) || previousBote?.prizes?.first || '';
  const second = cleanCell(rows[4]?.[5]) || previousBote?.prizes?.second || '';
  const third = cleanCell(rows[5]?.[5]) || previousBote?.prizes?.third || '';

  const previousPaymentsByName = new Map(
    (previousBote?.payments || []).map(payment => [payment.name.trim().toLowerCase(), payment.amount])
  );

  return {
    total,
    prizes: {
      first,
      second,
      third,
    },
    payments: participantNames.map(name => ({
      name,
      amount: previousPaymentsByName.get(name.trim().toLowerCase()) || '10,00 €',
    })),
  };
}

export function parsePorraSheetCsv(csvText: string, previousState?: AppState | null): AppState {
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: false,
  });

  if (parsed.errors?.length) {
    const firstError = parsed.errors[0];
    throw new Error(firstError.message || 'No se pudo leer el CSV del Sheet');
  }

  const rows = parsed.data;

  let matchHeaderRowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some(cell => cleanCell(cell).includes('MEX-RSA'))) {
      matchHeaderRowIndex = i;
      break;
    }
  }

  if (matchHeaderRowIndex === -1) {
    throw new Error('No se encontraron los encabezados de partidos en el CSV. Revisá que estés importando la hoja correcta exportada desde Google Sheets.');
  }

  const matchHeaders = rows[matchHeaderRowIndex] || [];
  const realResultsRow = rows[matchHeaderRowIndex + 1] || [];
  const existingMatches = previousState?.matches || [];

  const matches: Match[] = [];
  const matchColIndices: number[] = [];

  for (let col = 9; col < matchHeaders.length; col++) {
    const header = cleanCell(matchHeaders[col]);

    if (header && header !== '-' && header.includes('-')) {
      const matchId = normalizeMatchId(header);
      const [rawTeam1, rawTeam2] = matchId.split('-');
      const team1 = normalizeTeamCode(cleanCell(rawTeam1));
      const team2 = normalizeTeamCode(cleanCell(rawTeam2));
      const existingMatch = getExistingMatchById(existingMatches, matchId);
      const realResult = cleanCell(realResultsRow[col]);

      matches.push({
        ...existingMatch,
        id: matchId,
        team1,
        team2,
        group: existingMatch?.group || getRealGroupOfTeam(team1) || undefined,
        realResult: isValidScore(realResult) ? realResult.replace(/\s/g, '') : undefined,
      });

      matchColIndices.push(col);
    }
  }

  const realResults: AppState['realResults'] = {
    ganadorFinal: cleanCell(realResultsRow[3]),
    maxGoleador: cleanCell(realResultsRow[4]),
    maxAsistente: cleanCell(realResultsRow[5]),
    mvp: cleanCell(realResultsRow[6]),
    faseEspana: cleanCell(realResultsRow[7]),
    matches: {},
  };

  matches.forEach((match, index) => {
    const result = cleanCell(realResultsRow[matchColIndices[index]]);
    if (isValidScore(result)) {
      const finalResult = result.replace(/\s/g, '');
      realResults.matches[match.id] = finalResult;
      match.realResult = finalResult;
    }
  });

  const previousParticipantsByName = new Map(
    (previousState?.participants || []).map(participant => [participant.name.trim().toLowerCase(), participant])
  );

  const participants: Participant[] = [];
  const participantNames: string[] = [];
  let currentRow = matchHeaderRowIndex + 2;

  while (currentRow < rows.length) {
    const row = rows[currentRow] || [];
    const name = cleanCell(row[1]);

    if (name && name !== 'Next' && name.toLowerCase() !== 'total') {
      const previousParticipant = previousParticipantsByName.get(name.trim().toLowerCase());
      const predictions = {
        ganadorFinal: cleanCell(row[3]),
        maxGoleador: cleanCell(row[4]),
        maxAsistente: cleanCell(row[5]),
        mvp: cleanCell(row[6]),
        faseEspana: cleanCell(row[7]),
        matches: {} as Record<string, string>,
      };

      matches.forEach((match, index) => {
        const pred = cleanCell(row[matchColIndices[index]]);
        if (pred && pred !== '-') {
          predictions.matches[match.id] = pred.replace(/\s/g, '');
        }
      });

      participants.push({
        name,
        password: previousParticipant?.password,
        predictions,
        points: {
          total: 0,
          ganadorFinal: 0,
          maxGoleador: 0,
          maxAsistente: 0,
          mvp: 0,
          faseEspana: 0,
          matches: {},
        },
      });
      participantNames.push(name);
      currentRow += 2;
    } else {
      currentRow += 1;
    }
  }

  if (!participants.length) {
    throw new Error('No se encontraron participantes en el CSV importado.');
  }

  return {
    matches,
    participants,
    realResults,
    bote: getBoteFromRows(rows, participantNames, previousState?.bote),
  };
}
