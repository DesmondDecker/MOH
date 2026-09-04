const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Facility = require('../models/Facility');
const Patient = require('../models/Patient');
const Encounter = require('../models/Encounter');
const StockBatch = require('../models/StockBatch');
const { AuditLog } = require('../models/AuditLog');
const SyncQueue = require('../models/SyncQueue');
const inventoryService = require('../services/inventoryService');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { ANALYTICS_READ_PREFERENCE } = require('../services/dbReadPreference');

/**
 * SCOPE NOTE — see the README for the full explanation. These endpoints
 * query the shared clinical/inventory collections directly, on the
 * assumption this system runs as one shared MongoDB cluster with
 * facility-scoped access control (the realistic deployment for a
 * national-scale system in Sierra Leone), NOT as fully separate databases
 * per facility. If that assumption changes, these endpoints need to be
 * rebuilt on top of SyncEvent instead, since a central node with a
 * genuinely separate DB per facility would only have audit-derived events
 * to work with, not live queryable Patient/StockBatch documents.
 */

router.use(authenticate, blockUntilPasswordChanged, requireRole('moh_super_admin'));

// ---------------------------------------------------------------------------
// GET /api/moh/facilities/summary — one row per facility: patient count,
// active encounters, stock alerts, sync health. Backs the Command Center's
// facility list (and, later, a map once facilities have lat/lng populated).
// ---------------------------------------------------------------------------
router.get('/facilities/summary', async (req, res, next) => {
  try {
    const facilities = await Facility.find().select('name code province district chiefdom type location status').read(ANALYTICS_READ_PREFERENCE);

    const summaries = await Promise.all(
      facilities.map(async (facility) => {
        const [patientCount, activeEncounters, stockAgg, syncPending, syncFailed] = await Promise.all([
          Patient.countDocuments({ registeredAtFacility: facility._id, status: { $ne: 'merged' } }).read(ANALYTICS_READ_PREFERENCE),
          Encounter.countDocuments({ facilityId: facility._id, status: 'open' }).read(ANALYTICS_READ_PREFERENCE),
          StockBatch.aggregate([
            { $match: { facilityId: facility._id, status: 'active', expiryDate: { $gt: new Date() } } },
            {
              $group: {
                _id: '$inventoryItemId',
                totalQuantity: { $sum: '$quantityRemaining' },
              },
            },
            {
              $lookup: { from: 'inventoryitems', localField: '_id', foreignField: '_id', as: 'item' },
            },
            { $unwind: '$item' },
            {
              $match: { $expr: { $lte: ['$totalQuantity', '$item.defaultReorderThreshold'] } },
            },
            { $count: 'belowThresholdCount' },
          ]).read(ANALYTICS_READ_PREFERENCE),
          SyncQueue.countDocuments({ facilityId: facility._id, status: 'pending' }).read(ANALYTICS_READ_PREFERENCE),
          SyncQueue.countDocuments({ facilityId: facility._id, status: 'failed' }).read(ANALYTICS_READ_PREFERENCE),
        ]);

        return {
          facilityId: facility._id,
          name: facility.name,
          code: facility.code,
          province: facility.province,
          district: facility.district,
          chiefdom: facility.chiefdom,
          type: facility.type,
          location: facility.location,
          status: facility.status,
          patientCount,
          activeEncounters,
          stockAlertCount: stockAgg[0]?.belowThresholdCount || 0,
          syncPending,
          syncFailed,
        };
      })
    );

    res.json(summaries);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/moh/surveillance/notifiable-diseases?days=30 — notifiable
// diagnoses grouped by district and description, most recent window.
// ---------------------------------------------------------------------------
router.get('/surveillance/notifiable-diseases', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Groups by icd10Code, not diagnosis.description — the description is
    // encrypted PHI (see models/Encounter.js) and can't be aggregated over
    // in Mongo. icd10Code is a coded, non-identifying value that survives
    // encryption untouched, so surveillance counting still works at full
    // fidelity as long as notifiable diagnoses are coded at entry. A
    // diagnosis flagged notifiable without a code falls into "UNCODED" so
    // it's still visible in the count rather than silently dropped.
    const results = await Encounter.aggregate([
      { $match: { admittedAt: { $gte: since }, 'diagnosis.isNotifiableDisease': true } },
      { $unwind: '$diagnosis' },
      { $match: { 'diagnosis.isNotifiableDisease': true } },
      {
        $lookup: { from: 'facilities', localField: 'facilityId', foreignField: '_id', as: 'facility' },
      },
      { $unwind: '$facility' },
      {
        $group: {
          _id: { district: '$facility.district', icd10Code: { $ifNull: ['$diagnosis.icd10Code', 'UNCODED'] } },
          count: { $sum: 1 },
          facilities: { $addToSet: '$facility.name' },
          mostRecent: { $max: '$admittedAt' },
        },
      },
      {
        $project: {
          _id: 0,
          district: '$_id.district',
          icd10Code: '$_id.icd10Code',
          count: 1,
          facilities: 1,
          mostRecent: 1,
        },
      },
      { $sort: { count: -1 } },
    ]).read(ANALYTICS_READ_PREFERENCE);

    res.json({ windowDays: days, results });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/moh/inventory/national — stock levels for an item across every
// facility, so MoH (and eventually facility admins) can spot a facility
// that's low sitting next to one with surplus.
// ---------------------------------------------------------------------------
router.get('/inventory/national', async (req, res, next) => {
  try {
    const { inventoryItemId } = req.query;
    const match = { status: 'active', expiryDate: { $gt: new Date() } };
    if (inventoryItemId) match.inventoryItemId = new mongoose.Types.ObjectId(inventoryItemId);

    const results = await StockBatch.aggregate([
      { $match: match },
      {
        $group: {
          _id: { facilityId: '$facilityId', inventoryItemId: '$inventoryItemId' },
          totalQuantity: { $sum: '$quantityRemaining' },
        },
      },
      {
        $lookup: { from: 'facilities', localField: '_id.facilityId', foreignField: '_id', as: 'facility' },
      },
      { $unwind: '$facility' },
      {
        $lookup: { from: 'inventoryitems', localField: '_id.inventoryItemId', foreignField: '_id', as: 'item' },
      },
      { $unwind: '$item' },
      {
        $project: {
          _id: 0,
          facilityId: '$_id.facilityId',
          facilityName: '$facility.name',
          district: '$facility.district',
          inventoryItemId: '$_id.inventoryItemId',
          itemName: '$item.name',
          unit: '$item.unit',
          totalQuantity: 1,
          reorderThreshold: '$item.defaultReorderThreshold',
          belowThreshold: { $lte: ['$totalQuantity', '$item.defaultReorderThreshold'] },
        },
      },
      { $sort: { itemName: 1, totalQuantity: 1 } },
    ]).read(ANALYTICS_READ_PREFERENCE);

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/moh/audit/anomalies?hours=24 — simple, transparent anomaly
// surfacing: actors with unusually high patient-record view counts, and any
// emergency-override accesses, in the recent window. This is intentionally
// a first pass (see README) — real anomaly detection needs a baseline per
// actor, not a flat threshold.
// ---------------------------------------------------------------------------
router.get('/audit/anomalies', async (req, res, next) => {
  try {
    const hours = parseInt(req.query.hours, 10) || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const HIGH_VIEW_THRESHOLD = 30; // flat threshold — flagged as a first pass, not calibrated

    const [highViewers, emergencyOverrides] = await Promise.all([
      AuditLog.aggregate([
        { $match: { createdAt: { $gte: since }, action: 'patient_record_viewed' } },
        { $group: { _id: '$actorId', viewCount: { $sum: 1 }, facilityId: { $first: '$facilityId' } } },
        { $match: { viewCount: { $gte: HIGH_VIEW_THRESHOLD } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: '$user' },
        {
          $project: {
            _id: 0,
            actorId: '$_id',
            actorName: '$user.fullName',
            actorRole: '$user.role',
            facilityId: 1,
            viewCount: 1,
          },
        },
        { $sort: { viewCount: -1 } },
      ]).read(ANALYTICS_READ_PREFERENCE),
      AuditLog.find({
        createdAt: { $gte: since },
        action: { $in: ['patient_record_viewed_emergency_override', 'encounter_opened_emergency_override'] },
      })
        .populate('actorId', 'fullName role')
        .sort({ createdAt: -1 })
        .limit(50)
        .read(ANALYTICS_READ_PREFERENCE),
    ]);

    res.json({ windowHours: hours, highViewThreshold: HIGH_VIEW_THRESHOLD, highViewers, emergencyOverrides });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/moh/inventory/forecast?inventoryItemId=X&windowDays=30 —
// predictive stockout projection for an item across every facility, sorted
// most urgent first. See inventoryService.forecastStockouts for the method.
// ---------------------------------------------------------------------------
router.get('/inventory/forecast', async (req, res, next) => {
  try {
    const { inventoryItemId } = req.query;
    const windowDays = parseInt(req.query.windowDays, 10) || 30;

    const forecasts = await inventoryService.forecastStockouts({
      inventoryItemId: inventoryItemId || undefined,
      windowDays,
    });

    res.json(forecasts);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
