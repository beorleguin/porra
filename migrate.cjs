const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const sqlite3 = require('sqlite3');

const dbFile = 'porra.db';
const db = new sqlite3.Database(dbFile);

function runQuery(sql, params = []) {
  return new Promise((res, rej) => {
    db.run(sql, params, (err) => {
      if (err) rej(err);
      else res();
    });
  });
}

function selectAll(sql) {
  return new Promise((res, rej) => {
    db.all(sql, [], (err, rows) => {
      if (err) rej(err);
      else res(rows);
    });
  });
}

function normalizeTeamCode(c) {
  c = c.trim().toUpperCase();
  if (c === 'CZK') return 'CZE';
  if (c === 'BYH') return 'BIH';
  if (c === 'CAT') return 'QAT';
  if (c === 'EGP') return 'EGY';
  if (c === 'IRA') return 'IRN';
  return c;
}

// Maps 3-letter team codes (normalized) to their official 2026 World Cup Group (Group A to Group L)
// Synchronized exactly with flags.ts REAL_TEAMS_GROUPS to correct Australia, Austria, and all other groups
const GROUPS_MAPPING = {
  MEX: 'Group A', RSA: 'Group A', KOR: 'Group A', CZE: 'Group A',
  CAN: 'Group B', BIH: 'Group B', QAT: 'Group B', SUI: 'Group B',
  BRA: 'Group C', MAR: 'Group C', HAI: 'Group C', SCO: 'Group C',
  USA: 'Group D', PAR: 'Group D', AUS: 'Group D', TUR: 'Group D',
  GER: 'Group E', CUW: 'Group E', CIV: 'Group E', ECU: 'Group E',
  NED: 'Group F', JPN: 'Group F', SWE: 'Group F', TUN: 'Group F',
  BEL: 'Group G', EGY: 'Group G', IRN: 'Group G', NZL: 'Group G',
  ESP: 'Group H', CPV: 'Group H', KSA: 'Group H', URU: 'Group H',
  FRA: 'Group I', SEN: 'Group I', IRQ: 'Group I', NOR: 'Group I',
  ARG: 'Group J', ALG: 'Group J', AUT: 'Group J', JOR: 'Group J',
  POR: 'Group K', CGO: 'Group K', UZB: 'Group K', COL: 'Group K',
  ENG: 'Group L', CRO: 'Group L', GHA: 'Group L', PAN: 'Group L',
};

function getRealGroupOfTeam(c) {
  return GROUPS_MAPPING[c] || '';
}

