const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const StockTransaction = require('../models/StockTransaction');
const DeliverySchedule = require('../models/DeliverySchedule');
const Alert = require('../models/Alert');

/**
 * Current on-hand stock for a facility+item = sum of quantityRemaining
 * across active, non-expired batches. Computed live rather than cached —
 * see the design note in models/StockBatch.js.
 */
async function getStockLevel(facilityId, inventoryItemId) {
  const result = await StockBatch.aggregate([
    {
      $match: {
        facilityId,
        inventoryItemId,
        status: 'active',
        expiryDate: { $gt: new Date() },
      },
    },
    { $group: { _id: null, total: { $sum: '$quantityRemaining' } } },
  ]);
  return result[0]?.total || 0;
}

/**
 * Deducts `quantity` units from a facility's stock of an item using
 * First-Expiry-First-Out ordering, across as many batches as needed.
 * Each batch decrement is an atomic conditional update (only succeeds if
 * quantityRemaining hasn't dropped below what we read), so concurrent
 * dispenses against the same batch can't oversell it. If a decrement loses
 * the race, it re-reads that batch and retries against the current value.
 *
 * Throws if total available stock is insufficient — checked up front so we
 * never partially deduct and then fail partway through a request.
 *
 * Returns an array of { batchId, quantityTaken } describing what was drawn
 * from where, so the caller can create one StockTransaction per batch touched.
 */
async function deductStockFEFO(facilityId, inventoryItemId, quantity) {
  if (quantity <= 0) throw new Error('quantity must be positive');

  const available = await getStockLevel(facilityId, inventoryItemId);
  if (available < quantity) {
    const err = new Error(`Insufficient stock: requested ${quantity}, available ${available}`);
    err.status = 409;
    throw err;
  }

  let remainingToDeduct = quantity;
  const draws = [];
  const MAX_ATTEMPTS_PER_BATCH = 5;

  while (remainingToDeduct > 0) {
    const candidateBatches = await StockBatch.find({
      facilityId,
      inventoryItemId,
      status: 'active',
      expiryDate: { $gt: new Date() },
      quantityRemaining: { $gt: 0 },
    })
      .sort({ expiryDate: 1 })
      .limit(10);

    if (candidateBatches.length === 0) {
      // Should be unreachable given the upfront availability check, unless
      // a concurrent process drained stock between the check and now.
      const err = new Error('Stock became unavailable during deduction — please retry');
      err.status = 409;
      throw err;
    }

    let progressedThisRound = false;

    for (const batch of candidateBatches) {
      if (remainingToDeduct <= 0) break;

      const takeFromThisBatch = Math.min(batch.quantityRemaining, remainingToDeduct);
      let attempt = 0;
      let updated = null;

      while (attempt < MAX_ATTEMPTS_PER_BATCH && !updated) {
        const freshBatch = await StockBatch.findById(batch._id);
        if (!freshBatch || freshBatch.quantityRemaining <= 0) break;

        const take = Math.min(freshBatch.quantityRemaining, remainingToDeduct);

        updated = await StockBatch.findOneAndUpdate(
          { _id: batch._id, quantityRemaining: freshBatch.quantityRemaining },
          {
            $inc: { quantityRemaining: -take },
            $set: {
              status: freshBatch.quantityRemaining - take <= 0 ? 'depleted' : 'active',
            },
          },
          { new: true }
        );

        if (updated) {
          draws.push({ batchId: batch._id, quantityTaken: take });
          remainingToDeduct -= take;
          progressedThisRound = true;
        }
        attempt += 1;
      }
    }

    if (!progressedThisRound) {
      const err = new Error('Could not complete stock deduction due to concurrent updates — please retry');
      err.status = 409;
      throw err;
    }
  }

  return draws;
}

/**
 * Records a receipt: creates a new batch and its corresponding transaction.
 */
