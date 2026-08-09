import { Command } from 'commander';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { generateExpress } from '../generators/express.js';
import { generateHono } from '../generators/hono.js';
import { generateHtmlForm } from '../generators/html-form.js';
import { askAI } from '../utils/ai.js';
import { generateContextFiles } from '../generators/context.js';

const FRAMEWORKS = {
  express: { name: 'Express.js', generator: generateExpress, extension: '.js' },
  hono: { name: 'Hono', generator: generateHono, extension: '.ts' },
};

const generate = new Command('generate')
  .alias('gen')
  .description('Generate backend code, UI components, or AI agent context from the Bazable contract');

// --------------------------------------------------
// Subcommand: backend (unchanged)
// --------------------------------------------------
generate
  .command('backend')
  .description('Generate API router and controller stubs')
  .option('-f, --framework <name>', 'Target framework (express, hono)')
  .option('-o, --output <dir>', 'Output directory', './generated-api')
  .option('-v, --no-validation', 'Skip payload validation schemas')
  .option('--client-path <path>', 'Import path for the generated bazableClient', './bazableClient')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in the contract. Run "bazable extract" first.');
      process.exit(1);
    }

    // ── Interactive prompts if flags are missing ──
    let framework = options.framework;
    if (!framework) {
      const answers = await inquirer.prompt([
        {
          type: 'select',
          name: 'framework',
          message: 'Select your backend framework:',
          choices: Object.entries(FRAMEWORKS).map(([key, fw]) => ({
            name: fw.name,
            value: key,
          })),
        },
      ]);
      framework = answers.framework;
    }

    if (!FRAMEWORKS[framework]) {
      logger.error(`Unknown framework '${framework}'. Supported: ${Object.keys(FRAMEWORKS).join(', ')}`);
      process.exit(1);
    }

    let outputDir = options.output;
    if (!outputDir || outputDir === './generated-api') {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'output',
          message: 'Output directory:',
          default: './generated-api',
        },
      ]);
      outputDir = answers.output;
    }

    const validation = options.validation !== false;
    if (validation === undefined) {
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'validation',
          message: 'Include payload validation schemas?',
          default: true,
        },
      ]);
    }

    // ── Generate code ──
    const fw = FRAMEWORKS[framework];
    const code = fw.generator(config.endpoints, { validation });

    // ── Write file safely ──
    const outPath = path.resolve(process.cwd(), outputDir);
    await fs.mkdir(outPath, { recursive: true });

    const fileName = `router${fw.extension}`;
    const filePath = path.join(outPath, fileName);

    try {
      await fs.access(filePath, constants.F_OK);
      const answers = await inquirer.prompt([
        {
          type: 'select',
          name: 'action',
          message: `File ${fileName} already exists. What should we do?`,
          choices: [
            { name: 'Overwrite', value: 'overwrite' },
            { name: 'Skip (do nothing)', value: 'skip' },
            { name: 'Backup (rename old file)', value: 'backup' },
          ],
        },
      ]);

      if (answers.action === 'skip') {
        logger.warn('File skipped.');
        return;
      }
      if (answers.action === 'backup') {
        const backupPath = filePath + '.bak';
        await fs.copyFile(filePath, backupPath);
        logger.success(`Backup saved to ${backupPath}`);
      }
    } catch {
      // File doesn't exist – safe to create
    }

    await fs.writeFile(filePath, code, 'utf-8');
    logger.success(`Generated router → ${filePath}`);

    // ── Next Steps guide ──
    console.log(`\n${logger.bold('Next Steps')}`);
    console.log('──────────────────────────────');
    if (framework === 'express') {
      console.log('1. Install dependencies:');
      console.log('   npm install express');
      if (validation) console.log('   npm install zod');
      console.log('');
      console.log('2. Create your server file (e.g., index.js):');
      console.log('   import express from \'express\';');
      console.log(`   import router from './${path.relative(process.cwd(), filePath).replace(/\\/g, '/')}';`);
      console.log('   const app = express();');
      console.log('   app.use(express.json());');
      console.log('   app.use(\'/api\', router);');
      console.log('   app.listen(3000, () => console.log(\'Server running on port 3000\'));');
    } else if (framework === 'hono') {
      console.log('1. Install dependencies:');
      console.log('   npm install hono');
      if (validation) console.log('   npm install zod @hono/zod-validator');
      console.log('');
      console.log('2. Create your entry file (e.g., index.ts):');
      console.log(`   import app from './${path.relative(process.cwd(), filePath).replace(/\\/g, '/')}';`);
      console.log('   export default app;');
      console.log('3. Run:');
      console.log('   npx tsx index.ts');
    }
  });

