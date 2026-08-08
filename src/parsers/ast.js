import { parse as babelParse } from '@babel/parser';
import traversePkg from '@babel/traverse';
import generate from '@babel/generator';
import chalk from 'chalk';
import path from 'path';
import { detectBaseUrl, resolveUrl } from '../utils/url.js';

const traverse = traversePkg.default || traversePkg;

// -------------------------------------------------------------------
// Shared helpers for AST type mapping
// -------------------------------------------------------------------
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
// Main URL extractor (used by extract / inspect)
// -------------------------------------------------------------------
export function extractApiUrlsFromFile(fileContent, filePath, wrappers = ['fetchAPI']) {
  const isHtml = /\.html$/i.test(filePath) || /<\/?html/i.test(fileContent);
  const allUrls = new Set();
  let discoveredBaseUrl = null;
  const allBaseUrls = [];

  // For HTML we'll detect base URL per script block, so start with null here
  discoveredBaseUrl = isHtml ? null : detectBaseUrl(fileContent);

  const processBlock = (code) => {
    // Detect base URL inside this script block (for HTML)
    const blockBase = detectBaseUrl(code);
    if (blockBase) {
      if (!discoveredBaseUrl) discoveredBaseUrl = blockBase;
      if (!allBaseUrls.includes(blockBase)) allBaseUrls.push(blockBase);
    }

    // Wrap both parsing and traversal in a single try/catch so that
    // any block with duplicate declarations or syntax errors is skipped.
    try {
      const ast = babelParse(code, {
        sourceType: 'script',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });

      traverse(ast, {
        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;

          // ── 1. fetch('…') or fetch(`…`) ──
          if (callee.type === 'Identifier' && callee.name === 'fetch') {
            if (args.length > 0) {
              const arg = args[0];
              if (arg.type === 'StringLiteral') {
                allUrls.add(arg.value);
              } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
                const staticPart = arg.quasis[0].value.cooked || '';
                if (staticPart) {
                  allUrls.add(staticPart);
                  if (staticPart.startsWith('http')) {
                    if (!discoveredBaseUrl || staticPart.length < discoveredBaseUrl.length) {
                      discoveredBaseUrl = staticPart;
                    }
                    if (!allBaseUrls.includes(staticPart)) allBaseUrls.push(staticPart);
                  }
                }
              }
            }
            return;
          }

          // ── 2. axios.method('…') or axios.method(`…`) ──
          if (callee.type === 'MemberExpression') {
            const { object, property } = callee;
            if (
              object.type === 'Identifier' &&
              object.name === 'axios' &&
              property.type === 'Identifier'
            ) {
              if (args.length > 0) {
                const arg = args[0];
                if (arg.type === 'StringLiteral') {
                  allUrls.add(arg.value);
                } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
                  const staticPart = arg.quasis[0].value.cooked || '';
                  if (staticPart) {
                    allUrls.add(staticPart);
                    if (staticPart.startsWith('http')) {
                      if (!discoveredBaseUrl || staticPart.length < discoveredBaseUrl.length) {
                        discoveredBaseUrl = staticPart;
                      }
                      if (!allBaseUrls.includes(staticPart)) allBaseUrls.push(staticPart);
                    }
                  }
                }
              }
            }
          }

          // ── 3. axios('…') or axios(`…`) ──
          if (
            callee.type === 'Identifier' &&
            callee.name === 'axios' &&
            args.length > 0
          ) {
            const arg = args[0];
            if (arg.type === 'StringLiteral') {
              allUrls.add(arg.value);
            } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
              const staticPart = arg.quasis[0].value.cooked || '';
              if (staticPart) {
                allUrls.add(staticPart);
                if (staticPart.startsWith('http')) {
                  if (!discoveredBaseUrl || staticPart.length < discoveredBaseUrl.length) {
                    discoveredBaseUrl = staticPart;
                  }
                  if (!allBaseUrls.includes(staticPart)) allBaseUrls.push(staticPart);
                }
              }
            }
          }

          // ── 4. Custom wrappers (e.g. fetchAPI, fetchLedgerAPI, apiClient) ──
          const customWrappers = wrappers;
          const funcName = callee.type === 'Identifier' ? callee.name : '';
          const isLikelyWrapper = funcName &&
            (funcName.toLowerCase().includes('fetch') || funcName.toLowerCase().includes('api'));

          if (callee.type === 'Identifier' && (customWrappers.includes(funcName) || isLikelyWrapper)) {
            if (args.length > 0) {
              const arg = args[0];
              if (arg.type === 'StringLiteral') {
                allUrls.add(arg.value);
              } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
                const staticPart = arg.quasis[0].value.cooked || '';
                if (staticPart) {
                  allUrls.add(staticPart);
                  if (staticPart.startsWith('http')) {
                    if (!discoveredBaseUrl || staticPart.length < discoveredBaseUrl.length) {
                      discoveredBaseUrl = staticPart;
                    }
                    if (!allBaseUrls.includes(staticPart)) allBaseUrls.push(staticPart);
                  }
                }
              }
            }
          }
        },
      });
    } catch (parseError) {
      // Silently skip blocks that cause scope collisions or syntax errors
    }
  };

  if (isHtml) {
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(fileContent)) !== null) {
      const tag = match[0];
      const content = match[1];
      if (/src\s*=\s*["'][^"']+["']/i.test(tag) && content.trim().length === 0) continue;
      if (content.trim()) {
        processBlock(content);
      }
    }
  } else {
    processBlock(fileContent);
  }

  return {
    urls: Array.from(allUrls),
    baseUrl: discoveredBaseUrl,
    baseUrls: allBaseUrls,
  };
}

