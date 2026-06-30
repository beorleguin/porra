import { jsonResponse } from './_shared';

function normalizeName(value: string): string {
  return String(value || '').trim();
}

function extractOpenFootballMatches(data: any): any[] {
  if (Array.isArray(data?.matches)) return data.matches;

  if (Array.isArray(data?.rounds)) {
    return data.rounds.flatMap((round: any) => Array.isArray(round.matches) ? round.matches : []);
  }

  return [];
}

export const handler = async () => {
  try {
    const response = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json', {
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      return jsonResponse(500, {
        error: `No se pudo consultar OpenFootball. HTTP ${response.status}`,
      });
    }

    const data = await response.json();
    const matches = extractOpenFootballMatches(data);
    const players = new Map<string, { name: string; team: string; goals: number; assists: number; matches: number }>();

    for (const match of matches) {
      const team1 = match.team1 || '';
      const team2 = match.team2 || '';

      const processGoal = (goal: any, team: string) => {
        if (!goal || goal.owngoal) return;

        const name = normalizeName(goal.name);
        if (!name) return;

        const key = `${name}__${team}`;

        if (!players.has(key)) {
          players.set(key, {
            name,
            team,
            goals: 0,
            assists: 0,
            matches: 0,
          });
        }

        const player = players.get(key)!;
        player.goals += 1;
        player.matches += 1;
      };

      if (Array.isArray(match.goals1)) {
        match.goals1.forEach((goal: any) => processGoal(goal, team1));
      }

      if (Array.isArray(match.goals2)) {
        match.goals2.forEach((goal: any) => processGoal(goal, team2));
      }
    }

    const scorers = Array.from(players.values()).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));

    return jsonResponse(200, {
      scorers,
      assistants: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    return jsonResponse(500, {
      error: message,
    });
  }
};
