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
      error: 'No autorizado. Solo el administrador puede guardar resultados reales.',
    });
  }

  const newResults = body.realResults || body;

  if (!newResults || typeof newResults !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Formato inválido para resultados reales',
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Fetch current state
  const { data: appStateRow, error: getError } = await supabase
    .from('app_state')
    .select('data')
    .eq('id', 'main')
    .single()

  if (getError) {
    return res.status(500).json({ success: false, error: getError.message })
  }

  const state = appStateRow.data;
  ensureRealResults(state);

  state.realResults = {
    ganadorFinal: newResults.ganadorFinal || '',
    maxGoleador: newResults.maxGoleador || '',
    maxAsistente: newResults.maxAsistente || '',
    mvp: newResults.mvp || '',
    faseEspana: newResults.faseEspana || '',
    matches: newResults.matches || {},
  };

  if (Array.isArray(state.matches)) {
    for (const match of state.matches) {
      const result = state.realResults.matches[match.id];
      match.realResult = result || undefined;
    }
  }

  // Save state
  const { error: upsertError } = await supabase
    .from('app_state')
    .upsert({
      id: 'main',
      data: state,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'id'
    })

  if (upsertError) {
    return res.status(500).json({ success: false, error: upsertError.message })
  }

  return res.status(200).json({ success: true })
}
