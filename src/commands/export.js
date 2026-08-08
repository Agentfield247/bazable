import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const exportCmd = new Command('export')
  .description('Export the contract as an OpenAPI 3.0 specification')
  .option('-o, --output <file>', 'Output file path', './openapi.json')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in the contract.');
      process.exit(1);
    }

    const openapi = {
      openapi: '3.0.0',
      info: {
        title: config.projectName || 'Bazable API',
        version: config.version || '1.0.0',
      },
      servers: config.baseUrl ? [{ url: config.baseUrl }] : [],
      paths: {},
    };

    for (const [key, entry] of Object.entries(config.endpoints)) {
      let url = key;
      let method = 'get';
      const match = key.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
      if (match) {
        method = match[1].toLowerCase();
        url = match[2];
      }
      let pathName = url;
      try { const parsed = new URL(url); pathName = parsed.pathname; } catch {}

      if (!openapi.paths[pathName]) openapi.paths[pathName] = {};
      const operation = {
        summary: entry.description || '',
        responses: {
          '200': { description: 'Successful response' },
        },
      };

      if (entry.request) {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: Object.fromEntries(
                  Object.entries(entry.request).map(([prop, type]) => [
                    prop,
                    { type: type === 'array' ? 'array' : type === 'object' ? 'object' : type === 'number' ? 'number' : type === 'boolean' ? 'boolean' : 'string' },
                  ])
                ),
              },
            },
          },
        };
      }

      openapi.paths[pathName][method] = operation;
    }

    const outPath = path.resolve(process.cwd(), options.output);
    await fs.writeFile(outPath, JSON.stringify(openapi, null, 2), 'utf-8');
    logger.success(`OpenAPI spec exported → ${outPath}`);
  });

export default exportCmd;
