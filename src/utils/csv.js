import fs from 'fs/promises';

/**
 * Parse a CSV file and return an array of objects (header‑value pairs).
 */
export async function parseCSV(filePath) {
  const raw = await fs.readFile(filePath, 'utf-8');
  const lines = raw.trim().split(/\r?\n/);
  if (lines.length < 2) return []; // need header and at least one data row

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });
    rows.push(obj);
  }
  return rows;
}

/**
 * Infer a JSON schema type from sample data.
 */
export function inferSchemaFromData(jsonData) {
  if (!jsonData || jsonData.length === 0) return { type: 'object', properties: {} };
  const firstRow = jsonData[0];
  const properties = {};
  for (const [key, value] of Object.entries(firstRow)) {
    if (value === 'true' || value === 'false') {
      properties[key] = { type: 'boolean' };
    } else if (!isNaN(Number(value)) && value !== '') {
      properties[key] = { type: 'number' };
    } else {
      properties[key] = { type: 'string' };
    }
  }
  return {
    type: 'array',
    items: { type: 'object', properties },
  };
}
