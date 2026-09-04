const crypto = require('crypto');

/**
 * FIELD-LEVEL ENCRYPTION AT REST — PII/PHI
 * ---------------------------------------------------------------------------
 * This protects specific sensitive fields (national ID, phone, address,
 * free-text clinical notes, lab result values, allergy details) so that a
 * database dump, a misconfigured backup, or a compromised read-replica does
 * not expose patient identity/health data in plaintext — only a possession
 * of the active encryption key does.
 *
 * Design:
 *  - AES-256-GCM (authenticated encryption — tampering is detected, not just
 *    hidden) with a per-value random 96-bit IV. GCM's auth tag protects
 *    against ciphertext tampering, which a non-authenticated mode (e.g.
 *    CBC) would not catch.
 *  - KEY VERSIONING: every ciphertext is tagged with the key version that
 *    produced it (`v1:...`, `v2:...`). This is what makes key ROTATION
 *    possible without a flag day — old records keep decrypting with their
 *    original key version while new writes use the active version. See
 *    scripts/rotateEncryptionKey.js to re-encrypt existing data onto a new
 *    active key on your own schedule.
 *  - BLIND INDEX: AES-GCM ciphertext is non-deterministic by design (random
 *    IV), so it can never be queried with `WHERE field = X` in Mongo. For
 *    fields that must support *exact-match* lookup (nationalId, phone —
 *    used for patient de-duplication and staff lookup), we additionally
 *    store an HMAC-SHA256 "blind index": deterministic, but one-way (it
 *    cannot be reversed to recover the plaintext), computed with a SEPARATE
 *    key from the encryption key so that compromising one does not
 *    compromise the other. Only exact matches are possible this way —
 *    fuzzy/partial search on encrypted fields intentionally is NOT
 *    supported (see note in models/Patient.js on what stays plaintext and
 *    why).
 *
 * KEY MANAGEMENT (production):
 * ENCRYPTION_KEYS is a JSON object of {version: base64-32-byte-key}, e.g.
 *   ENCRYPTION_KEYS={"v1":"<base64>","v2":"<base64>"}
 * ENCRYPTION_ACTIVE_KEY_VERSION selects which version new writes use.
 * BLIND_INDEX_KEY is a single base64-32-byte key (HMAC key, does not rotate
 * per-version the same way — rotating it invalidates all existing blind
 * indexes, which requires a full re-index pass; treat it as long-lived).
 *
 * In a real deployment these keys belong in a KMS/secrets manager (AWS KMS,
 * GCP KMS, HashiCorp Vault, Azure Key Vault) with this service fetching the
 * *unwrapped* data key at boot, not sitting in a plain .env file on disk.
 * The .env fallback here is for local dev / self-hosted setups without a
 * KMS available — see README "Encryption key management" section.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV, recommended for GCM
const AUTH_TAG_LENGTH = 16;

let _keys = null; // { version: Buffer(32) }
let _activeVersion = null;
let _blindIndexKey = null; // Buffer(32)

function loadKeys() {
  if (_keys) return;

  const raw = process.env.ENCRYPTION_KEYS;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEYS is not set. Generate one with: node -e "console.log(JSON.stringify({v1: require(\'crypto\').randomBytes(32).toString(\'base64\')}))"'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error('ENCRYPTION_KEYS must be valid JSON, e.g. {"v1":"<base64-32-byte-key>"}');
  }

  _keys = {};
  for (const [version, b64] of Object.entries(parsed)) {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length !== 32) {
      throw new Error(`ENCRYPTION_KEYS["${version}"] must decode to exactly 32 bytes (got ${buf.length})`);
    }
    _keys[version] = buf;
  }

  _activeVersion = process.env.ENCRYPTION_ACTIVE_KEY_VERSION;
  if (!_activeVersion || !_keys[_activeVersion]) {
    throw new Error(
      'ENCRYPTION_ACTIVE_KEY_VERSION must be set and must match a key present in ENCRYPTION_KEYS'
    );
  }

  const blindRaw = process.env.BLIND_INDEX_KEY;
  if (!blindRaw) {
    throw new Error(
      'BLIND_INDEX_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    );
  }
  _blindIndexKey = Buffer.from(blindRaw, 'base64');
  if (_blindIndexKey.length !== 32) {
    throw new Error(`BLIND_INDEX_KEY must decode to exactly 32 bytes (got ${_blindIndexKey.length})`);
  }
}

/**
 * Encrypts a plaintext string. Returns null/undefined unchanged (so
 * "field not set" stays distinguishable from "field is an empty string" and
 * schema `required` validation still behaves normally on the getter side).
 * Returns a string of the form "v<version>:<iv-b64>:<tag-b64>:<ciphertext-b64>".
 */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  loadKeys();

  const key = _keys[_activeVersion];
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${_activeVersion}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts a value produced by encrypt(). If the value doesn't look like
 * ciphertext (e.g. legacy plaintext data from before encryption was
 * introduced, or the field was never set), it's returned as-is rather than
 * throwing — this makes migration of existing collections non-destructive:
 * old plaintext rows keep reading fine until a rewrite pass re-saves them
 * encrypted (see scripts/rotateEncryptionKey.js --migrate-plaintext).
 */
function decrypt(stored) {
  if (stored === null || stored === undefined || stored === '') return stored;
  if (typeof stored !== 'string') return stored;

  const parts = stored.split(':');
  if (parts.length !== 4) return stored; // not our ciphertext format — treat as legacy plaintext

  const [version, ivB64, tagB64, ctB64] = parts;

  loadKeys();
  const key = _keys[version];
  if (!key) {
    // Key for this version isn't available — fail loudly rather than
    // silently returning garbage/undefined, since this indicates a
    // misconfigured deployment (a rotated-out key was deleted too early).
    throw new Error(`No encryption key available for version "${version}" — cannot decrypt this field`);
  }

  try {
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    // GCM auth failure (tampered/corrupted ciphertext) or malformed data.
    // Never leak partial plaintext — surface a clear error instead.
    throw new Error('Failed to decrypt field: data may be corrupted or tampered with');
  }
}

/**
 * Deterministic one-way blind index for exact-match search on an encrypted
 * field. Normalizes (trim + lowercase) before hashing so "+232 76 123456"
 * and "+232 76 123456 " index identically. Returns null for empty input so
 * sparse indexes don't fill up with hashes of "nothing".
 */
function blindIndex(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return undefined;
  loadKeys();
  const normalized = String(plaintext).trim().toLowerCase();
  return crypto.createHmac('sha256', _blindIndexKey).update(normalized).digest('hex');
}

/** True if a stored string is in our versioned ciphertext format. */
function isEncrypted(stored) {
  return typeof stored === 'string' && /^v\w+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(stored);
}

function currentKeyVersion() {
  loadKeys();
  return _activeVersion;
}

module.exports = { encrypt, decrypt, blindIndex, isEncrypted, currentKeyVersion };
