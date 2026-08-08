import { readConfig } from './config.js';

/**
 * Returns the Bazable Cloud API base URL.
 *
 * Priority:
 *   1. cloud.apiBaseUrl from local bazable.config.json (auto‑saved by first push)
 *   2. Default cloud backend (currently hosted on Render)
 *
 * When you get your own domain, replace the string below.
 */
export async function getApiBase() {
  // 1. Check local bazable.config.json (cloud section)
  try {
    const config = await readConfig();
    if (config?.cloud?.apiBaseUrl) {
      return config.cloud.apiBaseUrl;
    }
  } catch {}

  // 2. Production cloud backend – update this when you own a custom domain
  return 'https://bazable-cloud.onrender.com';
}
