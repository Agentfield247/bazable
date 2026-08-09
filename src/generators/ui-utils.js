/**
 * Convert a key to a human‑readable label.
 * e.g. settlement_id → Settlement ID
 */
export function formatLabel(key) {
  return key
    .replace(/[_\-\s]+/g, ' ')            // replace underscores/dashes with space
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase splitting
    .replace(/\b\w/g, c => c.toUpperCase()) // capitalise each word
    .trim();
}
