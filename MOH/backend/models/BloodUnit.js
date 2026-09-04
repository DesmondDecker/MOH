const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');
const { ALL_BLOOD_TYPES, BLOOD_COMPONENTS } = require('../constants/bloodCompatibility');

/**
 * BLOOD BANK — WHY THIS IS A SEPARATE MODEL FROM InventoryItem/StockBatch
 * -------------------------------------------------------------------------
 * General drug/consumable stock (models/StockBatch.js) tracks fungible
 * quantity within a batch — 500 tablets of amoxicillin are interchangeable
 * with each other. A unit of blood is never fungible: it has ONE donor, ONE
 * blood type, and must be individually trackable from donation through
 * transfusion or discard (a full chain of custody), not just decremented
 * as a quantity. Expiry is also component-specific in a way drug expiry
 * isn't — platelets expire in 5 days at room temperature, plasma lasts a
 * year frozen, and getting that wrong is a patient-safety issue, not an
 * inventory-accuracy one. This is why blood gets its own model rather than
 * being force-fit into the general stock system.
 */
const bloodUnitSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    unitNumber: { type: String, required: true, unique: true, trim: true }, // e.g. "SL-BB-2026-000482" — the physical bag's identifier
    bloodType: { type: String, enum: ALL_BLOOD_TYPES, required: true, index: true },
    component: { type: String, enum: BLOOD_COMPONENTS, required: true },

    volumeMl: { type: Number, min: 1 },

    // Donor identity is encrypted — it's PII directly tied to a specific
    // physical blood unit, same treatment as Patient PII (see
    // models/Patient.js and services/encryptionService.js).
    donorIdNumber: encryptedField(),
    donorFullName: encryptedField(),
    donorPhone: encryptedField(),

    collectionDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true }, // computed at intake from component-specific shelf life, see services/bloodBankService.js

    screening: {
      status: { type: String, enum: ['pending', 'cleared', 'reactive'], default: 'pending', required: true },
      // Which infectious markers were screened — HIV, Hepatitis B, Hepatitis
      // C, syphilis are the WHO-recommended minimum panel for transfusion
      // safety. Stored as a checklist so a unit can't silently skip one.
      screenedFor: {
        hiv: { type: Boolean, default: false },
        hepatitisB: { type: Boolean, default: false },
        hepatitisC: { type: Boolean, default: false },
        syphilis: { type: Boolean, default: false },
      },
      screenedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      screenedAt: { type: Date },
      notes: encryptedField(),
    },

    status: {
      type: String,
      enum: ['pending_screening', 'available', 'reserved', 'transfused', 'discarded', 'expired'],
      default: 'pending_screening',
      required: true,
      index: true,
    },

    reservedForPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    reservedAt: { type: Date },
    reservedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    transfusion: {
      patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
      encounterId: { type: Schema.Types.ObjectId, ref: 'Encounter' },
      transfusedAt: { type: Date },
      transfusedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      // Crossmatch is a real, separate lab step this system does not
      // perform or simulate — this just records that staff attested to
      // having done it, same self-attestation pattern as break-glass
      // access (see Encounter.emergencyOverride). It is NOT a substitute
      // for the actual lab crossmatch procedure.
      crossmatchConfirmed: { type: Boolean, default: false },
      adverseReaction: { type: Boolean, default: false },
      reactionNotes: encryptedField(),
    },

    discard: {
      reason: { type: String, enum: ['expired', 'reactive_screening', 'damaged', 'contaminated', 'other'] },
      notes: encryptedField(),
      discardedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      discardedAt: { type: Date },
    },

    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

bloodUnitSchema.index({ facilityId: 1, status: 1, bloodType: 1, component: 1 });
bloodUnitSchema.index({ facilityId: 1, expiryDate: 1 });

bloodUnitSchema.methods.isExpired = function () {
  return this.expiryDate < new Date();
};

module.exports = mongoose.model('BloodUnit', bloodUnitSchema);
