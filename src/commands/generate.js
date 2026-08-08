import { Command } from 'commander';
import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { generateExpress } from '../generators/express.js';
import { generateHono } from '../generators/hono.js';
import { generateFunctionName } from '../utils/schema.js';

const FRAMEWORKS = {
  express: { name: 'Express.js', generator: generateExpress, extension: '.js' },
  hono: { name: 'Hono', generator: generateHono, extension: '.ts' },
};

const generate = new Command('generate')
  .alias('gen')
  .description('Generate backend code or UI components from the Bazable contract');

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
// NEW Subcommand: ui (React + Tailwind form)
// --------------------------------------------------
generate
  .command('ui')
  .description('Generate a React + Tailwind form component from an endpoint schema')
  .argument('<method>', 'HTTP method (GET, POST, PUT, PATCH, DELETE)')
  .argument('<url>', 'Full endpoint URL')
  .option('-o, --output <dir>', 'Output directory', './generated-ui')
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
    // Build a safe filename
    const componentName = url
      .replace(/^https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    let code = `// Auto-generated by Bazable – React + Tailwind UI Form\n`;
    code += `// Endpoint: ${method.toUpperCase()} ${url}\n\n`;
    code += `import { useState } from 'react';\n`;
    code += `import { ${clientFuncName} } from '${clientPath}';\n\n`;
    code += `export default function ${componentName}Form() {\n`;
    code += `  const [formData, setFormData] = useState({\n`;
    for (const [field, type] of Object.entries(requestSchema)) {
      const defaultValue = type === 'number' ? '0' : type === 'boolean' ? 'false' : `''`;
      code += `    ${field}: ${defaultValue},\n`;
    }
    code += `  });\n\n`;

    code += `  const handleChange = (e) => {\n`;
    code += `    const { name, value, type, checked } = e.target;\n`;
    code += `    setFormData(prev => ({\n`;
    code += `      ...prev,\n`;
    code += `      [name]: type === 'checkbox' ? checked : value,\n`;
    code += `    }));\n`;
    code += `  };\n\n`;

    const clientFuncName = generateFunctionName(url);
    const clientPath = options.clientPath || './bazableClient';

    code += `  const handleSubmit = async (e) => {\n`;
    code += `    e.preventDefault();\n`;
    code += `    try {\n`;
    code += `      const response = await ${clientFuncName}(formData);\n`;
    code += `      console.log('Success:', response);\n`;
    code += `      // Optionally show a success message or redirect\n`;
    code += `    } catch (error) {\n`;
    code += `      console.error('Submission failed:', error);\n`;
    code += `    }\n`;
    code += `  };\n\n`;

    code += `  return (\n`;
    code += `    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto mt-10">\n`;

    for (const [field, type] of Object.entries(requestSchema)) {
      if (type === 'boolean') {
        code += `      <label className="flex items-center gap-2 cursor-pointer">\n`;
        code += `        <input\n`;
        code += `          type="checkbox"\n`;
        code += `          name="${field}"\n`;
        code += `          checked={formData.${field}}\n`;
        code += `          onChange={handleChange}\n`;
        code += `          className="rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"\n`;
        code += `        />\n`;
        code += `        <span className="text-zinc-300 text-sm font-medium">${field}</span>\n`;
        code += `      </label>\n`;
      } else {
        code += `      <div>\n`;
        code += `        <label className="block text-xs font-medium text-zinc-400 mb-1">${field}</label>\n`;
        code += `        <input\n`;
        code += `          type="${type === 'number' ? 'number' : 'text'}"\n`;
        code += `          name="${field}"\n`;
        code += `          value={formData.${field}}\n`;
        code += `          onChange={handleChange}\n`;
        code += `          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"\n`;
        code += `        />\n`;
        code += `      </div>\n`;
      }
    }

    code += `      <button\n`;
    code += `        type="submit"\n`;
    code += `        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"\n`;
    code += `      >\n`;
    code += `        Submit\n`;
    code += `      </button>\n`;
    code += `    </form>\n`;
    code += `  );\n`;
    code += `}\n`;

    const outDir = path.resolve(process.cwd(), options.output);
    await fs.mkdir(outDir, { recursive: true });
    const filePath = path.join(outDir, `${componentName}Form.tsx`);
    await fs.writeFile(filePath, code, 'utf-8');

    logger.success(`Generated React UI Component: ${filePath}`);
  });

export default generate;
