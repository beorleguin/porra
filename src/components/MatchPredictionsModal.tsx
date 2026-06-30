import React, { useState, useMemo } from 'react';
import { Match, Participant } from '../domain/types';
import { getFlagImgUrl, normalizeTeamCode } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';

interface Props {
  match: Match;
  participants: Participant[];
  realScore: string | undefined;
  lang: Lang;
  onClose: () => void;
  onNavigateToParticipant?: (participant: Participant) => void;
}

function getOutcome(score: string): 'home' | 'away' | 'draw' | null {
  if (!score) return null;
  const baseScore = score.split('(')[0].trim();
  if (!baseScore.includes('-')) return null;
  const parts = baseScore.split('-');
  if (parts.length !== 2) return null;
  const home = parseInt(parts[0].trim(), 10);
  const away = parseInt(parts[1].trim(), 10);

  if (isNaN(home) || isNaN(away)) return null;

  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

export function MatchPredictionsModal({ match, participants, realScore, lang, onClose, onNavigateToParticipant }: Props) {
  const t = TRANSLATIONS[lang];
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate prediction outcome trends
  const stats = useMemo(() => {
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    let total = 0;

    participants.forEach(p => {
      const pred = p.predictions.matches[match.id];
      if (pred && pred.trim() !== '' && pred.trim() !== '-') {
        const outcome = getOutcome(pred);
        if (outcome === 'home') homeWins++;
        else if (outcome === 'draw') draws++;
        else if (outcome === 'away') awayWins++;
        total++;
      }
    });

    const pctHome = total > 0 ? Math.round((homeWins / total) * 100) : 0;
    const pctDraw = total > 0 ? Math.round((draws / total) * 100) : 0;
    const pctAway = total > 0 ? Math.round((awayWins / total) * 100) : 0;

    return { total, homeWins, draws, awayWins, pctHome, pctDraw, pctAway };
  }, [match, participants]);

  const filteredParticipants = participants.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        <button className="modal-close-btn" onClick={onClose}>×</button>

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text)', marginBottom: '0.5rem' }}>
            {t.mpModalTitle}
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {match.group || 'Tournament Match'}
          </p>

          {/* Match Versus Display */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, textAlign: 'right' }}>
              <img src={getFlagImgUrl(match.team1)} alt={match.team1} className="flag-icon-img" style={{ width: '40px', height: '28px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
              <span style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{normalizeTeamCode(match.team1)}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-light)', background: 'var(--bg)', padding: '0.2rem 0.6rem', borderRadius: '12px' }}>VS</span>
              {realScore ? (
                <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '0.35rem 0.85rem', borderRadius: '8px', fontSize: '1.15rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                  {realScore}
                </div>
              ) : (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontStyle: 'italic', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                  {t.mpMatchPending}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, textAlign: 'left' }}>
              <img src={getFlagImgUrl(match.team2)} alt={match.team2} className="flag-icon-img" style={{ width: '40px', height: '28px', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
              <span style={{ fontSize: '1rem', fontWeight: 'bold', marginTop: '0.5rem' }}>{normalizeTeamCode(match.team2)}</span>
            </div>
          </div>

          {/* Segmented Betting Trends Progress Bar */}
          {stats.total > 0 && (
            <div style={{ marginTop: '1.25rem', padding: '0 1rem' }}>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-light)', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem', textAlign: 'center' }}>
                📊 {lang === 'es' ? 'Tendencias de la Porra' : 'Match Betting Trends'} ({stats.total} {lang === 'es' ? 'votos' : 'predictions'})
              </p>

              {/* Segmented Progress Bar */}
              <div style={{ display: 'flex', height: '10px', width: '100%', borderRadius: '5px', overflow: 'hidden', backgroundColor: 'var(--border)', margin: '0.5rem 0' }}>
                {stats.pctHome > 0 && (
                  <div
                    style={{ width: `${stats.pctHome}%`, backgroundColor: '#3b82f6', transition: 'width 0.3s ease' }}
                    title={`${lang === 'es' ? 'Victoria de' : 'Win'} ${normalizeTeamCode(match.team1)}: ${stats.pctHome}%`}
                  />
                )}
                {stats.pctDraw > 0 && (
                  <div
                    style={{ width: `${stats.pctDraw}%`, backgroundColor: '#94a3b8', transition: 'width 0.3s ease' }}
                    title={`${lang === 'es' ? 'Empate' : 'Draw'}: ${stats.pctDraw}%`}
                  />
                )}
                {stats.pctAway > 0 && (
                  <div
                    style={{ width: `${stats.pctAway}%`, backgroundColor: '#ec4899', transition: 'width 0.3s ease' }}
                    title={`${lang === 'es' ? 'Victoria de' : 'Win'} ${normalizeTeamCode(match.team2)}: ${stats.pctAway}%`}
                  />
                )}
              </div>

              {/* Legend / Percentages */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-light)', marginTop: '0.25rem' }}>
                <span style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  🔵 {normalizeTeamCode(match.team1)}: {stats.pctHome}%
                </span>
                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  ⚪ {lang === 'es' ? 'Empate' : 'Draw'}: {stats.pctDraw}%
                </span>
                <span style={{ color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  🔴 {normalizeTeamCode(match.team2)}: {stats.pctAway}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Search Filter */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder={lang === 'es' ? '🔍 Buscar participante...' : '🔍 Search participant...'}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="predictions-search-input"
          />
        </div>

        {/* Predictions List Container */}
        <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)', position: 'sticky', top: 0, zIndex: 1 }}>
                <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold', color: 'var(--text-light)' }}>{t.mpParticipant}</th>
                <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-light)', width: '120px' }}>{t.mpPrediction}</th>
                {realScore && (
                  <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-light)', width: '100px' }}>{t.mpPoints}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.map((p, idx) => {
                const pred = p.predictions.matches[match.id] || '';
                const matchPts = p.points?.matches?.[match.id] ?? 0;

                // Styling based on points
                let predStyle: React.CSSProperties = { fontWeight: 'bold', fontSize: '1rem' };
                let rowBg = 'transparent';
                let ptsBadge = null;

                if (realScore && pred) {
                  if (matchPts >= 3) {
                    rowBg = '#f0fdf4'; // very soft green
                    predStyle = { ...predStyle, color: '#166534' };
                    ptsBadge = (
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        +{matchPts}
                      </span>
                    );
                  } else if (matchPts > 0) {
                    rowBg = '#fefce8'; // very soft yellow
                    predStyle = { ...predStyle, color: '#854d0e' };
                    ptsBadge = (
                      <span style={{ background: '#fef9c3', color: '#a16207', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        +{matchPts}
                      </span>
                    );
                  } else {
                    rowBg = '#fff5f5'; // very soft red
                    predStyle = { ...predStyle, color: '#991b1b', opacity: 0.8 };
                    ptsBadge = (
                      <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.5rem', borderRadius: '12px', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        0
                      </span>
                    );
                  }
                }

                const isClickable = !!onNavigateToParticipant;
                return (
                  <tr
                    key={p.name}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      backgroundColor: rowBg,
                      cursor: isClickable ? 'pointer' : 'default',
                      transition: 'background-color 0.15s ease'
                    }}
                    onClick={() => {
                      if (isClickable && onNavigateToParticipant) {
                        onNavigateToParticipant(p);
                      }
                    }}
                    title={isClickable ? (lang === 'es' ? 'Ver pronósticos completos de este participante' : 'Click to view full predictions for this participant') : undefined}
                  >
                    <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-light)', fontSize: '0.75rem', width: '20px' }}>#{idx + 1}</span>
                        <span>{p.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginLeft: 'auto', background: 'var(--bg)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                          {p.points?.total ?? 0} Pts
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                      {pred ? (
                        <span style={predStyle}>{pred}</span>
                      ) : (
                        <span style={{ fontStyle: 'italic', color: 'var(--text-light)', fontSize: '0.8rem' }}>
                          {t.mpNoPredictions}
                        </span>
                      )}
                    </td>
                    {realScore && (
                      <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                        {pred ? ptsBadge : '-'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
