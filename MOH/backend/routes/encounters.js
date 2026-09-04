const express = require('express');
const router = express.Router();

const Encounter = require('../models/Encounter');
const Patient = require('../models/Patient');
const Facility = require('../models/Facility');
const MedicalHistory = require('../models/MedicalHistory');
const User = require('../models/User');
const auditService = require('../services/auditService');
const { streamDischargeOrReferralPdf } = require('../services/pdfService');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createEncounterSchema,
  addDiagnosisSchema,
  referralSchema,
  emergencyAccessReviewSchema,
  emergencyAccessQuerySchema,
  idParamSchema,
  facilityIdParamSchema,
  patientIdParamSchema,
} = require('../validation/encounterSchemas');

const CLINICAL_ROLES = ['doctor', 'nurse', 'pharmacist', 'facility_admin'];
const NOTIFIABLE_DISEASE_KEYWORDS = ['cholera', 'lassa', 'ebola', 'measles', 'meningitis', 'yellow fever'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

function flagsNotifiableDisease(description) {
  const lower = (description || '').toLowerCase();
  return NOTIFIABLE_DISEASE_KEYWORDS.some((kw) => lower.includes(kw));
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// POST /api/encounters — open a new encounter
// ---------------------------------------------------------------------------
router.post('/', requireRole(...CLINICAL_ROLES), validate({ body: createEncounterSchema }), async (req, res, next) => {
  try {
    const { patientId, type, chiefComplaint, vitals, emergencyOverride } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    if (!patient.isAlive()) {
      return res.status(409).json({ error: 'Cannot open an encounter for a deceased patient' });
    }

    const encounter = await Encounter.create({
      patientId,
      facilityId: req.user.facilityId,
      type,
      attendingProviderId: req.user.id,
      chiefComplaint,
      vitals: vitals ? { ...vitals, recordedAt: new Date() } : undefined,
      emergencyOverride: emergencyOverride?.used
        ? { used: true, justification: emergencyOverride.justification, authorizedBy: req.user.id }
        : undefined,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: emergencyOverride?.used ? 'encounter_opened_emergency_override' : 'encounter_opened',
      targetType: 'Encounter',
      targetId: encounter._id,
      after: { patientId, type },
      ...clientMeta(req),
    });

    res.status(201).json(encounter);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/encounters/facility/:facilityId/active — "today's queue": open
// encounters at this facility, patient info populated, oldest first.
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/active',
  requireRole(...CLINICAL_ROLES),
  validate({ params: facilityIdParamSchema }),
  requireSameFacility,
  async (req, res, next) => {
  try {
    const encounters = await Encounter.find({ facilityId: req.params.facilityId, status: 'open' })
      .populate('patientId', 'mrn fullName dateOfBirth sex allergies')
      .populate('attendingProviderId', 'fullName role')
      .sort({ admittedAt: 1 });
    res.json(encounters);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/encounters/patient/:patientId — encounter history for a patient
// ---------------------------------------------------------------------------
router.get('/patient/:patientId', requireRole(...CLINICAL_ROLES), validate({ params: patientIdParamSchema }), async (req, res, next) => {
  try {
    const encounters = await Encounter.find({ patientId: req.params.patientId }).sort({ admittedAt: -1 });
    res.json(encounters);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/encounters/:id/diagnosis — add diagnosis, auto-flags notifiable disease
// ---------------------------------------------------------------------------
router.patch(
  '/:id/diagnosis',
  requireRole('doctor'),
  validate({ params: idParamSchema, body: addDiagnosisSchema }),
  async (req, res, next) => {
  try {
    const { description, icd10Code, isPrimary } = req.body;

    const encounter = await Encounter.findById(req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
    if (encounter.status !== 'open') return res.status(409).json({ error: 'Encounter is not open' });

    const isNotifiable = flagsNotifiableDisease(description);

    encounter.diagnosis.push({ description, icd10Code, isPrimary: !!isPrimary, isNotifiableDisease: isNotifiable });
    await encounter.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: isNotifiable ? 'diagnosis_added_notifiable_disease' : 'diagnosis_added',
      targetType: 'Encounter',
      targetId: encounter._id,
      after: { description, isNotifiable },
      ...clientMeta(req),
    });

    // In production this is where a fast-path alert to MoH surveillance would
    // fire (push notification / message queue) rather than waiting for the
    // routine facility-to-MoH sync — not implemented here since it depends on
    // the sync/notification infrastructure being built next.
    if (isNotifiable) {
      console.warn(`[surveillance] Notifiable disease flagged: "${description}" at facility ${req.user.facilityId}`);
    }

    res.json(encounter);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/encounters/:id/referral — refer patient to another facility
// ---------------------------------------------------------------------------
router.patch(
  '/:id/referral',
  requireRole('doctor', 'facility_admin'),
  validate({ params: idParamSchema, body: referralSchema }),
  async (req, res, next) => {
  try {
    const { referredToFacilityId, reason, urgency } = req.body;

    const encounter = await Encounter.findById(req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

    encounter.referral = {
      referredToFacilityId,
      referredFromFacilityId: req.user.facilityId,
      reason,
      urgency: urgency || 'routine',
    };
    encounter.status = 'transferred';
    await encounter.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'patient_referred',
      targetType: 'Encounter',
      targetId: encounter._id,
      after: { referredToFacilityId, urgency: encounter.referral.urgency },
      ...clientMeta(req),
    });

    res.json(encounter);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/encounters/:id/discharge-summary.pdf — discharge summary, or a
// referral letter instead if this encounter has referral info set (a
// referral is the more specific document even for a still-open encounter).
// Read-only export: does not require the encounter to be closed, since a
// referral letter is often needed to travel WITH the patient before the
// referring facility formally closes its own encounter.
// ---------------------------------------------------------------------------
router.get('/:id/discharge-summary.pdf', requireRole(...CLINICAL_ROLES), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const encounter = await Encounter.findById(req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

    const [patient, facility, medications, generatingUser] = await Promise.all([
      Patient.findById(encounter.patientId),
      Facility.findById(encounter.facilityId),
      MedicalHistory.find({ encounterId: encounter._id, entryType: 'prescription' }).sort({ createdAt: 1 }),
      User.findById(req.user.id).select('fullName role'),
    ]);
    if (!patient || !facility) return res.status(404).json({ error: 'Related patient or facility not found' });

    const referredToFacility = encounter.referral?.referredToFacilityId
      ? await Facility.findById(encounter.referral.referredToFacilityId)
      : null;

    const isReferral = !!encounter.referral?.referredToFacilityId;
    const filenameStem = isReferral ? 'referral-letter' : 'discharge-summary';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameStem}-${patient.mrn}.pdf"`);

    streamDischargeOrReferralPdf({
      res,
      patient,
      facility,
      encounter,
      referredToFacility,
      medications,
      generatedByUser: { fullName: generatingUser?.fullName || 'Unknown', role: req.user.role },
    });

    // Bookkeeping after the response has started streaming — must never call
    // next(err) from here, since headers (and likely body bytes) are already
    // sent. Same best-effort, log-and-continue pattern as the sync-queue
    // enqueue and socket emit in auditService.record().
    try {
      encounter.dischargeSummaryGeneratedAt = new Date();
      await encounter.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.user.facilityId,
        action: isReferral ? 'referral_letter_generated' : 'discharge_summary_generated',
        targetType: 'Encounter',
        targetId: encounter._id,
        ...clientMeta(req),
      });
    } catch (bookkeepingErr) {
      console.error('[encounters] Failed to record discharge/referral PDF generation (non-fatal):', {
        encounterId: encounter._id.toString(),
        error: bookkeepingErr.message,
      });
    }
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/encounters/:id/discharge — close the encounter
// ---------------------------------------------------------------------------
router.post('/:id/discharge', requireRole('doctor'), validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const encounter = await Encounter.findById(req.params.id);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
    if (encounter.status !== 'open') return res.status(409).json({ error: 'Encounter is not open' });

    encounter.status = 'closed';
    encounter.dischargedAt = new Date();
    await encounter.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'encounter_discharged',
      targetType: 'Encounter',
      targetId: encounter._id,
      ...clientMeta(req),
    });

    res.json(encounter);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/encounters/facility/:facilityId/emergency-access — lists
// break-glass encounters for a facility (facility_admin: own facility
// only; moh_super_admin: any facility). Defaults to unreviewed only —
// pass ?reviewed=true to see the reviewed history instead.
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/emergency-access',
  requireRole('facility_admin', 'moh_super_admin'),
  validate({ params: facilityIdParamSchema, query: emergencyAccessQuerySchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const reviewed = req.query.reviewed === undefined ? false : req.query.reviewed;

      const encounters = await Encounter.find({
        facilityId: req.params.facilityId,
        'emergencyOverride.used': true,
        'emergencyOverride.reviewed': reviewed,
      })
        .populate('patientId', 'mrn fullName')
        .populate('attendingProviderId', 'fullName role')
        .populate('emergencyOverride.authorizedBy', 'fullName role')
        .populate('emergencyOverride.reviewedBy', 'fullName role')
        .sort({ admittedAt: -1 });

      res.json(encounters);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/encounters/:id/emergency-access/review — records a facility
// admin's (or MoH super admin's) after-the-fact review of a break-glass
// access. This is the accountability half of the mechanism: "self-attested
// in true emergencies" only works as a model if it's actually followed up
// on, not just logged and forgotten.
// ---------------------------------------------------------------------------
router.post(
  '/:id/emergency-access/review',
  requireRole('facility_admin', 'moh_super_admin'),
  validate({ params: idParamSchema, body: emergencyAccessReviewSchema }),
  async (req, res, next) => {
    try {
      const { outcome, notes } = req.body;

      const encounter = await Encounter.findById(req.params.id);
      if (!encounter) return res.status(404).json({ error: 'Encounter not found' });
      if (!encounter.emergencyOverride?.used) {
        return res.status(400).json({ error: 'This encounter did not use emergency access override' });
      }
      if (req.user.role === 'facility_admin' && encounter.facilityId.toString() !== req.user.facilityId) {
        return res.status(403).json({ error: 'Cannot review emergency access for another facility' });
      }

      encounter.emergencyOverride.reviewed = true;
      encounter.emergencyOverride.reviewedBy = req.user.id;
      encounter.emergencyOverride.reviewedAt = new Date();
      encounter.emergencyOverride.reviewOutcome = outcome;
      encounter.emergencyOverride.reviewNotes = notes;
      await encounter.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: encounter.facilityId,
        action: 'emergency_access_reviewed',
        targetType: 'Encounter',
        targetId: encounter._id,
        after: { outcome },
        ...clientMeta(req),
      });

      res.json({ id: encounter._id, reviewed: true, reviewOutcome: outcome });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
