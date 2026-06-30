import { Match, AppState } from '../domain/types';

export interface TeamStats {
  team: string;
  gp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export function calculateGroupStandings(
  groupName: string,
  matches: Match[],
  realResults: AppState['realResults']
): TeamStats[] {
  // Find all matches for this group
  const groupMatches = matches.filter(m => m.group === groupName);

  // Extract unique teams in this group
  const teamsSet = new Set<string>();
  groupMatches.forEach(m => {
    teamsSet.add(m.team1);
    teamsSet.add(m.team2);
  });

  const teams = Array.from(teamsSet);

  // Initialize stats
  const statsMap: Record<string, TeamStats> = {};
  teams.forEach(t => {
    statsMap[t] = {
      team: t,
      gp: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0,
    };
  });

  // Calculate stats from finished matches
  groupMatches.forEach(m => {
    const result = realResults.matches[m.id];
    if (result && result.includes('-')) {
      const parts = result.split('-');
      const g1 = parseInt(parts[0].trim(), 10);
      const g2 = parseInt(parts[1].trim(), 10);

      if (!isNaN(g1) && !isNaN(g2)) {
        const t1Stats = statsMap[m.team1];
        const t2Stats = statsMap[m.team2];

        if (t1Stats && t2Stats) {
          t1Stats.gp += 1;
          t2Stats.gp += 1;
          t1Stats.gf += g1;
          t1Stats.ga += g2;
          t2Stats.gf += g2;
          t2Stats.ga += g1;
          t1Stats.gd = t1Stats.gf - t1Stats.ga;
          t2Stats.gd = t2Stats.gf - t2Stats.ga;

          if (g1 > g2) {
            t1Stats.w += 1;
            t2Stats.l += 1;
            t1Stats.pts += 3;
          } else if (g2 > g1) {
            t2Stats.w += 1;
            t1Stats.l += 1;
            t2Stats.pts += 3;
          } else {
            t1Stats.d += 1;
            t2Stats.d += 1;
            t1Stats.pts += 1;
            t2Stats.pts += 1;
          }
        }
      }
    }
  });

  // Sort: Pts desc, GD desc, GF desc, alphabetical
  return Object.values(statsMap).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.team.localeCompare(b.team);
  });
}
