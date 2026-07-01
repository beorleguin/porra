import React, { useState, useEffect } from 'react';
import { AppState, Match, Participant } from '../domain/types';
import { normalizeTeamCode, getFlagImgUrl } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';
import { MatchPredictionsModal } from './MatchPredictionsModal';
import { parsePorraSheetCsv } from '../utils/sheetsImport';

interface Props {
  matches: Match[];
  realResults: AppState['realResults'];
  participants: Participant[];
  onUpdate: (results: AppState['realResults']) => void;
  onExportBackup?: () => void;
  onRestoreBackup?: (backupData: AppState) => Promise<void>;
  lang: Lang;
  theme?: 'light' | 'dark';
}

const SCORE_OPTIONS = ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

const parseScore = (scoreStr: string | undefined): [string, string] => {
  if (!scoreStr) return ['', ''];
  // Strip any penalty shootout scores in parentheses first!
  const baseScore = scoreStr.split('(')[0].trim();
  if (!baseScore.includes('-')) return ['', ''];
  const parts = baseScore.split('-');
  return [parts[0].trim(), parts[1].trim()];
};

// Group colors ordered to match their original sheet look in Light Mode
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

// Group colors ordered to match their original sheet look in Dark Mode
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

export function AdminPanel({ matches, realResults, participants, onUpdate, onExportBackup, onRestoreBackup, lang, theme }: Props) {
  const [localResults, setLocalResults] = useState(realResults);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedMatchForPredictions, setSelectedMatchForPredictions] = useState<Match | null>(null);
  const t = TRANSLATIONS[lang];

  // Sync state if realResults prop changes (e.g. after a backup restore)
  useEffect(() => {
    setLocalResults(realResults);
  }, [realResults]);

  const handleSyncOpenFootball = async () => {
    setSyncing(true);
    try {
      const response = await fetch('/api/sync-openfootball', {
        method: 'POST',
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(lang === 'es'
          ? 'El servidor local no está ejecutando la API. Inicia la aplicación con "npx netlify dev" o "npx vercel dev" para habilitar las funciones del panel de administrador.'
          : 'Local server API is not running. Start the application with "npx netlify dev" or "npx vercel dev" to enable administrator panel features.'
        );
      }

      const data = await response.json();
      if (data.success) {
        alert(t.apSyncSuccess.replace('{count}', String(data.count)));
        window.location.reload();
      } else {
        alert(t.apSyncError + data.error);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(t.apSyncError + errMsg);
    } finally {
      setSyncing(false);
    }
  };

  const handleChange = (field: keyof typeof localResults, value: string) => {
    setLocalResults({ ...localResults, [field]: value });
  };

  const handleScoreChange = (matchId: string, teamIndex: 1 | 2, val: string) => {
    const currentScore = localResults.matches[matchId] || '';
    const [s1, s2] = parseScore(currentScore);
    
    const newScore1 = teamIndex === 1 ? val : s1;
    const newScore2 = teamIndex === 2 ? val : s2;
    
    let finalScore = '';
    if (newScore1 !== '' || newScore2 !== '') {
      finalScore = `${newScore1}-${newScore2}`;
    }
    
    setLocalResults(prev => ({
      ...prev,
      matches: {
        ...prev.matches,
        [matchId]: finalScore
      }
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Clean up partial scores so that only fully completed results are saved
      const cleanedMatches: Record<string, string> = {};
      Object.entries(localResults.matches).forEach(([matchId, score]) => {
        if (score) {
          const [s1, s2] = parseScore(score);
          if (s1 !== '' && s2 !== '') {
            // Keep the penalty part if present (e.g., "1-1 (4-3)" -> " (4-3)")
            const penaltyMatch = score.match(/\((\d+)\s*-\s*(\d+)[^)]*?\)/);
            const penaltyPart = penaltyMatch ? ` ${penaltyMatch[0]}` : '';
            cleanedMatches[matchId] = `${s1}-${s2}${penaltyPart}`;
          } else {
            cleanedMatches[matchId] = '';
          }
        }
      });
      
      const cleanedResults = {
        ...localResults,
        matches: cleanedMatches
      };
      
      await onUpdate(cleanedResults);
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isJson = fileName.endsWith('.json');

    if (!isCsv && !isJson) {
      alert(
        lang === 'es'
          ? '❌ Formato no compatible. Importá un CSV exportado desde Google Sheets o un backup JSON de la app.'
          : '❌ Unsupported format. Import a CSV exported from Google Sheets or a JSON backup from the app.'
      );
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const fileText = String(event.target?.result || '');
        let nextState: AppState;

        if (isCsv) {
          const confirmed = window.confirm(
            lang === 'es'
              ? 'Esto importará la hoja de Google Sheets y reemplazará partidos, participantes, pronósticos, resultados reales y bote en la app. ¿Continuar?'
              : 'This will import the Google Sheets CSV and replace matches, participants, predictions, real results and prize pot in the app. Continue?'
          );

          if (!confirmed) return;

          nextState = parsePorraSheetCsv(fileText, {
            matches,
            participants,
            realResults,
          } as AppState);
        } else {
          const json = JSON.parse(fileText);

          if (json && Array.isArray(json.matches) && Array.isArray(json.participants) && json.realResults) {
            nextState = json;
          } else {
            throw new Error(
              lang === 'es'
                ? 'El archivo seleccionado no parece ser una copia de seguridad válida de esta app.'
                : 'The selected file does not appear to be a valid backup of this application.'
            );
          }
        }

        if (onRestoreBackup) {
          await onRestoreBackup(nextState);
        }
      } catch (err) {
        alert(
          lang === 'es'
            ? '❌ Error al importar el archivo: ' + (err as Error).message
            : '❌ Error importing file: ' + (err as Error).message
        );
      }
    };

    reader.readAsText(file);
    // Reset file input value so same file can be selected again
    e.target.value = '';
  };

  // Group matches by group
  const groups: Record<string, Match[]> = {};
  matches.forEach(m => {
    const groupName = m.group || 'Other Matches';
    if (!groups[groupName]) {
      groups[groupName] = [];
    }
    groups[groupName].push(m);
  });

  // Sort groups alphabetically (Group A, Group B, ...)
  const sortedGroupNames = Object.keys(groups).sort((a, b) => {
    if (a === 'Other Matches') return 1;
    if (b === 'Other Matches') return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="admin-view">
      
      {/* SECTION 1: DATABASE & BACKUP MANAGEMENT (TOP) */}
      <div className="admin-db-section animate-fade-in">
        <div className="admin-db-title-section">
          <h3>{t.apDbSectionTitle}</h3>
          <p>{t.apDbSectionDesc}</p>
        </div>
        
        <div className="db-grid">
          {/* Action 1: Export */}
          {onExportBackup && (
            <div className="db-action-card">
              <span className="card-header-icon" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📥</span>
              <button 
                className="sync-api-btn" 
                onClick={onExportBackup}
              >
                {t.apExportBtn}
              </button>
              <p className="db-action-desc" style={{ marginTop: '0.5rem' }}>{t.apExportDesc}</p>
            </div>
          )}

          {/* Action 2: Import */}
          {onRestoreBackup && (
            <div className="db-action-card">
              <span className="card-header-icon" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📤</span>
              <button 
                className="sync-api-btn" 
                onClick={() => document.getElementById('backup-upload-input')?.click()}
              >
                {t.apImportBtn}
              </button>
              <input 
                id="backup-upload-input"
                type="file"
                accept=".json,.csv,text/csv,application/json"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <p className="db-action-desc" style={{ marginTop: '0.5rem' }}>{t.apImportDesc}</p>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: TOURNAMENT RESULTS EDITOR (BOTTOM) */}
      <div className="card admin-panel">
        <div className="admin-header-row">
          <div className="admin-title-section">
            <h2>{t.apTitle}</h2>
            <p className="admin-subtitle">{t.apSubtitle}</p>
          </div>
          <div className="admin-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="sync-api-btn" 
              onClick={handleSyncOpenFootball} 
              disabled={syncing}
            >
              {syncing ? '...' : '🔄 Sincronizar OpenFootball'}
            </button>
            <button 
              className="save-btn" 
              onClick={handleSave} 
              disabled={saving}
            >
              {saving ? t.apSaving : t.apSaveBtn}
            </button>
          </div>
        </div>

        <div className="form-grid">
          {/* Ganador Final */}
          <div className="form-group">
            <label>{t.apFormWinner}</label>
            <input 
              type="text" 
              placeholder="e.g. España" 
              value={localResults.ganadorFinal} 
              onChange={e => handleChange('ganadorFinal', e.target.value)} 
            />
          </div>

          {/* Max Goleador */}
          <div className="form-group">
            <label>{t.apFormScorer}</label>
            <input 
              type="text" 
              placeholder="e.g. Mbappé" 
              value={localResults.maxGoleador} 
              onChange={e => handleChange('maxGoleador', e.target.value)} 
            />
          </div>

          {/* Max Asistente */}
          <div className="form-group">
            <label>{t.apFormAssist}</label>
            <input 
              type="text" 
              placeholder="e.g. Fabián" 
              value={localResults.maxAsistente} 
              onChange={e => handleChange('maxAsistente', e.target.value)} 
            />
          </div>

          {/* MVP */}
          <div className="form-group">
            <label>{t.apFormMvp}</label>
            <input 
              type="text" 
              placeholder="e.g. Rodri" 
              value={localResults.mvp} 
              onChange={e => handleChange('mvp', e.target.value)} 
            />
          </div>

          {/* Fase España */}
          <div className="form-group">
            <label>{t.apFormSpain}</label>
            <input 
              type="text" 
              placeholder="e.g. Final" 
              value={localResults.faseEspana} 
              onChange={e => handleChange('faseEspana', e.target.value)} 
            />
          </div>
        </div>

        <h3 className="section-title">{t.apSectionMatches}</h3>
        
        {sortedGroupNames.map(groupName => {
          const colors = (theme === 'dark' ? GROUP_COLORS_DARK : GROUP_COLORS)[groupName] || { bg: '#f3f4f6', text: '#374151', border: '#d1d5db' };
          return (
            <div key={groupName} className="group-section">
              <h4 
                className="group-title" 
                style={{ 
                  backgroundColor: colors.bg, 
                  color: colors.text, 
                  borderLeft: `5px solid ${colors.border}` 
                }}
              >
                {groupName}
              </h4>
              <div className="matches-grid">
                {groups[groupName].map(m => {
                  const [s1, s2] = parseScore(localResults.matches[m.id]);
                  const scoreStr = localResults.matches[m.id];
                  const isPlayed = !!scoreStr && scoreStr.trim() !== '';
                  return (
                    <div 
                      key={m.id} 
                      className={`match-card ${isPlayed ? 'match-played' : ''}`}
                      style={{ 
                        borderTop: `3px solid ${colors.border}`
                      }}
                    >
                      <div 
                        className="match-teams-display"
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedMatchForPredictions(m)}
                        title={lang === 'es' ? 'Clic para ver pronósticos de participantes' : 'Click to view participant predictions'}
                      >
                        <span className="team">
                          <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" />
                          <span className="team-name">{normalizeTeamCode(m.team1)}</span>
                        </span>
                        <span className="vs">vs</span>
                        <span className="team">
                          <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" />
                          <span className="team-name">{normalizeTeamCode(m.team2)}</span>
                        </span>
                      </div>
                      <div className="match-score-selectors">
                        <select 
                          value={s1} 
                          onChange={e => handleScoreChange(m.id, 1, e.target.value)}
                          className="score-select"
                        >
                          {SCORE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                          ))}
                        </select>
                        <span className="score-divider">-</span>
                        <select 
                          value={s2} 
                          onChange={e => handleScoreChange(m.id, 2, e.target.value)}
                          className="score-select"
                        >
                          {SCORE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt === '' ? '-' : opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {selectedMatchForPredictions && (
        <MatchPredictionsModal
          match={selectedMatchForPredictions}
          participants={participants}
          realScore={realResults.matches[selectedMatchForPredictions.id]}
          lang={lang}
          onClose={() => setSelectedMatchForPredictions(null)}
        />
      )}
    </div>
  );
}
