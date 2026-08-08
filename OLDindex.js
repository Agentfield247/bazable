#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import axios from 'axios';
import fs from 'fs/promises';
import { constants } from 'fs';
import { existsSync, writeFileSync, chmodSync } from 'fs';
import path from 'path';
import { parse as babelParse } from '@babel/parser';
import traversePkg from '@babel/traverse';
import generate from '@babel/generator';
import fastGlob from 'fast-glob';

const traverse = traversePkg.default || traversePkg;

// -------------------------------------------------------------------
// Presets for common API frameworks (short aliases included)
// -------------------------------------------------------------------
const PRESETS = {
  // Long names (still work)
  'python-requests': {
    pattern: 'requests\\.(?:get|post|put|patch|delete)\\(\\s*["\'`]?(https?://[^"\'`\\s]+)["\'`]?\\s*\\)',
    extensions: ['.py'],
  },
  'php-guzzle': {
    pattern: '\\$client->(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.php'],
  },
  'go-http': {
    pattern: 'http\\.(?:Get|Post|Put|Patch|Delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.go'],
  },
  'ruby-net-http': {
    pattern: 'Net::HTTP\\.(?:get|post|put|patch|delete)\\(URI\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.rb'],
  },
  'node-fetch': {
    pattern: 'fetch\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  'axios': {
    pattern: 'axios\\.(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },

  // Short aliases – same patterns, easier to type
  'py': {
    pattern: 'requests\\.(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.py'],
  },
  'php': {
    pattern: '\\$client->(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.php'],
  },
  'go': {
    pattern: 'http\\.(?:Get|Post|Put|Patch|Delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.go'],
  },
  'rb': {
    pattern: 'Net::HTTP\\.(?:get|post|put|patch|delete)\\(URI\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.rb'],
  },
  'js': {
    pattern: 'fetch\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  'ax': {
    pattern: 'axios\\.(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
};

// -------------------------------------------------------------------
// Shared helper: resolve pattern, extensions, and ignored dirs from CLI options
// -------------------------------------------------------------------
function resolvePatternAndExtensions(options) {
  let customRegex = null;
  let extensions = options.ext && options.ext.length > 0
    ? options.ext.map(ext => ext.startsWith('.') ? ext : '.' + ext)
    : null;

  // Preset or custom pattern
  if (options.preset) {
    const preset = PRESETS[options.preset];
    if (!preset) {
      console.error(chalk.red(`✖ Unknown preset '${options.preset}'. Available: ${Object.keys(PRESETS).join(', ')}`));
      process.exit(1);
    }
    customRegex = new RegExp(preset.pattern, 'g');
    if (!extensions) extensions = preset.extensions.map(ext => ext.startsWith('.') ? ext : '.' + ext);
  } else if (options.pattern) {
    customRegex = new RegExp(options.pattern, 'g');
  }

  // Extensions fallback
  const patterns = extensions && extensions.length > 0
    ? extensions.map(ext => `**/*${ext}`)
    : ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.html'];

  // Ignored directories
  const ignore = ['**/node_modules/**', '**/.next/**'];
  if (options.ignore) {
    options.ignore.forEach(i => ignore.push(i));
  }

  return { customRegex, patterns, ignore };
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

const CONFIG_FILENAME = 'bazable.config.json';
const PACKAGE_FILENAME = 'package.json';

function getConfigPath() {
  return path.resolve(process.cwd(), CONFIG_FILENAME);
}

function getPackagePath() {
  return path.resolve(process.cwd(), PACKAGE_FILENAME);
}

async function readConfig() {
  const configPath = getConfigPath();
  try {
    await fs.access(configPath, constants.F_OK);
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.warn(chalk.yellow(`⚠ bazable.config.json contains invalid JSON: ${error.message}`));
    }
    return null;
  }
}

async function writeConfig(config) {
  const configPath = getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

function inferSchema(data) {
  if (data === null || typeof data !== 'object') {
    return {};
  }
  const schema = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null) {
      schema[key] = 'null';
    } else if (Array.isArray(value)) {
      schema[key] = 'array';
    } else {
      schema[key] = typeof value;
    }
  }
  return schema;
}

// -------------------------------------------------------------------
// Project context helpers
// -------------------------------------------------------------------

async function getPackageProjectName() {
  const packagePath = getPackagePath();
  try {
    const raw = await fs.readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(raw);
    return pkg.name || 'unknown-project';
  } catch (error) {
    return 'unknown-project';
  }
}

