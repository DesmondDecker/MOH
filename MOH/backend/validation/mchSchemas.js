const { z } = require('zod');
const { dangerSignValues } = require('../models/AntenatalVisit');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid ID');

const antenatalVisitSchema = z.object({
  patientId: objectId,
  encounterId: objectId,
  visitNumber: z.number().int().min(1).max(20),
  gestationalAgeWeeks: z.number().min(4).max(45),
  estimatedDeliveryDate: z.coerce.date().optional(),
  weightKg: z.number().min(20).max(300).optional(),
  bloodPressureSystolic: z.number().min(40).max(300).optional(),
  bloodPressureDiastolic: z.number().min(20).max(200).optional(),
  fundalHeightCm: z.number().min(0).max(60).optional(),
  fetalHeartRateBpm: z.number().min(0).max(250).optional(),
  fetalMovementFelt: z.boolean().optional(),
  hemoglobinGdl: z.number().min(0).max(25).optional(),
  urineProteinPositive: z.boolean().optional(),
  urineGlucosePositive: z.boolean().optional(),
  dangerSigns: z.array(z.enum(dangerSignValues)).optional(),
  tetanusToxoidGiven: z.boolean().optional(),
  ironFolateGiven: z.boolean().optional(),
  malariaProphylaxisGiven: z.boolean().optional(),
  dewormingGiven: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
  nextVisitDate: z.coerce.date().optional(),
});

const growthMeasurementSchema = z.object({
  patientId: objectId,
  encounterId: objectId.optional(),
  measurementDate: z.coerce.date().max(new Date(), 'measurementDate cannot be in the future').optional(),
  weightKg: z.number().min(0.3).max(60).optional(),
  heightCm: z.number().min(20).max(150).optional(),
  recordedAs: z.enum(['length', 'height']).optional(),
  headCircumferenceCm: z.number().min(20).max(60).optional(),
  muacCm: z.number().min(5).max(25).optional(),
  oedemaPresent: z.boolean().optional(),
});

const immunizationRecordSchema = z.object({
  patientId: objectId,
  encounterId: objectId.optional(),
  vaccine: z.string().trim().min(1, 'vaccine is required').max(50),
  dose: z.number().int().min(0).max(20),
  administeredDate: z.coerce.date().max(new Date(), 'administeredDate cannot be in the future').optional(),
  batchNumber: z.string().trim().max(50).optional(),
  adverseEvent: z.boolean().optional(),
  adverseEventNotes: z.string().trim().max(1000).optional(),
});

const patientIdParamSchema = z.object({ patientId: objectId });
const idParamSchema = z.object({ id: objectId });

module.exports = {
  antenatalVisitSchema,
  growthMeasurementSchema,
  immunizationRecordSchema,
  patientIdParamSchema,
  idParamSchema,
};
