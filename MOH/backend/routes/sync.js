const express = require('express');
const router = express.Router();

const SyncEvent = require('../models/SyncEvent');
const { authenticateFacilitySync } = require('../middleware/facilityApiKey');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const syncService = require('../services/syncService');

// ---------------------------------------------------------------------------
// POST /api/sync/ingest — CENTRAL SIDE. Receives a batch of audit-derived
// events from a facility's sync worker. Idempotent: duplicate
// (facilityId, sourceAuditSequence) pairs from a retried push are silently
// skipped rather than double-applied.
// ---------------------------------------------------------------------------
router.post('/ingest', authenticateFacilitySync, async (req, res, next) => {
  try {
    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }

    // Defense in depth: every event's facilityId must match the
    // authenticated facility — a facility's sync worker can only ever push
    // events that originated at that same facility.
    const mismatched = events.some((e) => e.facilityId?.toString() !== req.syncFacilityId.toString());
    if (mismatched) {
      return res.status(403).json({ error: 'Event facilityId does not match authenticated facility' });
    }

    const docs = events.map((e) => ({
      facilityId: e.facilityId,
      sourceAuditSequence: e.sourceAuditSequence,
      action: e.action,
      actorId: e.actorId,
      actorRole: e.actorRole,
      targetType: e.targetType,
      targetId: e.targetId,
      before: e.before,
      after: e.after,
      occurredAt: e.occurredAt,
    }));

    let insertedCount = 0;
    let duplicateCount = 0;

    try {
      const result = await SyncEvent.insertMany(docs, { ordered: false });
      insertedCount = result.length;
    } catch (err) {
      // Bulk insert with ordered:false still throws on any duplicate-key
      // error but reports which ones succeeded via err.insertedDocs /
      // writeErrors — count duplicates separately from real failures.
      if (err.writeErrors) {
        insertedCount = err.insertedDocs?.length || 0;
        for (const writeErr of err.writeErrors) {
          if (writeErr.code === 11000) {
            duplicateCount += 1;
          } else {
            throw err; // a non-duplicate error is a real failure, surface it
          }
        }
      } else {
        throw err;
      }
    }

    // Here is where a real deployment would fan these events out into
    // MoH-facing aggregates (surveillance dashboard counters, stock-level
    // rollups, facility activity feeds). Not built in this pass — this
    // endpoint's job is durable, idempotent ingestion; the read-side
    // aggregation is a separate concern layered on top of SyncEvent.
    res.status(201).json({ received: events.length, inserted: insertedCount, duplicatesSkipped: duplicateCount });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/sync/facility/:facilityId/status — LOCAL SIDE. For the facility
// admin dashboard: how much is queued, any failures, last successful sync.
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/status',
  authenticate,
  blockUntilPasswordChanged,
  requireRole('facility_admin', 'moh_super_admin'),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const status = await syncService.getQueueStatus(req.params.facilityId);
      res.json(status);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
