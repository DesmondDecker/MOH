const mongoose = require('mongoose');
const { Schema } = mongoose;

const immunizationRecordSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter' },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    vaccine: { type: String, required: true }, // matches a `vaccine` key in constants/immunizationSchedule.js
    dose: { type: Number, required: true, min: 0 }, // 0 for birth-dose OPV, otherwise 1-indexed

    administeredDate: { type: Date, required: true, default: Date.now },
    batchNumber: { type: String, trim: true },

    // Adverse Event Following Immunization — WHO/EPI programs track these
    // separately from general clinical notes since they feed into
    // vaccine safety surveillance reporting, not just this one patient's chart.
    adverseEvent: { type: Boolean, default: false },
    adverseEventNotes: { type: String, trim: true, maxlength: 1000 },

    administeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// A given child should only have one record per vaccine+dose — prevents
// accidental duplicate entry of the same dose (a real risk in a paper-to-
// digital transition where a CHW might re-enter a dose already logged
// during a facility visit).
immunizationRecordSchema.index({ patientId: 1, vaccine: 1, dose: 1 }, { unique: true });

module.exports = mongoose.model('ImmunizationRecord', immunizationRecordSchema);
