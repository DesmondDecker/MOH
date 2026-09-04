const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;
const { encryptedField } = require('../utils/encryptedField');

const ROLES = ['moh_super_admin', 'facility_admin', 'doctor', 'pharmacist', 'nurse', 'store_officer', 'chw'];

// TOTP 2FA is MANDATORY for these roles — they can create/reset staff
// credentials and onboard entire facilities, so a compromised password
// alone must not be enough to act as them. Other roles may opt in
// voluntarily but are not blocked from logging in without it.
const ROLES_REQUIRING_2FA = ['moh_super_admin', 'facility_admin'];

const userSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: 'Facility',
      required: function () {
        return this.role !== 'moh_super_admin';
      },
    },
    role: { type: String, enum: ROLES, required: true },
    fullName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },

    mustChangePassword: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'suspended', 'revoked'], default: 'active' },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    credentialsResetBy: { type: Schema.Types.ObjectId, ref: 'User' },
    credentialsResetAt: { type: Date },

    lastLogin: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },

    // Incremented on password change / reset / suspend to invalidate outstanding refresh tokens
    tokenVersion: { type: Number, default: 0 },

    // --- TOTP 2FA ---
    // secret is encrypted at rest (it's a credential, not just data) using
    // the same field-level encryption as PII/PHI (services/encryptionService.js).
    // pendingSecret holds a freshly-generated secret during setup, before
    // the user has proven possession of it with a correct code — it only
    // gets promoted to `secret` on a successful /2fa/enable call, so a
    // setup flow abandoned halfway never silently activates 2FA with a
    // secret the user never actually confirmed.
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: encryptedField({ select: false }),
      pendingSecret: encryptedField({ select: false }),
      enabledAt: { type: Date },
      // One-time backup codes for when the authenticator device is lost.
      // Stored bcrypt-hashed, never plaintext — same treatment as a
      // password, since each one IS a full login credential.
      backupCodeHashes: [{ type: String, select: false }],
      backupCodesGeneratedAt: { type: Date },
    },
  },
  { timestamps: true, toJSON: { getters: true }, toObject: { getters: true } }
);

userSchema.index({ facilityId: 1, role: 1 });

userSchema.methods.setPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(12);
  this.passwordHash = await bcrypt.hash(plainPassword, salt);
};

userSchema.methods.comparePassword = function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockedUntil && this.lockedUntil > new Date());
};

userSchema.methods.requires2FA = function () {
  return ROLES_REQUIRING_2FA.includes(this.role);
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.ROLES_REQUIRING_2FA = ROLES_REQUIRING_2FA;
