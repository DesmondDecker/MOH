const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * CHILD GROWTH MEASUREMENT
 * -------------------------------------------------------------------------
 * WHAT'S REAL HERE vs. WHAT'S DELIBERATELY NOT ATTEMPTED:
 *
 * MUAC (mid-upper arm circumference) malnutrition screening bands ARE
 * implemented (see services/growthService.js) — these are simple, fixed,
 * WHO-standard cutoffs (<11.5cm severe, 11.5-<12.5cm moderate, >=12.5cm
 * normal, for children 6-59 months), verified against current WHO/CDC
 * reference material before being encoded. This is safe to hard-code
 * because it IS just three fixed numbers, not a statistical model.
 *
 * Weight-for-age, height-for-age, and weight-for-height Z-SCORES are
 * DELIBERATELY NOT computed by this system. Real WHO growth standards are
 * large LMS (Lambda-Mu-Sigma) reference tables — hundreds of age/sex-
 * specific parameter rows — not something safe to approximate or
 * hand-transcribe from memory for a system making real malnutrition-
 * screening judgments about real children. Getting a transcribed
 * reference table wrong could misclassify a malnourished child as normal.
 * This model stores the raw measurements (weight, height/length, head
 * circumference) needed to compute those z-scores correctly, so that a
 * real WHO growth standard library (e.g. the `who-growth-standards` npm
 * package under an appropriate license, or the WHO's own published
 * reference tables) can be integrated later without a data model change —
 * but until that integration exists, this system does not claim to flag
 * weight-for-age/height-for-age malnutrition, only MUAC-based screening
 * and raw trend charting (see Sparkline usage in the frontend).
 */
const growthMeasurementSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter' },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    measurementDate: { type: Date, required: true, default: Date.now },
    ageInDaysAtMeasurement: { type: Number, required: true, min: 0 }, // computed at write time from Patient.dateOfBirth — stored so history reads don't depend on the patient's DOB never changing

    weightKg: { type: Number, min: 0.3, max: 60 },
    heightCm: { type: Number, min: 20, max: 150 }, // recorded as length (lying) under 24mo, height (standing) after — see recordedAs
    recordedAs: { type: String, enum: ['length', 'height'] },
    headCircumferenceCm: { type: Number, min: 20, max: 60 },
    muacCm: { type: Number, min: 5, max: 25 }, // mid-upper arm circumference — WHO malnutrition screening applies only 6-59 months, see growthService.js

    oedemaPresent: { type: Boolean, default: false }, // bilateral pitting edema — itself a marker of severe acute malnutrition regardless of MUAC/weight

    measuredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

growthMeasurementSchema.index({ patientId: 1, measurementDate: 1 });

module.exports = mongoose.model('GrowthMeasurement', growthMeasurementSchema);
