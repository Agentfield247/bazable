import { Command } from 'commander';
import fs from 'fs/promises';
import path from 'path';
import fastGlob from 'fast-glob';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { resolvePatternAndExtensions } from '../parsers/presets.js';
import { extractApiUrlsFromFile, inspectFileAdvanced, applyPayloadFixes } from '../parsers/ast.js';
import { resolveUrl } from '../utils/url.js';

const inspect = new Command('inspect')
  .alias('i')
  .alias('check')
  .description('Scan codebase for API calls, validate payloads, and detect over‑fetching')
  .option('--pattern <regex>')
  .option('--ext <extensions...>', '', [])
  .option('--preset <name>')
  .option('--ignore <patterns...>', '', [])
  .option('--wrapper <names...>', '', ['fetchAPI'])
  .option('-f, --fix', 'Auto-correct payload type mismatches')
  .option('--json', 'Output results as JSON (for AI/CI pipelines)')
  .option('--ci', 'Disable spinners and interactive prompts')
  .action(async (options) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config) {
      logger.error('Project not initialized.');
      logger.hint("Run 'bazable init' first.");
      process.exit(1);
    }

    const contractedUrls = Object.keys(config.endpoints || {});
    if (contractedUrls.length === 0) {
      logger.warn('No endpoints in contract. Use "bazable add <url>" to add some.');
    }

    if (options.ci) logger.startSpinner = () => {};

    logger.info('Scanning source files for API calls...');
    const { customRegex, patterns, ignore } = resolvePatternAndExtensions(options);
    if (options.preset) logger.info(`Using preset: ${options.preset}`);

    const files = await fastGlob(patterns, { ignore, absolute: true, cwd: process.cwd() });
    if (files.length === 0) {
      logger.warn('No matching files found.');
      return;
    }

    const baseUrl = config.baseUrl || '';
    const baseUrls = config.baseUrls || [];    // multi‑base support
    let totalViolations = 0;
    if (!baseUrl) {
      logger.warn('No base URL configured. Relative API paths may not match absolute contract URLs.');
      logger.hint('Consider adding a baseUrl to bazable.config.json or using --base-url in extract.');
    }
    const wrappers = options.wrapper || ['fetchAPI'];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');

      // URL existence check
      let apiUrls = [];
      if (customRegex) {
        let match;
        while ((match = customRegex.exec(content)) !== null) {
          const url = match[1];
          if (url) apiUrls.push(url);
        }
      } else {
        const result = extractApiUrlsFromFile(content, filePath, wrappers);
        apiUrls = result.urls;
      }

      for (const rawUrl of apiUrls) {
        // 1. Resolve against primary base URL
        let resolvedUrl = resolveUrl(rawUrl, baseUrl, baseUrls);

        // 2. Check if it matches any contracted URL (including method‑prefixed entries)
        let matched = contractedUrls.some(contractedUrl => {
          if (contractedUrl === resolvedUrl || contractedUrl === rawUrl) return true;
          const match = contractedUrl.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
          if (match) {
            const plainUrl = match[2];
            if (plainUrl === resolvedUrl || plainUrl === rawUrl) return true;
          }
          return false;
        });

        // 3. If not matched and we have alternate base URLs, try each one
        if (!matched && baseUrls.length > 0 && !rawUrl.startsWith('http')) {
          for (const altBase of baseUrls) {
            if (altBase === baseUrl) continue;
            const altResolved = resolveUrl(rawUrl, altBase);
            if (contractedUrls.includes(altResolved)) {
              // Provide a hint instead of a violation – the URL exists, just under a different base
              const relativePath = path.relative(process.cwd(), filePath);
              logger.warn(`[${relativePath}] ${rawUrl} → matches secondary base URL (${altBase}).`);
              logger.hint(`Consider setting this as your primary baseUrl or updating the contract.`);
              matched = true;
              break;
            }
            // Also check method‑prefixed keys against alt resolved
            const prefixMatched = contractedUrls.some(contractedUrl => {
              const match = contractedUrl.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
              return match ? match[2] === altResolved : false;
            });
            if (prefixMatched) {
              matched = true;
              break;
            }
          }
        }

        // 4. If still not matched, it's a true dead URL
        if (!matched) {
          totalViolations++;
          const relativePath = path.relative(process.cwd(), filePath);
          logger.log(`🚨 [${relativePath}] - Dead/Uncontracted API call found: ${resolvedUrl}`);
        }
      }

      // Advanced checks (payload & over‑fetching) – unchanged
      const advancedMessages = inspectFileAdvanced(content, filePath, config, contractedUrls, wrappers);
      advancedMessages.forEach(msg => {
        console.log(msg);
        if (msg.includes('::TYPE_MISMATCH::')) totalViolations++;
      });

      // Auto‑fix – unchanged
      const hadTypeMismatch = advancedMessages.some(m => m.includes('Type Mismatch'));
      if (options.fix && hadTypeMismatch) {
        logger.info(`Applying fixes to ${path.relative(process.cwd(), filePath)}...`);
        let fixedContent = applyPayloadFixes(content, filePath, config, contractedUrls);
        if (fixedContent !== content) {
          await fs.writeFile(filePath, fixedContent, 'utf-8');
          logger.success(`Fixed ${filePath}`);
        } else {
          logger.log('No changes needed.');
        }
      }
    }

    if (options.json) {
      const result = {
        success: totalViolations === 0,
        totalViolations,
        violations: [],  // you can populate this later with details
      };
      console.log(JSON.stringify(result));
      process.exit(totalViolations > 0 ? 1 : 0);
    }

    if (totalViolations === 0) {
      logger.success('All API calls match the Bazable contract!');
    } else {
      logger.error(`${totalViolations} violation(s) found.`);
      process.exit(1);
    }
  });

export default inspect;
