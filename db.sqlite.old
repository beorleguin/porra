import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { AppState, Match, Participant, Predictions } from './src/domain/types';
import { getCodeFromName } from './src/utils/flags';

const DB_PATH = path.resolve(__dirname, 'porra.db');
const JSON_TEMPLATE_PATH = path.resolve(__dirname, 'public/porra_template.json');

let dbInstance: sqlite3.Database | null = null;

/**
 * Gets or creates the SQLite database connection instance.
 */
export function getDb(): sqlite3.Database {
  if (!dbInstance) {
    dbInstance = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Failed to open SQLite database:', err.message);
      } else {
        console.log('Connected to SQLite database at:', DB_PATH);
        // Set busy timeout to 5000 ms to avoid SQLITE_BUSY errors
        dbInstance?.configure("busyTimeout", 5000);
        dbInstance?.run("PRAGMA busy_timeout = 5000;");
      }
    });
  }
  return dbInstance;
}

/**
 * Helper to execute a query wrapping SQLite in a Promise.
 */
export function runQuery(sql: string, params: unknown[] = []): Promise<void> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Helper to run a SELECT query that returns multiple rows.
 */
export function selectAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows as T[]);
      }
    });
  });
}

/**
 * Helper to run a SELECT query that returns a single row.
 */
export function selectOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve((row as T) || null);
      }
    });
  });
}

/**
 * Initializes the database tables and populates them from porra_template.json if the database is empty.
 */
