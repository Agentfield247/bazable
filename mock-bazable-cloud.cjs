// mock-bazable-cloud.cjs
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// In-memory stores
const deviceCodes = {};
const projects = {};
const contracts = {};

// --------------------------------------------------
// OAuth Device Flow endpoints (unchanged)
// --------------------------------------------------
app.post('/auth/device', (req, res) => {
  const device_code = crypto.randomUUID();
  const user_code = Math.random().toString(36).substring(2, 8).toUpperCase();
  deviceCodes[device_code] = {
    user_code,
    status: 'pending',
    expires_at: Date.now() + 600_000,
  };
  res.json({
    device_code,
    user_code,
    verification_uri: 'http://localhost:4000/device',
    verification_uri_complete: `http://localhost:4000/device?user_code=${user_code}`,
    expires_in: 600,
  });
});

app.post('/auth/device/poll', (req, res) => {
  const { device_code } = req.body;
  const record = deviceCodes[device_code];
  if (!record) return res.status(400).json({ error: 'invalid_grant' });
  if (record.status === 'approved') {
    res.json({
      access_token: 'mock-access-token-' + Date.now(),
      refresh_token: 'mock-refresh-token',
      user_email: 'test@bazable.com',
    });
  } else if (Date.now() > record.expires_at) {
    record.status = 'expired';
    res.status(400).json({ error: 'expired_token' });
  } else {
    res.status(400).json({ error: 'authorization_pending' });
  }
});

// --------------------------------------------------
// Device approval page (with logo)
// --------------------------------------------------
app.get('/device', (req, res) => {
  const user_code = req.query.user_code;
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bazable Device Activation</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-zinc-950 min-h-screen flex items-center justify-center font-sans">
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <!-- Logo -->
        <div class="flex justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -65 130 130" width="48" height="48">
            <path d="M -38 -55 L 8 -10 L -38 35 L -18 35 L 28 -10 L -18 -55 Z" fill="#FF5A1F"/>
            <path d="M 8 -16 L 46 19 L 8 54 L 26 54 L 64 19 L 26 -16 Z" fill="#FF5A1F" opacity="0.55"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold text-zinc-100 mb-2">Bazable CLI Authentication</h1>
        <p class="text-zinc-400 text-sm mb-6">Your verification code is shown below</p>
        <div class="bg-zinc-800 rounded-lg px-4 py-3 mb-6 inline-block">
          <span class="text-orange-500 font-mono text-lg font-bold tracking-widest">${user_code || 'N/A'}</span>
        </div>
        <p id="status" class="text-zinc-400 text-sm">Activating automatically…</p>
        <div id="success" class="hidden mt-4">
          <span class="inline-block bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full px-4 py-1 text-sm font-medium">
            ✅ Device approved! You may close this page.
          </span>
        </div>
        <div id="error" class="hidden mt-4">
          <span class="text-red-400 text-sm">❌ Approval failed. Please try again.</span>
        </div>
      </div>
      <script>
        (async () => {
          const userCode = ${JSON.stringify(user_code)};
          if (!userCode) {
            document.getElementById('status').innerText = 'Error: no verification code provided.';
            return;
          }
          try {
            const res = await fetch('/device/approve', {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ user_code: userCode })
            });
            if (res.ok) {
              document.getElementById('status').classList.add('hidden');
              document.getElementById('success').classList.remove('hidden');
            } else {
              document.getElementById('status').classList.add('hidden');
              document.getElementById('error').classList.remove('hidden');
            }
          } catch(e) {
            document.getElementById('status').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
          }
        })();
      </script>
    </body>
    </html>
  `);
});

app.post('/device/approve', (req, res) => {
  const { user_code } = req.body;
  const entry = Object.values(deviceCodes).find(c => c.user_code === user_code);
  if (entry) {
    entry.status = 'approved';
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'invalid user_code' });
  }
});

// --------------------------------------------------
// Dummy authentication middleware
// --------------------------------------------------
const authenticate = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ message: 'Unauthorized' });
  req.user = { id: '00000000-0000-0000-0000-000000000000' }; // dummy user UUID
  next();
};

// --------------------------------------------------
// In‑memory Project & Contract endpoints
// --------------------------------------------------
app.post('/projects', authenticate, (req, res) => {
  const { name } = req.body;
  const id = 'bz_proj_' + crypto.randomBytes(4).toString('hex');
  projects[id] = { id, name, owner_id: req.user.id, created_at: new Date().toISOString() };
  contracts[id] = [];
  res.json({ id, name, owner_id: req.user.id });
});

app.post('/projects/:id/contracts', authenticate, (req, res) => {
  const { id } = req.params;
  if (!projects[id]) return res.status(404).json({ message: 'Project not found' });
  const payload = req.body;
  const version = (contracts[id].length || 0) + 1;
  contracts[id].push({
    version,
    schema_json: payload,
    pushed_by: req.user.id,
    created_at: new Date().toISOString(),
  });
  res.json({ version });
});

app.get('/projects/:id/contracts/latest', authenticate, (req, res) => {
  const { id } = req.params;
  if (!projects[id]) return res.status(404).json({ message: 'Project not found' });
  const all = contracts[id] || [];
  const latest = all[all.length - 1];
  if (!latest) return res.status(404).json({ message: 'No contract found' });
  res.json({ schema_json: latest.schema_json, version: latest.version });
});

app.listen(4000, () => {
  console.log('Mock Bazable Cloud running on http://localhost:4000');
  console.log('Use the link from the CLI output to auto‑approve!');
});
