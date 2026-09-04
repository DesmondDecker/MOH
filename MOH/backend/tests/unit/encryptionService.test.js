const enc = require('../../services/encryptionService');

describe('encryptionService', () => {
  test('round-trips a plaintext string through encrypt/decrypt', () => {
    const plaintext = 'SL-NIN-00219384';
    const ciphertext = enc.encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(enc.decrypt(ciphertext)).toBe(plaintext);
  });

  test('ciphertext is versioned and non-deterministic across calls', () => {
    const a = enc.encrypt('same value');
    const b = enc.encrypt('same value');
    expect(a).not.toBe(b); // random IV per call
    expect(a.startsWith('v1:')).toBe(true);
    expect(enc.decrypt(a)).toBe('same value');
    expect(enc.decrypt(b)).toBe('same value');
  });

  test('passes null/undefined/empty-string through unchanged', () => {
    expect(enc.encrypt(null)).toBeNull();
    expect(enc.encrypt(undefined)).toBeUndefined();
    expect(enc.encrypt('')).toBe('');
    expect(enc.decrypt(null)).toBeNull();
    expect(enc.decrypt(undefined)).toBeUndefined();
    expect(enc.decrypt('')).toBe('');
  });

  test('treats legacy/non-ciphertext strings as plaintext passthrough on decrypt', () => {
    // Guards the non-destructive-migration property: rows written before
    // encryption was introduced must keep reading correctly.
    expect(enc.decrypt('077123456')).toBe('077123456');
    expect(enc.isEncrypted('077123456')).toBe(false);
  });

  test('detects tampered ciphertext via GCM auth tag rather than returning garbage', () => {
    const ciphertext = enc.encrypt('sensitive value');
    const parts = ciphertext.split(':');
    parts[3] = Buffer.from('a-completely-different-payload').toString('base64');
    const tampered = parts.join(':');
    expect(() => enc.decrypt(tampered)).toThrow(/corrupted or tampered/);
  });

  test('blind index is deterministic and case/whitespace-normalized', () => {
    const a = enc.blindIndex('076123456');
    const b = enc.blindIndex('  076123456  ');
    expect(a).toBe(b);
    expect(a).toHaveLength(64); // hex-encoded SHA-256
  });

  test('blind index differs for different inputs (not a constant hash)', () => {
    expect(enc.blindIndex('076123456')).not.toBe(enc.blindIndex('076999999'));
  });

  test('blind index returns undefined for empty input rather than hashing "nothing"', () => {
    expect(enc.blindIndex('')).toBeUndefined();
    expect(enc.blindIndex(null)).toBeUndefined();
  });

  test('isEncrypted correctly identifies our ciphertext format', () => {
    const ciphertext = enc.encrypt('anything');
    expect(enc.isEncrypted(ciphertext)).toBe(true);
    expect(enc.isEncrypted('plain text value')).toBe(false);
    expect(enc.isEncrypted('v1:onlyoneseparator')).toBe(false);
  });

  test('currentKeyVersion reflects the active env-configured version', () => {
    expect(enc.currentKeyVersion()).toBe('v1');
  });
});
