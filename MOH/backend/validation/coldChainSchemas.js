const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const registerDeviceSchema = z.object({
  deviceLabel: z.string().trim().min(1, 'deviceLabel is required').max(200),
  deviceType: z.enum(['refrigerator', 'freezer']),
  minSafeC: z.number().min(-100).max(100).optional(),
  maxSafeC: z.number().min(-100).max(100).optional(),
});

const ingestReadingSchema = z.object({
  temperatureC: z.number().min(-100).max(100),
  humidity: z.number().min(0).max(100).optional(),
  recordedAt: z.coerce.date().optional(),
  doorOpenEvent: z.boolean().optional(),
});

const readingsQuerySchema = z.object({
  since: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const facilityIdParamSchema = z.object({ facilityId: objectId });
const deviceIdParamSchema = z.object({ deviceId: objectId });

module.exports = {
  registerDeviceSchema,
  ingestReadingSchema,
  readingsQuerySchema,
  facilityIdParamSchema,
  deviceIdParamSchema,
};
