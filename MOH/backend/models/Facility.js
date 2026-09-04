const mongoose = require('mongoose');
const { Schema } = mongoose;

const facilitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, trim: true, uppercase: true }, // e.g. "SL-WA-CONNAUGHT"
    province: { type: String, trim: true }, // one of constants/sierraLeoneAdmin.js ALL_PROVINCES, validated at the route layer
    district: { type: String, required: true, trim: true },
    chiefdom: { type: String, trim: true },
    type: {
      type: String,
      enum: ['national_referral', 'regional', 'district', 'community_health_center', 'clinic'],
      required: true,
    },
    location: {
      latitude: Number,
      longitude: Number,
    },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // MoH super admin who onboarded it

    // Shared secret used to authenticate this facility's sync worker when
    // pushing events to the central MoH ingestion endpoint. Generated once
    // at onboarding (see routes/auth.js), rotatable by MoH super admin only.
    syncApiKeyHash: { type: String, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Facility', facilitySchema);
