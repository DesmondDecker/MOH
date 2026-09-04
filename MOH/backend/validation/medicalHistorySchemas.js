const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const createPrescriptionSchema = z.object({
  patientId: objectId,
  encounterId: objectId,
  inventoryItemId: objectId.optional(),
  drugName: z.string().trim().min(1, 'drugName is required').max(200),
  dosage: z.string().trim().min(1, 'dosage is required').max(100),
  frequency: z.string().trim().max(100).optional(),
  durationDays: z.number().int().positive().max(365).optional(),
  route: z.string().trim().max(50).optional(),
  overrideJustification: z.string().trim().max(1000).optional(),
  quantityPrescribed: z.number().positive('quantityPrescribed, if provided, must be a positive number').optional(),
});

const createProcedureSchema = z.object({
  patientId: objectId,
  encounterId: objectId,
  name: z.string().trim().min(1, 'name is required').max(200),
  performedAt: z.coerce.date().optional(),
  outcome: z.string().trim().max(1000).optional(),
});

// `changes` is intentionally an open object — the amend route merges
// whatever keys are present into a NEW entry's prescription/procedure/note
// (see routes/medicalHistory.js), so it needs to accept the shape of
// whichever entryType is being amended without this schema having to
// duplicate the full prescription/procedure sub-schemas here. `reason` is
// what's actually enforced — this is a correction-audit workflow, not a
// data-entry form, so the accountability trail matters more than shape
// policing the free-form patch itself.
const amendSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(1000),
  changes: z.record(z.string(), z.unknown()).refine((c) => Object.keys(c).length > 0, {
    message: 'changes must contain at least one field to amend',
  }),
});

const idParamSchema = z.object({ id: objectId });
const facilityIdParamSchema = z.object({ facilityId: objectId });
const patientIdParamSchema = z.object({ patientId: objectId });

module.exports = {
  createPrescriptionSchema,
  createProcedureSchema,
  amendSchema,
  idParamSchema,
  facilityIdParamSchema,
  patientIdParamSchema,
};