async function validateProjectContext() {
  const config = await readConfig();
  if (!config) {
    return;
  }

  const configProjectName = config.projectName || '';
  const currentProjectName = await getPackageProjectName();

  if (configProjectName !== currentProjectName) {
    console.log(
      chalk.red(
        `🚨 Project Mismatch: This bazable contract belongs to ` +
        `[${configProjectName}] but you are running it in [${currentProjectName}]. ` +
        `Please run 'bazable init' to create a new contract for this project.`
      )
    );
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// Common file traversal helper (includes HTML)
// -------------------------------------------------------------------

async function findSourceFiles() {
  const patterns = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.html'];
  const ignore = ['**/node_modules/**', '**/.next/**'];
  return fastGlob(patterns, { ignore, absolute: true, cwd: process.cwd() });
}

// -------------------------------------------------------------------
// Base URL detection
// -------------------------------------------------------------------

function detectBaseUrl(fileContent) {
  const patterns = [
    /(?:const|let|var)\s+API_BASE\s*=\s*["']([^"']+)["']/,
    /(?:const|let|var)\s+BASE_URL\s*=\s*["']([^"']+)["']/,
    /(?:const|let|var)\s+apiBase\s*=\s*["']([^"']+)["']/,
    /["'](https?:\/\/[^"']+api[^"']*)["']/i,
  ];
  for (const regex of patterns) {
    const match = fileContent.match(regex);
    if (match) return match[1].replace(/\/+$/, '');
  }
  return null;
}

function resolveUrl(url, baseUrl) {
  if (!url || url.startsWith('http')) return url;
  if (baseUrl && url.startsWith('/')) {
    return `${baseUrl}${url}`;
  }
  return url;
}

// -------------------------------------------------------------------
// Auto‑fix: rewrite mismatched literals to match expected types
// -------------------------------------------------------------------
function applyPayloadFixes(fileContent, filePath, config, contractedUrls) {
  let ast;
  try {
    ast = babelParse(fileContent, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    });
  } catch (e) { return fileContent; }

  let modified = false;

  traverse(ast, {
    CallExpression(nodePath) {
      const { callee, arguments: args } = nodePath.node;
      let urlValue = null;
      let payloadNode = null;
      // (Same detection as in inspectFileAdvanced, but simpler)
      if (callee.type === 'Identifier' && callee.name === 'fetch') {
        if (args[0]?.type === 'StringLiteral') urlValue = args[0].value;
        if (args[1]?.type === 'ObjectExpression') {
          const bodyProp = args[1].properties.find(p => p.key.name === 'body');
          if (bodyProp) payloadNode = bodyProp.value;
        }
      } // (we omit axios and custom wrappers for brevity; you can extend if needed)

      if (!urlValue) return;
      const resolvedUrl = resolveUrl(urlValue, config.baseUrl || '');
      const contractedUrl = contractedUrls.find(u => u === resolvedUrl || u === urlValue);
      if (!contractedUrl) return;
      const endpointConfig = config.endpoints[contractedUrl];
      if (!endpointConfig?.request) return;

      // Unwrap JSON.stringify
      let actualPayload = payloadNode;
      if (actualPayload?.type === 'CallExpression' &&
          actualPayload.callee?.type === 'MemberExpression' &&
          actualPayload.callee.object?.name === 'JSON' &&
          actualPayload.callee.property?.name === 'stringify' &&
          actualPayload.arguments?.length > 0) {
        actualPayload = actualPayload.arguments[0];
      }

      if (actualPayload?.type === 'ObjectExpression') {
        actualPayload.properties.forEach(prop => {
          const key = prop.key.name || prop.key.value;
          const expected = endpointConfig.request[key];
          if (!expected) return;
          const valueNode = prop.value;
          const currentType = astTypeToSchemaType(valueNode);
          if (currentType && currentType !== expected) {
            // Replace the literal with a correctly typed one
            let newValueNode;
            switch (expected) {
              case 'string':
                newValueNode = { type: 'StringLiteral', value: String(valueNode.value) };
                break;
              case 'number':
                newValueNode = { type: 'NumericLiteral', value: Number(valueNode.value) || 0 };
                break;
              case 'boolean':
                newValueNode = { type: 'BooleanLiteral', value: Boolean(valueNode.value) };
                break;
              default: return;
            }
            prop.value = newValueNode;
            modified = true;
          }
        });
      }
    }
  });

  if (!modified) return fileContent;

  // Regenerate code from modified AST (using Babel generator – we don't have it,
  // so we'll use a simple replacement approach instead of full codegen.)
  // We'll use Babel's generator from @babel/generator – we need to install it.
  // For simplicity, we'll output a warning that fix requires @babel/generator.
  // We'll add a quick install instruction and fallback.
  try {
    const output = generate(ast, { retainLines: true });
    return output.code;
  } catch (e) {
    console.log(chalk.red('✖ Auto‑fix failed. Make sure @babel/generator is installed.'));
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// Infer request schemas from payload literals in a file
// -------------------------------------------------------------------
function inferRequestSchemasFromFile(fileContent, filePath, config, contractedUrls) {
  const schemas = {};
  // Quick HTML handling
  const isHtml = /\.html$/i.test(filePath) || /<\/?html/i.test(fileContent);
  let blocks = [fileContent];
  if (isHtml) {
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    blocks = [];
    let match;
    while ((match = scriptRegex.exec(fileContent)) !== null) {
      if (!/src\s*=\s*["'][^"']+["']/i.test(match[0]) || match[1].trim().length > 0) blocks.push(match[1]);
    }
  }

  for (const block of blocks) {
    let ast;
    try {
      ast = babelParse(block, { sourceType: 'script', plugins: ['jsx', 'typescript'], errorRecovery: true });
    } catch { continue; }

    traverse(ast, {
      CallExpression(nodePath) {
        const { callee, arguments: args } = nodePath.node;
        let urlValue = null, payloadNode = null;
        if (callee.type === 'Identifier' && (callee.name === 'fetch' || callee.name === 'fetchAPI' || callee.name === 'axios')) {
          if (args[0]?.type === 'StringLiteral') urlValue = args[0].value;
          // fetch: options.body
          if (callee.name === 'fetch' && args[1]?.type === 'ObjectExpression') {
            const bodyProp = args[1].properties.find(p => p.key.name === 'body');
            if (bodyProp) payloadNode = bodyProp.value;
          }
          // fetchAPI: second arg directly
          else if (callee.name === 'fetchAPI' && args[1]?.type === 'ObjectExpression') payloadNode = args[1];
          // axios: second arg or config.data
          else if (callee.name === 'axios' && args[1]) {
            if (args[1].type === 'ObjectExpression') {
              const dataProp = args[1].properties.find(p => p.key.name === 'data');
              payloadNode = dataProp ? dataProp.value : args[1];
            } else payloadNode = args[1];
          }
        }

        if (!urlValue) return;
        const resolvedUrl = resolveUrl(urlValue, config.baseUrl || '');
        if (!contractedUrls || contractedUrls.includes(resolvedUrl)) return; // only new ones

        // Unwrap JSON.stringify
        if (payloadNode?.type === 'CallExpression' &&
            payloadNode.callee?.type === 'MemberExpression' &&
            payloadNode.callee.object?.name === 'JSON' &&
            payloadNode.callee.property?.name === 'stringify' &&
            payloadNode.arguments?.length > 0) {
          payloadNode = payloadNode.arguments[0];
        }

        if (payloadNode?.type === 'ObjectExpression') {
          const schema = {};
          payloadNode.properties.forEach(prop => {
            if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
              const key = prop.key.name || prop.key.value;
              schema[key] = astTypeToSchemaType(prop.value) || 'any';
            }
          });
          if (Object.keys(schema).length > 0) schemas[resolvedUrl] = schema;
        }
      }
    });
  }
  return schemas;
}

 // -------------------------------------------------------------------
 // Advanced AST inspection for payload & over‑fetching (with
 // JSON.stringify handling and async/await destructure support)
 // -------------------------------------------------------------------

 function inspectFileAdvanced(fileContent, filePath, config, contractedUrls, wrappers = ['fetchAPI']) {
   const messages = [];

   // Detect if HTML and extract all inline <script> blocks
   const isHtml = /\.html$/i.test(filePath) || /<\/?html/i.test(fileContent);
   let blocksToParse = [];

   if (isHtml) {
     const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
     let match;
     while ((match = scriptRegex.exec(fileContent)) !== null) {
       const tag = match[0];
       const content = match[1];
       if (/src\s*=\s*["'][^"']+["']/i.test(tag) && content.trim().length === 0) continue;
       if (content.trim()) blocksToParse.push(content);
     }
     if (blocksToParse.length === 0) return messages;
   } else {
     blocksToParse = [fileContent];
   }

   for (const block of blocksToParse) {
     let ast;
     try {
       ast = babelParse(block, {
         sourceType: 'script',
         plugins: ['jsx', 'typescript'],
         errorRecovery: true,
       });
     } catch (error) {
       console.warn(chalk.yellow(`⚠ Could not parse a script block in ${path.relative(process.cwd(), filePath)} – skipping.`));
       continue;
     }

     traverse(ast, {
       CallExpression(nodePath) {
         const { callee, arguments: args } = nodePath.node;
         let urlValue = null;
         let payloadNode = null;


         // Detect fetch / axios / custom wrapper calls
         if (callee.type === 'Identifier') {
           if (callee.name === 'fetch' || wrappers.includes(callee.name)) {
             if (args.length > 0 && args[0].type === 'StringLiteral') {
               urlValue = args[0].value;
             }
             // For fetch: second arg is options object (body inside)
             if (callee.name === 'fetch' && args.length > 1 && args[1].type === 'ObjectExpression') {
               const bodyProp = args[1].properties.find(p => p.key.name === 'body');
               if (bodyProp) payloadNode = bodyProp.value;
             }
             // For custom wrappers: assume second arg is data object directly
             else if (wrappers.includes(callee.name) && args.length > 1) {
               if (args[1].type === 'ObjectExpression') payloadNode = args[1];
               else if (args[1].type === 'CallExpression' && args[1].callee?.object?.name === 'JSON') {
                 payloadNode = args[1].arguments[0]; // unwrap JSON.stringify
               }
             }
           }
         } else if (callee.type === 'MemberExpression') {
           const { object, property } = callee;
           if (object.type === 'Identifier' && object.name === 'axios' && property.type === 'Identifier') {
             if (args.length > 0 && args[0].type === 'StringLiteral') urlValue = args[0].value;
             if (args.length > 1) {
               if (args[1].type === 'ObjectExpression') {
                 const dataProp = args[1].properties.find(p => p.key.name === 'data');
                 if (dataProp) payloadNode = dataProp.value;
                 else payloadNode = args[1];
               } else {
                 payloadNode = args[1];
               }
             }
           }
         }

         if (!urlValue) return;
         const resolvedUrl = resolveUrl(urlValue, config.baseUrl || '');
         const contractedUrl = contractedUrls.find(u => u === resolvedUrl || u === urlValue);
         if (!contractedUrl) return;
         const endpointConfig = config.endpoints[contractedUrl];
         if (!endpointConfig) return;

         // ---------- 1. PAYLOAD VALIDATION (handle JSON.stringify) ----------
         let actualPayload = payloadNode;
         if (actualPayload && actualPayload.type === 'CallExpression') {
           if (actualPayload.callee?.type === 'MemberExpression' &&
               actualPayload.callee.object?.name === 'JSON' &&
               actualPayload.callee.property?.name === 'stringify') {
             if (actualPayload.arguments?.length > 0) {
               actualPayload = actualPayload.arguments[0];
             } else actualPayload = null;
           } else actualPayload = null;
         }

         if (actualPayload && endpointConfig.request) {
           const requestSchema = endpointConfig.request;
           if (actualPayload.type === 'ObjectExpression') {
             actualPayload.properties.forEach(prop => {
               if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
                 const keyName = prop.key.name || prop.key.value;
                 const valueNode = prop.value;
                 const expectedType = requestSchema[keyName];
                 if (expectedType) {
                   const astType = astTypeToSchemaType(valueNode);
                   if (astType && astType !== expectedType) {
                     messages.push(
                       chalk.red(`🚨 Type Mismatch in [${path.relative(process.cwd(), filePath)}]: Endpoint ${contractedUrl} expects ${keyName} to be ${expectedType}, but received ${astType}.`) +
                       '::TYPE_MISMATCH::'                     );
                   }
                 }
               }
             });
           }
         }

         // ---------- 2. OVER‑FETCHING ----------
         let currentPath = nodePath;
         let destructurePattern = null;
         while (currentPath) {
           const parent = currentPath.parent;
           if (!parent) break;
           if (parent.type === 'VariableDeclarator' && parent.init === currentPath.node) {
             if (parent.id.type === 'ObjectPattern') { destructurePattern = parent.id; break; }
           }
           if (parent.type === 'AwaitExpression' && parent.argument === currentPath.node) { currentPath = currentPath.parentPath; continue; }
           if (parent.type === 'MemberExpression' && parent.object === currentPath.node) { currentPath = currentPath.parentPath; continue; }
           if (parent.type === 'CallExpression' && parent.callee === currentPath.node) { currentPath = currentPath.parentPath; continue; }
           break;
         }

         if (destructurePattern) {
           const responseSchema = endpointConfig.response || endpointConfig;
           if (typeof responseSchema === 'object' && !Array.isArray(responseSchema)) {
             const schemaFields = Object.keys(responseSchema).filter(k => k !== 'schema_status' && k !== 'last_checked');
             const destructuredKeys = destructurePattern.properties.map(p => p.key.name || p.key.value);
             if (schemaFields.length > 0) {
               const unused = schemaFields.filter(f => !destructuredKeys.includes(f));
               if (unused.length > 0) {
                 messages.push(
                   chalk.yellow(`⚠️ Over-fetching in [${path.relative(process.cwd(), filePath)}]: Endpoint ${contractedUrl} returns ${schemaFields.length} fields, but you are only using ${destructuredKeys.length}. Consider trimming the payload.`)
                 );
               }
             }
           }
         }
       }
     });
   }

   return messages;
 }


 /**
  * Map a Babel AST node to a simple type string.
  */
 function astTypeToSchemaType(node) {
   if (!node) return null;
   switch (node.type) {
     case 'StringLiteral': return 'string';
     case 'NumericLiteral': return 'number';
     case 'BooleanLiteral': return 'boolean';
     case 'NullLiteral': return 'null';
     case 'ArrayExpression': return 'array';
     case 'ObjectExpression': return 'object';
     default: return null;
   }
 }

// -------------------------------------------------------------------
// AST URL extraction (unchanged)
// -------------------------------------------------------------------

function extractApiUrlsFromFile(fileContent, filePath, wrappers = ['fetchAPI']) {
  const isHtml = /\.html$/i.test(filePath) || /<\/?html/i.test(fileContent);
  const allUrls = new Set();
  let discoveredBaseUrl = null;

  discoveredBaseUrl = detectBaseUrl(fileContent);

  const parseJsBlock = (code, blockIndex) => {
    try {
      const ast = babelParse(code, {
        sourceType: 'script',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });

      traverse(ast, {
        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;

          if (callee.type === 'Identifier' && callee.name === 'fetch') {
            if (args.length > 0 && args[0].type === 'StringLiteral') {
              allUrls.add(args[0].value);
            }
            return;
          }

          if (callee.type === 'MemberExpression') {
            const { object, property } = callee;
            if (
              object.type === 'Identifier' &&
              object.name === 'axios' &&
              property.type === 'Identifier'
            ) {
              if (args.length > 0 && args[0].type === 'StringLiteral') {
                allUrls.add(args[0].value);
              }
            }
          }
          if (
            callee.type === 'Identifier' &&
            callee.name === 'axios' &&
            args.length > 0 &&
            args[0].type === 'StringLiteral'
          ) {
            allUrls.add(args[0].value);
          }

          const customWrappers = wrappers;
          if (callee.type === 'Identifier' && customWrappers.includes(callee.name)) {
            if (args.length > 0 && args[0].type === 'StringLiteral') {
              allUrls.add(args[0].value);
            }
          }
        },
      });
    } catch (parseError) {
      // ignore
    }
  };

  if (isHtml) {
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    let blockIndex = 0;
    while ((match = scriptRegex.exec(fileContent)) !== null) {
      const tag = match[0];
      const content = match[1];
      if (/src\s*=\s*["'][^"']+["']/i.test(tag) && content.trim().length === 0) {
        continue;
      }
      if (content.trim()) {
        parseJsBlock(content, blockIndex++);
      }
    }
  } else {
    parseJsBlock(fileContent, 0);
  }

  return {
    urls: Array.from(allUrls),
    baseUrl: discoveredBaseUrl,
  };
}

