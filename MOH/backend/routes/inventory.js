const express = require('express');
const router = express.Router();

const InventoryItem = require('../models/InventoryItem');
const StockBatch = require('../models/StockBatch');
const StockTransaction = require('../models/StockTransaction');
const MedicalHistory = require('../models/MedicalHistory');
const auditService = require('../services/auditService');
const inventoryService = require('../services/inventoryService');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { z } = require('zod');
const {
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
  scheduleCreateSchema,
} = require('../validation/inventorySchemas');

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// POST /api/inventory/items — add to the item catalog (facility_admin or moh_super_admin)
// ---------------------------------------------------------------------------
router.post('/items', requireRole('facility_admin', 'moh_super_admin'), validate({ body: createItemSchema }), async (req, res, next) => {
  try {
    const { name, category, drugClass, unit, defaultReorderThreshold, isControlledSubstance } = req.body;

    const item = await InventoryItem.create({
      name,
      category,
      drugClass,
      unit,
      defaultReorderThreshold,
      isControlledSubstance: !!isControlledSubstance,
      createdBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'inventory_item_created',
      targetType: 'InventoryItem',
      targetId: item._id,
      after: { name: item.name, category: item.category },
      ...clientMeta(req),
    });

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/facility/:facilityId/schedules — create monthly delivery schedule
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/schedules',
  requireRole('moh_super_admin', 'facility_admin'),
  validate({ params: facilityIdParamSchema, body: scheduleCreateSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { inventoryItemId, dayOfMonth, quantity, supplier, purchaseOrderRef } = req.body;
      const sch = await (require('../models/DeliverySchedule')).create({
        facilityId: req.params.facilityId,
        inventoryItemId,
        dayOfMonth,
        quantity,
        supplier,
        purchaseOrderRef,
        createdBy: req.user.id,
      });
      res.status(201).json(sch);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/inventory/items/manual — create a new catalog item by typing the
// name freely (facility_admin or store_officer). Prevents duplicates by name.
// ---------------------------------------------------------------------------
router.post(
  '/items/manual',
  requireRole('facility_admin', 'moh_super_admin', 'store_officer'),
  validate({ body: createItemManualSchema }),
  async (req, res, next) => {
    try {
      const { name, category = 'drug', drugClass, unit = 'unit', defaultReorderThreshold, isControlledSubstance } = req.body;

      // Check for near-duplicate to avoid catalog bloat
      const existing = await InventoryItem.findOne({ name: new RegExp(`^${name.trim()}$`, 'i'), status: 'active' });
      if (existing) {
        return res.status(409).json({ error: 'An item with this name already exists in the catalog', existing });
      }

      const item = await InventoryItem.create({
        name: name.trim(),
        category,
        drugClass: drugClass?.trim(),
        unit: unit?.trim() || 'unit',
        defaultReorderThreshold: defaultReorderThreshold || 10,
        isControlledSubstance: !!isControlledSubstance,
        createdBy: req.user.id,
      });

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.user.facilityId,
        action: 'inventory_item_created',
        targetType: 'InventoryItem',
        targetId: item._id,
        after: { name: item.name, category: item.category },
        ...clientMeta(req),
      });

      res.status(201).json(item);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/inventory/items?search=... — catalog search
// ---------------------------------------------------------------------------
router.get('/items', validate({ query: itemSearchQuerySchema }), async (req, res, next) => {
  try {
    const { search } = req.query;
    const filter = { status: 'active' };
    if (search) filter.name = new RegExp(search, 'i');
    const items = await InventoryItem.find(filter).limit(50);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/inventory/facility/:facilityId/stock — current stock levels for a facility
// ---------------------------------------------------------------------------
router.get('/facility/:facilityId/stock', validate({ params: facilityIdParamSchema }), requireSameFacility, async (req, res, next) => {
  try {
    const batches = await StockBatch.aggregate([
      { $match: { facilityId: new (require('mongoose').Types.ObjectId)(req.params.facilityId), status: 'active', expiryDate: { $gt: new Date() } } },
      {
        $group: {
          _id: '$inventoryItemId',
          totalQuantity: { $sum: '$quantityRemaining' },
          nearestExpiry: { $min: '$expiryDate' },
        },
      },
      {
        $lookup: { from: 'inventoryitems', localField: '_id', foreignField: '_id', as: 'item' },
      },
      { $unwind: '$item' },
      {
        $project: {
          inventoryItemId: '$_id',
          _id: 0,
          name: '$item.name',
          unit: '$item.unit',
          category: '$item.category',
          totalQuantity: 1,
          nearestExpiry: 1,
          reorderThreshold: '$item.defaultReorderThreshold',
          belowThreshold: { $lte: ['$totalQuantity', '$item.defaultReorderThreshold'] },
        },
      },
      { $sort: { belowThreshold: -1, name: 1 } },
    ]);

    res.json(batches);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/inventory/facility/:facilityId/item/:itemId/details
// Returns stock, nearest expiry, last delivery info and parsed mg
// ---------------------------------------------------------------------------
router.get('/facility/:facilityId/item/:itemId/details', validate({ params: z.object({ facilityId: z.string().min(1), itemId: z.string().min(1) }) }), requireSameFacility, async (req, res, next) => {
  try {
    const { facilityId, itemId } = req.params;
    const mongoose = require('mongoose');

    const stockAgg = await StockBatch.aggregate([
      { $match: { facilityId: new mongoose.Types.ObjectId(facilityId), inventoryItemId: new mongoose.Types.ObjectId(itemId), status: 'active', expiryDate: { $gt: new Date() } } },
      { $group: { _id: '$inventoryItemId', totalQuantity: { $sum: '$quantityRemaining' }, nearestExpiry: { $min: '$expiryDate' } } },
    ]);

    const stock = stockAgg[0] || { totalQuantity: 0, nearestExpiry: null };

    // Last delivery from DeliverySchedule if present, else look at most recent receipt transaction
    const DeliverySchedule = require('../models/DeliverySchedule');
    const lastSchedule = await DeliverySchedule.findOne({ facilityId, inventoryItemId: itemId }).sort({ lastDeliveryAt: -1 }).lean();

    let lastDeliveryAt = lastSchedule?.lastDeliveryAt || null;
    let lastDeliveryQuantity = lastSchedule?.lastDeliveryQuantity || null;

    if (!lastDeliveryAt) {
      const lastReceipt = await StockTransaction.findOne({ facilityId, inventoryItemId: itemId, type: 'receipt' }).sort({ createdAt: -1 }).lean();
      if (lastReceipt) {
        lastDeliveryAt = lastReceipt.createdAt;
        lastDeliveryQuantity = lastReceipt.quantity;
      }
    }

    const item = await (require('../models/InventoryItem')).findById(itemId).lean();
    // parse mg from name, e.g. 'Amoxicillin 500mg'
    let milligrams = null;
    if (item?.name) {
      const m = item.name.match(/(\d+)\s*mg/i);
      if (m) milligrams = Number(m[1]);
    }

    res.json({ inventoryItemId: itemId, name: item?.name, unit: item?.unit, totalQuantity: stock.totalQuantity, nearestExpiry: stock.nearestExpiry, lastDeliveryAt, lastDeliveryQuantity, milligrams });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/inventory/facility/:facilityId/expiring?days=90 — expiry calendar view
// ---------------------------------------------------------------------------
router.get('/facility/:facilityId/expiring', validate({ params: facilityIdParamSchema, query: expiringQuerySchema }), requireSameFacility, async (req, res, next) => {
  try {
    const days = req.query.days || 90;
    const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const batches = await StockBatch.find({
      facilityId: req.params.facilityId,
      status: 'active',
      quantityRemaining: { $gt: 0 },
      expiryDate: { $lte: cutoff, $gt: new Date() },
    })
      .populate('inventoryItemId', 'name unit category')
      .sort({ expiryDate: 1 });

    res.json(batches);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/inventory/facility/:facilityId/forecast?windowDays=30 —
// predictive stockout projection across every item at this facility, most
// urgent first. Same method as the MoH national forecast, scoped to one
// facility so an admin sees all their at-risk items at once, not one at a time.
// ---------------------------------------------------------------------------
router.get('/facility/:facilityId/forecast', validate({ params: facilityIdParamSchema, query: forecastQuerySchema }), requireSameFacility, async (req, res, next) => {
  try {
    const windowDays = req.query.windowDays || 30;
    const forecasts = await inventoryService.forecastStockouts({
      facilityId: req.params.facilityId,
      windowDays,
    });
    res.json(forecasts);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/inventory/facility/:facilityId/receive — record a stock receipt
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/receive',
  requireRole('facility_admin', 'pharmacist', 'store_officer'),
  validate({ params: facilityIdParamSchema, body: receiveStockSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { inventoryItemId, batchNumber, expiryDate, quantity, supplier, purchaseOrderRef, unitCost } = req.body;

      const item = await InventoryItem.findById(inventoryItemId);
      if (!item) return res.status(404).json({ error: 'Inventory item not found' });

      const { batch, transaction } = await inventoryService.receiveStock({
        facilityId: req.params.facilityId,
        inventoryItemId,
        batchNumber,
        expiryDate,
        quantity,
        supplier,
        purchaseOrderRef,
        unitCost,
        receivedBy: req.user.id,
      });

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.params.facilityId,
        action: 'stock_received',
        targetType: 'StockBatch',
        targetId: batch._id,
        after: { itemName: item.name, quantity, batchNumber, expiryDate },
        ...clientMeta(req),
      });

      res.status(201).json({ batch, transaction });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/inventory/facility/:facilityId/dispense/prescription/:medicalHistoryId
// Dispenses stock against a specific prescription entry, FEFO, and updates
// the prescription's dispenseStatus — this is the prescription-to-inventory
// loop closing.
//
// Supports PARTIAL dispensing when the prescription has a tracked
// quantityPrescribed: each call dispenses up to whatever remains
// (quantityPrescribed - quantityDispensed so far), and the status becomes
// 'partially_dispensed' until the full amount has been given out across one
// or more visits — common in practice when a facility only has some of a
// course in stock. Prescriptions created before quantityPrescribed existed
// have no target to track partial fills against, so those fall back to the
// original one-shot behavior (any dispense call marks the whole thing
// 'dispensed') — flagged in the response as `legacyUntracked` so the UI can
// make that visible rather than silently treating it the same as a tracked one.
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/dispense/prescription/:medicalHistoryId',
  requireRole('pharmacist', 'facility_admin'),
  validate({ params: facilityAndMedicalHistoryIdParamSchema, body: dispenseSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { quantity } = req.body;

      const prescription = await MedicalHistory.findById(req.params.medicalHistoryId);
      if (!prescription || prescription.entryType !== 'prescription') {
        return res.status(404).json({ error: 'Prescription not found' });
      }
      if (!prescription.prescription?.inventoryItemId) {
        return res.status(400).json({
          error: 'This prescription is not linked to a catalog inventory item — link it before dispensing',
        });
      }
      if (prescription.prescription.dispenseStatus === 'dispensed') {
        return res.status(409).json({ error: 'Prescription already fully dispensed' });
      }
      if (prescription.prescription.dispenseStatus === 'cancelled') {
        return res.status(409).json({ error: 'Prescription was cancelled' });
      }

      const { quantityPrescribed } = prescription.prescription;
      const legacyUntracked = quantityPrescribed === undefined || quantityPrescribed === null;

      if (!legacyUntracked) {
        const remaining = quantityPrescribed - (prescription.prescription.quantityDispensed || 0);
        if (quantity > remaining) {
          return res.status(400).json({
            error: `Requested ${quantity} exceeds the ${remaining} still owed on this prescription (${quantityPrescribed} prescribed, ${prescription.prescription.quantityDispensed || 0} already dispensed).`,
          });
        }
      }

      const transactions = await inventoryService.dispenseStock({
        facilityId: req.params.facilityId,
        inventoryItemId: prescription.prescription.inventoryItemId,
        quantity,
        performedBy: req.user.id,
        patientId: prescription.patientId,
        medicalHistoryId: prescription._id,
      });

      if (legacyUntracked) {
        // No tracked target — preserve the original behavior rather than
        // guessing at a quantity target that was never recorded.
        prescription.prescription.dispenseStatus = 'dispensed';
        prescription.prescription.quantityDispensed = quantity;
      } else {
        prescription.prescription.quantityDispensed =
          (prescription.prescription.quantityDispensed || 0) + quantity;
        prescription.prescription.dispenseStatus =
          prescription.prescription.quantityDispensed >= quantityPrescribed ? 'dispensed' : 'partially_dispensed';
      }
      await prescription.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.params.facilityId,
        action: 'prescription_dispensed',
        targetType: 'MedicalHistory',
        targetId: prescription._id,
        after: {
          quantity,
          batchesUsed: transactions.length,
          dispenseStatus: prescription.prescription.dispenseStatus,
          quantityDispensed: prescription.prescription.quantityDispensed,
          quantityPrescribed: legacyUntracked ? null : quantityPrescribed,
        },
        ...clientMeta(req),
      });

      res.status(201).json({
        transactions,
        prescription,
        legacyUntracked,
        remainingQuantity: legacyUntracked ? 0 : quantityPrescribed - prescription.prescription.quantityDispensed,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/inventory/facility/:facilityId/wastage
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/wastage',
  requireRole('pharmacist', 'facility_admin', 'store_officer'),
  validate({ params: facilityIdParamSchema, body: wastageSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { inventoryItemId, batchId, quantity, reason, notes } = req.body;

      const transaction = await inventoryService.recordWastage({
        facilityId: req.params.facilityId,
        inventoryItemId,
        batchId,
        quantity,
        reason,
        notes,
        performedBy: req.user.id,
      });

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.params.facilityId,
        action: 'stock_wastage_recorded',
        targetType: 'StockTransaction',
        targetId: transaction._id,
        after: { quantity, reason },
        ...clientMeta(req),
      });

      res.status(201).json(transaction);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/inventory/facility/:facilityId/adjust
// Store officer / facility admin adds or deducts stock manually:
//   type 'add'    → extra receipt (physical count correction, donation, etc.)
//   type 'reduce' → deduction without a patient/prescription link (wastage,
//                   damaged stock, physical count shortfall)
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/adjust',
  requireRole('facility_admin', 'store_officer'),
  validate({ params: facilityIdParamSchema, body: adjustSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { inventoryItemId, quantity, type, reason, notes } = req.body;

      const item = await InventoryItem.findById(inventoryItemId);
      if (!item) return res.status(404).json({ error: 'Inventory item not found' });

      let result;
      if (type === 'add') {
        // Create a new batch for the added quantity
        const { batch, transaction } = await inventoryService.receiveStock({
          facilityId: req.params.facilityId,
          inventoryItemId,
          batchNumber: `ADJ-${Date.now()}`,
          expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1yr default
          quantity,
          supplier: reason,
          receivedBy: req.user.id,
        });
        result = { batch, transaction };
      } else {
        // Reduce via wastage route (FEFO)
        const wastageReason = ['damaged', 'expired', 'contaminated', 'other'].includes(reason) ? reason : 'other';
        // Find active batch(es) to deduct from (FEFO)
        const batches = await StockBatch.find({
          facilityId: req.params.facilityId,
          inventoryItemId,
          status: 'active',
          quantityRemaining: { $gt: 0 },
        }).sort({ expiryDate: 1 });

        let remaining = quantity;
        const transactions = [];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, batch.quantityRemaining);
          batch.quantityRemaining -= deduct;
          if (batch.quantityRemaining === 0) batch.status = 'depleted';
          await batch.save();

          const tx = await StockTransaction.create({
            type: 'wastage',
            facilityId: req.params.facilityId,
            inventoryItemId,
            batchId: batch._id,
            quantity: deduct,
            wastageReason,
            wastageNotes: notes,
            performedBy: req.user.id,
          });
          transactions.push(tx);
          remaining -= deduct;
        }
        if (remaining > 0) {
          return res.status(400).json({ error: `Only ${quantity - remaining} units available; cannot reduce by ${quantity}` });
        }
        result = { transactions };
      }

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.params.facilityId,
        action: type === 'add' ? 'stock_adjusted_add' : 'stock_adjusted_reduce',
        targetType: 'InventoryItem',
        targetId: inventoryItemId,
        after: { itemName: item.name, quantity, type, reason, notes },
        ...clientMeta(req),
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