async function setup() {
  try {
    // 0. Drop existing tables safely without deleting the file (avoids EBUSY locks!)
    await runQuery('DROP TABLE IF EXISTS predictions');
    await runQuery('DROP TABLE IF EXISTS participants');
    await runQuery('DROP TABLE IF EXISTS matches');
    await runQuery('DROP TABLE IF EXISTS settings');
    await runQuery('DROP TABLE IF EXISTS bote');

    // 1. Create Tables
    await runQuery('CREATE TABLE matches (id TEXT PRIMARY KEY, team1 TEXT, team2 TEXT, group_name TEXT, date TEXT, time TEXT, ground TEXT, real_result TEXT)');
    await runQuery('CREATE TABLE participants (name TEXT PRIMARY KEY, password TEXT, ganador_final TEXT, max_goleador TEXT, max_asistente TEXT, mvp TEXT, fase_espana TEXT)');
    await runQuery('CREATE TABLE predictions (participant_name TEXT, match_id TEXT, prediction TEXT, PRIMARY KEY (participant_name, match_id), FOREIGN KEY (participant_name) REFERENCES participants (name) ON DELETE CASCADE, FOREIGN KEY (match_id) REFERENCES matches (id))');
    await runQuery('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)');
    await runQuery('CREATE TABLE bote (name TEXT PRIMARY KEY, amount TEXT)');

    // 2. Parse original CSV (located directly inside webapp/ folder)
    const porraCsvPath = path.resolve(__dirname, './Porra mundial RIU 2026 - porra.csv');
    console.log('Reading porra spreadsheet:', porraCsvPath);
    const csvText = fs.readFileSync(porraCsvPath, 'utf8');
    const rows = Papa.parse(csvText, { skipEmptyLines: false }).data;

    let matchHeaderRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].some(cell => cell && cell.includes('MEX-RSA'))) {
        matchHeaderRowIndex = i;
        break;
      }
    }

    const matchHeaders = rows[matchHeaderRowIndex];
    const realResultsRow = rows[matchHeaderRowIndex + 1];

    const matches = [];
    const matchColIndices = [];

    for (let col = 9; col < matchHeaders.length; col++) {
      const header = matchHeaders[col]?.trim();
      if (header && header !== '-' && header.includes('-')) {
        const [team1, team2] = header.split('-');
        const t1 = normalizeTeamCode(team1.trim());
        const t2 = normalizeTeamCode(team2.trim());
        const realGroup = getRealGroupOfTeam(t1) || '';
        
        const realResult = realResultsRow[col]?.trim();
        
        matches.push({
          id: header,
          team1: t1,
          team2: t2,
          group: realGroup,
          realResult: realResult && realResult !== '-' ? realResult : ''
        });
        matchColIndices.push(col);
      }
    }

    // Insert matches
    for (const m of matches) {
      await runQuery('INSERT INTO matches (id, team1, team2, group_name, real_result) VALUES (?, ?, ?, ?, ?)', [m.id, m.team1, m.team2, m.group, m.realResult || null]);
    }

    // Save Bote and Settings (using exact CSV coordinates)
    const boteTotal = rows[2] && rows[2][5] ? rows[2][5].trim() : '380,00 €';
    const prize1 = rows[3] && rows[3][5] ? rows[3][5].trim() : '230,00 €';
    const prize2 = rows[4] && rows[4][5] ? rows[4][5].trim() : '100,00 €';
    const prize3 = rows[5] && rows[5][5] ? rows[5][5].trim() : '50,00 €';

    await runQuery('INSERT INTO settings (key, value) VALUES (\'bote_total\', ?)', [boteTotal]);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'prize_1\', ?)', [prize1]);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'prize_2\', ?)', [prize2]);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'prize_3\', ?)', [prize3]);

    await runQuery('INSERT INTO settings (key, value) VALUES (\'real_ganador_final\', ?)', [realResultsRow[3]?.trim() || '']);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'real_max_goleador\', ?)', [realResultsRow[4]?.trim() || '']);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'real_max_asistente\', ?)', [realResultsRow[5]?.trim() || '']);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'real_mvp\', ?)', [realResultsRow[6]?.trim() || '']);
    await runQuery('INSERT INTO settings (key, value) VALUES (\'real_fase_espana\', ?)', [realResultsRow[7]?.trim() || '']);

    // Parse and insert participants
    let currentRow = matchHeaderRowIndex + 2;
    const parsedParticipantNames = [];
    while (currentRow < rows.length) {
      const row = rows[currentRow];
      const name = row[1]?.trim();

      if (name && name !== 'Next' && name.toLowerCase() !== 'total') {
        const ganador_final = row[3]?.trim() || '';
        const max_goleador = row[4]?.trim() || '';
        const max_asistente = row[5]?.trim() || '';
        const mvp = row[6]?.trim() || '';
        const fase_espana = row[7]?.trim() || '';

        await runQuery('INSERT INTO participants (name, ganador_final, max_goleador, max_asistente, mvp, fase_espana) VALUES (?, ?, ?, ?, ?, ?)', [name, ganador_final, max_goleador, max_asistente, mvp, fase_espana]);
        parsedParticipantNames.push(name);

        for (let index = 0; index < matches.length; index++) {
          const match = matches[index];
          const colIndex = matchColIndices[index];
          const pred = row[colIndex]?.trim();
          if (pred && pred !== '-') {
            await runQuery('INSERT INTO predictions (participant_name, match_id, prediction) VALUES (?, ?, ?)', [name, match.id, pred]);
          }
        }
        currentRow += 2;
      } else {
        currentRow += 1;
      }
    }

    // 2b. Parse Bote Payments (Robust fallback if the physical CSV is missing)
    let boteObj = {
      total: boteTotal,
      prizes: {
        first: prize1,
        second: prize2,
        third: prize3
      },
      payments: []
    };

    const templatePath = path.resolve(__dirname, 'public/porra_template.json');
    if (fs.existsSync(templatePath)) {
      try {
        console.log('Reading bote payments from current porra_template.json...');
        const oldTemplate = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
        if (oldTemplate && oldTemplate.bote) {
          boteObj = oldTemplate.bote;
        }
      } catch (e) {
        console.warn('Could not read existing bote payments from template:', e.message);
      }
    }

    // Always enforce the latest parsed values from CSV for total and prizes
    boteObj.total = boteTotal;
    boteObj.prizes = {
      first: prize1,
      second: prize2,
      third: prize3
    };

    // Dynamically regenerate payments to match actual participants exactly
    boteObj.payments = parsedParticipantNames.map(name => ({
      name,
      amount: '10,00 €'
    }));

    // Insert bote payments into DB
    for (const payment of boteObj.payments) {
      await runQuery('INSERT OR REPLACE INTO bote (name, amount) VALUES (?, ?)', [payment.name, payment.amount]);
    }

    // 3. Export full state to public/porra_template.json
    const matchRowsObj = await selectAll('SELECT * FROM matches');
    const finalMatches = matchRowsObj.map(row => ({
      id: row.id,
      team1: row.team1,
      team2: row.team2,
      group: row.group_name || undefined,
      realResult: row.real_result || undefined
    }));

    const participantRowsObj = await selectAll('SELECT * FROM participants');
    const allPredsObj = await selectAll('SELECT * FROM predictions');
    const predictionsMap = new Map();
    allPredsObj.forEach(p => {
      if (!predictionsMap.has(p.participant_name)) {
        predictionsMap.set(p.participant_name, {});
      }
      predictionsMap.get(p.participant_name)[p.match_id] = p.prediction;
    });

    const finalParticipants = participantRowsObj.map(row => {
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

    const state = {
      matches: finalMatches,
      participants: finalParticipants,
      realResults: {
        ganadorFinal: '',
        maxGoleador: '',
        maxAsistente: '',
        mvp: '',
        faseEspana: '',
        matches: {}
      },
      bote: boteObj
    };

    fs.writeFileSync('public/porra_template.json', JSON.stringify(state, null, 2), 'utf8');
    console.log(`Database and public/porra_template.json successfully rebuilt with all ${finalParticipants.length} participants!`);

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    db.close();
  }
}

setup();
