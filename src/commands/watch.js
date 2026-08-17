import { Command } from 'commander';
import { execSync } from 'child_process';
import axios from 'axios';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { computeSchemaDiff } from '../utils/schema.js';
import { fetchLatestContract } from '../utils/supabase.js';
import { getApiBase } from '../utils/apiBase.js';
import WebSocket from 'ws';

const watch = new Command('watch')
  .description('Continuously sync a remote contract and auto‑fix your code on changes')
  .argument('[url]', 'URL of the remote bazable.config.json (optional – uses cloud if omitted)')
  .option('-i, --interval <seconds>', 'Polling interval in seconds', '60')
  .option('--dry-run', 'Show changes but do not apply fixes')
  .option('--auto-accept', 'Automatically apply all changes (including breaking ones)')
  .option('--no-ws', 'Disable WebSocket real‑time sync and use polling instead')
  .action(async (remoteUrl, options) => {
    await validateProjectContext();

    const localConfig = await readConfig();
    if (!localConfig) {
      logger.error('Local contract not found. Run `bazable init` first.');
      process.exit(1);
    }

    // Determine mode
    const useCloud = !remoteUrl;
    if (useCloud && !localConfig.cloudProjectId) {
      logger.error('No cloud project ID found. Run `bazable push` first to link the project, or provide a URL.');
      process.exit(1);
    }

    // Compute WebSocket URL for cloud mode
    let wsUrl = null;
    if (useCloud) {
      try {
        const base = await getApiBase();
        wsUrl = base.replace(/^http/, 'ws') + '/ws';
      } catch (err) {
        logger.warn('⚠️ Could not determine cloud API base. Real‑time sync disabled.');
      }
    }

    const sourceLabel = useCloud ? `cloud project ${localConfig.cloudProjectId}` : remoteUrl;
    logger.info(`👀 Watching ${sourceLabel} for contract changes...`);

    const intervalMs = parseInt(options.interval) * 1000;
    if (intervalMs < 5000) {
      logger.warn('Interval is too short. Minimum is 5 seconds.');
      return;
    }
    logger.info(`Polling every ${options.interval} second(s).`);

    const checkAndFix = async () => {
      try {
        let remoteConfig;

        if (remoteUrl) {
          // HTTP mode
          const response = await axios.get(remoteUrl, { timeout: 10000 });
          remoteConfig = response.data;
        } else {
          // Cloud (Supabase) mode
          const data = await fetchLatestContract(localConfig.cloudProjectId);
          if (!data) {
            logger.warn('No contract found in the cloud for this project. Skipping this poll.');
            return;
          }
          remoteConfig = data.schema_json;
        }

        if (!remoteConfig || !remoteConfig.endpoints) {
          logger.warn('Remote contract is empty or invalid. Skipping.');
          return;
        }

        const remoteEndpoints = remoteConfig.endpoints || {};
        const localEndpoints = localConfig.endpoints || {};

        let changed = false;

        for (const [url, remoteEntry] of Object.entries(remoteEndpoints)) {
          if (!localEndpoints[url]) {
            if (!options.dryRun) {
              localEndpoints[url] = { ...remoteEntry, schema_status: 'synced' };
            }
            changed = true;
            logger.info(`➕ New endpoint synced: ${url}`);
          } else {
            const diff = computeSchemaDiff(localEndpoints[url], remoteEntry);
            if (diff.hasChanges) {
              changed = true;
              if (options.autoAccept || !diff.hasBreaking) {
                if (!options.dryRun) {
                  localEndpoints[url] = { ...localEndpoints[url], ...remoteEntry, schema_status: 'synced' };
                }
                logger.success(`✔ Updated ${url}`);
              } else {
                logger.warn(`⚠ Breaking change in ${url}. Use --auto-accept to apply.`);
              }
            }
          }
        }

        if (changed && !options.dryRun) {
          localConfig.endpoints = localEndpoints;
          await writeConfig(localConfig);

          logger.info('🔧 Running auto‑fix on your source files...');
          try {
            execSync('bazable inspect --fix', { stdio: 'inherit', cwd: process.cwd() });
            logger.success('Auto‑fix applied. Your dev server will hot‑reload the changes.');
          } catch (err) {
            logger.error('Auto‑fix encountered errors. Check the output above.');
          }
        }
      } catch (error) {
        if (error.response) {
          logger.error(`Remote server returned ${error.response.status}`);
        } else if (error.code === 'ECONNABORTED') {
          logger.warn('Request timed out. Will retry...');
        } else {
          logger.error(`Watch failed: ${error.message}`);
        }
      }
    };

    // Initial check
    await checkAndFix();

    // WebSocket real‑time connection (cloud mode only)
    if (useCloud && !options.noWs && wsUrl) {
      try {
        logger.info(`🔌 Connecting to real‑time sync: ${wsUrl}`);
        const ws = new WebSocket(`${wsUrl}?projectId=${localConfig.cloudProjectId}`);

        ws.on('open', () => {
          logger.success('✅ Real‑time sync active – waiting for contract updates...');
        });

        ws.on('message', async (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'contract_updated') {
              logger.info(`⚡ Contract updated (v${msg.version}) – auto‑fixing...`);
              await checkAndFix();
            }
          } catch (err) {
            // ignore non‑JSON messages
          }
        });

        ws.on('error', (err) => {
          logger.warn('⚠️ WebSocket error, falling back to polling.');
        });

        ws.on('close', () => {
          logger.warn('⚠️ WebSocket closed, falling back to polling.');
        });
      } catch (err) {
        logger.warn('⚠️ Failed to connect to real‑time sync. Using polling.');
      }
    } else if (!useCloud) {
      logger.info('ℹ️ Real‑time sync is only available for cloud projects. Polling URL instead.');
    }

    // Polling fallback (always runs, even if WebSocket is active)
    const timer = setInterval(checkAndFix, intervalMs);

    process.on('SIGINT', () => {
      clearInterval(timer);
      logger.info('Watch stopped.');
      process.exit(0);
    });

    logger.hint('Press Ctrl+C to stop watching.');
  });

export default watch;
