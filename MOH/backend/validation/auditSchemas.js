const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const auditQuerySchema = z.object({
  actorId: objectId.optional(),
  action: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  skip: z.coerce.number().int().min(0).optional(),
  // Coerced to Date and validated — this directly replaces a bare `new
  // Date(from)` that would previously accept any garbage string and
  // silently produce an "Invalid Date" filter, matching nothing rather
  // than surfacing a clear 400.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const facilityIdParamSchema = z.object({ facilityId: objectId });

module.exports = { auditQuerySchema, facilityIdParamSchema };
