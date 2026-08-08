import { Command } from 'commander';
import http from 'http';
import axios from 'axios';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { readCredentials, writeCredentials } from '../utils/credentials.js';
import { logger } from '../utils/logger.js';
import { generateSPA } from '../generators/dashboard.js';
import { logError as saveError } from '../utils/errorLogger.js';
import { askAI } from '../utils/ai.js';                       // ← new import

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
      // --------------------------------------------------
      // Configuration
      // --------------------------------------------------
      if (url === '/api/config' && method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(config));
      }
      else if (url === '/api/config' && method === 'PUT') {
        const update = JSON.parse(body);
        if (update.endpoints) config.endpoints = { ...config.endpoints, ...update.endpoints };
        if (update.baseUrl !== undefined) config.baseUrl = update.baseUrl;
        if (update.projectName) config.projectName = update.projectName;
        if (update.aiApiKey !== undefined) config.aiApiKey = update.aiApiKey;
        if (update.aiBaseUrl !== undefined) config.aiBaseUrl = update.aiBaseUrl;
        if (update.aiModel !== undefined) config.aiModel = update.aiModel;
        await writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }

      // --------------------------------------------------
      // Endpoint CRUD
      // --------------------------------------------------
      else if (url === '/api/endpoint' && method === 'PUT') {
        const { url: epUrl, data } = JSON.parse(body);
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

      // --------------------------------------------------
      // Authentication
      // --------------------------------------------------
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

      // --------------------------------------------------
      // AI – Test connection & fetch models
      // --------------------------------------------------
      else if (url === '/api/ai/test' && method === 'POST') {
        const { apiKey, baseUrl } = JSON.parse(body);
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'API key is required.' }));
          return;
        }
        const aiBase = baseUrl || 'https://api.openai.com/v1';
        try {
          const testRes = await axios.get(`${aiBase}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 8000,
          });
          if (testRes.status === 200) {
            const models = (testRes.data.data || []).map(m => m.id).sort();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, models }));
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, message: `Unexpected response: ${testRes.status}` }));
          }
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: err.response?.data?.error?.message || err.message }));
        }
      }
      else if (url === '/api/ai/models' && method === 'POST') {
        const { apiKey, baseUrl } = JSON.parse(body);
        if (!apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, models: [] }));
          return;
        }
        const aiBase = baseUrl || 'https://api.openai.com/v1';
        try {
          const testRes = await axios.get(`${aiBase}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: 8000,
          });
          const models = (testRes.data.data || []).map(m => m.id).sort();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, models }));
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, models: [] }));
        }
      }

      // --------------------------------------------------
      // AI – Explain endpoint
      // --------------------------------------------------
      else if (url === '/api/ai/explain' && method === 'POST') {
        const { method: epMethod, url: epUrl } = JSON.parse(body);
        const contractKey = `${epMethod.toUpperCase()} ${epUrl}`;
        const entry = config.endpoints[contractKey] || config.endpoints[epUrl];
        if (!entry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Endpoint not found in contract.' }));
          return;
        }
        const requestSchema = entry.request || {};
        const responseSchema = entry.response || {};

        const prompt = `Explain this API endpoint to a frontend developer:\nMethod: ${epMethod.toUpperCase()}\nURL: ${epUrl}\nRequest schema: ${JSON.stringify(requestSchema)}\nResponse schema: ${JSON.stringify(responseSchema)}\n\nWhat does it do? What data must be sent? What will be returned? Mention any edge cases.`;

        try {
          const answer = await askAI(prompt, 'You are a senior backend engineer explaining an API to a junior frontend developer. Keep it concise and actionable.');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, explanation: answer }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
      }

      // --------------------------------------------------
      // AI – Propose endpoint
      // --------------------------------------------------
      else if (url === '/api/ai/propose' && method === 'POST') {
        const { method: epMethod, url: epUrl, requestText } = JSON.parse(body);
        const systemCtx = 'You are an API architect. The user wants to update the Bazable API contract. Return ONLY a valid JSON object describing the proposed changes. The JSON must have this structure: { "endpoint": "METHOD URL", "changes": { "request": { ... }, "response": { ... } } }. Do not include markdown formatting, just the raw JSON.';
        const prompt = `Here is the current contract:\n${JSON.stringify(config, null, 2)}\n\nThe user requests: "${requestText}"\n\nWhat is the exact schema diff needed?`;

        try {
          const rawAnswer = await askAI(prompt, systemCtx);
          let proposal;
          try {
            proposal = JSON.parse(rawAnswer.trim());
          } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, raw: rawAnswer }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, proposal }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: err.message }));
        }
      }

      // --------------------------------------------------
      // Proxy for Postman‑style testing
      // --------------------------------------------------
      else if (url === '/api/proxy' && method === 'POST') {
        const { method: rawMethod, url: rawUrl, headers: reqHeaders, body: reqBody } = JSON.parse(body);
        let reqMethod = rawMethod || 'GET';
        let reqUrl = rawUrl;
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

      // --------------------------------------------------
      // Serve the SPA for all other GET requests
      // --------------------------------------------------
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
