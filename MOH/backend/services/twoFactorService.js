const crypto = require('crypto');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const bcrypt = require('bcryptjs');

const ISSUER = process.env.TOTP_ISSUER || 'MOH Sierra Leone';
const BACKUP_CODE_COUNT = 10;

// A ±1 step window (±30s) tolerates minor clock drift between the server
// and the user's phone without materially weakening the 6-digit code —
// this is the standard tolerance recommended by RFC 6238 implementers.
authenticator.options = { window: 1 };

function generateSecret() {
  return authenticator.generateSecret();
}

function verifyToken(token, secret) {
  if (!token || !secret) return false;
  try {
    return authenticator.check(String(token).trim(), secret);
  } catch (err) {
    return false;
  }
}

async function generateQrCodeDataUrl(username, secret) {
  const otpauthUri = authenticator.keyuri(username, ISSUER, secret);
  return qrcode.toDataURL(otpauthUri);
}

/**
 * Generates BACKUP_CODE_COUNT single-use backup codes. Returns both the
 * plaintext codes (shown to the user exactly once) and their bcrypt
 * hashes (what actually gets persisted) — mirrors how temporary
 * passwords are handled elsewhere in this codebase (credentialService.js).
 */
async function generateBackupCodes() {
  const plainCodes = [];
  const hashes = [];

  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    // 10 random hex chars grouped for readability, e.g. "A1B2-C3D4E5"
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 10)}`;
    plainCodes.push(formatted);
    hashes.push(await bcrypt.hash(formatted, 10));
  }

  return { plainCodes, hashes };
}

/**
 * Checks a submitted backup code against the stored hash list and returns
 * the index of the matching hash (so the caller can splice it out —
 * single use), or -1 if no match.
 */
async function findMatchingBackupCodeIndex(submittedCode, hashes) {
  if (!submittedCode || !Array.isArray(hashes)) return -1;
  const normalized = submittedCode.trim().toUpperCase();

  for (let i = 0; i < hashes.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(normalized, hashes[i])) return i;
  }
  return -1;
}

module.exports = {
  generateSecret,
  verifyToken,
  generateQrCodeDataUrl,
  generateBackupCodes,
  findMatchingBackupCodeIndex,
};
