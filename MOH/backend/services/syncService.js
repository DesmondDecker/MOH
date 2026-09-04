const SyncQueue = require('../models/SyncQueue');

const MAX_ATTEMPTS_BEFORE_FAILED = 8;

/**
 * Claims up to `batchSize` pending events (flips them to 'syncing' so a
 * concurrent worker run can't pick up the same ones), attempts to push them
 * to the central MoH ingestion endpoint, and marks the outcome.
 *
 * This is a single pass — call it on an interval (see scripts/syncWorker.js).
 * Designed to run inside each facility's own deployment, pushing outward;
 * it does not run centrally.
 */
async function processQueue({ batchSize = 50 } = {}) {
  const centralUrl = process.env.MOH_CENTRAL_SYNC_URL;
  const facilityId = process.env.SYNC_FACILITY_ID;
  const apiKey = process.env.SYNC_FACILITY_API_KEY;

  if (!centralUrl || !facilityId || !apiKey) {
    throw new Error(
      'MOH_CENTRAL_SYNC_URL, SYNC_FACILITY_ID, and SYNC_FACILITY_API_KEY must be set for this facility\'s sync worker'
    );
  }

  const candidates = await SyncQueue.find({ facilityId, status: 'pending' })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  if (candidates.length === 0) {
    return { claimed: 0, synced: 0, failed: 0 };
  }

  const candidateIds = candidates.map((c) => c._id);

  // Per-document atomic claim: only flips docs still 'pending' at write time,
  // so a second worker instance racing this one can't double-claim any of them.
  await SyncQueue.updateMany(
    { _id: { $in: candidateIds }, status: 'pending' },
    { $set: { status: 'syncing', lastAttemptAt: new Date() } }
  );

  const claimed = await SyncQueue.find({ _id: { $in: candidateIds }, status: 'syncing' });
  if (claimed.length === 0) {
    return { claimed: 0, synced: 0, failed: 0 }; // lost the claim race entirely, nothing to do this pass
  }

  const events = claimed.map((c) => ({
    facilityId: c.facilityId,
    sourceAuditSequence: c.sourceAuditSequence,
    ...c.payload,
  }));

  try {
    const response = await fetch(`${centralUrl.replace(/\/$/, '')}/api/sync/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Facility-Id': facilityId,
        'X-Facility-Api-Key': apiKey,
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Central ingestion returned ${response.status}: ${text.slice(0, 200)}`);
    }

    await SyncQueue.updateMany(
      { _id: { $in: claimed.map((c) => c._id) } },
      { $set: { status: 'synced', syncedAt: new Date() }, $unset: { lastError: '' } }
    );

    return { claimed: claimed.length, synced: claimed.length, failed: 0 };
  } catch (err) {
    // Revert to pending (or failed, if this batch has exhausted retries)
    // so the next pass picks them up again, with the error recorded for
    // visibility on the admin dashboard.
    for (const doc of claimed) {
      const attempts = (doc.attempts || 0) + 1;
      await SyncQueue.updateOne(
        { _id: doc._id },
        {
          $set: {
            status: attempts >= MAX_ATTEMPTS_BEFORE_FAILED ? 'failed' : 'pending',
            attempts,
            lastError: err.message,
          },
        }
      );
    }

    return { claimed: claimed.length, synced: 0, failed: claimed.length, error: err.message };
  }
}

/**
 * Queue status for a facility's admin dashboard — "how much is waiting to
 * push, and when did we last successfully sync."
 */
async function getQueueStatus(facilityId) {
  const [pending, failed, oldestPending, lastSynced] = await Promise.all([
    SyncQueue.countDocuments({ facilityId, status: 'pending' }),
    SyncQueue.countDocuments({ facilityId, status: 'failed' }),
    SyncQueue.findOne({ facilityId, status: 'pending' }).sort({ createdAt: 1 }).select('createdAt'),
    SyncQueue.findOne({ facilityId, status: 'synced' }).sort({ syncedAt: -1 }).select('syncedAt'),
  ]);

  return {
    pendingCount: pending,
    failedCount: failed,
    oldestPendingSince: oldestPending?.createdAt || null,
    lastSyncedAt: lastSynced?.syncedAt || null,
  };
}

module.exports = { processQueue, getQueueStatus };
