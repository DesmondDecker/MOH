const express = require('express');
const router = express.Router();

const LabResult = require('../models/LabResult');
const auditService = require('../services/auditService');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  orderTestSchema,
  recordResultSchema,
  amendResultSchema,
  idParamSchema,
  patientIdParamSchema,
} = require('../validation/labResultSchemas');

const CLINICAL_ROLES = ['doctor', 'nurse', 'pharmacist'];
const NOTIFIABLE_DISEASE_TESTS = ['cholera', 'lassa', 'ebola', 'measles', 'meningitis', 'yellow fever'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

// ---------------------------------------------------------------------------
// POST /api/lab-results — order a test
// ---------------------------------------------------------------------------
router.post('/', requireRole('doctor', 'nurse'), validate({ body: orderTestSchema }), async (req, res, next) => {
  try {
    const { patientId, encounterId, testName, testCategory } = req.body;

    const labResult = await LabResult.create({
      patientId,
      encounterId,
      facilityId: req.user.facilityId,
      testName,
      testCategory,
      orderedBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'lab_test_ordered',
      targetType: 'LabResult',
      targetId: labResult._id,
      after: { testName },
      ...clientMeta(req),
    });

    res.status(201).json(labResult);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/lab-results/:id/result — record the result of an ordered test
// ---------------------------------------------------------------------------
router.patch('/:id/result', requireRole('doctor', 'nurse'), validate({ params: idParamSchema, body: recordResultSchema }), async (req, res, next) => {
  try {
    const { value, unit, referenceRange, isAbnormal, isCritical } = req.body;

    const labResult = await LabResult.findById(req.params.id);
    if (!labResult) return res.status(404).json({ error: 'Lab result not found' });
    if (labResult.status === 'completed') {
      return res.status(409).json({ error: 'Result already recorded; use the amend endpoint to correct it' });
    }

    const isNotifiable = NOTIFIABLE_DISEASE_TESTS.some((kw) => labResult.testName.toLowerCase().includes(kw));
    const isPositive = typeof value === 'string' && value.toLowerCase().includes('positive');

    labResult.result = { value, unit, referenceRange, isAbnormal: !!isAbnormal, isCritical: !!isCritical };
    labResult.status = 'completed';
    labResult.performedBy = req.user.id;
    labResult.performedAt = new Date();
    labResult.notifiableDisease = isNotifiable && isPositive;
    await labResult.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: labResult.notifiableDisease ? 'lab_result_recorded_notifiable_disease' : 'lab_result_recorded',
      targetType: 'LabResult',
      targetId: labResult._id,
      after: { value, isCritical: !!isCritical, notifiableDisease: labResult.notifiableDisease },
      ...clientMeta(req),
    });

    if (labResult.notifiableDisease) {
      console.warn(`[surveillance] Notifiable disease lab result: "${labResult.testName}" = "${value}" at facility ${req.user.facilityId}`);
    }
    if (isCritical) {
      console.warn(`[alert] Critical lab result for patient ${labResult.patientId}, ordering provider ${labResult.orderedBy}`);
    }

    res.json(labResult);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/lab-results/patient/:patientId
// ---------------------------------------------------------------------------
router.get('/patient/:patientId', requireRole(...CLINICAL_ROLES), validate({ params: patientIdParamSchema }), async (req, res, next) => {
  try {
    const results = await LabResult.find({ patientId: req.params.patientId }).sort({ orderedAt: -1 });
    res.json(results);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/lab-results/:id/amend — correction workflow
// ---------------------------------------------------------------------------
router.post('/:id/amend', requireRole('doctor'), validate({ params: idParamSchema, body: amendResultSchema }), async (req, res, next) => {
  try {
    const { reason, value, unit, referenceRange, isAbnormal, isCritical } = req.body;

    const original = await LabResult.findById(req.params.id);
    if (!original) return res.status(404).json({ error: 'Lab result not found' });
    if (original.supersededBy) {
      return res.status(409).json({ error: 'This result has already been superseded by a later amendment' });
    }

    const amended = await LabResult.create({
      patientId: original.patientId,
      encounterId: original.encounterId,
      facilityId: original.facilityId,
      testName: original.testName,
      testCategory: original.testCategory,
      orderedBy: original.orderedBy,
      orderedAt: original.orderedAt,
      performedBy: req.user.id,
      performedAt: new Date(),
      status: 'completed',
      result: { value, unit, referenceRange, isAbnormal: !!isAbnormal, isCritical: !!isCritical },
      amendsResultId: original._id,
    });

    original.supersededBy = amended._id;
    await original.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'lab_result_amended',
      targetType: 'LabResult',
      targetId: amended._id,
      before: { originalResultId: original._id },
      after: { reason, value },
      ...clientMeta(req),
    });

    res.status(201).json(amended);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
