import { Command } from 'commander';
import { readCredentials, writeCredentials } from '../utils/credentials.js';
import { logger } from '../utils/logger.js';
import { getApiBase } from '../utils/apiBase.js';

let _API_BASE = null;
async function resolveApiBase() {
  if (!_API_BASE) _API_BASE = await getApiBase();
  return _API_BASE;
}

const login = new Command('login')
  .description('Store API credentials for automatic authentication')
  .option('-e, --email <email>', 'Your login email')
  .option('-p, --password <password>', 'Your login password')
  .option('-t, --token <token>', 'A pre‑obtained access token')
  .option('-b, --base-url <url>', 'Base URL of the API')
  .option('--supabase-url <url>', 'Supabase project URL')
  .option('--supabase-key <key>', 'Supabase anon key')
  .action(async (options) => {
    const existing = await readCredentials();
    const creds = existing || {};

    if (options.email) creds.email = options.email;
    if (options.password) creds.password = options.password;
    if (options.token) creds.token = options.token;
    if (options.baseUrl) creds.baseUrl = options.baseUrl;
    if (options.supabaseUrl) creds.supabaseUrl = options.supabaseUrl;
    if (options.supabaseKey) creds.supabaseAnonKey = options.supabaseKey;

    // At least one kind of credential must be present
    const hasApiCreds = creds.email || creds.token;
    const hasCloudCreds = creds.supabaseUrl && creds.supabaseAnonKey;
    if (!hasApiCreds && !hasCloudCreds) {
      logger.error('You must provide at least --email/--token (API) or --supabase-url and --supabase-key (cloud).');
      process.exit(1);
    }

    await writeCredentials(creds);
    logger.hint('Credentials stored. You can now run `bazable test` without authentication flags.');
    logger.hint('To remove stored credentials, run `bazable logout`.');
  });

export default login;
