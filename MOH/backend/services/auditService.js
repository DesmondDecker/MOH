const crypto = require('crypto');
const { AuditLog, AuditChainState } = require('../models/AuditLog');
const SyncQueue = require('../models/SyncQueue');
const socketService = require('./socketService');

function computeHash({ prevHash, sequence, actorId, action, targetType, targetId, before, after, createdAt }) {
  const payload = JSON.stringify({
    prevHash,
    sequence,
    actorId: actorId?.toString(),
    action,
    targetType: targetType || null,
    targetId: targetId?.toString() || null,
    before: before || null,
    after: after || null,
    createdAt: createdAt.toISOString(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Records an immutable, hash-chained audit entry.
 * Uses optimistic locking on the chain-state singleton so concurrent writes
 * never corrupt ordering — a losing writer retries against the new tip.
 *
 * This is the ONLY function in the codebase that should ever write to AuditLog.
 */
async function record({
  actorId,
  actorRole,
  facilityId = null,
  action,
  targetType = null,
  targetId = null,
  before = null,
  after = null,
  ip = null,
  userAgent = null,
}) {
  if (!actorId || !actorRole || !action) {
    throw new Error('auditService.record requires actorId, actorRole, and action');
  }

  const MAX_RETRIES = 5;
  let lastErr;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const chainState = await AuditChainState.findOneAndUpdate(
      { _id: 'singleton' },
      { $setOnInsert: { lastSequence: 0, lastHash: '0'.repeat(64) } },
      { upsert: true, new: true }
    );

    const nextSequence = chainState.lastSequence + 1;
    const createdAt = new Date();
    const hash = computeHash({
      prevHash: chainState.lastHash,
      sequence: nextSequence,
      actorId,
      action,
      targetType,
      targetId,
      before,
      after,
      createdAt,
    });

    // Optimistic lock: only advance the chain if nobody else has since we read it.
    const advanced = await AuditChainState.findOneAndUpdate(
      { _id: 'singleton', lastSequence: chainState.lastSequence },
      { $set: { lastSequence: nextSequence, lastHash: hash } },
      { new: true }
    );

    if (!advanced) {
      // Someone else won the race — retry against the new tip.
      lastErr = new Error('Audit chain contention, retrying');
      continue;
    }

    try {
      const entry = await AuditLog.create({
        sequence: nextSequence,
        prevHash: chainState.lastHash,
        hash,
        actorId,
        actorRole,
        facilityId,
        action,
        targetType,
        targetId,
        before,
        after,
        ip,
        userAgent,
        createdAt,
      });

      // Facility-scoped mutations get queued for sync to the central MoH
      // cluster. MoH-level actions (facilityId null, e.g. a super admin
      // onboarding a facility) originate centrally already, so they don't
      // need to be queued outward. This enqueue is best-effort: a failure
      // here must not roll back or fail the audit write itself — the audit
      // entry is the durable record, sync is a downstream concern that can
      // be reconciled/retried independently.
      if (facilityId) {
        try {
          await SyncQueue.create({
            facilityId,
            sourceAuditSequence: nextSequence,
            payload: {
              action,
              actorId,
              actorRole,
              targetType,
              targetId,
              before,
              after,
              occurredAt: createdAt,
            },
          });
        } catch (syncEnqueueErr) {
          console.error('[audit] Failed to enqueue sync event (non-fatal):', {
            sequence: nextSequence,
            error: syncEnqueueErr.message,
          });
        }
      }

      // Live dashboards (Clinical/Facility Admin/Pharmacy/MoH Command Center)
      // get a real-time refresh hint. Best-effort, same as sync enqueue above —
      // a Socket.io hiccup must never fail or roll back the audit write itself.
      try {
        socketService.emitActivity({
          facilityId: facilityId ? facilityId.toString() : null,
          action,
          targetType,
          actorRole,
          occurredAt: createdAt,
        });
      } catch (emitErr) {
        console.error('[audit] Failed to emit realtime activity signal (non-fatal):', {
          sequence: nextSequence,
          error: emitErr.message,
        });
      }

      return entry;
    } catch (err) {
      // If the insert itself fails after we already advanced the chain state,
      // the chain is now ahead of the log — this is a critical integrity fault.
      // Surface loudly rather than silently continuing.
      console.error('[audit] CRITICAL: chain state advanced but log insert failed', {
        sequence: nextSequence,
        error: err.message,
      });
      throw err;
    }
  }

  throw lastErr || new Error('Failed to record audit entry after retries');
}

/**
 * Verifies the integrity of the entire audit chain (or a range of it).
 * Returns { valid: boolean, brokenAtSequence: number|null }.
 * Intended for periodic integrity checks, not the request hot path.
 */
async function verifyChain({ fromSequence = 1 } = {}) {
  const cursor = AuditLog.find({ sequence: { $gte: fromSequence } })
    .sort({ sequence: 1 })
    .cursor();

  let expectedPrevHash = null;
  if (fromSequence > 1) {
    const prevEntry = await AuditLog.findOne({ sequence: fromSequence - 1 });
    if (!prevEntry) {
      return { valid: false, brokenAtSequence: fromSequence, reason: 'missing predecessor entry' };
    }
    expectedPrevHash = prevEntry.hash;
  } else {
    expectedPrevHash = '0'.repeat(64);
  }

  let lastSeq = fromSequence - 1;

  for await (const entry of cursor) {
    if (entry.sequence !== lastSeq + 1) {
      return { valid: false, brokenAtSequence: entry.sequence, reason: 'sequence gap' };
    }
    if (entry.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAtSequence: entry.sequence, reason: 'prevHash mismatch' };
    }
    const recomputed = computeHash({
      prevHash: entry.prevHash,
      sequence: entry.sequence,
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before,
      after: entry.after,
      createdAt: entry.createdAt,
    });
    if (recomputed !== entry.hash) {
      return { valid: false, brokenAtSequence: entry.sequence, reason: 'hash mismatch (tampered entry)' };
    }
    expectedPrevHash = entry.hash;
    lastSeq = entry.sequence;
  }

  return { valid: true, brokenAtSequence: null };
}

module.exports = { record, verifyChain };
