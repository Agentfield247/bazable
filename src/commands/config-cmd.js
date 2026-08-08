import { Command } from 'commander';
import { readConfig, writeConfig } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const configCmd = new Command('config')
  .description('View or update bazable contract configuration')
  .option('--get <key>')
  .option('--set-project-name <name>')
  .option('--set-base-url <url>')
  .option('--set-webhook <url>', 'Set a Slack/Discord webhook URL for push notifications')
  .option('--set-ai-key <key>', 'Set an AI API key (OpenAI) for explain/propose features')
  .action(async (options) => {
    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized. Run "bazable init" first.');
      process.exit(1);
    }

    if (options.get) {
      const key = options.get;
      if (key === 'endpoints') {
        const urls = Object.keys(config.endpoints || {});
        if (urls.length === 0) {
          console.log('No endpoints in contract.');
        } else {
          console.log(`Endpoints (${urls.length}):`);
          urls.forEach(url => console.log(`  ${url}`));
        }
      } else if (config[key] !== undefined) {
        console.log(config[key]);
      } else {
        logger.error(`Key '${key}' not found in config.`);
      }
      return;
    }

    let modified = false;
    if (options.setProjectName) {
      config.projectName = options.setProjectName;
      modified = true;
    }
    if (options.setBaseUrl) {
      config.baseUrl = options.setBaseUrl;
      modified = true;
    }
    if (options.setWebhook) {
      config.webhookUrl = options.setWebhook;
      modified = true;
    }

    if (options.setAiKey) {
      config.aiApiKey = options.setAiKey;
      modified = true;
    }

    if (modified) {
      await writeConfig(config);
      logger.success('Configuration updated.');
    }

    console.log('\nCurrent Bazable Configuration:');
    console.log(`  Project Name : ${config.projectName || '(not set)'}`);
    console.log(`  Version      : ${config.version || '1.0'}`);
    console.log(`  Base URL     : ${config.baseUrl || '(not set)'}`);
    console.log(`  Webhook URL  : ${config.webhookUrl || '(not set)'}`);
    console.log(`  AI Key       : ${config.aiApiKey ? '***configured***' : '(not set)'}`);
    const epCount = Object.keys(config.endpoints || {}).length;
    console.log(`  Endpoints    : ${epCount} registered`);
    if (epCount > 0) {
      const statuses = { working: 0, failed: 0, unverified: 0 };
      for (const [, entry] of Object.entries(config.endpoints)) {
        if (entry.schema_status === 'working') statuses.working++;
        else if (entry.schema_status === 'failed') statuses.failed++;
        else statuses.unverified++;
      }
      console.log(`    └─ Working: ${statuses.working} | Failed: ${statuses.failed} | Unverified: ${statuses.unverified}`);
    }
  });

export default configCmd;
