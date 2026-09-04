// Deterministic test keys — NEVER reuse these outside tests. Fixed on
// purpose so a flaky/random key doesn't make test failures irreproducible.
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEYS = JSON.stringify({ v1: 'A'.repeat(43) + '=' }); // valid base64 -> 32 bytes
process.env.ENCRYPTION_ACTIVE_KEY_VERSION = 'v1';
process.env.BLIND_INDEX_KEY = 'B'.repeat(43) + '=';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_MFA_SECRET = 'test-mfa-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.JWT_MFA_EXPIRES_IN = '5m';
process.env.TOTP_ISSUER = 'MOH Test';
process.env.CORS_ORIGIN = '*';
