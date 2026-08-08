import { Command } from 'commander';
import chalk from 'chalk';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { askAI } from '../utils/ai.js';
import inquirer from 'inquirer';

const propose = new Command('propose')
  .description('Propose a contract change using AI')
  .argument('<request>', 'Plain‑English description of the desired change')
  .action(async (requestText) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized.');
      process.exit(1);
    }

    const systemCtx = 'You are an API architect. The user wants to update the Bazable API contract. Return ONLY a valid JSON object describing the proposed changes. The JSON must have this structure: { "endpoint": "METHOD URL", "changes": { "request": { ... }, "response": { ... } } }. Do not include markdown formatting, just the raw JSON.';
    const prompt = `Here is the current contract:\n${JSON.stringify(config, null, 2)}\n\nThe user requests: "${requestText}"\n\nWhat is the exact schema diff needed?`;

    logger.info('AI is drafting a proposal…');
    const rawAnswer = await askAI(prompt, systemCtx);

    // Try to parse the AI output as JSON
    let proposal;
    try {
      proposal = JSON.parse(rawAnswer.trim());
    } catch (e) {
      console.log(chalk.hex('#FFE600')(rawAnswer));
      logger.warn('AI did not return a valid JSON diff. The raw suggestion is shown above.');
      return;
    }

    console.log(chalk.hex('#FFE600')('\nProposed schema change:'));
    console.log(chalk.hex('#FFB703')(JSON.stringify(proposal, null, 2)));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Send this proposal to the backend team?',
        default: false,
      },
    ]);

    if (confirm) {
      if (!config.pending_proposals) config.pending_proposals = [];
      config.pending_proposals.push({
        id: Date.now().toString(),
        request: requestText,
        proposedChange: proposal,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      await writeConfig(config);
      logger.success('Proposal saved and will be pushed to the cloud on next `bazable push`.');
    } else {
      logger.info('Proposal discarded.');
    }
  });

export default propose;
