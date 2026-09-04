const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');

const visitTypeValues = [
  'immunization_outreach',
  'antenatal_followup',
  'postnatal_followup',
  'growth_monitoring',
  'disease_surveillance',
  'health_education',
  'other',
];

const dangerSignValues = [
  'severe_illness',
  'malnutrition_signs',
  'fever',
  'difficulty_breathing',
  'diarrhea_dehydration',
  'pregnancy_danger_sign',
  'newborn_danger_sign',
];

/**
 * CHW OUTREACH VISIT — OFFLINE-FIRST BY DESIGN
 * -------------------------------------------------------------------------
 * A CHW records this on a phone in the field, often with no connectivity
 * at the moment of the visit (see frontend/src/lib/offlineQueue.js — the
 * visit is written to the device's local IndexedDB queue immediately and
 * synced whenever connectivity returns, possibly hours or days later).
 *
 * `clientVisitId` IS THE CORE OF WHAT MAKES THIS SAFE TO SYNC LATE: it's a
 * UUID generated ON THE DEVICE at the moment of recording, not by this
 * server. Without it, a sync that partially succeeds and gets retried
 * (e.g. the phone loses signal mid-upload, or the CHW's app crashes and
 * retries the whole local queue on restart) would create duplicate visit
 * records server-side — there'd be no way to tell "this is the same visit
 * being resubmitted" from "this is a second, genuinely new visit". The
 * unique index on clientVisitId makes the sync route (routes/chw.js)
 * naturally idempotent: submitting the same clientVisitId twice is a
 * safe no-op, not a duplicate.
 */
const outreachVisitSchema = new Schema(
  {
    clientVisitId: { type: String, required: true, unique: true, index: true },

    chwId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    patientId: { type: Schema.Types.ObjectId, ref: 'Patient' },
    provisionalSubject: {
      fullName: encryptedField(),
      approximateAge: { type: String, trim: true },
      sex: { type: String, enum: ['male', 'female'] },
      community: { type: String, trim: true },
    },

    visitType: { type: String, enum: visitTypeValues, required: true },
    visitDate: { type: Date, required: true },

    location: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },

    findings: encryptedField(),
    dangerSignsObserved: [{ type: String, enum: dangerSignValues }],

    referralNeeded: { type: Boolean, default: false },
    referralReason: encryptedField(),
    referredToFacilityId: { type: Schema.Types.ObjectId, ref: 'Facility' },

    recordedOfflineAt: { type: Date, required: true },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

outreachVisitSchema.index({ chwId: 1, visitDate: -1 });
outreachVisitSchema.index({ facilityId: 1, referralNeeded: 1 });

module.exports = mongoose.model('OutreachVisit', outreachVisitSchema);
module.exports.visitTypeValues = visitTypeValues;
module.exports.dangerSignValues = dangerSignValues;
