import { useState, useMemo } from 'react';
import { Match, Participant, AppState } from '../domain/types';
import { getFlagImgUrl, normalizeTeamCode } from '../utils/flags';
import { formatMatchTimeToClient, parseDateTimeToClientDate } from '../utils/date';
import { Lang } from '../utils/translations';
import { isMatchLive } from '../utils/timezone';

interface Props {
  matches: Match[];
  participants: Participant[];
  realResults: AppState['realResults'];
  lang: Lang;
  theme: 'light' | 'dark';
  onSelectMatch: (match: Match) => void;
}

export function CalendarView({ matches, realResults, lang, onSelectMatch }: Props) {
  const [currentMonth, setCurrentMonth] = useState<'june' | 'july'>('june');
  const [selectedDayMatches, setSelectedDayMatches] = useState<Match[] | null>(null);
  const [selectedDayLabel, setSelectedDayLabel] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // Helper to get local date string YYYY-MM-DD from match
  const getMatchLocalDateStr = (m: Match): string | null => {
    const dateObj = parseDateTimeToClientDate(m.date, m.time);
    if (!dateObj) return null;
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Pre-index matches by local date for rapid lookup
  const matchesByDate = useMemo(() => {
    const map: Record<string, Match[]> = {};
    matches.forEach(m => {
      const localDateStr = getMatchLocalDateStr(m);
      if (localDateStr) {
        if (!map[localDateStr]) map[localDateStr] = [];
        map[localDateStr].push(m);
      }
    });
    return map;
  }, [matches]);

  // Calendar parameters for June and July 2026
  // June 2026 starts on Monday (1st) and has 30 days. No leading empty cells.
  // July 2026 starts on Wednesday (1st) and has 31 days. 2 leading empty cells (Mon, Tue).
  const calendarData = useMemo(() => {
    if (currentMonth === 'june') {
      return {
        monthTitle: lang === 'es' ? 'Junio 2026 ⚽' : 'June 2026 ⚽',
        leadingEmptyCells: 0,
        daysCount: 30,
        monthNumStr: '06',
      };
    } else {
      return {
        monthTitle: lang === 'es' ? 'Julio 2026 🏆' : 'July 2026 🏆',
        leadingEmptyCells: 2, // Monday and Tuesday are empty
        daysCount: 31,
        monthNumStr: '07',
      };
    }
  }, [currentMonth, lang]);

  // Build the list of grid cells representing the month
  const cells = useMemo(() => {
    const list = [];
    const { leadingEmptyCells, daysCount, monthNumStr } = calendarData;

    // 1. Add leading empty cells
    for (let i = 0; i < leadingEmptyCells; i++) {
      list.push({ isEmpty: true, dayNum: 0, dateKey: '' });
    }

    // 2. Add day cells
    for (let day = 1; day <= daysCount; day++) {
      const dayStr = String(day).padStart(2, '0');
      const dateKey = `2026-${monthNumStr}-${dayStr}`;
      const dayMatches = matchesByDate[dateKey] || [];
      
      list.push({
        isEmpty: false,
        dayNum: day,
        dateKey,
        dayMatches,
      });
    }

    return list;
  }, [calendarData, matchesByDate]);

  const handleDayClick = (dateKey: string, dayMatches: Match[]) => {
    if (dayMatches.length === 0) return;
    
    // Format friendly title for the modal
    const dateObj = new Date(Date.parse(`${dateKey}T12:00:00`));
    const formattedLabel = dateObj.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    
    const capitalizedLabel = formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1);
    setSelectedDayLabel(capitalizedLabel);
    setSelectedDayMatches(dayMatches);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setSelectedDate(date);
    const dayMatches = matchesByDate[date] || [];
    if (dayMatches.length > 0) {
      const dateObj = new Date(Date.parse(`${date}T12:00:00`));
      const formattedLabel = dateObj.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      const capitalizedLabel = formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1);
      setSelectedDayLabel(capitalizedLabel);
      setSelectedDayMatches(dayMatches);
      // Scroll to the corresponding section
      const element = document.getElementById(`date-${date}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      setSelectedDayLabel(null);
      setSelectedDayMatches(null);
    }
  };
  const weekdays = lang === 'es' 
    ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="calendar-view-container animate-fade-in">
      
      {/* HEADER CONTROLS */}
      <div className="calendar-month-selector">
        <button 
          className="month-nav-btn" 
          onClick={() => setCurrentMonth('june')} 
          disabled={currentMonth === 'june'}
          style={currentMonth === 'june' ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
          title={lang === 'es' ? 'Mes Anterior' : 'Previous Month'}
        >
          ◀
        </button>
        <h2 className="month-title">{calendarData.monthTitle}</h2>
        <button 
          className="month-nav-btn" 
          onClick={() => setCurrentMonth('july')} 
          disabled={currentMonth === 'july'}
          style={currentMonth === 'july' ? { opacity: 0.3, cursor: 'not-allowed' } : {}}
          title={lang === 'es' ? 'Mes Siguiente' : 'Next Month'}
        >
          ▶
        </button>
      </div>
      {/* Mobile date picker */}
      <div className="mobile-only" style={{ margin: '0.75rem 0 0.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <label
          htmlFor="mobile-date-picker"
          style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {lang === 'es' ? '📅 Ir al día' : '📅 Jump to day'}
        </label>
        <input
          id="mobile-date-picker"
          type="date"
          className="predictions-search-input"
          value={selectedDate}
          onChange={handleDateChange}
          min="2026-06-01"
          max="2026-07-31"
          aria-label={lang === 'es' ? 'Seleccionar día' : 'Select day'}
          style={{ width: '100%', cursor: 'pointer' }}
        />
      </div>


      {/* MONTH GRID (DESKTOP) */}
      <div className="calendar-grid-wrapper desktop-only">
        <div className="calendar-weekdays-header">
          {weekdays.map(d => (
            <div key={d} className="weekday-label">{d}</div>
          ))}
        </div>

        <div className="calendar-days-grid">
          {cells.map((cell, idx) => {
            if (cell.isEmpty) {
              return <div key={`empty-${idx}`} className="calendar-day-cell empty-cell" />;
            }

            const { dayNum, dateKey, dayMatches = [] } = cell;
            const hasMatches = dayMatches.length > 0;

            const playedCount = dayMatches.filter(m => realResults.matches[m.id] && realResults.matches[m.id].trim() !== '' && realResults.matches[m.id].trim() !== '-').length;
            const isFullyPlayed = hasMatches && playedCount === dayMatches.length;
            const isPartiallyPlayed = hasMatches && playedCount > 0 && playedCount < dayMatches.length;
            const isAnyLive = hasMatches && dayMatches.some(m => isMatchLive(m, realResults.matches));

            let statusClass = '';
            if (isFullyPlayed) statusClass = 'completed-day';
            else if (isPartiallyPlayed) statusClass = 'partial-day';
            if (isAnyLive) statusClass += ' live-day';

            return (
              <div 
                key={dateKey} 
                className={`calendar-day-cell ${hasMatches ? 'has-matches' : ''} ${statusClass}`}
                style={{ position: 'relative' }}
                onClick={() => handleDayClick(dateKey, dayMatches)}
                title={hasMatches ? (lang === 'es' ? 'Clic para ver partidos de este día' : 'Click to view matches of this day') : undefined}
              >
                <span className="day-number-label">{dayNum}</span>
                {isAnyLive && (
                  <span 
                    className="live-badge" 
                    style={{ 
                      position: 'absolute', 
                      top: '4px', 
                      right: '4px', 
                      padding: '0.1rem 0.25rem', 
                      fontSize: '0.55rem', 
                      gap: '0.15rem',
                      borderRadius: '6px'
                    }}
                    title={lang === 'es' ? '¡Hay partidos jugando en vivo!' : 'Matches currently playing live!'}
                  >
                    <span className="pulsing-dot" /> {lang === 'es' ? 'VIVO' : 'LIVE'}
                  </span>
                )}
                {hasMatches && (
                  <>
                    {isFullyPlayed && (
                      <span className="day-matches-count-badge badge-completed" title={lang === 'es' ? 'Todos los partidos finalizados' : 'All matches concluded'}>
                        ✓ {dayMatches.length} {lang === 'es' ? 'part.' : 'match'}
                      </span>
                    )}
                    {isPartiallyPlayed && (
                      <span className="day-matches-count-badge badge-partial" title={lang === 'es' ? `${playedCount} de ${dayMatches.length} partidos jugados` : `${playedCount} of ${dayMatches.length} matches played`}>
                        ⏱️ {playedCount}/{dayMatches.length} {lang === 'es' ? 'part.' : 'match'}
                      </span>
                    )}
                    {!isFullyPlayed && !isPartiallyPlayed && (
                      <span className="day-matches-count-badge">
                        ⚽ {dayMatches.length} {lang === 'es' ? 'part.' : 'match'}
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MONTH TIMELINE (MOBILE) */}
      <div className="calendar-mobile-list mobile-only">
        {cells.filter(cell => !cell.isEmpty && cell.dayMatches && cell.dayMatches.length > 0).map(cell => {
          const { dateKey, dayMatches = [] } = cell;

          // Format friendly day label
          const dateObj = new Date(Date.parse(`${dateKey}T12:00:00`));
          const formattedLabel = dateObj.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          const capitalizedLabel = formattedLabel.charAt(0).toUpperCase() + formattedLabel.slice(1);

          return (
            <div key={dateKey} id={`date-${dateKey}`} className="mobile-calendar-day-section">
              <div className="mobile-calendar-day-header">
                <span className="mobile-calendar-day-bullet">📅</span>
                <h4>{capitalizedLabel}</h4>
                <span className="mobile-calendar-match-count">
                  {dayMatches.length} {dayMatches.length === 1 ? (lang === 'es' ? 'partido' : 'match') : (lang === 'es' ? 'partidos' : 'matches')}
                </span>
              </div>
              
              <div className="mobile-calendar-matches-stack">
                {dayMatches.map(m => {
                  const realScore = realResults.matches[m.id];
                  const localTime = formatMatchTimeToClient(m.date, m.time, lang);
                  const isLive = isMatchLive(m, realResults.matches);
                  
                  return (
                    <div key={m.id} className="mobile-calendar-match-card">
                      <div className="mobile-match-card-header">
                        <span className="mobile-match-group">{m.group || 'Grupo'}</span>
                        {m.ground && <span className="mobile-match-ground">📍 {m.ground}</span>}
                      </div>

                      <div className="mobile-match-card-body">
                        <div className="mobile-match-teams">
                          <div className="mobile-match-team-row">
                            <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '22px', height: '15px', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                            <span className="team-code">{normalizeTeamCode(m.team1)}</span>
                          </div>
                          <div className="mobile-match-vs">VS</div>
                          <div className="mobile-match-team-row">
                            <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '22px', height: '15px', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                            <span className="team-code">{normalizeTeamCode(m.team2)}</span>
                          </div>
                        </div>

                        <div className="mobile-match-info-box">
                          {isLive ? (
                            <span className="live-badge" style={{ padding: '0.15rem 0.45rem', fontSize: '0.68rem', borderRadius: '12px' }}>
                              <span className="pulsing-dot" /> {lang === 'es' ? 'VIVO' : 'LIVE'}
                            </span>
                          ) : (
                            <span className="kickoff-time">⏰ {localTime || m.time}</span>
                          )}
                          {realScore && (
                            <span className="match-result-badge">
                              {lang === 'es' ? 'Resultado:' : 'Result:'} <strong>{realScore}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mobile-match-card-actions">
                        <button 
                          className="calendar-action-btn mobile-action-btn"
                          onClick={() => onSelectMatch(m)}
                        >
                          {lang === 'es' ? 'Ver Pronósticos 🔎' : 'View Predictions 🔎'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL POPUP FOR DAY MATCHES */}
      {selectedDayMatches && (
        <div className="day-matches-popup-overlay" onClick={() => setSelectedDayMatches(null)}>
          <div className="day-matches-popup" onClick={e => e.stopPropagation()}>
            <div className="day-matches-popup-header">
              <h3 className="day-matches-popup-title">📅 {selectedDayLabel}</h3>
              <button className="day-matches-popup-close" onClick={() => setSelectedDayMatches(null)}>×</button>
            </div>
            
            <div className="day-matches-popup-body">
              {selectedDayMatches.map(m => {
                const realScore = realResults.matches[m.id];
                const localTime = formatMatchTimeToClient(m.date, m.time, lang);
                
                return (
                  <div key={m.id} className="day-popup-match-row">
                    <div className="day-popup-match-meta">
                      <span>{m.group || 'Fase del Torneo'}</span>
                      {m.ground && <span>📍 {m.ground}</span>}
                    </div>

                    <div className="day-popup-match-teams">
                      <div className="day-popup-team-line">
                        <div className="day-popup-team-left">
                          <img src={getFlagImgUrl(m.team1)} alt={m.team1} className="flag-icon-img" style={{ width: '22px', height: '15px', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                          <span>{normalizeTeamCode(m.team1)}</span>
                        </div>
                      </div>
                      
                      <div className="day-popup-team-line">
                        <div className="day-popup-team-left">
                          <img src={getFlagImgUrl(m.team2)} alt={m.team2} className="flag-icon-img" style={{ width: '22px', height: '15px', borderRadius: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }} />
                          <span>{normalizeTeamCode(m.team2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="day-popup-match-footer">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {isMatchLive(m, realResults.matches) ? (
                          <span className="live-badge" style={{ alignSelf: 'flex-start', padding: '0.2rem 0.5rem', fontSize: '0.7rem', marginBottom: '0.15rem' }}>
                            <span className="pulsing-dot" style={{ width: '9px', height: '9px' }} /> {lang === 'es' ? 'EN JUEGO' : 'LIVE NOW'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-light)', fontWeight: '600' }}>
                            ⏰ Kickoff: {localTime || m.time}
                          </span>
                        )}
                        {realScore && (
                          <span style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 'bold' }}>
                            {lang === 'es' ? 'Resultado:' : 'Result:'} {realScore}
                          </span>
                        )}
                      </div>
                      
                      <button 
                        className="calendar-action-btn"
                        onClick={() => {
                          setSelectedDayMatches(null);
                          onSelectMatch(m);
                        }}
                      >
                        {lang === 'es' ? 'Ver Pronósticos 🔎' : 'View Predictions 🔎'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
