const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const encounterType = z.enum(['outpatient', 'inpatient_admission', 'emergency', 'antenatal', 'immunization', 'referral_in']);
const urgency = z.enum(['routine', 'urgent', 'emergency']);

/**
 * Vitals get real clinical plausibility bounds, not just "is it a number" —
 * a typo'd 39.0°C entered as "390" or a diastolic BP of 1200 should never
 * reach the chart a clinician is reading at a glance to make a treatment
 * decision. Bounds are deliberately wide (they reject only physiologically
 * impossible values, not merely unusual ones) since this is data entry
 * validation, not a diagnostic judgment — a genuinely extreme-but-real
 * reading must still be recordable.
 */
const vitalsSchema = z
  .object({
    temperatureC: z.number().min(25).max(45).optional(),
    bloodPressureSystolic: z.number().min(40).max(300).optional(),
    bloodPressureDiastolic: z.number().min(20).max(200).optional(),
    heartRateBpm: z.number().min(20).max(300).optional(),
    respiratoryRate: z.number().min(4).max(80).optional(),
    oxygenSaturation: z.number().min(0).max(100).optional(),
    weightKg: z.number().min(0.3).max(400).optional(),
    heightCm: z.number().min(20).max(250).optional(),
  })
  .refine(
    (v) =>
      v.bloodPressureSystolic === undefined ||
      v.bloodPressureDiastolic === undefined ||
      v.bloodPressureSystolic > v.bloodPressureDiastolic,
    { message: 'bloodPressureSystolic must be greater than bloodPressureDiastolic' }
  )
  .optional();

const emergencyOverrideSchema = z
  .object({
    used: z.boolean(),
    justification: z.string().trim().min(1, 'justification is required when emergencyOverride.used is true').max(1000).optional(),
  })
  .refine((eo) => !eo.used || (eo.justification && eo.justification.length > 0), {
    message: 'justification is required when emergencyOverride.used is true',
    path: ['justification'],
  })
  .optional();

const createEncounterSchema = z.object({
  patientId: objectId,
  type: encounterType,
  chiefComplaint: z.string().trim().max(1000).optional(),
  vitals: vitalsSchema,
  emergencyOverride: emergencyOverrideSchema,
});

const addDiagnosisSchema = z.object({
  description: z.string().trim().min(1, 'description is required').max(500),
  icd10Code: z
    .string()
    .trim()
    .regex(/^[A-TV-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/, 'icd10Code must be a valid ICD-10 code (e.g. A00 or J18.9)')
    .optional()
    .or(z.literal('')),
  isPrimary: z.boolean().optional(),
});

const referralSchema = z.object({
  referredToFacilityId: objectId,
  reason: z.string().trim().min(1, 'reason is required').max(1000),
  urgency: urgency.optional(),
});

const emergencyAccessReviewSchema = z.object({
  outcome: z.enum(['appropriate', 'inappropriate', 'needs_followup'], {
    message: "outcome must be 'appropriate', 'inappropriate', or 'needs_followup'",
  }),
  notes: z.string().trim().max(2000).optional(),
});

const emergencyAccessQuerySchema = z.object({
  reviewed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

const idParamSchema = z.object({ id: objectId });
const facilityIdParamSchema = z.object({ facilityId: objectId });
const patientIdParamSchema = z.object({ patientId: objectId });

module.exports = {
  createEncounterSchema,
  addDiagnosisSchema,
  referralSchema,
  emergencyAccessReviewSchema,
  emergencyAccessQuerySchema,
  idParamSchema,
  facilityIdParamSchema,
  patientIdParamSchema,
};
