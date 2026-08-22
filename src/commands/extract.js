import { Command } from 'commander';
import fs from 'fs/promises';
import fastGlob from 'fast-glob';
import { readConfig, writeConfig, getPackageProjectName, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';
import { resolvePatternAndExtensions } from '../parsers/presets.js';
import { extractApiUrlsFromFile, inferRequestSchemasFromFile } from '../parsers/ast.js';
import { detectBaseUrl, resolveUrl } from '../utils/url.js';

const extract = new Command('extract')
  .alias('ext')
  .alias('e')
  .description('Auto-discover all API calls and register them as unverified endpoints')
  .option('--pattern <regex>')
  .option('--ext <extensions...>', '', [])
  .option('-s, --preset <name>')
  .option('--ignore <patterns...>', '', [])
  .option('--wrapper <names...>', '', ['fetchAPI'])
  .option('-r, --infer-requests, --payloads', 'Also infer request schemas from payload literals')
  .action(async (options) => {
    await validateProjectContext();

    let config = await readConfig();
    if (!config) {
      const projectName = await getPackageProjectName();
      config = { version: '1.0', projectName, endpoints: {} };
      await writeConfig(config);
    }

    // Ensure baseUrls array exists (for multi‑API support)
    if (!config.baseUrls) config.baseUrls = [];

    logger.info('Scanning project for API calls...');
    const { customRegex, patterns, ignore } = resolvePatternAndExtensions(options);
    if (options.preset) logger.info(`Using preset: ${options.preset}`);

    const files = await fastGlob(patterns, { ignore, absolute: true, cwd: process.cwd() });
    if (files.length === 0) {
      logger.warn('No matching files found.');
      return;
    }

    const extractedUrls = new Set();
    let globalBaseUrl = config.baseUrl || null;
    const wrappers = options.wrapper || ['fetchAPI'];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf-8');

      if (customRegex) {
        let match;
        while ((match = customRegex.exec(content)) !== null) {
          let url = match[1];
          if (url) {
            url = url
              .replace(/^["'`\s]+|["'`\s]+$/g, '')
              .replace(/\)\s*$/, '')
              .trim();
            if (url.startsWith('http')) extractedUrls.add(url);
          }
        }
        const detected = detectBaseUrl(content);
        if (detected) {
          if (!globalBaseUrl) globalBaseUrl = detected;
          // Collect unique base URLs across all files
          if (!config.baseUrls.includes(detected)) config.baseUrls.push(detected);
        }
      } else {
        const result = extractApiUrlsFromFile(content, filePath, wrappers);
        // Collect base URLs found in this file
        if (result.baseUrl) {
          if (!globalBaseUrl) {
            globalBaseUrl = result.baseUrl;
            config.baseUrl = globalBaseUrl;
          }
          if (!config.baseUrls.includes(result.baseUrl)) config.baseUrls.push(result.baseUrl);
        }
        // Also collect any extra base URLs returned by the parser (if we added `baseUrls` to the result)
        if (result.baseUrls && result.baseUrls.length > 0) {
          for (const bu of result.baseUrls) {
            if (!config.baseUrls.includes(bu)) config.baseUrls.push(bu);
          }
        }
        for (const rawUrl of result.urls) {
          const fullUrl = resolveUrl(rawUrl, globalBaseUrl);
          extractedUrls.add(fullUrl);
        }

        // Collect provenance (occurrences) for this file
        const provenanceByUrl = {};
        for (const occ of result.occurrences || []) {
          const fullUrl = resolveUrl(occ.url, globalBaseUrl);
          if (!provenanceByUrl[fullUrl]) provenanceByUrl[fullUrl] = [];
          provenanceByUrl[fullUrl].push({
            file: occ.file,
            line: occ.line,
            column: occ.column,
          });
        }

        // Store provenance on endpoint (merge with existing)
        for (const [fullUrl, locations] of Object.entries(provenanceByUrl)) {
          if (!config.endpoints[fullUrl]) {
            config.endpoints[fullUrl] = { schema_status: 'unverified', provenance: [] };
          }
          if (!config.endpoints[fullUrl].provenance) config.endpoints[fullUrl].provenance = [];
          for (const loc of locations) {
            // avoid duplicates
            const exists = config.endpoints[fullUrl].provenance.some(
              p => p.file === loc.file && p.line === loc.line && p.column === loc.column
            );
            if (!exists) config.endpoints[fullUrl].provenance.push(loc);
          }
        }

        // Infer request schemas + metadata if requested
        if (options.inferRequests) {
          const existingUrls = Object.keys(config.endpoints || {});
          const requestInfos = inferRequestSchemasFromFile(content, filePath, config, existingUrls);
          for (const [fullUrl, info] of Object.entries(requestInfos)) {
            if (!config.endpoints[fullUrl]) config.endpoints[fullUrl] = {};
            config.endpoints[fullUrl].request = info.schema;
            config.endpoints[fullUrl].request_meta = info.meta;
          }
        }

        continue;
      }
    }

    // Resolve relative URLs for custom regex
    if (customRegex && globalBaseUrl) {
      for (const rawUrl of extractedUrls) {
        const fullUrl = resolveUrl(rawUrl, globalBaseUrl);
        extractedUrls.add(fullUrl);
        if (rawUrl !== fullUrl) extractedUrls.delete(rawUrl);
      }
    }

    // Save the primary base URL and ensure it's in baseUrls
    if (globalBaseUrl) {
      if (!config.baseUrl) config.baseUrl = globalBaseUrl;
      if (!config.baseUrls.includes(globalBaseUrl)) config.baseUrls.push(globalBaseUrl);
    }

    // Fail‑safe: if no URLs were extracted but we have a base URL, add it as an endpoint
    if (extractedUrls.size === 0 && globalBaseUrl) {
      extractedUrls.add(globalBaseUrl);
      logger.info('No explicit API calls found; registered the base URL as an endpoint.');
    }

    if (extractedUrls.size === 0) {
      logger.warn('No API calls found in the codebase.');
      return;
    }

    let addedCount = 0;
    for (const url of extractedUrls) {
      if (!config.endpoints[url]) {
        config.endpoints[url] = { schema_status: 'unverified_extracted_manually' };
        addedCount++;
      }
    }

    // Sanitize baseUrls: remove trailing quotes, slashes, and anything that is actually an endpoint
    if (config.baseUrls) {
      config.baseUrls = config.baseUrls
        .map(bu => bu.replace(/["'`\\]/g, '').replace(/\/+$/, ''))   // remove stray quotes & trailing slashes
        .filter(bu => bu.startsWith('http') && !config.endpoints[bu]); // remove any that are endpoints
      // Remove duplicates
      config.baseUrls = [...new Set(config.baseUrls)];
    }

    await writeConfig(config);
    logger.success(`Extraction complete! Found and added ${addedCount} undocumented endpoint(s).`);
    if (addedCount === 0) {
      logger.log('All discovered endpoints were already in the contract.');
    }
    if (globalBaseUrl) {
      logger.info(`Primary base URL: ${globalBaseUrl}`);
      if (config.baseUrls.length > 1) {
        logger.info(`Additional base URLs found: ${config.baseUrls.filter(b => b !== globalBaseUrl).join(', ')}`);
      }
    }
  });

export default extract;
