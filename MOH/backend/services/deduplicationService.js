const Patient = require('../models/Patient');
const { blindIndex } = require('./encryptionService');

/**
 * Levenshtein distance, used for fuzzy name matching (misspellings,
 * transliteration differences common with Krio/English name variants).
 */
function levenshtein(a, b) {
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

/**
 * Finds candidate duplicate patients for a newly-registered or edited patient.
 * Returns an array of { patientId, matchScore, matchedOn } sorted by score desc.
 * This NEVER merges records — callers persist results to
 * Patient.possibleDuplicates for a human to confirm/reject.
 */
async function findCandidateDuplicates(patient, { limit = 5 } = {}) {
  const candidates = [];

  // nationalId and phone are encrypted at rest (see models/Patient.js), so
  // they can no longer be queried directly — every lookup below goes
  // through their deterministic blind index instead. `.lean()` is used
  // throughout since blind indexes are compared as opaque hex hashes, not
  // decrypted, so there's no need to pay the getter/decrypt cost on
  // documents fetched only for matching (fullName/dateOfBirth/sex stay
  // plaintext and read fine off a lean object).
  const nationalIdHash = patient.nationalId ? blindIndex(patient.nationalId) : null;
  const phoneHash = patient.phone ? blindIndex(patient.phone) : null;

  // Exact nationalId match is near-certain — highest confidence tier.
  if (nationalIdHash) {
    const exact = await Patient.find({
      _id: { $ne: patient._id },
      nationalIdBlindIndex: nationalIdHash,
      status: 'active',
    })
      .select('_id')
      .limit(limit)
      .lean();

    for (const c of exact) {
      candidates.push({ patientId: c._id, matchScore: 1.0, matchedOn: ['nationalId'] });
    }
  }

  // Fuzzy match pool: same sex + DOB within a small window, or exact phone
  // match via blind index. These are two independent conditions rather
  // than a single $or on a mixed plaintext/hash query, then merged in JS —
  // Mongo can't combine a range query on one field with a hash-equality
  // query on another inside a single $or the way the old plaintext
  // version did, since the phone side is now an equality-only index.
  const dobWindowStart = patient.dateOfBirth
    ? new Date(new Date(patient.dateOfBirth).getTime() - 3 * 24 * 60 * 60 * 1000)
    : null;
  const dobWindowEnd = patient.dateOfBirth
    ? new Date(new Date(patient.dateOfBirth).getTime() + 3 * 24 * 60 * 60 * 1000)
    : null;

  const poolQueries = [];
  if (patient.dateOfBirth) {
    poolQueries.push(
      Patient.find({
        _id: { $ne: patient._id },
        status: 'active',
        dateOfBirth: { $gte: dobWindowStart, $lte: dobWindowEnd },
        sex: patient.sex,
      })
        .select('fullName dateOfBirth phoneBlindIndex')
        .limit(50)
        .lean()
    );
  }
  if (phoneHash) {
    poolQueries.push(
      Patient.find({ _id: { $ne: patient._id }, status: 'active', phoneBlindIndex: phoneHash })
        .select('fullName dateOfBirth phoneBlindIndex')
        .limit(50)
        .lean()
    );
  }

  const poolResults = await Promise.all(poolQueries);
  const pool = [];
  const seenIds = new Set();
  for (const results of poolResults) {
    for (const c of results) {
      const idStr = c._id.toString();
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        pool.push(c);
      }
    }
  }

  for (const c of pool) {
    if (candidates.some((existing) => existing.patientId.toString() === c._id.toString())) continue;

    const matchedOn = [];
    let score = 0;
    let weight = 0;

    const nameSim = nameSimilarity(patient.fullName, c.fullName);
    if (nameSim > 0.6) {
      matchedOn.push('fullName');
      score += nameSim * 0.5;
    }
    weight += 0.5;

    if (patient.dateOfBirth && c.dateOfBirth && Math.abs(new Date(patient.dateOfBirth) - new Date(c.dateOfBirth)) <= 3 * 24 * 60 * 60 * 1000) {
      matchedOn.push('dateOfBirth');
      score += 0.3;
    }
    weight += 0.3;

    if (phoneHash && c.phoneBlindIndex && phoneHash === c.phoneBlindIndex) {
      matchedOn.push('phone');
      score += 0.2;
    }
    weight += 0.2;

    const normalizedScore = weight > 0 ? score / weight : 0;

    if (normalizedScore >= 0.55 && matchedOn.length >= 2) {
      candidates.push({ patientId: c._id, matchScore: Math.round(normalizedScore * 100) / 100, matchedOn });
    }
  }

  return candidates.sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);
}

module.exports = { findCandidateDuplicates, nameSimilarity, levenshtein };
