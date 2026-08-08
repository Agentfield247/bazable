import chalk from 'chalk';

// -------------------------------------------------------------------
// Presets for common API frameworks (short aliases included)
// -------------------------------------------------------------------
export const PRESETS = {
  'python-requests': {
    pattern: 'requests\\.(?:get|post|put|patch|delete)\\(\\s*["\'`]?(https?://[^"\'`\\s]+)["\'`]?\\s*\\)',
    extensions: ['.py'],
  },
  'php-guzzle': {
    pattern: '\\$client->(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.php'],
  },
  'go-http': {
    pattern: 'http\\.(?:Get|Post|Put|Patch|Delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.go'],
  },
  'ruby-net-http': {
    pattern: 'Net::HTTP\\.(?:get|post|put|patch|delete)\\(URI\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.rb'],
  },
  'node-fetch': {
    pattern: 'fetch\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  'axios': {
    pattern: 'axios\\.(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },

  // Short aliases
  'py': {
    pattern: 'requests\\.(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.py'],
  },
  'php': {
    pattern: '\\$client->(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.php'],
  },
  'go': {
    pattern: 'http\\.(?:Get|Post|Put|Patch|Delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.go'],
  },
  'rb': {
    pattern: 'Net::HTTP\\.(?:get|post|put|patch|delete)\\(URI\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.rb'],
  },
  'js': {
    pattern: 'fetch\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  'ax': {
    pattern: 'axios\\.(?:get|post|put|patch|delete)\\(["\'`](https?://[^"\'` ]+)["\'`]',
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
};

/**
 * Shared helper: resolve pattern, extensions, and ignored dirs from CLI options.
 */
export function resolvePatternAndExtensions(options) {
  let customRegex = null;
  let extensions = options.ext && options.ext.length > 0
    ? options.ext.map(ext => ext.startsWith('.') ? ext : '.' + ext)
    : null;

  if (options.preset) {
    const preset = PRESETS[options.preset];
    if (!preset) {
      console.error(chalk.red(`✖ Unknown preset '${options.preset}'. Available: ${Object.keys(PRESETS).join(', ')}`));
      process.exit(1);
    }
    customRegex = new RegExp(preset.pattern, 'g');
    if (!extensions) extensions = preset.extensions.map(ext => ext.startsWith('.') ? ext : '.' + ext);
  } else if (options.pattern) {
    customRegex = new RegExp(options.pattern, 'g');
  }

  const patterns = extensions && extensions.length > 0
    ? extensions.map(ext => `**/*${ext}`)
    : ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.html'];

  const ignore = ['**/node_modules/**', '**/.next/**'];
  if (options.ignore) {
    options.ignore.forEach(i => ignore.push(i));
  }

  return { customRegex, patterns, ignore };
}
