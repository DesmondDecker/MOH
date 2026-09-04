const mongoose = require('mongoose');
const { Schema } = mongoose;
const BloodUnit = require('../models/BloodUnit');
const { SHELF_LIFE_DAYS_BY_COMPONENT, compatibleDonorTypes } = require('../constants/bloodCompatibility');

const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/** Generates a unique, sequential blood unit number scoped by year: SL-BB-2026-000123 */
async function generateUnitNumber() {
  const year = new Date().getFullYear();
  const counterId = `blood_unit_${year}`;
  const counter = await Counter.findOneAndUpdate({ _id: counterId }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `SL-BB-${year}-${String(counter.seq).padStart(6, '0')}`;
}

/**
 * Computes expiry from collection date + component-specific shelf life.
 * This is the core reason blood can't share the general StockBatch
 * model's expiry handling: a drug batch's expiry is printed on the
 * package by the manufacturer, but a blood unit's expiry has to be
 * CALCULATED at intake from what component it was prepared as — platelets
 * expire in 5 days, plasma lasts a year, from the same donation.
 */
function computeExpiryDate(collectionDate, component) {
  const shelfLifeDays = SHELF_LIFE_DAYS_BY_COMPONENT[component];
  if (!shelfLifeDays) throw new Error(`Unknown blood component: ${component}`);
  return new Date(new Date(collectionDate).getTime() + shelfLifeDays * 24 * 60 * 60 * 1000);
}

/**
 * Finds available (screened-cleared, unreserved, unexpired) units at a
 * facility compatible with the given recipient blood type and component —
 * this is the inventory-search half of a transfusion request, run BEFORE
 * the real lab crossmatch (see BloodUnit model comment: this never
 * substitutes for that step). Sorted oldest-expiry-first (FEFO — first
 * expired, first out) so older compatible stock gets used before it
 * expires, rather than always reaching for the newest unit.
 */
async function findCompatibleUnits(facilityId, recipientType, component) {
  const donorTypes = compatibleDonorTypes(recipientType, component);
  if (donorTypes.length === 0) return [];

  return BloodUnit.find({
    facilityId,
    component,
    bloodType: { $in: donorTypes },
    status: 'available',
    'screening.status': 'cleared',
    expiryDate: { $gt: new Date() },
  }).sort({ expiryDate: 1 });
}

module.exports = { generateUnitNumber, computeExpiryDate, findCompatibleUnits };
