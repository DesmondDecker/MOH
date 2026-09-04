const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * STOCK MODEL DESIGN NOTE
 * -------------------------------------------------------------------------
 * Rather than a separate cached "StockLevel" collection that can drift out
 * of sync with reality, StockBatch IS the source of truth: each batch
 * (facility + item + lot number + expiry) tracks its own remaining quantity.
 * "Current stock level" for a facility+item is always computed by summing
 * non-expired, non-zero batches — see services/inventoryService.js
 * getStockLevel(). This avoids the classic bug where a cached aggregate
 * quietly diverges from the transactions that are supposed to back it.
 */

const stockBatchSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },
    inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem', required: true, index: true },

    batchNumber: { type: String, required: true, trim: true },
    expiryDate: { type: Date, required: true },

    quantityReceived: { type: Number, required: true, min: 0 },
    quantityRemaining: { type: Number, required: true, min: 0 },

    supplier: { type: String, trim: true },
    purchaseOrderRef: { type: String, trim: true },
    unitCost: { type: Number }, // for procurement tracking / anomaly detection on pricing

    receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receivedAt: { type: Date, default: Date.now },

    status: { type: String, enum: ['active', 'depleted', 'expired', 'recalled'], default: 'active' },
  },
  { timestamps: true }
);

stockBatchSchema.index({ facilityId: 1, inventoryItemId: 1, status: 1 });
stockBatchSchema.index({ expiryDate: 1, status: 1 }); // for expiry alerts across all facilities

module.exports = mongoose.model('StockBatch', stockBatchSchema);