// -------------------------------------------------------------------
// CLI Definition
// -------------------------------------------------------------------

const program = new Command();

program
  .name('bazable')
  .description('Git-native API contract management')
  .version('1.0.0');

// -------------------------------------------------------------------
// bazable init (unchanged)
// -------------------------------------------------------------------

program
  .command('init')
  .description('Initialize a new Bazable project')
  .action(async () => {
    const existingConfig = await readConfig();
    if (existingConfig) {
      console.log(
        chalk.yellow('⚠ Project already initialized. A bazable.config.json already exists.')
      );
      return;
    }

    const projectName = await getPackageProjectName();
    const defaultConfig = { version: '1.0', projectName, endpoints: {} };

    try {
      await writeConfig(defaultConfig);
      console.log(chalk.green('✔ bazable.config.json created successfully!'));
    } catch (error) {
      console.error(chalk.red('✖ Failed to initialize project:'), error.message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------
// bazable add <url> (unchanged)
// -------------------------------------------------------------------

program
  .command('add <url>')
  .description('Fetch an endpoint and store its inferred schema')
  .action(async (url) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      console.error(chalk.red('✖ Project not initialized. Run "bazable init" first.'));
      process.exit(1);
    }

    console.log(chalk.blue(`⟳ Fetching schema from ${url}...`));

    try {
      const response = await axios.get(url);
      const data = response.data;
      const schema = inferSchema(data);

      config.endpoints = config.endpoints || {};
      config.endpoints[url] = schema;

      await writeConfig(config);
      console.log(chalk.green(`✔ Endpoint ${url} added to the contract.`));
    } catch (error) {
      if (error.response) {
        console.error(
          chalk.red(`✖ Request failed with status ${error.response.status}: ${error.response.statusText}`)
        );
      } else if (error.request) {
        console.error(chalk.red('✖ No response received. Check the URL or your network connection.'));
      } else {
        console.error(chalk.red('✖ Error:'), error.message);
      }
      process.exit(1);
    }
  });

// -------------------------------------------------------------------
// bazable inspect (with payload & over‑fetching checks)
// -------------------------------------------------------------------

program
  .command('inspect')
  .description('Scan codebase for API calls, validate payloads, and detect over‑fetching')
  .option('--pattern <regex>', 'Custom regex to extract URLs (group 1 = URL)')
  .option('--ext <extensions...>', 'File extensions to scan (e.g. .py .rb)', [])
  .option('--preset <name>', 'Use a pre‑configured pattern for a known framework')
  .option('--ignore <patterns...>', 'Additional glob patterns to ignore (e.g. venv __pycache__)', [])
  .option('--wrapper <names...>', 'Custom API wrapper function names (for AST mode only)', ['fetchAPI'])
  .option('--fix', 'Automatically correct payload type mismatches in source files')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      console.error(chalk.red('✖ Project not initialized. Run "bazable init" first.'));
      process.exit(1);
    }

    const contractedUrls = Object.keys(config.endpoints || {});
    if (contractedUrls.length === 0) {
      console.log(chalk.yellow('⚠ No endpoints in contract. Use "bazable add <url>" to add some.'));
    }

    console.log(chalk.blue('⟳ Scanning source files for API calls...'));

    const { customRegex, patterns, ignore } = resolvePatternAndExtensions(options);
    if (options.preset) console.log(chalk.gray(`Using preset: ${options.preset}`));

    const files = await fastGlob(patterns, { ignore, absolute: true, cwd: process.cwd() });

    if (files.length === 0) {
      console.log(chalk.yellow('⚠ No matching files found.'));
      return;
    }

    const baseUrl = config.baseUrl || '';
    let totalViolations = 0;
    // Warn if no base URL and files contain relative paths
    if (!baseUrl) {
      console.log(chalk.yellow('⚠ No base URL configured. Relative API paths may not match absolute contract URLs.'));
      console.log(chalk.gray('   Consider adding a baseUrl to bazable.config.json or using --base-url in extract.'));
    }
    const wrappers = options.wrapper || ['fetchAPI'];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');

      // ---- 1. EXISTING URL EXISTENCE CHECK ----
      let apiUrls = [];
      if (customRegex) {
        let match;
        while ((match = customRegex.exec(content)) !== null) {
          const url = match[1];
          if (url) apiUrls.push(url);
        }
      } else {
        const result = extractApiUrlsFromFile(content, filePath, wrappers);
        apiUrls = result.urls;
      }

      for (const rawUrl of apiUrls) {
        const resolvedUrl = resolveUrl(rawUrl, baseUrl);
        if (!contractedUrls.includes(resolvedUrl) && !contractedUrls.includes(rawUrl)) {
          totalViolations++;
          const relativePath = path.relative(process.cwd(), filePath);
          console.log(
            chalk.red(`🚨 [${relativePath}] - Dead/Uncontracted API call found: ${resolvedUrl}`)
          );
        }
      }

      // ---- 2. ADVANCED AST CHECKS (payload & over‑fetching) ----

      const advancedMessages = inspectFileAdvanced(content, filePath, config, contractedUrls, wrappers);
      advancedMessages.forEach(msg => {
        console.log(msg);
        // Use a plain‑text marker that chalk cannot colour
        if (msg.includes('::TYPE_MISMATCH::')) totalViolations++;
      });
      // ---- AUTO‑FIX (if requested) ----
      const hadTypeMismatch = advancedMessages.some(m => m.includes('Type Mismatch'));
      if (options.fix && hadTypeMismatch) {
        console.log(chalk.blue(`\n🔧 Applying fixes to ${path.relative(process.cwd(), filePath)}...`));
        let fixedContent = applyPayloadFixes(content, filePath, config, contractedUrls);
        if (fixedContent !== content) {
          await fs.writeFile(filePath, fixedContent, 'utf-8');
          console.log(chalk.green(`   ✅ Fixed ${filePath}`));
        } else {
          console.log(chalk.gray('   No changes needed.'));
        }
      }
    }

    if (totalViolations === 0) {
      console.log(chalk.green('✅ All API calls match the Bazable contract!'));
    } else {
      console.log(
        chalk.red(`\n✖ ${totalViolations} violation(s) found.`)
      );
      process.exit(1);
    }
  });

