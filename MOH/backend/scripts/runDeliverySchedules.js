require('dotenv').config();
const connectDB = require('../config/db');
const DeliverySchedule = require('../models/DeliverySchedule');
const inventoryService = require('../services/inventoryService');
const Alert = require('../models/Alert');

async function runSchedules() {
  await connectDB();

  const today = new Date();
  const day = Math.min(today.getDate(), 28); // cap at 28 for monthly schedules

  const schedules = await DeliverySchedule.find({ active: true, dayOfMonth: day }).populate('inventoryItemId facilityId');

  for (const s of schedules) {
    try {
      // Simulate a delivery: create a batch and a receipt transaction
      const expiry = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // default 180 days
      const { batch, transaction } = await inventoryService.receiveStock({
        facilityId: s.facilityId._id || s.facilityId,
        inventoryItemId: s.inventoryItemId._id || s.inventoryItemId,
        batchNumber: `SCHEDULE-${s._id}-${Date.now()}`,
        expiryDate: expiry,
        quantity: s.quantity,
        supplier: s.supplier,
        purchaseOrderRef: s.purchaseOrderRef,
        unitCost: null,
        receivedBy: s.createdBy,
      });

      s.lastDeliveryAt = new Date();
      s.lastDeliveryQuantity = s.quantity;
      await s.save();

      await Alert.create({
        facilityId: s.facilityId._id || s.facilityId,
        inventoryItemId: s.inventoryItemId._id || s.inventoryItemId,
        type: 'delivery',
        message: `Scheduled delivery received: ${s.quantity} ${s.inventoryItemId.name} at ${s.facilityId.name}`,
        metadata: { batchId: batch._id, transactionId: transaction._id },
      });
    } catch (err) {
      console.error('Schedule run failed for', s._id, err.message);
      await Alert.create({ type: 'other', message: `Delivery schedule failed for ${s._id}: ${err.message}`, metadata: { scheduleId: s._id } });
    }
  }

  console.log(`Processed ${schedules.length} schedules`);
  process.exit(0);
}

runSchedules().catch((err) => {
  console.error(err);
  process.exit(1);
});
