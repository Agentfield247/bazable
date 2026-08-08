import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import { logger } from './logger.js';

const CONFIG_FILENAME = 'bazable.config.json';
const PACKAGE_FILENAME = 'package.json';

export function getConfigPath() {
  return path.resolve(process.cwd(), CONFIG_FILENAME);
}

function getPackagePath() {
  return path.resolve(process.cwd(), PACKAGE_FILENAME);
}

export async function readConfig() {
  const configPath = getConfigPath();
  try {
    await fs.access(configPath, constants.F_OK);
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.warn(`bazable.config.json contains invalid JSON: ${error.message}`);
    }
    return null;
  }
}

export async function writeConfig(config) {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function getPackageProjectName() {
  const packagePath = getPackagePath();
  try {
    const raw = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(raw);
    return pkg.name || 'unknown-project';
  } catch {
    return 'unknown-project';
  }
}

export async function validateProjectContext() {
  const config = await readConfig();
  if (!config) return;

  const configProjectName = config.projectName || '';
  const currentProjectName = await getPackageProjectName();

  if (configProjectName !== currentProjectName) {
    logger.error(`Project Mismatch: This bazable contract belongs to [${configProjectName}] but you are running it in [${currentProjectName}].`);
    logger.hint("Run 'bazable init' to create a new contract for this project.");
    process.exit(1);
  }
}
