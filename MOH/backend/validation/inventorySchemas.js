const { z } = require('zod');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');
const itemCategory = z.enum(['drug', 'consumable', 'equipment', 'reagent']);
const wastageReason = z.enum(['damaged', 'expired', 'contaminated', 'other']);
const adjustType = z.enum(['add', 'reduce']);

// Positive integer quantity — inventory counts are always whole units here
// (tablets, vials, boxes), never fractional, and never zero/negative (a
// zero-quantity receipt/dispense/wastage is a no-op that shouldn't create a
// transaction record at all, so it's rejected rather than silently allowed).
const positiveIntQuantity = z.number().int().positive('quantity must be a positive whole number');

const createItemSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  category: itemCategory,
  drugClass: z.string().trim().max(100).optional(),
  unit: z.string().trim().min(1, 'unit is required').max(20),
  defaultReorderThreshold: z.number().int().min(0).optional(),
  isControlledSubstance: z.boolean().optional(),
});

const createItemManualSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(200),
  category: itemCategory.optional(),
  drugClass: z.string().trim().max(100).optional(),
  unit: z.string().trim().max(20).optional(),
  defaultReorderThreshold: z.number().int().min(0).optional(),
  isControlledSubstance: z.boolean().optional(),
});

const receiveStockSchema = z.object({
  inventoryItemId: objectId,
  batchNumber: z.string().trim().min(1, 'batchNumber is required').max(100),
  // Coerced to a real Date and checked for plausibility — a receipt with an
  // expiry date already in the past is virtually always a data-entry
  // mistake (wrong year typed), and letting it through silently creates a
  // batch that shows as "expired" the moment it's received.
  expiryDate: z.coerce.date().min(new Date(), 'expiryDate must be in the future'),
  quantity: positiveIntQuantity,
  supplier: z.string().trim().max(200).optional(),
  purchaseOrderRef: z.string().trim().max(100).optional(),
  unitCost: z.number().min(0).optional(),
});

const dispenseSchema = z.object({
  quantity: positiveIntQuantity,
});

const wastageSchema = z.object({
  inventoryItemId: objectId,
  batchId: objectId,
  quantity: positiveIntQuantity,
  reason: wastageReason,
  notes: z.string().trim().max(500).optional(),
});

const adjustSchema = z.object({
  inventoryItemId: objectId,
  quantity: positiveIntQuantity,
  type: adjustType,
  reason: z.string().trim().min(1, 'reason is required').max(200),
  notes: z.string().trim().max(500).optional(),
});

const facilityIdParamSchema = z.object({ facilityId: objectId });
const facilityAndMedicalHistoryIdParamSchema = z.object({ facilityId: objectId, medicalHistoryId: objectId });

const itemSearchQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
});

const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional(),
});

const scheduleCreateSchema = {
  body: z.object({
    inventoryItemId: z.string().min(1),
    dayOfMonth: z.number().min(1).max(28),
    quantity: z.number().min(1),
    supplier: z.string().optional(),
    purchaseOrderRef: z.string().optional(),
  }),
};

module.exports.scheduleCreateSchema = scheduleCreateSchema;

const forecastQuerySchema = z.object({
  windowDays: z.coerce.number().int().min(1).max(365).optional(),
});

module.exports = {
  createItemSchema,
  createItemManualSchema,
  receiveStockSchema,
  dispenseSchema,
  wastageSchema,
  adjustSchema,
  facilityIdParamSchema,
  facilityAndMedicalHistoryIdParamSchema,
  itemSearchQuerySchema,
  expiringQuerySchema,
  forecastQuerySchema,
};
