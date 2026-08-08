import { createClient } from '@supabase/supabase-js';
import { readCredentials } from './credentials.js';

let client = null;

export async function getSupabaseClient() {
  if (client) return client;

  const creds = await readCredentials();
  if (!creds || !creds.supabaseUrl || !creds.supabaseAnonKey) {
    throw new Error('Supabase credentials not found. Run `bazable login --supabase-url <url> --supabase-key <key>`');
  }

  client = createClient(creds.supabaseUrl, creds.supabaseAnonKey, {
    global: {
      headers: {
        'x-api-key': creds.supabaseAnonKey,   // optional; we also pass via createClient's second arg
      },
    },
  });
  return client;
}

export async function uploadContract(projectId, schemaJson) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('contracts')
    .insert({
      project_id: projectId,
      schema_json: schemaJson,
    })
    .select('version')
    .single();
  if (error) throw error;
  return data.version;
}

export async function fetchLatestContract(projectId) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('contracts')
    .select('schema_json, version, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function getOrCreateProject(projectName) {
  const supabase = await getSupabaseClient();

  // Check if exists
  const { data: existing } = await supabase
    .from('projects')
    .select('id, api_key')
    .eq('project_name', projectName)
    .single();

  if (existing) return existing;

  // Create new project
  const { data: created, error } = await supabase
    .from('projects')
    .insert({ project_name: projectName })
    .select('id, api_key')
    .single();

  if (error) throw error;
  return created;
}