// -------------------------------------------------------------------
// bazable extract (with presets, custom wrappers, and ignore patterns)
// -------------------------------------------------------------------

program
  .command('extract')
  .description('Auto-discover all API calls and register them as unverified endpoints')
  .option('--pattern <regex>', 'Custom regex to extract URLs (group 1 = URL)')
  .option('--ext <extensions...>', 'File extensions to scan (e.g. .py .rb)', [])
  .option('--preset <name>', 'Use a pre‑configured pattern for a known framework')
  .option('--ignore <patterns...>', 'Additional glob patterns to ignore (e.g. venv __pycache__)', [])
  .option('--wrapper <names...>', 'Custom API wrapper function names (for AST mode only)', ['fetchAPI'])
  .option('--infer-requests', 'Also infer request schemas from payload literals')
  .action(async (options) => {
    await validateProjectContext();

    let config = await readConfig();
    if (!config) {
      const projectName = await getPackageProjectName();
      config = { version: '1.0', projectName, endpoints: {} };
      await writeConfig(config);
    }

    console.log(chalk.blue('⟳ Scanning project for API calls...'));

    const { customRegex, patterns, ignore } = resolvePatternAndExtensions(options);
    if (options.preset) console.log(chalk.gray(`Using preset: ${options.preset}`));

    const files = await fastGlob(patterns, { ignore, absolute: true, cwd: process.cwd() });

    if (files.length === 0) {
      console.log(chalk.yellow('⚠ No matching files found.'));
      return;
    }

    const extractedUrls = new Set();
    let globalBaseUrl = config.baseUrl || null;
    const wrappers = options.wrapper || ['fetchAPI'];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');

      if (customRegex) {
        let match;
        while ((match = customRegex.exec(content)) !== null) {
          let url = match[1];
          if (url) {
            // ---- SANITIZE captured URL ----
            url = url
              .replace(/^["'`\s]+|["'`\s]+$/g, '')   // strip leading/trailing quotes, backticks, spaces
              .replace(/\)\s*$/, '')                   // remove trailing parenthesis
              .trim();
            if (url.startsWith('http')) extractedUrls.add(url);
          }
        }
        const detected = detectBaseUrl(content);
        if (!globalBaseUrl && detected) globalBaseUrl = detected;
      } else {
        const result = extractApiUrlsFromFile(content, filePath, wrappers);
        if (!globalBaseUrl && result.baseUrl) {
          globalBaseUrl = result.baseUrl;
          config.baseUrl = globalBaseUrl;
        }
        for (const rawUrl of result.urls) {
          const fullUrl = resolveUrl(rawUrl, globalBaseUrl);
          extractedUrls.add(fullUrl);
        }

        // Infer request schemas from payload literals if requested
        if (options.inferRequests) {
          const existingUrls = Object.keys(config.endpoints || {});
          const requestInfos = inferRequestSchemasFromFile(content, filePath, config, existingUrls);
          for (const [fullUrl, schema] of Object.entries(requestInfos)) {
            if (!config.endpoints[fullUrl]) config.endpoints[fullUrl] = {};
            config.endpoints[fullUrl].request = schema;
          }
        }

        continue;
      }
    }

    // Resolve URLs with base URL if needed
    if (customRegex && globalBaseUrl) {
      for (const rawUrl of extractedUrls) {
        const fullUrl = resolveUrl(rawUrl, globalBaseUrl);
        extractedUrls.add(fullUrl);
        if (rawUrl !== fullUrl) extractedUrls.delete(rawUrl);
      }
    }

    if (globalBaseUrl && !config.baseUrl) {
      config.baseUrl = globalBaseUrl;
    }

    if (extractedUrls.size === 0) {
      console.log(chalk.yellow('⚠ No API calls found in the codebase.'));
      return;
    }

    let addedCount = 0;
    for (const url of extractedUrls) {
      if (!config.endpoints[url]) {
        config.endpoints[url] = {
          schema_status: 'unverified_extracted_manually'
        };
        addedCount++;
      }
    }

    await writeConfig(config);

    console.log(
      chalk.green(
        `✅ Extraction complete! Found and added ${addedCount} undocumented endpoint(s) to bazable.config.json.`
      )
    );
    if (addedCount === 0) {
      console.log(chalk.gray('All discovered endpoints were already in the contract.'));
    }
    if (globalBaseUrl) {
      console.log(chalk.blue(`🔗 Base URL detected and saved: ${globalBaseUrl}`));
    }
  });


