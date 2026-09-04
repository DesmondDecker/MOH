const express = require('express');
const router = express.Router();

const BloodUnit = require('../models/BloodUnit');
const auditService = require('../services/auditService');
const { generateUnitNumber, computeExpiryDate, findCompatibleUnits } = require('../services/bloodBankService');
const { compatibleDonorTypes, ALL_BLOOD_TYPES, BLOOD_COMPONENTS } = require('../constants/bloodCompatibility');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  intakeUnitSchema,
  screeningSchema,
  reserveSchema,
  transfuseSchema,
  discardSchema,
  facilityIdParamSchema,
  idParamSchema,
  compatibilityQuerySchema,
  inventoryQuerySchema,
  expiringQuerySchema,
} = require('../validation/bloodBankSchemas');

const BLOOD_BANK_ROLES = ['doctor', 'nurse', 'pharmacist', 'facility_admin'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// GET /api/blood-bank/reference — static reference data for the frontend
// (blood types, components, and their shelf lives) so it doesn't have to
// hardcode a second copy of this list.
// ---------------------------------------------------------------------------
router.get('/reference', (req, res) => {
  res.json({ bloodTypes: ALL_BLOOD_TYPES, components: BLOOD_COMPONENTS });
});

// ---------------------------------------------------------------------------
// POST /api/blood-bank/facility/:facilityId/units — register a new donated
// unit. Starts in pending_screening — NOT usable/reservable until a
// screening result is recorded (see the /screening route below).
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/units',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: facilityIdParamSchema, body: intakeUnitSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { bloodType, component, volumeMl, donorIdNumber, donorFullName, donorPhone, collectionDate } = req.body;

      const unitNumber = await generateUnitNumber();
      const expiryDate = computeExpiryDate(collectionDate, component);

      const unit = await BloodUnit.create({
        facilityId: req.params.facilityId,
        unitNumber,
        bloodType,
        component,
        volumeMl,
        donorIdNumber,
        donorFullName,
        donorPhone,
        collectionDate,
        expiryDate,
        status: 'pending_screening',
        registeredBy: req.user.id,
      });

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.params.facilityId,
        action: 'blood_unit_registered',
        targetType: 'BloodUnit',
        targetId: unit._id,
        after: { unitNumber, bloodType, component, expiryDate },
        ...clientMeta(req),
      });

      res.status(201).json(unit);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/blood-bank/units/:id/screening — records the infectious-disease
// screening result. A unit only becomes 'available' once cleared; a
// reactive result moves straight to discarded, never back to available.
// ---------------------------------------------------------------------------
router.post(
  '/units/:id/screening',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: idParamSchema, body: screeningSchema }),
  async (req, res, next) => {
    try {
      const { result, screenedFor, notes } = req.body;

      const unit = await BloodUnit.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Blood unit not found' });
      if (unit.status !== 'pending_screening') {
        return res.status(409).json({ error: `Cannot screen a unit with status "${unit.status}"` });
      }

      unit.screening.status = result;
      unit.screening.screenedFor = screenedFor;
      unit.screening.screenedBy = req.user.id;
      unit.screening.screenedAt = new Date();
      unit.screening.notes = notes;

      if (result === 'cleared') {
        unit.status = 'available';
      } else {
        unit.status = 'discarded';
        unit.discard = {
          reason: 'reactive_screening',
          notes: 'Automatically discarded — reactive infectious disease screening result.',
          discardedBy: req.user.id,
          discardedAt: new Date(),
        };
      }
      await unit.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: unit.facilityId,
        action: result === 'cleared' ? 'blood_unit_cleared' : 'blood_unit_reactive_discarded',
        targetType: 'BloodUnit',
        targetId: unit._id,
        after: { screeningResult: result },
        ...clientMeta(req),
      });

      res.json(unit);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/blood-bank/facility/:facilityId/inventory — current inventory,
// optionally filtered by blood type / component / status.
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/inventory',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: facilityIdParamSchema, query: inventoryQuerySchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { bloodType, component, status } = req.query;
      const filter = { facilityId: req.params.facilityId };
      if (bloodType) filter.bloodType = bloodType;
      if (component) filter.component = component;
      if (status) filter.status = status;

      const units = await BloodUnit.find(filter).sort({ expiryDate: 1 });

      // Summary counts by type+component, for a dashboard-style rollup —
      // computed here rather than making the frontend do it, since "how
      // many O- packed cells do we have" is the question staff actually
      // ask, not "list every individual unit."
      const summary = {};
      for (const unit of units) {
        if (unit.status !== 'available') continue;
        const key = `${unit.bloodType}_${unit.component}`;
        summary[key] = (summary[key] || 0) + 1;
      }

      res.json({ units, summary });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/blood-bank/facility/:facilityId/expiring — units expiring
// within the given window (default 7 days — platelets expire in 5, so a
// week-out warning is the earliest that's actually actionable for the
// shortest-lived component; a 30/90-day window meant for drug stock would
// be meaningless here).
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/expiring',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: facilityIdParamSchema, query: expiringQuerySchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const days = req.query.days || 7;
      const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      const units = await BloodUnit.find({
        facilityId: req.params.facilityId,
        status: 'available',
        expiryDate: { $lte: cutoff, $gt: new Date() },
      }).sort({ expiryDate: 1 });

      res.json(units);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/blood-bank/facility/:facilityId/compatible — finds available,
