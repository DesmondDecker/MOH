const express = require('express');
const router = express.Router();

const TransferRequest = require('../models/TransferRequest');
const InventoryItem = require('../models/InventoryItem');
const StockTransaction = require('../models/StockTransaction');
const auditService = require('../services/auditService');
const inventoryService = require('../services/inventoryService');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createTransferSchema,
  rejectTransferSchema,
  facilityIdParamSchema,
  idParamSchema,
  listQuerySchema,
} = require('../validation/transferSchemas');

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// POST /api/transfers — a facility admin requests stock from another facility
// ---------------------------------------------------------------------------
router.post('/', requireRole('facility_admin'), validate({ body: createTransferSchema }), async (req, res, next) => {
  try {
    const { fromFacilityId, inventoryItemId, quantityRequested, reason } = req.body;
    if (fromFacilityId === req.user.facilityId) {
      return res.status(400).json({ error: 'Cannot request a transfer from your own facility' });
    }

    const item = await InventoryItem.findById(inventoryItemId);
    if (!item) return res.status(404).json({ error: 'Inventory item not found' });

    const transfer = await TransferRequest.create({
      fromFacilityId,
      toFacilityId: req.user.facilityId,
      inventoryItemId,
      quantityRequested,
      reason,
      requestedBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'transfer_requested',
      targetType: 'TransferRequest',
      targetId: transfer._id,
      after: { fromFacilityId, itemName: item.name, quantityRequested },
      ...clientMeta(req),
    });

    res.status(201).json(transfer);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/transfers/facility/:facilityId?direction=incoming|outgoing&status=pending
// ---------------------------------------------------------------------------
router.get('/facility/:facilityId', requireRole('facility_admin', 'moh_super_admin'), validate({ params: facilityIdParamSchema, query: listQuerySchema }), async (req, res, next) => {
  try {
    const { direction = 'incoming', status } = req.query;
    const filter = direction === 'outgoing' ? { fromFacilityId: req.params.facilityId } : { toFacilityId: req.params.facilityId };
    if (status) filter.status = status;

    const transfers = await TransferRequest.find(filter)
      .populate('inventoryItemId', 'name unit')
      .sort({ requestedAt: -1 });

    res.json(transfers);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/transfers/:id/approve — the SOURCE facility's admin approves and fulfills
// Deducts stock from the source facility (FEFO) and creates a matching
// incoming batch at the destination facility, with linked transactions on
// both sides.
// ---------------------------------------------------------------------------
router.post('/:id/approve', requireRole('facility_admin'), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const transfer = await TransferRequest.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer request not found' });
    if (transfer.fromFacilityId.toString() !== req.user.facilityId) {
      return res.status(403).json({ error: 'Only the source facility can approve this transfer' });
    }
    if (transfer.status !== 'pending') {
      return res.status(409).json({ error: `Transfer is already ${transfer.status}` });
    }

    // Deduct from source (FEFO) — reuses the same deduction logic as dispense.
    const draws = await inventoryService.deductStockFEFO(
      transfer.fromFacilityId,
      transfer.inventoryItemId,
      transfer.quantityRequested
    );

    const outTransactions = await Promise.all(
      draws.map((draw) =>
        StockTransaction.create({
          type: 'transfer_out',
          facilityId: transfer.fromFacilityId,
          inventoryItemId: transfer.inventoryItemId,
          batchId: draw.batchId,
          quantity: draw.quantityTaken,
          counterpartFacilityId: transfer.toFacilityId,
          linkedTransferRequestId: transfer._id,
          performedBy: req.user.id,
        })
      )
    );

    // Create a single consolidated incoming batch at the destination facility.
    // Batch/expiry provenance is preserved via the linked transfer request +
    // source transactions rather than trying to reconstruct multiple source
    // batches into separate destination batches.
    const StockBatch = require('../models/StockBatch');
    const sourceBatches = await StockBatch.find({ _id: { $in: draws.map((d) => d.batchId) } });
    const earliestExpiry = sourceBatches.reduce(
      (min, b) => (b.expiryDate < min ? b.expiryDate : min),
      sourceBatches[0].expiryDate
    );

    const destinationBatch = await StockBatch.create({
      facilityId: transfer.toFacilityId,
      inventoryItemId: transfer.inventoryItemId,
      batchNumber: `TRANSFER-${transfer._id.toString().slice(-8)}`,
      expiryDate: earliestExpiry, // conservative: use the soonest expiry among consolidated batches
      quantityReceived: transfer.quantityRequested,
      quantityRemaining: transfer.quantityRequested,
      supplier: `Internal transfer from facility ${transfer.fromFacilityId}`,
      receivedBy: req.user.id,
    });

    const inTransaction = await StockTransaction.create({
      type: 'transfer_in',
      facilityId: transfer.toFacilityId,
      inventoryItemId: transfer.inventoryItemId,
      batchId: destinationBatch._id,
      quantity: transfer.quantityRequested,
      counterpartFacilityId: transfer.fromFacilityId,
      linkedTransferRequestId: transfer._id,
      performedBy: req.user.id,
    });

    transfer.status = 'fulfilled';
    transfer.approvedBy = req.user.id;
    transfer.approvedAt = new Date();
    transfer.fulfilledBatchId = destinationBatch._id;
    transfer.fulfilledAt = new Date();
    await transfer.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: transfer.fromFacilityId,
      action: 'transfer_approved_and_fulfilled',
      targetType: 'TransferRequest',
      targetId: transfer._id,
      after: { toFacilityId: transfer.toFacilityId, quantity: transfer.quantityRequested },
      ...clientMeta(req),
    });

    res.json({ transfer, outTransactions, inTransaction, destinationBatch });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/transfers/:id/reject
// ---------------------------------------------------------------------------
router.post('/:id/reject', requireRole('facility_admin'), validate({ params: idParamSchema, body: rejectTransferSchema }), async (req, res, next) => {
  try {
    const { reason } = req.body;
    const transfer = await TransferRequest.findById(req.params.id);
    if (!transfer) return res.status(404).json({ error: 'Transfer request not found' });
    if (transfer.fromFacilityId.toString() !== req.user.facilityId) {
      return res.status(403).json({ error: 'Only the source facility can reject this transfer' });
    }
    if (transfer.status !== 'pending') {
      return res.status(409).json({ error: `Transfer is already ${transfer.status}` });
    }

    transfer.status = 'rejected';
    transfer.rejectionReason = reason;
    await transfer.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: transfer.fromFacilityId,
      action: 'transfer_rejected',
      targetType: 'TransferRequest',
      targetId: transfer._id,
      after: { reason },
      ...clientMeta(req),
    });

    res.json(transfer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
