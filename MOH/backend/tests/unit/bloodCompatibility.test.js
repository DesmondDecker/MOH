const { compatibleDonorTypes, ALL_BLOOD_TYPES } = require('../../constants/bloodCompatibility');
const { computeExpiryDate } = require('../../services/bloodBankService');

describe('bloodCompatibility — red cell products', () => {
  test('O- is the universal red-cell donor (compatible with every recipient type)', () => {
    for (const recipient of ALL_BLOOD_TYPES) {
      expect(compatibleDonorTypes(recipient, 'packed_red_cells')).toContain('O-');
    }
  });

  test('AB+ is the universal red-cell recipient (compatible with every donor type)', () => {
    const donors = compatibleDonorTypes('AB+', 'packed_red_cells');
    expect(donors.sort()).toEqual([...ALL_BLOOD_TYPES].sort());
  });

  test('O- recipient can only receive O- (most restrictive)', () => {
    expect(compatibleDonorTypes('O-', 'packed_red_cells')).toEqual(['O-']);
  });

  test('Rh-negative recipients never match with Rh-positive donors', () => {
    const negativeRecipients = ALL_BLOOD_TYPES.filter((t) => t.endsWith('-'));
    for (const recipient of negativeRecipients) {
      const donors = compatibleDonorTypes(recipient, 'whole_blood');
      expect(donors.every((d) => d.endsWith('-'))).toBe(true);
    }
  });

  test('Rh-positive recipients can receive from both Rh-negative and Rh-positive, given ABO match', () => {
    const donors = compatibleDonorTypes('A+', 'packed_red_cells');
    expect(donors).toEqual(expect.arrayContaining(['A-', 'A+', 'O-', 'O+']));
  });
});

describe('bloodCompatibility — plasma products (mirror-image ABO rule, no Rh gating)', () => {
  test('AB is the universal plasma donor (present in every recipient\u2019s compatible list)', () => {
    for (const recipient of ALL_BLOOD_TYPES) {
      const donors = compatibleDonorTypes(recipient, 'fresh_frozen_plasma');
      expect(donors.some((d) => d.startsWith('AB'))).toBe(true);
    }
  });

  test('O recipients are the universal plasma recipient (compatible with every donor ABO group)', () => {
    const donors = compatibleDonorTypes('O+', 'fresh_frozen_plasma').map((d) => d.replace(/[+-]$/, ''));
    expect(new Set(donors)).toEqual(new Set(['O', 'A', 'B', 'AB']));
  });

  test('AB recipients are the most restrictive plasma recipients (only AB donor plasma)', () => {
    const donors = compatibleDonorTypes('AB+', 'fresh_frozen_plasma').map((d) => d.replace(/[+-]$/, ''));
    expect(new Set(donors)).toEqual(new Set(['AB']));
  });

  test('plasma compatibility does not depend on recipient Rh (AB+ and AB- get the same donor ABO groups)', () => {
    const positiveVariant = compatibleDonorTypes('AB+', 'cryoprecipitate').map((d) => d.replace(/[+-]$/, '')).sort();
    const negativeVariant = compatibleDonorTypes('AB-', 'cryoprecipitate').map((d) => d.replace(/[+-]$/, '')).sort();
    expect(positiveVariant).toEqual(negativeVariant);
  });
});

describe('bloodCompatibility — invalid input', () => {
  test('returns an empty array for an unrecognized recipient type rather than throwing', () => {
    expect(compatibleDonorTypes('X+', 'packed_red_cells')).toEqual([]);
  });
});

describe('bloodBankService — computeExpiryDate', () => {
  test('platelets expire in 5 days (shortest-lived component)', () => {
    const collected = new Date('2026-01-01T00:00:00Z');
    const expiry = computeExpiryDate(collected, 'platelets');
    expect(expiry.getTime() - collected.getTime()).toBe(5 * 24 * 60 * 60 * 1000);
  });

  test('fresh frozen plasma expires in 365 days (longest-lived component)', () => {
    const collected = new Date('2026-01-01T00:00:00Z');
    const expiry = computeExpiryDate(collected, 'fresh_frozen_plasma');
    expect(expiry.getTime() - collected.getTime()).toBe(365 * 24 * 60 * 60 * 1000);
  });

  test('packed red cells expire in 42 days, whole blood in 35 (real clinical difference between the two)', () => {
    const collected = new Date('2026-01-01T00:00:00Z');
    const prcExpiry = computeExpiryDate(collected, 'packed_red_cells');
    const wbExpiry = computeExpiryDate(collected, 'whole_blood');
    expect(prcExpiry.getTime()).toBeGreaterThan(wbExpiry.getTime());
  });

  test('throws on an unrecognized component rather than silently computing a wrong expiry', () => {
    expect(() => computeExpiryDate(new Date(), 'not_a_real_component')).toThrow();
  });
});
