const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');

/**
 * ANTENATAL CARE VISIT
 * -------------------------------------------------------------------------
 * WHO recommends a minimum of 8 antenatal contacts for a low-risk
 * pregnancy. This model tracks each individual visit's findings —
 * gestational age, growth/wellbeing indicators, and danger signs — rather
 * than folding them into the generic Encounter/vitals shape, because
 * antenatal care has its own structured, WHO-standardized data points
 * (fundal height, fetal heart rate, danger-sign checklist) that a generic
 * "vitals" object doesn't capture and that MCH program reporting
 * specifically needs to aggregate on.
 */
const dangerSignValues = [
  'vaginal_bleeding',
  'severe_headache',
  'blurred_vision',
  'convulsions',
  'severe_abdominal_pain',
  'high_fever',
  'reduced_fetal_movement',
  'swelling_face_hands',
  'draining_liquor',
];

const antenatalVisitSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    visitNumber: { type: Number, required: true, min: 1 }, // 1st through 8th+ WHO-recommended contact
    gestationalAgeWeeks: { type: Number, required: true, min: 4, max: 45 },

    // Estimated Date of Delivery — recorded once (at the first visit) and
    // carried forward, rather than recomputed per visit, so it stays
    // stable even if a later visit's gestational-age estimate shifts
    // slightly (e.g. from an ultrasound correction).
    estimatedDeliveryDate: { type: Date },

    weightKg: { type: Number, min: 20, max: 300 },
    bloodPressureSystolic: { type: Number, min: 40, max: 300 },
    bloodPressureDiastolic: { type: Number, min: 20, max: 200 },
    fundalHeightCm: { type: Number, min: 0, max: 60 },
    fetalHeartRateBpm: { type: Number, min: 0, max: 250 },
    fetalMovementFelt: { type: Boolean },

    hemoglobinGdl: { type: Number, min: 0, max: 25 },
    urineProteinPositive: { type: Boolean },
    urineGlucosePositive: { type: Boolean },

    dangerSigns: [{ type: String, enum: dangerSignValues }],

    // Preventive interventions this visit — WHO ANC contact schedule
    // bundles these in alongside the clinical exam, not as separate
    // encounters, so tracking them here keeps a single visit's full
    // picture in one record.
    tetanusToxoidGiven: { type: Boolean, default: false },
    ironFolateGiven: { type: Boolean, default: false },
    malariaProphylaxisGiven: { type: Boolean, default: false }, // IPTp — intermittent preventive treatment
    dewormingGiven: { type: Boolean, default: false },

    notes: encryptedField(),

    nextVisitDate: { type: Date },

    providerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

antenatalVisitSchema.index({ patientId: 1, visitNumber: 1 });

antenatalVisitSchema.methods.hasDangerSigns = function () {
  return this.dangerSigns && this.dangerSigns.length > 0;
};

module.exports = mongoose.model('AntenatalVisit', antenatalVisitSchema);
module.exports.dangerSignValues = dangerSignValues;
