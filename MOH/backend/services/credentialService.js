const crypto = require('crypto');

/**
 * Generates a random temporary password for admin-issued accounts.
 * Format is deliberately readable for handing over verbally/in person
 * (e.g. "Kb7-Rf2-Tq9") while still having real entropy.
 */
function generateTempPassword() {
  const groups = [];
  for (let i = 0; i < 3; i++) {
    groups.push(crypto.randomBytes(2).toString('hex').slice(0, 3));
  }
  return groups.join('-') + crypto.randomInt(10, 99);
}

function slugifyUsername(fullName, facilityCode) {
  const base = fullName
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .join('.');
  const suffix = crypto.randomInt(100, 999);
  return `${base}.${facilityCode.toLowerCase()}${suffix}`;
}

/**
 * Generates a facility sync API key: a long random secret handed to a
 * facility once at onboarding (shown only in that response), used by that
 * facility's local sync worker to authenticate pushes to the central
 * MoH ingestion endpoint. Only the hash is stored (see routes/auth.js).
 */
function generateSyncApiKey() {
  return 'fsk_' + crypto.randomBytes(32).toString('hex'); // "facility sync key"
}

module.exports = { generateTempPassword, slugifyUsername, generateSyncApiKey };