async function receiveStock({
  facilityId,
  inventoryItemId,
  batchNumber,
  expiryDate,
  quantity,
  supplier,
  purchaseOrderRef,
  unitCost,
  receivedBy,
}) {
  const batch = await StockBatch.create({
    facilityId,
    inventoryItemId,
    batchNumber,
    expiryDate,
    quantityReceived: quantity,
    quantityRemaining: quantity,
    supplier,
    purchaseOrderRef,
    unitCost,
    receivedBy,
  });

  const transaction = await StockTransaction.create({
    type: 'receipt',
    facilityId,
    inventoryItemId,
    batchId: batch._id,
    quantity,
    performedBy: receivedBy,
  });

  return { batch, transaction };
}

/**
 * Dispenses stock (e.g. for a filled prescription), deducting FEFO and
 * recording one transaction per batch drawn from.
 */
async function dispenseStock({ facilityId, inventoryItemId, quantity, performedBy, patientId, medicalHistoryId }) {
  const draws = await deductStockFEFO(facilityId, inventoryItemId, quantity);

  const transactions = await Promise.all(
    draws.map((draw) =>
      StockTransaction.create({
        type: 'dispense',
        facilityId,
        inventoryItemId,
        batchId: draw.batchId,
        quantity: draw.quantityTaken,
        dispensedForPatientId: patientId,
        dispensedForMedicalHistoryId: medicalHistoryId,
        performedBy,
      })
    )
  );

  return transactions;
}

/**
 * Records wastage (damaged/expired/contaminated stock removed from a specific batch).
 */
async function recordWastage({ facilityId, inventoryItemId, batchId, quantity, reason, notes, performedBy }) {
  const batch = await StockBatch.findOne({ _id: batchId, facilityId, inventoryItemId });
  if (!batch) throw Object.assign(new Error('Batch not found'), { status: 404 });
  if (batch.quantityRemaining < quantity) {
    throw Object.assign(new Error('Wastage quantity exceeds remaining batch quantity'), { status: 409 });
  }

  const updated = await StockBatch.findOneAndUpdate(
    { _id: batchId, quantityRemaining: batch.quantityRemaining },
    {
      $inc: { quantityRemaining: -quantity },
      $set: { status: batch.quantityRemaining - quantity <= 0 ? 'depleted' : 'active' },
    },
    { new: true }
  );
  if (!updated) {
    throw Object.assign(new Error('Concurrent update to batch — please retry'), { status: 409 });
  }

  const transaction = await StockTransaction.create({
    type: 'wastage',
    facilityId,
    inventoryItemId,
    batchId,
    quantity,
    wastageReason: reason,
    wastageNotes: notes,
    performedBy,
  });

  return transaction;
}

/**
 * Maintenance sweep: marks batches whose expiryDate has passed as 'expired'
 * so they stop counting toward stock levels. Intended to run on a schedule
 * (cron/job) — not wired to one here since that's part of the infra layer,
 * not application code.
 */
async function sweepExpiredBatches() {
  const result = await StockBatch.updateMany(
    { status: 'active', expiryDate: { $lte: new Date() } },
    { $set: { status: 'expired' } }
  );
  return result.modifiedCount;
}

/**
 * PREDICTIVE STOCKOUT FORECASTING
 * -------------------------------------------------------------------------
 * Simple trend-based projection: average daily consumption (dispense +
 * wastage + expiry write-off) over the last `windowDays`, applied against
 * current on-hand stock, to answer "at this rate, how many days left?".
 * This is intentionally a flat historical average, not a seasonally-aware
 * or demand-driven model — a first pass, in the same spirit as the flat
 * anomaly-detection threshold in routes/moh.js. A facility with a real
 * seasonal pattern (e.g. malaria drugs spiking in rainy season) will get a
 * misleading number from a flat 30-day average; worth flagging to whoever
 * owns this next, not solving here.
 *
 * `daysRemaining` is null (not Infinity) when there's been no recent
 * consumption to project from — "no usage data" and "infinite runway" mean
 * very different things to someone deciding whether to worry, so they must
 * not collapse into the same number.
 *
 * Pass facilityId and/or inventoryItemId to scope the projection; omit
 * either to get every facility and/or every item.
 */
