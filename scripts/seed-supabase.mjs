import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

const templatePath = path.resolve(__dirname, '../public/porra_template.json');
const state = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

const { error } = await supabase
  .from('app_state')
  .upsert({
    id: 'main',
    data: state,
    updated_at: new Date().toISOString(),
  });

if (error) {
  console.error('Error subiendo datos a Supabase:', error);
  process.exit(1);
}

console.log('Datos iniciales subidos correctamente a Supabase');