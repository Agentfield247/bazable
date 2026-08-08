export function generateSPA(config) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bazable Dashboard</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  :root {
    --bg: #09090b; --surface: #18181b; --border: #27272a;
    --text: #f4f4f5; --text-secondary: #a1a1aa;
    --accent: #f97316; --accent-hover: #ea580c;
    --green: #4ade80; --red: #f87171; --yellow: #fbbf24;
  }
  .light {
    --bg: #ffffff; --surface: #f4f4f5; --border: #d4d4d8;
    --text: #18181b; --text-secondary: #52525b;
    --accent: #ea580c; --accent-hover: #c2410c;
    --green: #16a34a; --red: #dc2626; --yellow: #ca8a04;
  }
  body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); color: var(--text); }
  .sidebar-link.active { border-left: 2px solid var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .sidebar-link { border-left: 2px solid transparent; color: var(--text-secondary); }
  .sidebar-link:hover { color: var(--text); background: color-mix(in srgb, var(--text-secondary) 10%, transparent); }
  .method-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .method-get { background: #1e3a2e; color: #4ade80; }
  .method-post { background: #3a2e1e; color: #f97316; }
  .method-put { background: #3a3a1e; color: #fbbf24; }
  .method-patch { background: #3a3a1e; color: #facc15; }
  .method-delete { background: #3a1e1e; color: #f87171; }
  .status-working { color: var(--green); }
  .status-failed { color: var(--red); }
  .status-unverified { color: var(--yellow); }
</style>
</head>
<body class="dark">
  <aside class="w-64 border-r flex flex-col fixed inset-y-0 left-0 z-30" style="background:var(--surface);border-color:var(--border)">
    <div class="h-16 flex items-center px-6 border-b" style="border-color:var(--border)">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -65 130 130" width="32" height="32" class="mr-3 flex-shrink-0">
        <path d="M -38 -55 L 8 -10 L -38 35 L -18 35 L 28 -10 L -18 -55 Z" fill="#FF5A1F"/>
        <path d="M 8 -16 L 46 19 L 8 54 L 26 54 L 64 19 L 26 -16 Z" fill="#FF5A1F" opacity="0.55"/>
      </svg>
      <span class="text-xl font-bold tracking-tight">Bazable</span>
    </div>
    <nav class="flex-1 p-4 space-y-1">
      <a href="#" onclick="switchView('endpoints')" id="nav-endpoints" class="sidebar-link active flex items-center px-4 py-2 rounded-r-lg transition-colors">Endpoints</a>
      <a href="#" onclick="switchView('tester')" id="nav-tester" class="sidebar-link flex items-center px-4 py-2 rounded-r-lg transition-colors">API Tester</a>
      <a href="#" onclick="switchView('settings')" id="nav-settings" class="sidebar-link flex items-center px-4 py-2 rounded-r-lg transition-colors">Settings</a>
    </nav>
    <div class="p-4 border-t" style="border-color:var(--border)">
      <div class="flex items-center justify-between text-xs" style="color:var(--text-secondary)">
        <span id="login-status">No credentials</span>
        <button onclick="showLoginModal()" class="font-medium hover:underline" style="color:var(--accent)">Login</button>
      </div>
      <button onclick="toggleTheme()" class="mt-3 w-full text-xs py-1 px-2 rounded border" style="border-color:var(--border);color:var(--text-secondary)"><span id="theme-label">Light Mode</span></button>
    </div>
  </aside>

  <main class="flex-1 ml-64 p-6 overflow-y-auto h-screen">
    <div id="view-endpoints" class="space-y-6">
      <div class="grid grid-cols-4 gap-4" id="stats"></div>
      <div class="rounded-lg overflow-hidden" style="background:var(--surface);border:1px solid var(--border)">
        <div class="px-6 py-4 border-b flex items-center justify-between" style="border-color:var(--border)">
          <h2 class="font-semibold">Registered Endpoints</h2>
          <div class="flex gap-2">
            <button onclick="showAddEndpointModal()" class="px-3 py-1.5 text-xs font-medium rounded-md text-white transition-colors" style="background:var(--accent)">+ Add Endpoint</button>
            <button onclick="testAll()" class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Test All</button>
            <button onclick="refreshContract()" class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Refresh</button>
            <button onclick="exportConfig()" class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Export</button>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="text-xs uppercase tracking-wider" style="background:color-mix(in srgb, var(--surface) 80%, transparent);color:var(--text-secondary)">
              <tr><th class="px-6 py-3 text-left">Method</th><th class="px-6 py-3 text-left">URL</th><th class="px-6 py-3 text-left">Status</th><th class="px-6 py-3 text-right">Actions</th></tr>
            </thead>
            <tbody id="endpoints-table" class="divide-y" style="border-color:var(--border)"></tbody>
          </table>
        </div>
      </div>
    </div>

    <div id="view-tester" class="hidden space-y-6">
      <div class="rounded-lg p-6" style="background:var(--surface);border:1px solid var(--border)">
        <h2 class="text-lg font-semibold mb-4">Test an API Endpoint</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Method</label><select id="tester-method" class="w-full rounded-md px-3 py-2 text-sm" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
          <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">URL</label><input type="text" id="tester-url" placeholder="https://api.example.com/v1/endpoint" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"></div>
        </div>
        <div class="mt-4"><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Headers (JSON)</label><textarea id="tester-headers" rows="2" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)">{"Content-Type":"application/json"}</textarea></div>
        <div class="mt-4"><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Body (JSON, optional)</label><textarea id="tester-body" rows="4" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder='{"key":"value"}'></textarea></div>
        <div class="mt-4 flex gap-3">
          <button onclick="sendTesterRequest()" class="px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Send</button>
          <button id="add-from-tester-btn" onclick="addFromTester()" class="hidden px-4 py-2 text-sm font-medium rounded-md" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">+ Add to Contract</button>
        </div>
        <div class="mt-4"><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Response</label><pre class="rounded-lg p-4 overflow-x-auto max-h-64 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border)" id="tester-response">Click Send to see the response.</pre></div>
      </div>
    </div>

    <div id="view-settings" class="hidden space-y-6">
      <div class="rounded-lg p-6" style="background:var(--surface);border:1px solid var(--border)">
        <h2 class="text-lg font-semibold mb-4">Settings</h2>
        <div class="space-y-4">
          <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Base URL</label><input type="text" id="settings-base-url" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" value="${config.baseUrl || ''}"></div>
          <div class="mt-6 pt-6 border-t" style="border-color:var(--border)">
            <h3 class="text-sm font-semibold mb-2">AI Configuration</h3>
            <p class="text-xs mb-4" style="color:var(--text-secondary)">
              Bazable uses AI to explain endpoints and propose contract changes.
              You need an API key from a supported provider.
              <br><br>
              <strong>How to get a key:</strong><br>
              • <a href="https://console.groq.com" target="_blank" class="text-orange-500 hover:underline">Groq (free)</a> – create an API key, use base URL <code class="text-orange-500">https://api.groq.com/openai/v1</code><br>
              • <a href="https://platform.openai.com/api-keys" target="_blank" class="text-orange-500 hover:underline">OpenAI</a> – requires a paid plan<br>
              • Any OpenAI‑compatible provider works.
            </p>
            <div class="space-y-4">
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">AI API Key</label>
                <div class="flex gap-2">
                  <input type="password" id="settings-ai-key" class="flex-1 rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" value="${config.aiApiKey || ''}">
                  <button onclick="testAiConnection()" class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Test</button>
                </div>
                <p id="ai-test-result" class="text-xs mt-1 hidden"></p>
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">AI Base URL (optional)</label>
                <input type="text" id="settings-ai-base" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder="https://api.openai.com/v1" value="${config.aiBaseUrl || ''}">
              </div>
              <div>
                <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">AI Model</label>
                <div class="flex gap-2">
                  <select id="settings-ai-model" class="flex-1 rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)">
                    <option value="${config.aiModel || ''}">${config.aiModel || 'Select a model...'}</option>
                  </select>
                  <button onclick="fetchAiModels()" class="px-3 py-1.5 text-xs font-medium rounded-md transition-colors" style="background:var(--surface);color:var(--text-secondary);border:1px solid var(--border)">Fetch</button>
                </div>
              </div>
            </div>
          </div>
          <button onclick="saveSettings()" class="px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Save Settings</button>
        </div>
      </div>
    </div>
  </main>

  <!-- Modals -->
  <div id="login-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="rounded-lg p-6 w-full max-w-md" style="background:var(--surface);border:1px solid var(--border)">
      <div class="flex justify-between items-center mb-4">
      <h3 class="font-semibold flex items-center gap-1">
        API Credentials
        <span title="These credentials are for your own API backend — not a Bazable account."
              class="cursor-help text-sm opacity-60 hover:opacity-100 transition-opacity">?</span>
      </h3>
        <button onclick="closeModal('login-modal')" class="text-zinc-400 hover:text-zinc-200">✕</button>
      </div>
      <p class="text-xs mb-4" style="color:var(--text-secondary)">
        These credentials are for your own API (e.g. your backend login) — not a Bazable account.
      </p>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Email</label>
          <input type="email" id="login-email" class="w-full rounded-md px-3 py-2 text-sm" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder="admin@example.com">
        </div>
        <div>
          <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Password</label>
          <input type="password" id="login-password" class="w-full rounded-md px-3 py-2 text-sm" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder="••••••">
        </div>
        <button onclick="doLogin()" class="w-full px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Save Credentials</button>
      </div>
    </div>
  </div>

  <div id="add-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="rounded-lg p-6 w-full max-w-lg" style="background:var(--surface);border:1px solid var(--border)">
      <div class="flex justify-between items-center mb-4"><h3 class="font-semibold">Add New Endpoint</h3><button onclick="closeModal('add-modal')" class="text-zinc-400 hover:text-zinc-200">✕</button></div>
      <div class="space-y-3">
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">URL</label><input type="text" id="add-url" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder="https://api.example.com/v1/endpoint"></div>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Method</label><select id="add-method" class="w-full rounded-md px-3 py-2 text-sm" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Request Schema (JSON, optional)</label><textarea id="add-request" rows="3" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder='{"key":"type"}'></textarea></div>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Response Schema (JSON, optional)</label><textarea id="add-response" rows="3" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder='{"key":"type"}'></textarea></div>
        <button onclick="addEndpoint()" class="w-full px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Add Endpoint</button>
      </div>
    </div>
  </div>

  <div id="edit-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="rounded-lg p-6 w-full max-w-lg" style="background:var(--surface);border:1px solid var(--border)">
      <div class="flex justify-between items-center mb-4"><h3 id="edit-title" class="font-semibold">Edit Endpoint</h3><button onclick="closeModal('edit-modal')" class="text-zinc-400 hover:text-zinc-200">✕</button></div>
      <div class="space-y-3">
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Request Schema (JSON)</label><textarea id="edit-request" rows="4" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"></textarea></div>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Response Schema (JSON)</label><textarea id="edit-response" rows="4" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"></textarea></div>
        <div class="flex gap-3">
          <button onclick="saveEndpoint()" class="flex-1 px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Save</button>
          <button onclick="deleteEndpoint()" class="px-4 py-2 text-sm font-medium rounded-md" style="background:#3a1e1e;color:var(--red);border:1px solid #5a2a2a">Delete</button>
        </div>
      </div>
    </div>
  </div>

  <div id="test-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="rounded-lg p-6 w-full max-w-2xl" style="background:var(--surface);border:1px solid var(--border)">
      <div class="flex justify-between items-center mb-4"><h3 class="font-semibold">Test Request</h3><button onclick="closeModal('test-modal')" class="text-zinc-400 hover:text-zinc-200">✕</button></div>
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-4">
          <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Method</label><select id="test-method" class="w-full rounded-md px-3 py-2 text-sm" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select></div>
          <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">URL</label><input type="text" id="test-url" readonly class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"></div>
        </div>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Headers (JSON)</label><textarea id="test-headers" rows="2" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)">{"Content-Type":"application/json"}</textarea></div>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Body (JSON)</label><textarea id="test-body" rows="4" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)"></textarea></div>
        <button onclick="sendTestRequest()" class="w-full px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Send</button>
        <div><label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Response</label><pre class="rounded-lg p-4 overflow-x-auto max-h-64 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border)" id="test-response">Click Send to see the response.</pre></div>
      </div>
    </div>
  </div>

  <div id="toast" class="fixed bottom-6 right-6 px-4 py-2 rounded-md font-medium z-50 hidden" style="background:var(--green);color:#000"></div>

  <!-- AI Explain Modal -->
  <div id="explain-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="rounded-lg p-6 w-full max-w-2xl" style="background:var(--surface);border:1px solid var(--border)">
      <div class="flex justify-between items-center mb-4"><h3 class="font-semibold">AI Explanation</h3><button onclick="closeModal('explain-modal')" class="text-zinc-400 hover:text-zinc-200">✕</button></div>
      <div id="explain-content" class="text-sm" style="color:var(--text-secondary);max-height:60vh;overflow-y:auto;white-space:pre-wrap;">
        Loading explanation…
      </div>
    </div>
  </div>

  <!-- AI Propose Modal -->
  <div id="propose-modal" class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 hidden">
    <div class="rounded-lg p-6 w-full max-w-2xl" style="background:var(--surface);border:1px solid var(--border)">
      <div class="flex justify-between items-center mb-4"><h3 class="font-semibold">AI Proposal</h3><button onclick="closeModal('propose-modal')" class="text-zinc-400 hover:text-zinc-200">✕</button></div>
      <div class="space-y-3">
        <div>
          <label class="block text-xs font-medium mb-1" style="color:var(--text-secondary)">Describe the change you want:</label>
          <textarea id="propose-text" rows="3" class="w-full rounded-md px-3 py-2 text-sm font-mono" style="background:var(--bg);border:1px solid var(--border);color:var(--text)" placeholder='e.g. Add phone_number to the request'></textarea>
        </div>
        <button onclick="sendProposal()" class="px-4 py-2 text-sm font-medium rounded-md text-white" style="background:var(--accent)">Ask AI</button>
        <div id="propose-result" class="mt-4 text-sm" style="color:var(--text-secondary);max-height:40vh;overflow-y:auto;white-space:pre-wrap;"></div>
      </div>
    </div>
  </div>

  <script>
    // --- THEME ---
    function applyTheme(light) {
      document.body.classList.toggle('light', light);
      document.getElementById('theme-label').textContent = light ? 'Dark Mode' : 'Light Mode';
      localStorage.setItem('bazable-theme', light ? 'light' : 'dark');
    }
    document.addEventListener('DOMContentLoaded', () => { applyTheme(localStorage.getItem('bazable-theme') === 'light'); });
    function toggleTheme() { applyTheme(!document.body.classList.contains('light')); }

    // --- STATE ---
    let contract = ${JSON.stringify(config)};
    let currentEditUrl = null;
    let testerResponseData = null;

    function switchView(view) {
      ['endpoints','tester','settings'].forEach(v => document.getElementById('view-'+v).classList.toggle('hidden', v !== view));
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      document.getElementById('nav-'+view).classList.add('active');
    }

    function renderStats() {
      const eps = contract.endpoints || {};
      const urls = Object.keys(eps);
      let w=0,f=0,u=0;
      urls.forEach(k => { const s=eps[k].schema_status; if(s==='working')w++; else if(s==='failed')f++; else u++; });
      document.getElementById('stats').innerHTML = [
        {n:w,l:'Working',c:'var(--green)'},{n:f,l:'Failed',c:'var(--red)'},
        {n:u,l:'Unverified',c:'var(--yellow)'},{n:urls.length,l:'Total',c:'var(--text)'}
      ].map(s => \`<div class="rounded-lg p-4 text-center" style="background:var(--surface);border:1px solid var(--border)"><div class="text-2xl font-bold" style="color:\${s.c}">\${s.n}</div><div class="text-xs uppercase mt-1" style="color:var(--text-secondary)">\${s.l}</div></div>\`).join('');
    }

    function renderEndpoints() {
      const tbody = document.getElementById('endpoints-table');
      let html = '';
      for (const [url, entry] of Object.entries(contract.endpoints||{})) {
        const method = entry.method || 'GET';
        const mClass = 'method-' + method.toLowerCase();
        const status = entry.schema_status || 'unverified';
        html += \`<tr style="border-bottom:1px solid var(--border)" class="hover:bg-opacity-50">
          <td class="px-6 py-3"><span class="method-badge \${mClass}">\${method}</span></td>
          <td class="px-6 py-3 font-mono text-xs" style="color:var(--text)">\${url}</td>
          <td class="px-6 py-3"><span class="status-\${status}">\${status}</span></td>
          <td class="px-6 py-3 text-right space-x-2">
            <button onclick="openTestModal('\${url.replace(/'/g,"\\\\'")}','\${method}')" class="text-xs hover:underline" style="color:var(--accent)">Send</button>
            <button onclick="editEndpoint('\${url.replace(/'/g,"\\\\'")}')" class="text-xs hover:underline" style="color:var(--text-secondary)">Edit</button>
            <button onclick="explainEndpoint('\${url.replace(/'/g,"\\\\'")}','\${method}')" class="text-xs hover:underline" style="color:var(--accent)">Explain</button>
            <button onclick="proposeEndpoint('\${url.replace(/'/g,"\\\\'")}','\${method}')" class="text-xs hover:underline" style="color:var(--accent)">Propose</button>
            <button onclick="copyTestCmd()" class="text-xs hover:underline" style="color:var(--text-secondary)">Copy Cmd</button>
          </td></tr>\`;
      }
      tbody.innerHTML = html;
    }

    function openTestModal(rawUrl, method) {
      let url = rawUrl;
      const match = rawUrl.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
      if (match) { url = match[2]; if (!method || method==='GET') method = match[1].toUpperCase(); }
      document.getElementById('test-url').value = url;
      document.getElementById('test-method').value = method || 'GET';
      document.getElementById('test-headers').value = '{}';
      document.getElementById('test-body').value = (contract.endpoints[rawUrl]?.request) ? JSON.stringify(contract.endpoints[rawUrl].request,null,2) : '{}';
      document.getElementById('test-response').textContent = 'Click Send to see the response.';
      document.getElementById('test-modal').classList.remove('hidden');
    }

    async function sendTestRequest() {
      const method = document.getElementById('test-method').value;
      const url = document.getElementById('test-url').value.trim();
      let headers = {};
      try { headers = JSON.parse(document.getElementById('test-headers').value); } catch(e) {}
      const body = document.getElementById('test-body').value.trim();
      const resBox = document.getElementById('test-response');
      resBox.textContent = 'Sending...';
      try {
        const res = await fetch('/api/proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ method, url, headers, body }) });
        const text = await res.text();
        try { resBox.textContent = JSON.stringify(JSON.parse(text), null, 2); } catch { resBox.textContent = text; }
      } catch(e) { resBox.textContent = 'Request failed: ' + e.message; }
    }

    function editEndpoint(url) {
      currentEditUrl = url;
      const entry = contract.endpoints[url] || {};
      document.getElementById('edit-title').textContent = 'Edit: ' + url;
      document.getElementById('edit-request').value = JSON.stringify(entry.request || {}, null, 2);
      document.getElementById('edit-response').value = JSON.stringify(entry.response || {}, null, 2);
      document.getElementById('edit-modal').classList.remove('hidden');
    }

    async function saveEndpoint() {
      try {
        const req = JSON.parse(document.getElementById('edit-request').value);
        const resp = JSON.parse(document.getElementById('edit-response').value);
        const res = await fetch('/api/endpoint', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: currentEditUrl, data: { request: req, response: resp } }) });
        const json = await res.json();
        if (json.success) { contract.endpoints[currentEditUrl].request = req; contract.endpoints[currentEditUrl].response = resp; renderEndpoints(); closeModal('edit-modal'); showToast('Endpoint updated'); }
      } catch(e) { alert('Invalid JSON'); }
    }

    async function deleteEndpoint() {
      if (!confirm('Delete ' + currentEditUrl + '?')) return;
      await fetch('/api/endpoint', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: currentEditUrl }) });
      delete contract.endpoints[currentEditUrl];
      renderEndpoints(); renderStats();
      closeModal('edit-modal');
      showToast('Deleted');
    }

    function showAddEndpointModal() { document.getElementById('add-modal').classList.remove('hidden'); }
    async function addEndpoint() {
      const url = document.getElementById('add-url').value.trim();
      const method = document.getElementById('add-method').value;
      const reqStr = document.getElementById('add-request').value.trim();
      const respStr = document.getElementById('add-response').value.trim();
      if (!url) { alert('URL required'); return; }
      let request={}, response={};
      try { if(reqStr) request = JSON.parse(reqStr); } catch(e) { alert('Invalid request JSON'); return; }
      try { if(respStr) response = JSON.parse(respStr); } catch(e) { alert('Invalid response JSON'); return; }
      const key = method + ' ' + url;
      await fetch('/api/endpoint', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: key, data: { method, request, response, schema_status: 'unverified_extracted_manually' } }) });
      contract.endpoints[key] = { method, request, response, schema_status: 'unverified_extracted_manually' };
      renderEndpoints(); renderStats();
      closeModal('add-modal');
      showToast('Endpoint added');
    }

    function showLoginModal() { document.getElementById('login-modal').classList.remove('hidden'); }
    async function doLogin() {
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email,password}) });
      closeModal('login-modal');
      checkLoginStatus();
      showToast('Credentials saved');
    }
    async function logout() {
      await fetch('/api/logout', { method:'POST' });
      document.getElementById('login-status').textContent = 'No credentials';
      showToast('Logged out');
    }
    async function checkLoginStatus() {
      const res = await fetch('/api/credentials');
      const creds = await res.json();
      document.getElementById('login-status').textContent = (creds.email || creds.token) ? 'Logged in' : 'No credentials';
    }

    function testAll() { navigator.clipboard.writeText('bazable test --all --method POST -w'); showToast('Test command copied'); }
    function copyTestCmd() { navigator.clipboard.writeText('bazable test --all --method POST -w'); showToast('Test command copied'); }
    function exportConfig() {
      const blob = new Blob([JSON.stringify(contract,null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'bazable.config.json'; a.click();
    }
    async function saveSettings() {
      const baseUrl = document.getElementById('settings-base-url').value.trim();
      const aiKey = document.getElementById('settings-ai-key').value.trim();
      const aiBase = document.getElementById('settings-ai-base').value.trim();
      const aiModel = document.getElementById('settings-ai-model').value.trim();

      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          baseUrl,
          aiApiKey: aiKey,
          aiBaseUrl: aiBase,
          aiModel: aiModel,
        })
      });

      if (res.ok) {
        contract.baseUrl = baseUrl;
        contract.aiApiKey = aiKey;
        contract.aiBaseUrl = aiBase;
        contract.aiModel = aiModel;
        showToast('Settings saved');
      } else {
        showToast('Failed to save settings');
      }
    }

    async function refreshContract() {
      try {
        const res = await fetch('/api/config');
        contract = await res.json();
        renderStats();
        renderEndpoints();
        showToast('Contract refreshed');
      } catch (e) {
        showToast('Failed to refresh');
      }
    }

    async function sendTesterRequest() {
      const method = document.getElementById('tester-method').value;
      const url = document.getElementById('tester-url').value.trim();
      const headers = document.getElementById('tester-headers').value.trim();
      const body = document.getElementById('tester-body').value.trim();
      if (!url) { alert('URL required'); return; }
      const resBox = document.getElementById('tester-response');
      resBox.textContent = 'Sending...';
      let hdrs = {};
      try { hdrs = JSON.parse(headers); } catch(e) { hdrs = {"Content-Type":"application/json"}; }
      try {
        const res = await fetch('/api/proxy', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ method, url, headers: hdrs, body }) });
        const text = await res.text();
        try { const json = JSON.parse(text); resBox.textContent = JSON.stringify(json, null, 2); testerResponseData = { method, url, headers: hdrs, body, response: json }; document.getElementById('add-from-tester-btn').classList.remove('hidden'); }
        catch { resBox.textContent = text; document.getElementById('add-from-tester-btn').classList.add('hidden'); }
      } catch(e) { resBox.textContent = 'Request failed: ' + e.message; document.getElementById('add-from-tester-btn').classList.add('hidden'); }
    }

    async function addFromTester() {
      if (!testerResponseData) return;
      const { method, url } = testerResponseData;
      const key = method + ' ' + url;
      await fetch('/api/endpoint', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ url: key, data: { method, schema_status: 'unverified_extracted_manually' } }) });
      contract.endpoints[key] = { method, schema_status: 'unverified_extracted_manually' };
      renderEndpoints(); renderStats();
      document.getElementById('add-from-tester-btn').classList.add('hidden');
      showToast('Endpoint added');
    }

    function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
    function showToast(msg) {
      const t = document.getElementById('toast');
      t.textContent = msg; t.classList.remove('hidden');
      setTimeout(() => t.classList.add('hidden'), 2500);
    }

    async function testAiConnection() {
      const key = document.getElementById('settings-ai-key').value.trim();
      const base = document.getElementById('settings-ai-base').value.trim();
      const resultEl = document.getElementById('ai-test-result');
      resultEl.classList.remove('hidden');
      resultEl.textContent = 'Testing…';
      try {
        const res = await fetch('/api/ai/test', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ apiKey: key, baseUrl: base })
        });
        const data = await res.json();
        if (data.success) {
          resultEl.textContent = 'Connection successful! Models loaded.';
          resultEl.className = 'text-xs mt-1 text-green-400';
          // Populate the model dropdown with fetched models
          const select = document.getElementById('settings-ai-model');
          select.innerHTML = '';
          (data.models || []).forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === contract.aiModel) opt.selected = true;
            select.appendChild(opt);
          });
        } else {
          resultEl.textContent = '❌ ' + data.message;
          resultEl.className = 'text-xs mt-1 text-red-400';
        }
      } catch (e) {
        resultEl.textContent = '❌ Network error. Check your connection.';
        resultEl.className = 'text-xs mt-1 text-red-400';
      }
    }

    async function fetchAiModels() {
      const key = document.getElementById('settings-ai-key').value.trim();
      const base = document.getElementById('settings-ai-base').value.trim();
      if (!key) { alert('Enter an API key first.'); return; }
      const select = document.getElementById('settings-ai-model');
      select.innerHTML = '<option>Loading…</option>';
      try {
        const res = await fetch('/api/ai/models', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ apiKey: key, baseUrl: base })
        });
        const data = await res.json();
        select.innerHTML = '';
        if (data.success && data.models.length > 0) {
          data.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === contract.aiModel) opt.selected = true;
            select.appendChild(opt);
          });
        } else {
          select.innerHTML = '<option>No models found</option>';
        }
      } catch (e) {
        select.innerHTML = '<option>Error loading</option>';
      }
    }

    // AI Explain
    async function explainEndpoint(rawUrl, method) {
      let url = rawUrl;
      const match = rawUrl.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
      if (match) { url = match[2]; if (!method || method==='GET') method = match[1].toUpperCase(); }
      document.getElementById('explain-modal').classList.remove('hidden');
      document.getElementById('explain-content').textContent = 'Asking AI to explain…';
      try {
        const res = await fetch('/api/ai/explain', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ method, url })
        });
        const data = await res.json();
        if (data.success) {
          document.getElementById('explain-content').textContent = data.explanation;
        } else {
          document.getElementById('explain-content').textContent = 'Error: ' + (data.message || 'Unknown');
        }
      } catch (e) {
        document.getElementById('explain-content').textContent = 'Request failed: ' + e.message;
      }
    }

    // AI Propose
    function proposeEndpoint(rawUrl, method) {
      let url = rawUrl;
      const match = rawUrl.match(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+(.+)$/i);
      if (match) { url = match[2]; if (!method || method==='GET') method = match[1].toUpperCase(); }
      document.getElementById('propose-modal').classList.remove('hidden');
      // Store context for when the user clicks "Ask AI"
      window._proposeContext = { method, url };
    }

    async function sendProposal() {
      const requestText = document.getElementById('propose-text').value.trim();
      if (!requestText) { alert('Describe what you want.'); return; }
      const ctx = window._proposeContext;
      if (!ctx) return;
      document.getElementById('propose-result').textContent = 'Asking AI…';
      try {
        const res = await fetch('/api/ai/propose', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ method: ctx.method, url: ctx.url, requestText })
        });
        const data = await res.json();
        if (data.success) {
          if (data.proposal) {
            document.getElementById('propose-result').textContent = JSON.stringify(data.proposal, null, 2);
          } else {
            document.getElementById('propose-result').textContent = data.raw || 'No proposal generated.';
          }
        } else {
          document.getElementById('propose-result').textContent = 'Error: ' + (data.message || 'Unknown');
        }
      } catch (e) {
        document.getElementById('propose-result').textContent = 'Request failed: ' + e.message;
      }
    }

    function init() { renderStats(); renderEndpoints(); checkLoginStatus(); }
    init();
  </script>
</body>
</html>`;
}
