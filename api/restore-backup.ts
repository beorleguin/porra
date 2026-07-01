/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function ensureRealResults(state: any) {
  if (!state.realResults) {
    state.realResults = {
      ganadorFinal: '',
      maxGoleador: '',
      maxAsistente: '',
      mvp: '',
      faseEspana: '',
      matches: {},
    };
  }
  if (!state.realResults.matches) {
    state.realResults.matches = {};
  }
}

function normalizeAppState(state: any) {
  if (!state) return state;
  ensureRealResults(state);
  if (Array.isArray(state.matches)) {
    for (const match of state.matches) {
      if (match?.id && match?.realResult) {
        state.realResults.matches[match.id] = match.realResult;
      }
    }
  }
  return state;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase environment variables' })
  }

  const body = req.body || {};
  const adminPassword = body.adminPassword;
  const expectedPassword = process.env.ADMIN_PASSWORD || 'root';

  if (!adminPassword || adminPassword !== expectedPassword) {
    return res.status(403).json({
      success: false,
      error: 'No autorizado. Solo el administrador puede restaurar copias de seguridad.',
    });
  }

  const backupData = body.backupData || body;

  if (!backupData || !Array.isArray(backupData.matches) || !Array.isArray(backupData.participants) || !backupData.realResults) {
    return res.status(400).json({
      success: false,
      error: 'El archivo no tiene el formato esperado de copia de seguridad',
    });
  }

  const normalizedState = normalizeAppState(backupData);
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { error } = await supabase
    .from('app_state')
    .upsert({
      id: 'main',
      data: normalizedState,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    })

  if (error) {
    return res.status(500).json({ success: false, error: error.message })
  }

  return res.status(200).json({ success: true })
}
