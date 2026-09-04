const fetch = global.fetch || require('node-fetch');
const { authenticator } = require('otplib');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
const PASSWORD = process.env.DEMO_PASSWORD || 'DemoPassword1!';

const USERS = [
  'user.sl_wa_connaught',
  'kamara.sl_wa_connaught',
  'sesay.sl_wa_connaught',
  'bangura.sl_wa_connaught',
  'conteh.sl_wa_connaught',
  'user.sl_bo_govhosp',
  'kamara.sl_bo_govhosp',
  'sesay.sl_bo_govhosp',
  'bangura.sl_bo_govhosp',
  'conteh.sl_bo_govhosp',
  'user.sl_ke_govhosp',
  'kamara.sl_ke_govhosp',
  'sesay.sl_ke_govhosp',
  'bangura.sl_ke_govhosp',
  'conteh.sl_ke_govhosp',
];

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function enableForUser(username) {
  try {
    console.log('\n==', username, '==');
    const login = await post('/api/auth/login', { username, password: PASSWORD });
    if (!login.body) return console.error('No JSON from login for', username, login.status);

    // If server responds with mfaToken (setup or login), use it
    if (login.body.mfaToken || login.body.mfaRequired || login.body.twoFactorSetupRequired) {
      const mfaToken = login.body.mfaToken || login.body.mfaToken; // defensive
      if (!mfaToken) return console.error('Expected mfaToken but none returned for', username);

      const setup = await post('/api/auth/2fa/setup', { mfaToken });
      if (!setup.body || !setup.body.manualEntryKey) return console.error('Setup failed for', username, JSON.stringify(setup.body));

      const manualKey = setup.body.manualEntryKey;
      const code = authenticator.generate(manualKey);
      const enable = await post('/api/auth/2fa/enable', { mfaToken, code });
      if (enable.status === 200) {
        console.log('Backup codes for', username, ':');
        (enable.body.backupCodes || []).forEach(c => console.log(c));
      } else {
        console.error('Enable failed for', username, enable.status, enable.body);
      }
      return;
    }

    // Otherwise we have an accessToken and can opt-in with Bearer token
    if (login.body.accessToken) {
      const token = login.body.accessToken;
      const setup = await post('/api/auth/2fa/setup', {}, token);
      if (!setup.body || !setup.body.manualEntryKey) return console.error('Setup (bearer) failed for', username, JSON.stringify(setup.body));
      const manualKey = setup.body.manualEntryKey;
      const code = authenticator.generate(manualKey);
      const enable = await post('/api/auth/2fa/enable', { code }, token);
      if (enable.status === 200) {
        console.log('Backup codes for', username, ':');
        (enable.body.backupCodes || []).forEach(c => console.log(c));
      } else {
        console.error('Enable (bearer) failed for', username, enable.status, enable.body);
      }
      return;
    }

    console.error('Unhandled login response for', username, JSON.stringify(login.body));
  } catch (err) {
    console.error('Error for', username, err.message || err);
  }
}

async function main() {
  for (const u of USERS) {
    // eslint-disable-next-line no-await-in-loop
    await enableForUser(u);
  }
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
