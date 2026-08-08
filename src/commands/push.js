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

const push = new Command('push')
  .description('Push the local contract to Bazable Cloud')
  .action(async () => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in contract. Run `bazable extract` first.');
      process.exit(1);
    }

    // Ensure authenticated
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

    const authHeaders = { Authorization: `Bearer ${token}` };

    // Create project if not linked yet
    if (!config.cloudProjectId) {
      const spinner = ora('Creating cloud project...').start();
      try {
        const base = await resolveApiBase();
        const { data: project } = await axios.post(
          `${base}/projects`,
          { name: config.projectName || 'Unnamed Project' },
          { headers: authHeaders }
        );
        config.cloudProjectId = project.id;

        // Save the cloud URL so teammates don't need an environment variable
        config.cloud = config.cloud || {};
        config.cloud.apiBaseUrl = base;

        await writeConfig(config);
        spinner.succeed(`Project created: ${project.id}`);
      } catch (err) {
        spinner.fail('Failed to create project');
        logger.error(err.response?.data?.message || err.message);
        process.exit(1);
      }
    }

    // Push contract
    const spinner = ora('Pushing contract to cloud...').start();
    try {
      const base = await resolveApiBase();
      const payload = {
        version: config.version,
        projectName: config.projectName,
        baseUrl: config.baseUrl,
        baseUrls: config.baseUrls,
        endpoints: config.endpoints,
      };
      const { data } = await axios.post(
        `${base}/projects/${config.cloudProjectId}/contracts`,
        payload,
        { headers: authHeaders }
      );
      spinner.succeed(chalk.hex('#10B981')(`Contract pushed successfully to cloud [Version ${data.version}]`));
    } catch (err) {
      spinner.fail('Push failed');
      logger.error(err.response?.data?.message || err.message);
      process.exit(1);
    }
  });

export default push;
