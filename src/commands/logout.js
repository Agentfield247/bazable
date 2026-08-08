import { Command } from 'commander';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger.js';

const CREDENTIALS_FILE = path.join(os.homedir(), '.bazable', 'credentials.json');

const logout = new Command('logout')
  .description('Remove stored credentials')
  .action(async () => {
    try {
      await fs.access(CREDENTIALS_FILE, constants.F_OK);
      await fs.unlink(CREDENTIALS_FILE);
      logger.success('Credentials removed.');
    } catch {
      logger.warn('No stored credentials found.');
    }
  });

export default logout;
