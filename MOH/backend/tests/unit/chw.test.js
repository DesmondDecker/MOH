const { syncBatchSchema, outreachVisitSchema } = require('../../validation/chwSchemas');

describe('chwSchemas — outreachVisitSchema', () => {
  const base = {
    clientVisitId: 'uuid-1',
    visitType: 'immunization_outreach',
    visitDate: '2026-01-15',
    recordedOfflineAt: '2026-01-15T10:00:00Z',
  };

  test('accepts a visit with a provisionalSubject', () => {
    const result = outreachVisitSchema.safeParse({ ...base, provisionalSubject: { fullName: 'Baby Kamara' } });
    expect(result.success).toBe(true);
  });

  test('accepts a visit with a patientId', () => {
    const result = outreachVisitSchema.safeParse({ ...base, patientId: '507f1f77bcf86cd799439011' });
    expect(result.success).toBe(true);
  });

  test('the either/or (patientId vs provisionalSubject) rule is enforced in the route, not the schema', () => {
    // The schema alone permits a visit with neither, since Zod can't
    // cleanly express "exactly one of these differently-shaped fields" —
    // routes/chw.js checks this explicitly per-record in the sync batch.
    const result = outreachVisitSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  test('rejects an invalid visitType', () => {
    const result = outreachVisitSchema.safeParse({ ...base, provisionalSubject: { fullName: 'X' }, visitType: 'not_a_real_type' });
    expect(result.success).toBe(false);
  });

  test('rejects an invalid danger sign', () => {
    const result = outreachVisitSchema.safeParse({
      ...base,
      provisionalSubject: { fullName: 'X' },
      dangerSignsObserved: ['not_a_real_sign'],
    });
    expect(result.success).toBe(false);
  });

  test('requires clientVisitId', () => {
    const { clientVisitId, ...withoutId } = base;
    const result = outreachVisitSchema.safeParse({ ...withoutId, provisionalSubject: { fullName: 'X' } });
    expect(result.success).toBe(false);
  });
});

describe('chwSchemas — syncBatchSchema', () => {
  function makeVisit(id) {
    return {
      clientVisitId: id,
      provisionalSubject: { fullName: 'Test Subject' },
      visitType: 'other',
      visitDate: '2026-01-15',
      recordedOfflineAt: '2026-01-15',
    };
  }

  test('accepts a batch of visits', () => {
    const result = syncBatchSchema.safeParse({ visits: [makeVisit('a'), makeVisit('b')] });
    expect(result.success).toBe(true);
  });

  test('rejects an empty batch', () => {
    expect(syncBatchSchema.safeParse({ visits: [] }).success).toBe(false);
  });

  test('rejects a batch larger than 200 visits', () => {
    const visits = Array.from({ length: 201 }, (_, i) => makeVisit(`v${i}`));
    expect(syncBatchSchema.safeParse({ visits }).success).toBe(false);
  });

  test('accepts exactly 200 visits (the boundary)', () => {
    const visits = Array.from({ length: 200 }, (_, i) => makeVisit(`v${i}`));
    expect(syncBatchSchema.safeParse({ visits }).success).toBe(true);
  });
});
