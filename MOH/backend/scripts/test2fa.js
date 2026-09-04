const fetch = global.fetch || require('node-fetch');

const BASE = 'http://localhost:5000';
const USERNAME = 'moh.superadmin';
const PASSWORD = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || 'ChangeMeImmediately123!';

async function post(path, body, extra = {}) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(extra.headers || {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch (e) { json = text; }
  return { status: res.status, body: json };
}

async function main() {
  console.log('Logging in...');
  const login = await post('/api/auth/login', { username: USERNAME, password: PASSWORD });
  console.log('Login response:', login.status, JSON.stringify(login.body, null, 2));

  if (login.body && (login.body.mfaToken || login.body.mfaRequired || login.body.twoFactorSetupRequired)) {
    const mfaToken = login.body.mfaToken || login.body.mfaToken;
    console.log('Calling 2FA setup with mfaToken...');
    const setup = await post('/api/auth/2fa/setup', { mfaToken });
    console.log('Setup response:', setup.status, JSON.stringify(setup.body, null, 2));
  } else {
    console.log('No MFA token returned; nothing to test.');
  }
}

main().catch((e) => { console.error('Error:', e); process.exit(1); });