export async function initDb(): Promise<void> {
  console.log('Initializing SQLite Database...');
  
  // Create tables if they do not exist
  await runQuery(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      team1 TEXT,
      team2 TEXT,
      group_name TEXT,
      date TEXT,
      time TEXT,
      ground TEXT,
      real_result TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS participants (
      name TEXT PRIMARY KEY,
      password TEXT,
      ganador_final TEXT,
      max_goleador TEXT,
      max_asistente TEXT,
      mvp TEXT,
      fase_espana TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS predictions (
      participant_name TEXT,
      match_id TEXT,
      prediction TEXT,
      PRIMARY KEY (participant_name, match_id),
      FOREIGN KEY (participant_name) REFERENCES participants (name) ON DELETE CASCADE,
      FOREIGN KEY (match_id) REFERENCES matches (id)
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS bote (
      name TEXT PRIMARY KEY,
      amount TEXT
    )
  `);

  await runQuery(`
    CREATE TABLE IF NOT EXISTS player_stats (
      name TEXT,
      team TEXT,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      matches INTEGER DEFAULT 0,
      PRIMARY KEY (name, team)
    )
  `);

  // Run a lightweight migration in case table was created before 'password' column was introduced
  try {
    await runQuery('ALTER TABLE participants ADD COLUMN password TEXT');
    console.log('Database migrated successfully: added password column.');
  } catch {
    // Column already exists, swallow the error
  }

  // Clear any outdated player stats cache from database to force a fresh fetch
  try {
    await runQuery(`DELETE FROM settings WHERE key IN ('player_stats_json', 'player_stats_last_updated')`);
    console.log('Successfully cleared outdated player stats cache from SQLite Settings.');
  } catch (err) {
    console.error('Failed to clear player stats cache:', err);
  }

  // Check if database already has participants
  const rowCount = await selectOne<{ count: number }>('SELECT COUNT(*) as count FROM participants');
  const hasParticipants = rowCount ? rowCount.count > 0 : false;

  if (!hasParticipants) {
    await seedFromJson();
  } else {
    console.log('Database already initialized with', rowCount?.count, 'participants.');
  }
}

/**
 * Seeds the database by parsing the public/porra_template.json file.
 */
async function seedFromJson(): Promise<void> {
  if (!fs.existsSync(JSON_TEMPLATE_PATH)) {
    console.warn(`Seed failed: JSON template file not found at ${JSON_TEMPLATE_PATH}`);
    return;
  }

  console.log('Seeding Database from JSON template:', JSON_TEMPLATE_PATH);
  try {
    const jsonText = fs.readFileSync(JSON_TEMPLATE_PATH, 'utf8');
    const state = JSON.parse(jsonText);
    await restoreBackup(state);
    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Failed to seed database from JSON template:', err);
  }
}

/**
 * Returns the entire AppState constructed from the SQLite tables.
 */
export async function getAppState(): Promise<AppState> {
  // 1. Fetch Matches
  const matchRows = await selectAll<{
    id: string;
    team1: string;
    team2: string;
    group_name: string;
    date: string;
    time: string;
    ground: string;
    real_result: string;
  }>('SELECT * FROM matches');

  const matches: Match[] = matchRows.map(row => ({
    id: row.id,
    team1: row.team1,
    team2: row.team2,
    group: row.group_name || undefined,
    realResult: row.real_result || undefined,
    date: row.date || undefined,
    time: row.time || undefined,
    ground: row.ground || undefined
  }));

  // 2. Fetch Settings for Real Results
  const settingsRows = await selectAll<{ key: string; value: string }>('SELECT * FROM settings');
  const settingsMap = new Map(settingsRows.map(s => [s.key, s.value]));

  const realResults: AppState['realResults'] = {
    ganadorFinal: settingsMap.get('real_ganador_final') || '',
    maxGoleador: settingsMap.get('real_max_goleador') || '',
    maxAsistente: settingsMap.get('real_max_asistente') || '',
    mvp: settingsMap.get('real_mvp') || '',
    faseEspana: settingsMap.get('real_fase_espana') || '',
    matches: {}
  };

  matches.forEach(m => {
    if (m.realResult) {
      realResults.matches[m.id] = m.realResult;
    }
  });

  // 3. Fetch Participants and Predictions
  const participantRows = await selectAll<{
    name: string;
    password?: string;
    ganador_final: string;
    max_goleador: string;
    max_asistente: string;
    mvp: string;
    fase_espana: string;
  }>('SELECT * FROM participants');

  const allPredictions = await selectAll<{
    participant_name: string;
    match_id: string;
    prediction: string;
  }>('SELECT * FROM predictions');

  // Map predictions by participant name for quick lookup
  const predictionsMap = new Map<string, Record<string, string>>();
  allPredictions.forEach(p => {
    if (!predictionsMap.has(p.participant_name)) {
      predictionsMap.set(p.participant_name, {});
    }
    predictionsMap.get(p.participant_name)![p.match_id] = p.prediction;
  });

  const participants: Participant[] = participantRows.map(row => {
    const preds = predictionsMap.get(row.name) || {};
    return {
      name: row.name,
      predictions: {
        ganadorFinal: row.ganador_final || '',
        maxGoleador: row.max_goleador || '',
        maxAsistente: row.max_asistente || '',
        mvp: row.mvp || '',
        faseEspana: row.fase_espana || '',
        matches: preds
      },
      password: row.password || undefined,
      points: {
        total: 0,
        ganadorFinal: 0,
        maxGoleador: 0,
        maxAsistente: 0,
        mvp: 0,
        faseEspana: 0,
        matches: {}
      }
    };
  });

  // 4. Fetch Bote Payments
  const boteRows = await selectAll<{ name: string; amount: string }>('SELECT * FROM bote');
  const boteState: AppState['bote'] = {
    total: settingsMap.get('bote_total') || '380,00 €',
    prizes: {
      first: settingsMap.get('prize_1') || '230,00 €',
      second: settingsMap.get('prize_2') || '100,00 €',
      third: settingsMap.get('prize_3') || '50,00 €'
    },
    payments: boteRows.map(row => ({ name: row.name, amount: row.amount }))
  };

  return { matches, participants, realResults, bote: boteState };
}

/**
 * Saves real results into the SQLite database.
 */
export async function saveRealResults(data: AppState['realResults']): Promise<void> {
  await runQuery('BEGIN TRANSACTION');
  try {
    // Update Settings
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_ganador_final', ?)`, [data.ganadorFinal || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_max_goleador', ?)`, [data.maxGoleador || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_max_asistente', ?)`, [data.maxAsistente || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_mvp', ?)`, [data.mvp || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_fase_espana', ?)`, [data.faseEspana || '']);

    // Update Matches real results
    for (const [matchId, result] of Object.entries(data.matches)) {
      await runQuery(`UPDATE matches SET real_result = ? WHERE id = ?`, [result || null, matchId]);
    }

    await runQuery('COMMIT');
  } catch (err) {
    try {
      await runQuery('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr);
    }
    throw err;
  }
}

/**
 * Saves or updates predictions for a participant in the SQLite database.
 */
export async function saveParticipantPredictions(name: string, data: Predictions, password?: string): Promise<void> {
  await runQuery('BEGIN TRANSACTION');
  try {
    if (password) {
      // Update Participant metadata including password
      await runQuery(
        `INSERT OR REPLACE INTO participants (name, password, ganador_final, max_goleador, max_asistente, mvp, fase_espana) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, password, data.ganadorFinal || '', data.maxGoleador || '', data.maxAsistente || '', data.mvp || '', data.faseEspana || '']
      );
    } else {
      // Update Participant metadata keeping existing password
      await runQuery(
        `INSERT INTO participants (name, ganador_final, max_goleador, max_asistente, mvp, fase_espana) VALUES (?, ?, ?, ?, ?, ?) 
         ON CONFLICT(name) DO UPDATE SET ganador_final=excluded.ganador_final, max_goleador=excluded.max_goleador, max_asistente=excluded.max_asistente, mvp=excluded.mvp, fase_espana=excluded.fase_espana`,
        [name, data.ganadorFinal || '', data.maxGoleador || '', data.maxAsistente || '', data.mvp || '', data.faseEspana || '']
      );
    }

    // Delete existing predictions for this participant first to ensure clean state
    await runQuery(`DELETE FROM predictions WHERE participant_name = ?`, [name]);

    // Insert new match predictions
    for (const [matchId, pred] of Object.entries(data.matches)) {
      if (pred && pred !== '-') {
        await runQuery(
          `INSERT INTO predictions (participant_name, match_id, prediction) VALUES (?, ?, ?)`,
          [name, matchId, pred]
        );
      }
    }

    await runQuery('COMMIT');
  } catch (err) {
    try {
      await runQuery('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr);
    }
    throw err;
  }
}

/**
 * Resets the database by dropping all tables and re-initializing from the immutable JSON templates.
 */
export async function resetDb(): Promise<void> {
  console.log('Resetting SQLite Database...');
  
  await runQuery('DROP TABLE IF EXISTS predictions');
  await runQuery('DROP TABLE IF EXISTS participants');
  await runQuery('DROP TABLE IF EXISTS matches');
  await runQuery('DROP TABLE IF EXISTS settings');
  await runQuery('DROP TABLE IF EXISTS bote');
  
  await initDb();
}

/**
 * Restores the entire database from a backup AppState JSON.
 */
export async function restoreBackup(state: AppState): Promise<void> {
  console.log('Restoring Database from Backup JSON...');
  
  const payload = (state as any).backupData || state;
  
  // 1. Wipe all existing rows from all tables to avoid orphaned records
  await runQuery('DELETE FROM predictions');
  await runQuery('DELETE FROM participants');
  await runQuery('DELETE FROM matches');
  await runQuery('DELETE FROM settings');
  await runQuery('DELETE FROM bote');
  
  // 2. Insert matches from backup
  for (const match of payload.matches) {
    await runQuery(
      `INSERT OR REPLACE INTO matches (id, team1, team2, group_name, date, time, ground, real_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        match.id, 
        match.team1, 
        match.team2, 
        match.group || null, 
        match.date || null, 
        match.time || null, 
        match.ground || null, 
        match.realResult || null
      ]
    );
  }
  
  // 3. Insert settings (real results metadata)
  const rr = payload.realResults;
  await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_ganador_final', ?)`, [rr.ganadorFinal || '']);
  await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_max_goleador', ?)`, [rr.maxGoleador || '']);
  await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_max_asistente', ?)`, [rr.maxAsistente || '']);
  await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_mvp', ?)`, [rr.mvp || '']);
  await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('real_fase_espana', ?)`, [rr.faseEspana || '']);
  
  // 4. Insert settings (bote metadata and payments)
  if (payload.bote) {
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('bote_total', ?)`, [payload.bote.total || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('prize_1', ?)`, [payload.bote.prizes.first || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('prize_2', ?)`, [payload.bote.prizes.second || '']);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('prize_3', ?)`, [payload.bote.prizes.third || '']);
    
    // Insert bote payments
    for (const payment of payload.bote.payments) {
      await runQuery(
        `INSERT OR REPLACE INTO bote (name, amount) VALUES (?, ?)`,
        [payment.name, payment.amount]
      );
    }
  }
  
  // 5. Insert participants & predictions
  for (const p of payload.participants) {
    await runQuery(
      `INSERT OR REPLACE INTO participants (name, password, ganador_final, max_goleador, max_asistente, mvp, fase_espana) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        p.name, 
        p.password || null, 
        p.predictions.ganadorFinal || '', 
        p.predictions.maxGoleador || '', 
        p.predictions.maxAsistente || '', 
        p.predictions.mvp || '', 
        p.predictions.faseEspana || ''
      ]
    );
    
    // Insert predictions
    for (const [matchId, pred] of Object.entries(p.predictions.matches)) {
      if (pred && pred !== '-') {
        await runQuery(
          `INSERT OR REPLACE INTO predictions (participant_name, match_id, prediction) VALUES (?, ?, ?)`,
          [p.name, matchId, pred]
        );
      }
    }
  }
  
  console.log('Database restored from Backup successfully!');
}

export interface PlayerStat {
  name: string;
  team: string;
  goals: number;
  assists: number;
  matches: number;
}

export interface PlayerStatsData {
  scorers: PlayerStat[];
  assistants: PlayerStat[];
}

/**
 * Fetches player stats from the SQLite player_stats table.
 * If the table is empty, it automatically triggers a sync to populate it.
 */
export async function getPlayerStatsWithCache(): Promise<PlayerStatsData> {
  try {
    // Safeguard: Ensure the player_stats table exists
    await runQuery(`
      CREATE TABLE IF NOT EXISTS player_stats (
        name TEXT,
        team TEXT,
        goals INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        matches INTEGER DEFAULT 0,
        PRIMARY KEY (name, team)
      )
    `);

    const countRow = await selectOne<{ count: number }>('SELECT COUNT(*) as count FROM player_stats');
    const hasPlayers = countRow ? countRow.count > 0 : false;

    if (!hasPlayers) {
      await syncOpenFootballData();
    }

    const rows = await selectAll<{
      name: string;
      team: string;
      goals: number;
      assists: number;
      matches: number;
    }>('SELECT * FROM player_stats ORDER BY goals DESC, assists DESC, name ASC');

    const scorers = rows.map(r => ({
      name: r.name,
      team: r.team,
      goals: r.goals,
      assists: r.assists,
      matches: r.matches
    }));

    return {
      scorers,
      assistants: []
    };
  } catch (err) {
    console.error('Failed to select player stats from SQLite player_stats:', err);
    return { scorers: [], assistants: [] };
  }
}

/**
 * Syncs match results and player statistics from OpenFootball raw JSON into local SQLite database.
 * Returns the number of matches that had their real scores updated.
 */
export async function syncOpenFootballData(): Promise<{ success: boolean; updatedMatchesCount: number }> {
  console.log('Syncing database with OpenFootball live data...');
  try {
    // Safeguard: Ensure the player_stats table exists
    await runQuery(`
      CREATE TABLE IF NOT EXISTS player_stats (
        name TEXT,
        team TEXT,
        goals INTEGER DEFAULT 0,
        assists INTEGER DEFAULT 0,
        matches INTEGER DEFAULT 0,
        PRIMARY KEY (name, team)
      )
    `);

    interface GoalObj {
      name: string;
      minute: string;
      penalty?: boolean;
      owngoal?: boolean;
    }
    interface OpenFootballMatch {
      team1: string;
      team2: string;
      score?: {
        ft?: [number, number];
        p?: [number, number];
      };
      goals1?: GoalObj[];
      goals2?: GoalObj[];
    }

    const response = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
    if (!response.ok) {
      throw new Error(`Failed to fetch JSON from GitHub: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.matches)) {
      throw new Error('Invalid OpenFootball JSON payload structure: matches array not found.');
    }

    // Begin Transaction to write all data atomically
    await runQuery('BEGIN TRANSACTION');

    let updatedMatchesCount = 0;
    const playersMap = new Map<string, { name: string; team: string; goals: number; matches: number }>();

    const apiMatches = data.matches as OpenFootballMatch[];
    for (let idx = 0; idx < apiMatches.length; idx++) {
      const m = apiMatches[idx];
      const code1 = getCodeFromName(m.team1);
      const code2 = getCodeFromName(m.team2);

      let realResult: string | null = null;
      if (m.score && Array.isArray(m.score.ft)) {
        realResult = `${m.score.ft[0]}-${m.score.ft[1]}`;
        if (m.score.p && Array.isArray(m.score.p)) {
          realResult += ` (${m.score.p[0]}-${m.score.p[1]})`;
        }
      }

      const team1Code = code1 || m.team1;
      const team2Code = code2 || m.team2;

      if (idx < 72) {
        // Group Stage match
        if (code1 && code2) {
          const matchId = `${code1}-${code2}`;
          
          // Update real result, date, time, and ground
          await runQuery(
            `UPDATE matches SET real_result = ?, date = ?, time = ?, ground = ? WHERE id = ? OR id = ?`,
            [realResult, m.date || null, m.time || null, (m as any).stadium || null, matchId, `${code2}-${code1}`]
          );
          updatedMatchesCount++;
        }
      } else {
        // Knockout Stage match (M73 to M104)
        const matchId = `M${idx + 1}`;
        await runQuery(
          `INSERT OR REPLACE INTO matches (id, team1, team2, group_name, date, time, ground, real_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            matchId,
            team1Code,
            team2Code,
            'Fase Eliminatoria',
            m.date || null,
            m.time || null,
            (m as any).stadium || null,
            realResult
          ]
        );
        updatedMatchesCount++;
      }

      // 2. Aggregate Player Stats
      const team1CodeForStats = code1 || m.team1;
      const team2CodeForStats = code2 || m.team2;
      const seenInMatch = new Set<string>();

      const processGoal = (g: GoalObj, teamCode: string) => {
        if (g.owngoal) return;
        const name = g.name ? g.name.trim() : '';
        if (!name) return;

        if (!playersMap.has(name)) {
          playersMap.set(name, { name, team: teamCode, goals: 0, matches: 0 });
        }
        const p = playersMap.get(name)!;
        p.goals += 1;
        if (!seenInMatch.has(name)) {
          seenInMatch.add(name);
          p.matches += 1;
        }
      };

      if (Array.isArray(m.goals1)) {
        m.goals1.forEach(g => processGoal(g, team1CodeForStats));
      }
      if (Array.isArray(m.goals2)) {
        m.goals2.forEach(g => processGoal(g, team2CodeForStats));
      }
    }

    // 3. Clear and Populate `player_stats` table
    await runQuery('DELETE FROM player_stats');
    for (const p of playersMap.values()) {
      await runQuery(
        `INSERT INTO player_stats (name, team, goals, assists, matches) VALUES (?, ?, ?, ?, ?)`,
        [p.name, p.team, p.goals, 0, p.matches]
      );
    }

    // Also update settings JSON cache and last_updated timestamp to keep in sync
    const scorersList: PlayerStat[] = Array.from(playersMap.values()).map(p => ({
      name: p.name,
      team: p.team,
      goals: p.goals,
      assists: 0,
      matches: p.matches
    })).sort((a, b) => b.goals - a.goals);

    const formattedStats = {
      scorers: scorersList,
      assistants: []
    };
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('player_stats_json', ?)`, [JSON.stringify(formattedStats)]);
    await runQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('player_stats_last_updated', ?)`, [String(Date.now())]);

    await runQuery('COMMIT');
    console.log(`OpenFootball sync completed! ${updatedMatchesCount} matches updated, ${playersMap.size} player stats updated.`);
    return { success: true, updatedMatchesCount };
  } catch (err) {
    try {
      await runQuery('ROLLBACK');
    } catch (rbErr) {
      console.error('Failed to rollback OpenFootball sync transaction:', rbErr);
    }
    console.error('Error during OpenFootball sync:', err);
    throw err;
  }
}

