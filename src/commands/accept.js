import { Command } from 'commander';
import { readConfig, writeConfig, validateProjectContext } from '../utils/config.js';
import { logger } from '../utils/logger.js';

const accept = new Command('accept')
  .description('Accept a pending AI proposal and apply the changes to the contract')
  .argument('<proposalId>', 'ID of the proposal to accept')
  .action(async (proposalId) => {
    await validateProjectContext();

    const config = await readConfig();
    if (!config || !config.pending_proposals || config.pending_proposals.length === 0) {
      logger.error('No pending proposals found.');
      process.exit(1);
    }

    const proposal = config.pending_proposals.find(p => p.id === proposalId);
    if (!proposal) {
      logger.error(`Proposal with ID ${proposalId} not found.`);
      process.exit(1);
    }

    if (proposal.status !== 'pending') {
      logger.warn(`Proposal ${proposalId} is already ${proposal.status}.`);
      return;
    }

    // Apply the proposed schema changes
    try {
      const change = proposal.proposedChange;
      if (!change || !change.endpoint) {
        logger.error('Proposal does not contain valid endpoint change data.');
        process.exit(1);
      }

      const endpointKey = change.endpoint;
      if (!config.endpoints[endpointKey]) {
        config.endpoints[endpointKey] = {};
      }
      const entry = config.endpoints[endpointKey];

      // Merge request schema
      if (change.changes && change.changes.request) {
        entry.request = { ...(entry.request || {}), ...change.changes.request };
      }
      // Merge response schema
      if (change.changes && change.changes.response) {
        entry.response = { ...(entry.response || {}), ...change.changes.response };
      }

      // Mark proposal as accepted
      proposal.status = 'accepted';
      proposal.accepted_at = new Date().toISOString();

      await writeConfig(config);
      logger.success(`Proposal ${proposalId} accepted and applied.`);
      logger.info(`Updated endpoint: ${endpointKey}`);
    } catch (err) {
      logger.error('Failed to apply proposal: ' + err.message);
      process.exit(1);
    }
  });

export default accept;
