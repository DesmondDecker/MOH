const { levenshtein, nameSimilarity } = require('../../services/deduplicationService');

describe('deduplicationService — levenshtein', () => {
  test('identical strings have distance 0', () => {
    expect(levenshtein('Fatmata', 'Fatmata')).toBe(0);
  });

  test('one-character substitution has distance 1', () => {
    expect(levenshtein('Fatmata', 'Fatmatu')).toBe(1);
  });

  test('empty vs non-empty string equals the length of the non-empty one', () => {
    expect(levenshtein('', 'Kamara')).toBe(6);
    expect(levenshtein('Kamara', '')).toBe(6);
  });
});

describe('deduplicationService — nameSimilarity', () => {
  test('identical names score 1', () => {
    expect(nameSimilarity('Fatmata Kamara', 'Fatmata Kamara')).toBe(1);
  });

  test('is case-insensitive', () => {
    expect(nameSimilarity('FATMATA KAMARA', 'fatmata kamara')).toBe(1);
  });

  test('a common spelling variant scores high but not perfect', () => {
    const score = nameSimilarity('Fatmata Kamara', 'Fatumata Kamara');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1);
  });

  test('unrelated names score low', () => {
    const score = nameSimilarity('Fatmata Kamara', 'Ibrahim Sesay');
    expect(score).toBeLessThan(0.5);
  });

  test('handles empty/missing names without throwing', () => {
    expect(() => nameSimilarity('', 'Fatmata Kamara')).not.toThrow();
    expect(() => nameSimilarity(null, undefined)).not.toThrow();
  });
});
