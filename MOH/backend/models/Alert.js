const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility' },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    type: { type: String, enum: ['low_stock', 'near_expiry', 'delivery', 'other'], required: true },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed },
    seen: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