// -------------------------------------------------------------------
// bazable test (enhanced: auto‑base‑path, --all, better errors, built‑in mock)
// -------------------------------------------------------------------

program
  .command('test')
  .description('Test all contracted endpoints and report their health')
  .option('-t, --token <token>', 'Access token (for authenticated endpoints)')
  .option('-m, --method <method>', 'HTTP method (GET, POST, PUT, etc.)', 'GET')
  .option('-H, --header <headers...>', 'Additional headers (key:value)', [])
  .option('-d, --data <json>', 'Request body (JSON string)')
  .option('--base-url <url>', 'Override base URL (e.g., http://localhost:3099)')
  .option('--base-path <path>', 'Explicit path to append to base URL (overrides auto-detected)')
  .option('--all', 'Test all endpoints, ignoring their current status')
  .option('--mock', 'Run in mock mode (no real requests, all endpoints simulate 200 OK)')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      console.error(chalk.red('✖ No endpoints in the contract. Run "bazable extract" first.'));
      process.exit(1);
    }

    const originalBaseUrl = config.baseUrl || '';
    let mockBaseUrl = options.baseUrl || originalBaseUrl;

    // ---- Auto‑path resolution (Option A) ----
    if (options.baseUrl && originalBaseUrl) {
      const originalUrlObj = new URL(originalBaseUrl);
      const newUrlObj = new URL(mockBaseUrl);

      if (newUrlObj.pathname === '/' || newUrlObj.pathname === '') {
        if (originalUrlObj.pathname !== '/' && originalUrlObj.pathname !== '') {
          mockBaseUrl = mockBaseUrl.replace(/\/+$/, '') + originalUrlObj.pathname;
        }
      }
    }

    // Apply explicit --base-path (Option B)
    if (options.basePath) {
      const baseObj = new URL(mockBaseUrl);
      baseObj.pathname = options.basePath.startsWith('/') ? options.basePath : '/' + options.basePath;
      mockBaseUrl = baseObj.toString().replace(/\/+$/, '');
    }

    let urls = Object.keys(config.endpoints).filter(url => url.startsWith('http'));

    // Remap endpoints if base URL changed
    if (mockBaseUrl !== originalBaseUrl) {
      urls = urls.map(url => {
        if (originalBaseUrl && url.startsWith(originalBaseUrl)) {
          return url.replace(originalBaseUrl, mockBaseUrl);
        }
        return url;
      });
    }

    if (urls.length === 0) {
      console.error(chalk.red('✖ No absolute endpoints to test.'));
      process.exit(1);
    }

    // ---- Mock mode header ----
    if (options.mock) {
      console.log(chalk.magenta('🎭 Mock mode – no real requests will be made.'));
    }

    console.log(chalk.blue(`⟳ Testing ${urls.length} endpoint(s) with method ${options.method}...`));
    if (mockBaseUrl !== originalBaseUrl && !options.mock) {
      console.log(chalk.gray(`Base URL overridden: ${mockBaseUrl}`));
      if (!options.basePath) {
        console.log(chalk.gray('(auto‑appended original path)'));
      }
    }
    if (options.all) {
      console.log(chalk.gray('Testing all endpoints (--all).'));
    }
    console.log('');

    const method = options.method.toUpperCase();
    const token = options.token;

    const baseHeaders = {};
    if (options.header) {
      options.header.forEach(h => {
        const [key, ...vals] = h.split(':');
        if (key && vals.length) baseHeaders[key.trim()] = vals.join(':').trim();
      });
    }
    if (token) {
      baseHeaders['Authorization'] = `Bearer ${token}`;
    }

    let customBody = undefined;
    if (options.data) {
      try {
        customBody = JSON.parse(options.data);
      } catch (e) {
        console.error(chalk.red('✖ Invalid JSON in --data'));
        process.exit(1);
      }
    }

    let passed = 0;
    let failed = 0;

    for (const url of urls) {
      const originalUrl = mockBaseUrl !== originalBaseUrl && originalBaseUrl
        ? url.replace(mockBaseUrl, originalBaseUrl)
        : url;
      const entry = config.endpoints[originalUrl] || config.endpoints[url];
      if (!entry) continue;

      if (!options.all && entry.schema_status !== 'unverified_extracted_manually') continue;

      // ---- MOCK MODE BRANCH ----
      if (options.mock) {
        console.log(chalk.green(`✔ ${url} → 200 OK (mock)`));
        entry.schema_status = 'working';
        entry.last_checked = new Date().toISOString();
        passed++;
        continue;
      }

      // ---- REAL REQUEST BRANCH ----
      const reqConfig = {
        method: method,
        url: url,
        headers: { ...baseHeaders },
        timeout: 10000,
        validateStatus: () => true,
      };

      if (['POST', 'PUT', 'PATCH'].includes(method) && token && !customBody) {
        reqConfig.data = { access_token: token };
      } else if (customBody) {
        reqConfig.data = customBody;
      }

      try {
        const response = await axios(reqConfig);
        if (response.status >= 200 && response.status < 300) {
          console.log(chalk.green(`✔ ${url} → ${response.status} ${response.statusText}`));
          entry.schema_status = 'working';
          entry.last_checked = new Date().toISOString();
          passed++;
        } else {
          throw new Error(`Unexpected status ${response.status}`);
        }
      } catch (error) {
        entry.schema_status = 'failed';
        entry.last_checked = new Date().toISOString();
        let reason = error.message;
        let hint = '';

        if (error.response) {
          reason = `HTTP ${error.response.status} ${error.response.statusText}`;
          if (error.response.status === 404) {
            hint = chalk.gray(`\n   🔍 Contract URL: ${originalUrl}\n   🔍 Request URL: ${url}\n   💡 Verify base URL path, HTTP method, or token.`);
          }
        } else if (error.code === 'ECONNABORTED') {
          reason = 'Timeout';
        }

        console.log(chalk.red(`✖ ${url} → ${reason}`));
        if (hint) console.log(hint);
        failed++;
      }
    }

    await writeConfig(config);

    console.log(
      `\n${chalk.bold('Results:')} ${chalk.green(`${passed} working`)}, ${chalk.red(`${failed} failed`)}.`
    );
    console.log(chalk.gray('Statuses updated in bazable.config.json.'));

    if (failed > 0) {
      process.exit(1);
    }
  });


