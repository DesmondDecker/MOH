const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');

const encounterSchema = new Schema(
  {
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    type: {
      type: String,
      enum: ['outpatient', 'inpatient_admission', 'emergency', 'antenatal', 'immunization', 'referral_in'],
      required: true,
    },

    // Break-glass emergency access support: if this encounter was created/accessed
    // under an emergency override rather than normal permission flow.
    emergencyOverride: {
      used: { type: Boolean, default: false },
      justification: encryptedField(),
      authorizedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // self-attested in true emergencies, reviewed after
      // --- Post-hoc review, by a facility admin or MoH super admin ---
      // This is what makes "self-attested in true emergencies" an
      // acceptable trade-off rather than an unaudited loophole: every
      // break-glass access is expected to be reviewed after the fact by
      // someone who wasn't the one who used it.
      reviewed: { type: Boolean, default: false },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: { type: Date },
      reviewOutcome: { type: String, enum: ['appropriate', 'inappropriate', 'needs_followup'] },
      reviewNotes: encryptedField(),
    },

    attendingProviderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    chiefComplaint: encryptedField(),
    vitals: {
      temperatureC: Number,
      bloodPressureSystolic: Number,
      bloodPressureDiastolic: Number,
      heartRateBpm: Number,
      respiratoryRate: Number,
      oxygenSaturation: Number,
      weightKg: Number,
      heightCm: Number,
      recordedAt: { type: Date, default: Date.now },
    },

    diagnosis: [
      {
        // Encrypted: the free-text diagnosis description is PHI tied to an
        // identified patient. icd10Code stays PLAINTEXT deliberately —
        // it's a coded, non-identifying vocabulary value, and it is what
        // /api/moh/surveillance/notifiable-diseases now groups by instead
        // of the old free-text description (see routes/moh.js), so
        // population-level disease surveillance keeps working after
        // encryption without ever aggregating over ciphertext. This also
        // doubles as the FHIR Condition.code groundwork the interoperability
        // layer will need.
        description: { ...encryptedField(), required: true },
        icd10Code: String,
        isNotifiableDisease: { type: Boolean, default: false }, // triggers surveillance flag, see MedicalHistory notifiable-disease hook
        isPrimary: { type: Boolean, default: false },
      },
    ],

    notes: encryptedField(),

    referral: {
      referredToFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility' },
      referredFromFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility' },
      reason: encryptedField(),
      urgency: { type: String, enum: ['routine', 'urgent', 'emergency'] },
    },

    status: { type: String, enum: ['open', 'closed', 'transferred'], default: 'open' },
    admittedAt: { type: Date, default: Date.now },
    dischargedAt: { type: Date },

    // Discharge summary export target — populated by the doc-export service, not the client.
    dischargeSummaryGeneratedAt: { type: Date },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

encounterSchema.index({ patientId: 1, admittedAt: -1 });
encounterSchema.index({ facilityId: 1, status: 1 });
encounterSchema.index({ 'diagnosis.isNotifiableDisease': 1 });

module.exports = mongoose.model('Encounter', encounterSchema);
