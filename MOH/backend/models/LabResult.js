const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');

const labResultSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },

    testName: { type: String, required: true }, // e.g. "Malaria RDT", "Full Blood Count"
    testCategory: { type: String, enum: ['hematology', 'microbiology', 'chemistry', 'serology', 'radiology', 'other'] },

    orderedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    orderedAt: { type: Date, default: Date.now },

    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date },

    status: { type: String, enum: ['ordered', 'in_progress', 'completed', 'cancelled'], default: 'ordered' },

    result: {
      // Encrypted: the actual test result is PHI (e.g. an HIV/VL result,
      // a positive Lassa/cholera finding). Flags below (isAbnormal,
      // isCritical, notifiableDisease) stay plaintext booleans on purpose —
      // they're what dashboards and critical-alert routing filter on in
      // bulk, and a boolean carries no identifying information on its own.
      value: encryptedField(), // qualitative (e.g. "Positive") or quantitative as string for flexibility
      unit: String,
      referenceRange: String,
      isAbnormal: { type: Boolean, default: false },
      isCritical: { type: Boolean, default: false }, // triggers urgent notification to ordering provider
    },

    notifiableDisease: { type: Boolean, default: false }, // e.g. confirmed Lassa fever, cholera
    notes: encryptedField(),

    // Correction workflow, same pattern as MedicalHistory — results aren't silently edited.
    amendsResultId: { type: Schema.Types.ObjectId, ref: 'LabResult', default: null },
    supersededBy: { type: Schema.Types.ObjectId, ref: 'LabResult', default: null },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

labResultSchema.index({ patientId: 1, orderedAt: -1 });
labResultSchema.index({ notifiableDisease: 1, orderedAt: -1 });

module.exports = mongoose.model('LabResult', labResultSchema);
