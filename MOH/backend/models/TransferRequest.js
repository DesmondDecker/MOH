const mongoose = require('mongoose');
const { Schema } = mongoose;

const transferRequestSchema = new Schema(
  {
    fromFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
    toFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },

    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    quantityRequested: { type: Number, required: true, min: 1 },

    reason: { type: String, required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // facility_admin at toFacility
    requestedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'fulfilled', 'cancelled'],
      default: 'pending',
    },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // facility_admin at fromFacility
    approvedAt: { type: Date },
    rejectionReason: { type: String },

    fulfilledBatchId: { type: Schema.Types.ObjectId, ref: 'StockBatch' },
    fulfilledAt: { type: Date },
  },
  { timestamps: true }
);

transferRequestSchema.index({ toFacilityId: 1, status: 1 });
transferRequestSchema.index({ fromFacilityId: 1, status: 1 });

module.exports = mongoose.model('TransferRequest', transferRequestSchema);
