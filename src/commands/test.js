import { Command } from 'commander';
import axios from 'axios';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { readCredentials } from '../utils/credentials.js';

/**
 * Generate a realistic test payload from a request schema.
 * Returns null if no request schema exists (meaning the endpoint is read‑only).
 */
function buildTestPayload(requestSchema) {
  if (!requestSchema || Object.keys(requestSchema).length === 0) return null;
  const payload = {};
  for (const [key, type] of Object.entries(requestSchema)) {
    switch (type) {
      case 'string': payload[key] = 'test'; break;
      case 'number': payload[key] = 1; break;
      case 'boolean': payload[key] = true; break;
      case 'array': payload[key] = []; break;
      case 'object': payload[key] = {}; break;
      default: payload[key] = 'test'; break;   // 'any' or unknown
    }
  }
  return payload;
}

const test = new Command('test')
  .description('Test all contracted endpoints and report their health')
  .option('-t, --token <token>', 'Access token (for authenticated endpoints)')
  .option('-e, --email <email>', 'Email for auto‑login (requires --password)')
  .option('-p, --password <password>', 'Password for auto‑login (requires --email)')
  .option('--login-url <url>', 'Custom login endpoint (default: first endpoint containing "login")')
  .option('-m, --method <method>', 'HTTP method', 'GET')
  .option('-H, --header <headers...>', 'Additional headers (key:value)', [])
  .option('-d, --data <json>', 'Request body (JSON string)')
  .option('--base-url <url>', 'Override base URL')
  .option('--base-path <path>', 'Explicit path to append to base URL')
  .option('-a, --all', 'Test all endpoints, ignoring their current status')
  .option('-k, --mock', 'Run in mock mode (no real requests, all endpoints simulate 200 OK)')
  .option('-x, --exclude <urls...>', 'Endpoint URLs or patterns to skip (comma/space separated)')
  .option('-w, --write', 'Allow testing of write endpoints (endpoints with a request schema). Without this flag, only read‑only endpoints are tested.')
  .option('--json', 'Output results as JSON (for AI/CI pipelines)')
  .option('--ci', 'Disable spinners and interactive prompts')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in the contract. Run "bazable extract" first.');
      process.exit(1);
    }

    // ── Auto‑login logic ──
    let token = options.token;
    // ── Fallback to stored credentials if no authentication flags were given ──
    const storedCreds = (!token && !options.email) ? await readCredentials() : null;
    if (storedCreds && !token) {
      if (storedCreds.token) {
        token = storedCreds.token;
      } else if (storedCreds.email && storedCreds.password) {
        options.email = options.email || storedCreds.email;
        options.password = options.password || storedCreds.password;
      }
      if (storedCreds.baseUrl && !options.baseUrl && !config.baseUrl) {
        // Use stored base URL if none is set in the contract or command line
        options.baseUrl = storedCreds.baseUrl;
        config.baseUrl = storedCreds.baseUrl;   // temporarily override
      }
    }
    if (!token && options.email && options.password) {
      let loginUrl = options.loginUrl;
      if (!loginUrl) {
        const endpoints = Object.keys(config.endpoints);
        loginUrl = endpoints.find(url => url.toLowerCase().includes('login'));
      }
      if (!loginUrl) {
        logger.error('No login URL provided and no endpoint containing "login" found in contract.');
        logger.hint('Specify --login-url or make sure your contract has a login endpoint.');
        process.exit(1);
      }

      logger.info(`Auto‑logging in via ${loginUrl}...`);
      try {
        const loginResponse = await axios.post(loginUrl, {
          email: options.email,
          password: options.password,
        }, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' },
          validateStatus: () => true,
        });

        token = loginResponse.data?.access_token ||
                loginResponse.data?.token ||
                (loginResponse.data?.data && loginResponse.data.data.access_token) ||
                null;

        if (!token) {
          logger.error('Login succeeded but no token found in response.');
          logger.hint('Response keys: ' + Object.keys(loginResponse.data || {}).join(', '));
          process.exit(1);
        }
        logger.success('Token obtained automatically.');
      } catch (error) {
        await logger.errorAndLog('AuthError', `Auto‑login failed: ${error.message}`, 'Check your email/password or the login URL.');
        process.exit(1);
      }
    } else if (options.email || options.password) {
      logger.error('Auto‑login requires both --email and --password.');
      process.exit(1);
    }

    // ── Build exclude list ──
    const excludePatterns = options.exclude
      ? (Array.isArray(options.exclude) ? options.exclude : [options.exclude])
      : [];

    // Always exclude the login endpoint itself (it doesn't use the token)
    const loginEndpoint = Object.keys(config.endpoints).find(url => url.toLowerCase().includes('login'));
    if (loginEndpoint && !excludePatterns.includes(loginEndpoint)) {
      excludePatterns.push(loginEndpoint);
    }

    // ── Filter URLs ──
    let urls = Object.keys(config.endpoints).filter(url => url.startsWith('http'));
    urls = urls.filter(url => {
      return !excludePatterns.some(pattern => url.includes(pattern) || url === pattern);
    });

    // ── Safety: by default, skip write endpoints unless --write is set ──
    const writeAllowed = !!options.write;
    let skippedWrite = 0;
    if (!writeAllowed) {
      const writeUrls = [];
      urls = urls.filter(url => {
        const entry = config.endpoints[url];
        // If the endpoint has a request schema (and the schema is not empty), it's likely a write endpoint
        if (entry && entry.request && Object.keys(entry.request).length > 0) {
          writeUrls.push(url);
          return false; // skip
        }
        return true;
      });
      skippedWrite = writeUrls.length;
      if (skippedWrite > 0) {
        logger.warn(`${skippedWrite} write endpoint(s) skipped (they have request schemas).`);
        logger.hint('Use --write to test write endpoints and send auto‑generated payloads.');
      }
    }

    if (urls.length === 0) {
      logger.warn('No endpoints to test (all excluded or read‑only endpoints skipped).');
      return;
    }

    // ── Base URL handling ──
    const originalBaseUrl = config.baseUrl || '';
    let mockBaseUrl = options.baseUrl || originalBaseUrl;

    if (options.baseUrl && originalBaseUrl) {
      const originalUrlObj = new URL(originalBaseUrl);
      const newUrlObj = new URL(mockBaseUrl);
      if (newUrlObj.pathname === '/' || newUrlObj.pathname === '') {
        if (originalUrlObj.pathname !== '/' && originalUrlObj.pathname !== '') {
          mockBaseUrl = mockBaseUrl.replace(/\/+$/, '') + originalUrlObj.pathname;
        }
      }
    }

    if (options.basePath) {
      const baseObj = new URL(mockBaseUrl);
      baseObj.pathname = options.basePath.startsWith('/') ? options.basePath : '/' + options.basePath;
      mockBaseUrl = baseObj.toString().replace(/\/+$/, '');
    }

    if (mockBaseUrl !== originalBaseUrl) {
      urls = urls.map(url => {
        if (originalBaseUrl && url.startsWith(originalBaseUrl)) {
          return url.replace(originalBaseUrl, mockBaseUrl);
        }
        return url;
      });
    }

    if (urls.length === 0) {
      logger.error('No absolute endpoints to test.');
      process.exit(1);
    }

    // ── Mock mode header ──
    if (options.mock) {
      logger.info('🎭 Mock mode – no real requests will be made.');
    }

    logger.info(`Testing ${urls.length} endpoint(s) with method ${options.method}...`);
    if (mockBaseUrl !== originalBaseUrl && !options.mock) {
      logger.log(`Base URL overridden: ${mockBaseUrl}`);
      if (!options.basePath) logger.log('(auto‑appended original path)');
    }
    if (options.all) logger.log('Testing all endpoints (--all).');

    const method = options.method.toUpperCase();
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
        logger.error('Invalid JSON in --data');
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

      if (options.mock) {
        console.log(`✔ ${url} → 200 OK (mock)`);
        entry.schema_status = 'working';
        entry.last_checked = new Date().toISOString();
        passed++;
        continue;
      }

      // ── Build request payload ──
      let requestBody = customBody;
      if (!requestBody) {
        // If --write is enabled, generate a payload from the schema (if it exists)
        if (writeAllowed && entry.request) {
          const schemaPayload = buildTestPayload(entry.request);
          if (schemaPayload) {
            requestBody = token ? { access_token: token, ...schemaPayload } : schemaPayload;
          }
        }
        // If no payload was built but we have a token, just send the token (read‑only)
        if (!requestBody && token) {
          requestBody = { access_token: token };
        }
      }

      const reqConfig = {
        method: method,
        url: url,
        headers: { ...baseHeaders },
        timeout: 10000,
        validateStatus: () => true,
      };

      if (requestBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
        reqConfig.data = requestBody;
      }

      try {
        const response = await axios(reqConfig);
        if (response.status >= 200 && response.status < 300) {
          console.log(`✔ ${url} → ${response.status} ${response.statusText}`);
          entry.schema_status = 'working';
          entry.last_checked = new Date().toISOString();
          passed++;
        } else if (response.status === 400 || response.status === 422) {
          console.log(`⚠️  ${url} → ${response.status} ${response.statusText} (likely needs specific fields)`);
          entry.schema_status = 'failed';
          entry.last_checked = new Date().toISOString();
          failed++;
        } else {
          console.log(`✖ ${url} → HTTP ${response.status} ${response.statusText}`);
          entry.schema_status = 'failed';
          entry.last_checked = new Date().toISOString();
          failed++;
        }
      } catch (error) {
        entry.schema_status = 'failed';
        entry.last_checked = new Date().toISOString();
        let reason = error.message;
        let hint = '';

        if (error.response) {
          reason = `HTTP ${error.response.status} ${error.response.statusText}`;
          if (error.response.status === 404) {
            hint = `   🔍 Contract URL: ${originalUrl}\n   🔍 Request URL: ${url}\n   💡 Verify base URL path, HTTP method, or token.`;
          } else if (error.response.status === 500) {
            hint = `   💡 This is a server error – not a contract issue.`;
          }
        } else if (error.code === 'ECONNABORTED') {
          reason = 'Timeout';
        }

        console.log(`✖ ${url} → ${reason}`);
        if (hint) console.log(hint);
        failed++;
      }
    }

    await writeConfig(config);
    if (options.json) {
      const result = {
        success: failed === 0,
        passed,
        failed,
      };
      console.log(JSON.stringify(result));
      process.exit(failed > 0 ? 1 : 0);
    }

    logger.success(`Results: ${passed} working, ${failed} failed.`);
    logger.log('Statuses updated in bazable.config.json.');

    if (failed > 0) process.exit(1);
  });

export default test;
