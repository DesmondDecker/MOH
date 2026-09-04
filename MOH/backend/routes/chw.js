const express = require('express');
const router = express.Router();
const { z } = require('zod');

const OutreachVisit = require('../models/OutreachVisit');
const Patient = require('../models/Patient');
const auditService = require('../services/auditService');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { syncBatchSchema } = require('../validation/chwSchemas');

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

router.post('/visits/sync', requireRole('chw'), validate({ body: syncBatchSchema }), async (req, res, next) => {
  try {
    const results = [];

    for (const visit of req.body.visits) {
      try {
        if (!visit.patientId && !visit.provisionalSubject) {
          results.push({ clientVisitId: visit.clientVisitId, status: 'error', error: 'Either patientId or provisionalSubject is required' });
          continue;
        }
        if (visit.patientId && visit.provisionalSubject) {
          results.push({ clientVisitId: visit.clientVisitId, status: 'error', error: 'Provide patientId OR provisionalSubject, not both' });
          continue;
        }
        if (visit.patientId) {
          const exists = await Patient.exists({ _id: visit.patientId });
          if (!exists) {
            results.push({ clientVisitId: visit.clientVisitId, status: 'error', error: 'patientId does not match any known patient' });
            continue;
          }
        }

        const existing = await OutreachVisit.findOne({ clientVisitId: visit.clientVisitId });
        if (existing) {
          results.push({ clientVisitId: visit.clientVisitId, status: 'already_synced', id: existing._id });
          continue;
        }

        const created = await OutreachVisit.create({
          ...visit,
          chwId: req.user.id,
          facilityId: req.user.facilityId,
          syncedAt: new Date(),
        });

        results.push({ clientVisitId: visit.clientVisitId, status: 'synced', id: created._id });

        if (created.dangerSignsObserved?.length > 0 || created.referralNeeded) {
          await auditService.record({
            actorId: req.user.id,
            actorRole: req.user.role,
            facilityId: req.user.facilityId,
            action: 'chw_visit_flagged',
            targetType: 'OutreachVisit',
            targetId: created._id,
            after: { visitType: created.visitType, dangerSigns: created.dangerSignsObserved, referralNeeded: created.referralNeeded },
            ...clientMeta(req),
          });
        }
      } catch (recordErr) {
        results.push({ clientVisitId: visit.clientVisitId, status: 'error', error: recordErr.message || 'Unknown error' });
      }
    }

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'chw_visits_synced',
      targetType: 'OutreachVisit',
      after: { batchSize: req.body.visits.length, synced: results.filter((r) => r.status === 'synced').length },
      ...clientMeta(req),
    });

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

router.get('/visits/mine', requireRole('chw'), async (req, res, next) => {
  try {
    const visits = await OutreachVisit.find({ chwId: req.user.id }).sort({ visitDate: -1 }).limit(100);
    res.json(visits);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/facility/:facilityId/referrals',
  requireRole('facility_admin', 'doctor', 'nurse'),
  validate({ params: z.object({ facilityId: z.string().regex(/^[0-9a-fA-F]{24}$/) }) }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const visits = await OutreachVisit.find({ facilityId: req.params.facilityId, referralNeeded: true })
        .populate('chwId', 'fullName')
        .populate('patientId', 'mrn fullName')
        .sort({ visitDate: -1 })
        .limit(100);
      res.json(visits);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
