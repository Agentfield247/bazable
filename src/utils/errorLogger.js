import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import os from 'os';

const ERROR_DIR = path.join(os.homedir(), '.bazable');
const ERROR_FILE = path.join(ERROR_DIR, 'errors.log');

/**
 * Append an error to the log file.
 * @param {string} type - e.g. 'NetworkError', 'ParseError', 'ConfigError'
 * @param {string} message - The error message
 * @param {string} hint - Actionable hint for the user
 * @param {string} stack - Stack trace (optional)
 */
export async function logError(type, message, hint = '', stack = '') {
  try {
    await fs.mkdir(ERROR_DIR, { mode: 0o700, recursive: true });
  } catch {}

  const timestamp = new Date().toISOString();
  const entry = [
    `[${timestamp}] ${type}`,
    `  Message: ${message}`,
    hint ? `  Hint: ${hint}` : '',
    stack ? `  Stack: ${stack.split('\n').slice(1, 4).join('\n    ')}` : '',
    '',
  ].filter(Boolean).join('\n');

  try {
    await fs.appendFile(ERROR_FILE, entry, 'utf-8');
  } catch {
    // silently fail – logging should never break the main command
  }
}

/**
 * Read the last N error entries.
 */
export async function readErrors(count = 20) {
  try {
    await fs.access(ERROR_FILE, constants.F_OK);
    const raw = await fs.readFile(ERROR_FILE, 'utf-8');
    const entries = raw.trim().split('\n\n').filter(Boolean);
    return entries.slice(-count);
  } catch {
    return [];
  }
}

/**
 * Clear the error log.
 */
export async function clearErrors() {
  try {
    await fs.writeFile(ERROR_FILE, '', 'utf-8');
  } catch {}
}
