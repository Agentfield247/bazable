import { Command } from 'commander';
import http from 'http';
import axios from 'axios';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { readCredentials, writeCredentials } from '../utils/credentials.js';
import { logger } from '../utils/logger.js';
import { generateSPA } from '../generators/dashboard.js';
import { logError as saveError } from '../utils/errorLogger.js';

function createApiServer(config) {
  return async (req, res) => {
    const { method, url } = req;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    let body = '';
    if (method === 'POST' || method === 'PUT') {
      req.on('data', chunk => body += chunk);
      await new Promise(r => req.on('end', r));
    }

    try {
      if (url === '/api/config' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
      }
      else if (url === '/api/config' && method === 'PUT') {
        const update = JSON.parse(body);
        if (update.endpoints) config.endpoints = { ...config.endpoints, ...update.endpoints };
        if (update.baseUrl) config.baseUrl = update.baseUrl;
        if (update.projectName) config.projectName = update.projectName;
        await writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
      else if (url === '/api/endpoint' && method === 'PUT') {
        const { url: epUrl, data } = JSON.parse(body);
        // Create or update
        config.endpoints[epUrl] = { ...config.endpoints[epUrl], ...data };
        await writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Endpoint saved' }));
      }
      else if (url === '/api/endpoint' && method === 'DELETE') {
        const { url: epUrl } = JSON.parse(body);
        if (config.endpoints[epUrl]) {
          delete config.endpoints[epUrl];
          await writeConfig(config);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(404); res.end(JSON.stringify({ success: false }));
        }
      }
      else if (url === '/api/login' && method === 'POST') {
        const creds = JSON.parse(body);
        await writeCredentials(creds);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
      else if (url === '/api/logout' && method === 'POST') {
        await writeCredentials({});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
      else if (url === '/api/credentials' && method === 'GET') {
        const creds = await readCredentials();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(creds || {}));
      }
      // Proxy route for Postman‑style testing
      else if (url === '/api/proxy' && method === 'POST') {
        const { method: rawMethod, url: rawUrl, headers: reqHeaders, body: reqBody } = JSON.parse(body);
        let reqMethod = rawMethod || 'GET';
        let reqUrl = rawUrl;
        // Safety: strip method prefix if present (e.g. "POST https://..." → "https://...")
        const prefixMatch = reqUrl.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
        if (prefixMatch) {
          reqMethod = prefixMatch[1].toUpperCase();
          reqUrl = prefixMatch[2];
        }
        try {
          const proxyRes = await axios({
            method: reqMethod,
            url: reqUrl,
            headers: reqHeaders || {},
            data: reqBody || undefined,
            timeout: 10000,
            validateStatus: () => true,
          });
          res.writeHead(proxyRes.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(proxyRes.data));
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      }
      // Serve the SPA for all other GET requests
      else if (method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(generateSPA(config));
      }
      else {
        res.writeHead(404); res.end('Not found');
      }
    } catch (err) {
      await saveError('UIError', err.message, 'Dashboard API error', err.stack);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: err.message }));
    }
  };
}

const ui = new Command('ui')
  .description('Open an interactive dashboard for your contract')
  .option('-p, --port <port>', 'Port for the dashboard server', '3000')
  .action(async (options) => {
    await validateProjectContext();
    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in the contract.');
      process.exit(1);
    }

    const port = parseInt(options.port);
    const handler = createApiServer(config);

    const server = http.createServer(async (req, res) => {
      try { await handler(req, res); } catch { res.writeHead(500); res.end(); }
    });

    server.listen(port, () => {
      logger.success(`Dashboard running on http://localhost:${port}`);
      logger.hint('Open in your browser. Press Ctrl+C to stop.');
    });
  });

export default ui;
