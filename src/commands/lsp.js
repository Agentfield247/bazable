import { Command } from 'commander';
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { readConfig } from '../utils/config.js';
import { extractApiUrlsFromFile, inspectFileAdvanced } from '../parsers/ast.js';
import { resolveUrl } from '../utils/url.js';

const lsp = new Command('lsp')
  .description('Start the Bazable Language Server Protocol engine')
  .action(() => {
    // Force stdio mode if no connection mode was specified (allows manual testing)
    if (
      !process.argv.includes('--stdio') &&
      !process.argv.includes('--node-ipc') &&
      !process.argv.some(a => a.startsWith('--socket'))
    ) {
      process.argv.push('--stdio');
    }

    const connection = createConnection(ProposedFeatures.all);
    const documents = new TextDocuments(TextDocument);

    let hasConfigurationCapability = false;
    let hasWorkspaceFolderCapability = false;

    connection.onInitialize((params) => {
      const capabilities = params.capabilities;
      hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
      hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
      return {
        capabilities: {
          textDocumentSync: TextDocumentSyncKind.Incremental,
          hoverProvider: true,
        },
      };
    });

    connection.onInitialized(() => {
      if (hasConfigurationCapability) {
        connection.client.register(DidChangeConfigurationNotification.type, undefined);
      }
    });

    async function validateTextDocument(textDocument) {
      const config = await readConfig();
      if (!config) return;
      const contractedUrls = Object.keys(config.endpoints || {});
      const wrappers = ['fetchAPI'];
      const content = textDocument.getText();
      const filePath = textDocument.uri.replace('file://', '');
      const result = extractApiUrlsFromFile(content, filePath, wrappers);
      const baseUrl = config.baseUrl || '';
      const diagnostics = [];

      for (const rawUrl of result.urls) {
        const resolvedUrl = resolveUrl(rawUrl, baseUrl);
        const isContracted = contractedUrls.some(u => u === resolvedUrl || u === rawUrl);
        if (!isContracted) {
          const match = content.indexOf(rawUrl);
          if (match !== -1) {
            const start = textDocument.positionAt(match);
            const end = textDocument.positionAt(match + rawUrl.length);
            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              range: { start, end },
              message: `Dead/Uncontracted API call: ${resolvedUrl}`,
              source: 'Bazable',
            });
          }
        }
      }

      const advancedMessages = inspectFileAdvanced(content, filePath, config, contractedUrls, wrappers);
      advancedMessages.forEach(msg => {
        diagnostics.push({
          severity: msg.startsWith('🚨') ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          message: msg,
          source: 'Bazable',
        });
      });

      connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
    }

    documents.onDidChangeContent(change => validateTextDocument(change.document));
    documents.onDidSave(change => validateTextDocument(change.document));

    connection.onHover(async ({ textDocument, position }) => {
      const config = await readConfig();
      if (!config) return null;
      const document = documents.get(textDocument.uri);
      if (!document) return null;

      const lineText = document.getText({
        start: { line: position.line, character: 0 },
        end: { line: position.line, character: Number.MAX_SAFE_INTEGER },
      });

      const urlRegex = /(https?:\/\/[^\s'"]+|(?:\/|\.\/|\.\.\/)[^\s'"]+)/g;
      let match;
      while ((match = urlRegex.exec(lineText)) !== null) {
        const url = match[0];
        const startChar = match.index;
        const endChar = startChar + url.length;
        if (position.character >= startChar && position.character <= endChar) {
          const entry = config.endpoints[url] || Object.values(config.endpoints).find(e => e.method && e.url === url);
          if (!entry) return null;

          const reqSchema = entry.request ? JSON.stringify(entry.request, null, 2) : 'None';
          const respSchema = entry.response ? JSON.stringify(entry.response, null, 2) : 'None';
          const method = entry.method || 'GET';

          return {
            contents: {
              kind: 'markdown',
              value: [
                `**${method} ${url}**`,
                '',
                `**Request Schema:**`,
                '```json',
                reqSchema,
                '```',
                '',
                `**Response Schema:**`,
                '```json',
                respSchema,
                '```',
              ].join('\n'),
            },
          };
        }
      }
      return null;
    });

    documents.listen(connection);
    connection.listen();
  });

export default lsp;