async function forecastStockouts({ facilityId, inventoryItemId, windowDays = 30 } = {}) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const consumptionMatch = {
    type: { $in: ['dispense', 'wastage', 'expiry_writeoff'] },
    performedAt: { $gte: since },
  };
  if (facilityId) consumptionMatch.facilityId = new mongoose.Types.ObjectId(facilityId);
  if (inventoryItemId) consumptionMatch.inventoryItemId = new mongoose.Types.ObjectId(inventoryItemId);

  const consumption = await StockTransaction.aggregate([
    { $match: consumptionMatch },
    {
      $group: {
        _id: { facilityId: '$facilityId', inventoryItemId: '$inventoryItemId' },
        totalConsumed: { $sum: '$quantity' },
      },
    },
  ]);
  const consumptionByKey = new Map(
    consumption.map((c) => [`${c._id.facilityId}:${c._id.inventoryItemId}`, c.totalConsumed])
  );

  const stockMatch = { status: 'active', expiryDate: { $gt: new Date() } };
  if (facilityId) stockMatch.facilityId = new mongoose.Types.ObjectId(facilityId);
  if (inventoryItemId) stockMatch.inventoryItemId = new mongoose.Types.ObjectId(inventoryItemId);

  const stockLevels = await StockBatch.aggregate([
    { $match: stockMatch },
    {
      $group: {
        _id: { facilityId: '$facilityId', inventoryItemId: '$inventoryItemId' },
        totalQuantity: { $sum: '$quantityRemaining' },
      },
    },
    { $lookup: { from: 'facilities', localField: '_id.facilityId', foreignField: '_id', as: 'facility' } },
    { $unwind: '$facility' },
    { $lookup: { from: 'inventoryitems', localField: '_id.inventoryItemId', foreignField: '_id', as: 'item' } },
    { $unwind: '$item' },
  ]);

  const forecasts = stockLevels.map((row) => {
    const key = `${row._id.facilityId}:${row._id.inventoryItemId}`;
    const totalConsumed = consumptionByKey.get(key) || 0;
    const avgDailyConsumption = totalConsumed / windowDays;
    const daysRemaining = avgDailyConsumption > 0 ? row.totalQuantity / avgDailyConsumption : null;
    const projectedStockoutDate =
      daysRemaining !== null ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000) : null;

    let riskLevel = 'unknown'; // no recent consumption recorded to project from
    if (daysRemaining !== null) {
      if (daysRemaining <= 7) riskLevel = 'critical';
      else if (daysRemaining <= 21) riskLevel = 'warning';
      else riskLevel = 'ok';
    }

    return {
      facilityId: row._id.facilityId,
      facilityName: row.facility.name,
      district: row.facility.district,
      inventoryItemId: row._id.inventoryItemId,
      itemName: row.item.name,
      unit: row.item.unit,
      currentStock: row.totalQuantity,
      avgDailyConsumption: Math.round(avgDailyConsumption * 100) / 100,
      daysRemaining: daysRemaining !== null ? Math.round(daysRemaining * 10) / 10 : null,
      projectedStockoutDate,
      riskLevel,
      windowDays,
    };
  });

  // Most urgent first; unknowns (no consumption data) sort last, not first —
  // an item nobody's dispensing is a data question, not an urgent one.
  forecasts.sort((a, b) => {
    if (a.daysRemaining === null) return 1;
    if (b.daysRemaining === null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });

  return forecasts;
}

module.exports = {
  getStockLevel,
  deductStockFEFO,
  receiveStock,
  dispenseStock,
  recordWastage,
  sweepExpiredBatches,
  forecastStockouts,
  DeliverySchedule,
  Alert,
};
