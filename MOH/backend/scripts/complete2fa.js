const fetch = global.fetch || require('node-fetch');
const { authenticator } = require('otplib');

const BASE = 'http://localhost:5000';
const USERNAME = 'moh.superadmin';
const PASSWORD = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD || 'ChangeMeImmediately123!';

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function main() {
  console.log('Logging in as', USERNAME);
  const login = await post('/api/auth/login', { username: USERNAME, password: PASSWORD });
  console.log('Login status', login.status);
  if (!login.body) { console.error('No JSON body from login'); process.exit(1); }

  if (!login.body.mfaToken) {
    console.error('No mfaToken returned; cannot proceed. Response:', JSON.stringify(login.body, null, 2));
    process.exit(1);
  }
  const mfaToken = login.body.mfaToken;

  console.log('Requesting 2FA setup...');
  const setup = await post('/api/auth/2fa/setup', { mfaToken });
  console.log('Setup status', setup.status);
  if (!setup.body || !setup.body.manualEntryKey) {
    console.error('Setup did not return manualEntryKey. Response:', JSON.stringify(setup.body, null, 2));
    process.exit(1);
  }

  const manualKey = setup.body.manualEntryKey;
  console.log('Manual entry key:', manualKey);

  // Generate a current TOTP
  const code = authenticator.generate(manualKey);
  console.log('Generated TOTP code:', code);

  console.log('Enabling 2FA...');
  const enable = await post('/api/auth/2fa/enable', { mfaToken, code });
  console.log('Enable status', enable.status);
  console.log('Enable response:', JSON.stringify(enable.body, null, 2));

  if (enable.status === 200) {
    console.log('\n2FA enabled successfully. Backup codes (showed once):');
    console.log(enable.body.backupCodes || 'none');
  } else {
    console.error('Failed to enable 2FA.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
