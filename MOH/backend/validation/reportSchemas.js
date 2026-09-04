const { z } = require('zod');
const { METRICS } = require('../constants/reportMetrics');
const { ALL_PROVINCES, ALL_DISTRICTS } = require('../constants/sierraLeoneAdmin');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');
const metricIds = METRICS.map((m) => m.id);

const scopeSchema = z
  .object({
    level: z.enum(['facility', 'district', 'province', 'national']),
    facilityId: objectId.optional(),
    district: z.enum(ALL_DISTRICTS).optional(),
    province: z.enum(ALL_PROVINCES).optional(),
  })
  .refine((s) => s.level !== 'facility' || !!s.facilityId, { message: 'facilityId is required when level is "facility"' })
  .refine((s) => s.level !== 'district' || !!s.district, { message: 'district is required when level is "district"' })
  .refine((s) => s.level !== 'province' || !!s.province, { message: 'province is required when level is "province"' });

const generateReportSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  metricIds: z.array(z.enum(metricIds)).min(1, 'At least one metric must be selected'),
  scope: scopeSchema,
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date(),
  format: z.enum(['pdf', 'csv']),
});

module.exports = { generateReportSchema };
