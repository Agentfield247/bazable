/**
 * Generate Prisma model or Supabase SQL migration from endpoint schemas.
 */
export function generatePrismaModel(modelName, fields) {
  let model = `model ${capitalize(modelName)} {\n`;
  model += `  id        String   @id @default(uuid())\n`;
  for (const [name, type] of Object.entries(fields)) {
    const prismaType = mapToPrismaType(type);
    model += `  ${name}      ${prismaType}\n`;
  }
  model += `  createdAt DateTime @default(now())\n`;
  model += `}\n`;
  return model;
}

export function generateSupabaseSQL(tableName, fields) {
  let sql = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
  sql += `  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n`;
  for (const [name, type] of Object.entries(fields)) {
    const sqlType = mapToSQLType(type);
    sql += `  ${name} ${sqlType},\n`;
  }
  sql += `  created_at TIMESTAMPTZ DEFAULT NOW()\n`;
  sql += `);\n`;
  return sql;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function mapToPrismaType(bazType) {
  switch (bazType) {
    case 'string': return 'String';
    case 'number': return 'Float';
    case 'boolean': return 'Boolean';
    case 'array': return 'Json';
    default: return 'String';
  }
}

function mapToSQLType(bazType) {
  switch (bazType) {
    case 'string': return 'TEXT';
    case 'number': return 'NUMERIC';
    case 'boolean': return 'BOOLEAN';
    case 'array': return 'JSONB';
    default: return 'TEXT';
  }
}
