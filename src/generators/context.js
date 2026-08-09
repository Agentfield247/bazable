import fs from 'fs/promises';
import path from 'path';

const RULE_CONTENT = `# Bazable API Contract Agent Rules

You are working in a codebase managed by the Bazable API Contract Engine.

1. NEVER guess, hallucinate, or hardcode API endpoints, parameters, or response structures.
2. Always check \`bazable.config.json\` or query the Bazable MCP server using tool calls (\`getEndpoint\`, \`inspect\`, \`listEndpoints\`) to obtain exact contract schemas.
3. Use the generated \`bazableClient\` (\`./bazableClient.ts\`) or \`bazable-types\` for all API calls and type definitions.
4. Before proposing or writing API changes, verify contract compliance with \`bazable inspect\`.
`;

export async function generateContextFiles(outputDir) {
  const files = [];

  // .cursorrules
  await fs.writeFile(path.join(outputDir, '.cursorrules'), RULE_CONTENT, 'utf-8');
  files.push('.cursorrules');

  // .clinerules
  await fs.writeFile(path.join(outputDir, '.clinerules'), RULE_CONTENT, 'utf-8');
  files.push('.clinerules');

  // .mcp.json
  const mcpConfig = {
    mcpServers: {
      bazable: {
        command: 'bazable',
        args: ['mcp'],
      },
    },
  };
  await fs.writeFile(path.join(outputDir, '.mcp.json'), JSON.stringify(mcpConfig, null, 2), 'utf-8');
  files.push('.mcp.json');

  return files;
}
