const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { AuditLog } = require('../models/AuditLog');
const User = require('../models/User');
const { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditQuerySchema, facilityIdParamSchema } = require('../validation/auditSchemas');

router.use(authenticate, blockUntilPasswordChanged);

// GET /api/audit/facility/:facilityId — paginated, filterable audit log for facility admin
router.get(
  '/facility/:facilityId',
  requireRole('facility_admin'),
  validate({ params: facilityIdParamSchema, query: auditQuerySchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { actorId, action, limit = 50, skip = 0, from, to } = req.query;
      const filter = { facilityId: new mongoose.Types.ObjectId(req.params.facilityId) };
      if (actorId) filter.actorId = new mongoose.Types.ObjectId(actorId);
      if (action) filter.action = action;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = from;
        if (to) filter.createdAt.$lte = to;
      }
      const [entries, total] = await Promise.all([
        AuditLog.find(filter)
          .sort({ createdAt: -1 })
          .skip(Number(skip))
          .limit(Math.min(Number(limit), 200))
          .populate('actorId', 'fullName role username')
          .lean(),
        AuditLog.countDocuments(filter),
      ]);
      res.json({ entries, total, skip: Number(skip), limit: Number(limit) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/audit/facility/:facilityId/staff — staff list for filter dropdown
router.get(
  '/facility/:facilityId/staff',
  requireRole('facility_admin'),
  validate({ params: facilityIdParamSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const staff = await User.find({ facilityId: req.params.facilityId })
        .select('fullName username role')
        .sort({ fullName: 1 });
      res.json(staff);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
