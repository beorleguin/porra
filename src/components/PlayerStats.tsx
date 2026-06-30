import { useEffect, useState } from 'react';
import { getFlagImgUrl, normalizeTeamCode } from '../utils/flags';
import { TRANSLATIONS, Lang } from '../utils/translations';

interface PlayerStat {
  name: string;
  team: string;
  goals: number;
  matches: number;
}

interface StatsData {
  scorers: PlayerStat[];
}

interface Props {
  lang: Lang;
}

export function PlayerStats({ lang }: Props) {
  const [data, setData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  const t = TRANSLATIONS[lang];

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/stats/players');
        if (response.ok) {
          const stats = await response.json();
          setData(stats);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error('Error fetching player stats:', err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="card text-center" style={{ padding: '3rem', color: 'var(--text-light)' }}>
        <div className="loading" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          🔄 {t.statsLoading}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card text-center" style={{ padding: '3rem', color: '#ef4444' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
          ❌ {t.statsError}
        </div>
      </div>
    );
  }

  return (
    <div className="card stats-view-panel animate-fade-in">
      <div className="bracket-header flex flex-col gap-1.5" style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--border)' }}>
        <div className="admin-title-section">
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1f2937' }}>{t.statsTitle}</h2>
          <p className="details-subtitle" style={{ fontSize: '0.875rem', color: 'var(--text-light)' }}>
            {lang === 'es' ? 'Datos en tiempo real de máximos goleadores del Mundial 2026' : 'Real-time data of top scorers for World Cup 2026'}
          </p>
        </div>
      </div>

      <div className="table-responsive">
        <table className="leaderboard-table select-none" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ width: '80px', textAlign: 'center', fontWeight: 'bold' }}>{t.lbRank}</th>
              <th style={{ textAlign: 'left', fontWeight: 'bold' }}>{t.statsPlayer}</th>
              <th style={{ width: '150px', textAlign: 'left', fontWeight: 'bold' }}>{t.statsTeam}</th>
              <th style={{ width: '120px', textAlign: 'center', fontWeight: 'bold' }}>{t.statsGoals}</th>
              <th style={{ width: '120px', textAlign: 'center', fontWeight: 'bold' }}>{t.statsMatches}</th>
              <th style={{ width: '120px', textAlign: 'center', fontWeight: 'bold' }}>{t.statsRatio}</th>
            </tr>
          </thead>
          <tbody>
            {data.scorers.map((player, index) => {
              const rank = index + 1;
              const ratio = player.matches > 0 ? (player.goals / player.matches).toFixed(2) : '0.00';
              
              // Highlight the top player
              const isFirst = rank === 1;
              
              return (
                <tr 
                  key={player.name} 
                  className="leaderboard-row" 
                  style={{ 
                    borderBottom: '1px solid var(--border)',
                    ...(isFirst ? { backgroundColor: '#fffbeb', fontWeight: 600 } : {})
                  }}
                >
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                    {isFirst ? (
                      <span style={{ fontSize: '1.1rem', color: '#eab308' }}>👑 1</span>
                    ) : (
                      rank
                    )}
                  </td>
                  <td style={{ padding: '0.8rem' }}>
                    <span style={isFirst ? { color: '#854d0e', fontSize: '0.95rem' } : { fontSize: '0.9rem' }}>
                      {player.name}
                    </span>
                  </td>
                  <td style={{ padding: '0.8rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <img 
                        src={getFlagImgUrl(player.team)} 
                        alt={player.team} 
                        className="flag-icon-img" 
                        style={{ width: '20px', height: '14px' }} 
                      />
                      <span style={{ fontSize: '0.85rem', fontWeight: isFirst ? 'bold' : 'normal' }}>
                        {normalizeTeamCode(player.team)}
                      </span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '1rem', color: isFirst ? '#d97706' : 'var(--text)', fontWeight: 'bold' }}>
                    {player.goals}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.9rem' }}>
                    {player.matches}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '0.9rem', color: isFirst ? '#b45309' : 'var(--text-light)', fontWeight: isFirst ? 'bold' : 'normal' }}>
                    {ratio}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
