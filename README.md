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
- **AI‑ready** – JSON output and MCP support planned  
- Check out the full guide and DOCUMENTATION here https://bazable.mintlify.app/

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