// -------------------------------------------------------------------
// bazable diff – compare live API schema to stored contract
// -------------------------------------------------------------------

program
  .command('diff [url]')
  .description('Check for schema changes between the live API and the contract')
  .option('-t, --token <token>', 'Access token')
  .option('-m, --method <method>', 'HTTP method', 'GET')
  .option('--base-url <url>', 'Override base URL')
  .option('--base-path <path>', 'Explicit path to append to base URL')
  .option('--breaking-only', 'Show only breaking changes (removals and type changes)')
  .option('--json', 'Output diff as JSON')
  .option('--accept', 'Automatically update contract schema to match live API')
  .action(async (url, options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      console.error(chalk.red('✖ No endpoints in the contract.'));
      process.exit(1);
    }

    // Determine which endpoints to diff
    let targets = [];
    if (url) {
      if (!config.endpoints[url]) {
        console.error(chalk.red(`✖ Endpoint ${url} not found in contract.`));
        process.exit(1);
      }
      targets = [url];
    } else {
      // Diff all endpoints that have a full schema (not just status)
      targets = Object.keys(config.endpoints).filter(u => {
        const entry = config.endpoints[u];
        return entry && !('schema_status' in entry && Object.keys(entry).length <= 2);
      });
    }

    if (targets.length === 0) {
      console.log(chalk.yellow('⚠ No endpoints with full schemas to diff. Use "bazable add <url>" first.'));
      return;
    }

    console.log(chalk.blue(`⟳ Diffing ${targets.length} endpoint(s)...`));

    const originalBaseUrl = config.baseUrl || '';
    let baseUrl = options.baseUrl || originalBaseUrl;
    if (options.basePath) {
      const baseObj = new URL(baseUrl);
      baseObj.pathname = options.basePath.startsWith('/') ? options.basePath : '/' + options.basePath;
      baseUrl = baseObj.toString().replace(/\/+$/, '');
    } else if (options.baseUrl && originalBaseUrl) {
      // Auto‑append original path
      const origObj = new URL(originalBaseUrl);
      const newObj = new URL(baseUrl);
      if (newObj.pathname === '/' && origObj.pathname !== '/') {
        baseUrl = baseUrl.replace(/\/+$/, '') + origObj.pathname;
      }
    }

    let anyBreaking = false;
    const reports = [];

    for (const endpoint of targets) {
      const liveUrl = baseUrl && endpoint.startsWith(originalBaseUrl)
        ? endpoint.replace(originalBaseUrl, baseUrl)
        : endpoint;
      const storedSchema = config.endpoints[endpoint];

      console.log(chalk.gray(`\nFetching live schema for ${liveUrl}...`));

      try {
        const method = options.method.toUpperCase();
        const reqConfig = {
          method,
          url: liveUrl,
          timeout: 10000,
        };
        if (options.token) {
          reqConfig.headers = { Authorization: `Bearer ${options.token}` };
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            reqConfig.data = { access_token: options.token };
          }
        }
        const response = await axios(reqConfig);
        const liveSchema = inferSchema(response.data);

        const diff = computeSchemaDiff(storedSchema, liveSchema);
        reports.push({ endpoint, liveUrl, diff });

        if (diff.hasChanges) {
          if (options.json) {
            console.log(JSON.stringify({ endpoint, liveUrl, changes: diff.changes }, null, 2));
          } else {
            console.log(chalk.bold(`\n⚡ Schema drift detected in ${endpoint}:`));
            for (const change of diff.changes) {
              const icon = change.type === 'removed' ? chalk.red('  -') :
                           change.type === 'changed' ? chalk.yellow('  ~') :
                           chalk.green('  +');
              const desc = change.type === 'changed'
                ? `${change.key}: ${change.from} → ${change.to}`
                : change.key;
              console.log(`${icon} ${desc}`);
            }
          }

          if (diff.hasBreaking) anyBreaking = true;

          if (options.accept) {
            config.endpoints[endpoint] = liveSchema;
            console.log(chalk.green(`✔ Contract updated for ${endpoint}`));
          }
        } else {
          console.log(chalk.gray(`No changes for ${endpoint}`));
        }
      } catch (error) {
        console.log(chalk.red(`✖ Failed to fetch ${liveUrl}: ${error.message}`));
      }
    }

    if (options.accept) {
      await writeConfig(config);
      console.log(chalk.green('\nContract saved.'));
    }

    if (anyBreaking && !options.accept) {
      console.log(chalk.red('\n✖ Breaking changes detected. Run with --accept to update contract.'));
      process.exit(1);
    }
  });

