const bcrypt = require('bcryptjs');
const Facility = require('../models/Facility');

/**
 * Verifies X-Facility-Id / X-Facility-Api-Key headers on the CENTRAL side's
 * ingestion endpoint. Separate from the user JWT auth in middleware/auth.js —
 * this authenticates a facility's sync worker (a machine), not a logged-in
 * person, so it doesn't belong in the same middleware.
 */
async function authenticateFacilitySync(req, res, next) {
  try {
    const facilityId = req.headers['x-facility-id'];
    const apiKey = req.headers['x-facility-api-key'];

    if (!facilityId || !apiKey) {
      return res.status(401).json({ error: 'Missing X-Facility-Id or X-Facility-Api-Key header' });
    }

    const facility = await Facility.findById(facilityId).select('+syncApiKeyHash status');
    if (!facility || !facility.syncApiKeyHash) {
      return res.status(401).json({ error: 'Unknown facility or sync not provisioned' });
    }
    if (facility.status !== 'active') {
      return res.status(403).json({ error: 'Facility is suspended' });
    }

    const valid = await bcrypt.compare(apiKey, facility.syncApiKeyHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid sync API key' });
    }

    req.syncFacilityId = facilityId;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticateFacilitySync };
