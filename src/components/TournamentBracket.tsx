import { useState, useMemo } from 'react';
import { Match, AppState, Participant } from '../domain/types';
import { calculateGroupStandings } from '../utils/standings';
import { getFlagImgUrl, normalizeTeamCode } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { MatchPredictionsModal } from './MatchPredictionsModal';
import { formatMatchDateToClient, formatMatchTimeToClient } from '../utils/date';

interface Props {
  matches: Match[];
  realResults: AppState['realResults'];
  participants: Participant[];
  lang: Lang;
  theme?: 'light' | 'dark';
  onNavigateToParticipant?: (participant: Participant, matchId: string) => void;
}

type BracketSubTab = 'groups' | 'knockout';

// Group colors mapping for visual consistency in Light Mode
const GROUP_COLORS: Record<string, { bg: string, text: string, border: string }> = {
  'Group A': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
  'Group B': { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' },
  'Group C': { bg: '#fef9c3', text: '#854d0e', border: '#fef08a' },
  'Group D': { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' },
  'Group E': { bg: '#ccfbf1', text: '#115e59', border: '#99f6e4' },
  'Group F': { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  'Group G': { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' },
  'Group H': { bg: '#f3e8ff', text: '#6b21a8', border: '#e9d5ff' },
  'Group I': { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' },
  'Group J': { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  'Group K': { bg: '#f5f3ff', text: '#5b21b6', border: '#ddd6fe' },
  'Group L': { bg: '#ecfdf5', text: '#065f46', border: '#a7f3d0' },
};

// Group colors mapping for visual consistency in Dark Mode
const GROUP_COLORS_DARK: Record<string, { bg: string, text: string, border: string }> = {
  'Group A': { bg: '#3a1a1a', text: '#fca5a5', border: '#991b1b' },
  'Group B': { bg: '#3a2012', text: '#fed7aa', border: '#9a3412' },
  'Group C': { bg: '#353215', text: '#fef08a', border: '#854d0e' },
  'Group D': { bg: '#14301c', text: '#bbf7d0', border: '#166534' },
  'Group E': { bg: '#112e2a', text: '#99f6e4', border: '#115e59' },
  'Group F': { bg: '#1a243a', text: '#bfdbfe', border: '#1e40af' },
  'Group G': { bg: '#1d1e3d', text: '#c7d2fe', border: '#3730a3' },
  'Group H': { bg: '#281c3a', text: '#e9d5ff', border: '#6b21a8' },
  'Group I': { bg: '#321524', text: '#fbcfe8', border: '#9d174d' },
  'Group J': { bg: '#122635', text: '#bae6fd', border: '#0369a1' },
  'Group K': { bg: '#1e1a3a', text: '#ddd6fe', border: '#5b21b6' },
  'Group L': { bg: '#0f2f22', text: '#a7f3d0', border: '#065f46' },
};

// Helper to parse scores and get knockout winner
function getKnockoutWinnerSlot(scoreStr: string | undefined): 'team1' | 'team2' | null {
  if (!scoreStr) return null;
  const cleaned = scoreStr.trim();
  if (cleaned === '' || cleaned === '-') return null;

  // Check for penalty shootouts: e.g. "1-1 (4-3 p.)" or "1-1 (4-3)"
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

export function TournamentBracket({ matches, realResults, participants, lang, theme, onNavigateToParticipant }: Props) {
  const [subTab, setSubTab] = useState<BracketSubTab>('groups');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('All');
  const [selectedMatchForPredictions, setSelectedMatchForPredictions] = useState<Match | null>(null);
  const [bracketViewMode, setBracketViewMode] = useState<'detailed' | 'compact'>('compact');
  const [selectedRoundFilter, setSelectedRoundFilter] = useState<'all' | 'r32' | 'r16' | 'qf' | 'sf' | 'finals'>('all');
  const t = TRANSLATIONS[lang];

  // Calculate standings for all groups on-the-fly
  const groupStandings = useMemo(() => {
    const standings: Record<string, any[]> = {};
    const groupNames = [
      'Group A', 'Group B', 'Group C', 'Group D', 
      'Group E', 'Group F', 'Group G', 'Group H', 
      'Group I', 'Group J', 'Group K', 'Group L'
    ];
    
    groupNames.forEach(gName => {
      standings[gName] = calculateGroupStandings(gName, matches, realResults);
    });
    
    return standings;
  }, [matches, realResults]);

  // Helper to generate dynamic double-flag background blend inline style on hover
  const getHoverBackgroundStyles = (m: Match, isT1Real: boolean, isT2Real: boolean) => {
    const overlayColor = theme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)';
    const flag1 = isT1Real ? getFlagImgUrl(m.team1) : '';
    const flag2 = isT2Real ? getFlagImgUrl(m.team2) : '';

    let backgroundImage = `linear-gradient(${overlayColor}, ${overlayColor})`;
    let backgroundPosition = 'center';
    let backgroundSize = '100% 100%';

    if (flag1 && flag2) {
      backgroundImage += `, url(${flag1}), url(${flag2})`;
      backgroundPosition = 'center, left center, right center';
      backgroundSize = '100% 100%, 50% 100%, 50% 100%';
    } else if (flag1) {
      backgroundImage += `, url(${flag1})`;
      backgroundPosition = 'center, center';
      backgroundSize = '100% 100%, 100% 100%';
    } else if (flag2) {
      backgroundImage += `, url(${flag2})`;
      backgroundPosition = 'center, center';
      backgroundSize = '100% 100%, 100% 100%';
    }

    return { backgroundImage, backgroundPosition, backgroundSize };
  };

  // Helper to check if all 6 matches of a group have real results (definitive group)
  const isGroupFinished = (gName: string): boolean => {
    const groupMatches = matches.filter(m => m.group === gName);
    return groupMatches.length === 6 && groupMatches.every(m => m.realResult && m.realResult.trim() !== '' && m.realResult.trim() !== '-');
  };

  // Helper to resolve a Round of 32 team from current calculated standings on-the-fly
  const resolveR32Team = (id: string, slot: 'team1' | 'team2'): string => {
    const mappings: Record<string, { t1: string, t2: string }> = {
      'M73': { t1: '2A', t2: '2B' },
      'M74': { t1: '1E', t2: '3rd' },
      'M75': { t1: '1F', t2: '2C' },
      'M76': { t1: '1C', t2: '2F' },
      'M77': { t1: '1I', t2: '3rd' },
      'M78': { t1: '2E', t2: '2I' },
      'M79': { t1: '1A', t2: '3rd' },
      'M80': { t1: '1L', t2: '3rd' },
      'M81': { t1: '1D', t2: '3rd' },
      'M82': { t1: '1G', t2: '3rd' },
      'M83': { t1: '2K', t2: '2L' },
      'M84': { t1: '1H', t2: '2J' },
      'M85': { t1: '1B', t2: '3rd' },
      'M86': { t1: '1J', t2: '2H' },
      'M87': { t1: '1K', t2: '3rd' },
      'M88': { t1: '2D', t2: '2G' }
    };

    const map = mappings[id];
    if (!map) return slot === 'team1' ? 'Eq. 1' : 'Eq. 2';

    const code = slot === 'team1' ? map.t1 : map.t2;

    if (code === '3rd') {
      const fallbackLabels: Record<string, string> = {
        'M74': '3º A/B/C/D/F',
        'M77': '3º C/D/F/G/H',
        'M79': '3º C/E/F/H/I',
        'M80': '3º E/H/I/J/K',
        'M81': '3º B/E/F/I/J',
        'M82': '3º A/E/H/I/J',
        'M85': '3º E/F/G/I/J',
        'M87': '3º D/E/I/J/L'
      };
      return fallbackLabels[id] || '3º Gp';
    }

    const position = parseInt(code.charAt(0), 10);
    const groupLetter = code.charAt(1);
    const groupName = `Group ${groupLetter}`;
    
    if (isGroupFinished(groupName)) {
      const standings = groupStandings[groupName] || [];
      const teamObj = standings[position - 1];
      
      if (teamObj && teamObj.team) {
        return teamObj.team;
      }
    }

    return `${position}${groupLetter}`;
  };

  // Recursively resolve team name for a knockout slot
  function resolveTeamName(matchId: string, slot: 'team1' | 'team2', matchesList: Match[]): string {
    const match = matchesList.find(m => m.id === matchId);
    
    const mNum = parseInt(matchId.substring(1), 10);
    if (mNum >= 73 && mNum <= 88) {
      if (match && match.team1 && match.team1.length === 3 && match.team2 && match.team2.length === 3) {
        return slot === 'team1' ? match.team1 : match.team2;
      }
      return resolveR32Team(matchId, slot);
    }

    const parents: Record<string, { t1: string, t2: string }> = {
      'M89': { t1: 'M73', t2: 'M75' },
      'M90': { t1: 'M74', t2: 'M77' },
      'M91': { t1: 'M76', t2: 'M78' },
      'M92': { t1: 'M79', t2: 'M80' },
      'M93': { t1: 'M83', t2: 'M84' },
      'M94': { t1: 'M81', t2: 'M82' },
      'M95': { t1: 'M86', t2: 'M88' },
      'M96': { t1: 'M85', t2: 'M87' },
      'M97': { t1: 'M89', t2: 'M90' },
      'M98': { t1: 'M91', t2: 'M92' },
      'M99': { t1: 'M93', t2: 'M94' },
      'M100': { t1: 'M95', t2: 'M96' },
      'M101': { t1: 'M97', t2: 'M98' },
      'M102': { t1: 'M99', t2: 'M100' },
      'M103': { t1: 'M101', t2: 'M102' },
      'M104': { t1: 'M101', t2: 'M102' }
    };

    const p = parents[matchId];
    if (!p) return slot === 'team1' ? (match?.team1 || 'Eq. 1') : (match?.team2 || 'Eq. 2');

    const parentMatchId = slot === 'team1' ? p.t1 : p.t2;

    if (matchId === 'M103') {
      return resolveLoserOf(parentMatchId, matchesList);
    } else {
      return resolveWinnerOf(parentMatchId, matchesList);
    }
  }

  function resolveWinnerOf(matchId: string, matchesList: Match[]): string {
    const match = matchesList.find(m => m.id === matchId);
    if (!match) return `Ganador ${matchId}`;

    const winnerSlot = getKnockoutWinnerSlot(match.realResult);
    if (winnerSlot === 'team1') {
      return resolveTeamName(matchId, 'team1', matchesList);
    }
    if (winnerSlot === 'team2') {
      return resolveTeamName(matchId, 'team2', matchesList);
    }
    return `Ganador ${matchId}`;
  }

  function resolveLoserOf(matchId: string, matchesList: Match[]): string {
    const match = matchesList.find(m => m.id === matchId);
    if (!match) return `Perdedor ${matchId}`;

    const winnerSlot = getKnockoutWinnerSlot(match.realResult);
    if (winnerSlot === 'team1') {
      return resolveTeamName(matchId, 'team2', matchesList);
    }
    if (winnerSlot === 'team2') {
      return resolveTeamName(matchId, 'team1', matchesList);
    }
    return `Perdedor ${matchId}`;
  }

  // Extract unique group names (excluding the Knockout Stage group!)
  const groupNames = Array.from(new Set(matches.map(m => m.group).filter(g => g && g !== 'Fase Eliminatoria' && g !== 'Knockout Stage'))) as string[];
  const sortedGroupNames = groupNames.sort((a, b) => a.localeCompare(b));

  // Compute played matches and total matches
  const playedMatchesCount = matches.filter(m => m.realResult && m.realResult.trim() !== '' && m.realResult.trim() !== '-').length;
  const totalMatchesCount = matches.length;

  // Knockout match objects resolving dynamic country progression
  const getKnockoutMatch = (id: string, defaultT1: string, defaultT2: string, defaultDate: string, defaultTime: string, defaultVenue: string): Match => {
    const found = matches.find(m => m.id === id);
    const resolvedT1 = resolveTeamName(id, 'team1', matches);
    const resolvedT2 = resolveTeamName(id, 'team2', matches);

    if (found) {
      return {
        ...found,
        team1: resolvedT1,
        team2: resolvedT2
      };
    }
    return {
      id,
      team1: resolvedT1 || defaultT1,
      team2: resolvedT2 || defaultT2,
      group: lang === 'es' ? 'Fase Eliminatoria' : 'Knockout Stage',
      date: defaultDate,
      time: defaultTime,
      ground: defaultVenue,
      realResult: realResults.matches[id] || ''
    };
  };

  const r32Ids = ['M73', 'M74', 'M75', 'M76', 'M77', 'M78', 'M79', 'M80', 'M81', 'M82', 'M83', 'M84', 'M85', 'M86', 'M87', 'M88'];
  const r16Ids = ['M89', 'M90', 'M91', 'M92', 'M93', 'M94', 'M95', 'M96'];
  const qfIds = ['M97', 'M98', 'M99', 'M100'];
  const sfIds = ['M101', 'M102'];

  const r32Matches = r32Ids.map(id => getKnockoutMatch(id, 'Eq. 1', 'Eq. 2', '28 Jun 2026', '15:00 UTC-7', 'Los Angeles Stadium'));
  const r16Matches = r16Ids.map(id => getKnockoutMatch(id, 'Ganador M73', 'Ganador M74', '4 Jul 2026', '16:00 UTC-7', 'Seattle Stadium'));
  const qfMatches = qfIds.map(id => getKnockoutMatch(id, 'Ganador M89', 'Ganador M90', '9 Jul 2026', '17:00 UTC-4', 'Boston Stadium'));
  const sfMatches = sfIds.map(id => getKnockoutMatch(id, 'Ganador M97', 'Ganador M98', '14 Jul 2026', '19:00 UTC-5', 'Dallas Stadium'));
  
  const thirdPlaceMatch = getKnockoutMatch('M103', 'Perdedor M101', 'Perdedor M102', '18 Jul 2026', '15:00 UTC-5', 'Miami Stadium');
  const finalMatch = getKnockoutMatch('M104', 'Ganador M101', 'Ganador M102', '19 Jul 2026', '16:00 UTC-4', 'New York NJ Stadium');

  const bracketH = 920;

  // Split matches for Left and Right wings of the bracket
  // Order within each side must match the visual bracket pairing:
  // Left:  M73+M75→M89, M74+M77→M90, M76+M78→M91, M79+M80→M92
  // Right: M83+M84→M93, M81+M82→M94, M86+M88→M95, M85+M87→M96
  const r32LeftMatches = [
    r32Matches[0], // M73 ─┐
    r32Matches[2], // M75 ─┘→ M89
    r32Matches[1], // M74 ─┐
    r32Matches[4], // M77 ─┘→ M90
    r32Matches[3], // M76 ─┐
    r32Matches[5], // M78 ─┘→ M91
    r32Matches[6], // M79 ─┐
    r32Matches[7]  // M80 ─┘→ M92
  ];
  
  const r32RightMatches = [
    r32Matches[10], // M83 ─┐
    r32Matches[11], // M84 ─┘→ M93
    r32Matches[8],  // M81 ─┐
    r32Matches[9],  // M82 ─┘→ M94
    r32Matches[13], // M86 ─┐
    r32Matches[15], // M88 ─┘→ M95
    r32Matches[12], // M85 ─┐
    r32Matches[14]  // M87 ─┘→ M96
  ];

  const r16LeftMatches = [
    r16Matches[0], // M89
    r16Matches[1], // M90
    r16Matches[2], // M91
    r16Matches[3]  // M92
  ];

  const r16RightMatches = [
    r16Matches[4], // M93
    r16Matches[5], // M94
    r16Matches[6], // M95
    r16Matches[7]  // M96
  ];

  const qfLeftMatches = [
    qfMatches[0], // M97
    qfMatches[1]  // M98
  ];

  const qfRightMatches = [
    qfMatches[2], // M99
    qfMatches[3]  // M100
  ];

  const sfLeftMatch = sfMatches[0]; // M101
  const sfRightMatch = sfMatches[1]; // M102

  const renderBracketMatchCard = (m: Match) => {
    const isT1Real = m.team1.length === 3;
    const isT2Real = m.team2.length === 3;
    const realScore = realResults.matches[m.id];

    // Parse scores if played
    let s1 = '';
    let s2 = '';
    if (realScore && realScore.trim() !== '' && realScore.trim() !== '-') {
      const parts = realScore.split('-');
      if (parts.length >= 2) {
        s1 = parts[0].trim();
        s2 = parts[1].trim();
      }
    }

    const mNum = parseInt(m.id.substring(1), 10);
    let borderLeftColor = 'var(--accent-blue)';
    if (mNum >= 73 && mNum <= 88) borderLeftColor = '#3b82f6'; // R32
    else if (mNum >= 89 && mNum <= 96) borderLeftColor = '#6366f1'; // R16
    else if (mNum >= 97 && mNum <= 100) borderLeftColor = '#8b5cf6'; // QF
    else if (mNum >= 101 && mNum <= 102) borderLeftColor = '#ec4899'; // SF
    else if (mNum >= 103 && mNum <= 104) borderLeftColor = '#fbbf24'; // Finals

    if (bracketViewMode === 'detailed') {
      return (
        <div 
          key={m.id} 
          className="knockout-match-card animate-fade-in"
          onClick={() => setSelectedMatchForPredictions(m)}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(42, 44, 46, 0.1)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{
            padding: '0.75rem 1rem',
            minWidth: '175px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            borderLeft: `4px solid ${borderLeftColor}`
          }}
          title={lang === 'es' ? 'Clic para ver pronósticos' : 'Click to view participant predictions'}
        >
          <div className="k-match-header">
            <span className="k-match-id">{m.id}</span>
            <span className="k-match-date">📅 {formatMatchDateToClient(m.date, m.time, lang)} - {formatMatchTimeToClient(m.date, m.time, lang)}</span>
          </div>
          
          <div className="k-match-teams" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
            <div className="k-team" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
              {isT1Real ? (
                <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '18px', height: '12px', borderRadius: '2px', flexShrink: 0 }} />
              ) : (
                <span className="k-flag" style={{ fontSize: '0.8rem' }}>🏳️</span>
              )}
              <span className="k-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }} title={normalizeTeamCode(m.team1)}>
                {normalizeTeamCode(m.team1)}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '35px', flexShrink: 0 }}>
              {realScore ? (
                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '0.05rem 0.35rem', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                  {realScore}
                </span>
              ) : (
                <div className="k-vs" style={{ fontSize: '0.82rem' }}>vs</div>
              )}
            </div>

            <div className="k-team" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end', minWidth: 0 }}>
              <span className="k-name" style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem' }} title={normalizeTeamCode(m.team2)}>
                {normalizeTeamCode(m.team2)}
              </span>
              {isT2Real ? (
                <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '18px', height: '12px', borderRadius: '2px', flexShrink: 0 }} />
              ) : (
                <span className="k-flag" style={{ fontSize: '0.8rem' }}>🏳️</span>
              )}
            </div>
          </div>

          <div className="k-match-footer">
            <span className="k-venue" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.ground}>🏟️ {m.ground}</span>
          </div>
        </div>
      );
    }

    // GORGEOUS 2-ROW ESPN/CHALLONGE STYLE VERTICAL CARD (COMPACT VIEW)
    return (
      <div 
        key={m.id} 
        className="knockout-match-card animate-fade-in"
        onClick={() => setSelectedMatchForPredictions(m)}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = theme === 'dark' 
            ? '0 6px 16px rgba(0, 0, 0, 0.4)' 
            : '0 6px 16px rgba(42, 44, 46, 0.15)';
          
          const bgs = getHoverBackgroundStyles(m, isT1Real, isT2Real);
          e.currentTarget.style.backgroundImage = bgs.backgroundImage;
          e.currentTarget.style.backgroundPosition = bgs.backgroundPosition;
          e.currentTarget.style.backgroundSize = bgs.backgroundSize;
          e.currentTarget.style.backgroundRepeat = 'no-repeat';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.backgroundImage = 'none';
          e.currentTarget.style.backgroundColor = 'var(--card-bg)';
        }}
        style={{
          padding: '0.35rem 0.6rem',
          width: '180px',
          height: '62px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '0.2rem',
          overflow: 'hidden',
          borderLeft: `4px solid ${borderLeftColor}`,
          backgroundColor: 'var(--card-bg)',
          border: '1.5px solid var(--border)',
          borderLeftWidth: '4px',
          borderRadius: '8px',
          boxShadow: 'var(--shadow)',
          cursor: 'pointer',
          fontSize: '0.82rem',
          fontWeight: 'bold',
          position: 'relative'
        }}
        title={lang === 'es' ? `Clic para ver pronósticos - Partido ${m.id}` : `Click to view predictions - Match ${m.id}`}
      >
        {/* Team 1 Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0, flex: 1 }}>
            {isT1Real ? (
              <img src={getFlagImgUrl(m.team1)} alt={m.team1} style={{ width: '16px', height: '11px', borderRadius: '1px', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>🏳️</span>
            )}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
              {normalizeTeamCode(m.team1)}
            </span>
          </div>
          <span style={{ color: s1 !== '' ? '#059669' : 'var(--text-light)', minWidth: '15px', textAlign: 'right', fontWeight: '800' }}>
            {s1 !== '' ? s1 : '-'}
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--border)', width: '100%', opacity: 0.5 }} />

        {/* Team 2 Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0, flex: 1 }}>
            {isT2Real ? (
              <img src={getFlagImgUrl(m.team2)} alt={m.team2} style={{ width: '16px', height: '11px', borderRadius: '1px', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>🏳️</span>
            )}
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
              {normalizeTeamCode(m.team2)}
            </span>
          </div>
          <span style={{ color: s2 !== '' ? '#059669' : 'var(--text-light)', minWidth: '15px', textAlign: 'right', fontWeight: '800' }}>
            {s2 !== '' ? s2 : '-'}
          </span>
        </div>
      </div>
    );
  };

  // Helper to render connection lines between rounds in Compact View (with smooth curves!)
  const renderBracketConnectorColumn = (type: 'left-fork' | 'right-fork' | 'straight', count: number, H: number) => {
    return (
      <div className="bracket-connector-column" style={{ width: '40px', height: `${H}px`, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center' }}>
        <svg width="40" height={H} style={{ display: 'block', position: 'absolute', top: 0, left: 0 }}>
          {type === 'straight' && (
            <line x1="0" y1={H / 2} x2="40" y2={H / 2} stroke="var(--border)" strokeWidth="2" strokeDasharray="4 3" opacity="0.8" />
          )}
          
          {type === 'left-fork' && Array.from({ length: count }).map((_, j) => {
            const y_top = (2 * j + 0.5) * (H / (count * 2));
            const y_bottom = (2 * j + 1.5) * (H / (count * 2));
            const y_mid = (j + 0.5) * (H / count);
            return (
              <g key={j} opacity="0.8">
                {/* Beautiful S-Curves merging smoothly! */}
                <path
                  d={`M 0,${y_top} C 20,${y_top} 20,${y_mid} 40,${y_mid} M 0,${y_bottom} C 20,${y_bottom} 20,${y_mid} 40,${y_mid}`}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
              </g>
            );
          })}

          {type === 'right-fork' && Array.from({ length: count }).map((_, j) => {
            const y_mid = (j + 0.5) * (H / count);
            const y_top = (2 * j + 0.5) * (H / (count * 2));
            const y_bottom = (2 * j + 1.5) * (H / (count * 2));
            return (
              <g key={j} opacity="0.8">
                {/* Beautiful S-Curves split smoothly! */}
                <path
                  d={`M 40,${y_top} C 20,${y_top} 20,${y_mid} 0,${y_mid} M 40,${y_bottom} C 20,${y_bottom} 20,${y_mid} 0,${y_mid}`}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  // Helper to render a match card in the Detailed List View
  const renderDetailedListMatchCard = (m: Match, roundLabel: string) => {
    const realScore = realResults.matches[m.id];
    const isT1Real = m.team1.length === 3;
    const isT2Real = m.team2.length === 3;

    return (
      <div 
        key={m.id} 
        className="match-card animate-fade-in"
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = theme === 'dark' 
            ? '0 6px 16px rgba(0, 0, 0, 0.4)' 
            : '0 6px 16px rgba(42, 44, 46, 0.15)';
          
          const bgs = getHoverBackgroundStyles(m, isT1Real, isT2Real);
          e.currentTarget.style.backgroundImage = bgs.backgroundImage;
          e.currentTarget.style.backgroundPosition = bgs.backgroundPosition;
          e.currentTarget.style.backgroundSize = bgs.backgroundSize;
          e.currentTarget.style.backgroundRepeat = 'no-repeat';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'var(--shadow)';
          e.currentTarget.style.backgroundImage = 'none';
          e.currentTarget.style.backgroundColor = 'var(--card-bg)';
        }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          padding: '1.2rem',
          background: 'var(--card-bg)',
          borderRadius: '10px',
          boxShadow: 'var(--shadow)',
          border: '1.5px solid var(--border)',
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-light)', borderBottom: '1px dashed var(--border)', paddingBottom: '0.5rem' }}>
          <span style={{ fontWeight: '800', color: 'var(--accent-blue)' }}>{roundLabel} - {m.id}</span>
          {m.ground && <span>🏟️ {m.ground}</span>}
        </div>

        <div 
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', cursor: 'pointer' }}
          onClick={() => setSelectedMatchForPredictions(m)}
          title={lang === 'es' ? 'Clic para ver pronósticos de participantes' : 'Click to view participant predictions'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
            {isT1Real ? (
              <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '24px', height: '16px', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: '0.8rem' }}>🏳️</span>
            )}
            <strong style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{normalizeTeamCode(m.team1)}</strong>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '75px', flexShrink: 0 }}>
            {realScore ? (
              <span style={{ fontSize: '1rem', fontWeight: '900', color: '#059669', background: '#ecfdf5', padding: '0.15rem 0.5rem', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                {realScore}
              </span>
            ) : (
              <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-light)', background: 'var(--border)', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>vs</span>
            )}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-light)', marginTop: '0.35rem' }}>
              {formatMatchTimeToClient(m.date, m.time, lang)}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, justifyContent: 'flex-end', minWidth: 0 }}>
            <strong style={{ fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>{normalizeTeamCode(m.team2)}</strong>
            {isT2Real ? (
              <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '24px', height: '16px', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', flexShrink: 0 }} />
            ) : (
              <span style={{ fontSize: '0.8rem' }}>🏳️</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed var(--border)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)' }}>
            📅 {formatMatchDateToClient(m.date, m.time, lang)}
          </span>
          <button 
            type="button"
            className="calendar-action-btn"
            onClick={() => setSelectedMatchForPredictions(m)}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
          >
            {lang === 'es' ? 'Ver Pronósticos 🔎' : 'View Predictions 🔎'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="card tournament-bracket">
      <div className="bracket-header">
        <div>
          <h2>{t.tbTitle}</h2>
          <p className="bracket-subtitle" style={{ margin: 0 }}>{t.tbSubtitle}</p>
        </div>

        {/* Center: Countdown card with progress bar */}
        <div className="bracket-header-center" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="progress-card" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', 
            border: '1px solid #bfdbfe',
            padding: '0.6rem 1.2rem',
            borderRadius: '12px',
            boxShadow: '0 4px 12px rgba(29, 78, 216, 0.08)',
            userSelect: 'none',
            minWidth: '180px',
            textAlign: 'center',
          }}
          title={lang === 'es' ? `${playedMatchesCount} partidos jugados de ${totalMatchesCount} totales` : `${playedMatchesCount} matches played of ${totalMatchesCount} total`}
          >
            <span style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1 }}>
              {lang === 'es' ? 'Partidos Jugados' : 'Played Matches'}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginTop: '4px', marginBottom: '6px' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--accent-blue)', lineHeight: 1 }}>
                {playedMatchesCount}
              </span>
              <span style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--accent-blue)', opacity: 0.85 }}>
                / {totalMatchesCount}
              </span>
            </div>
            {/* Animated progress bar track */}
            <div style={{ 
              width: '100%', 
              backgroundColor: '#dbeafe', 
              height: '6px', 
              borderRadius: '9999px',
              overflow: 'hidden'
            }}>
              {/* Animated progress bar fill */}
              <div style={{ 
                width: `${(playedMatchesCount / totalMatchesCount) * 100}%`, 
                background: 'linear-gradient(90deg, #2A398D 0%, #E61D25 100%)', 
                height: '100%',
                borderRadius: '9999px',
                transition: 'width 0.5s ease-out'
              }} />
            </div>
          </div>
        </div>

        {/* Right: Sub-tabs */}
        <div className="sub-tabs">
          <button 
            className={`sub-tab-btn ${subTab === 'groups' ? 'active' : ''}`}
            onClick={() => {
              setSubTab('groups');
              setSelectedGroupFilter('All');
            }}
          >
            {t.tbTabGroups}
          </button>
          <button 
            className={`sub-tab-btn ${subTab === 'knockout' ? 'active' : ''}`}
            onClick={() => setSubTab('knockout')}
          >
            {t.tbTabKnockout}
          </button>
        </div>
      </div>

      {subTab === 'groups' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Back Button to All Groups */}
          {selectedGroupFilter !== 'All' && (
            <button
              onClick={() => setSelectedGroupFilter('All')}
              className="animate-fade-in"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                border: 'none',
                background: 'none',
                color: 'var(--primary)',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                cursor: 'pointer',
                padding: '0.25rem 0',
                alignSelf: 'flex-start',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
            >
              ← {lang === 'es' ? 'Volver a todos los grupos' : 'Back to all groups'}
            </button>
          )}

          {/* GROUPS STANDINGS VIEW */}
          <div className={selectedGroupFilter === 'All' ? "bracket-groups-grid" : ""} style={selectedGroupFilter !== 'All' ? { display: 'flex', justifyContent: 'center' } : {}}>
            {(selectedGroupFilter === 'All' ? sortedGroupNames : [selectedGroupFilter]).map(gName => {
              const standings = calculateGroupStandings(gName, matches, realResults);
              const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[gName] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };

              return (
                <div 
                  key={gName} 
                  className={`group-standings-card ${selectedGroupFilter === 'All' ? 'clickable-card' : ''}`}
                  onClick={selectedGroupFilter === 'All' ? () => setSelectedGroupFilter(gName) : undefined}
                  style={{ 
                    borderTop: `4px solid ${colors.border}`, 
                    width: selectedGroupFilter !== 'All' ? '100%' : undefined, 
                    maxWidth: selectedGroupFilter !== 'All' ? '500px' : undefined,
                    cursor: selectedGroupFilter === 'All' ? 'pointer' : 'default'
                  }}
                  title={selectedGroupFilter === 'All' ? (lang === 'es' ? `Ver partidos y detalles de ${gName}` : `View matches and details of ${gName}`) : undefined}
                >
                  <h3 
                    className="group-standings-title"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {gName}
                  </h3>
                  <table className="standings-table">
                    <thead>
                      <tr>
                        <th>{t.tbColPos}</th>
                        <th>{t.tbColTeam}</th>
                        <th>{t.tbColGP}</th>
                        <th>{t.tbColGD}</th>
                        <th>{t.tbColPts}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((stat, idx) => {
                        const isQualified = idx < 2; // top 2 qualify directly
                        const normalizedTeamCode = normalizeTeamCode(stat.team);
                        return (
                          <tr 
                            key={stat.team} 
                            className={isQualified ? 'qualified-row' : ''}
                          >
                            <td className="pos">{idx + 1}</td>
                            <td className="team-cell">
                              <img src={getFlagImgUrl(normalizedTeamCode)} alt={normalizedTeamCode} className="flag-icon-img table-flag" />
                              <span className="name">{normalizedTeamCode}</span>
                            </td>
                            <td>{stat.gp}</td>
                            <td className={stat.gd > 0 ? 'gd-positive' : stat.gd < 0 ? 'gd-negative' : ''}>
                              {stat.gd > 0 ? `+${stat.gd}` : stat.gd}
                            </td>
                            <td className="pts"><strong>{stat.pts}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          {/* Group Matches (Only when a single group is filtered) */}
          {selectedGroupFilter !== 'All' && (
            <div className="animate-fade-in" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
              <h3 className="section-title" style={{ marginBottom: '1.2rem', fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚽ {t.mpGroupMatches} - {selectedGroupFilter}
              </h3>
              <div className="matches-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.2rem' }}>
                {matches
                  .filter(m => m.group === selectedGroupFilter)
                  .map(m => {
                    const realScore = realResults.matches[m.id];
                    const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[selectedGroupFilter] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
                    return (
                      <div 
                        key={m.id} 
                        className="match-card animate-fade-in"
                        style={{ 
                          borderTop: `4px solid ${colors.border}`, 
                          display: 'flex', 
                          flexDirection: 'column', 
                          justifyContent: 'space-between', 
                          gap: '0.75rem', 
                          padding: '1rem', 
                          background: 'var(--card-bg)', 
                          borderRadius: '8px', 
                          boxShadow: 'var(--shadow)', 
                          border: '1.5px solid var(--border)' 
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-light)', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.35rem' }}>
                          <span style={{ fontWeight: 'bold' }}>{m.id}</span>
                          {m.date && <span>📅 {formatMatchDateToClient(m.date, m.time, lang)} @ {formatMatchTimeToClient(m.date, m.time, lang)}</span>}
                        </div>

                        <div 
                          className="match-teams-display"
                          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.5rem 0' }}
                          onClick={() => setSelectedMatchForPredictions(m)}
                          title={lang === 'es' ? 'Clic para ver pronósticos de participantes' : 'Click to view participant predictions'}
                        >
                          <span className="team" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '30px', height: '20px', borderRadius: '2px' }} />
                            <span className="team-name" style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{normalizeTeamCode(m.team1)}</span>
                          </span>
                          
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem', minWidth: '50px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: 'var(--text-light)', background: '#f3f4f6', padding: '0.05rem 0.35rem', borderRadius: '8px' }}>vs</span>
                            {realScore ? (
                              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid #a7f3d0' }}>
                                {realScore}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic' }}>-</span>
                            )}
                          </div>

                          <span className="team" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '30px', height: '20px', borderRadius: '2px' }} />
                            <span className="team-name" style={{ fontSize: '0.8rem', fontWeight: 'bold', marginTop: '0.25rem' }}>{normalizeTeamCode(m.team2)}</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // KNOCKOUT SCHEDULE VIEW
        <div className="knockout-schedule-container">
          {/* Contextual Toolbar with Info Alert and View Mode Selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
            <div className="knockout-alert-info" style={{ margin: 0 }}>
              💡 <strong>{t.tbFormatLabel}</strong> {t.tbFormatDesc}
            </div>
            
            {/* Detailed / Compact switcher pill button */}
            <div style={{ display: 'flex', backgroundColor: 'var(--border)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={() => setBracketViewMode('detailed')}
                style={{
                  background: bracketViewMode === 'detailed' ? 'var(--card-bg)' : 'none',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  color: bracketViewMode === 'detailed' ? 'var(--text)' : 'var(--text-light)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {lang === 'es' ? '📋 Detallado' : '📋 Detailed'}
              </button>
              <button
                type="button"
                onClick={() => setBracketViewMode('compact')}
                style={{
                  background: bracketViewMode === 'compact' ? 'var(--card-bg)' : 'none',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 'bold',
                  color: bracketViewMode === 'compact' ? 'var(--text)' : 'var(--text-light)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {lang === 'es' ? '⚡ Compacto' : '⚡ Compact'}
              </button>
            </div>
          </div>

          {bracketViewMode === 'detailed' ? (
            <div className="detailed-list-container animate-fade-in" style={{ padding: '0.5rem' }}>
              {/* Round filter buttons pill selector */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1.5px solid var(--border)', paddingBottom: '0.85rem' }}>
                {[
                  { id: 'all', label: lang === 'es' ? 'Todos' : 'All' },
                  { id: 'r32', label: '1/16' },
                  { id: 'r16', label: '1/8' },
                  { id: 'qf', label: '1/4' },
                  { id: 'sf', label: lang === 'es' ? 'Semifinales' : 'Semifinals' },
                  { id: 'finals', label: lang === 'es' ? 'Finales' : 'Finals' }
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRoundFilter(r.id as any)}
                    style={{
                      padding: '0.4rem 1rem',
                      fontSize: '0.78rem',
                      fontWeight: '800',
                      borderRadius: '20px',
                      border: '1.5px solid var(--border)',
                      backgroundColor: selectedRoundFilter === r.id ? 'var(--accent-blue)' : 'var(--card-bg)',
                      color: selectedRoundFilter === r.id ? (theme === 'dark' ? '#0c0d1e' : 'white') : 'var(--text-light)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      boxShadow: selectedRoundFilter === r.id ? '0 2px 4px rgba(59, 130, 246, 0.2)' : 'none'
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Vertical match list filtered by round */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                {(selectedRoundFilter === 'all' || selectedRoundFilter === 'r32') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 'bold', borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', color: 'var(--text-light)' }}>
                      {lang === 'es' ? '1/16 de Final (Dieciseisavos)' : 'Round of 32'}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                      {r32Matches.map(m => renderDetailedListMatchCard(m, '1/16'))}
                    </div>
                  </div>
                )}
                
                {(selectedRoundFilter === 'all' || selectedRoundFilter === 'r16') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', fontWeight: 'bold', borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', color: 'var(--text-light)' }}>
                      {lang === 'es' ? '1/8 de Final (Octavos)' : 'Round of 16'}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                      {r16Matches.map(m => renderDetailedListMatchCard(m, '1/8'))}
                    </div>
                  </div>
                )}

                {(selectedRoundFilter === 'all' || selectedRoundFilter === 'qf') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', fontWeight: 'bold', borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', color: 'var(--text-light)' }}>
                      {lang === 'es' ? '1/4 de Final (Cuartos)' : 'Quarterfinals'}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                      {qfMatches.map(m => renderDetailedListMatchCard(m, '1/4'))}
                    </div>
                  </div>
                )}

                {(selectedRoundFilter === 'all' || selectedRoundFilter === 'sf') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', fontWeight: 'bold', borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', color: 'var(--text-light)' }}>
                      {lang === 'es' ? 'Semifinales' : 'Semifinals'}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                      {sfMatches.map(m => renderDetailedListMatchCard(m, lang === 'es' ? 'Semifinal' : 'Semifinal'))}
                    </div>
                  </div>
                )}

                {(selectedRoundFilter === 'all' || selectedRoundFilter === 'finals') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <h4 style={{ margin: '0.5rem 0 0 0', fontSize: '0.95rem', fontWeight: 'bold', borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', color: 'var(--text-light)' }}>
                      {lang === 'es' ? 'Tercer Puesto y Gran Final' : 'Third Place & Final'}
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                      {renderDetailedListMatchCard(finalMatch, lang === 'es' ? 'Gran Final' : 'Final')}
                      {renderDetailedListMatchCard(thirdPlaceMatch, lang === 'es' ? '3er Puesto' : '3rd Place')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="compact-bracket-canvas-view animate-fade-in" style={{ width: '100%', overflowX: 'auto', padding: '1rem 0' }}>
              <div className="bracket-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: `${bracketH}px`, minWidth: '1980px', gap: 0, margin: '0 auto', padding: 0 }}>
                
                {/* 1. Left Wing: Round of 32 */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {r32LeftMatches.map(m => renderBracketMatchCard(m))}
                </div>

                {/* Left Connector 1: R32 -> R16 */}
                {renderBracketConnectorColumn('left-fork', 4, bracketH)}

                {/* 2. Left Wing: Round of 16 */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {r16LeftMatches.map(m => renderBracketMatchCard(m))}
                </div>

                {/* Left Connector 2: R16 -> QF */}
                {renderBracketConnectorColumn('left-fork', 2, bracketH)}

                {/* 3. Left Wing: Quarterfinals */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {qfLeftMatches.map(m => renderBracketMatchCard(m))}
                </div>

                {/* Left Connector 3: QF -> SF */}
                {renderBracketConnectorColumn('left-fork', 1, bracketH)}

                {/* 4. Left Wing: Semifinal */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {renderBracketMatchCard(sfLeftMatch)}
                </div>

                {/* Left Connector 4: SF -> Final */}
                {renderBracketConnectorColumn('straight', 1, bracketH)}

                {/* 5. Center Column: Finals, Champion Cup, Third Place */}
                <div className="bracket-round-column center-finals" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1.75rem', height: `${bracketH}px`, width: '210px', flexShrink: 0 }}>
                  {/* Champion Podium */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', userSelect: 'none', background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.06) 100%)', border: '1.5px solid #fbbf24', borderRadius: '12px', padding: '0.65rem 1rem', boxShadow: '0 4px 12px rgba(245, 158, 11, 0.1)', width: '100%', boxSizing: 'border-box' }}>
                    <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>🏆</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: '900', color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.35rem' }}>
                      {lang === 'es' ? 'CAMPEÓN MUNDIAL' : 'WORLD CHAMPION'}
                    </span>
                    <strong style={{ fontSize: '1.05rem', color: 'var(--text)', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>
                      {resolveWinnerOf('M104', matches) === 'Ganador M104' ? '?' : normalizeTeamCode(resolveWinnerOf('M104', matches))}
                    </strong>
                  </div>

                  {/* Grand Final Match Card */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                      ⭐ {lang === 'es' ? 'GRAN FINAL' : 'GRAND FINAL'} ⭐
                    </span>
                    {renderBracketMatchCard(finalMatch)}
                  </div>

                  {/* Third Place Match Card */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                      🥉 {lang === 'es' ? 'TERCER PUESTO' : 'THIRD PLACE'}
                    </span>
                    {renderBracketMatchCard(thirdPlaceMatch)}
                  </div>
                </div>

                {/* Right Connector 4: Final <- SF */}
                {renderBracketConnectorColumn('straight', 1, bracketH)}

                {/* 6. Right Wing: Semifinal */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {renderBracketMatchCard(sfRightMatch)}
                </div>

                {/* Right Connector 3: SF <- QF */}
                {renderBracketConnectorColumn('right-fork', 1, bracketH)}

                {/* 7. Right Wing: Quarterfinals */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {qfRightMatches.map(m => renderBracketMatchCard(m))}
                </div>

                {/* Right Connector 2: QF <- R16 */}
                {renderBracketConnectorColumn('right-fork', 2, bracketH)}

                {/* 8. Right Wing: Round of 16 */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {r16RightMatches.map(m => renderBracketMatchCard(m))}
                </div>

                {/* Right Connector 1: R16 <- R32 */}
                {renderBracketConnectorColumn('right-fork', 4, bracketH)}

                {/* 9. Right Wing: Round of 32 */}
                <div className="bracket-round-column" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', height: `${bracketH}px`, width: '180px', flexShrink: 0 }}>
                  {r32RightMatches.map(m => renderBracketMatchCard(m))}
                </div>

              </div>
            </div>
          )}
        </div>
      )}
      {selectedMatchForPredictions && (
        <MatchPredictionsModal
          match={selectedMatchForPredictions}
          participants={participants}
          realScore={realResults.matches[selectedMatchForPredictions.id]}
          lang={lang}
          onClose={() => setSelectedMatchForPredictions(null)}
          onNavigateToParticipant={(p) => {
            if (onNavigateToParticipant) {
              onNavigateToParticipant(p, selectedMatchForPredictions.id);
            }
          }}
        />
      )}
    </div>
  );
}

