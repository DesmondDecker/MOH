const { checkAllergyConflict, checkDrugInteractions } = require('../../services/drugInteractionService');

describe('drugInteractionService — checkAllergyConflict', () => {
  test('catches a direct substance substring match', () => {
    const patient = { allergies: [{ substance: 'sulfa drugs' }] };
    const result = checkAllergyConflict(patient, 'sulfa');
    expect(result).not.toBeNull();
    expect(result.matchType).toBe('direct');
  });

  test('catches cross-class reactivity even when the words share no substring (penicillin allergy vs amoxicillin)', () => {
    const patient = { allergies: [{ substance: 'penicillin', reaction: 'anaphylaxis', severity: 'severe' }] };
    const result = checkAllergyConflict(patient, 'amoxicillin');
    expect(result).not.toBeNull();
    expect(result.matchType).toBe('cross_reactivity');
    expect(result.allergy.substance).toBe('penicillin');
  });

  test('resolves a brand name to its generic before checking (Augmentin -> amoxicillin-clavulanate -> penicillin class)', () => {
    const patient = { allergies: [{ substance: 'penicillin' }] };
    const result = checkAllergyConflict(patient, 'Augmentin');
    expect(result).not.toBeNull();
    expect(result.matchType).toBe('cross_reactivity');
  });

  test('returns null for an unrelated drug', () => {
    const patient = { allergies: [{ substance: 'penicillin' }] };
    expect(checkAllergyConflict(patient, 'paracetamol')).toBeNull();
  });

  test('returns null when the patient has no recorded allergies', () => {
    expect(checkAllergyConflict({ allergies: [] }, 'amoxicillin')).toBeNull();
    expect(checkAllergyConflict({}, 'amoxicillin')).toBeNull();
  });

  test('is case-insensitive', () => {
    const patient = { allergies: [{ substance: 'PENICILLIN' }] };
    expect(checkAllergyConflict(patient, 'Amoxicillin')).not.toBeNull();
  });
});

describe('drugInteractionService — checkDrugInteractions', () => {
  test('flags a known major interaction (warfarin + NSAID)', () => {
    const results = checkDrugInteractions('ibuprofen', ['warfarin']);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe('major');
    expect(results[0].withDrug).toBe('warfarin');
  });

  test('interaction rule fires regardless of which drug is "new" vs "existing"', () => {
    const a = checkDrugInteractions('ibuprofen', ['warfarin']);
    const b = checkDrugInteractions('warfarin', ['ibuprofen']);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0].severity).toBe(b[0].severity);
  });

  test('flags multiple simultaneous interactions against a polypharmacy list', () => {
    const results = checkDrugInteractions('ibuprofen', ['warfarin', 'enalapril']);
    expect(results).toHaveLength(2);
    const withDrugs = results.map((r) => r.withDrug).sort();
    expect(withDrugs).toEqual(['enalapril', 'warfarin']);
  });

  test('returns empty array for unrelated drugs', () => {
    expect(checkDrugInteractions('paracetamol', ['amoxicillin'])).toEqual([]);
  });

  test('does not flag a drug against itself', () => {
    expect(checkDrugInteractions('warfarin', ['warfarin'])).toEqual([]);
  });

  test('returns empty array when there are no active medications to check against', () => {
    expect(checkDrugInteractions('warfarin', [])).toEqual([]);
  });

  test('handles an unrecognized drug name without throwing', () => {
    expect(() => checkDrugInteractions('some-unlisted-drug-xyz', ['warfarin'])).not.toThrow();
    expect(checkDrugInteractions('some-unlisted-drug-xyz', ['warfarin'])).toEqual([]);
  });
});
