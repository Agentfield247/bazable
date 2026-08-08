// mock-server.cjs
const http = require('http');

const PORT = 3099;
const VALID_TOKEN = 'mock-token-123'; // use this in bazable test --token

const server = http.createServer((req, res) => {
  // CORS headers for testing from browser if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) {}

    // Auth check: access_token can be in body or Authorization header
    const token = payload.access_token || (req.headers.authorization || '').replace('Bearer ', '');
    if (!token || token !== VALID_TOKEN) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid token' }));
      return;
    }

    const url = req.url.split('?')[0];
    const method = req.method.toUpperCase();

    // Specific endpoints with mock data (optional – keep the ones you want)
    if (method === 'POST' && url === '/v1/admins/auths/login/index.php') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { full_name: 'Mock Admin', token: VALID_TOKEN } }));
      return;
    }
    if (method === 'POST' && url === '/v1/admins/profile/index.php') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { id: 1, email: 'admin@cubrin.com' } }));
      return;
    }

    // ✨ NEW: Generic handler for any POST under /v1/...
    if (method === 'POST' && url.startsWith('/v1/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { message: 'Mock response', endpoint: url } }));
      return;
    }

    // If nothing matched, return 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Not found' }));
  });
});

server.listen(PORT, () => {
  console.log(`Mock API running at http://localhost:${PORT}`);
});