// --------------------------------------------------
// Subcommand: ui (contract‑to‑form generator – upgraded)
// --------------------------------------------------
generate
  .command('ui')
  .description('Generate a form component from an endpoint schema')
  .argument('<method>', 'HTTP method (GET, POST, PUT, PATCH, DELETE)')
  .argument('<url>', 'Full endpoint URL')
  .option('-o, --output <dir>', 'Output directory', './generated-ui')
  .option('--framework <name>', 'Target framework (html, react-tailwind)', 'html')
  .option('--ai', 'Use AI to generate the UI')
  .action(async (method, url, options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized.');
      process.exit(1);
    }

    const contractKey = `${method.toUpperCase()} ${url}`;
    const entry = config.endpoints[contractKey] || config.endpoints[url];
    if (!entry || !entry.request) {
      logger.error('No request schema found for this endpoint. Run `bazable extract -r` first.');
      process.exit(1);
    }

    const requestSchema = entry.request;

    // ── AI mode ──
    if (options.ai) {
      const apiKey = config?.aiApiKey;
      if (!apiKey) {
        logger.warn('No AI key configured (or offline). Falling back to zero‑dependency Vanilla HTML generator.');
      } else {
        const framework = options.framework || 'html';
        const prompt = `Generate a production-ready ${framework} form for this endpoint:\nMethod: ${method.toUpperCase()}\nURL: ${url}\nRequest schema: ${JSON.stringify(requestSchema)}\n\nReturn ONLY the code. No explanations.`;
        try {
          const code = await askAI(prompt, 'You are a senior frontend engineer.');
          const outDir = path.resolve(process.cwd(), options.output);
          await fs.mkdir(outDir, { recursive: true });
          const ext = framework === 'react-tailwind' ? '.tsx' : '.html';
          const fileName = (url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')) + ext;
          const filePath = path.join(outDir, fileName);
          await fs.writeFile(filePath, code, 'utf-8');
          logger.success(`Generated ${framework} component: ${filePath}`);
          return;
        } catch (err) {
          logger.warn('AI generation failed. Falling back to zero‑dependency Vanilla HTML generator.');
        }
      }
    }

    // ── Default (or fallback) HTML generator ──
    const code = generateHtmlForm(method, url, requestSchema);
    const outDir = path.resolve(process.cwd(), options.output);
    await fs.mkdir(outDir, { recursive: true });
    const ext = options.framework === 'react-tailwind' ? '.tsx' : '.html';
    const fileName = (url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')) + ext;
    const filePath = path.join(outDir, fileName);
    await fs.writeFile(filePath, code, 'utf-8');
    logger.success(`Generated Vanilla HTML form: ${filePath}`);
  });

// --------------------------------------------------
// Subcommand: context (AI agent context files)
// --------------------------------------------------
generate
  .command('context')
  .description('Generate AI agent context files (Cursor, Cline, MCP)')
  .option('-o, --output <dir>', 'Output directory (project root by default)', './')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized.');
      process.exit(1);
    }

    const outDir = path.resolve(process.cwd(), options.output);
    await fs.mkdir(outDir, { recursive: true });

    const files = await generateContextFiles(outDir);
    files.forEach(f => logger.success(`Generated ${f}`));
  });

export default generate;
