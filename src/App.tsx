import { useEffect, useState } from 'react';
import { loadInitialData } from './utils/parser';
import { AppState, Predictions, Match } from './domain/types';
import { calculatePointsForParticipant } from './domain/scoring';
import { Leaderboard } from './components/Leaderboard';
import { AdminPanel } from './components/AdminPanel';
import { ParticipantDetails } from './components/ParticipantDetails';
import { TournamentBracket } from './components/TournamentBracket';
import { PlayerStats } from './components/PlayerStats';
import { CalendarView } from './components/CalendarView';
import { MatchPredictionsModal } from './components/MatchPredictionsModal';
import { TRANSLATIONS, Lang } from './utils/translations';
import confetti from 'canvas-confetti';
import './index.css';

type ActiveTab = 'leaderboard' | 'calendar' | 'bracket' | 'admin' | 'stats';

function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedParticipantName, setSelectedParticipantName] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<ActiveTab>('leaderboard');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'light');
  const [selectedMatchForPredictions, setSelectedMatchForPredictions] = useState<Match | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const lang: Lang = 'es';

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    async function init() {
      try {
        // Load fresh matches, participants, and real results directly from our SQLite/Postgres backend DB
        const freshData = await loadInitialData();
        setAppState(freshData);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        setError(errMsg);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const t = TRANSLATIONS[lang];

  if (loading) return <div className="loading">Loading...</div>;
  
  if (isRestoring) {
    return (
      <div className="loading animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <span style={{ fontSize: '2rem' }}>🔄</span>
        <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>{lang === 'es' ? 'Restaurando copia de seguridad...' : 'Restoring backup...'}</span>
        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>{lang === 'es' ? 'No cierres esta pestaña...' : 'Do not close this tab...'}</span>
      </div>
    );
  }

  if (error) return <div className="error">Error: {error}</div>;
  if (!appState) return null;

  // Calculate scores on the fly
  const scoredParticipants = appState.participants.map(p => ({
    ...p,
    points: calculatePointsForParticipant(p, appState.realResults)
  })).sort((a, b) => b.points.total - a.points.total);

  const handleUpdateRealResults = async (newResults: AppState['realResults']) => {
    // Save physically to Supabase through Netlify Function
    try {
      const response = await fetch('/api/save-csv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          realResults: newResults,
          adminPassword: adminPassword || undefined,
        }),
      });

      const resData = await response.json();

      if (resData.success) {
        setAppState({ ...appState, realResults: newResults });
        alert(t.alertSaveResultsSuccess);

        // Trigger confetti if M104 (Final) result was just set!
        const hadFinalResult = appState.realResults.matches['M104'];
        const hasFinalResult = newResults.matches['M104'];
        if (!hadFinalResult && hasFinalResult && hasFinalResult.trim() !== '' && hasFinalResult.trim() !== '-') {
          // Launch a massive, beautiful confetti rain!
          confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
          });
          // Also launch some side bursts for extra premium flair!
          setTimeout(() => {
            confetti({
              particleCount: 50,
              angle: 60,
              spread: 55,
              origin: { x: 0 }
            });
          }, 250);
          setTimeout(() => {
            confetti({
              particleCount: 50,
              angle: 120,
              spread: 55,
              origin: { x: 1 }
            });
          }, 400);
        }
      } else {
        alert(t.alertSaveResultsError + resData.error);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(t.alertSaveResultsConnError + errorMsg);
    }
  };

  const handleSavePredictions = async (name: string, updatedPredictions: Predictions, password?: string) => {
    if (!appState) return;

    try {
      const response = await fetch('/api/save-predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          predictions: updatedPredictions,
          password,
          adminPassword: isAdminAuthenticated ? adminPassword || undefined : undefined,
        })
      });

      const resData = await response.json();

      if (resData.success) {
        const updatedParticipants = appState.participants.map(p => {
          if (p.name.trim().toLowerCase() === name.trim().toLowerCase()) {
            return {
              ...p,
              predictions: updatedPredictions,
              password: password || p.password
            };
          }
          return p;
        });

        setAppState({
          ...appState,
          participants: updatedParticipants
        });

        alert(t.alertSavePredsSuccess.replace('{name}', name));
      } else {
        alert(t.alertSavePredsError + resData.error);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(t.alertSavePredsConnError + errorMsg);
    }
  };

  const handleExportBackup = () => {
    if (!appState) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href",     dataStr);
    
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const timestamp = `${dateStr}_${timeStr}`;
    
    downloadAnchor.setAttribute("download", `mundial_porra_backup_${timestamp}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleRestoreBackup = async (backupData: AppState) => {
    setIsRestoring(true);
    try {
      const response = await fetch('/api/restore-backup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backupData,
          adminPassword: adminPassword || undefined,
        }),
      });
      const resData = await response.json();
      if (resData.success) {
        setAppState(backupData);
        setSelectedParticipantName(null);
        
        // Notify the user that it succeeded and will refresh now
        alert(
          lang === 'es'
            ? '🔄 ¡Copia de seguridad restaurada con éxito! La página se actualizará ahora.'
            : '🔄 Backup restored successfully! The page will now refresh.'
        );
        window.location.reload();
      } else {
        setIsRestoring(false);
        alert(
          (lang === 'es' ? '❌ Error al restaurar copia: ' : '❌ Error restoring backup: ') + 
          resData.error
        );
      }
    } catch (err: unknown) {
      setIsRestoring(false);
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(
        (lang === 'es' ? '❌ Error de conexión al restaurar: ' : '❌ Connection error during restore: ') + 
        errorMsg
      );
    }
  };

  const handleAdminTabClick = () => {
    if (isAdminAuthenticated) {
      setCurrentTab('admin');
      setIsMobileMenuOpen(false);
    } else {
      const password = window.prompt(t.promptAdminPass);
      if (password === 'root') {
        setIsAdminAuthenticated(true);
        setAdminPassword(password);
        setCurrentTab('admin');
        setIsMobileMenuOpen(false);
      } else if (password !== null) {
        alert(t.alertIncorrectPass);
      }
    }
  };

  const selectedParticipant = scoredParticipants.find(p => p.name === selectedParticipantName);

  return (
    <div className="container">
      <header className="header">
        <div className="logo-area">
          <div className="logo-section">
            <h1>{t.title}</h1>
            <p className="app-subtitle">{t.subtitle}</p>
          </div>
          
          <div className="mobile-header-actions">
            <button 
              className="theme-toggle-btn mobile-only"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title={theme === 'light' ? 'Activar Modo Oscuro' : 'Activar Modo Claro'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button 
              className={`mobile-menu-toggle-btn ${isMobileMenuOpen ? 'open' : ''}`}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
        
        <div className={`header-right ${isMobileMenuOpen ? 'mobile-menu-open' : ''}`}>
          <nav className="nav-tabs">
            <button 
              className={`nav-tab-btn ${currentTab === 'leaderboard' ? 'active' : ''}`}
              onClick={() => { setCurrentTab('leaderboard'); setIsMobileMenuOpen(false); }}
            >
              {t.tabLeaderboard}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'calendar' ? 'active' : ''}`}
              onClick={() => { setCurrentTab('calendar'); setIsMobileMenuOpen(false); }}
            >
              {t.tabCalendar}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'bracket' ? 'active' : ''}`}
              onClick={() => { setCurrentTab('bracket'); setIsMobileMenuOpen(false); }}
            >
              {t.tabBracket}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'stats' ? 'active' : ''}`}
              onClick={() => { setCurrentTab('stats'); setIsMobileMenuOpen(false); }}
            >
              {t.tabStats}
            </button>
            <button 
              className={`nav-tab-btn ${currentTab === 'admin' ? 'active' : ''}`}
              onClick={handleAdminTabClick}
            >
              {t.tabAdmin}
            </button>
          </nav>

          <button 
            className="theme-toggle-btn desktop-only"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? 'Activar Modo Oscuro' : 'Activar Modo Claro'}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <main className="main-content">
        {currentTab === 'leaderboard' ? (
          <div className="full-panel">
            <Leaderboard 
              participants={scoredParticipants} 
              realResults={appState.realResults}
              matches={appState.matches}
              selectedParticipantName={selectedParticipantName}
              onSelectParticipant={(p) => {
                setHighlightedMatchId(null); // Clear focus when clicking from table
                setSelectedParticipantName(p.name);
              }}
              lang={lang}
              boteData={appState.bote}
            />
            {selectedParticipant && (
              <div className="modal-overlay" onClick={() => { setSelectedParticipantName(null); setHighlightedMatchId(null); }}>
                <button 
                  className="modal-close-btn" 
                  style={{ position: 'fixed', top: '20px', right: '35px', color: '#9ca3af', fontSize: '36px', background: 'none', border: 'none', cursor: 'pointer', zIndex: 10000, transition: 'color 0.15s' }} 
                  onClick={() => { setSelectedParticipantName(null); setHighlightedMatchId(null); }}
                  title={lang === 'es' ? 'Cerrar' : 'Close'}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; }}
                >
                  ×
                </button>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                  <ParticipantDetails
                    participant={selectedParticipant}
                    matches={appState.matches}
                    realResults={appState.realResults}
                    onClose={() => { setSelectedParticipantName(null); setHighlightedMatchId(null); }}
                    onSavePredictions={handleSavePredictions}
                    lang={lang}
                    theme={theme}
                    isAdmin={isAdminAuthenticated}
                    initialMatchId={highlightedMatchId}
                  />
                </div>
              </div>
            )}
          </div>
        ) : currentTab === 'calendar' ? (
          <div className="full-panel">
            <CalendarView 
              matches={appState.matches}
              realResults={appState.realResults}
              participants={scoredParticipants}
              lang={lang}
              theme={theme}
              onSelectMatch={(m) => setSelectedMatchForPredictions(m)}
            />
          </div>
        ) : currentTab === 'bracket' ? (
          <div className="full-panel">
            <TournamentBracket 
              matches={appState.matches}
              realResults={appState.realResults}
              participants={scoredParticipants}
              lang={lang}
              theme={theme}
              onNavigateToParticipant={(p, matchId) => {
                setHighlightedMatchId(matchId);
                setSelectedParticipantName(p.name);
                setCurrentTab('leaderboard'); // Switch tab to leaderboard so the details modal opens!
              }}
            />
          </div>
        ) : currentTab === 'stats' ? (
          <div className="full-panel">
            <PlayerStats lang={lang} />
          </div>
        ) : (
          <div className="full-panel">
            <AdminPanel 
              matches={appState.matches} 
              realResults={appState.realResults} 
              participants={scoredParticipants}
              onUpdate={handleUpdateRealResults} 
              onExportBackup={handleExportBackup}
              onRestoreBackup={handleRestoreBackup}
              lang={lang}
              theme={theme}
            />
          </div>
        )}
      </main>

      {/* Global Match Predictions Modal */}
      {selectedMatchForPredictions && (
        <MatchPredictionsModal
          match={selectedMatchForPredictions}
          participants={scoredParticipants}
          realScore={appState.realResults.matches[selectedMatchForPredictions.id]}
          lang={lang}
          onClose={() => setSelectedMatchForPredictions(null)}
          onNavigateToParticipant={(p) => {
            setSelectedMatchForPredictions(null);
            setHighlightedMatchId(selectedMatchForPredictions.id);
            setSelectedParticipantName(p.name);
            setCurrentTab('leaderboard'); // Switch to leaderboard tab so the ParticipantDetails modal can render
          }}
        />
      )}

      <footer className="app-footer animate-fade-in">
        <div className="footer-grid">
          <div className="footer-column">
            <h4>🏆 Mundial FIFA 2026</h4>
            <p><strong>Sedes:</strong> Estados Unidos, México y Canadá 🏟️</p>
            <p style={{ marginTop: '0.4rem' }}><strong>Fechas:</strong> Del 11 de junio al 19 de julio de 2026.</p>
            <p style={{ marginTop: '0.4rem' }}><strong>Formato:</strong> Edición histórica de 48 selecciones en 12 grupos de 4. Clasifican los 2 mejores de cada grupo y los 8 mejores terceros para la fase final (1/16).</p>
          </div>

          <div className="footer-column">
            <h4>📝 Reglas de la Porra</h4>
            
            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#10b981', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.05em' }}>
              Fase de Grupos
            </div>
            <ul style={{ marginBottom: '1rem' }}>
              <li>
                <span>Resultado Exacto (Pleno)</span>
                <span className="footer-badge-pts">3 pts</span>
              </li>
              <li>
                <span>Signo (Ganador/Empate)</span>
                <span className="footer-badge-pts">1 pt</span>
              </li>
              <li>
                <span>Cierre de Apuestas</span>
                <span style={{ fontSize: '0.75rem', fontStyle: 'italic', color: 'var(--text-light)' }}>6h antes del inicio</span>
              </li>
            </ul>

            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#3b82f6', textTransform: 'uppercase', marginBottom: '0.35rem', letterSpacing: '0.05em' }}>
              Fase Eliminatoria (Min. 120)
            </div>
            <ul>
              <li>
                <span>Pleno al final de Prórroga</span>
                <span className="footer-badge-pts">3 pts</span>
              </li>
              <li>
                <span>Signo al final de Prórroga</span>
                <span className="footer-badge-pts">1 pt</span>
              </li>
              <li>
                <span>Clasificado que avanza</span>
                <span className="footer-badge-pts">1 pt</span>
              </li>
            </ul>
          </div>

          <div className="footer-column">
            <h4>✨ Puntos Especiales</h4>
            <ul>
              <li>
                <span>Ganador Final</span>
                <span className="footer-badge-pts">10 pts</span>
              </li>
              <li>
                <span>Máximo Goleador</span>
                <span className="footer-badge-pts">8 pts</span>
              </li>
              <li>
                <span>Máximo Asistente</span>
                <span className="footer-badge-pts">7 pts</span>
              </li>
              <li>
                <span>MVP del Mundial</span>
                <span className="footer-badge-pts">6 pts</span>
              </li>
              <li>
                <span>Fase de España</span>
                <span className="footer-badge-pts">4 pts</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2026 Porra Mundial. Diseñado con pasión futbolera 🌍</p>
        </div>
      </footer>

      {showScrollTop && (
        <button 
          className="scroll-to-top-btn mobile-only" 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label={lang === 'es' ? 'Volver arriba' : 'Scroll to top'}
        >
          ▲
        </button>
      )}
    </div>
  );
}

export default App;
