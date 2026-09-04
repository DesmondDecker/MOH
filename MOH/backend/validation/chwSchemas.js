const { z } = require('zod');
const { visitTypeValues, dangerSignValues } = require('../models/OutreachVisit');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const provisionalSubjectSchema = z.object({
  fullName: z.string().trim().min(1, 'fullName is required').max(200),
  approximateAge: z.string().trim().max(50).optional(),
  sex: z.enum(['male', 'female']).optional(),
  community: z.string().trim().max(200).optional(),
});

const outreachVisitSchema = z.object({
  clientVisitId: z.string().trim().min(1, 'clientVisitId is required'),
  patientId: objectId.optional(),
  provisionalSubject: provisionalSubjectSchema.optional(),
  visitType: z.enum(visitTypeValues),
  visitDate: z.coerce.date(),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  findings: z.string().trim().max(2000).optional(),
  dangerSignsObserved: z.array(z.enum(dangerSignValues)).optional(),
  referralNeeded: z.boolean().optional(),
  referralReason: z.string().trim().max(1000).optional(),
  referredToFacilityId: objectId.optional(),
  recordedOfflineAt: z.coerce.date(),
});

const syncBatchSchema = z.object({
  visits: z.array(outreachVisitSchema).min(1, 'At least one visit is required').max(200, 'Batch too large — split into smaller syncs'),
});

module.exports = { outreachVisitSchema, syncBatchSchema };
