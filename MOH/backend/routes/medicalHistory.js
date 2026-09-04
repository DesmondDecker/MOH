const express = require('express');
const router = express.Router();

const MedicalHistory = require('../models/MedicalHistory');
const Patient = require('../models/Patient');
const Encounter = require('../models/Encounter');
const auditService = require('../services/auditService');
const { checkAllergyConflict, checkDrugInteractions } = require('../services/drugInteractionService');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  createPrescriptionSchema,
  createProcedureSchema,
  amendSchema,
  idParamSchema,
  facilityIdParamSchema,
  patientIdParamSchema,
} = require('../validation/medicalHistorySchemas');

const CLINICAL_ROLES = ['doctor', 'nurse', 'pharmacist'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

/**
 * Loads the drug names of a patient's other current prescriptions, for
 * drug-drug interaction checking. "Current" here means: prescribed within
 * the last ACTIVE_PRESCRIPTION_WINDOW_DAYS and not cancelled — there's no
 * explicit "this course is finished" signal in the data model (durationDays
 * is often absent), so a rolling recency window is a pragmatic proxy for
 * "still plausibly being taken" rather than a precise pharmacological
 * determination. Excludes the encounter currently being prescribed into,
 * so a multi-drug order within the SAME encounter checks new drugs against
 * each other as they're added, not just against unrelated past visits.
 */
const ACTIVE_PRESCRIPTION_WINDOW_DAYS = 30;

async function loadActiveDrugNames(patientId) {
  const since = new Date(Date.now() - ACTIVE_PRESCRIPTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await MedicalHistory.find({
    patientId,
    entryType: 'prescription',
    createdAt: { $gte: since },
    'prescription.dispenseStatus': { $ne: 'cancelled' },
    supersededBy: null,
  }).select('prescription.drugName');

  return recent.map((entry) => entry.prescription.drugName).filter(Boolean);
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// POST /api/medical-history/prescriptions
// ---------------------------------------------------------------------------
router.post('/prescriptions', requireRole('doctor'), validate({ body: createPrescriptionSchema }), async (req, res, next) => {
  try {
    const {
      patientId,
      encounterId,
      inventoryItemId,
      drugName,
      dosage,
      frequency,
      durationDays,
      route,
      overrideJustification,
      quantityPrescribed,
    } = req.body;

    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const encounter = await Encounter.findById(encounterId);
    if (!encounter) return res.status(404).json({ error: 'Encounter not found' });

    const allergyConflict = checkAllergyConflict(patient, drugName);
    const activeDrugNames = await loadActiveDrugNames(patientId);
    const interactions = checkDrugInteractions(drugName, activeDrugNames);
    // Only a MAJOR interaction blocks the same way an allergy conflict
    // does — moderate/minor interactions are common enough in real
    // polypharmacy (this system's own reference table has several) that
    // hard-blocking every one of them would train prescribers to reflexively
    // click through the override rather than actually read it. They're
    // still surfaced in the response either way so the prescriber sees them.
    const blockingInteraction = interactions.find((i) => i.severity === 'major');

    if ((allergyConflict || blockingInteraction) && !overrideJustification) {
      // Block the prescription and surface the conflict — the client is expected
      // to show this to the prescriber and either change the drug or resubmit
      // with an explicit override justification.
      return res.status(409).json({
        error: allergyConflict ? 'Allergy conflict detected' : 'Major drug interaction detected',
        allergyConflict: allergyConflict
          ? {
              substance: allergyConflict.allergy.substance,
              reaction: allergyConflict.allergy.reaction,
              severity: allergyConflict.allergy.severity,
              matchType: allergyConflict.matchType, // 'direct' | 'cross_reactivity' — lets the UI explain WHY this was flagged
            }
          : null,
        interactions, // always included (not just the blocking one) so the prescriber sees the full picture before deciding
      });
    }

    const entry = await MedicalHistory.create({
      patientId,
      encounterId,
      facilityId: req.user.facilityId,
      entryType: 'prescription',
      prescription: {
        inventoryItemId: inventoryItemId || undefined,
        drugName,
        dosage,
        frequency,
        durationDays,
        route,
        allergyCheckPerformed: true,
        allergyConflictOverridden: !!allergyConflict,
        overrideJustification: allergyConflict || blockingInteraction ? overrideJustification : undefined,
        // Only set when the prescriber gave a discrete quantity — see the
        // schema comment on why this stays optional. Without it, the
        // dispense route can't track partial fills against a target and
        // falls back to its legacy all-at-once behavior for this entry.
        quantityPrescribed: quantityPrescribed || undefined,
        quantityDispensed: 0,
      },
      prescribedBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: allergyConflict || blockingInteraction ? 'prescription_created_allergy_override' : 'prescription_created',
      targetType: 'MedicalHistory',
      targetId: entry._id,
      after: {
        drugName,
        dosage,
        quantityPrescribed,
        allergyOverridden: !!allergyConflict,
        interactionsFlagged: interactions.map((i) => ({ withDrug: i.withDrug, severity: i.severity })),
      },
      ...clientMeta(req),
    });

    res.status(201).json({ ...entry.toObject(), interactionsFlagged: interactions });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/medical-history/procedures
// ---------------------------------------------------------------------------
router.post('/procedures', requireRole('doctor'), validate({ body: createProcedureSchema }), async (req, res, next) => {
  try {
    const { patientId, encounterId, name, performedAt, outcome } = req.body;

    const entry = await MedicalHistory.create({
      patientId,
      encounterId,
      facilityId: req.user.facilityId,
      entryType: 'procedure',
      procedure: { name, performedAt: performedAt || new Date(), outcome },
      prescribedBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'procedure_recorded',
      targetType: 'MedicalHistory',
      targetId: entry._id,
      after: { name },
      ...clientMeta(req),
    });

    res.status(201).json(entry);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/medical-history/facility/:facilityId/pending-prescriptions —
// the pharmacist's dispense queue: prescriptions not yet fully dispensed,
// oldest first, with patient info joined in.
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/pending-prescriptions',
  requireRole('pharmacist', 'facility_admin'),
  validate({ params: facilityIdParamSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const entries = await MedicalHistory.find({
        facilityId: req.params.facilityId,
        entryType: 'prescription',
        'prescription.dispenseStatus': { $in: ['pending', 'partially_dispensed'] },
      })
        .populate('patientId', 'mrn fullName')
        .populate('prescribedBy', 'fullName')
        .sort({ createdAt: 1 });
      res.json(entries);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/medical-history/patient/:patientId — full history, newest first
// ---------------------------------------------------------------------------
router.get('/patient/:patientId', requireRole(...CLINICAL_ROLES), validate({ params: patientIdParamSchema }), async (req, res, next) => {
  try {
    const entries = await MedicalHistory.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/medical-history/:id/amend — correction workflow, never overwrites the original
// ---------------------------------------------------------------------------
router.post('/:id/amend', requireRole('doctor'), validate({ params: idParamSchema, body: amendSchema }), async (req, res, next) => {
  try {
    const { reason, changes } = req.body;

    const original = await MedicalHistory.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Entry not found' });
    if (original.supersededBy) {
      return res.status(409).json({ error: 'This entry has already been superseded by a later amendment' });
    }

    const amended = await MedicalHistory.create({
      patientId: original.patientId,
      encounterId: original.encounterId,
      facilityId: original.facilityId,
      entryType: original.entryType,
      prescription: { ...(original.prescription?.toObject?.() || original.prescription), ...changes.prescription },
      procedure: { ...(original.procedure?.toObject?.() || original.procedure), ...changes.procedure },
      note: changes.note ?? original.note,
      prescribedBy: req.user.id,
      amendsEntryId: original._id,
      amendmentReason: reason,
    });

    original.supersededBy = amended._id;
    await original.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'medical_history_amended',
      targetType: 'MedicalHistory',
      targetId: amended._id,
      before: { originalEntryId: original._id },
      after: { reason },
      ...clientMeta(req),
    });

    res.status(201).json(amended);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
