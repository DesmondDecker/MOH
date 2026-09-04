const mongoose = require('mongoose');
const { Schema } = mongoose;

/**
 * COLD-CHAIN DEVICE
 * -------------------------------------------------------------------------
 * Represents one piece of vaccine/blood cold-chain storage equipment (a
 * fridge or freezer) at a facility, with its own IoT sensor feeding
 * readings in. Modeled separately from a generic "equipment" inventory
 * item because it has its own authentication concern (a sensor device,
 * not a logged-in person, needs to push readings — see
 * middleware/coldChainDeviceKey.js, mirroring the facility sync API-key
 * pattern in middleware/facilityApiKey.js) and its own safety-critical
 * business logic (temperature range breach detection) that a generic
 * equipment record has no need for.
 *
 * SAFE RANGE IS PER-DEVICE, NOT A HARDCODED GLOBAL CONSTANT: WHO's 2-8°C
 * standard for routine EPI refrigerated vaccines and -25°C to -15°C for
 * freezer-stored vaccines (varicella-type) are well-established defaults
 * (verified against WHO/CDC guidance), applied automatically based on
 * deviceType at registration — but stored per-device so a facility whose
 * equipment or vaccine mix genuinely differs isn't silently held to a
 * one-size-fits-all range hardcoded into application logic.
 */
const deviceTypeDefaults = {
  refrigerator: { minSafeC: 2, maxSafeC: 8 },
  freezer: { minSafeC: -25, maxSafeC: -15 },
};

const coldChainDeviceSchema = new Schema(
  {
    facilityId: { type: Schema.Types.ObjectId, ref: 'Facility', required: true, index: true },

    deviceLabel: { type: String, required: true, trim: true }, // e.g. "Vaccine fridge #1, immunization room"
    deviceType: { type: String, enum: ['refrigerator', 'freezer'], required: true },

    minSafeC: { type: Number, required: true },
    maxSafeC: { type: Number, required: true },

    apiKeyHash: { type: String, select: false }, // bcrypt hash — mirrors Facility.syncApiKeyHash, see middleware/coldChainDeviceKey.js
    status: { type: String, enum: ['active', 'inactive', 'decommissioned'], default: 'active' },

    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ColdChainDevice', coldChainDeviceSchema);
module.exports.deviceTypeDefaults = deviceTypeDefaults;
