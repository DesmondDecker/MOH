const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid FHIR resource id');

const patientSearchQuerySchema = z.object({
  identifier: z.string().trim().min(1).optional(), // "system|value" or bare value — matched against MRN and national ID
});

// A deliberately minimal subset of the FHIR Patient resource — this
// system's Patient model has fields (mrn, identityTier, etc.) with no
// FHIR equivalent, and plenty of real FHIR Patient fields (multiple
// names, contact relationships, general practitioner) this system has no
// concept of. Importing only maps what both sides actually have.
const fhirPatientImportSchema = z.object({
  resourceType: z.literal('Patient'),
  name: z
    .array(
      z.object({
        text: z.string().optional(),
        family: z.string().optional(),
        given: z.array(z.string()).optional(),
      })
    )
    .min(1, 'At least one name entry is required'),
  gender: z.enum(['male', 'female', 'other', 'unknown']),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'birthDate must be YYYY-MM-DD').optional(),
  identifier: z
    .array(
      z.object({
        system: z.string().optional(),
        value: z.string(),
      })
    )
    .optional(),
  telecom: z.array(z.object({ system: z.string().optional(), value: z.string() })).optional(),
  address: z.array(z.object({ district: z.string().optional(), text: z.string().optional() })).optional(),
});

const idParamSchema = z.object({ id: objectId });

module.exports = { patientSearchQuerySchema, fhirPatientImportSchema, idParamSchema };
