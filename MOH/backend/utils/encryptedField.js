const { encrypt, decrypt } = require('../services/encryptionService');

/**
 * Returns a Mongoose SchemaType field definition that transparently
 * encrypts on write and decrypts on read, so the rest of the codebase
 * (routes, services, JSON responses) works with plaintext strings exactly
 * as before — the ciphertext only ever exists in the database and in
 * memory momentarily around the get/set boundary.
 *
 * Usage:  phone: encryptedField({ trim: true })
 *
 * IMPORTANT: fields defined this way are NOT queryable with equality/regex
 * at the Mongo level (ciphertext is non-deterministic). If you need exact-
 * match lookup, pair this with a `<field>BlindIndex` path populated via
 * blindIndex() in a pre-save hook (see models/Patient.js for the pattern),
 * and query the blind-index field instead of the encrypted field.
 */
function encryptedField(extra = {}) {
  return {
    type: String,
    ...extra,
    set(value) {
      // Guard against double-encryption if a getter-produced plaintext is
      // re-assigned without modification (Mongoose calls setters on any
      // assignment, including internal ones during query population).
      if (value === null || value === undefined) return value;
      return encrypt(value);
    },
    get(value) {
      if (value === null || value === undefined) return value;
      try {
        return decrypt(value);
      } catch (err) {
        // Surface a visible sentinel instead of throwing inside a getter —
        // throwing here would break unrelated reads (e.g. .lean() bypass,
        // console.log(doc)) with a confusing stack trace. Callers that
        // truly need decrypt failures to be fatal should call
        // encryptionService.decrypt() directly on the raw stored value.
        return '[decryption error]';
      }
    },
  };
}

module.exports = { encryptedField };
