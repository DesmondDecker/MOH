const mongoose = require('mongoose');

const deliveryScheduleSchema = new mongoose.Schema(
  {
    facilityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
    inventoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem', required: true },
    dayOfMonth: { type: Number, min: 1, max: 28, required: true },
    quantity: { type: Number, required: true },
    supplier: { type: String },
    purchaseOrderRef: { type: String },
    active: { type: Boolean, default: true },
    nextRunDate: { type: Date },
    lastDeliveryAt: { type: Date },
    lastDeliveryQuantity: { type: Number },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DeliverySchedule', deliveryScheduleSchema);
