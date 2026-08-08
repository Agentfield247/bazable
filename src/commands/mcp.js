import { Command } from 'commander';
import { createInterface } from 'readline';
import { readConfig } from '../utils/config.js';

// Available tools
const TOOLS = {
  listEndpoints: {
    description: 'List all endpoints in the contract with their methods and statuses.',
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
    handler: async (args) => {
      const config = await readConfig();
      const key = `${args.method.toUpperCase()} ${args.url}`;
      const entry = config?.endpoints?.[key] || config?.endpoints?.[args.url];
      if (!entry) return { error: 'Endpoint not found' };
      return {
        request: entry.request || {},
        response: entry.response || {},
      };
    },
  },
  inspect: {
    description: 'Run a contract inspection and return violations. (Simplified – returns a placeholder)',
    handler: async () => {
      // In production, you'd import and call the real inspect logic
      return { message: 'Full inspection not yet available via MCP. Use `bazable inspect` CLI command.' };
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
              inputSchema: { type: 'object', properties: {} },
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
