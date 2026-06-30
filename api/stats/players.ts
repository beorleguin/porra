const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

type PlayerStat = {
  name: string
  team: string
  goals: number
  assists: number
  matches: number
  matchIds: Set<string>
}

function extractOpenFootballMatches(data: any): any[] {
  if (!data) return []

  if (Array.isArray(data.matches)) {
    return data.matches
  }

  if (Array.isArray(data.rounds)) {
    return data.rounds.flatMap((round: any) => round.matches || [])
  }

  if (Array.isArray(data.groups)) {
    return data.groups.flatMap((group: any) => group.matches || [])
  }

  return []
}

function getTeamName(team: any): string {
  if (!team) return ''
  if (typeof team === 'string') return team
  return team.name || team.code || team.team || ''
}

function getPlayerName(goal: any): string {
  if (!goal) return ''
  return (
    goal.name ||
    goal.player ||
    goal.scorer ||
    goal.player_name ||
    goal.person ||
    ''
  ).toString().trim()
}

function addGoal(
  players: Map<string, PlayerStat>,
  goal: any,
  team: string,
  matchId: string
) {
  if (!goal) return

  // No contar goles en contra como goleadores del propio jugador.
  if (goal.ownGoal || goal.own_goal || goal.owngoal) return

  const name = getPlayerName(goal)
  if (!name) return

  const normalizedTeam = team.toUpperCase()
  const key = `${name.toLowerCase()}|${normalizedTeam}`

  if (!players.has(key)) {
    players.set(key, {
      name,
      team: normalizedTeam,
      goals: 0,
      assists: 0,
      matches: 0,
      matchIds: new Set<string>(),
    })
  }

  const player = players.get(key)!
  player.goals += 1
  player.matchIds.add(matchId)
  player.matches = player.matchIds.size
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const response = await fetch(OPENFOOTBALL_URL, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return res.status(500).json({
        error: `No se pudo consultar OpenFootball. HTTP ${response.status}`,
        scorers: [],
        assistants: [],
      })
    }

    const data = await response.json()
    const matches = extractOpenFootballMatches(data)

    const players = new Map<string, PlayerStat>()

    matches.forEach((match: any, index: number) => {
      const team1 = getTeamName(match.team1 || match.home_team || match.home)
      const team2 = getTeamName(match.team2 || match.away_team || match.away)

      const matchId =
        match.id ||
        match.num ||
        match.number ||
        `${team1}-${team2}-${match.date || index}`

      // Formato habitual OpenFootball: goals1 / goals2
      if (Array.isArray(match.goals1)) {
        match.goals1.forEach((goal: any) => addGoal(players, goal, team1, matchId))
      }

      if (Array.isArray(match.goals2)) {
        match.goals2.forEach((goal: any) => addGoal(players, goal, team2, matchId))
      }

      // Formato alternativo: goals con team dentro del objeto
      if (Array.isArray(match.goals)) {
        match.goals.forEach((goal: any) => {
          const goalTeam =
            getTeamName(goal.team) ||
            (goal.side === 'team1' || goal.team_id === 1 ? team1 : '') ||
            (goal.side === 'team2' || goal.team_id === 2 ? team2 : '')

          addGoal(players, goal, goalTeam || team1, matchId)
        })
      }
    })

    const scorers = Array.from(players.values())
      .map((player) => ({
        name: player.name,
        team: player.team,
        goals: player.goals,
        assists: player.assists,
        matches: player.matches,
      }))
      .sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals
        if (b.matches !== a.matches) return b.matches - a.matches
        return a.name.localeCompare(b.name)
      })

    return res.status(200).json({
      scorers,
      assistants: [],
      topScorers: scorers,
      topAssistants: [],
      updatedAt: new Date().toISOString(),
      source: 'openfootball',
    })
  } catch (err: any) {
    return res.status(500).json({
      error: err.message || String(err),
      scorers: [],
      assistants: [],
      topScorers: [],
      topAssistants: [],
      source: 'openfootball-error',
    })
  }
}