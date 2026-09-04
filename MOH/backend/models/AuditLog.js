const mongoose = require('mongoose');
const { Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    sequence: { type: Number, required: true, unique: true, index: true },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },

    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorRole: { type: String, required: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility' }, // null for MoH-level actions

    action: { type: String, required: true }, // e.g. 'user_created', 'credentials_reset', 'login_success'
    targetType: { type: String }, // e.g. 'User', 'Patient', 'StockTransaction'
    targetId: { type: Schema.Types.ObjectId },

    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },

    ip: { type: String },
    userAgent: { type: String },

    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

// Defense in depth: nobody should update or delete audit entries at the
// application layer, even if the DB user's own permissions are ever misconfigured.
auditLogSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  next(new Error('AuditLog entries are immutable and cannot be updated.'));
});
auditLogSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error('AuditLog entries are immutable and cannot be deleted.'));
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// Singleton document tracking the tip of the hash chain.
const chainStateSchema = new Schema({
  _id: { type: String, default: 'singleton' },
  lastSequence: { type: Number, default: 0 },
  lastHash: { type: String, default: '0'.repeat(64) }, // genesis hash
});

const AuditChainState = mongoose.model('AuditChainState', chainStateSchema);

module.exports = { AuditLog, AuditChainState };
