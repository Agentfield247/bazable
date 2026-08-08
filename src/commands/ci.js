import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const ci = new Command('ci')
  .description('Generate a GitHub Actions workflow to enforce contracts on PRs')
  .option('-t, --token', 'Include a BAZABLE_TOKEN secret reference in the workflow (requires secret set in GitHub)')
  .action(async () => {
    const workflowDir = path.join(process.cwd(), '.github', 'workflows');
    const workflowFile = path.join(workflowDir, 'bazable.yml');

    const content = `name: Bazable Contract Check

on:
  pull_request:
    branches:
      - main

jobs:
  contract-check:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Bazable
        run: npm install -g bazable-api

      - name: Run contract inspection
        run: bazable inspect --ci${options.token ? ' --token ${{ secrets.BAZABLE_TOKEN }}' : ''}
`;

    try {
      await fs.mkdir(workflowDir, { recursive: true });
      await fs.writeFile(workflowFile, content, 'utf-8');
      logger.success('GitHub Actions workflow created at .github/workflows/bazable.yml');
      if (options.token) {
        logger.hint('Add your Bazable token as a secret named BAZABLE_TOKEN in your GitHub repository settings.');
      }
      logger.hint('This workflow will run `bazable inspect` on every pull request to main.');
    } catch (err) {
      logger.error('Failed to generate workflow file: ' + err.message);
      process.exit(1);
    }
  });

export default ci;