// -------------------------------------------------------------------
// Schema diff helper
// -------------------------------------------------------------------

function computeSchemaDiff(oldSchema, newSchema) {
  const oldKeys = Object.keys(oldSchema || {});
  const newKeys = Object.keys(newSchema || {});
  const allKeys = new Set([...oldKeys, ...newKeys]);
  const changes = [];
  let hasBreaking = false;

  for (const key of allKeys) {
    const inOld = oldKeys.includes(key);
    const inNew = newKeys.includes(key);
    if (!inOld && inNew) {
      changes.push({ key, type: 'added' });
    } else if (inOld && !inNew) {
      changes.push({ key, type: 'removed' });
      hasBreaking = true;
    } else if (oldSchema[key] !== newSchema[key]) {
      changes.push({ key, type: 'changed', from: oldSchema[key], to: newSchema[key] });
      hasBreaking = true;
    }
  }

  return {
    hasChanges: changes.length > 0,
    hasBreaking,
    changes,
  };
}

// -------------------------------------------------------------------
// Type‑generation helpers
// -------------------------------------------------------------------

function mapToTsType(bazType) {
  switch (bazType) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    case 'array': return 'any[]';
    case 'object': return 'Record<string, any>';
    default: return 'any';
  }
}

function sanitizePropertyName(key) {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key;
  return `"${key}"`;
}

function generateInterfaceName(url, prefix = '') {
  const parsed = new URL(url);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return (prefix || '') + 'RootResponse';

  // If the last segment is a number, use the second‑to‑last segment
  let meaningfulSegment = segments[segments.length - 1];
  if (/^\d+$/.test(meaningfulSegment) && segments.length > 1) {
    meaningfulSegment = segments[segments.length - 2];
  }

  const rawName = meaningfulSegment.replace(/\.[^.]+$/, '');
  const words = rawName.split(/[-_]/);
  const pascalName = words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return (prefix || '') + pascalName + 'Response';
}

// -------------------------------------------------------------------
// bazable client – generate a typed API client module
// -------------------------------------------------------------------
program
  .command('client')
  .description('Generate a strictly‑typed API client (bazableClient.ts)')
  .option('-o, --output <dir>', 'Output directory for the client file (default: current dir)')
  .option('--stdout', 'Print the client to terminal instead of writing a file')
  .option('--prefix <prefix>', 'Prefix for function names', '')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      console.error(chalk.red('✖ No endpoints in the contract.'));
      process.exit(1);
    }

    // Gather endpoints that have request and/or response schemas
    const endpoints = Object.entries(config.endpoints).filter(([url, entry]) => {
      return entry.request || entry.response || !('schema_status' in entry && Object.keys(entry).length <= 2);
    }).map(([url, entry]) => {
      const hasRequest = entry.request && Object.keys(entry.request).length > 0;
      const hasResponse = entry.response && Object.keys(entry.response).length > 0;
      return { url, entry, hasRequest, hasResponse };
    });

    if (endpoints.length === 0) {
      console.log(chalk.yellow('⚠ No schemas found. Use "bazable add" or define request/response schemas.'));
      return;
    }

    let code = '// Auto-generated by Bazable\n\n';
    code += '// Base URL: ' + (config.baseUrl || 'N/A') + '\n\n';

    for (const { url, entry, hasRequest, hasResponse } of endpoints) {
      const funcName = options.prefix + generateFunctionName(url);
      const reqTypeName = funcName + 'Request';
      const respTypeName = funcName + 'Response';

      // Define request interface if available
      if (hasRequest) {
        code += `interface ${reqTypeName} {\n`;
        for (const [key, type] of Object.entries(entry.request)) {
          code += `  ${sanitizePropertyName(key)}: ${mapToTsType(type)};\n`;
        }
        code += '}\n\n';
      }

      // Define response interface if available
      if (hasResponse) {
        code += `interface ${respTypeName} {\n`;
        for (const [key, type] of Object.entries(entry.response)) {
          code += `  ${sanitizePropertyName(key)}: ${mapToTsType(type)};\n`;
        }
        code += '}\n\n';
      }

      // Generate function
      const params = hasRequest ? `data: ${reqTypeName}` : '';
      const returnType = hasResponse ? `Promise<${respTypeName}>` : 'Promise<any>';
      const fetchBody = hasRequest ? ', { method: \'POST\', body: JSON.stringify(data) }' : '';

      code += `export async function ${funcName}(${params}): ${returnType} {\n`;
      code += `  const response = await fetch('${url}'${fetchBody});\n`;
      code += `  if (!response.ok) throw new Error(\`HTTP \${response.status}\`);\n`;
      code += `  return response.json();\n`;
      code += '}\n\n';
    }

    if (options.stdout) {
      console.log(code);
      return;
    }

    const outDir = options.output || process.cwd();
    await fs.mkdir(outDir, { recursive: true }).catch(() => {});
    const filePath = path.join(outDir, 'bazableClient.ts');
    await fs.writeFile(filePath, code, 'utf-8');
    console.log(chalk.green(`✅ Generated client → ${filePath}`));
  });

