const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');

/**
 * CORRECTION MODEL
 * -------------------------------------------------------------------------
 * Medical records should never be silently edited, even by their author.
 * Instead of an `update` that overwrites content, a correction creates a
 * NEW entry that references the original via `amendsEntryId`, and the
 * original entry gets `supersededBy` set to point forward. Both remain
 * queryable — the audit trail (via auditService) captures who amended what
 * and why, but the clinical documents themselves also preserve full history
 * independent of the audit log.
 */

const medicalHistorySchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },

    entryType: { type: String, enum: ['prescription', 'procedure', 'clinical_note'], required: true },

    // --- Prescription-specific fields ---
    prescription: {
      inventoryItemId: { type: Schema.Types.ObjectId, ref: 'InventoryItem' }, // links to inventory layer for dispense
      drugName: String, // denormalized for display even if inventoryItemId is later removed/renamed
      dosage: String, // e.g. "500mg"
      frequency: String, // e.g. "3x daily"
      durationDays: Number,
      route: { type: String, enum: ['oral', 'iv', 'im', 'topical', 'other'] },
      allergyCheckPerformed: { type: Boolean, default: false },
      allergyConflictOverridden: { type: Boolean, default: false }, // prescriber overrode an allergy alert
      overrideJustification: encryptedField(),
      dispenseStatus: { type: String, enum: ['pending', 'partially_dispensed', 'dispensed', 'cancelled'], default: 'pending' },
      // Discrete units to dispense (e.g. tablet count), as distinct from the
      // descriptive dosage/frequency/durationDays text above — this is what
      // makes "partially dispensed" a real, trackable state rather than a
      // status the pharmacist has to eyeball. Left optional so pre-existing
      // prescriptions created before this field existed don't break; the
      // dispense route falls back to its old all-at-once behavior for those
      // (see routes/inventory.js).
      quantityPrescribed: { type: Number, min: 0 },
      quantityDispensed: { type: Number, min: 0, default: 0 },
    },

    // --- Procedure-specific fields ---
    procedure: {
      name: String,
      performedAt: Date,
      outcome: String,
    },

    // --- Free-text clinical note --- encrypted at rest: this is the field
    // most likely to contain unstructured PHI (symptoms, exam findings,
    // sensitive diagnoses) typed by a clinician with no structured schema.
    note: encryptedField(),

    prescribedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // --- Correction/amendment chain ---
    amendsEntryId: { type: Schema.Types.ObjectId, ref: 'MedicalHistory', default: null },
    amendmentReason: String,
    supersededBy: { type: Schema.Types.ObjectId, ref: 'MedicalHistory', default: null },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

medicalHistorySchema.index({ patientId: 1, createdAt: -1 });
medicalHistorySchema.index({ 'prescription.dispenseStatus': 1 });

module.exports = mongoose.model('MedicalHistory', medicalHistorySchema);
