const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const ColdChainDevice = require('../models/ColdChainDevice');
const ColdChainReading = require('../models/ColdChainReading');
const auditService = require('../services/auditService');
const socketService = require('../services/socketService');
const { generateSyncApiKey } = require('../services/credentialService');
const { isBreach } = require('../services/coldChainService');
const { authenticateColdChainDevice } = require('../middleware/coldChainDeviceKey');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  registerDeviceSchema,
  ingestReadingSchema,
  readingsQuerySchema,
  facilityIdParamSchema,
  deviceIdParamSchema,
} = require('../validation/coldChainSchemas');

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

async function recordReading(device, { temperatureC, humidity, recordedAt, doorOpenEvent, source }) {
  const breached = isBreach(temperatureC, device.minSafeC, device.maxSafeC);

  const reading = await ColdChainReading.create({
    deviceId: device._id,
    facilityId: device.facilityId,
    temperatureC,
    humidity,
    recordedAt: recordedAt || new Date(),
    doorOpenEvent,
    source,
    breached,
  });

  if (breached) {
    socketService.emitActivity({
      facilityId: device.facilityId.toString(),
      action: 'cold_chain_breach',
      targetType: 'ColdChainDevice',
      actorRole: source === 'manual' ? 'staff' : 'sensor',
      occurredAt: reading.recordedAt,
    });
  }

  return reading;
}

router.post(
  '/devices/:deviceId/readings',
  validate({ params: deviceIdParamSchema, body: ingestReadingSchema }),
  authenticateColdChainDevice,
  async (req, res, next) => {
    try {
      if (req.coldChainDevice._id.toString() !== req.params.deviceId) {
        return res.status(403).json({ error: 'Device API key does not match the deviceId in the URL' });
      }
      const reading = await recordReading(req.coldChainDevice, { ...req.body, source: 'sensor' });
      res.status(201).json({ id: reading._id, breached: reading.breached });
    } catch (err) {
      next(err);
    }
  }
);

router.use(authenticate, blockUntilPasswordChanged);

router.post(
  '/facility/:facilityId/devices',
  requireRole('facility_admin'),
  validate({ params: facilityIdParamSchema, body: registerDeviceSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { deviceLabel, deviceType, minSafeC, maxSafeC } = req.body;
      const defaults = ColdChainDevice.deviceTypeDefaults[deviceType];

      const apiKey = generateSyncApiKey();
      const apiKeyHash = await bcrypt.hash(apiKey, 12);

      const device = await ColdChainDevice.create({
        facilityId: req.params.facilityId,
        deviceLabel,
        deviceType,
        minSafeC: minSafeC ?? defaults.minSafeC,
        maxSafeC: maxSafeC ?? defaults.maxSafeC,
        apiKeyHash,
        registeredBy: req.user.id,
      });

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.params.facilityId,
        action: 'cold_chain_device_registered',
        targetType: 'ColdChainDevice',
        targetId: device._id,
        after: { deviceLabel, deviceType, minSafeC: device.minSafeC, maxSafeC: device.maxSafeC },
        ...clientMeta(req),
      });

      res.status(201).json({ ...device.toObject(), apiKey });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/facility/:facilityId/devices',
  requireRole('facility_admin', 'nurse', 'pharmacist', 'store_officer'),
  validate({ params: facilityIdParamSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const devices = await ColdChainDevice.find({ facilityId: req.params.facilityId });
      res.json(devices);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/devices/:deviceId/rotate-key',
  requireRole('facility_admin'),
  validate({ params: deviceIdParamSchema }),
  async (req, res, next) => {
    try {
      const device = await ColdChainDevice.findById(req.params.deviceId);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (device.facilityId.toString() !== req.user.facilityId) {
        return res.status(403).json({ error: "Cannot rotate a key for another facility's device" });
      }

      const apiKey = generateSyncApiKey();
      device.apiKeyHash = await bcrypt.hash(apiKey, 12);
      await device.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: device.facilityId,
        action: 'cold_chain_device_key_rotated',
        targetType: 'ColdChainDevice',
        targetId: device._id,
        ...clientMeta(req),
      });

      res.json({ id: device._id, apiKey });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/devices/:deviceId/manual-reading',
  requireRole('facility_admin', 'nurse', 'pharmacist', 'store_officer'),
  validate({ params: deviceIdParamSchema, body: ingestReadingSchema }),
  async (req, res, next) => {
    try {
      const device = await ColdChainDevice.findById(req.params.deviceId);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (device.facilityId.toString() !== req.user.facilityId) {
        return res.status(403).json({ error: "Cannot log a reading for another facility's device" });
      }

      const reading = await recordReading(device, { ...req.body, source: 'manual' });
      res.status(201).json(reading);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/devices/:deviceId/readings',
  requireRole('facility_admin', 'nurse', 'pharmacist', 'store_officer'),
  validate({ params: deviceIdParamSchema, query: readingsQuerySchema }),
  async (req, res, next) => {
    try {
      const device = await ColdChainDevice.findById(req.params.deviceId);
      if (!device) return res.status(404).json({ error: 'Device not found' });
      if (device.facilityId.toString() !== req.user.facilityId) {
        return res.status(403).json({ error: "Cannot view readings for another facility's device" });
      }

      const filter = { deviceId: req.params.deviceId };
      if (req.query.since) filter.recordedAt = { $gte: req.query.since };

      const readings = await ColdChainReading.find(filter).sort({ recordedAt: -1 }).limit(req.query.limit || 200);
      res.json(readings);
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  '/facility/:facilityId/breaches',
  requireRole('facility_admin', 'nurse', 'pharmacist', 'store_officer'),
  validate({ params: facilityIdParamSchema, query: readingsQuerySchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const filter = { facilityId: req.params.facilityId, breached: true };
      if (req.query.since) filter.recordedAt = { $gte: req.query.since };

      const breaches = await ColdChainReading.find(filter)
        .populate('deviceId', 'deviceLabel deviceType minSafeC maxSafeC')
        .sort({ recordedAt: -1 })
        .limit(req.query.limit || 100);

      res.json(breaches);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