// -------------------------------------------------------------------
// Advanced inspection (payload & over‑fetching)
// -------------------------------------------------------------------
export function inspectFileAdvanced(fileContent, filePath, config, contractedUrls, wrappers = ['fetchAPI']) {
  const messages = [];

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
    // Wrap both parse and traverse in try/catch so scope collisions are skipped
    try {
      const ast = babelParse(block, {
        sourceType: 'script',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });

      traverse(ast, {
        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;
          let urlValue = null;
          let payloadNode = null;

          if (callee.type === 'Identifier') {
            if (callee.name === 'fetch' || wrappers.includes(callee.name)) {
              if (args.length > 0 && args[0].type === 'StringLiteral') {
                urlValue = args[0].value;
              }
              if (callee.name === 'fetch' && args.length > 1 && args[1].type === 'ObjectExpression') {
                const bodyProp = args[1].properties.find(p => p.key.name === 'body');
                if (bodyProp) payloadNode = bodyProp.value;
              } else if (wrappers.includes(callee.name) && args.length > 1) {
                if (args[1].type === 'ObjectExpression') payloadNode = args[1];
                else if (args[1].type === 'CallExpression' && args[1].callee?.object?.name === 'JSON') {
                  payloadNode = args[1].arguments[0];
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

          // Payload validation
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
                        '::TYPE_MISMATCH::'
                      );
                    }
                  }
                }
              });
            }
          }

          // Over‑fetching
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
    } catch (error) {
      // Silently skip blocks that cause scope collisions or syntax errors
      console.warn(chalk.yellow(`⚠ Could not parse or traverse a script block in ${path.relative(process.cwd(), filePath)} – skipping.`));
    }
  }

  return messages;
}

// -------------------------------------------------------------------
// Auto‑fix payload mismatches
// -------------------------------------------------------------------
export function applyPayloadFixes(fileContent, filePath, config, contractedUrls) {
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
      if (callee.type === 'Identifier' && callee.name === 'fetch') {
        if (args[0]?.type === 'StringLiteral') urlValue = args[0].value;
        if (args[1]?.type === 'ObjectExpression') {
          const bodyProp = args[1].properties.find(p => p.key.name === 'body');
          if (bodyProp) payloadNode = bodyProp.value;
        }
      }

      if (!urlValue) return;
      const resolvedUrl = resolveUrl(urlValue, config.baseUrl || '');
      const contractedUrl = contractedUrls.find(u => u === resolvedUrl || u === urlValue);
      if (!contractedUrl) return;
      const endpointConfig = config.endpoints[contractedUrl];
      if (!endpointConfig?.request) return;

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

  try {
    const output = generate(ast, { retainLines: true });
    return output.code;
  } catch (e) {
    console.log(chalk.red('✖ Auto‑fix failed. Make sure @babel/generator is installed.'));
    process.exit(1);
  }
}

