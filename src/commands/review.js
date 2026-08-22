import { Command } from 'commander';
import { readConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const review = new Command('review')
  .alias('rv')
  .description('Show provenance and inference details for the contract')
  .action(async () => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || Object.keys(config.endpoints || {}).length === 0) {
      logger.error('No endpoints in contract.');
      process.exit(1);
    }

    console.log(logger.bold('\n🔍 Bazable Contract Review\n'));

    for (const [url, entry] of Object.entries(config.endpoints)) {
      console.log(logger.bold(`\n${url}`));

      // Provenance
      if (entry.provenance && entry.provenance.length > 0) {
        console.log(`  📁 Sources:`);
        for (const p of entry.provenance) {
          console.log(`    - ${p.file}:${p.line}:${p.column}`);
        }
      } else {
        console.log(`  📁 Source: unknown`);
      }

      // Request schema with metadata
      if (entry.request) {
        console.log(`  📥 Request schema:`);
        const meta = entry.request_meta || {};
        for (const [field, type] of Object.entries(entry.request)) {
          const fieldMeta = meta[field] || {};
          const confidence = fieldMeta.confidence || 'unknown';
          const sourceValue = fieldMeta.source_value !== undefined && fieldMeta.source_value !== null
            ? ` (source: ${JSON.stringify(fieldMeta.source_value)})`
            : '';
          const needConfirm = confidence === 'low' || confidence === 'medium' ? ' ⚠️ needs confirmation' : '';
          console.log(`    - ${field}: ${type} [confidence: ${confidence}]${sourceValue}${needConfirm}`);
        }
      } else {
        console.log(`  📥 Request schema: none`);
      }

      // Response schema (if any)
      if (entry.response) {
        console.log(`  📤 Response schema:`);
        for (const [field, type] of Object.entries(entry.response)) {
          console.log(`    - ${field}: ${type}`);
        }
      }
    }

    console.log('');
  });

export default review;
