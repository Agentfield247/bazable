import { formatLabel } from './ui-utils.js';

/**
 * Generate a standalone HTML file containing a semantic form for the given endpoint schema.
 */
export function generateHtmlForm(method, url, requestSchema) {
  const pageTitle = method.toUpperCase() + ' ' + url;
  const fields = Object.entries(requestSchema);
  let formInputs = '';

  for (const [field, type] of fields) {
    const label = formatLabel(field);
    if (type === 'boolean') {
      formInputs += `
      <label class="form-checkbox">
        <input type="checkbox" name="${field}" />
        <span>${label}</span>
      </label>`;
    } else {
      const inputType = type === 'number' ? 'number' : 'text';
      formInputs += `
      <div class="form-group">
        <label for="${field}">${label}</label>
        <input type="${inputType}" id="${field}" name="${field}" required />
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  <style>
    :root {
      --bg: #0a0a0a;
      --surface: #141414;
      --border: #27272a;
      --text: #f4f4f5;
      --text-secondary: #a1a1aa;
      --accent: #f97316;
      --accent-hover: #ea580c;
    }
    .light-mode {
      --bg: #ffffff;
      --surface: #f5f5f5;
      --border: #ddd;
      --text: #111;
      --text-secondary: #52525b;
      --accent: #ea580c;
      --accent-hover: #c2410c;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex; justify-content: center; align-items: center; min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3);
      max-width: 500px; width: 100%; padding: 2rem;
    }
    .card-header {
      margin-bottom: 1.5rem;
    }
    .card-header h1 {
      font-size: 1.25rem; font-weight: 600;
    }
    .card-header .badge {
      display: inline-block;
      padding: 2px 8px; border-radius: 4px; font-size: 0.65rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
      background: #3a2e1e; color: #f97316; margin-bottom: 0.5rem;
    }
    .card-header .url {
      font-family: monospace; font-size: 0.85rem; color: var(--text-secondary); word-break: break-all;
    }
    .alert {
      display: none; padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.85rem;
    }
    .alert.success { display: block; background: #1a3e2e; color: #4ade80; border: 1px solid #4ade80; }
    .alert.error { display: block; background: #3e1e1e; color: #f87171; border: 1px solid #f87171; }
    .form-group { margin-bottom: 1rem; }
    .form-group label {
      display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;
      color: var(--text-secondary); margin-bottom: 0.3rem;
    }
    input[type="text"],
    input[type="number"] {
      width: 100%; padding: 0.6rem 0.8rem; border-radius: 8px;
      background: var(--bg); border: 1px solid var(--border); color: var(--text);
      font-size: 0.9rem;
    }
    input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 2px rgba(249,115,22,0.3); }
    .form-checkbox {
      display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; cursor: pointer;
    }
    .form-checkbox input[type="checkbox"] {
      accent-color: var(--accent); width: 1.1rem; height: 1.1rem;
    }
    button {
      width: 100%; padding: 0.75rem; border: none; border-radius: 8px;
      background: var(--accent); color: #fff; font-weight: 600; font-size: 0.95rem;
      cursor: pointer; transition: background 0.2s;
    }
    button:hover { background: var(--accent-hover); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .theme-toggle {
      position: absolute; top: 1rem; right: 1rem; font-size: 0.8rem; cursor: pointer; color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div class="theme-toggle" onclick="document.body.classList.toggle('light-mode')">Toggle Theme</div>
  <div class="card">
    <div class="card-header">
      <span class="badge">${method.toUpperCase()}</span>
      <span class="url">${url}</span>
    </div>
    <div id="alert" class="alert"></div>
    <form id="api-form">
      ${formInputs}
      <button type="submit" id="submit-btn">Submit</button>
    </form>
  </div>
  <script>
    const form = document.getElementById('api-form');
    const alertBox = document.getElementById('alert');
    const submitBtn = document.getElementById('submit-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      alertBox.className = 'alert';
      alertBox.textContent = '';

      // Build payload
      const payload = {};
      const elements = form.elements;
      for (let el of elements) {
        if (!el.name) continue;
        if (el.type === 'checkbox') {
          payload[el.name] = el.checked;
        } else if (el.type === 'number') {
          payload[el.name] = el.value ? parseFloat(el.value) : null;
        } else {
          payload[el.name] = el.value;
        }
      }

      try {
        const res = await fetch('${url}', {
          method: '${method.toUpperCase()}',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
        const data = await res.json();
        alertBox.textContent = 'Success! Response: ' + JSON.stringify(data, null, 2);
        alertBox.className = 'alert success';
      } catch (err) {
        alertBox.textContent = '❌ Request failed: ' + err.message;
        alertBox.className = 'alert error';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    });
  </script>
</body>
</html>`;
}
