import { Command } from 'commander';
import { existsSync, writeFileSync, chmodSync } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

const hook = new Command('hook')
  .description('Install a pre-push git hook that runs "bazable inspect" automatically')
  .action(() => {
    const gitDir = path.resolve(process.cwd(), '.git');
    if (!existsSync(gitDir)) {
      logger.error('Not a git repository. Please initialize git first.');
      process.exit(1);
    }

    const hookDir = path.resolve(gitDir, 'hooks');
    const hookPath = path.resolve(hookDir, 'pre-push');

    const hookScript = `#!/bin/sh
if [ "$BAZABLE_SKIP" = "1" ]; then
  echo "⏭ Bazable contract check skipped (BAZABLE_SKIP=1)."
  exit 0
fi

echo "⟳ Running Bazable Contract Check..."
npx bazable inspect
if [ $? -ne 0 ]; then
  echo "🚨 Push aborted: Bazable contract violations found."
  exit 1
fi
`;

    try {
      writeFileSync(hookPath, hookScript, { mode: 0o755 });
      chmodSync(hookPath, 0o755);
      logger.success("Bazable Git hook installed! 'bazable inspect' will now run automatically before every git push.");
    } catch (error) {
      logger.error(`Failed to install git hook: ${error.message}`);
      process.exit(1);
    }
  });

export default hook;
