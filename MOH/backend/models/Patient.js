const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');
const { blindIndex } = require('../services/encryptionService');

/**
 * IDENTITY STRATEGY
 * -------------------------------------------------------------------------
 * Sierra Leone has no universal, always-available national ID at point of
 * care (rural clinics, newborns, unconscious ER patients). So identity is
 * tiered rather than all-or-nothing:
 *
 *   - identityTier 'verified'    -> nationalId present and matched
 *   - identityTier 'provisional' -> registered on demographic details only
 *                                   (name, DOB, sex, next of kin, facility)
 *                                   pending later reconciliation
 *   - identityTier 'newborn'     -> created via birth registration, linked
 *                                   to mother's Patient record, no nationalId
 *                                   yet
 *
 * mrn (Medical Record Number) is OUR generated identifier and is what every
 * other collection (Encounter, MedicalHistory, StockTransaction links, etc.)
 * should reference — never rely on nationalId as a foreign key, since it's
 * sometimes absent and can be corrected/added later without changing the
 * patient's identity within the system.
 *
 * possibleDuplicates stores candidate matches surfaced by the dedup routine
 * (services/deduplicationService.js) for a human (facility admin / MoH data
 * team) to confirm or reject — this system does NOT auto-merge patient
 * records. Auto-merging clinical data is too dangerous to automate.
 */

const identityTiers = ['verified', 'provisional', 'newborn'];
const sexValues = ['male', 'female'];

/**
 * FIELD-LEVEL ENCRYPTION — WHAT'S ENCRYPTED AND WHY (AND WHAT ISN'T)
 * -------------------------------------------------------------------------
 * Direct identifiers and free-text sensitive content are encrypted at rest
 * (AES-256-GCM, see services/encryptionService.js): nationalId, phone,
 * address, nextOfKin.name/phone, and allergy substance/reaction detail.
 * A `nationalIdBlindIndex` / `phoneBlindIndex` (deterministic HMAC, not
 * reversible) is maintained alongside so exact-match lookups — used by
 * deduplicationService and staff search-by-ID/phone — still work without
 * ever running a Mongo query against plaintext or against non-deterministic
 * ciphertext.
 *
 * fullName, dateOfBirth, and sex deliberately stay in PLAINTEXT. This is a
 * considered trade-off, not an oversight: AES-GCM ciphertext is
 * non-deterministic and cannot support the text-index name search clinical
 * staff rely on to find a patient in seconds during triage, nor the
 * date-range queries the deduplication engine and growth-chart logic run
 * directly in MongoDB. Encrypting them would mean decrypting the entire
 * collection into application memory for every search — it does not scale
 * past a small pilot and would make the registry effectively unusable at
 * national volume. Defense for these two fields instead comes from
 * transport encryption, strict RBAC (routes/patients.js), immutable audit
 * logging (every read/write is attributable — see services/auditService.js
 * and models/AuditLog.js) and disk/volume-level encryption at the database
 * layer, which is the standard layered approach most national EHR/HMIS
 * deployments (DHIS2 included) use for demographic fields.
 */
const patientSchema = new Schema(
  {
    mrn: { type: String, required: true, unique: true, index: true }, // system-generated, e.g. "SL-2026-000123"

    identityTier: { type: String, enum: identityTiers, required: true, default: 'provisional' },
    nationalId: encryptedField({ trim: true }), // present only when identityTier === 'verified'
    nationalIdBlindIndex: { type: String, sparse: true, index: true, select: false },

    fullName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    dateOfBirthEstimated: { type: Boolean, default: false }, // true when DOB is approximate (common without birth records)
    sex: { type: String, enum: sexValues, required: true },

    phone: encryptedField({ trim: true }),
    phoneBlindIndex: { type: String, sparse: true, index: true, select: false },
    district: { type: String, trim: true },
    chiefdom: { type: String, trim: true },
    address: encryptedField({ trim: true }),

    nextOfKin: {
      name: encryptedField(),
      relationship: String,
      phone: encryptedField(),
    },

    motherPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' }, // set when identityTier === 'newborn'

    allergies: [
      {
        // Encrypted, but this is cheap: allergy checks only ever decrypt
        // the handful of entries belonging to the ONE patient in view
        // (routes/medicalHistory.js prescribing flow), never a
        // collection-wide query, so encryption here has no search cost.
        substance: { ...encryptedField(), required: true },
        reaction: encryptedField(),
        severity: { type: String, enum: ['mild', 'moderate', 'severe'] },
        recordedAt: { type: Date, default: Date.now },
        recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      },
    ],

    chronicConditions: [
      {
        condition: { type: String, required: true },
        diagnosedAt: Date,
        status: { type: String, enum: ['active', 'resolved', 'managed'], default: 'active' },
      },
    ],

    registeredAtFacility: { type: Schema.Types.ObjectId, ref: 'Facility', required: true },
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    possibleDuplicates: [
      {
        patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
        matchScore: Number, // 0-1, from deduplicationService
        matchedOn: [String], // e.g. ['fullName', 'dateOfBirth', 'phone']
        status: { type: String, enum: ['pending_review', 'confirmed_duplicate', 'rejected'], default: 'pending_review' },
        reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: Date,
      },
    ],

    consent: {
      dataSharingWithMoH: { type: Boolean, default: true }, // required for national reporting
      dataSharingWithThirdParties: { type: Boolean, default: false }, // NGOs/donors — opt-in only
      recordedAt: Date,
      recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },

    deceasedAt: { type: Date }, // set via death registration; null = alive
    deceasedRecordedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    status: { type: String, enum: ['active', 'merged', 'deceased'], default: 'active' },
    mergedIntoPatientId: { type: Schema.Types.ObjectId, ref: 'Patient' }, // set if status === 'merged'
  },
  {
    timestamps: true,
    // Getters must run on serialization too, or API responses would leak
    // raw AES-GCM ciphertext instead of the transparently-decrypted value.
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Support fast lookup for the dedup routine and clinical search.
// NOTE: no index on `phone` itself (encrypted, non-deterministic —
// indexing it would be useless); phoneBlindIndex above is what's actually
// queried for exact-match lookups.
patientSchema.index({ fullName: 'text' });
patientSchema.index({ dateOfBirth: 1, sex: 1 });

// Recompute blind indexes whenever the underlying plaintext changes so
// exact-match lookups (dedup, staff search-by-ID/phone) stay in sync with
// the encrypted value. Reads `this.nationalId`/`this.phone` through their
// getters (already-decrypted plaintext) rather than the raw stored path.
patientSchema.pre('save', function (next) {
  if (this.isModified('nationalId')) {
    this.nationalIdBlindIndex = blindIndex(this.nationalId);
  }
  if (this.isModified('phone')) {
    this.phoneBlindIndex = blindIndex(this.phone);
  }
  next();
});

patientSchema.methods.isAlive = function () {
  return this.status !== 'deceased' && !this.deceasedAt;
};

module.exports = mongoose.model('Patient', patientSchema);
module.exports.identityTiers = identityTiers;
