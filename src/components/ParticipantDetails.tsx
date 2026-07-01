import { useState, useEffect, useRef, useMemo } from 'react';
import { Participant, Match, AppState, Predictions } from '../domain/types';
import { normalizeTeamCode, getFlagImgUrl } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { formatMatchLocalDateTime, getKickoffTimeMs, getOriginalMatchDateTime } from '../utils/timezone';
import { calculateGroupStandings } from '../utils/standings';
import confetti from 'canvas-confetti';

interface Props {
  participant: Participant;
  matches: Match[];
  realResults: AppState['realResults'];
  onClose: () => void;
  onSavePredictions: (name: string, updatedPredictions: Predictions, password?: string) => Promise<void>;
  lang: Lang;
  theme?: 'light' | 'dark';
  isAdmin?: boolean;
  initialMatchId?: string | null;
}

const SCORE_OPTIONS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const parseScore = (scoreStr: string | undefined): [string, string] => {
  if (!scoreStr) return ['', ''];
  // Strip anything in parentheses: e.g. "1-1 (Q1)" -> "1-1", or "1-1 (4-3)" -> "1-1"
  const baseScore = scoreStr.split('(')[0].trim();
  if (!baseScore.includes('-')) return ['', ''];
  const parts = baseScore.split('-');
  return [parts[0].trim(), parts[1].trim()];
};

// Group colors for the cards & headers in Light Mode
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

// Group colors for the cards & headers in Dark Mode
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

const LOCK_BEFORE_KICKOFF_MS = 20 * 60 * 1000; // 20 minutes before match

function isMatchLocked(m: Match, isAdmin = false): boolean {
  if (isAdmin) return false;

  const kickoffTime = getKickoffTimeMs(m);
  if (!kickoffTime) return false;

  return Date.now() >= kickoffTime - LOCK_BEFORE_KICKOFF_MS;
}

