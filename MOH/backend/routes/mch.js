const express = require('express');
const router = express.Router();

const AntenatalVisit = require('../models/AntenatalVisit');
const GrowthMeasurement = require('../models/GrowthMeasurement');
const ImmunizationRecord = require('../models/ImmunizationRecord');
const Patient = require('../models/Patient');
const auditService = require('../services/auditService');
const { classifyMuac, ageInDaysAt } = require('../services/growthService');
const { computeImmunizationStatus } = require('../constants/immunizationSchedule');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  antenatalVisitSchema,
  growthMeasurementSchema,
  immunizationRecordSchema,
  patientIdParamSchema,
} = require('../validation/mchSchemas');

const CLINICAL_ROLES = ['doctor', 'nurse'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

// ===========================================================================
// ANTENATAL CARE
// ===========================================================================

router.post('/antenatal-visits', requireRole(...CLINICAL_ROLES), validate({ body: antenatalVisitSchema }), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.body.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    if (patient.sex !== 'female') {
      return res.status(400).json({ error: 'Antenatal visits can only be recorded for female patients' });
    }

    const visit = await AntenatalVisit.create({
      ...req.body,
      facilityId: req.user.facilityId,
      providerId: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'antenatal_visit_recorded',
      targetType: 'AntenatalVisit',
      targetId: visit._id,
      after: { visitNumber: visit.visitNumber, gestationalAgeWeeks: visit.gestationalAgeWeeks, dangerSigns: visit.dangerSigns },
      ...clientMeta(req),
    });

    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

router.get('/antenatal-visits/patient/:patientId', requireRole(...CLINICAL_ROLES), validate({ params: patientIdParamSchema }), async (req, res, next) => {
  try {
    const visits = await AntenatalVisit.find({ patientId: req.params.patientId })
      .populate('providerId', 'fullName role')
      .sort({ visitNumber: 1 });
    res.json(visits);
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// GROWTH MONITORING
// ===========================================================================

router.post('/growth-measurements', requireRole(...CLINICAL_ROLES), validate({ body: growthMeasurementSchema }), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.body.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    if (!patient.dateOfBirth) {
      return res.status(400).json({ error: 'Patient has no recorded date of birth — growth tracking requires a known age' });
    }

    const measurementDate = req.body.measurementDate || new Date();
    const ageInDaysAtMeasurement = ageInDaysAt(patient.dateOfBirth, measurementDate);

    const measurement = await GrowthMeasurement.create({
      ...req.body,
      measurementDate,
      ageInDaysAtMeasurement,
      facilityId: req.user.facilityId,
      measuredBy: req.user.id,
    });

    const muacClassification = classifyMuac(req.body.muacCm, ageInDaysAtMeasurement, req.body.oedemaPresent);

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action:
        muacClassification === 'severe_acute_malnutrition' || muacClassification === 'moderate_acute_malnutrition'
          ? 'growth_measurement_malnutrition_flagged'
          : 'growth_measurement_recorded',
      targetType: 'GrowthMeasurement',
      targetId: measurement._id,
      after: { weightKg: req.body.weightKg, muacCm: req.body.muacCm, muacClassification },
      ...clientMeta(req),
    });

    res.status(201).json({ ...measurement.toObject(), muacClassification });
  } catch (err) {
    next(err);
  }
});

router.get('/growth-measurements/patient/:patientId', requireRole(...CLINICAL_ROLES), validate({ params: patientIdParamSchema }), async (req, res, next) => {
  try {
    const measurements = await GrowthMeasurement.find({ patientId: req.params.patientId }).sort({ measurementDate: 1 });

    // Annotate each with its MUAC classification at time of measurement —
    // computed on read rather than stored, so a later change to the WHO
    // cutoffs (see services/growthService.js) reclassifies historical
    // measurements consistently rather than leaving old records stamped
    // with a now-outdated band.
    const annotated = measurements.map((m) => ({
      ...m.toObject(),
      muacClassification: classifyMuac(m.muacCm, m.ageInDaysAtMeasurement, m.oedemaPresent),
    }));

    res.json(annotated);
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// IMMUNIZATION
// ===========================================================================

router.post('/immunizations', requireRole(...CLINICAL_ROLES), validate({ body: immunizationRecordSchema }), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.body.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const existing = await ImmunizationRecord.findOne({
      patientId: req.body.patientId,
      vaccine: req.body.vaccine,
      dose: req.body.dose,
    });
    if (existing) {
      return res.status(409).json({ error: `${req.body.vaccine} dose ${req.body.dose} is already recorded for this patient` });
    }

    const record = await ImmunizationRecord.create({
      ...req.body,
      facilityId: req.user.facilityId,
      administeredBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'immunization_recorded',
      targetType: 'ImmunizationRecord',
      targetId: record._id,
      after: { vaccine: record.vaccine, dose: record.dose, adverseEvent: record.adverseEvent },
      ...clientMeta(req),
    });

    res.status(201).json(record);
  } catch (err) {
    next(err);
  }
});

// GET /api/mch/immunizations/patient/:patientId/schedule — the FULL
// annotated schedule (completed/due/overdue/not_yet_due) for this
// patient, not just the raw list of doses given. This is what a CHW or
// clinic worklist actually needs — "what's still owed", not just "what
// happened."
router.get(
  '/immunizations/patient/:patientId/schedule',
  requireRole(...CLINICAL_ROLES),
  validate({ params: patientIdParamSchema }),
  async (req, res, next) => {
    try {
      const patient = await Patient.findById(req.params.patientId);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });
      if (!patient.dateOfBirth) {
        return res.status(400).json({ error: 'Patient has no recorded date of birth — immunization scheduling requires a known age' });
      }

      const received = await ImmunizationRecord.find({ patientId: req.params.patientId }).select('vaccine dose administeredDate');
      const ageInDays = ageInDaysAt(patient.dateOfBirth);
      const schedule = computeImmunizationStatus(ageInDays, received);

      res.json({ ageInDays, schedule, received });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
