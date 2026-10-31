import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { checkState, getStoreMode, loadState, saveState } from './store.js';

const SESSION_COOKIE = 'gearhouse_session';
const OAUTH_STATE_COOKIE = 'gearhouse_oauth_state';
const SESSION_TTL = 60 * 60 * 12;
const loginAttempts = new Map();
const orderAttempts = new Map();

const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});

function googleConfig() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, ADMIN_EMAIL: adminEmail } = process.env;
  return clientId && clientSecret && adminEmail ? { clientId, clientSecret, adminEmail: adminEmail.trim().toLowerCase() } : null;
}
function cookieValue(request, name) {
  return (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}
function redirect(path, cookies = []) {
  const headers = new Headers({ location: path, 'cache-control': 'no-store' });
  cookies.forEach(value => headers.append('set-cookie', value));
  return new Response(null, { status: 302, headers });
}

function secrets() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  return password && password.length >= 12 && secret && secret.length >= 32 ? { password, secret } : null;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signedSession(secret, exp) {
  const payload = Buffer.from(JSON.stringify({ exp, v: 1 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function sessionValid(request, secret) {
  const cookie = request.headers.get('cookie') || '';
  const raw = cookie.split(';').map(x => x.trim()).find(x => x.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return false;
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp > Date.now(); }
  catch { return false; }
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function authRequired(request) {
  const config = secrets();
  if (!config) return { error: json({ error: 'Admin sign-in is not configured. Run npm run setup locally, or set the admin environment variables in Vercel.' }, 503) };
  if (!sessionValid(request, config.secret)) return { error: json({ error: 'Please sign in to continue.' }, 401) };
  return { config };
}

export async function login(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!sameOrigin(request)) return json({ error: 'Request origin rejected.' }, 403);
  const config = secrets();
  if (!config) return json({ error: 'Admin sign-in is not configured. Run npm run setup locally, or set the admin environment variables in Vercel.' }, 503);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const attempts = loginAttempts.get(ip) || { count: 0, until: 0 };
  if (attempts.until > Date.now()) return json({ error: 'Too many attempts. Wait a few minutes and try again.' }, 429);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Enter the admin password.' }, 400); }
  if (!safeEqual(body?.password || '', config.password)) {
    attempts.count++;
    if (attempts.count >= 5) { attempts.count = 0; attempts.until = Date.now() + 5 * 60 * 1000; }
    loginAttempts.set(ip, attempts);
    return json({ error: 'That password did not match.' }, 401);
  }
  loginAttempts.delete(ip);
  const token = signedSession(config.secret, Date.now() + SESSION_TTL * 1000);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return json({ authenticated: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL}${secure}` });
}

export async function session(request) {
  const config = secrets();
  const googleConfigured = !!googleConfig();
  if (!config) return json({ configured: false, authenticated: false, googleConfigured }, 503);
  if (!sessionValid(request, config.secret)) return json({ configured: true, authenticated: false, googleConfigured }, 401);
  return json({ configured: true, authenticated: true, googleConfigured, storage: await getStoreMode() });
}

export async function googleStart(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const config = googleConfig();
  if (!config) return redirect('/?auth_error=google_unavailable');
  const state = randomBytes(32).toString('base64url');
  const callback = new URL('/api/auth/google/callback', new URL(request.url).origin).toString();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callback, response_type: 'code', scope: 'openid email', state, prompt: 'select_account' }).toString();
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return redirect(url.toString(), [`${OAUTH_STATE_COOKIE}=${state}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=600${secure}`]);
}

export async function googleCallback(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const config = googleConfig();
  if (!config || !secrets()) return redirect('/?auth_error=google_unavailable');
  const url = new URL(request.url);
  const clearState = `${OAUTH_STATE_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`;
  if (url.searchParams.has('error')) return redirect('/?auth_error=google_denied', [clearState]);
  const state = url.searchParams.get('state') || '';
  const cookieState = cookieValue(request, OAUTH_STATE_COOKIE);
  if (!state || !cookieState || !safeEqual(state, cookieState)) return redirect('/?auth_error=google_failed', [clearState]);
  const code = url.searchParams.get('code');
  if (!code) return redirect('/?auth_error=google_failed', [clearState]);
  try {
    const callback = new URL('/api/auth/google/callback', url.origin).toString();
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: callback, grant_type: 'authorization_code' }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.id_token) throw new Error('Google token exchange failed');
    const infoResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenData.id_token)}`, { signal: AbortSignal.timeout(10000) });
    const info = await infoResponse.json();
    const issuerOk = info.iss === 'accounts.google.com' || info.iss === 'https://accounts.google.com';
    if (!infoResponse.ok || info.aud !== config.clientId || !issuerOk || info.email_verified !== 'true' || String(info.email || '').toLowerCase() !== config.adminEmail || Number(info.exp) <= Math.floor(Date.now() / 1000)) {
      return redirect('/?auth_error=google_rejected', [clearState]);
    }
    const token = signedSession(secrets().secret, Date.now() + SESSION_TTL * 1000);
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    const sessionCookie = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL}${secure}`;
    return redirect('/', [clearState, sessionCookie]);
  } catch (error) {
    console.error('Gearhouse Google sign-in failed:', error.message);
    return redirect('/?auth_error=google_failed', [clearState]);
  }
}

export async function logout(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!sameOrigin(request)) return json({ error: 'Request origin rejected.' }, 403);
  return json({ authenticated: false }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0` });
}

export async function state(request) {
  const { error } = await authRequired(request);
  if (error) return error;
  try {
    if (request.method === 'GET') return json(await loadState());
    if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, PUT' });
    if (!sameOrigin(request)) return json({ error: 'Request origin rejected.' }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Workspace data could not be read.' }, 400); }
    const problem = checkState(body);
    if (problem) return json({ error: problem }, 400);
    await saveState(body);
    return json({ saved: true, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Gearhouse state request failed:', error);
    return json({ error: 'The data store is not available. Check the local database or MongoDB connection.' }, 503);
  }
}

export async function health() {
  try { return json({ ok: true, storage: await getStoreMode() }); }
  catch (error) { console.error('Gearhouse health check failed:', error); return json({ ok: false, error: 'Data store is not configured.' }, 503); }
}

export async function catalog(request) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  try {
    const state = await loadState();
    const products = state.products.filter(p => p.active !== false && Number(p.quantity) > 0).map(p => ({
      id: String(p.id), name: p.name, sku: p.sku || '', category: p.category || 'Other',
      brand: p.brand || '', fitment: p.fitment || '', price: Number(p.price) || 0,
    }));
    return json({
      settings: { shopName: state.settings.shopName, currency: state.settings.currency, phone: state.settings.phone, address: state.settings.address },
      products,
    }, 200, { 'cache-control': 'no-store' });
  } catch (error) {
    console.error('Gearhouse catalog request failed:', error);
    return json({ error: 'The parts catalog is temporarily unavailable.' }, 503);
  }
}

export async function createOrder(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!sameOrigin(request)) return json({ error: 'Request origin rejected.' }, 403);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const attempt = orderAttempts.get(ip) || { count: 0, until: Date.now() + 60_000 };
  if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 60_000; }
  if (attempt.count >= 10) return json({ error: 'Too many order requests. Please wait a minute and try again.' }, 429);
  attempt.count++; orderAttempts.set(ip, attempt);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Order details could not be read.' }, 400); }
  const name = String(body?.customer?.name || '').trim().slice(0, 120);
  const phone = String(body?.customer?.phone || '').trim().slice(0, 30);
  const email = String(body?.customer?.email || '').trim().slice(0, 254);
  const note = String(body?.note || '').trim().slice(0, 600);
  if (name.length < 2 || phone.replace(/\D/g, '').length < 6 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json({ error: 'Enter a name, a valid phone number, and a valid email if provided.' }, 400);
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 20) return json({ error: 'Add at least one part to your basket.' }, 400);
  const quantities = new Map();
  for (const line of body.items) {
    const id = String(line?.productId || ''); const qty = Number(line?.qty);
    if (!id || !Number.isInteger(qty) || qty < 1 || qty > 30) return json({ error: 'One of the requested quantities is invalid.' }, 400);
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }
  try {
    const state = await loadState();
    const items = [];
    for (const [id, qty] of quantities) {
      const product = state.products.find(p => String(p.id) === id && p.active !== false);
      if (!product || Number(product.quantity) < qty) return json({ error: `${product?.name || 'A selected part'} no longer has enough stock. Refresh the catalog and update your basket.` }, 409);
      items.push({ productId: id, name: String(product.name), sku: String(product.sku || ''), qty, price: Number(product.price) || 0 });
    }
    const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
    const now = new Date(); const day = now.toISOString().slice(0, 10).replaceAll('-', '').slice(2);
    const orderNo = `GH-R-${day}-${randomBytes(2).toString('hex').toUpperCase()}`;
    const order = { id: randomUUID(), orderNo, date: now.toISOString(), status: 'new', customer: { name, phone, email }, note, items, total, currency: state.settings.currency || 'INR' };
    state.orders.push(order);
    await saveState(state);
    return json({ accepted: true, orderNo }, 201);
  } catch (error) {
    console.error('Gearhouse order request failed:', error);
    return json({ error: 'We could not save your request. Please call the shop and try again later.' }, 503);
  }
}