// Helper: generate function name from URL
function generateFunctionName(url) {
  const parsed = new URL(url);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'fetchRoot';
  let meaningful = segments[segments.length - 1];
  if (/^\d+$/.test(meaningful) && segments.length > 1) meaningful = segments[segments.length - 2];
  const name = meaningful.replace(/\.[^.]+$/, '');
  const words = name.split(/[-_]/);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}

// -------------------------------------------------------------------
// bazable types – create TypeScript interfaces from schemas
// -------------------------------------------------------------------

program
  .command('types')
  .description('Generate TypeScript interfaces from contracted API schemas')
  .option('-o, --output <dir>', 'Output directory for generated .ts file (default: current directory)')
  .option('--stdout', 'Print interfaces to terminal instead of writing a file')
  .option('--prefix <prefix>', 'Prefix for generated interface names', '')
  .option('--name <name>', 'Override the generated interface name (only for a single schema)')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      console.error(chalk.red('✖ No endpoints in the contract.'));
      process.exit(1);
    }

    // Gather endpoints that have real schemas (not just status placeholders)
    const schemas = Object.entries(config.endpoints)
      .filter(([url, entry]) => {
        return entry && !('schema_status' in entry && Object.keys(entry).length <= 2);
      })
      .map(([url, schema]) => ({ url, schema }));

    if (schemas.length === 0) {
      console.log(chalk.yellow('⚠ No full schemas found. Use "bazable add <url>" to fetch schemas first.'));
      return;
    }

    // Build TypeScript content
    let output = '// Auto-generated by Bazable\n\n';

    for (const { url, schema } of schemas) {
      let interfaceName;
      if (options.name && schemas.length === 1) {
        interfaceName = (options.prefix || '') + options.name;
      } else {
        interfaceName = generateInterfaceName(url, options.prefix);
      }

      const props = Object.entries(schema)
        .map(([key, type]) => `  ${sanitizePropertyName(key)}: ${mapToTsType(type)};`)
        .join('\n');

      output += `export interface ${interfaceName} {\n${props}\n}\n\n`;
    }

    // Terminal output if requested
    if (options.stdout) {
      console.log(output);
      return;
    }

    // Default: write to file
    const outDir = options.output || process.cwd();
    await fs.mkdir(outDir, { recursive: true }).catch(() => {});
    const filePath = path.join(outDir, 'bazable-types.ts');
    await fs.writeFile(filePath, output, 'utf-8');
    console.log(chalk.green(`✅ Generated ${schemas.length} interface(s) → ${filePath}`));
  });

// -------------------------------------------------------------------
// bazable config – view and update contract settings
// -------------------------------------------------------------------

program
  .command('config')
  .description('View or update bazable contract configuration')
  .option('--get <key>', 'Print the value of a specific key (projectName, baseUrl, version, endpoints)')
  .option('--set-project-name <name>', 'Set the project name')
  .option('--set-base-url <url>', 'Set the base URL for resolving relative endpoints')
  .action(async (options) => {
    const config = await readConfig();
    if (!config) {
      console.error(chalk.red('✖ Project not initialized. Run "bazable init" first.'));
      process.exit(1);
    }

    // Handle --get
    if (options.get) {
      const key = options.get;
      if (key === 'endpoints') {
        const urls = Object.keys(config.endpoints || {});
        if (urls.length === 0) {
          console.log(chalk.gray('No endpoints in contract.'));
        } else {
          console.log(chalk.bold(`Endpoints (${urls.length}):`));
          urls.forEach(url => console.log(`  ${url}`));
        }
      } else if (config[key] !== undefined) {
        console.log(config[key]);
      } else {
        console.error(chalk.red(`✖ Key '${key}' not found in config.`));
      }
      return;
    }

    let modified = false;

    // Handle --set-project-name
    if (options.setProjectName) {
      config.projectName = options.setProjectName;
      modified = true;
    }

    // Handle --set-base-url
    if (options.setBaseUrl) {
      config.baseUrl = options.setBaseUrl;
      modified = true;
    }

    if (modified) {
      await writeConfig(config);
      console.log(chalk.green('✔ Configuration updated.'));
    }

    // Display current config
    console.log(chalk.bold('\nCurrent Bazable Configuration:'));
    console.log(`  Project Name : ${config.projectName || '(not set)'}`);
    console.log(`  Version      : ${config.version || '1.0'}`);
    console.log(`  Base URL     : ${config.baseUrl || '(not set)'}`);
    const epCount = Object.keys(config.endpoints || {}).length;
    console.log(`  Endpoints    : ${epCount} registered`);
    if (epCount > 0) {
      const statuses = { working: 0, failed: 0, unverified: 0 };
      for (const [url, entry] of Object.entries(config.endpoints)) {
        if (entry.schema_status === 'working') statuses.working++;
        else if (entry.schema_status === 'failed') statuses.failed++;
        else statuses.unverified++;
      }
      console.log(`    └─ Working: ${chalk.green(statuses.working)} | Failed: ${chalk.red(statuses.failed)} | Unverified: ${chalk.yellow(statuses.unverified)}`);
    }
  });

// -------------------------------------------------------------------
// bazable hook (unchanged)
// -------------------------------------------------------------------

program
  .command('hook')
  .description('Install a pre-push git hook that runs "bazable inspect" automatically')
  .action(() => {
    const gitDir = path.resolve(process.cwd(), '.git');
    if (!existsSync(gitDir)) {
      console.error(chalk.red('🚨 Not a git repository. Please initialize git first.'));
      process.exit(1);
    }

    const hookDir = path.resolve(gitDir, 'hooks');
    const hookPath = path.resolve(hookDir, 'pre-push');

    const hookScript = `#!/bin/sh
if [ "$BAZABLE_SKIP" = "1" ]; then
  echo "⏭ Bazable contract check skipped (BAZABLE_SKIP=1)."
  exit 0
fi

echo "⟳ Running Bazable Contract Check..."
npx bazable inspect
if [ $? -ne 0 ]; then
  echo "🚨 Push aborted: Bazable contract violations found."
  exit 1
fi
`;

    try {
      writeFileSync(hookPath, hookScript, { mode: 0o755 });
      chmodSync(hookPath, 0o755);
      console.log(chalk.green("✅ Bazable Git hook installed! 'bazable inspect' will now run automatically before every git push."));
    } catch (error) {
      console.error(chalk.red('✖ Failed to install git hook:'), error.message);
      process.exit(1);
    }
  });

// -------------------------------------------------------------------
// Parse CLI arguments
// -------------------------------------------------------------------

program.parse(process.argv);
