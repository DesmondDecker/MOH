const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * Lives on the CENTRAL MoH cluster. Records every synced event by its
 * (facilityId, sourceAuditSequence) pair, which is unique per origin —
 * so a retried push after a dropped connection can't be double-applied.
 */
const syncEventSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    sourceAuditSequence: { type: Number, required: true },

    action: { type: String, required: true },
    actorId: Schema.Types.ObjectId,
    actorRole: String,
    targetType: String,
    targetId: Schema.Types.ObjectId,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    occurredAt: Date,

    receivedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

syncEventSchema.index({ facilityId: 1, sourceAuditSequence: 1 }, { unique: true });

module.exports = mongoose.model('SyncEvent', syncEventSchema);
