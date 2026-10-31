import { createServer } from 'node:http';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login, session, logout, state, health, catalog, createOrder, googleStart, googleCallback } from './lib/handlers.js';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const mime = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon' };
const api = new Map([
  ['/api/auth/login', login], ['/api/auth/session', session], ['/api/auth/logout', logout],
  ['/api/auth/google/start', googleStart], ['/api/auth/google/callback', googleCallback],
  ['/api/state', state], ['/api/health', health], ['/api/catalog', catalog], ['/api/orders', createOrder],
]);

async function loadEnv() {
  try {
    const text = await readFile(path.join(projectDir, '.env'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function send(response, status, headers, body='') {
  response.writeHead(status, { 'x-content-type-options':'nosniff', 'referrer-policy':'strict-origin-when-cross-origin', ...headers });
  response.end(body);
}

await loadEnv();
if (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
  console.error('Admin sign-in is not configured. Run `npm run setup` once, then restart the app.');
  process.exitCode = 1;
} else {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const handler = api.get(url.pathname);
      if (handler) {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 4_000_000) { send(res, 413, {'content-type':'application/json'}, JSON.stringify({error:'Request is too large.'})); return; } chunks.push(chunk); }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        const body = ['GET','HEAD'].includes(req.method || 'GET') ? undefined : Buffer.concat(chunks);
        const request = new Request(url, { method:req.method, headers, body, ...(body ? {duplex:'half'} : {}) });
        const result = await handler(request);
        const outHeaders = Object.fromEntries([...result.headers.entries()].filter(([key]) => key.toLowerCase() !== 'set-cookie'));
        const cookies = typeof result.headers.getSetCookie === 'function' ? result.headers.getSetCookie() : [];
        if (cookies.length) outHeaders['set-cookie'] = cookies;
        else if (result.headers.has('set-cookie')) outHeaders['set-cookie'] = result.headers.get('set-cookie');
        const outBody = Buffer.from(await result.arrayBuffer());
        send(res, result.status, outHeaders, outBody);
        return;
      }
      if (url.pathname.startsWith('/api/')) { send(res, 404, {'content-type':'application/json'}, JSON.stringify({error:'API route not found.'})); return; }
      const decoded = decodeURIComponent(url.pathname);
      const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
      const filename = path.resolve(projectDir, relative);
      if (filename !== projectDir && !filename.startsWith(`${projectDir}${path.sep}`)) { send(res, 403, {'content-type':'text/plain; charset=utf-8'}, 'Forbidden'); return; }
      try { await access(filename); } catch { send(res, 404, {'content-type':'text/plain; charset=utf-8'}, 'Not found'); return; }
      const data = await readFile(filename);
      send(res, 200, {'content-type':mime[path.extname(filename).toLowerCase()] || 'application/octet-stream','cache-control':'no-cache'}, data);
    } catch (error) {
      console.error('Local request failed:', error);
      if (!res.headersSent) send(res, 500, {'content-type':'text/plain; charset=utf-8'}, 'The local app hit an error. Check the terminal for details.');
      else res.end();
    }
  });
  const port = Number(process.env.PORT || 3000);
  server.listen(port, '127.0.0.1', () => {
    console.log(`Gearhouse is running at http://localhost:${port}`);
    console.log(`Local data folder: ${path.resolve(process.env.DATA_FILE || './data/gearhouse.json')}`);
    console.log('Keep this terminal open while using the app. Press Ctrl+C to stop it.');
  });
}
