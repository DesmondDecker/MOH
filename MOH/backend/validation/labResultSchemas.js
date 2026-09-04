const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');
const testCategory = z.enum(['hematology', 'microbiology', 'chemistry', 'serology', 'radiology', 'other']);

// `value` accepts a string or number since results can be qualitative
// ("Positive", "Negative") or quantitative (a numeric titre/count) — but
// either way it must actually be present and non-empty, since a lab result
// with a blank value is a data-integrity hole a clinician could easily
// miss until it's needed for a treatment decision.
const resultValue = z.union([z.string().trim().min(1, 'value is required'), z.number()]);

const orderTestSchema = z.object({
  patientId: objectId,
  encounterId: objectId,
  testName: z.string().trim().min(1, 'testName is required').max(200),
  testCategory: testCategory.optional(),
});

const recordResultSchema = z.object({
  value: resultValue,
  unit: z.string().trim().max(50).optional(),
  referenceRange: z.string().trim().max(100).optional(),
  isAbnormal: z.boolean().optional(),
  isCritical: z.boolean().optional(),
});

const amendResultSchema = z.object({
  reason: z.string().trim().min(1, 'reason is required').max(500),
  value: resultValue,
  unit: z.string().trim().max(50).optional(),
  referenceRange: z.string().trim().max(100).optional(),
  isAbnormal: z.boolean().optional(),
  isCritical: z.boolean().optional(),
});

const idParamSchema = z.object({ id: objectId });
const patientIdParamSchema = z.object({ patientId: objectId });

module.exports = {
  orderTestSchema,
  recordResultSchema,
  amendResultSchema,
  idParamSchema,
  patientIdParamSchema,
};
