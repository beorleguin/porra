import { AppState } from '../domain/types';
import { getCodeFromName } from './flags';

interface OpenFootballMatch {
  team1: string;
  team2: string;
  date: string;
  time: string;
  ground: string;
  group?: string;
}

export async function loadInitialData(): Promise<AppState> {
  // Check if we are running in local dev mode (offline / standalone)
  const isLocalDevMode = localStorage.getItem('porra_dev_mode') === 'true';

  if (!isLocalDevMode) {
    try {
      const apiResponse = await fetch('/api/data');
      const contentType = apiResponse.headers.get('content-type');
      if (apiResponse.ok && contentType && contentType.includes('application/json')) {
        const dbState = (await apiResponse.json()) as AppState;
        if (dbState && Array.isArray(dbState.matches) && Array.isArray(dbState.participants) && dbState.participants.length > 0) {
          console.log('Successfully loaded AppState from SQLite database!');
          localStorage.removeItem('porra_local_state'); // Clear local dev data to stay in sync with DB
          return await enrichWithOpenFootball(dbState);
        }
      }
    } catch (apiError) {
      console.warn('SQLite API endpoint unavailable, switching to LocalStorage Standalone Mode:', apiError);
    }
  }

  // Set local dev mode flag so client knows it is running in local storage standalone
  localStorage.setItem('porra_dev_mode', 'true');

  // Load from local storage
  const localSavedState = localStorage.getItem('porra_local_state');
  if (localSavedState) {
    try {
      const state = JSON.parse(localSavedState) as AppState;
      if (state && Array.isArray(state.matches) && Array.isArray(state.participants)) {
        console.log('Successfully loaded AppState from browser LocalStorage Standalone Mode!');
        return await enrichWithOpenFootball(state);
      }
    } catch (e) {
      console.warn('Failed to parse AppState from localStorage, reloading from template:', e);
    }
  }

  // Fallback: JSON Template
  try {
    const response = await fetch('/porra_template.json');
    if (response.ok) {
      const appState = (await response.json()) as AppState;
      console.log('Successfully loaded fallback AppState from JSON template! Saving to LocalStorage.');
      const enriched = await enrichWithOpenFootball(appState);
      localStorage.setItem('porra_local_state', JSON.stringify(enriched));
      return enriched;
    } else {
      throw new Error(`Failed to fetch /porra_template.json: HTTP ${response.status}`);
    }
  } catch (jsonError) {
    console.error('Failed to load JSON template fallback:', jsonError);
    throw new Error('Could not load initial data. Both SQLite API and JSON template fallback failed.');
  }
}

async function enrichWithOpenFootball(appState: AppState): Promise<AppState> {
  // Try to enrich matches with OpenFootball API metadata
  try {
    const apiResponse = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
    if (apiResponse.ok) {
      const apiData = (await apiResponse.json()) as { matches: OpenFootballMatch[] };
      if (apiData && Array.isArray(apiData.matches)) {
        apiData.matches.forEach((apiMatch: OpenFootballMatch) => {
          const code1 = getCodeFromName(apiMatch.team1);
          const code2 = getCodeFromName(apiMatch.team2);
          
          if (code1 && code2) {
            const key = `${code1}-${code2}`;
            const revKey = `${code2}-${code1}`;
            
            const localMatch = appState.matches.find(m => m.id === key || m.id === revKey);
            if (localMatch) {
              localMatch.date = apiMatch.date;
              localMatch.time = apiMatch.time;
              localMatch.ground = apiMatch.ground;
              if (apiMatch.group) {
                localMatch.group = apiMatch.group;
              }
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn("Failed to enrich matches with live API metadata:", e);
  }
  return appState;
}
