# ![Bazable Logo](https://raw.githubusercontent.com/Agentfield247/bazable-docs/main/logo-light.svg)

# Bazable

**Git‑native API contract management CLI.**  
Bazable reads your codebase (frontend, backend, or both), builds an API contract automatically, and enforces it across your team with cloud sync, mock servers, and backend code generation.

---

## Why Bazable?

- **Extract APIs automatically** from any language (JS/TS/HTML + presets for Python, PHP, Go, Ruby)  
- **Catch breaking changes** before they reach production – dead URLs, payload type mismatches, over‑fetching  
- **No manual configuration** – Bazable auto‑detects your API wrappers (like `fetchLedgerAPI`, `apiClient`) and even follows variable assignments  
- **Cloud sync with device‑code auth** – push from backend, sync to frontend, no passwords needed  
- **Mock server, TypeScript types, and backend scaffolding** – generate an entire Express/Hono API from your contract  
- **AI‑powered** – explain endpoints, propose schema changes, accept them, and generate forms with a single command. MCP server included for AI coding agents.
- Full documentation: [https://bazable.mintlify.app](https://bazable.mintlify.app)

---

## Quick Start

```bash
npm install -g bazable-api
cd your-project-folder
bazable init
bazable extract --payloads          # finds all endpoints + request schemas
bazable inspect                      # checks for dead URLs, type mismatches, over‑fetching
bazable test --mock --all            # mock‑test all endpoints
bazable hook                         # install pre‑push Git hook

Full documentation: https://bazable.mintlify.app

GitHub: https://github.com/Agentfield247/bazable

Issues: https://github.com/Agentfield247/bazable/issues

| Command | Aliases | Description |
|--------|---------|-------------|
| `bazable init` | – | Create `bazable.config.json` |
| `bazable add <url>` | – | Fetch live API and store response schema |
| `bazable extract` | `ext`, `e` | Auto‑discover API calls from code (JS/TS/HTML + presets) |
| `bazable import <source>` | `imp` | Import OpenAPI/Swagger/Postman specs |
| `bazable config` | – | View/edit contract settings |
| `bazable inspect` | `i`, `check` | Validate code against contract; detect payload mismatches, over‑fetching |
| `bazable test` | – | Send real HTTP requests; mock mode, auto‑login, write‑protection |
| `bazable diff [url]` | – | Compare stored schema with live API; detect breaking changes |
| `bazable types` | – | Generate TypeScript interfaces |
| `bazable client` | – | Generate typed API client (`bazableClient.ts`) |
| `bazable generate backend` | `gen` | Generate Express/Hono route stubs with validation |
| `bazable gen ui` | – | Generate React + Tailwind form from an endpoint schema |
| `bazable ci` | – | Generate GitHub Actions workflow for CI enforcement |
| `bazable hook` | – | Install pre‑push Git hook |
| `bazable push` | – | Upload contract to Bazable Cloud |
| `bazable sync` | – | Pull latest contract from cloud |
| `bazable watch` | – | Background sync + auto‑fix on changes |
| `bazable serve` | `s` | Start a mock server from your contract |
| `bazable ui` | – | Open the local dashboard |
| `bazable login` / `logout` | – | Manage API credentials |
| `bazable errors` | – | View persistent error log |
| `bazable explain` | – | AI‑powered endpoint explanation |
| `bazable propose` | – | AI‑generated contract change proposal |
| `bazable accept` | – | Accept and apply an AI proposal |
| `bazable mcp` | – | Start MCP server for AI agents |
