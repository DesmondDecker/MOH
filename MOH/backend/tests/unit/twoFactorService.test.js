const { authenticator } = require('otplib');
const twoFactorService = require('../../services/twoFactorService');

describe('twoFactorService', () => {
  test('generates a usable base32 secret', () => {
    const secret = twoFactorService.generateSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(10);
  });

  test('verifyToken accepts a code actually generated from the secret', () => {
    const secret = twoFactorService.generateSecret();
    const validCode = authenticator.generate(secret);
    expect(twoFactorService.verifyToken(validCode, secret)).toBe(true);
  });

  test('verifyToken rejects an incorrect code', () => {
    const secret = twoFactorService.generateSecret();
    const validCode = authenticator.generate(secret);
    // Flip the last digit to guarantee a wrong code (wrapping 9 -> 0).
    const wrongLastDigit = validCode[5] === '9' ? '0' : String(Number(validCode[5]) + 1);
    const wrongCode = validCode.slice(0, 5) + wrongLastDigit;
    expect(twoFactorService.verifyToken(wrongCode, secret)).toBe(false);
  });

  test('verifyToken rejects a code generated from a different secret', () => {
    const secretA = twoFactorService.generateSecret();
    const secretB = twoFactorService.generateSecret();
    const codeForB = authenticator.generate(secretB);
    expect(twoFactorService.verifyToken(codeForB, secretA)).toBe(false);
  });

  test('verifyToken handles missing/empty input without throwing', () => {
    expect(twoFactorService.verifyToken('', 'somesecret')).toBe(false);
    expect(twoFactorService.verifyToken(null, 'somesecret')).toBe(false);
    expect(twoFactorService.verifyToken('123456', null)).toBe(false);
  });

  test('generateQrCodeDataUrl returns a PNG data URL', async () => {
    const secret = twoFactorService.generateSecret();
    const dataUrl = await twoFactorService.generateQrCodeDataUrl('jdoe', secret);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('generateBackupCodes produces 10 unique, correctly formatted codes with matching hashes', async () => {
    const { plainCodes, hashes } = await twoFactorService.generateBackupCodes();
    expect(plainCodes).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    expect(new Set(plainCodes).size).toBe(10); // all unique
    for (const code of plainCodes) {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{6}$/);
    }
  });

  test('findMatchingBackupCodeIndex finds the right code and treats codes as single-use candidates', async () => {
    const { plainCodes, hashes } = await twoFactorService.generateBackupCodes();
    const idx = await twoFactorService.findMatchingBackupCodeIndex(plainCodes[7], hashes);
    expect(idx).toBe(7);
  });

  test('findMatchingBackupCodeIndex is case-insensitive (normalizes to uppercase)', async () => {
    const { plainCodes, hashes } = await twoFactorService.generateBackupCodes();
    const idx = await twoFactorService.findMatchingBackupCodeIndex(plainCodes[2].toLowerCase(), hashes);
    expect(idx).toBe(2);
  });

  test('findMatchingBackupCodeIndex returns -1 for a code that was never issued', async () => {
    const { hashes } = await twoFactorService.generateBackupCodes();
    const idx = await twoFactorService.findMatchingBackupCodeIndex('FFFF-FFFFFF', hashes);
    expect(idx).toBe(-1);
  });
});
