import { Participant, AppState } from './types';

// Constants for points
export const POINTS = {
  GANADOR_FINAL: 10,
  MAX_GOLEADOR: 8,
  MAX_ASISTENTE: 7,
  MVP: 6,
  FASE_ESPANA: 4,
  EXACT_MATCH: 3,
  CORRECT_OUTCOME: 1,
  QUALIFIER: 1, // New point for correctly predicting who passes in knockout rounds!
};

/**
 * Strips any penalty shootout scores in parentheses, e.g. "1-1 (4-3)" -> "1-1"
 */
function cleanPenaltyPart(score: string): string {
  if (!score) return '';
  return score.split('(')[0].trim();
}

/**
 * Strips the qualifier suffix, e.g. "1-1 (Q1)" -> "1-1"
 */
function cleanPredictionPart(pred: string): string {
  if (!pred) return '';
  return pred.replace(/\s*\(Q\d\)/i, '').trim();
}

function getOutcome(score: string): 'home' | 'away' | 'draw' | null {
  const baseScore = cleanPenaltyPart(cleanPredictionPart(score));
  if (!baseScore || !baseScore.includes('-')) return null;
  const parts = baseScore.split('-');
  if (parts.length !== 2) return null;
  const home = parseInt(parts[0].trim(), 10);
  const away = parseInt(parts[1].trim(), 10);
  
  if (isNaN(home) || isNaN(away)) return null;
  
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

/**
 * Parser for penalty shootouts inside actual match scores.
 * Returns 'team1' or 'team2' as the winner.
 */
function getKnockoutWinnerSlot(scoreStr: string | undefined): 'team1' | 'team2' | null {
  if (!scoreStr) return null;
  const cleaned = scoreStr.trim();
  if (cleaned === '' || cleaned === '-') return null;

  // Check for penalty shootouts: matches "(4-3)" or "(4-3 p.)" etc.
  const penaltyMatch = cleaned.match(/\((\d+)\s*-\s*(\d+)[^)]*?\)/);
  if (penaltyMatch) {
    const p1 = parseInt(penaltyMatch[1], 10);
    const p2 = parseInt(penaltyMatch[2], 10);
    if (p1 > p2) return 'team1';
    if (p2 > p1) return 'team2';
  }

  const baseScore = cleaned.split(/\s+/)[0];
  const parts = baseScore.split('-');
  if (parts.length >= 2) {
    const s1 = parseInt(parts[0], 10);
    const s2 = parseInt(parts[1], 10);
    if (!isNaN(s1) && !isNaN(s2)) {
      if (s1 > s2) return 'team1';
      if (s2 > s1) return 'team2';
    }
  }
  return null;
}

function normalizeString(str: string): string {
  return str.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function calculatePointsForParticipant(
  participant: Participant,
  realResults: AppState['realResults']
): Participant['points'] {
  const points: Participant['points'] = {
    total: 0,
    ganadorFinal: 0,
    maxGoleador: 0,
    maxAsistente: 0,
    mvp: 0,
    faseEspana: 0,
    matches: {},
  };

  // Compare Ganador Final
  if (realResults.ganadorFinal && normalizeString(participant.predictions.ganadorFinal) === normalizeString(realResults.ganadorFinal)) {
    points.ganadorFinal = POINTS.GANADOR_FINAL;
  }
  
  // Compare Max Goleador
  if (realResults.maxGoleador && normalizeString(participant.predictions.maxGoleador) === normalizeString(realResults.maxGoleador)) {
    points.maxGoleador = POINTS.MAX_GOLEADOR;
  }

  // Compare Max Asistente
  if (realResults.maxAsistente && normalizeString(participant.predictions.maxAsistente) === normalizeString(realResults.maxAsistente)) {
    points.maxAsistente = POINTS.MAX_ASISTENTE;
  }

  // Compare MVP
  if (realResults.mvp && normalizeString(participant.predictions.mvp) === normalizeString(realResults.mvp)) {
    points.mvp = POINTS.MVP;
  }

  // Compare Fase España
  if (realResults.faseEspana && normalizeString(participant.predictions.faseEspana) === normalizeString(realResults.faseEspana)) {
    points.faseEspana = POINTS.FASE_ESPANA;
  }

  // Matches
  for (const [matchId, predictedScore] of Object.entries(participant.predictions.matches)) {
    const realScore = realResults.matches[matchId];
    points.matches[matchId] = 0; // Default

    if (realScore && predictedScore && predictedScore.trim() !== '' && predictedScore.trim() !== '-') {
      const cleanReal = cleanPenaltyPart(realScore);
      const cleanPred = cleanPredictionPart(predictedScore);

      // 1. Exact match at 120 mins
      if (cleanPred === cleanReal) {
        points.matches[matchId] += POINTS.EXACT_MATCH;
      } 
      // 2. Correct outcome at 120 mins
      else {
        const predictedOutcome = getOutcome(cleanPred);
        const realOutcome = getOutcome(cleanReal);
        if (predictedOutcome && realOutcome && predictedOutcome === realOutcome) {
          points.matches[matchId] += POINTS.CORRECT_OUTCOME;
        }
      }

      // 3. Extra Point: Correct Qualifier (Only in Knockout Matches M73 to M104)
      const isKnockout = matchId.startsWith('M') && parseInt(matchId.substring(1), 10) >= 73;
      if (isKnockout) {
        // Resolve predicted qualifier
        let predictedQualifier: 'team1' | 'team2' | null = null;
        if (predictedScore.toUpperCase().includes('(Q1)')) {
          predictedQualifier = 'team1';
        } else if (predictedScore.toUpperCase().includes('(Q2)')) {
          predictedQualifier = 'team2';
        } else {
          // If no explicit qualifier marker, deduce winner from predicted score outcome
          const predOutcome = getOutcome(cleanPred);
          if (predOutcome === 'home') predictedQualifier = 'team1';
          else if (predOutcome === 'away') predictedQualifier = 'team2';
        }

        // Resolve real qualifier
        let realQualifier: 'team1' | 'team2' | null = null;
        const realOutcome = getOutcome(cleanReal);
        if (realOutcome === 'home') {
          realQualifier = 'team1';
        } else if (realOutcome === 'away') {
          realQualifier = 'team2';
        } else if (realOutcome === 'draw') {
          // Resolved from penalty shootouts
          realQualifier = getKnockoutWinnerSlot(realScore);
        }

        // Check if correct
        if (predictedQualifier && realQualifier && predictedQualifier === realQualifier) {
          points.matches[matchId] += POINTS.QUALIFIER;
        }
      }
    }
  }

  // Calculate Total
  points.total = 
    points.ganadorFinal +
    points.maxGoleador +
    points.maxAsistente +
    points.mvp +
    points.faseEspana +
    Object.values(points.matches).reduce((acc, curr) => acc + curr, 0);

  return points;
}
