import { Command } from 'commander';
import express from 'express';
import cors from 'cors';
import { faker } from '@faker-js/faker';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';

// -------------------------------------------------------------------
// Smart data generator using @faker-js/faker
// -------------------------------------------------------------------
function generateMockValue(key, type) {
  const keyLower = key.toLowerCase();

  // Smart key matching for common field names
  if (type === 'string') {
    if (keyLower.includes('email')) return faker.internet.email();
    if (keyLower.includes('avatar') || keyLower.includes('image') || keyLower.includes('photo'))
      return faker.image.avatar();
    if (keyLower.includes('name')) {
      if (keyLower.includes('full')) return faker.person.fullName();
      return faker.person.firstName();
    }
    if (keyLower.includes('phone') || keyLower.includes('mobile')) return faker.phone.number();
    if (keyLower.includes('address')) return faker.location.streetAddress();
    if (keyLower.includes('city')) return faker.location.city();
    if (keyLower.includes('url') || keyLower.includes('link')) return faker.internet.url();
    if (keyLower.includes('description') || keyLower.includes('note')) return faker.lorem.sentence();
    if (keyLower.includes('title')) return faker.lorem.words(3);
    if (keyLower.includes('password')) return faker.internet.password();
    if (keyLower.includes('token')) return faker.string.alphanumeric(32);
    return faker.lorem.word();
  }
  if (type === 'number') {
    if (keyLower.includes('id') || keyLower.includes('count')) return faker.number.int({ min: 1, max: 1000 });
    if (keyLower.includes('price') || keyLower.includes('amount') || keyLower.includes('balance'))
      return parseFloat(faker.finance.amount(5, 200, 2));
    if (keyLower.includes('age')) return faker.number.int({ min: 18, max: 80 });
    if (keyLower.includes('quantity')) return faker.number.int({ min: 1, max: 20 });
    return faker.number.int({ min: 1, max: 100 });
  }
  if (type === 'boolean') return faker.datatype.boolean();
  if (type === 'array') return [];
  if (type === 'object') return {};
  return null;
}

/**
 * Build a realistic mock response from a response schema.
 */
function buildMockResponse(responseSchema) {
  if (!responseSchema || Object.keys(responseSchema).length === 0) {
    return { success: true, message: 'Mock response' };
  }
  const data = {};
  for (const [key, type] of Object.entries(responseSchema)) {
    data[key] = generateMockValue(key, type);
  }
  return { success: true, data };
}

// -------------------------------------------------------------------
// Simple in‑memory store for stateful CRUD (POST/PUT)
// -------------------------------------------------------------------
const memoryStore = new Map();

// -------------------------------------------------------------------
// CLI Command
// -------------------------------------------------------------------
const serve = new Command('serve')
  .alias('s')
  .description('Start a realistic mock server from the contract')
  .option('-p, --port <port>', 'Port to listen on', '4000')
  .option('-d, --delay <ms>', 'Simulate network delay in milliseconds', '0')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in the contract. Run "bazable extract" first.');
      process.exit(1);
    }

    const app = express();
    app.use(cors());
    app.use(express.json());

    const port = parseInt(options.port);
    const delay = parseInt(options.delay) || 0;

    // ── Middleware for request logging ──
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const icon = status >= 200 && status < 300 ? '🟢' : status >= 400 ? '🔴' : '🟠';
        console.log(`${icon} ${req.method} ${req.originalUrl} - ${status} (${duration}ms)`);
      });
      next();
    });

    // ── Simulate network delay ──
    if (delay > 0) {
      app.use((req, res, next) => {
        setTimeout(next, delay);
      });
    }

    // ── Register routes dynamically ──
    const endpoints = config.endpoints || {};
    const routeList = [];

    for (const [key, entry] of Object.entries(endpoints)) {
      let url = key;
      let method = 'get';

      const match = key.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
      if (match) {
        method = match[1].toLowerCase();
        url = match[2];
      }

      // Extract pathname if it's an absolute URL
      let routePath = url;
      try {
        const parsed = new URL(url);
        routePath = parsed.pathname;
      } catch {}

      const responseSchema = entry.response || {};
      const requestSchema = entry.request || {};

      routeList.push(`${method.toUpperCase()} ${routePath}`);

      // Define the route handler
      app[method](routePath, (req, res) => {
        // ── Stateful CRUD: intercept POST/PUT payloads ──
        if (method === 'post' || method === 'put') {
          const payload = req.body;
          // Store in memory (keyed by URL, but could be enhanced)
          const stored = memoryStore.get(routePath) || [];
          const savedEntry = {
            id: faker.string.uuid(),
            ...payload,
            _receivedAt: new Date().toISOString(),
          };
          stored.push(savedEntry);
          memoryStore.set(routePath, stored);
          console.log(`📦 Incoming ${method.toUpperCase()} payload saved for ${routePath}:`);
          console.log(JSON.stringify(payload, null, 2));
          // Respond with success and the saved data
          return res.status(method === 'post' ? 201 : 200).json({
            success: true,
            message: `${method === 'post' ? 'Created' : 'Updated'} successfully`,
            data: savedEntry,
          });
        }

        // ── GET or other methods: return mock data ──
        const mockData = buildMockResponse(responseSchema);
        res.json(mockData);
      });
    }

    // ── Fallback route for undefined endpoints ──
    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: `No mock defined for ${req.method} ${req.originalUrl}`,
      });
    });

    // ── Start server ──
    app.listen(port, () => {
      logger.success(`Mock server running on http://localhost:${port}`);
      if (delay > 0) logger.info(`Simulated delay: ${delay}ms`);
      logger.log('\nActive routes:');
      routeList.forEach(route => console.log(`  ${route}`));
      logger.hint('Use Ctrl+C to stop.');
    });
  });

export default serve;
