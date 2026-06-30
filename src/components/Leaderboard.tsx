import { useMemo, useState } from 'react';
import { Participant, AppState } from '../domain/types';
import { TRANSLATIONS, Lang } from '../utils/translations';

interface Props {
  participants: Participant[];
  realResults: AppState['realResults'];
  matches: AppState['matches'];
  selectedParticipantName: string | null;
  onSelectParticipant: (p: Participant) => void;
  lang: Lang;
  boteData?: AppState['bote'];
}

const normalizeParticipantSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export function Leaderboard({ 
  participants, 
  realResults, 
  matches, 
  selectedParticipantName, 
  onSelectParticipant, 
  lang,
  boteData
}: Props) {
  const t = TRANSLATIONS[lang];
  const [searchTerm, setSearchTerm] = useState('');

  const filteredParticipants = useMemo(() => {
    const normalizedSearch = normalizeParticipantSearch(searchTerm);

    return participants
      .map((participant, rankingIndex) => ({ participant, rankingIndex }))
      .filter(({ participant }) =>
        normalizeParticipantSearch(participant.name).includes(normalizedSearch)
      );
  }, [participants, searchTerm]);

  // Get all played matches (matches with a real result) in chronological order
  const playedMatchesList = matches.filter(m => m.realResult && m.realResult.trim() !== '' && m.realResult.trim() !== '-');
  
  // Take the last 5 played matches
  const last5PlayedMatches = playedMatchesList.slice(-5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      {/* Dynamic Bote Panel directly above classification */}
      {boteData && (
        <div className="bote-panel animate-fade-in">
          <div className="bote-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="card bote-card main-bote-card">
              <div className="card-header-icon">🏆</div>
              <h3>{t.bpTotalAccumulated}</h3>
              <div className="bote-amount-big">{boteData.total}</div>
              <p className="bote-card-sub text-muted">{t.bpTotalDesc}</p>
            </div>

            <div className="card bote-card prize-card gold">
              <div className="card-header-icon">🥇</div>
              <h3>{t.bpFirstPrize}</h3>
              <div className="bote-amount-medium">{boteData.prizes.first}</div>
              <p className="bote-card-sub">{t.bpFirstDesc}</p>
            </div>

            <div className="card bote-card prize-card silver">
              <div className="card-header-icon">🥈</div>
              <h3>{t.bpSecondPrize}</h3>
              <div className="bote-amount-medium">{boteData.prizes.second}</div>
              <p className="bote-card-sub">{t.bpSecondDesc}</p>
            </div>

            <div className="card bote-card prize-card bronze">
              <div className="card-header-icon">🥉</div>
              <h3>{t.bpThirdPrize}</h3>
              <div className="bote-amount-medium">{boteData.prizes.third}</div>
              <p className="bote-card-sub">{t.bpThirdDesc}</p>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard Table Card */}
      <div className="card">
        <div className="leaderboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            <h2 style={{ marginBottom: 0 }}>{lang === 'es' ? 'Clasificación' : t.lbTitle}</h2>
            <span className="leaderboard-subtitle" style={{ marginTop: 0 }}>{t.lbSubtitle}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-light)', lineHeight: 1.3 }}>
              {lang === 'es'
                ? `Mostrando ${filteredParticipants.length} de ${participants.length} participantes`
                : `Showing ${filteredParticipants.length} of ${participants.length} participants`}
            </span>
          </div>
          <div className="leaderboard-search" style={{ position: 'relative', width: '280px', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={lang === 'es' ? '🔍 Buscar participante...' : '🔍 Search participant...'}
              aria-label={lang === 'es' ? 'Buscar participante' : 'Search participant'}
              className="predictions-search-input"
              style={{ paddingRight: '2rem' }}
            />
            {searchTerm && (
              <button
                type="button"
                className="leaderboard-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label={lang === 'es' ? 'Limpiar búsqueda' : 'Clear search'}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  color: 'var(--text-light)',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className="table-responsive" style={{ marginTop: '1rem' }}>
          <table className="leaderboard-table leaderboard-main-table">
            <thead>
              <tr>
                <th>{t.lbRank}</th>
                <th>{t.lbParticipant}</th>
                <th>{t.lbTotalPts}</th>
                <th style={{ textAlign: 'center' }}>{t.lbExact}</th>
                <th style={{ textAlign: 'center' }}>{t.lbPartial}</th>
                <th style={{ textAlign: 'center' }}>{t.lbErrors}</th>
                <th style={{ textAlign: 'center' }}>{t.lbForm}</th>
              </tr>
            </thead>
            <tbody>
              {filteredParticipants.length > 0 ? filteredParticipants.map(({ participant: p, rankingIndex }) => {
                const isSelected = p.name === selectedParticipantName;
                let positionClass = '';
                let medal = '';

                if (rankingIndex === 0) {
                  positionClass = 'gold-row';
                  medal = '🥇 ';
                } else if (rankingIndex === 1) {
                  positionClass = 'silver-row';
                  medal = '🥈 ';
                } else if (rankingIndex === 2) {
                  positionClass = 'bronze-row';
                  medal = '🥉 ';
                }

                // Compute stats on the fly based on active played matches
                let exactHits = 0;
                let partialHits = 0;
                let errors = 0;

                for (const [matchId, realScore] of Object.entries(realResults.matches)) {
                  if (realScore && realScore.trim() !== '' && realScore.trim() !== '-') {
                    const predictedScore = p.predictions.matches[matchId];
                    const pointsEarned = p.points.matches[matchId] || 0;

                    if (!predictedScore || predictedScore.trim() === '' || predictedScore.trim() === '-') {
                      errors++;
                    } else if (pointsEarned === 3) {
                      exactHits++;
                    } else if (pointsEarned === 1) {
                      partialHits++;
                    } else {
                      errors++;
                    }
                  }
                }

                // Build form racha dots for the last 5 played matches
                const formDots = [];
                for (const m of last5PlayedMatches) {
                  const predictedScore = p.predictions.matches[m.id];
                  const pointsEarned = p.points.matches[m.id] || 0;

                  if (!predictedScore || predictedScore.trim() === '' || predictedScore.trim() === '-') {
                    formDots.push(<span key={m.id} className="form-dot loss" title="Fallo (0 pts)">F</span>);
                  } else if (pointsEarned === 3) {
                    formDots.push(<span key={m.id} className="form-dot win" title="Pleno (3 pts)">P</span>);
                  } else if (pointsEarned === 1) {
                    formDots.push(<span key={m.id} className="form-dot draw" title="Acierto (1 pt)">A</span>);
                  } else {
                    formDots.push(<span key={m.id} className="form-dot loss" title="Fallo (0 pts)">F</span>);
                  }
                }

                // Pad pending slots with grey dots up to 5
                while (formDots.length < 5) {
                  formDots.push(<span key={`pending-${formDots.length}`} className="form-dot pending" title="Pendiente">-</span>);
                }

                return (
                  <tr 
                    key={p.name} 
                    onClick={() => onSelectParticipant(p)}
                    className={`leaderboard-row ${isSelected ? 'selected-row' : ''} ${positionClass}`}
                  >
                    <td className="rank">{medal}{rankingIndex + 1}</td>
                    <td className="name">
                      <strong>{p.name}</strong>
                    </td>
                    <td className="total-points"><strong>{p.points.total}</strong></td>
                    <td style={{ textAlign: 'center', color: '#3CAC3B', fontWeight: 'bold' }}>{exactHits}</td>
                    <td style={{ textAlign: 'center', color: 'var(--accent-blue)', fontWeight: '500' }}>{partialHits}</td>
                    <td style={{ textAlign: 'center', color: '#E61D25', fontWeight: '500' }}>{errors}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="form-dots-container">
                        {formDots}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={7} className="leaderboard-empty">
                    {lang === 'es'
                      ? 'No se encontraron participantes con ese nombre.'
                      : 'No participants found with that name.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
