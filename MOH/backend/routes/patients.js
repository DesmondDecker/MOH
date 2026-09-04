const express = require('express');
const router = express.Router();

const Patient = require('../models/Patient');
const auditService = require('../services/auditService');
const { generateMrn } = require('../services/mrnService');
const { findCandidateDuplicates } = require('../services/deduplicationService');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { blindIndex } = require('../services/encryptionService');
const { validate } = require('../middleware/validate');
const {
  createPatientSchema,
  createNewbornSchema,
  updatePatientSchema,
  recordDeathSchema,
  idParamSchema,
  duplicateReviewParamsSchema,
  duplicateReviewSchema,
} = require('../validation/patientSchemas');

const CLINICAL_ROLES = ['doctor', 'nurse', 'pharmacist', 'facility_admin'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// POST /api/patients — register a patient (verified or provisional tier)
// ---------------------------------------------------------------------------
router.post('/', requireRole(...CLINICAL_ROLES), validate({ body: createPatientSchema }), async (req, res, next) => {
  try {
    const {
      fullName,
      dateOfBirth,
      dateOfBirthEstimated,
      sex,
      nationalId,
      phone,
      district,
      chiefdom,
      address,
      nextOfKin,
      dataSharingWithThirdParties,
    } = req.body;

    if (!req.user.facilityId) {
      return res.status(400).json({ error: 'Registering user must belong to a facility' });
    }

    const mrn = await generateMrn();

    const patient = new Patient({
      mrn,
      identityTier: nationalId ? 'verified' : 'provisional',
      nationalId: nationalId || undefined,
      fullName,
      dateOfBirth,
      dateOfBirthEstimated: !!dateOfBirthEstimated,
      sex,
      phone,
      district,
      chiefdom,
      address,
      nextOfKin,
      registeredAtFacility: req.user.facilityId,
      registeredBy: req.user.id,
      consent: {
        dataSharingWithMoH: true,
        dataSharingWithThirdParties: !!dataSharingWithThirdParties,
        recordedAt: new Date(),
        recordedBy: req.user.id,
      },
    });

    // Run dedup check before final save so we can attach candidates immediately.
    const candidates = await findCandidateDuplicates(patient);
    if (candidates.length > 0) {
      patient.possibleDuplicates = candidates.map((c) => ({
        patientId: c.patientId,
        matchScore: c.matchScore,
        matchedOn: c.matchedOn,
        status: 'pending_review',
      }));
    }

    await patient.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'patient_registered',
      targetType: 'Patient',
      targetId: patient._id,
      after: { mrn: patient.mrn, identityTier: patient.identityTier },
      ...clientMeta(req),
    });

    if (candidates.length > 0) {
      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.user.facilityId,
        action: 'possible_duplicate_flagged',
        targetType: 'Patient',
        targetId: patient._id,
        after: { candidateCount: candidates.length },
        ...clientMeta(req),
      });
    }

    res.status(201).json(patient);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/patients/newborn — birth registration, linked to mother's record
