const { z } = require('zod');

// MongoDB ObjectId — 24 hex chars. Rejecting a malformed id here means
// Mongoose never even attempts a query with it (which for some invalid
// shapes throws a raw CastError with an internal stack trace attached).
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const sex = z.enum(['male', 'female']);

// Sierra Leone mobile numbers: 9 digits after the leading 0, across the
// four main networks (Africell 07x/08x, Orange 07x/08x, Qcell 03x, etc.).
// Deliberately permissive on the exact prefix — the point is catching
// "this obviously isn't a phone number" (too short, contains letters), not
// enforcing a strict national numbering plan the routes/registration flow
// would need to keep in sync with as carriers change.
const phone = z
  .string()
  .trim()
  .regex(/^0\d{8,9}$/, 'Phone must be a local number starting with 0 (e.g. 076123456)')
  .optional();

const nextOfKin = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    relationship: z.string().trim().max(50).optional(),
    phone: phone,
  })
  .optional();

const createPatientSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(200),
  // Coerced from the JSON string the client sends into a real Date — and
  // rejected outright if it doesn't parse, rather than Mongoose silently
  // storing an "Invalid Date".
  dateOfBirth: z.coerce.date().max(new Date(), 'dateOfBirth cannot be in the future').optional(),
  dateOfBirthEstimated: z.boolean().optional(),
  sex,
  nationalId: z.string().trim().min(1).max(50).optional(),
  phone,
  district: z.string().trim().max(100).optional(),
  chiefdom: z.string().trim().max(100).optional(),
  address: z.string().trim().max(500).optional(),
  nextOfKin,
  dataSharingWithThirdParties: z.boolean().optional(),
});

const createNewbornSchema = z.object({
  motherPatientId: objectId,
  sex,
  dateOfBirth: z.coerce.date().max(new Date(), 'dateOfBirth cannot be in the future').optional(),
  fullName: z.string().trim().max(200).optional(),
});

const updatePatientSchema = z
  .object({
    phone,
    district: z.string().trim().max(100).optional(),
    chiefdom: z.string().trim().max(100).optional(),
    address: z.string().trim().max(500).optional(),
    nextOfKin,
    nationalId: z.string().trim().min(1).max(50).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one editable field is required' });

const recordDeathSchema = z.object({
  dateOfDeath: z.coerce.date().max(new Date(), 'dateOfDeath cannot be in the future').optional(),
  cause: z.string().trim().max(500).optional(),
});

const idParamSchema = z.object({ id: objectId });
const duplicateReviewParamsSchema = z.object({ id: objectId, candidatePatientId: objectId });
const duplicateReviewSchema = z.object({
  decision: z.enum(['confirmed_duplicate', 'rejected'], { message: "decision must be 'confirmed_duplicate' or 'rejected'" }),
});

module.exports = {
  createPatientSchema,
  createNewbornSchema,
  updatePatientSchema,
  recordDeathSchema,
  idParamSchema,
  duplicateReviewParamsSchema,
  duplicateReviewSchema,
};
