import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ success: false, error: 'Missing Supabase environment variables' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { name, predictions, password } = body

    if (!name || !predictions || !password) {
      return res.status(400).json({ success: false, error: 'Missing name, predictions or password' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: row, error: readError } = await supabase
      .from('app_state')
      .select('data')
      .eq('id', 'main')
      .single()

    if (readError) {
      return res.status(500).json({ success: false, error: readError.message })
    }

    const state = row.data
    const participant = state.participants?.find((p: any) => p.name === name)

    if (!participant) {
      return res.status(404).json({ success: false, error: 'Participant not found' })
    }

    if (participant.password !== password) {
      return res.status(401).json({ success: false, error: 'Invalid password' })
    }

    participant.predictions = predictions

    const { error: updateError } = await supabase
      .from('app_state')
      .upsert({
        id: 'main',
        data: state,
        updated_at: new Date().toISOString(),
      })

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message })
    }

    return res.status(200).json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || String(err) })
  }
}