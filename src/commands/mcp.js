import { Command } from 'commander';
import { createInterface } from 'readline';
import { spawn } from 'child_process';
import { readConfig } from '../utils/config.js';

// Helper: run a bazable CLI command and return stdout as string
function runBazable(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('bazable', args, { cwd: process.cwd(), shell: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => (stdout += data.toString()));
    child.stderr.on('data', (data) => (stderr += data.toString()));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `Exit code ${code}`));
    });
    child.on('error', reject);
  });
}

// Available tools
const TOOLS = {
  listEndpoints: {
    description: 'List all endpoints in the contract with their methods and statuses.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const config = await readConfig();
      if (!config) return { error: 'No contract found.' };
      const endpoints = Object.entries(config.endpoints || {}).map(([url, entry]) => ({
        url,
        method: entry.method || 'GET',
        status: entry.schema_status || 'unverified',
      }));
      return { endpoints };
    },
  },
  getEndpoint: {
    description: 'Get the request and response schemas for a specific endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'HTTP method (GET, POST, etc.)' },
        url: { type: 'string', description: 'Full endpoint URL' },
      },
      required: ['method', 'url'],
    },
    handler: async (args) => {
      const config = await readConfig();
      const key = `${args.method.toUpperCase()} ${args.url}`;
      const entry = config?.endpoints?.[key] || config?.endpoints?.[args.url];
      if (!entry) return { error: 'Endpoint not found' };
      return {
        request: entry.request || {},
        response: entry.response || {},
        method: entry.method || args.method.toUpperCase(),
        url: args.url,
      };
    },
  },
  inspect: {
    description: 'Run a full contract inspection and return violations in JSON format.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const output = await runBazable(['inspect', '--json', '--ci']);
        const result = JSON.parse(output);
        return result;
      } catch (err) {
        return { error: err.message };
      }
    },
  },
  test: {
    description: 'Run mock tests on all endpoints and return results.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const output = await runBazable(['test', '--json', '--mock', '--all']);
        const result = JSON.parse(output);
        return result;
      } catch (err) {
        return { error: err.message };
      }
    },
  },
};

function startMcpServer() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  rl.on('line', async (line) => {
    try {
      const request = JSON.parse(line);
      if (request.method === 'tools/list') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            tools: Object.entries(TOOLS).map(([name, tool]) => ({
              name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            })),
          },
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      } else if (request.method === 'tools/call') {
        const { name, arguments: args } = request.params;
        const tool = TOOLS[name];
        if (!tool) {
          const response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Tool not found' } };
          process.stdout.write(JSON.stringify(response) + '\n');
          return;
        }
        try {
          const result = await tool.handler(args || {});
          const response = { jsonrpc: '2.0', id: request.id, result };
          process.stdout.write(JSON.stringify(response) + '\n');
        } catch (err) {
          const response = { jsonrpc: '2.0', id: request.id, error: { code: -32000, message: err.message } };
          process.stdout.write(JSON.stringify(response) + '\n');
        }
      } else if (request.method === 'initialize') {
        const response = {
          jsonrpc: '2.0',
          id: request.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'Bazable', version: '1.1.0' },
          },
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      } else {
        const response = { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      const errorResponse = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
      process.stdout.write(JSON.stringify(errorResponse) + '\n');
    }
  });
}

const mcp = new Command('mcp')
  .description('Start a Model Context Protocol server for AI agents')
  .action(() => {
    startMcpServer();
  });

export default mcp;
