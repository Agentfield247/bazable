import { Command } from 'commander';
import { readConfig, writeConfig, getPackageProjectName } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const init = new Command('init')
  .description('Initialize a new Bazable project')
  .action(async () => {
    const existingConfig = await readConfig();
    if (existingConfig) {
      logger.warn('Project already initialized. A bazable.config.json already exists.');
      return;
    }

    const projectName = await getPackageProjectName();
    const defaultConfig = { version: '1.0', projectName, endpoints: {} };

    try {
      await writeConfig(defaultConfig);
      logger.success('bazable.config.json created successfully!');
      logger.hint(`Project bound to "${projectName}". Add endpoints with 'bazable add'.`);
    } catch (error) {
      logger.error(`Failed to initialize: ${error.message}`);
      process.exit(1);
    }
  });

export default init;
