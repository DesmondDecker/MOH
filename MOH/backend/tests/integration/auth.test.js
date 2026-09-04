const request = require('supertest');
const { authenticator } = require('otplib');

const createApp = require('../../app');
const { startTestDb, stopTestDb, clearTestDb } = require('../testDb');
const User = require('../../models/User');
const Facility = require('../../models/Facility');

const app = createApp();

async function createFacility() {
  return Facility.create({
    name: 'Connaught Hospital',
    code: 'CON-01',
    district: 'Western Area Urban',
    type: 'national_referral',
  });
}

async function createUser({ role, username, password }) {
  const facility = role === 'moh_super_admin' ? undefined : await createFacility();
  const user = new User({
    role,
    fullName: 'Test User',
    username,
    facilityId: facility?._id,
    mustChangePassword: false,
  });
  await user.setPassword(password);
  await user.save();
  return user;
}

describe('POST /api/auth/login — full flow (integration)', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  test('a role that does NOT require 2FA (nurse) gets a real session immediately', async () => {
    await createUser({ role: 'nurse', username: 'nurse1', password: 'CorrectHorse123!' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nurse1', password: 'CorrectHorse123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.role).toBe('nurse');
  });

  test('wrong password is rejected with a generic message (no user-existence leak)', async () => {
    await createUser({ role: 'nurse', username: 'nurse2', password: 'CorrectHorse123!' });

    const resWrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nurse2', password: 'wrong' });
    const resUnknownUser = await request(app)
      .post('/api/auth/login')
      .send({ username: 'doesnotexist', password: 'wrong' });

    expect(resWrongPassword.status).toBe(401);
    expect(resUnknownUser.status).toBe(401);
    expect(resWrongPassword.body.error).toBe(resUnknownUser.body.error);
  });

  test('account locks after 5 failed attempts and rejects even the correct password while locked', async () => {
    await createUser({ role: 'nurse', username: 'nurse3', password: 'CorrectHorse123!' });

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: 'nurse3', password: 'wrong' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nurse3', password: 'CorrectHorse123!' });

    expect(res.status).toBe(423);
  });

  test('facility_admin without 2FA set up cannot get a real session — gets a setup-scoped token instead', async () => {
    await createUser({ role: 'facility_admin', username: 'admin1', password: 'CorrectHorse123!' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin1', password: 'CorrectHorse123!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeUndefined(); // the critical assertion — no real session yet
    expect(res.body.twoFactorSetupRequired).toBe(true);
    expect(res.body.mfaToken).toBeDefined();
  });

  test('full mandatory-2FA enrollment flow: login → setup → enable → real session', async () => {
    await createUser({ role: 'facility_admin', username: 'admin2', password: 'CorrectHorse123!' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin2', password: 'CorrectHorse123!' });
    const { mfaToken } = loginRes.body;

    const setupRes = await request(app).post('/api/auth/2fa/setup').send({ mfaToken });
    expect(setupRes.status).toBe(200);
    expect(setupRes.body.manualEntryKey).toBeDefined();
    expect(setupRes.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const validCode = authenticator.generate(setupRes.body.manualEntryKey);
    const enableRes = await request(app).post('/api/auth/2fa/enable').send({ mfaToken, code: validCode });

    expect(enableRes.status).toBe(200);
    expect(enableRes.body.accessToken).toBeDefined(); // session finally issued
    expect(enableRes.body.backupCodes).toHaveLength(10);

    const dbUser = await User.findOne({ username: 'admin2' });
    expect(dbUser.twoFactor.enabled).toBe(true);
  });

  test('once 2FA is enabled, subsequent logins require a code and reject a wrong one', async () => {
    const user = await createUser({ role: 'facility_admin', username: 'admin3', password: 'CorrectHorse123!' });

    // Enroll directly against the model to isolate this test from the setup flow above.
    const secret = authenticator.generateSecret();
    user.twoFactor = { enabled: true, secret, enabledAt: new Date() };
    await user.save();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin3', password: 'CorrectHorse123!' });
    expect(loginRes.body.mfaRequired).toBe(true);
    expect(loginRes.body.accessToken).toBeUndefined();

    const wrongCodeRes = await request(app)
      .post('/api/auth/2fa/verify-login')
      .send({ mfaToken: loginRes.body.mfaToken, code: '000000' });
    expect(wrongCodeRes.status).toBe(401);

    const validCode = authenticator.generate(secret);
    const rightCodeRes = await request(app)
      .post('/api/auth/2fa/verify-login')
      .send({ mfaToken: loginRes.body.mfaToken, code: validCode });
    expect(rightCodeRes.status).toBe(200);
    expect(rightCodeRes.body.accessToken).toBeDefined();
  });

  test('a backup code works once and is then rejected on reuse', async () => {
    const user = await createUser({ role: 'facility_admin', username: 'admin4', password: 'CorrectHorse123!' });
    const secret = authenticator.generateSecret();
    const bcrypt = require('bcryptjs');
    const backupCode = 'AAAA-BBBBBB';
    user.twoFactor = {
      enabled: true,
      secret,
      enabledAt: new Date(),
      backupCodeHashes: [await bcrypt.hash(backupCode, 10)],
    };
    await user.save();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin4', password: 'CorrectHorse123!' });

    const firstUse = await request(app)
      .post('/api/auth/2fa/verify-login')
      .send({ mfaToken: loginRes.body.mfaToken, code: backupCode });
    expect(firstUse.status).toBe(200);

    // Get a fresh mfaToken for a second login attempt, then try the same backup code again.
    const secondLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin4', password: 'CorrectHorse123!' });
    const secondUse = await request(app)
      .post('/api/auth/2fa/verify-login')
      .send({ mfaToken: secondLoginRes.body.mfaToken, code: backupCode });
    expect(secondUse.status).toBe(401); // single-use — already consumed
  });
});