export function ParticipantDetails({
  participant,
  matches,
  realResults,
  onSavePredictions,
  lang,
  theme,
  isAdmin = false,
  initialMatchId = null
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedPreds, setEditedPredictions] = useState<Predictions>({ ...participant.predictions });
  const [saving, setSaving] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [verifiedPassword, setVerifiedPassword] = useState<string>('');
  const [matchSearchTerm, setMatchSearchTerm] = useState('');
  const [isGroupStageExpanded, setIsGroupStageExpanded] = useState(true);
  const [isKnockoutExpanded, setIsKnockoutExpanded] = useState(true);
  const t = TRANSLATIONS[lang];

  const matchRefs = useRef<Record<string, HTMLDivElement | null>>({});

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
        'M74': '3º Grupo A/B/C/D/F',
        'M77': '3º Grupo C/D/F/G/H',
        'M79': '3º Grupo C/E/F/H/I',
        'M80': '3º Grupo E/H/I/J/K',
        'M81': '3º Grupo B/E/F/I/J',
        'M82': '3º Grupo A/E/H/I/J',
        'M85': '3º Grupo E/F/G/I/J',
        'M87': '3º Grupo D/E/I/J/L'
      };
      return fallbackLabels[id] || '3º Clasificado';
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

    const ordinal = position === 1 ? '1º' : '2º';
    return `${ordinal} Grupo ${groupLetter}`;
  };

  const getKnockoutWinnerSlot = (scoreStr: string | undefined): 'team1' | 'team2' | null => {
    if (!scoreStr) return null;
    const cleaned = scoreStr.trim();
    if (cleaned === '' || cleaned === '-') return null;

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
  };

  const resolveWinnerOf = (matchId: string, matchesList: Match[]): string => {
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
  };

  const resolveLoserOf = (matchId: string, matchesList: Match[]): string => {
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
  };

  const resolveTeamName = (matchId: string, slot: 'team1' | 'team2', matchesList: Match[]): string => {
    const match = matchesList.find(m => m.id === matchId);

    const mNum = parseInt(matchId.substring(1), 10);
    if (mNum >= 73 && mNum <= 88) {
      if (match && match.team1 && match.team1.length === 3 && match.team2 && match.team2.length === 3) {
        return slot === 'team1' ? match.team1 : match.team2;
      }
      return resolveR32Team(matchId, slot);
    }

    const parents: Record<string, { t1: string, t2: string }> = {
      'M89': { t1: 'M74', t2: 'M77' },
      'M90': { t1: 'M73', t2: 'M75' },
      'M91': { t1: 'M76', t2: 'M78' },
      'M92': { t1: 'M79', t2: 'M80' },
      'M93': { t1: 'M83', t2: 'M84' },
      'M94': { t1: 'M81', t2: 'M82' },
      'M95': { t1: 'M86', t2: 'M88' },
      'M96': { t1: 'M85', t2: 'M87' },
      'M97': { t1: 'M89', t2: 'M90' },
      'M98': { t1: 'M93', t2: 'M94' },
      'M99': { t1: 'M91', t2: 'M92' },
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
  };

  // Sync state if participant changes
  useEffect(() => {
    setEditedPredictions({ ...participant.predictions });
    setIsEditing(false);
    setCreatedPassword(null);
    setVerifiedPassword('');
  }, [participant]);

  // Auto-scroll and highlight selected match
  useEffect(() => {
    if (initialMatchId && matchRefs.current[initialMatchId]) {
      const timer = setTimeout(() => {
        matchRefs.current[initialMatchId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [initialMatchId, participant]);

  // Celebratory confetti trigger when a participant's card has scored a "pleno" (+3 pts / exact match)
  useEffect(() => {
    // 1. If jumping to a highlighted match where they scored a perfect pleno!
    if (initialMatchId) {
      const pts = participant.points.matches[initialMatchId] || 0;
      if (pts >= 3) {
        // Massive burst!
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          zIndex: 10000
        });
        return;
      }
    }

    // 2. Or, if they just open a player's details and they have scored any plenos overall, launch a soft, elegant spray!
    const plenosCount = Object.values(participant.points.matches).filter(pts => pts >= 3).length;
    if (plenosCount > 0) {
      confetti({
        particleCount: 35,
        spread: 45,
        origin: { y: 0.75 },
        scalar: 0.8, // slightly smaller, subtle particles
        zIndex: 10000
      });
    }
  }, [participant, initialMatchId]);

  const handleChangeGeneral = (field: keyof Omit<Predictions, 'matches'>, value: string) => {
    setEditedPredictions(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleScoreChange = (matchId: string, teamIndex: 1 | 2, val: string) => {
    const currentScore = editedPreds.matches[matchId] || '';
    const [s1, s2] = parseScore(currentScore);

    const newScore1 = teamIndex === 1 ? val : s1;
    const newScore2 = teamIndex === 2 ? val : s2;

    let finalScore = '';
    if (newScore1 !== '' || newScore2 !== '') {
      finalScore = `${newScore1}-${newScore2}`;

      // Auto-add qualifier for draws in knockout rounds if not already set
      const isKnockout = matchId.startsWith('M') && parseInt(matchId.substring(1), 10) >= 73;
      if (isKnockout && newScore1 === newScore2 && newScore1 !== '') {
        if (currentScore.toUpperCase().includes('(Q2)')) {
          finalScore += ' (Q2)';
        } else {
          finalScore += ' (Q1)';
        }
      }
    }

    setEditedPredictions(prev => ({
      ...prev,
      matches: {
        ...prev.matches,
        [matchId]: finalScore
      }
    }));
  };

  const handleQualifierChange = (matchId: string, qualifier: 'Q1' | 'Q2') => {
    const currentScore = editedPreds.matches[matchId] || '';
    const [s1, s2] = parseScore(currentScore);
    if (s1 === '' || s2 === '') return;

    const finalScore = `${s1}-${s2} (${qualifier})`;
    setEditedPredictions(prev => ({
      ...prev,
      matches: {
        ...prev.matches,
        [matchId]: finalScore
      }
    }));
  };

  const handleEditClick = () => {
    if (participant.password) {
      // Participant already has a password set. Ask for it!
      const promptText = lang === 'es'
        ? `🔑 Introduce tu contraseña para editar las predicciones de ${participant.name}:`
        : `🔑 Enter your password to edit the predictions for ${participant.name}:`;
      const pwd = window.prompt(promptText);

      if (pwd === participant.password) {
        setVerifiedPassword(pwd);
        setIsEditing(true);
      } else if (pwd !== null) {
        alert(lang === 'es' ? '❌ Contraseña incorrecta.' : '❌ Incorrect password.');
      }
    } else {
      // First-time edit, let them set their password!
      const setupText = lang === 'es'
        ? `🔒 Esta es la primera vez que editas tus predicciones.\nElige una contraseña para protegerlas en el futuro:`
        : `🔒 This is the first time you edit your predictions.\nPlease choose a password to protect them in the future:`;
      const newPwd = window.prompt(setupText);

      if (newPwd && newPwd.trim().length > 0) {
        setCreatedPassword(newPwd.trim());
        setVerifiedPassword(newPwd.trim());
        setIsEditing(true);
      } else if (newPwd !== null) {
        alert(lang === 'es' ? '❌ Debes elegir una contraseña válida para poder editar.' : '❌ You must choose a valid password to start editing.');
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean up partial scores so that only fully completed predictions are saved
      const cleanedMatches: Record<string, string> = {};
      Object.entries(editedPreds.matches).forEach(([matchId, score]) => {
        if (score) {
          const [s1, s2] = parseScore(score);
          if (s1 !== '' && s2 !== '') {
            let finalScore = `${s1}-${s2}`;
            const isKnockout = matchId.startsWith('M') && parseInt(matchId.substring(1), 10) >= 73;
            if (isKnockout && s1 === s2) {
              if (score.toUpperCase().includes('(Q2)')) {
                finalScore += ' (Q2)';
              } else {
                finalScore += ' (Q1)';
              }
            }
            cleanedMatches[matchId] = finalScore;
          } else {
            cleanedMatches[matchId] = '';
          }
        }
      });

      const cleanedPreds = {
        ...editedPreds,
        matches: cleanedMatches
      };

      await onSavePredictions(
        participant.name,
        cleanedPreds,
        createdPassword || verifiedPassword || undefined
      );
      setIsEditing(false);
      setCreatedPassword(null);
      setVerifiedPassword('');
    } finally {
      setSaving(false);
    }
  };

  const isFieldDisabled = (fieldName: keyof Omit<Predictions, 'matches'>) => {
    if (isAdmin) return false;

    const isRealSet = !!realResults[fieldName];
    const isOriginalSet = !!participant.predictions[fieldName] && participant.predictions[fieldName].trim() !== '';
    return isRealSet || isOriginalSet;
  };

  // Filter matches based on search term
  const filteredMatches = matches.filter(m => {
    const term = matchSearchTerm.trim().toLowerCase();
    if (!term) return true;
    const t1 = normalizeTeamCode(m.team1).toLowerCase();
    const t2 = normalizeTeamCode(m.team2).toLowerCase();
    const grp = (m.group || '').toLowerCase();
    const mid = m.id.toLowerCase();
    return t1.includes(term) || t2.includes(term) || grp.includes(term) || mid.includes(term);
  });

  // Group matches by group (separating group stage and knockout stage)
  const groups: Record<string, Match[]> = {};
  const knockoutMatchesList: Match[] = [];

  filteredMatches.forEach(m => {
    const groupName = m.group || 'Other Matches';
    if (groupName === 'Fase Eliminatoria' || groupName === 'Knockout Stage') {
      knockoutMatchesList.push(m);
    } else {
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(m);
    }
  });

  // Sort group stage groups alphabetically
  const sortedGroupNames = Object.keys(groups).sort((a, b) => {
    if (a === 'Other Matches') return 1;
    if (b === 'Other Matches') return -1;
    return a.localeCompare(b);
  });

  // Sort knockout matches numerically by ID (e.g. M73, M74...) representing exact bracket order
  knockoutMatchesList.sort((a, b) => {
    const numA = parseInt(a.id.substring(1), 10);
    const numB = parseInt(b.id.substring(1), 10);
    return numA - numB;
  });

  return (
    <div className="participant-details-view flex flex-col gap-1.5 animate-fade-in" style={{ padding: '0.5rem', maxHeight: '85vh', overflowY: 'auto' }}>
      <div className="details-header flex justify-between items-center" style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text)' }}>
            {t.pdTitle.replace('{name}', participant.name)}
          </h2>
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>
            {t.pdPointsLabel}: <strong style={{ color: 'var(--accent-blue)', fontSize: '1.05rem' }}>{participant.points.total} pts</strong>
          </p>
        </div>
      </div>

      {/* SPECIAL PREDICTIONS ROW */}
      <div className="flex justify-between items-center" style={{ margin: '0.5rem 0', borderBottom: '1px dashed var(--border)', paddingBottom: '0.4rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, borderLeft: '4px solid var(--accent-blue)', paddingLeft: '0.5rem', margin: 0 }}>
          {t.pdSpecialPreds}
        </h3>
        <div>
          {isEditing ? (
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '0.2rem 0.4rem', color: 'var(--accent-green)', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
              title={lang === 'es' ? 'Guardar todos los cambios' : 'Save all changes'}
            >
              💾 {saving ? t.pdSaving : t.pdSaveBtn}
            </button>
          ) : (
            <button
              onClick={handleEditClick}
              style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '0.2rem 0.4rem', color: 'var(--accent-blue)', fontSize: '0.8rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
              title={lang === 'es' ? 'Editar pronósticos' : 'Edit predictions'}
            >
              ✏️ {t.pdEditBtn}
            </button>
          )}
        </div>
      </div>
      <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>

        {/* Ganador Final */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdFinalWinner}</label>
          {isEditing ? (
            <input
              type="text"
              value={editedPreds.ganadorFinal}
              onChange={e => handleChangeGeneral('ganadorFinal', e.target.value)}
              disabled={isFieldDisabled('ganadorFinal')}
              style={{
                padding: '0.4rem',
                border: '1.5px solid var(--border)',
                borderRadius: '4px',
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('ganadorFinal') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.ganadorFinal || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.ganadorFinal || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Max Goleador */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdMaxScorer}</label>
          {isEditing ? (
            <input
              type="text"
              value={editedPreds.maxGoleador}
              onChange={e => handleChangeGeneral('maxGoleador', e.target.value)}
              disabled={isFieldDisabled('maxGoleador')}
              style={{
                padding: '0.4rem',
                border: '1.5px solid var(--border)',
                borderRadius: '4px',
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('maxGoleador') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.maxGoleador || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.maxGoleador || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Max Asistente */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdMaxAssist}</label>
          {isEditing ? (
            <input
              type="text"
              value={editedPreds.maxAsistente}
              onChange={e => handleChangeGeneral('maxAsistente', e.target.value)}
              disabled={isFieldDisabled('maxAsistente')}
              style={{
                padding: '0.4rem',
                border: '1.5px solid var(--border)',
                borderRadius: '4px',
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('maxAsistente') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.maxAsistente || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.maxAsistente || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* World Cup MVP */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdWorldCupMvp}</label>
          {isEditing ? (
            <input
              type="text"
              value={editedPreds.mvp}
              onChange={e => handleChangeGeneral('mvp', e.target.value)}
              disabled={isFieldDisabled('mvp')}
              style={{
                padding: '0.4rem',
                border: '1.5px solid var(--border)',
                borderRadius: '4px',
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('mvp') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.mvp || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.mvp || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

        {/* Spain Stage */}
        <div className="form-group" style={{ margin: 0 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-light)' }}>{t.pdSpainStage}</label>
          {isEditing ? (
            <input
              type="text"
              value={editedPreds.faseEspana}
              onChange={e => handleChangeGeneral('faseEspana', e.target.value)}
              disabled={isFieldDisabled('faseEspana')}
              style={{
                padding: '0.4rem',
                border: '1.5px solid var(--border)',
                borderRadius: '4px',
                fontSize: '0.9rem',
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text)',
                ...(isFieldDisabled('faseEspana') ? { backgroundColor: 'var(--bg)', cursor: 'not-allowed', color: 'var(--text-light)' } : {})
              }}
            />
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '0.2rem 0' }}>
              <span>{participant.predictions.faseEspana || '-'}</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                ({t.pdRealResult} <strong>{realResults.faseEspana || '-'}</strong>)
              </span>
            </div>
          )}
        </div>

      </div>

      {/* MATCH SEARCH BAR */}
      <div style={{ marginBottom: '0.75rem', marginTop: '1.25rem' }}>
        <input
          type="text"
          placeholder={lang === 'es' ? '🔍 Buscar partido por equipo o grupo...' : '🔍 Search match by team or group...'}
          value={matchSearchTerm}
          onChange={e => setMatchSearchTerm(e.target.value)}
          className="predictions-search-input"
        />
      </div>

      {/* MATCH PREDICTIONS GRID */}
      <h3
        onClick={() => setIsGroupStageExpanded(!isGroupStageExpanded)}
        style={{
          fontSize: '1.05rem',
          fontWeight: 700,
          borderLeft: '4px solid var(--accent-green)',
          paddingLeft: '0.5rem',
          margin: '0.5rem 0',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          userSelect: 'none'
        }}
        title={isGroupStageExpanded ? (lang === 'es' ? 'Clic para contraer' : 'Click to collapse') : (lang === 'es' ? 'Clic para expandir' : 'Click to expand')}
      >
        <span>{t.pdGroupStage}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginRight: '0.5rem' }}>
          {isGroupStageExpanded ? '▲' : '▼'}
        </span>
      </h3>

      {isGroupStageExpanded && (
        <div className="details-groups-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          {sortedGroupNames.map(groupName => {
            const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[groupName] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
            return (
              <div
                key={groupName}
                className="details-group-card"
                style={{ border: `1.5px solid var(--border)`, borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow)' }}
              >
                <div
                  style={{
                    backgroundColor: colors.bg,
                    color: colors.text,
                    padding: '0.4rem 1rem',
                    margin: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${colors.border}`
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'inherit' }}>
                    {groupName}
                  </h4>
                  <div>
                    {isEditing ? (
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '0.2rem', fontSize: '1.05rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title={lang === 'es' ? 'Guardar todos los cambios' : 'Save all changes'}
                      >
                        💾
                      </button>
                    ) : (
                      <button
                        onClick={handleEditClick}
                        style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '0.2rem', fontSize: '1.05rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title={lang === 'es' ? 'Editar pronósticos' : 'Edit predictions'}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
                <div className="group-matches-editor-list" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {groups[groupName].map(m => {
                    const pred = isEditing ? editedPreds.matches[m.id] : participant.predictions.matches[m.id];
                    const real = realResults.matches[m.id];
                    const pts = participant.points.matches[m.id] || 0;
                    const timeLocked = isMatchLocked(m, isAdmin);
                    const isLocked = !isAdmin && (!!real || timeLocked);
                    const locked6h = !isAdmin && !real && timeLocked;

                    let ptsClass = 'pts-zero';
                    if (pts === 3) ptsClass = 'pts-exact';
                    if (pts === 1) ptsClass = 'pts-outcome';

                    const isHighlighted = m.id === initialMatchId;

                    return (
                      <div
                        key={m.id}
                        ref={el => { matchRefs.current[m.id] = el; }}
                        className={`detail-match-row ${ptsClass} ${isHighlighted ? 'match-row-highlight' : ''}`}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: '1.5px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          ...(isLocked ? { backgroundColor: 'var(--bg)', opacity: 0.85 } : {})
                        }}
                      >
                        <div className="detail-match-header flex justify-between items-center" style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem', fontSize: '0.8rem' }}>
                          <span className="team-flag-pair flex gap-1 items-center">
                            <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '18px', height: '12px' }} />
                            <span style={isLocked ? { color: 'var(--text-light)' } : {}}>{normalizeTeamCode(m.team1)}</span>
                            <span className="vs-divider text-muted font-normal">vs</span>
                            <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '18px', height: '12px' }} />
                            <span style={isLocked ? { color: 'var(--text-light)' } : {}}>{normalizeTeamCode(m.team2)}</span>
                          </span>
                          {(m.date || m.time || m.kickoffAtUtc) && (
                            <span className="detail-match-date" title={getOriginalMatchDateTime(m)}>
                              📅 {formatMatchLocalDateTime(m, lang)}
                            </span>
                          )}
                          {locked6h && (
                            <span className="detail-lock-badge">
                              🔒 {lang === 'es' ? 'Bloqueado' : 'Locked'}
                            </span>
                          )}
                          {real && real.trim() !== '' && real.trim() !== '-' && (
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              {pts === 3 && <span className="badge-pts-exact">+3</span>}
                              {pts === 1 && <span className="badge-pts-outcome">+1</span>}
                              {pts === 0 && <span className="badge-pts-zero">0</span>}
                            </div>
                          )}
                        </div>

                        <div className="detail-match-scores flex justify-between items-center" style={{ fontSize: '0.9rem' }}>
                          {isEditing ? (
                            (() => {
                              const [s1, s2] = parseScore(pred);
                              const isKnockout = m.id.startsWith('M') && parseInt(m.id.substring(1), 10) >= 73;
                              const isDraw = s1 !== '' && s2 !== '' && s1 === s2;
                              const currentQualifier = pred && pred.toUpperCase().includes('(Q2)') ? 'Q2' : 'Q1';

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                                  <div className="match-score-selectors" style={{ width: '100px' }}>
                                    <select
                                      value={s1}
                                      onChange={e => handleScoreChange(m.id, 1, e.target.value)}
                                      className="score-select"
                                      disabled={isLocked}
                                      style={isLocked ? { backgroundColor: 'var(--bg)', color: 'var(--text-light)', cursor: 'not-allowed', border: '1px solid var(--border)', padding: '0.2rem 0.1rem', fontSize: '0.85rem' } : { padding: '0.2rem 0.1rem', fontSize: '0.85rem' }}
                                    >
                                      {SCORE_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                                      ))}
                                    </select>
                                    <span className="score-divider" style={{ fontSize: '0.9rem' }}>-</span>
                                    <select
                                      value={s2}
                                      onChange={e => handleScoreChange(m.id, 2, e.target.value)}
                                      className="score-select"
                                      disabled={isLocked}
                                      style={isLocked ? { backgroundColor: 'var(--bg)', color: 'var(--text-light)', cursor: 'not-allowed', border: '1px solid var(--border)', padding: '0.2rem 0.1rem', fontSize: '0.85rem' } : { padding: '0.2rem 0.1rem', fontSize: '0.85rem' }}
                                    >
                                      {SCORE_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {isKnockout && isDraw && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.1rem', width: '100%' }}>
                                      <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: 'var(--text-light)' }}>
                                        {lang === 'es' ? 'Pasa ronda:' : 'Qualifies:'}
                                      </span>
                                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        <button
                                          type="button"
                                          disabled={isLocked}
                                          onClick={() => handleQualifierChange(m.id, 'Q1')}
                                          style={{
                                            padding: '0.15rem 0.35rem',
                                            fontSize: '0.65rem',
                                            borderRadius: '4px',
                                            border: currentQualifier === 'Q1' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border)',
                                            backgroundColor: currentQualifier === 'Q1' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg)',
                                            color: currentQualifier === 'Q1' ? 'var(--accent-blue)' : 'var(--text-light)',
                                            fontWeight: currentQualifier === 'Q1' ? 'bold' : 'normal',
                                            cursor: isLocked ? 'not-allowed' : 'pointer'
                                          }}
                                        >
                                          {normalizeTeamCode(m.team1)}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isLocked}
                                          onClick={() => handleQualifierChange(m.id, 'Q2')}
                                          style={{
                                            padding: '0.15rem 0.35rem',
                                            fontSize: '0.65rem',
                                            borderRadius: '4px',
                                            border: currentQualifier === 'Q2' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border)',
                                            backgroundColor: currentQualifier === 'Q2' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg)',
                                            color: currentQualifier === 'Q2' ? 'var(--accent-blue)' : 'var(--text-light)',
                                            fontWeight: currentQualifier === 'Q2' ? 'bold' : 'normal',
                                            cursor: isLocked ? 'not-allowed' : 'pointer'
                                          }}
                                        >
                                          {normalizeTeamCode(m.team2)}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            (() => {
                              const isKnockout = m.id.startsWith('M') && parseInt(m.id.substring(1), 10) >= 73;
                              let predictedQualifierCode = '';
                              if (isKnockout && pred && pred.trim() !== '' && pred.trim() !== '-') {
                                const [ps1, ps2] = parseScore(pred);
                                if (ps1 !== '' && ps2 !== '') {
                                  const pn1 = parseInt(ps1, 10);
                                  const pn2 = parseInt(ps2, 10);
                                  if (pn1 > pn2) predictedQualifierCode = m.team1;
                                  else if (pn2 > pn1) predictedQualifierCode = m.team2;
                                  else {
                                    predictedQualifierCode = pred.toUpperCase().includes('(Q2)') ? m.team2 : m.team1;
                                  }
                                }
                              }
                              return (
                                <span className="match-pred" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                                  <span>Pred: <strong>{pred ? pred.split('(')[0].trim() : '-'}</strong></span>
                                  {predictedQualifierCode && (
                                    <span style={{
                                      color: 'var(--accent-blue)',
                                      fontWeight: '800',
                                      fontSize: '0.68rem',
                                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '4px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.2rem'
                                    }}>
                                      ➔ {normalizeTeamCode(predictedQualifierCode)}
                                    </span>
                                  )}
                                </span>
                              );
                            })()
                          )}
                          <span className="match-real text-muted" style={isLocked ? { color: 'var(--text)', fontWeight: 600 } : {}}>
                            {t.pdRealResult} <strong>{real || '-'}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* KOCKOUT MATCHES SECTION (DASHBOARD GRID AT THE BOTTOM) */}
      {knockoutMatchesList.length > 0 && (
        <>
          <h3
            onClick={() => setIsKnockoutExpanded(!isKnockoutExpanded)}
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              borderLeft: '4px solid var(--accent-blue)',
              paddingLeft: '0.5rem',
              margin: '2rem 0 0.5rem 0',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              userSelect: 'none'
            }}
            title={isKnockoutExpanded ? (lang === 'es' ? 'Clic para contraer' : 'Click to collapse') : (lang === 'es' ? 'Clic para expandir' : 'Click to expand')}
          >
            <span>{lang === 'es' ? 'Fase Eliminatoria' : 'Knockout Stage'}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-light)', marginRight: '0.5rem' }}>
              {isKnockoutExpanded ? '▲' : '▼'}
            </span>
          </h3>

          {isKnockoutExpanded && (
            <div className="details-groups-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
              <div
                className="details-group-card"
                style={{ border: `1.5px solid var(--border)`, borderRadius: '8px', overflow: 'hidden', boxShadow: 'var(--shadow)', gridColumn: '1 / -1' }}
              >
                <div
                  style={{
                    backgroundColor: 'var(--border)',
                    color: 'var(--text)',
                    padding: '0.4rem 1rem',
                    margin: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'inherit' }}>
                    {lang === 'es' ? 'Partidos de Eliminatorias' : 'Knockout Matches'}
                  </h4>
                  <div>
                    {isEditing ? (
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '0.2rem', fontSize: '1.05rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title={lang === 'es' ? 'Guardar todos los cambios' : 'Save all changes'}
                      >
                        💾
                      </button>
                    ) : (
                      <button
                        onClick={handleEditClick}
                        style={{ background: 'none', border: 'none', boxShadow: 'none', padding: '0.2rem', fontSize: '1.05rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        title={lang === 'es' ? 'Editar pronósticos' : 'Edit predictions'}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                </div>

                <div className="group-matches-editor-list" style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                  {knockoutMatchesList.map(m => {
                    const pred = isEditing ? editedPreds.matches[m.id] : participant.predictions.matches[m.id];
                    const real = realResults.matches[m.id];
                    const pts = participant.points.matches[m.id] || 0;
                    const timeLocked = isMatchLocked(m, isAdmin);
                    const isLocked = !isAdmin && (!!real || timeLocked);
                    const locked6h = !isAdmin && !real && timeLocked;

                    let ptsClass = 'pts-zero';
                    if (pts >= 3) ptsClass = 'pts-exact';
                    else if (pts > 0) ptsClass = 'pts-outcome';

                    const isHighlighted = m.id === initialMatchId;

                    // Dynamically resolve team names and flags just like TournamentBracket does!
                    const team1Resolved = resolveTeamName(m.id, 'team1', matches);
                    const team2Resolved = resolveTeamName(m.id, 'team2', matches);
                    const isT1Real = team1Resolved.length === 3;
                    const isT2Real = team2Resolved.length === 3;

                    return (
                      <div
                        key={m.id}
                        ref={el => { matchRefs.current[m.id] = el; }}
                        className={`detail-match-row ${ptsClass} ${isHighlighted ? 'match-row-highlight' : ''}`}
                        style={{
                          padding: '0.75rem',
                          borderRadius: '6px',
                          border: '1.5px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.4rem',
                          ...(isLocked ? { backgroundColor: 'var(--bg)', opacity: 0.85 } : {})
                        }}
                      >
                        <div className="detail-match-header flex justify-between items-center" style={{ borderBottom: '1px dashed var(--border)', paddingBottom: '0.25rem', fontSize: '0.8rem' }}>
                          <span className="team-flag-pair flex gap-1 items-center">
                            {isT1Real ? (
                              <img src={getFlagImgUrl(team1Resolved)} alt={team1Resolved} className="flag-icon-img" style={{ width: '18px', height: '12px', borderRadius: '1px' }} />
                            ) : (
                              <span style={{ fontSize: '0.8rem' }}>🏳️</span>
                            )}
                            <span style={isLocked ? { color: 'var(--text-light)' } : {}}>{normalizeTeamCode(team1Resolved)}</span>
                            <span className="vs-divider text-muted font-normal">vs</span>
                            {isT2Real ? (
                              <img src={getFlagImgUrl(team2Resolved)} alt={team2Resolved} className="flag-icon-img" style={{ width: '18px', height: '12px', borderRadius: '1px' }} />
                            ) : (
                              <span style={{ fontSize: '0.8rem' }}>🏳️</span>
                            )}
                            <span style={isLocked ? { color: 'var(--text-light)' } : {}}>{normalizeTeamCode(team2Resolved)}</span>
                          </span>
                          {(m.date || m.time || m.kickoffAtUtc) && (
                            <span className="detail-match-date" title={getOriginalMatchDateTime(m)}>
                              📅 {formatMatchLocalDateTime(m, lang)}
                            </span>
                          )}
                          {locked6h && (
                            <span className="detail-lock-badge">
                              🔒 {lang === 'es' ? 'Bloqueado' : 'Locked'}
                            </span>
                          )}
                          {real && real.trim() !== '' && real.trim() !== '-' && (
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              {pts >= 3 && <span className="badge-pts-exact">+{pts}</span>}
                              {pts > 0 && pts < 3 && <span className="badge-pts-outcome">+{pts}</span>}
                              {pts === 0 && <span className="badge-pts-zero">0</span>}
                            </div>
                          )}
                        </div>

                        <div className="detail-match-scores flex justify-between items-center" style={{ fontSize: '0.9rem' }}>
                          {isEditing ? (
                            (() => {
                              const [s1, s2] = parseScore(pred);
                              const isDraw = s1 !== '' && s2 !== '' && s1 === s2;
                              const currentQualifier = pred && pred.toUpperCase().includes('(Q2)') ? 'Q2' : 'Q1';

                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'flex-start' }}>
                                  <div className="match-score-selectors" style={{ width: '100px' }}>
                                    <select
                                      value={s1}
                                      onChange={e => handleScoreChange(m.id, 1, e.target.value)}
                                      className="score-select"
                                      disabled={isLocked}
                                      style={isLocked ? { backgroundColor: 'var(--bg)', color: 'var(--text-light)', cursor: 'not-allowed', border: '1px solid var(--border)', padding: '0.2rem 0.1rem', fontSize: '0.85rem' } : { padding: '0.2rem 0.1rem', fontSize: '0.85rem' }}
                                    >
                                      {SCORE_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                                      ))}
                                    </select>
                                    <span className="score-divider" style={{ fontSize: '0.9rem' }}>-</span>
                                    <select
                                      value={s2}
                                      onChange={e => handleScoreChange(m.id, 2, e.target.value)}
                                      className="score-select"
                                      disabled={isLocked}
                                      style={isLocked ? { backgroundColor: 'var(--bg)', color: 'var(--text-light)', cursor: 'not-allowed', border: '1px solid var(--border)', padding: '0.2rem 0.1rem', fontSize: '0.85rem' } : { padding: '0.2rem 0.1rem', fontSize: '0.85rem' }}
                                    >
                                      {SCORE_OPTIONS.map(opt => (
                                        <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                                      ))}
                                    </select>
                                  </div>
                                  {isDraw && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.1rem', width: '100%' }}>
                                      <span style={{ fontSize: '0.68rem', fontWeight: 'bold', color: 'var(--text-light)' }}>
                                        {lang === 'es' ? 'Pasa ronda:' : 'Qualifies:'}
                                      </span>
                                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                                        <button
                                          type="button"
                                          disabled={isLocked}
                                          onClick={() => handleQualifierChange(m.id, 'Q1')}
                                          style={{
                                            padding: '0.15rem 0.35rem',
                                            fontSize: '0.65rem',
                                            borderRadius: '4px',
                                            border: currentQualifier === 'Q1' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border)',
                                            backgroundColor: currentQualifier === 'Q1' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg)',
                                            color: currentQualifier === 'Q1' ? 'var(--accent-blue)' : 'var(--text-light)',
                                            fontWeight: currentQualifier === 'Q1' ? 'bold' : 'normal',
                                            cursor: isLocked ? 'not-allowed' : 'pointer'
                                          }}
                                        >
                                          {normalizeTeamCode(team1Resolved)}
                                        </button>
                                        <button
                                          type="button"
                                          disabled={isLocked}
                                          onClick={() => handleQualifierChange(m.id, 'Q2')}
                                          style={{
                                            padding: '0.15rem 0.35rem',
                                            fontSize: '0.65rem',
                                            borderRadius: '4px',
                                            border: currentQualifier === 'Q2' ? '1.5px solid var(--accent-blue)' : '1px solid var(--border)',
                                            backgroundColor: currentQualifier === 'Q2' ? 'rgba(59, 130, 246, 0.1)' : 'var(--card-bg)',
                                            color: currentQualifier === 'Q2' ? 'var(--accent-blue)' : 'var(--text-light)',
                                            fontWeight: currentQualifier === 'Q2' ? 'bold' : 'normal',
                                            cursor: isLocked ? 'not-allowed' : 'pointer'
                                          }}
                                        >
                                          {normalizeTeamCode(team2Resolved)}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : (
                            (() => {
                              let predictedQualifierCode = '';
                              if (pred && pred.trim() !== '' && pred.trim() !== '-') {
                                const [ps1, ps2] = parseScore(pred);
                                if (ps1 !== '' && ps2 !== '') {
                                  const pn1 = parseInt(ps1, 10);
                                  const pn2 = parseInt(ps2, 10);
                                  if (pn1 > pn2) predictedQualifierCode = team1Resolved;
                                  else if (pn2 > pn1) predictedQualifierCode = team2Resolved;
                                  else {
                                    predictedQualifierCode = pred.toUpperCase().includes('(Q2)') ? team2Resolved : team1Resolved;
                                  }
                                }
                              }
                              return (
                                <span className="match-pred" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                                  <span>Pred: <strong>{pred ? pred.split('(')[0].trim() : '-'}</strong></span>
                                  {predictedQualifierCode && (
                                    <span style={{
                                      color: 'var(--accent-blue)',
                                      fontWeight: '800',
                                      fontSize: '0.68rem',
                                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                                      padding: '0.1rem 0.35rem',
                                      borderRadius: '4px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.2rem'
                                    }}>
                                      ➔ {normalizeTeamCode(predictedQualifierCode)}
                                    </span>
                                  )}
                                </span>
                              );
                            })()
                          )}
                          <span className="match-real text-muted" style={isLocked ? { color: 'var(--text)', fontWeight: 600 } : {}}>
                            {t.pdRealResult} <strong>{real || '-'}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
