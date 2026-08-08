import { Command } from 'commander';
import axios from 'axios';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { inferSchema } from '../utils/schema.js';

const add = new Command('add')
  .description('Fetch an endpoint and store its inferred schema')
  .argument('<url>', 'Endpoint URL')
  .option('-m, --method <method>', 'HTTP method to use', 'GET')
  .option('-t, --token <token>', 'Access token')
  .option('-H, --header <headers...>', 'Additional headers (key:value)', [])
  .action(async (url, options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized.');
      logger.hint("Run 'bazable init' first.");
      process.exit(1);
    }

    logger.info(`Fetching schema from ${url}...`);

    const method = options.method.toUpperCase();
    const baseHeaders = {};
    if (options.header) {
      options.header.forEach(h => {
        const [key, ...vals] = h.split(':');
        if (key && vals.length) baseHeaders[key.trim()] = vals.join(':').trim();
      });
    }
    if (options.token) {
      baseHeaders['Authorization'] = `Bearer ${options.token}`;
    }

    const reqConfig = {
      method,
      url,
      headers: baseHeaders,
      timeout: 10000,
    };

    // For POST/PUT/PATCH, include the token in the body as access_token (common pattern)
    if (['POST', 'PUT', 'PATCH'].includes(method) && options.token) {
      reqConfig.data = { access_token: options.token };
    }

    try {
      const response = await axios(reqConfig);
      const data = response.data;
      const schema = inferSchema(data);

      config.endpoints = config.endpoints || {};
      config.endpoints[url] = schema;

      await writeConfig(config);
      logger.success(`Endpoint ${url} added to the contract.`);
    } catch (error) {
      if (error.response) {
        logger.error(`Request failed with status ${error.response.status}: ${error.response.statusText}`);
      } else if (error.request) {
        logger.error('No response received. Check the URL or your network connection.');
      } else {
        logger.error(`Error: ${error.message}`);
      }
      process.exit(1);
    }
  });

export default add;
