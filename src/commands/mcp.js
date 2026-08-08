import { Command } from 'commander';
import { logger } from '../utils/logger.js';

const mcp = new Command('mcp')
  .description('Start a Model Context Protocol server (coming soon)')
  .action(() => {
    logger.info('MCP server is under development. Stay tuned!');
  });

export default mcp;
