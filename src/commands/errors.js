import { Command } from 'commander';
import { readErrors, clearErrors } from '../utils/errorLogger.js';
import { logger } from '../utils/logger.js';

const errors = new Command('errors')
  .description('View or clear the persistent error log')
  .option('-c, --clear', 'Clear the error log')
  .option('-n, --lines <number>', 'Number of recent errors to show', '20')
  .action(async (options) => {
    if (options.clear) {
      await clearErrors();
      logger.success('Error log cleared.');
      return;
    }

    const entries = await readErrors(parseInt(options.lines));
    if (entries.length === 0) {
      logger.success('No errors in log.');
      return;
    }

    console.log(`\n${logger.bold('Recent Errors')} (last ${entries.length})\n`);
    entries.forEach(entry => console.log(entry + '\n'));
  });

export default errors;