// ---------------------------------------------------------------------------
router.post('/newborn', requireRole(...CLINICAL_ROLES), validate({ body: createNewbornSchema }), async (req, res, next) => {
  try {
    const { motherPatientId, sex, dateOfBirth, fullName } = req.body;

    const mother = await Patient.findById(motherPatientId);
    if (!mother) return res.status(404).json({ error: 'Mother patient record not found' });

    const mrn = await generateMrn();

    const newborn = await Patient.create({
      mrn,
      identityTier: 'newborn',
      fullName: fullName || `Baby of ${mother.fullName}`,
      dateOfBirth: dateOfBirth || new Date(),
      sex,
      motherPatientId: mother._id,
      district: mother.district,
      chiefdom: mother.chiefdom,
      nextOfKin: { name: mother.fullName, relationship: 'mother', phone: mother.phone },
      registeredAtFacility: req.user.facilityId,
      registeredBy: req.user.id,
      consent: {
        dataSharingWithMoH: true,
        dataSharingWithThirdParties: false,
        recordedAt: new Date(),
        recordedBy: req.user.id,
      },
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'newborn_registered',
      targetType: 'Patient',
      targetId: newborn._id,
      after: { mrn: newborn.mrn, motherPatientId: mother._id },
      ...clientMeta(req),
    });

    res.status(201).json(newborn);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/patients/search?query=... — fuzzy search by name, mrn, nationalId, phone
// ---------------------------------------------------------------------------
router.get('/search', requireRole(...CLINICAL_ROLES), async (req, res, next) => {
  try {
    const { query } = req.query;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({ error: 'query must be at least 2 characters' });
    }

    const q = query.trim();

    // nationalId and phone are encrypted at rest (non-deterministic
    // ciphertext), so a partial regex match against them is no longer
    // possible — only an EXACT match via their blind index is. mrn and
    // fullName stay plaintext (see models/Patient.js) and keep supporting
    // partial/fuzzy regex search as before.
    const orClauses = [{ mrn: new RegExp(q, 'i') }, { fullName: new RegExp(q, 'i') }];
    const exactHash = blindIndex(q);
    orClauses.push({ nationalIdBlindIndex: exactHash }, { phoneBlindIndex: exactHash });

    const results = await Patient.find({
      status: { $ne: 'merged' },
      $or: orClauses,
    })
      .select('mrn fullName dateOfBirth sex district registeredAtFacility identityTier status')
      .populate('registeredAtFacility', 'name code')
      .limit(20);

    // Search itself is logged in aggregate, not per-result, to avoid audit-log noise —
    // the per-record VIEW is what gets individually audited below.
    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'patient_search',
      after: { query: q, resultCount: results.length },
      ...clientMeta(req),
    });

    res.json(results);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/patients/:id — full record view, individually audited (per-view logging)
// Supports break-glass emergency override for out-of-facility access.
// ---------------------------------------------------------------------------
router.get('/:id', requireRole(...CLINICAL_ROLES), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id).populate('registeredAtFacility', 'name code');
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const { emergencyJustification } = req.query;
    const isOwnFacility = patient.registeredAtFacility._id.toString() === req.user.facilityId;
    const usedEmergencyOverride = !isOwnFacility && !!emergencyJustification;

    // Normal continuity-of-care access across facilities is allowed by design
    // (referral workflow depends on it) — but out-of-facility access WITHOUT a
    // justification is not accepted for anything the emergency path exists for.
    // Here we simply distinguish and log which path was used; tightening this
    // to a hard block for non-referral cross-facility reads is a policy call,
    // not something to silently decide here.

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: usedEmergencyOverride ? 'patient_record_viewed_emergency_override' : 'patient_record_viewed',
      targetType: 'Patient',
      targetId: patient._id,
      after: usedEmergencyOverride ? { justification: emergencyJustification } : undefined,
      ...clientMeta(req),
    });

    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/patients/:id — demographic correction (non-clinical fields only)
// Clinical data (allergies, chronic conditions) intentionally NOT editable here —
// those follow the amendment pattern in MedicalHistory, not silent field updates.
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  requireRole(...CLINICAL_ROLES),
  validate({ params: idParamSchema, body: updatePatientSchema }),
  async (req, res, next) => {
    try {
      const patient = await Patient.findById(req.params.id);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      const editableFields = ['phone', 'district', 'chiefdom', 'address', 'nextOfKin', 'nationalId'];
      const before = {};
      const after = {};

      for (const field of editableFields) {
        if (req.body[field] !== undefined) {
          before[field] = patient[field];
          patient[field] = req.body[field];
          after[field] = req.body[field];
        }
      }

      // Zod's .refine() already guarantees at least one field was sent —
      // this branch is now unreachable for anything Zod let through, kept
      // only as a defensive fallback.
      if (Object.keys(after).length === 0) {
        return res.status(400).json({ error: 'No editable fields provided' });
      }

      // Adding a nationalId upgrades a provisional record to verified.
      if (after.nationalId && patient.identityTier === 'provisional') {
        before.identityTier = patient.identityTier;
        patient.identityTier = 'verified';
        after.identityTier = 'verified';
      }

      await patient.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.user.facilityId,
        action: 'patient_demographics_updated',
        targetType: 'Patient',
        targetId: patient._id,
        before,
        after,
        ...clientMeta(req),
      });

      res.json(patient);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/patients/:id/death — death registration
// ---------------------------------------------------------------------------
router.post(
  '/:id/death',
  requireRole('doctor', 'facility_admin'),
  validate({ params: idParamSchema, body: recordDeathSchema }),
  async (req, res, next) => {
    try {
      const { dateOfDeath, cause } = req.body;
      const patient = await Patient.findById(req.params.id);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      if (patient.status === 'deceased') {
        return res.status(409).json({ error: 'Patient already recorded as deceased' });
      }

      patient.status = 'deceased';
      patient.deceasedAt = dateOfDeath || new Date();
      patient.deceasedRecordedBy = req.user.id;
      await patient.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.user.facilityId,
        action: 'death_registered',
        targetType: 'Patient',
        targetId: patient._id,
        after: { deceasedAt: patient.deceasedAt, cause },
        ...clientMeta(req),
      });

      res.json(patient);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/patients/:id/duplicates/:candidatePatientId/review — confirm or reject a flagged duplicate
// No auto-merge: this only records the human decision. Actual merging (if
// confirmed) is a separate, deliberately manual, higher-privilege operation.
// ---------------------------------------------------------------------------
router.post(
  '/:id/duplicates/:candidatePatientId/review',
  requireRole('facility_admin', 'moh_super_admin'),
  validate({ params: duplicateReviewParamsSchema, body: duplicateReviewSchema }),
  async (req, res, next) => {
    try {
      const { decision } = req.body; // 'confirmed_duplicate' | 'rejected'

      const patient = await Patient.findById(req.params.id);
      if (!patient) return res.status(404).json({ error: 'Patient not found' });

      const entry = patient.possibleDuplicates.find(
        (d) => d.patientId.toString() === req.params.candidatePatientId
      );
      if (!entry) return res.status(404).json({ error: 'Duplicate candidate entry not found' });

      entry.status = decision;
      entry.reviewedBy = req.user.id;
      entry.reviewedAt = new Date();
      await patient.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: req.user.facilityId,
        action: 'duplicate_review_decided',
        targetType: 'Patient',
        targetId: patient._id,
        after: { candidatePatientId: req.params.candidatePatientId, decision },
        ...clientMeta(req),
      });

      res.json(entry);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