// cleared, unexpired units compatible with a recipient type + component.
// This is inventory search BEFORE the real lab crossmatch — see the
// BloodUnit model's top-level comment on why this never substitutes for
// that step.
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/compatible',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: facilityIdParamSchema, query: compatibilityQuerySchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { recipientType, component } = req.query;
      const units = await findCompatibleUnits(req.params.facilityId, recipientType, component);
      res.json({
        recipientType,
        component,
        compatibleDonorTypes: compatibleDonorTypes(recipientType, component),
        units,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/blood-bank/units/:id/reserve — holds a unit for a specific
// patient pending transfusion (e.g. once cross-matched at the lab).
// ---------------------------------------------------------------------------
router.post(
  '/units/:id/reserve',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: idParamSchema, body: reserveSchema }),
  async (req, res, next) => {
    try {
      const unit = await BloodUnit.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Blood unit not found' });
      if (unit.status !== 'available') {
        return res.status(409).json({ error: `Cannot reserve a unit with status "${unit.status}"` });
      }

      unit.status = 'reserved';
      unit.reservedForPatientId = req.body.patientId;
      unit.reservedAt = new Date();
      unit.reservedBy = req.user.id;
      await unit.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: unit.facilityId,
        action: 'blood_unit_reserved',
        targetType: 'BloodUnit',
        targetId: unit._id,
        after: { reservedForPatientId: req.body.patientId },
        ...clientMeta(req),
      });

      res.json(unit);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/blood-bank/units/:id/transfuse — records that a reserved unit
// was actually transfused. Requires explicit confirmation that a real
// laboratory crossmatch was completed (see validation/bloodBankSchemas.js)
// — this system tracks that attestation, it does not perform or replace
// the crossmatch itself.
// ---------------------------------------------------------------------------
router.post(
  '/units/:id/transfuse',
  requireRole('doctor', 'nurse'),
  validate({ params: idParamSchema, body: transfuseSchema }),
  async (req, res, next) => {
    try {
      const { patientId, encounterId, crossmatchConfirmed, adverseReaction, reactionNotes } = req.body;

      const unit = await BloodUnit.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Blood unit not found' });
      if (unit.status !== 'reserved') {
        return res.status(409).json({ error: `Cannot transfuse a unit with status "${unit.status}" — it must be reserved first` });
      }
      if (unit.reservedForPatientId?.toString() !== patientId) {
        return res.status(409).json({ error: 'This unit is reserved for a different patient' });
      }

      unit.status = 'transfused';
      unit.transfusion = {
        patientId,
        encounterId,
        transfusedAt: new Date(),
        transfusedBy: req.user.id,
        crossmatchConfirmed,
        adverseReaction: !!adverseReaction,
        reactionNotes,
      };
      await unit.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: unit.facilityId,
        action: adverseReaction ? 'blood_unit_transfused_adverse_reaction' : 'blood_unit_transfused',
        targetType: 'BloodUnit',
        targetId: unit._id,
        after: { patientId, encounterId, adverseReaction: !!adverseReaction },
        ...clientMeta(req),
      });

      // An adverse transfusion reaction is a patient-safety event that
      // needs to be visible immediately, not discovered later in a report.
      // Matches this codebase's existing real-time pattern exactly
      // (services/socketService.js): emit a lightweight refresh SIGNAL
      // only, never the underlying record — the facility_admin dashboard
      // listening for 'activity' events refetches the real detail over
      // REST rather than trusting PHI-adjacent data pushed over a socket.
      if (adverseReaction) {
        require('../services/socketService').emitActivity({
          facilityId: unit.facilityId.toString(),
          action: 'blood_unit_transfused_adverse_reaction',
          targetType: 'BloodUnit',
          actorRole: req.user.role,
          occurredAt: new Date(),
        });
      }

      res.json(unit);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/blood-bank/units/:id/discard — discards a unit (expired,
// damaged, contaminated, or other reason not already covered by the
// automatic reactive-screening discard above).
// ---------------------------------------------------------------------------
router.post(
  '/units/:id/discard',
  requireRole(...BLOOD_BANK_ROLES),
  validate({ params: idParamSchema, body: discardSchema }),
  async (req, res, next) => {
    try {
      const { reason, notes } = req.body;

      const unit = await BloodUnit.findById(req.params.id);
      if (!unit) return res.status(404).json({ error: 'Blood unit not found' });
      if (['transfused', 'discarded'].includes(unit.status)) {
        return res.status(409).json({ error: `Cannot discard a unit with status "${unit.status}"` });
      }

      unit.status = 'discarded';
      unit.discard = { reason, notes, discardedBy: req.user.id, discardedAt: new Date() };
      await unit.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: unit.facilityId,
        action: 'blood_unit_discarded',
        targetType: 'BloodUnit',
        targetId: unit._id,
        after: { reason },
        ...clientMeta(req),
      });

      res.json(unit);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
