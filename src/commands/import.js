import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import inquirer from 'inquirer';
import { load as yamlLoad } from 'js-yaml';
import { readConfig, writeConfig, getPackageProjectName, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { resolveUrl } from '../utils/url.js';
import { parseCSV, inferSchemaFromData } from '../utils/csv.js';   // NEW import

// -------------------------------------------------------------------
// Helper: detect if content is JSON or YAML
function parseContent(raw) {
  try { return { format: 'json', data: JSON.parse(raw) }; } catch {}
  try { return { format: 'yaml', data: yamlLoad(raw) }; } catch {}
  throw new Error('Unrecognised format – not valid JSON or YAML.');
}

// -------------------------------------------------------------------
// Helper: determine spec type
function getSpecType(data) {
  if (!data) return 'unknown';
  if (data.info && data.info.schema && data.info.schema.includes('postman')) return 'postman';
  if (data.openapi) return 'openapi3';
  if (data.swagger === '2.0') return 'swagger2';
  return 'unknown';
}

// -------------------------------------------------------------------
// Extract endpoints from OpenAPI v2/v3
function extractOpenApiEndpoints(specData, baseUrl) {
  const endpoints = [];
  const paths = specData.paths || {};
  for (const [routePath, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!['get','post','put','patch','delete','options','head'].includes(method)) continue;
      const fullUrl = resolveUrl(routePath, baseUrl);
      const endpointKey = `${method.toUpperCase()} ${fullUrl}`;
      const requestSchema = extractOpenApiRequestSchema(operation);
      const responseSchema = extractOpenApiResponseSchema(operation);
      endpoints.push({
        key: endpointKey,
        method: method.toUpperCase(),
        url: fullUrl,
        request: requestSchema,
        response: responseSchema,
        source: 'imported',
      });
    }
  }
  return endpoints;
}

// -------------------------------------------------------------------
// Extract request schema from OpenAPI operation (simplified)
function extractOpenApiRequestSchema(operation) {
  const bodyParam = (operation.parameters || []).find(p => p.in === 'body');
  if (bodyParam && bodyParam.schema) return extractSchemaProperties(bodyParam.schema);
  const requestBody = operation.requestBody;
  if (requestBody && requestBody.content) {
    const jsonContent = requestBody.content['application/json'];
    if (jsonContent && jsonContent.schema) return extractSchemaProperties(jsonContent.schema);
  }
  return undefined;
}

// -------------------------------------------------------------------
// Extract response schema (first 2xx response)
function extractOpenApiResponseSchema(operation) {
  const responses = operation.responses || {};
  for (const [code, resp] of Object.entries(responses)) {
    if (code.startsWith('2') && resp.content) {
      const jsonContent = resp.content['application/json'];
      if (jsonContent && jsonContent.schema) return extractSchemaProperties(jsonContent.schema);
    }
  }
  return undefined;
}

// -------------------------------------------------------------------
// Recursively map OpenAPI schema properties to simple type strings
function extractSchemaProperties(schema) {
  if (!schema) return {};
  const props = {};
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (propSchema.type === 'array') {
        props[key] = 'array';
      } else if (propSchema.type === 'object') {
        props[key] = 'object';
      } else if (propSchema.type) {
        props[key] = propSchema.type;
      } else {
        props[key] = 'any';
      }
    }
  }
  return props;
}

// -------------------------------------------------------------------
// Extract endpoints from Postman collection
function extractPostmanEndpoints(collection, baseUrl = '') {
  const endpoints = [];
  const traverseItems = (items, parentUrl = '') => {
    for (const item of items) {
      if (item.request) {
        const method = item.request.method ? item.request.method.toUpperCase() : 'GET';
        let url = '';
        if (typeof item.request.url === 'string') url = item.request.url;
        else if (item.request.url && item.request.url.raw) url = item.request.url.raw;
        if (!url.startsWith('http') && baseUrl) url = resolveUrl(url, baseUrl);
        else if (!url.startsWith('http') && parentUrl) url = resolveUrl(url, parentUrl);
        const endpointKey = `${method} ${url}`;
        let requestSchema;
        if (item.request.body && item.request.body.raw) {
          try {
            const bodyJson = JSON.parse(item.request.body.raw);
            requestSchema = {};
            for (const [key, val] of Object.entries(bodyJson)) {
              requestSchema[key] = typeof val;
            }
          } catch {}
        }
        endpoints.push({
          key: endpointKey,
          method,
          url,
          request: requestSchema,
          response: undefined,
          source: 'imported',
        });
      }
      if (item.item) traverseItems(item.item, url || parentUrl);
    }
  };
  traverseItems(collection.item);
  return endpoints;
}

