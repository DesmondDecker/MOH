const bcrypt = require('bcryptjs');
const ColdChainDevice = require('../models/ColdChainDevice');

/**
 * Verifies X-Device-Id / X-Device-Api-Key headers on the reading-ingestion
 * endpoint. Deliberately mirrors middleware/facilityApiKey.js's pattern
 * (same header-pair + bcrypt-hash-comparison shape) rather than inventing
 * a new one — this is the second machine-to-machine auth mechanism in
 * this codebase (facility sync worker, cold-chain sensor), and having
 * them look identical means anyone auditing one understands the other.
 *
 * Deliberately per-DEVICE, not per-facility like the sync key: a
 * compromised single fridge sensor should only be able to push readings
 * for that one device, not impersonate every sensor at the facility.
 */
async function authenticateColdChainDevice(req, res, next) {
  try {
    const deviceId = req.headers['x-device-id'];
    const apiKey = req.headers['x-device-api-key'];

    if (!deviceId || !apiKey) {
      return res.status(401).json({ error: 'Missing X-Device-Id or X-Device-Api-Key header' });
    }

    const device = await ColdChainDevice.findById(deviceId).select('+apiKeyHash');
    if (!device || !device.apiKeyHash) {
      return res.status(401).json({ error: 'Unknown device or API key not provisioned' });
    }
    if (device.status !== 'active') {
      return res.status(403).json({ error: 'Device is not active' });
    }

    const valid = await bcrypt.compare(apiKey, device.apiKeyHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid device API key' });
    }

    req.coldChainDevice = device;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticateColdChainDevice };
