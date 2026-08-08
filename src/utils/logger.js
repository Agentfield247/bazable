import chalk from 'chalk';
import ora from 'ora';
import { logError as saveError } from './errorLogger.js';

class Logger {
  constructor() {
    this.spinner = null;

  }

  startSpinner(msg) {
    this.spinner = ora({ text: chalk.blue(msg), spinner: 'dots' }).start();
    return this.spinner;
  }

  succeed(msg) {
    if (this.spinner) this.spinner.succeed(chalk.green(msg));
    else console.log(chalk.green('✔ ' + msg));
  }

  fail(msg) {
    if (this.spinner) this.spinner.fail(chalk.red(msg));
    else console.log(chalk.red('✖ ' + msg));
  }

  info(msg) {
    console.log(chalk.cyan('⟳ ' + msg));
  }

  success(msg) {
    console.log(chalk.green('✅ ' + msg));
  }

  warn(msg) {
    console.log(chalk.yellow('⚠️  ' + msg));
  }

  error(msg) {
    console.error(chalk.red('✖ ' + msg));
  }

  /**
   * Log an error to both the terminal and the persistent error log.
   * @param {string} type - e.g. 'NetworkError', 'ParseError', 'ConfigError'
   * @param {string} message - The error message
   * @param {string} hint - Actionable hint for the user (optional)
   */
  async errorAndLog(type, message, hint = '') {
    console.error(chalk.red('✖ ' + message));
    if (hint) console.log(chalk.gray('💡 ' + hint));
    await saveError(type, message, hint);
  }

  hint(msg) {
    console.log(chalk.gray('💡 ' + msg));
  }

  log(msg) {
    console.log(msg);
  }

  bold(msg) {
    return chalk.bold(msg);
  }
}


export const logger = new Logger();
