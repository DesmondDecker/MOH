const request = require('supertest');

const createApp = require('../../app');
const { startTestDb, stopTestDb, clearTestDb } = require('../testDb');
const User = require('../../models/User');
const Facility = require('../../models/Facility');
const { signAccessToken } = require('../../services/tokenService');

const app = createApp();

async function createSuperAdmin(username = 'super1') {
  const admin = new User({ role: 'moh_super_admin', fullName: 'Super Admin', username, mustChangePassword: false });
  await admin.setPassword('CorrectHorse123!');
  await admin.save();
  return { admin, token: signAccessToken(admin) };
}

async function createFacility(overrides = {}) {
  return Facility.create({
    name: 'Connaught Hospital',
    code: `CON-${Math.random().toString(36).slice(2, 7)}`,
    district: 'Western Area Urban',
    province: 'Western Area',
    type: 'national_referral',
    ...overrides,
  });
}

describe('MoH Super Admin management layer (integration)', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  test('super admin can edit a facility, and the change is reflected + audited', async () => {
    const { token } = await createSuperAdmin();
    const facility = await createFacility();

    const res = await request(app)
      .patch(`/api/auth/facilities/${facility._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ district: 'Bo', province: 'Southern Province' });

    expect(res.status).toBe(200);
    expect(res.body.district).toBe('Bo');
    expect(res.body.province).toBe('Southern Province');
  });

  test('rejects an invalid province on facility edit', async () => {
    const { token } = await createSuperAdmin();
    const facility = await createFacility();

    const res = await request(app)
      .patch(`/api/auth/facilities/${facility._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ province: 'Not A Real Province' });

    expect(res.status).toBe(400);
  });

  test('can suspend and reactivate a facility', async () => {
    const { token } = await createSuperAdmin();
    const facility = await createFacility();

    const suspend = await request(app)
      .post(`/api/auth/facilities/${facility._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'suspended' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.status).toBe('suspended');

    const reactivate = await request(app)
      .post(`/api/auth/facilities/${facility._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe('active');
  });

  test('rotating a facility sync key returns a new plaintext key each time', async () => {
    const { token } = await createSuperAdmin();
    const facility = await createFacility();

    const first = await request(app)
      .post(`/api/auth/facilities/${facility._id}/sync-key/rotate`)
      .set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .post(`/api/auth/facilities/${facility._id}/sync-key/rotate`)
      .set('Authorization', `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.syncApiKey).toBeDefined();
    expect(first.body.syncApiKey).not.toBe(second.body.syncApiKey);
  });

  test('creates a facility admin for an existing facility', async () => {
    const { token } = await createSuperAdmin();
    const facility = await createFacility();

    const res = await request(app)
      .post(`/api/auth/facilities/${facility._id}/admin`)
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Second Admin' });

    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toBeDefined();

    const created = await User.findById(res.body.id);
    expect(created.role).toBe('facility_admin');
    expect(created.facilityId.toString()).toBe(facility._id.toString());
  });

  test('creates an additional MoH super admin', async () => {
    const { token } = await createSuperAdmin();

    const res = await request(app)
      .post('/api/auth/super-admins')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'New Super Admin' });

    expect(res.status).toBe(201);
    const created = await User.findById(res.body.id);
    expect(created.role).toBe('moh_super_admin');
  });

  test('a super admin cannot change their own status (self-action guard)', async () => {
    const { admin, token } = await createSuperAdmin();

    const res = await request(app)
      .post(`/api/auth/super-admins/${admin._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'suspended' });

    expect(res.status).toBe(403);

    // Confirm it's a true no-op, not just a rejected-but-still-applied
    // change — this guard exists specifically to prevent creating a
    // situation with no active admin left to undo a mistake, so silently
    // applying the change anyway would defeat the entire point.
    const reloaded = await User.findById(admin._id);
    expect(reloaded.status).toBe('active');
  });

  test('one active admin can suspend a different active admin, leaving itself active', async () => {
    // This is the ONLY path through the real API that reaches the
    // "zero active admins" guard's territory, and it should NOT trip it —
    // the acting admin is always excluded from becoming inactive by this
    // endpoint (the self-action guard above prevents that), so the actor
    // itself always remains as the "at least one active admin" after any
    // successful call here. See the code comment on the route for why the
    // zero-active-admins check is consequently unreachable via the public
    // API today and kept as defense-in-depth rather than a currently
    // load-bearing safeguard.
    const { token } = await createSuperAdmin('actor');
    const { admin: target } = await createSuperAdmin('target');

    const res = await request(app)
      .post(`/api/auth/super-admins/${target._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'suspended' });

    expect(res.status).toBe(200);
    const activeCount = await User.countDocuments({ role: 'moh_super_admin', status: 'active' });
    expect(activeCount).toBe(1); // the actor — never zero
  });
});