// -------------------------------------------------------------------
// Infer request schemas from payload literals (with variable resolution, fetch‑aware)
// -------------------------------------------------------------------
export function inferRequestSchemasFromFile(fileContent, filePath, config, contractedUrls) {
  const schemas = {};
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
    // Wrap the entire block processing so that any parse/traverse error
    // (including duplicate declarations) simply skips the block.
    try {
      const ast = babelParse(block, { sourceType: 'script', plugins: ['jsx', 'typescript'], errorRecovery: true });

      // ── FIRST PASS : collect variable → object‑literal schemas ──
      const variableSchemas = {};
      traverse(ast, {
        VariableDeclarator(path) {
          const { id, init } = path.node;
          if (!id || !init) return;
          if (id.type !== 'Identifier') return;
          const varName = id.name;

          const extractFromObj = (objNode) => {
            const schema = {};
            objNode.properties.forEach(prop => {
              if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
                const key = prop.key.name || prop.key.value;
                schema[key] = astTypeToSchemaType(prop.value) || 'any';
              }
            });
            if (Object.keys(schema).length > 0) variableSchemas[varName] = schema;
          };

          if (init.type === 'ObjectExpression') {
            extractFromObj(init);
          } else if (init.type === 'CallExpression' &&
                     init.callee?.type === 'MemberExpression' &&
                     init.callee.object?.name === 'JSON' &&
                     init.callee.property?.name === 'stringify' &&
                     init.arguments?.length > 0 &&
                     init.arguments[0].type === 'ObjectExpression') {
            extractFromObj(init.arguments[0]);
          }
        }
      });

      // ── SECOND PASS : API calls → resolve payloads ──
      traverse(ast, {
        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;
          let urlValue = null;
          let finalSchema = null;

          const funcName = callee.type === 'Identifier' ? callee.name : '';
          const isWrapper = funcName && (
            funcName === 'fetch' || funcName === 'fetchAPI' || funcName === 'axios' ||
            funcName.toLowerCase().includes('fetch') || funcName.toLowerCase().includes('api')
          );

          if (!(callee.type === 'Identifier' && isWrapper)) return;

          if (args[0]?.type === 'StringLiteral') {
            urlValue = args[0].value;
          } else if (args[0]?.type === 'TemplateLiteral' && args[0].quasis.length > 0) {
            urlValue = args[0].quasis[0].value.cooked || '';
          }
          if (!urlValue) return;

          const secondArg = args[1];
          if (!secondArg) return;

          const getSchemaFromNode = (node) => {
            if (!node) return null;
            if (node.type === 'ObjectExpression') {
              const schema = {};
              node.properties.forEach(prop => {
                if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
                  const key = prop.key.name || prop.key.value;
                  schema[key] = astTypeToSchemaType(prop.value) || 'any';
                }
              });
              return Object.keys(schema).length > 0 ? schema : null;
            }
            if (node.type === 'Identifier' && variableSchemas[node.name]) {
              return variableSchemas[node.name];
            }
            return null;
          };

          if (funcName === 'fetch') {
            if (secondArg.type === 'ObjectExpression') {
              const bodyProp = secondArg.properties.find(p => p.key.name === 'body');
              if (bodyProp) {
                let bodyNode = bodyProp.value;
                if (bodyNode.type === 'CallExpression' &&
                    bodyNode.callee?.type === 'MemberExpression' &&
                    bodyNode.callee.object?.name === 'JSON' &&
                    bodyNode.callee.property?.name === 'stringify' &&
                    bodyNode.arguments?.length > 0) {
                  bodyNode = bodyNode.arguments[0];
                }
                finalSchema = getSchemaFromNode(bodyNode);
              }
            }
          } else if (funcName === 'axios') {
            if (secondArg.type === 'ObjectExpression') {
              const dataProp = secondArg.properties.find(p => p.key.name === 'data');
              finalSchema = getSchemaFromNode(dataProp ? dataProp.value : secondArg);
            } else {
              finalSchema = getSchemaFromNode(secondArg);
            }
          } else {
            if (secondArg.type === 'ObjectExpression') {
              finalSchema = getSchemaFromNode(secondArg);
            } else if (secondArg.type === 'Identifier' && variableSchemas[secondArg.name]) {
              finalSchema = variableSchemas[secondArg.name];
            } else if (secondArg.type === 'CallExpression' &&
                       secondArg.callee?.type === 'MemberExpression' &&
                       secondArg.callee.object?.name === 'JSON' &&
                       secondArg.callee.property?.name === 'stringify' &&
                       secondArg.arguments?.length > 0) {
              finalSchema = getSchemaFromNode(secondArg.arguments[0]);
            }
          }

          if (finalSchema) {
            const resolvedUrl = resolveUrl(urlValue, config.baseUrl || '');
            schemas[resolvedUrl] = finalSchema;
          }
        }
      });
    } catch (parseError) {
      // Silently skip blocks that cause scope collisions or syntax errors
    }
  }
  return schemas;
}
