import { Command } from 'commander';
import chalk from 'chalk';
import axios from 'axios';
import ora from 'ora';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { getAuthToken, requestDeviceCode, pollDeviceCode } from '../utils/auth.js';
import { logger } from '../utils/logger.js';
import { getApiBase } from '../utils/apiBase.js';

let _API_BASE = null;
async function resolveApiBase() {
  if (!_API_BASE) _API_BASE = await getApiBase();
  return _API_BASE;
}

const sync = new Command('sync')
  .description('Pull the latest contract from Bazable Cloud and overwrite local copy')
  .action(async () => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || !config.cloudProjectId) {
      logger.error('No cloud project linked. Run `bazable push` first to create one.');
      process.exit(1);
    }

    // Authenticate if needed
    let token = await getAuthToken();
    if (!token) {
      logger.info('Authentication required. Starting device code flow...');
      try {
        const { device_code, user_code, verification_uri, verification_uri_complete } = await requestDeviceCode();
        console.log(chalk.hex('#FFB703')(`Open this link to activate: ${chalk.bold.underline(verification_uri_complete)}`));
        const data = await pollDeviceCode(device_code);
        token = data.access_token;
        logger.success('Authenticated.');
      } catch (err) {
        // Friendly messages for common failures
        if (
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'ENOTFOUND' ||
          (err.message && err.message.toLowerCase().includes('timeout')) ||
          (err.message && err.message.toLowerCase().includes('could not reach'))
        ) {
          logger.error('Could not reach Bazable Cloud. Check your internet connection.');
          logger.hint('If the problem persists, wait a few seconds and try again – the cloud server may be waking up.');
        } else {
          logger.error('Authentication failed: ' + err.message);
        }
        process.exit(1);
      }
    }

    const spinner = ora('Fetching latest contract...').start();
    try {
      const base = await resolveApiBase();
      const { data } = await axios.get(
        `${base}/projects/${config.cloudProjectId}/contracts/latest`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!data || !data.schema_json) {
        spinner.warn('No contract found on cloud.');
        return;
      }

      // Overwrite local config
      const remote = data.schema_json;
      config.version = remote.version;
      config.projectName = remote.projectName;
      config.baseUrl = remote.baseUrl;
      config.baseUrls = remote.baseUrls;
      config.endpoints = remote.endpoints;
      await writeConfig(config);

      spinner.succeed(chalk.hex('#10B981')('Local contract synchronized with Bazable Cloud.'));
    } catch (err) {
      spinner.fail('Sync failed');
      logger.error(err.response?.data?.message || err.message);
      process.exit(1);
    }
  });

export default sync;
