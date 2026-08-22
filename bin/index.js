#!/usr/bin/env node

import { readFileSync } from 'fs';
import { Command } from 'commander';
import chalk from 'chalk';
import initCommand from '../src/commands/init.js';
import addCommand from '../src/commands/add.js';
import inspectCommand from '../src/commands/inspect.js';
import extractCommand from '../src/commands/extract.js';
import testCommand from '../src/commands/test.js';
import diffCommand from '../src/commands/diff.js';
import typesCommand from '../src/commands/types.js';
import clientCommand from '../src/commands/client.js';
import configCommand from '../src/commands/config-cmd.js';
import hookCommand from '../src/commands/hook.js';
import importCommand from '../src/commands/import.js';
import loginCommand from '../src/commands/login.js';
import logoutCommand from '../src/commands/logout.js';
import errorsCommand from '../src/commands/errors.js';
import generateCommand from '../src/commands/generate.js';
import serveCommand from '../src/commands/serve.js';
import uiCommand from '../src/commands/ui.js';
import docsCommand from '../src/commands/docs.js';
import exportCommand from '../src/commands/export.js';
import syncCommand from '../src/commands/sync.js';
import watchCommand from '../src/commands/watch.js';
import pushCommand from '../src/commands/push.js';
import mcpCommand from '../src/commands/mcp.js';
import ciCommand from '../src/commands/ci.js';
import explainCommand from '../src/commands/explain.js';
import proposeCommand from '../src/commands/propose.js';
import acceptCommand from '../src/commands/accept.js';
import curlCommand from '../src/commands/curl.js';
import lspCommand from '../src/commands/lsp.js';
import reviewCommand from '../src/commands/review.js';

// Read the package version once – available everywhere
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));

// -------------------------------------------------------------------
// Branded banner
// -------------------------------------------------------------------
function showBanner() {
  console.log('');
  console.log(chalk.hex('#FF5A1F').bold('  ▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄'));
  console.log(chalk.hex('#FF5A1F').bold('  ██▀▀▀▀█▌ ██▀▀▀▀█▌ ██▀▀▀▀█▌ ██▀▀▀▀█▌ ██▀▀▀▀█▌ ██▀▀▀▀█▌'));
  console.log(chalk.hex('#FFB703').bold('  ██    █▌ ██    █▌ ██    █▌ ██    █▌ ██    █▌ ██    █▌'));
  console.log(chalk.hex('#FFB703').bold('  ▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀  ▀▀▀▀▀▀▀'));
  console.log('');
  console.log(chalk.hex('#FF5A1F').bold('  Bazable CLI ') + chalk.hex('#FFB703')('»') + chalk.gray('  Git‑native API contract management'));
  console.log(chalk.gray(`  Version ${pkg.version}  |  https://bazable.mintlify.app`));
  console.log('');
}

const program = new Command();

program
  .name('bazable')
  .description('Git-native API contract management')
  .version('1');

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(inspectCommand);
program.addCommand(extractCommand);
program.addCommand(testCommand);
program.addCommand(diffCommand);
program.addCommand(typesCommand);
program.addCommand(clientCommand);
program.addCommand(configCommand);
program.addCommand(importCommand);
program.addCommand(hookCommand);
program.addCommand(generateCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(errorsCommand);
program.addCommand(serveCommand);
program.addCommand(uiCommand);
program.addCommand(docsCommand);
program.addCommand(exportCommand);
program.addCommand(syncCommand);
program.addCommand(watchCommand);
program.addCommand(pushCommand);
program.addCommand(mcpCommand);
program.addCommand(ciCommand);
program.addCommand(explainCommand);
program.addCommand(proposeCommand);
program.addCommand(acceptCommand);
program.addCommand(curlCommand);
program.addCommand(lspCommand);
program.addCommand(reviewCommand);

// Show banner only when no subcommand (except help/version)
const args = process.argv.slice(2).filter(a => a !== '--help' && a !== '-h');
if (args.length === 0) {
  showBanner();
  console.log(chalk.gray('  Run ') + chalk.hex('#FF5A1F')('bazable --help') + chalk.gray(' to see all commands.\n'));
}

program.parse(process.argv);
