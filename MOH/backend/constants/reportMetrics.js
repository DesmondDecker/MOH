const Patient = require('../models/Patient');
const Encounter = require('../models/Encounter');
const StockBatch = require('../models/StockBatch');
const StockTransaction = require('../models/StockTransaction');
const AntenatalVisit = require('../models/AntenatalVisit');
const GrowthMeasurement = require('../models/GrowthMeasurement');
const ImmunizationRecord = require('../models/ImmunizationRecord');
const BloodUnit = require('../models/BloodUnit');
const ColdChainReading = require('../models/ColdChainReading');
const { ANALYTICS_READ_PREFERENCE } = require('../services/dbReadPreference');

/**
 * REPORT METRIC REGISTRY
 * -----------------------------------------------------------------------
 * Each metric is a self-contained { id, label, category, unit, compute }
 * entry. `compute(facilityIds, from, to)` returns a plain number — the
 * report route (routes/reports.js) handles turning a set of computed
 * metrics into a PDF or CSV; this file only knows how to calculate each
 * number correctly for a given facility scope and date window.
 *
 * Adding a new metric is adding one entry here — the picker UI
 * (GET /api/reports/metrics) and the generation route both read this
 * registry rather than needing their own hardcoded metric list to keep in
 * sync.
 */
const METRICS = [
  {
    id: 'patients_registered',
    label: 'Patients registered',
    category: 'Patients',
    unit: 'patients',
    compute: async (facilityIds, from, to) =>
      Patient.countDocuments({ registeredAtFacility: { $in: facilityIds }, createdAt: { $gte: from, $lte: to } }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'patients_verified_identity',
    label: 'Patients with verified identity (national ID on file)',
    category: 'Patients',
    unit: 'patients',
    compute: async (facilityIds, from, to) =>
      Patient.countDocuments({
        registeredAtFacility: { $in: facilityIds },
        createdAt: { $gte: from, $lte: to },
        identityTier: 'verified',
      }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'encounters_total',
    label: 'Total encounters',
    category: 'Clinical',
    unit: 'encounters',
    compute: async (facilityIds, from, to) =>
      Encounter.countDocuments({ facilityId: { $in: facilityIds }, admittedAt: { $gte: from, $lte: to } }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'encounters_emergency_override',
    label: 'Encounters using emergency access override',
    category: 'Clinical',
    unit: 'encounters',
    compute: async (facilityIds, from, to) =>
      Encounter.countDocuments({
        facilityId: { $in: facilityIds },
        admittedAt: { $gte: from, $lte: to },
        'emergencyOverride.used': true,
      }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'notifiable_disease_cases',
    label: 'Notifiable disease diagnoses',
    category: 'Clinical',
    unit: 'cases',
    compute: async (facilityIds, from, to) => {
      const result = await Encounter.aggregate([
        { $match: { facilityId: { $in: facilityIds }, admittedAt: { $gte: from, $lte: to }, 'diagnosis.isNotifiableDisease': true } },
        { $unwind: '$diagnosis' },
        { $match: { 'diagnosis.isNotifiableDisease': true } },
        { $count: 'total' },
      ]).read(ANALYTICS_READ_PREFERENCE);
      return result[0]?.total || 0;
    },
  },
  {
    id: 'stock_items_below_threshold',
    label: 'Inventory items currently below reorder threshold',
    category: 'Inventory',
    unit: 'items',
    compute: async (facilityIds) => {
      const InventoryItem = require('../models/InventoryItem');
      const items = await InventoryItem.find({ status: 'active' }).read(ANALYTICS_READ_PREFERENCE);
      let belowCount = 0;
      for (const item of items) {
        const total = await StockBatch.aggregate([
          { $match: { inventoryItemId: item._id, facilityId: { $in: facilityIds }, quantityRemaining: { $gt: 0 } } },
          { $group: { _id: null, total: { $sum: '$quantityRemaining' } } },
        ]).read(ANALYTICS_READ_PREFERENCE);
        const qty = total[0]?.total || 0;
        if (qty < (item.defaultReorderThreshold || 0)) belowCount++;
      }
      return belowCount;
    },
  },
  {
    id: 'stock_wastage_units',
    label: 'Stock units wasted/expired',
    category: 'Inventory',
    unit: 'units',
    compute: async (facilityIds, from, to) => {
      const result = await StockTransaction.aggregate([
        {
          $match: {
            facilityId: { $in: facilityIds },
            createdAt: { $gte: from, $lte: to },
            type: { $in: ['wastage', 'expiry_writeoff'] },
          },
        },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]).read(ANALYTICS_READ_PREFERENCE);
      return result[0]?.total || 0;
    },
  },
  {
    id: 'antenatal_visits',
    label: 'Antenatal visits recorded',
    category: 'Maternal & Child Health',
    unit: 'visits',
    compute: async (facilityIds, from, to) =>
      AntenatalVisit.countDocuments({ facilityId: { $in: facilityIds }, createdAt: { $gte: from, $lte: to } }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'antenatal_danger_signs_flagged',
    label: 'Antenatal visits with danger signs flagged',
    category: 'Maternal & Child Health',
    unit: 'visits',
    compute: async (facilityIds, from, to) =>
      AntenatalVisit.countDocuments({
        facilityId: { $in: facilityIds },
        createdAt: { $gte: from, $lte: to },
        dangerSigns: { $exists: true, $not: { $size: 0 } },
      }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'growth_malnutrition_flagged',
    label: 'Growth measurements with MUAC < 12.5cm (malnutrition screen)',
    category: 'Maternal & Child Health',
    unit: 'measurements',
    compute: async (facilityIds, from, to) =>
      GrowthMeasurement.countDocuments({
        facilityId: { $in: facilityIds },
        measurementDate: { $gte: from, $lte: to },
        $or: [{ muacCm: { $lt: 12.5 } }, { oedemaPresent: true }],
      }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'immunization_doses_administered',
    label: 'Immunization doses administered',
    category: 'Maternal & Child Health',
    unit: 'doses',
    compute: async (facilityIds, from, to) =>
      ImmunizationRecord.countDocuments({ facilityId: { $in: facilityIds }, administeredDate: { $gte: from, $lte: to } }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'blood_units_collected',
    label: 'Blood units collected',
    category: 'Blood Bank',
    unit: 'units',
    compute: async (facilityIds, from, to) =>
      BloodUnit.countDocuments({ facilityId: { $in: facilityIds }, collectionDate: { $gte: from, $lte: to } }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'blood_units_transfused',
    label: 'Blood units transfused',
    category: 'Blood Bank',
    unit: 'units',
    compute: async (facilityIds, from, to) =>
      BloodUnit.countDocuments({
        facilityId: { $in: facilityIds },
        status: 'transfused',
        'transfusion.transfusedAt': { $gte: from, $lte: to },
      }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'blood_units_discarded',
    label: 'Blood units discarded',
    category: 'Blood Bank',
    unit: 'units',
    compute: async (facilityIds, from, to) =>
      BloodUnit.countDocuments({
        facilityId: { $in: facilityIds },
        status: 'discarded',
        'discard.discardedAt': { $gte: from, $lte: to },
      }).read(ANALYTICS_READ_PREFERENCE),
  },
  {
    id: 'cold_chain_breaches',
    label: 'Cold-chain temperature breaches',
    category: 'Cold Chain',
    unit: 'breaches',
    compute: async (facilityIds, from, to) =>
      ColdChainReading.countDocuments({ facilityId: { $in: facilityIds }, breached: true, recordedAt: { $gte: from, $lte: to } }).read(ANALYTICS_READ_PREFERENCE),
  },
];

function getMetric(id) {
  return METRICS.find((m) => m.id === id);
}

module.exports = { METRICS, getMetric };
