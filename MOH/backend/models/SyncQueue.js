const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * SYNC SCOPE NOTE
 * -------------------------------------------------------------------------
 * This queue carries audit-log-derived events to the central MoH cluster —
 * NOT raw clinical documents. Every mutating action already produces an
 * AuditLog entry with actor/action/target/before/after; that's exactly the
 * shape MoH needs for oversight, surveillance triggers, and inventory
 * visibility, without standing up a second full-document replication
 * pipeline (which also means we're not shipping more patient PII over the
 * wire than necessary). If a future requirement needs full record
 * replication (e.g. a patient transferring facilities needs their complete
 * chart), that's a deliberate, separate sync path — not this one.
 */

const syncQueueSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    sourceAuditSequence: { type: Number, required: true, unique: true }, // ties back to the local AuditLog entry

    payload: {
      action: String,
      actorId: Schema.Types.ObjectId,
      actorRole: String,
      targetType: String,
      targetId: Schema.Types.ObjectId,
      before: Schema.Types.Mixed,
      after: Schema.Types.Mixed,
      occurredAt: Date,
    },

    status: { type: String, enum: ['pending', 'syncing', 'synced', 'failed'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: { type: Date },
    lastError: { type: String },
    syncedAt: { type: Date },
  },
  { timestamps: true }
);

syncQueueSchema.index({ facilityId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('SyncQueue', syncQueueSchema);
