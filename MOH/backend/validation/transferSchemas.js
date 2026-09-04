const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');
const transferStatus = z.enum(['pending', 'fulfilled', 'rejected']);

const createTransferSchema = z.object({
  fromFacilityId: objectId,
  inventoryItemId: objectId,
  quantityRequested: z.number().int().positive('quantityRequested must be a positive whole number'),
  reason: z.string().trim().min(1, 'reason is required').max(500),
});

const rejectTransferSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const facilityIdParamSchema = z.object({ facilityId: objectId });
const idParamSchema = z.object({ id: objectId });

const listQuerySchema = z.object({
  direction: z.enum(['incoming', 'outgoing']).optional(),
  status: transferStatus.optional(),
});

module.exports = {
  createTransferSchema,
  rejectTransferSchema,
  facilityIdParamSchema,
  idParamSchema,
  listQuerySchema,
};
