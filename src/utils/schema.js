/**
 * Schema helpers: inference, diff, TypeScript mapping
 */

export function inferSchema(data) {
  if (data === null || typeof data !== 'object') {
    return {};
  }
  const schema = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null) {
      schema[key] = 'null';
    } else if (Array.isArray(value)) {
      schema[key] = 'array';
    } else {
      schema[key] = typeof value;
    }
  }
  return schema;
}

export function computeSchemaDiff(oldSchema, newSchema) {
  const oldKeys = Object.keys(oldSchema || {});
  const newKeys = Object.keys(newSchema || {});
  const allKeys = new Set([...oldKeys, ...newKeys]);
  const changes = [];
  let hasBreaking = false;

  for (const key of allKeys) {
    const inOld = oldKeys.includes(key);
    const inNew = newKeys.includes(key);
    if (!inOld && inNew) {
      changes.push({ key, type: 'added' });
    } else if (inOld && !inNew) {
      changes.push({ key, type: 'removed' });
      hasBreaking = true;
    } else if (oldSchema[key] !== newSchema[key]) {
      changes.push({ key, type: 'changed', from: oldSchema[key], to: newSchema[key] });
      hasBreaking = true;
    }
  }

  return {
    hasChanges: changes.length > 0,
    hasBreaking,
    changes,
  };
}

/* TypeScript generation helpers */
export function mapToTsType(bazType) {
  switch (bazType) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'null': return 'null';
    case 'array': return 'any[]';
    case 'object': return 'Record<string, any>';
    default: return 'any';
  }
}

export function sanitizePropertyName(key) {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key;
  return `"${key}"`;
}

export function generateInterfaceName(url, prefix = '') {
  const parsed = new URL(url);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return (prefix || '') + 'RootResponse';

  let meaningfulSegment = segments[segments.length - 1];
  if (/^\d+$/.test(meaningfulSegment) && segments.length > 1) {
    meaningfulSegment = segments[segments.length - 2];
  }

  const rawName = meaningfulSegment.replace(/\.[^.]+$/, '');
  const words = rawName.split(/[-_]/);
  const pascalName = words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');

  return (prefix || '') + pascalName + 'Response';
}

export function generateFunctionName(url) {
  const parsed = new URL(url);
  let pathname = parsed.pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return 'fetchRoot';
  let meaningful = segments[segments.length - 1];
  if (/^\d+$/.test(meaningful) && segments.length > 1) meaningful = segments[segments.length - 2];
  const name = meaningful.replace(/\.[^.]+$/, '');
  const words = name.split(/[-_]/);
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
}
