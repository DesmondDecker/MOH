const { createPatientSchema, updatePatientSchema } = require('../../validation/patientSchemas');
const { createEncounterSchema, addDiagnosisSchema } = require('../../validation/encounterSchemas');
const { loginSchema, createFacilitySchema } = require('../../validation/authSchemas');

describe('patientSchemas', () => {
  test('accepts a minimal valid patient', () => {
    const result = createPatientSchema.safeParse({ fullName: 'Fatmata Kamara', sex: 'female' });
    expect(result.success).toBe(true);
  });

  test('rejects a missing fullName', () => {
    const result = createPatientSchema.safeParse({ sex: 'female' });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid sex value', () => {
    const result = createPatientSchema.safeParse({ fullName: 'Test', sex: 'MALE' });
    expect(result.success).toBe(false);
  });

  test('rejects a future date of birth', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = createPatientSchema.safeParse({ fullName: 'Test', sex: 'male', dateOfBirth: future });
    expect(result.success).toBe(false);
  });

  test('rejects a malformed phone number', () => {
    const result = createPatientSchema.safeParse({ fullName: 'Test', sex: 'male', phone: 'not-a-number' });
    expect(result.success).toBe(false);
  });

  test('accepts a well-formed Sierra Leone phone number', () => {
    const result = createPatientSchema.safeParse({ fullName: 'Test', sex: 'male', phone: '076123456' });
    expect(result.success).toBe(true);
  });

  test('updatePatientSchema rejects an empty body (no fields to update)', () => {
    const result = updatePatientSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('updatePatientSchema accepts a single field', () => {
    const result = updatePatientSchema.safeParse({ district: 'Bo' });
    expect(result.success).toBe(true);
  });
});

describe('encounterSchemas', () => {
  const validId = '507f1f77bcf86cd799439011';

  test('accepts a minimal valid encounter', () => {
    const result = createEncounterSchema.safeParse({ patientId: validId, type: 'outpatient' });
    expect(result.success).toBe(true);
  });

  test('rejects a malformed patientId', () => {
    const result = createEncounterSchema.safeParse({ patientId: 'not-an-id', type: 'outpatient' });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid encounter type', () => {
    const result = createEncounterSchema.safeParse({ patientId: validId, type: 'not-a-type' });
    expect(result.success).toBe(false);
  });

  test('rejects physiologically impossible vitals', () => {
    const result = createEncounterSchema.safeParse({
      patientId: validId,
      type: 'outpatient',
      vitals: { heartRateBpm: 900 },
    });
    expect(result.success).toBe(false);
  });

  test('rejects systolic BP not greater than diastolic', () => {
    const result = createEncounterSchema.safeParse({
      patientId: validId,
      type: 'outpatient',
      vitals: { bloodPressureSystolic: 70, bloodPressureDiastolic: 90 },
    });
    expect(result.success).toBe(false);
  });

  test('requires justification when emergencyOverride.used is true', () => {
    const result = createEncounterSchema.safeParse({
      patientId: validId,
      type: 'emergency',
      emergencyOverride: { used: true },
    });
    expect(result.success).toBe(false);
  });

  test('accepts a valid ICD-10 code on a diagnosis', () => {
    const result = addDiagnosisSchema.safeParse({ description: 'Malaria', icd10Code: 'B54' });
    expect(result.success).toBe(true);
  });

  test('rejects a malformed ICD-10 code', () => {
    const result = addDiagnosisSchema.safeParse({ description: 'Malaria', icd10Code: 'not-a-code' });
    expect(result.success).toBe(false);
  });
});

describe('authSchemas', () => {
  test('loginSchema rejects an empty password', () => {
    const result = loginSchema.safeParse({ username: 'jdoe', password: '' });
    expect(result.success).toBe(false);
  });

  test('createFacilitySchema rejects an invalid admin email', () => {
    const result = createFacilitySchema.safeParse({
      name: 'Test Hospital',
      code: 'TST-01',
      district: 'Bo',
      type: 'district',
      adminFullName: 'Jane Doe',
      adminEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  test('createFacilitySchema accepts an empty-string admin email (optional field)', () => {
    const result = createFacilitySchema.safeParse({
      name: 'Test Hospital',
      code: 'TST-01',
      district: 'Bo',
      type: 'district',
      adminFullName: 'Jane Doe',
      adminEmail: '',
    });
    expect(result.success).toBe(true);
  });

  test('createFacilitySchema rejects an invalid facility type', () => {
    const result = createFacilitySchema.safeParse({
      name: 'Test Hospital',
      code: 'TST-01',
      district: 'Bo',
      type: 'not-a-real-type',
      adminFullName: 'Jane Doe',
    });
    expect(result.success).toBe(false);
  });
});
