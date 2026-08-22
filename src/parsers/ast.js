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
  const allOccurrences = [];
  let discoveredBaseUrl = null;
  const allBaseUrls = [];

  discoveredBaseUrl = isHtml ? null : detectBaseUrl(fileContent);

  // recordOccurrence now accepts a lineOffset (for HTML script blocks)
  const recordOccurrence = (url, node, lineOffset = 0) => {
    allUrls.add(url);
    allOccurrences.push({
      url,
      file: filePath,
      line: (node?.loc?.start?.line || 0) + lineOffset,
      column: node?.loc?.start?.column || 0,
    });
  };

  // processBlock also accepts a lineOffset
  const processBlock = (code, lineOffset = 0) => {
    const blockBase = detectBaseUrl(code);
    if (blockBase) {
      if (!discoveredBaseUrl) discoveredBaseUrl = blockBase;
      if (!allBaseUrls.includes(blockBase)) allBaseUrls.push(blockBase);
    }

    try {
      const ast = babelParse(code, {
        sourceType: 'script',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true,
      });

      traverse(ast, {
        CallExpression(nodePath) {
          const { callee, arguments: args } = nodePath.node;

          // 1. fetch('…') or fetch(`…`)
          if (callee.type === 'Identifier' && callee.name === 'fetch') {
            if (args.length > 0) {
              const arg = args[0];
              if (arg.type === 'StringLiteral') {
                recordOccurrence(arg.value, arg, lineOffset);
              } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
                const staticPart = arg.quasis[0].value.cooked || '';
                if (staticPart) {
                  recordOccurrence(staticPart, arg, lineOffset);
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

          // 2. axios.method('…') or axios.method(`…`)
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
                  recordOccurrence(arg.value, arg, lineOffset);
                } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
                  const staticPart = arg.quasis[0].value.cooked || '';
                  if (staticPart) {
                    recordOccurrence(staticPart, arg, lineOffset);
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

          // 3. axios('…') or axios(`…`)
          if (
            callee.type === 'Identifier' &&
            callee.name === 'axios' &&
            args.length > 0
          ) {
            const arg = args[0];
            if (arg.type === 'StringLiteral') {
              recordOccurrence(arg.value, arg, lineOffset);
            } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
              const staticPart = arg.quasis[0].value.cooked || '';
              if (staticPart) {
                recordOccurrence(staticPart, arg, lineOffset);
                if (staticPart.startsWith('http')) {
                  if (!discoveredBaseUrl || staticPart.length < discoveredBaseUrl.length) {
                    discoveredBaseUrl = staticPart;
                  }
                  if (!allBaseUrls.includes(staticPart)) allBaseUrls.push(staticPart);
                }
              }
            }
          }

          // 4. Custom wrappers
          const customWrappers = wrappers;
          const funcName = callee.type === 'Identifier' ? callee.name : '';
          const isLikelyWrapper = funcName &&
            (funcName.toLowerCase().includes('fetch') || funcName.toLowerCase().includes('api'));

          if (callee.type === 'Identifier' && (customWrappers.includes(funcName) || isLikelyWrapper)) {
            if (args.length > 0) {
              const arg = args[0];
              if (arg.type === 'StringLiteral') {
                recordOccurrence(arg.value, arg, lineOffset);
              } else if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
                const staticPart = arg.quasis[0].value.cooked || '';
                if (staticPart) {
                  recordOccurrence(staticPart, arg, lineOffset);
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
      // ignore unparseable blocks
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
        // Calculate line offset: number of newlines before the script block start
        const lineOffset = fileContent.slice(0, match.index).split('\n').length - 1;
        processBlock(content, lineOffset);
      }
    }
  } else {
    processBlock(fileContent, 0);
  }

  return {
    urls: Array.from(allUrls),
    baseUrl: discoveredBaseUrl,
    baseUrls: allBaseUrls,
    occurrences: allOccurrences,
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
  const result = {};
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

  const confidenceFor = (node) => {
    if (!node) return 'low';
    if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral' || node.type === 'NullLiteral') return 'high';
    if (node.type === 'Identifier') return 'medium'; // variable reference – we cannot be sure
    if (node.type === 'ObjectExpression') return 'medium';
    return 'low';
  };

  // Move variable maps outside the block loop so they persist across script blocks
  const variableSchemas = {};
  const variableMeta = {};

  for (const block of blocks) {
    let ast;
    try {
      ast = babelParse(block, { sourceType: 'script', plugins: ['jsx', 'typescript'], errorRecovery: true });
    } catch { continue; }

    // First pass: collect variable schemas (now merges into global maps)
    traverse(ast, {
      VariableDeclarator(path) {
        const { id, init } = path.node;
        if (!id || !init) return;
        if (id.type !== 'Identifier') return;
        const varName = id.name;

        const extractFromObj = (objNode) => {
          const schema = {};
          const meta = {};
          objNode.properties.forEach(prop => {
            if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
              const key = prop.key.name || prop.key.value;
              const valueNode = prop.value;
              const type = astTypeToSchemaType(valueNode) || 'any';
              schema[key] = type;
              meta[key] = {
                inferred: true,
                confidence: confidenceFor(valueNode),
                source_value: valueNode.type === 'StringLiteral' || valueNode.type === 'NumericLiteral' || valueNode.type === 'BooleanLiteral'
                  ? valueNode.value
                  : null,
                source_type: valueNode.type,
              };
            }
          });
          if (Object.keys(schema).length > 0) {
            variableSchemas[varName] = schema;
            variableMeta[varName] = meta;
          }
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

    // Second pass: find API calls and resolve payloads
    traverse(ast, {
      CallExpression(nodePath) {
        const { callee, arguments: args } = nodePath.node;
        let urlValue = null;
        let payloadNode = null;

        const funcName = callee.type === 'Identifier' ? callee.name : '';
        const isWrapper = funcName && (
          funcName === 'fetch' || funcName === 'fetchAPI' || funcName === 'axios' ||
          funcName.toLowerCase().includes('fetch') || funcName.toLowerCase().includes('api')
        );

        if (!(callee.type === 'Identifier' && isWrapper)) return;

        if (args[0]?.type === 'StringLiteral') urlValue = args[0].value;
        else if (args[0]?.type === 'TemplateLiteral' && args[0].quasis.length > 0) urlValue = args[0].quasis[0].value.cooked || '';
        if (!urlValue) return;

        const secondArg = args[1];
        if (!secondArg) return;

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
              payloadNode = bodyNode;
            }
          }
        } else if (funcName === 'axios') {
          if (secondArg.type === 'ObjectExpression') {
            const dataProp = secondArg.properties.find(p => p.key.name === 'data');
            payloadNode = dataProp ? dataProp.value : secondArg;
          } else payloadNode = secondArg;
        } else {
          payloadNode = secondArg;
        }

        // Unwrap JSON.stringify for non-fetch wrappers if present
        if (payloadNode?.type === 'CallExpression' &&
            payloadNode.callee?.type === 'MemberExpression' &&
            payloadNode.callee.object?.name === 'JSON' &&
            payloadNode.callee.property?.name === 'stringify' &&
            payloadNode.arguments?.length > 0) {
          payloadNode = payloadNode.arguments[0];
        }

        if (!payloadNode) return;

        const resolvedUrl = resolveUrl(urlValue, config.baseUrl || '');
        if (result[resolvedUrl]) return; // already captured this endpoint

        // If payload is an identifier, use variable schemas/meta
        if (payloadNode.type === 'Identifier') {
          const varName = payloadNode.name;
          if (variableSchemas[varName]) {
            result[resolvedUrl] = {
              schema: variableSchemas[varName],
              meta: variableMeta[varName] || {},
            };
          }
          return;
        }

        if (payloadNode.type === 'ObjectExpression') {
          const schema = {};
          const meta = {};
          payloadNode.properties.forEach(prop => {
            if (prop.type === 'ObjectProperty' || prop.type === 'Property') {
              const key = prop.key.name || prop.key.value;
              const valueNode = prop.value;
              const type = astTypeToSchemaType(valueNode) || 'any';
              schema[key] = type;
              meta[key] = {
                inferred: true,
                confidence: confidenceFor(valueNode),
                source_value: valueNode.type === 'StringLiteral' || valueNode.type === 'NumericLiteral' || valueNode.type === 'BooleanLiteral'
                  ? valueNode.value
                  : null,
                source_type: valueNode.type,
              };
            }
          });
          if (Object.keys(schema).length > 0) {
            result[resolvedUrl] = { schema, meta };
          }
        }
      }
    });
  }

  return result;
}
