import { Command } from 'commander';
import axios from 'axios';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { inferSchema, computeSchemaDiff } from '../utils/schema.js';

const diff = new Command('diff')
  .description('Check for schema changes between the live API and the contract')
  .argument('[url]', 'Specific endpoint URL')
  .option('-t, --token <token>')
  .option('-m, --method <method>', '', 'GET')
  .option('--base-url <url>')
  .option('--base-path <path>')
  .option('--breaking-only')
  .option('-j, --json')
  .option('-y, --accept')
  .action(async (url, options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in the contract.');
      process.exit(1);
    }

    let targets = [];
    if (url) {
      if (!config.endpoints[url]) {
        logger.error(`Endpoint ${url} not found in contract.`);
        process.exit(1);
      }
      targets = [url];
    } else {
      targets = Object.keys(config.endpoints).filter(u => {
        const entry = config.endpoints[u];
        return entry && !('schema_status' in entry && Object.keys(entry).length <= 2);
      });
    }

    if (targets.length === 0) {
      logger.warn('No endpoints with full schemas to diff. Use "bazable add <url>" first.');
      return;
    }

    logger.info(`Diffing ${targets.length} endpoint(s)...`);

    const originalBaseUrl = config.baseUrl || '';
    let baseUrl = options.baseUrl || originalBaseUrl;
    // path logic (simplified)
    if (options.basePath) {
      const baseObj = new URL(baseUrl);
      baseObj.pathname = options.basePath.startsWith('/') ? options.basePath : '/' + options.basePath;
      baseUrl = baseObj.toString().replace(/\/+$/, '');
    } else if (options.baseUrl && originalBaseUrl) {
      const origObj = new URL(originalBaseUrl);
      const newObj = new URL(baseUrl);
      if (newObj.pathname === '/' && origObj.pathname !== '/') {
        baseUrl = baseUrl.replace(/\/+$/, '') + origObj.pathname;
      }
    }

    let anyBreaking = false;

    for (const endpoint of targets) {
      const liveUrl = baseUrl && endpoint.startsWith(originalBaseUrl)
        ? endpoint.replace(originalBaseUrl, baseUrl)
        : endpoint;
      const storedSchema = config.endpoints[endpoint];

      console.log(`Fetching live schema for ${liveUrl}...`);

      try {
        const method = options.method.toUpperCase();
        const reqConfig = { method, url: liveUrl, timeout: 10000 };
        if (options.token) {
          reqConfig.headers = { Authorization: `Bearer ${options.token}` };
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            reqConfig.data = { access_token: options.token };
          }
        }
        const response = await axios(reqConfig);
        const liveSchema = inferSchema(response.data);

        const d = computeSchemaDiff(storedSchema, liveSchema);
        if (d.hasChanges) {
          if (options.json) {
            console.log(JSON.stringify({ endpoint, liveUrl, changes: d.changes }, null, 2));
          } else {
            console.log(`\n⚡ Schema drift detected in ${endpoint}:`);
            d.changes.forEach(change => {
              const icon = change.type === 'removed' ? '  -' : change.type === 'changed' ? '  ~' : '  +';
              const desc = change.type === 'changed' ? `${change.key}: ${change.from} → ${change.to}` : change.key;
              console.log(`${icon} ${desc}`);
            });
          }
          if (d.hasBreaking) anyBreaking = true;
          if (options.accept) {
            config.endpoints[endpoint] = liveSchema;
            console.log(`✔ Contract updated for ${endpoint}`);
          }
        } else {
          console.log(`No changes for ${endpoint}`);
        }
      } catch (error) {
        logger.error(`Failed to fetch ${liveUrl}: ${error.message}`);
      }
    }

    if (options.accept) {
      await writeConfig(config);
      logger.success('Contract saved.');
    }

    if (anyBreaking && !options.accept) {
      logger.error('Breaking changes detected. Run with --accept to update contract.');
      process.exit(1);
    }
  });

export default diff;