// -------------------------------------------------------------------
// Main import command
// -------------------------------------------------------------------
const importCommand = new Command('import')
  .alias('imp')
  .description('Import API specifications (OpenAPI/Swagger, Postman, CSV)')
  .argument('[source]', 'URL or file path to the spec')
  .option('-b, --base-url <url>', 'Base URL to resolve relative paths')
  .option('--csv <filePath>', 'Import from a CSV file')
  .option('--name <endpointName>', 'Name of the endpoint when importing CSV')
  .action(async (source, options) => {
    await validateProjectContext();

    let config = await readConfig();
    if (!config) {
      const projectName = await getPackageProjectName();
      config = { version: '1.0', projectName, endpoints: {} };
      await writeConfig(config);
    }

    // ── CSV import (new) ──
    if (options.csv) {
      if (!options.name) {
        logger.error('--name is required when importing from CSV.');
        process.exit(1);
      }
      logger.startSpinner('Parsing CSV...');
      try {
        const rows = await parseCSV(options.csv);
        if (rows.length === 0) {
          logger.fail('CSV file contains no data.');
          process.exit(1);
        }
        const schema = inferSchemaFromData(rows);
        const endpointKey = `GET /api/${options.name}`;
        config.endpoints[endpointKey] = {
          method: 'GET',
          response: schema,
          schema_status: 'imported',
          csv_source: options.csv,
        };
        await writeConfig(config);
        logger.succeed(`Successfully imported ${options.name} from CSV.`);
        logger.info(`Endpoint GET /api/${options.name} added to contract.`);
      } catch (err) {
        logger.fail('CSV import failed: ' + err.message);
        process.exit(1);
      }
      return;   // stop after CSV import
    }

    // ── Interactive prompt if no source ──
    if (!source) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'source',
          message: 'Where is your spec located? (Enter URL or file path)',
          validate: (input) => input.trim() ? true : 'Please provide a path or URL.',
        },
      ]);
      source = answers.source.trim();
    }

    // ── Load spec (existing logic) ──
    let rawContent;
    logger.startSpinner('Loading specification...');
    try {
      if (source.startsWith('http://') || source.startsWith('https://')) {
        const response = await axios.get(source, { timeout: 15000 });
        rawContent = response.data;
        if (typeof rawContent === 'object') rawContent = JSON.stringify(rawContent);
      } else {
        const filePath = path.resolve(process.cwd(), source);
        rawContent = await fs.readFile(filePath, 'utf-8');
      }
    } catch (err) {
      logger.fail('Failed to load specification.');
      logger.error(err.message);
      process.exit(1);
    }
    logger.succeed('Specification loaded.');

    logger.startSpinner('Parsing specification...');
    let specData;
    try {
      const parsed = parseContent(rawContent);
      specData = parsed.data;
    } catch (err) {
      logger.fail('Parsing failed.');
      logger.error(err.message);
      process.exit(1);
    }
    logger.succeed('Specification parsed.');

    const specType = getSpecType(specData);
    if (specType === 'unknown') {
      logger.error('Unknown specification format. Supported: OpenAPI v2/v3, Postman collections.');
      process.exit(1);
    }

    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      if (specType === 'openapi3' && specData.servers && specData.servers[0]) {
        baseUrl = specData.servers[0].url;
      } else if (specType === 'swagger2' && specData.host) {
        baseUrl = `https://${specData.host}${specData.basePath || ''}`;
      }
    }

    let newEndpoints = [];
    if (specType === 'openapi3' || specType === 'swagger2') {
      newEndpoints = extractOpenApiEndpoints(specData, baseUrl);
    } else if (specType === 'postman') {
      newEndpoints = extractPostmanEndpoints(specData, baseUrl);
    }

    if (newEndpoints.length === 0) {
      logger.warn('No endpoints found in the specification.');
      return;
    }

    let added = 0;
    for (const ep of newEndpoints) {
      if (!config.endpoints[ep.key]) {
        config.endpoints[ep.key] = {
          method: ep.method,
          request: ep.request,
          response: ep.response,
          schema_status: 'imported',
        };
        added++;
      }
    }

    await writeConfig(config);
    logger.success(`Import complete. ${added} new endpoint(s) added.`);

    const methodCounts = {};
    newEndpoints.forEach(ep => { methodCounts[ep.method] = (methodCounts[ep.method] || 0) + 1; });

    console.log('\n' + logger.bold('Import Summary'));
    console.log('──────────────────────────────');
    console.log(`Total endpoints imported : ${added}`);
    console.log(`Methods breakdown:`);
    for (const [method, count] of Object.entries(methodCounts)) {
      console.log(`  ${method} : ${count}`);
    }
    console.log(`Target project           : ${config.projectName || '(not set)'}`);
  });

export default importCommand;
