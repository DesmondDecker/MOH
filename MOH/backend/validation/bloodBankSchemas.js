const { z } = require('zod');
const { ALL_BLOOD_TYPES, BLOOD_COMPONENTS } = require('../constants/bloodCompatibility');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');
const bloodType = z.enum(ALL_BLOOD_TYPES);
const component = z.enum(BLOOD_COMPONENTS);

const intakeUnitSchema = z.object({
  bloodType,
  component,
  volumeMl: z.number().int().positive().optional(),
  donorIdNumber: z.string().trim().max(50).optional(),
  donorFullName: z.string().trim().min(1, 'donorFullName is required').max(200),
  donorPhone: z.string().trim().max(20).optional(),
  collectionDate: z.coerce.date().max(new Date(), 'collectionDate cannot be in the future'),
});

const screeningSchema = z.object({
  result: z.enum(['cleared', 'reactive'], { message: "result must be 'cleared' or 'reactive'" }),
  screenedFor: z.object({
    hiv: z.boolean(),
    hepatitisB: z.boolean(),
    hepatitisC: z.boolean(),
    syphilis: z.boolean(),
  }),
  notes: z.string().trim().max(1000).optional(),
});

const reserveSchema = z.object({
  patientId: objectId,
});

const transfuseSchema = z.object({
  patientId: objectId,
  encounterId: objectId,
  crossmatchConfirmed: z.literal(true, {
    message: 'crossmatchConfirmed must be true — a laboratory crossmatch must be completed and confirmed before transfusion is recorded',
  }),
  adverseReaction: z.boolean().optional(),
  reactionNotes: z.string().trim().max(1000).optional(),
});

const discardSchema = z.object({
  reason: z.enum(['expired', 'reactive_screening', 'damaged', 'contaminated', 'other']),
  notes: z.string().trim().max(500).optional(),
});

const facilityIdParamSchema = z.object({ facilityId: objectId });
const idParamSchema = z.object({ id: objectId });

const compatibilityQuerySchema = z.object({
  recipientType: bloodType,
  component,
});

const inventoryQuerySchema = z.object({
  bloodType: bloodType.optional(),
  component: component.optional(),
  status: z.enum(['pending_screening', 'available', 'reserved', 'transfused', 'discarded', 'expired']).optional(),
});

const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

module.exports = {
  intakeUnitSchema,
  screeningSchema,
  reserveSchema,
  transfuseSchema,
  discardSchema,
  facilityIdParamSchema,
  idParamSchema,
  compatibilityQuerySchema,
  inventoryQuerySchema,
  expiringQuerySchema,
};
