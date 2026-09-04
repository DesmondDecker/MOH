const mongoose = require('mongoose');
const { Schema } = mongoose;

const stockTransactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['receipt', 'dispense', 'transfer_out', 'transfer_in', 'wastage', 'expiry_writeoff'],
      required: true,
    },

    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },

    quantity: { type: Number, required: true }, // always positive; direction implied by `type`

    // Dispense-specific linkage — closes the prescription-to-inventory loop.
    dispensedForPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    dispensedForMedicalHistoryId: { type: Schema.Types.ObjectId, ref: 'MedicalHistory' },

    // Transfer-specific linkage
    counterpartFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility' },
    linkedTransferRequestId: { type: Schema.Types.ObjectId, ref: 'TransferRequest' },

    // Wastage-specific
    wastageReason: { type: String, enum: ['damaged', 'expired', 'contaminated', 'other'] },
    wastageNotes: String,

    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    performedAt: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false }
);

// Like AuditLog, transactions are an append-only ledger — corrections happen
// via a new reversing transaction, never by editing history.
stockTransactionSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function (next) {
  next(new Error('StockTransaction entries are immutable — record a reversing transaction instead.'));
});
stockTransactionSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error('StockTransaction entries are immutable and cannot be deleted.'));
});

stockTransactionSchema.index({ facilityId: 1, performedAt: -1 });
stockTransactionSchema.index({ inventoryItemId: 1, performedAt: -1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
