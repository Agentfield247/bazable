import { Command } from 'commander';
import chalk from 'chalk';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { askAI } from '../utils/ai.js';

const explain = new Command('explain')
  .description('Explain an API endpoint in plain English')
  .argument('<method>', 'HTTP method')
  .argument('<url>', 'Endpoint URL')
  .action(async (method, url) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized.');
      process.exit(1);
    }

    const contractKey = `${method.toUpperCase()} ${url}`;
    const entry = config.endpoints[contractKey] || config.endpoints[url];
    if (!entry) {
      logger.error('Endpoint not found in contract.');
      process.exit(1);
    }

    const requestSchema = entry.request || {};
    const responseSchema = entry.response || {};

    const prompt = `Explain this API endpoint to a frontend developer:\nMethod: ${method.toUpperCase()}\nURL: ${url}\nRequest schema: ${JSON.stringify(requestSchema)}\nResponse schema: ${JSON.stringify(responseSchema)}\n\nWhat does it do? What data must be sent? What will be returned? Mention any edge cases.`;

    logger.info('Asking AI to explain the endpoint…');
    const answer = await askAI(prompt, 'You are a senior backend engineer explaining an API to a junior frontend developer. Keep it concise and actionable.');

    console.log(chalk.hex('#FFB703')(`\n--- Explanation for ${method.toUpperCase()} ${url} ---\n`));
    console.log(chalk.hex('#6B7280')(answer));
  });

export default explain;
