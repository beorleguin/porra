import Papa from 'papaparse';
import { AppState, Match, Participant } from '../domain/types';
import { getCodeFromName, getRealGroupOfTeam, normalizeTeamCode } from './flags';

interface OpenFootballMatch {
  team1: string;
  team2: string;
  date: string;
  time: string;
  ground: string;
  group?: string;
}

export async function loadInitialData(): Promise<AppState> {
  // Try to load from SQLite API endpoint first
  try {
    const apiResponse = await fetch('/api/data');
    if (apiResponse.ok) {
      const dbState = (await apiResponse.json()) as AppState;
      if (dbState && Array.isArray(dbState.matches) && Array.isArray(dbState.participants) && dbState.participants.length > 0) {
        console.log('Successfully loaded AppState from SQLite database!');
        
        // Enrich with OpenFootball API metadata
        try {
          const openFootballResponse = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
          if (openFootballResponse.ok) {
            const apiData = (await openFootballResponse.json()) as { matches: OpenFootballMatch[] };
            if (apiData && Array.isArray(apiData.matches)) {
              apiData.matches.forEach((apiMatch: OpenFootballMatch) => {
                const code1 = getCodeFromName(apiMatch.team1);
                const code2 = getCodeFromName(apiMatch.team2);
                
                if (code1 && code2) {
                  const key = `${code1}-${code2}`;
                  const revKey = `${code2}-${code1}`;
                  
                  const localMatch = dbState.matches.find((m: Match) => m.id === key || m.id === revKey);
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
        } catch (enrichError) {
          console.warn('Failed to enrich matches with live API metadata:', enrichError);
        }
        
        return dbState;
      }
    }
  } catch (apiError) {
    console.warn('SQLite API endpoint unavailable, falling back to CSV parser:', apiError);
  }

  // Fallback: CSV Parser
  const response = await fetch('/porra.csv');
  const csvText = await response.text();
  
  const appState: AppState = await new Promise((resolve, reject) => {
    Papa.parse<string[]>(csvText, {
      skipEmptyLines: false, // We need to keep empty lines to maintain row indices if any
      complete: (results) => {
        try {
          const rows = results.data;
          
          // Find the row containing match headers.
          // Look for 'MEX-RSA'
          let matchHeaderRowIndex = -1;
          for (let i = 0; i < rows.length; i++) {
            if (rows[i].some(cell => cell.includes('MEX-RSA'))) {
              matchHeaderRowIndex = i;
              break;
            }
          }

          if (matchHeaderRowIndex === -1) {
            throw new Error('Could not find match headers in CSV');
          }

          const matchHeaders = rows[matchHeaderRowIndex];
          const realResultsRow = rows[matchHeaderRowIndex + 1];

          // Parse matches
          const matches: Match[] = [];
          const matchColIndices: number[] = [];

          for (let col = 9; col < matchHeaders.length; col++) {
            const header = matchHeaders[col].trim();
            if (header && header !== '-' && header.includes('-')) {
              const [team1, team2] = header.split('-');
              const t1 = normalizeTeamCode(team1.trim());
              const t2 = normalizeTeamCode(team2.trim());
              const realGroup = getRealGroupOfTeam(t1);
              matches.push({
                id: header,
                team1: t1,
                team2: t2,
                group: realGroup,
              });
              matchColIndices.push(col);
            }
          }

          // Parse Real Results
          const realResults: AppState['realResults'] = {
            ganadorFinal: realResultsRow[3]?.trim() || '',
            maxGoleador: realResultsRow[4]?.trim() || '',
            maxAsistente: realResultsRow[5]?.trim() || '',
            mvp: realResultsRow[6]?.trim() || '',
            faseEspana: realResultsRow[7]?.trim() || '',
            matches: {}
          };

          matches.forEach((match, index) => {
            const colIndex = matchColIndices[index];
            const result = realResultsRow[colIndex]?.trim();
            if (result && result !== '-') {
              realResults.matches[match.id] = result;
            }
          });

          // Parse Participants
          const participants: Participant[] = [];
          
          // Participants start after the 'RESULTADO REAL' row
          let currentRow = matchHeaderRowIndex + 2;
          while (currentRow < rows.length) {
            const row = rows[currentRow];
            const name = row[1]?.trim();
            
            // If we hit 'Next' or empty name (and not a points row), we might stop or skip
            if (name && name !== 'Next' && name.toLowerCase() !== 'total') {
              const predictions = {
                ganadorFinal: row[3]?.trim() || '',
                maxGoleador: row[4]?.trim() || '',
                maxAsistente: row[5]?.trim() || '',
                mvp: row[6]?.trim() || '',
                faseEspana: row[7]?.trim() || '',
                matches: {} as Record<string, string>
              };

              matches.forEach((match, index) => {
                const colIndex = matchColIndices[index];
                const pred = row[colIndex]?.trim();
                if (pred && pred !== '-') {
                  predictions.matches[match.id] = pred;
                }
              });

              participants.push({
                name,
                predictions,
                points: {
                  total: 0,
                  ganadorFinal: 0,
                  maxGoleador: 0,
                  maxAsistente: 0,
                  mvp: 0,
                  faseEspana: 0,
                  matches: {}
                }
              });
              
              // Skip the points row underneath each participant
              currentRow += 2;
            } else {
              currentRow += 1;
            }
          }

          resolve({ matches, participants, realResults });
        } catch (error) {
          reject(error);
        }
      },
      error: (error: Error) => {
        reject(error);
      }
    });
  });

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
