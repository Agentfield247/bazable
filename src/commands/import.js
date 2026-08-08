import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import inquirer from 'inquirer';
import { load as yamlLoad } from 'js-yaml';
import { readConfig, writeConfig, getPackageProjectName, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { resolveUrl } from '../utils/url.js';

// -------------------------------------------------------------------
// Helper: detect if content is JSON or YAML
function parseContent(raw) {
  // Try JSON first
  try { return { format: 'json', data: JSON.parse(raw) }; } catch {}
  // Try YAML
  try { return { format: 'yaml', data: yamlLoad(raw) }; } catch {}
  throw new Error('Unrecognised format – not valid JSON or YAML.');
}

// -------------------------------------------------------------------
// Helper: determine spec type
function getSpecType(data) {
  if (!data) return 'unknown';
  // Postman collection v2/v2.1
  if (data.info && data.info.schema && data.info.schema.includes('postman')) return 'postman';
  // OpenAPI v3
  if (data.openapi) return 'openapi3';
  // Swagger v2
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
      const fullUrl = resolveUrl(routePath, baseUrl); // absolute
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
        props[key] = propSchema.type; // string, number, boolean, etc.
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
        // Resolve against parent if relative
        if (!url.startsWith('http') && baseUrl) url = resolveUrl(url, baseUrl);
        else if (!url.startsWith('http') && parentUrl) url = resolveUrl(url, parentUrl);
        const endpointKey = `${method} ${url}`;
        // Try to parse request body (raw JSON)
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
          response: undefined, // Postman rarely includes response schemas
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
  .description('Import API specifications (OpenAPI/Swagger, Postman)')
  .argument('[source]', 'URL or file path to the spec')
  .option('-b, --base-url <url>', 'Base URL to resolve relative paths')
  .action(async (source, options) => {
    await validateProjectContext();

    let config = await readConfig();
    if (!config) {
      // If no config, create one silently
      const projectName = await getPackageProjectName();
      config = { version: '1.0', projectName, endpoints: {} };
      await writeConfig(config);
    }

    // Interactive prompt if no source
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

    // Fetch content
    let rawContent;
    logger.startSpinner('Loading specification...');
    try {
      if (source.startsWith('http://') || source.startsWith('https://')) {
        const response = await axios.get(source, { timeout: 15000 });
        rawContent = response.data;
        // If it's a string, assume it's the raw spec content
        if (typeof rawContent === 'object') rawContent = JSON.stringify(rawContent);
      } else {
        // Local file path
        const filePath = path.resolve(process.cwd(), source);
        rawContent = await fs.readFile(filePath, 'utf-8');
      }
    } catch (err) {
      logger.fail('Failed to load specification.');
      logger.error(err.message);
      process.exit(1);
    }
    logger.succeed('Specification loaded.');

    // Parse content (JSON/YAML)
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

    // Detect type
    const specType = getSpecType(specData);
    if (specType === 'unknown') {
      logger.error('Unknown specification format. Supported: OpenAPI v2/v3, Postman collections.');
      process.exit(1);
    }

    // Determine base URL
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      // Try to extract from spec
      if (specType === 'openapi3' && specData.servers && specData.servers[0]) {
        baseUrl = specData.servers[0].url;
      } else if (specType === 'swagger2' && specData.host) {
        baseUrl = `https://${specData.host}${specData.basePath || ''}`;
      } else if (specType === 'postman') {
        // Leave baseUrl empty; relative URLs will be resolved using the first request's URL
      }
    }

    // Extract endpoints
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

    // Merge into config (don't overwrite existing)
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

    // Summary dashboard
    const methodCounts = {};
    newEndpoints.forEach(ep => {
      methodCounts[ep.method] = (methodCounts[ep.method] || 0) + 1;
    });

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
