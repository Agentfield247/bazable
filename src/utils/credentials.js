import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

const CREDENTIALS_DIR = path.join(os.homedir(), '.bazable');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');

/**
 * Read stored credentials (returns null if none exist).
 */
export async function readCredentials() {
  try {
    await fs.access(CREDENTIALS_FILE, constants.F_OK);
    const raw = await fs.readFile(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Write credentials to the config file, creating the directory with restricted permissions.
 * On Unix, sets directory mode 700 and file mode 600.
 */
export async function writeCredentials(data) {
  try {
    await fs.mkdir(CREDENTIALS_DIR, { mode: 0o700, recursive: true });
  } catch (err) {
    // directory may already exist – ignore
  }
  const filePath = CREDENTIALS_FILE;
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  logger.success('Credentials saved securely.');
}
