const express = require('express');
const router = express.Router();

const Facility = require('../models/Facility');
const User = require('../models/User');
const auditService = require('../services/auditService');
const { METRICS, getMetric } = require('../constants/reportMetrics');
const { streamMetricsReportPdf } = require('../services/pdfService');
const { toCsv } = require('../services/csvService');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { generateReportSchema } = require('../validation/reportSchemas');

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

router.use(authenticate, blockUntilPasswordChanged);

router.get('/metrics', (req, res) => {
  res.json(METRICS.map((m) => ({ id: m.id, label: m.label, category: m.category, unit: m.unit })));
});

/**
 * Resolves a requested scope into an actual list of facility ObjectIds to
 * query against, enforcing who's allowed to request what: facility_admin
 * can only request their own facility; district/province/national scope
 * is a moh_super_admin-only capability, mirroring the requireSameFacility
 * boundary used elsewhere in this codebase for anything cross-facility.
 * Throws a { status, message } object on an authorization failure, which
 * the route catches and turns into the right HTTP response.
 */
async function resolveFacilityIds(scope, user) {
  if (user.role !== 'moh_super_admin' && scope.level !== 'facility') {
    throw { status: 403, message: 'Only MoH super admins can generate reports above facility scope' };
  }
  if (user.role !== 'moh_super_admin' && scope.facilityId !== user.facilityId) {
    throw { status: 403, message: 'Cannot generate a report for another facility' };
  }

  if (scope.level === 'facility') {
    const facility = await Facility.findById(scope.facilityId).select('name');
    if (!facility) throw { status: 404, message: 'Facility not found' };
    return { facilityIds: [facility._id], scopeLabel: facility.name };
  }
  if (scope.level === 'district') {
    const facilities = await Facility.find({ district: scope.district }).select('_id');
    return { facilityIds: facilities.map((f) => f._id), scopeLabel: `${scope.district} District` };
  }
  if (scope.level === 'province') {
    const facilities = await Facility.find({ province: scope.province }).select('_id');
    return { facilityIds: facilities.map((f) => f._id), scopeLabel: scope.province };
  }
  const facilities = await Facility.find().select('_id');
  return { facilityIds: facilities.map((f) => f._id), scopeLabel: 'National (all facilities)' };
}

router.post('/generate', requireRole('facility_admin', 'moh_super_admin'), validate({ body: generateReportSchema }), async (req, res, next) => {
  try {
    const { title, metricIds, scope, dateFrom, dateTo, format } = req.body;

    if (dateFrom > dateTo) {
      return res.status(400).json({ error: 'dateFrom must be before dateTo' });
    }

    let facilityIds, scopeLabel;
    try {
      ({ facilityIds, scopeLabel } = await resolveFacilityIds(scope, req.user));
    } catch (scopeErr) {
      if (scopeErr.status) return res.status(scopeErr.status).json({ error: scopeErr.message });
      throw scopeErr;
    }

    if (facilityIds.length === 0) {
      return res.status(404).json({ error: 'No facilities match the requested scope' });
    }

    // req.user (set by the auth middleware) only carries id/role/facilityId
    // — no fullName — so it's loaded here specifically for the "Generated
    // by" line on the report.
    const actingUser = await User.findById(req.user.id).select('fullName');

    const computed = [];
    for (const id of metricIds) {
      const metric = getMetric(id);
      try {
        const value = await metric.compute(facilityIds, dateFrom, dateTo);
        computed.push({ label: metric.label, category: metric.category, unit: metric.unit, value });
      } catch (metricErr) {
        computed.push({ label: metric.label, category: metric.category, unit: metric.unit, value: 'unavailable' });
      }
    }

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'report_generated',
      targetType: 'Report',
      after: { metricIds, scope, format },
      ...clientMeta(req),
    });

    const reportTitle = title || 'MoH Program Report';

    if (format === 'csv') {
      const csv = toCsv(computed, [
        { key: 'category', label: 'Category' },
        { key: 'label', label: 'Metric' },
        { key: 'value', label: 'Value' },
        { key: 'unit', label: 'Unit' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.replace(/[^a-z0-9]/gi, '_')}.csv"`);
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportTitle.replace(/[^a-z0-9]/gi, '_')}.pdf"`);
    streamMetricsReportPdf({
      res,
      title: reportTitle,
      scopeLabel,
      dateFrom,
      dateTo,
      metrics: computed,
      generatedByUser: actingUser?.fullName,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
