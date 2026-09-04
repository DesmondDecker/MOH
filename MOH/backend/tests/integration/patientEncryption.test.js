const request = require('supertest');

const createApp = require('../../app');
const { startTestDb, stopTestDb, clearTestDb } = require('../testDb');
const User = require('../../models/User');
const Facility = require('../../models/Facility');
const Patient = require('../../models/Patient');
const { signAccessToken } = require('../../services/tokenService');

const app = createApp();

async function createDoctorSession() {
  const facility = await Facility.create({
    name: 'Connaught Hospital',
    code: 'CON-02',
    district: 'Western Area Urban',
    type: 'national_referral',
  });
  const doctor = new User({
    role: 'doctor',
    fullName: 'Dr. Test',
    username: 'doctor.test',
    facilityId: facility._id,
    mustChangePassword: false,
  });
  await doctor.setPassword('CorrectHorse123!');
  await doctor.save();
  return { doctor, facility, token: signAccessToken(doctor) };
}

describe('Patient encryption + search (integration)', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  test('nationalId and phone are stored encrypted at rest, not as plaintext', async () => {
    const { facility, doctor } = await createDoctorSession();

    const patient = await Patient.create({
      mrn: 'SL-2026-000001',
      fullName: 'Fatmata Kamara',
      dateOfBirth: new Date('1990-01-01'),
      sex: 'female',
      nationalId: '19900101-000-1',
      phone: '076123456',
      identityTier: 'verified',
      registeredAtFacility: facility._id,
      registeredBy: doctor._id,
    });

    // Read the RAW stored document, bypassing Mongoose getters, the way a
    // database dump or a compromised read-replica would see it.
    const raw = await Patient.collection.findOne({ _id: patient._id });

    expect(raw.nationalId).not.toBe('19900101-000-1');
    expect(raw.nationalId.startsWith('v1:')).toBe(true);
    expect(raw.phone).not.toBe('076123456');
    expect(raw.phone.startsWith('v1:')).toBe(true);

    // But the app-level getter transparently decrypts it back.
    const reloaded = await Patient.findById(patient._id);
    expect(reloaded.nationalId).toBe('19900101-000-1');
    expect(reloaded.phone).toBe('076123456');
  });

  test('exact-match search by national ID works via blind index despite non-deterministic ciphertext', async () => {
    const { facility, doctor, token } = await createDoctorSession();

    await Patient.create({
      mrn: 'SL-2026-000002',
      fullName: 'Ibrahim Sesay',
      dateOfBirth: new Date('1985-05-05'),
      sex: 'male',
      nationalId: '19850505-000-2',
      identityTier: 'verified',
      registeredAtFacility: facility._id,
      registeredBy: doctor._id,
    });

    const res = await request(app)
      .get('/api/patients/search')
      .query({ query: '19850505-000-2' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fullName).toBe('Ibrahim Sesay');
  });

  test('two patients registered with the same national ID are flagged as duplicate candidates', async () => {
    const { facility, doctor } = await createDoctorSession();
    const { findCandidateDuplicates } = require('../../services/deduplicationService');

    const first = await Patient.create({
      mrn: 'SL-2026-000003',
      fullName: 'Aminata Bangura',
      dateOfBirth: new Date('1992-03-03'),
      sex: 'female',
      nationalId: '19920303-000-3',
      identityTier: 'verified',
      registeredAtFacility: facility._id,
      registeredBy: doctor._id,
    });

    const second = await Patient.create({
      mrn: 'SL-2026-000004',
      fullName: 'Aminata Bangura-Kargbo', // slightly different spelling, same national ID
      dateOfBirth: new Date('1992-03-03'),
      sex: 'female',
      nationalId: '19920303-000-3',
      identityTier: 'verified',
      registeredAtFacility: facility._id,
      registeredBy: doctor._id,
    });

    const candidates = await findCandidateDuplicates(second);
    expect(candidates.some((c) => c.patientId.toString() === first._id.toString())).toBe(true);
    expect(candidates[0].matchedOn).toContain('nationalId');
    expect(candidates[0].matchScore).toBe(1.0);
  });
});
