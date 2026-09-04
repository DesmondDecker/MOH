const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Facility = require('../models/Facility');
const auditService = require('../services/auditService');
const bcrypt = require('bcryptjs');
const { generateTempPassword, slugifyUsername, generateSyncApiKey } = require('../services/credentialService');
const { parseCsv } = require('../services/csvService');
const { signAccessToken, signRefreshToken, signMfaToken, verifyRefreshToken, verifyMfaToken } = require('../services/tokenService');
const { authenticate, requireRole, requireSameFacility } = require('../middleware/auth');
const { loginLimiter, mfaLimiter } = require('../middleware/rateLimiters');
const twoFactorService = require('../services/twoFactorService');
const { validate } = require('../middleware/validate');
const {
  loginSchema,
  mfaCodeSchema,
  twoFactorEnableSchema,
  twoFactorSetupSchema,
  twoFactorDisableSchema,
  refreshSchema,
  changePasswordSchema,
  createFacilitySchema,
  updateFacilitySchema,
  facilityStatusSchema,
  createFacilityAdminSchema,
  createSuperAdminSchema,
  adminStatusSchema,
  staffDirectoryQuerySchema,
  createStaffSchema,
  bulkStaffSchema,
  staffStatusSchema,
  facilityIdParamSchema,
  userIdParamSchema,
  facilityAndUserIdParamSchema,
} = require('../validation/authSchemas');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post('/login', loginLimiter, validate({ body: loginSchema }), async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username: username.toLowerCase().trim() });

    // Constant-shape response whether or not the user exists, to avoid username enumeration.
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.isLocked()) {
      return res.status(423).json({ error: 'Account temporarily locked due to failed login attempts' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.status}` });
    }

    const validPassword = await user.comparePassword(password);
    if (!validPassword) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      }
      await user.save();

      await auditService.record({
        actorId: user._id,
        actorRole: user.role,
        facilityId: user.facilityId,
        action: 'login_failed',
        targetType: 'User',
        targetId: user._id,
        ...clientMeta(req),
      });

      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    await auditService.record({
      actorId: user._id,
      actorRole: user.role,
      facilityId: user.facilityId,
      action: 'login_success',
      targetType: 'User',
      targetId: user._id,
      ...clientMeta(req),
    });

    // --- 2FA branch ---
    // moh_super_admin and facility_admin MUST complete 2FA — password
    // alone never grants a session for these roles. Other roles pass
    // straight through unless they've personally opted in.
    if (user.twoFactor?.enabled) {
      const mfaToken = signMfaToken(user, 'login');
      return res.json({
        mfaRequired: true,
        mfaToken,
        user: { id: user._id, fullName: user.fullName, role: user.role },
      });
    }

    if (user.requires2FA()) {
      // Role requires 2FA but hasn't set it up yet — issue a setup-scoped
      // token instead of a real session. The frontend routes this
      // response straight into the 2FA enrollment screen; no protected
      // endpoint accepts this token except the setup ones below.
      const mfaToken = signMfaToken(user, 'setup');
      return res.json({
        twoFactorSetupRequired: true,
        mfaToken,
        user: { id: user._id, fullName: user.fullName, role: user.role },
      });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        facilityId: user.facilityId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Shared helper: verifies an mfaToken and loads its user. Returns
// { error } (already-formatted for res.status().json()) on any failure so
// every 2FA route below fails the same way rather than duplicating checks.
// ---------------------------------------------------------------------------
async function loadUserFromMfaToken(mfaToken, expectedPurpose) {
  let payload;
  try {
    payload = verifyMfaToken(mfaToken);
  } catch (err) {
    return { error: { status: 401, body: { error: 'Invalid or expired verification token' } } };
  }
  if (payload.type !== 'mfa' || payload.purpose !== expectedPurpose) {
    return { error: { status: 401, body: { error: 'Wrong token type for this step' } } };
  }

  const user = await User.findById(payload.sub).select('+twoFactor.secret +twoFactor.pendingSecret +twoFactor.backupCodeHashes');
  if (!user || user.status !== 'active') {
    return { error: { status: 401, body: { error: 'User no longer active' } } };
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    return { error: { status: 401, body: { error: 'This verification step has been invalidated, please log in again' } } };
  }

  return { user };
}

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/verify-login — second step of login when 2FA is
// already enabled. Body: { mfaToken, code } where code is either a 6-digit
// TOTP or a backup code (format XXXX-XXXXXX).
// ---------------------------------------------------------------------------
router.post('/2fa/verify-login', mfaLimiter, validate({ body: mfaCodeSchema }), async (req, res, next) => {
  try {
    const { mfaToken, code } = req.body;

    const { user, error } = await loadUserFromMfaToken(mfaToken, 'login');
    if (error) return res.status(error.status).json(error.body);

    let verified = twoFactorService.verifyToken(code, user.twoFactor.secret);
    let usedBackupCode = false;

    if (!verified && user.twoFactor.backupCodeHashes?.length) {
      const idx = await twoFactorService.findMatchingBackupCodeIndex(code, user.twoFactor.backupCodeHashes);
      if (idx !== -1) {
        verified = true;
        usedBackupCode = true;
        user.twoFactor.backupCodeHashes.splice(idx, 1); // single use — consume it
        await user.save();
      }
    }

    if (!verified) {
      await auditService.record({
        actorId: user._id,
        actorRole: user.role,
        facilityId: user.facilityId,
        action: 'login_mfa_failed',
        targetType: 'User',
        targetId: user._id,
        ...clientMeta(req),
      });
      return res.status(401).json({ error: 'Invalid verification code' });
    }

    await auditService.record({
      actorId: user._id,
      actorRole: user.role,
      facilityId: user.facilityId,
      action: usedBackupCode ? 'login_mfa_success_backup_code' : 'login_mfa_success',
      targetType: 'User',
      targetId: user._id,
      after: usedBackupCode ? { backupCodesRemaining: user.twoFactor.backupCodeHashes.length } : undefined,
      ...clientMeta(req),
    });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        facilityId: user.facilityId,
        mustChangePassword: user.mustChangePassword,
      },
      ...(usedBackupCode ? { backupCodesRemaining: user.twoFactor.backupCodeHashes.length } : {}),
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Shared helper: loads a user from a normal Bearer access token, for the
// voluntary/self-service 2FA setup path. Distinct from `authenticate`
// middleware because these routes need to accept EITHER a Bearer token OR
// a setup-scoped mfaToken, and manually chaining `authenticate` as a fake
// "next" callback would silently swallow its internal-error path (it calls
// next(err) on unexpected failures, which we must not treat as success).
// ---------------------------------------------------------------------------
async function loadUserFromBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return { error: { status: 401, body: { error: 'Missing or malformed Authorization header' } } };
  }

  let payload;
  try {
    payload = require('../services/tokenService').verifyAccessToken(token);
  } catch (err) {
    return { error: { status: 401, body: { error: 'Invalid or expired access token' } } };
  }
  if (payload.type !== 'access') {
    return { error: { status: 401, body: { error: 'Wrong token type' } } };
  }

  const user = await User.findById(payload.sub).select('+twoFactor.secret +twoFactor.pendingSecret +twoFactor.backupCodeHashes');
  if (!user || user.status !== 'active') {
    return { error: { status: 401, body: { error: 'User no longer active' } } };
  }
  if (user.tokenVersion !== payload.tokenVersion) {
    return { error: { status: 401, body: { error: 'Token has been invalidated, please log in again' } } };
  }

  return { user };
}

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/setup — begin enrollment. Accepts EITHER a setup-scoped
// mfaToken (first-time mandatory enrollment right after login) OR a normal
// Bearer access token (voluntary opt-in from a logged-in session, or an
// admin re-enrolling after a lost device via /2fa/disable then this again).
// Generates a fresh secret every call — calling it twice discards the
// previous unconfirmed secret rather than accumulating them.
// ---------------------------------------------------------------------------
router.post('/2fa/setup', validate({ body: twoFactorSetupSchema }), async (req, res, next) => {
  try {
    const result = req.body?.mfaToken
      ? await loadUserFromMfaToken(req.body.mfaToken, 'setup')
      : await loadUserFromBearer(req);

    if (result.error) return res.status(result.error.status).json(result.error.body);
    await beginSetup(result.user, req, res, next);
  } catch (err) {
    next(err);
  }
});

async function beginSetup(user, req, res, next) {
  try {
    if (user.twoFactor?.enabled) {
      return res.status(409).json({ error: '2FA is already enabled on this account. Disable it first to re-enroll.' });
    }

    const secret = twoFactorService.generateSecret();
    user.twoFactor = user.twoFactor || {};
    user.twoFactor.pendingSecret = secret;
    await user.save();

    const qrDataUrl = await twoFactorService.generateQrCodeDataUrl(user.username, secret);

    res.json({
      qrCodeDataUrl: qrDataUrl,
      manualEntryKey: secret,
      issuer: process.env.TOTP_ISSUER || 'MOH Sierra Leone',
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/enable — confirms enrollment with a code generated
// from the pendingSecret, then activates 2FA and issues backup codes
// (shown once, exactly like temporary passwords elsewhere in this file).
// Accepts the same mfaToken-or-Bearer pattern as /2fa/setup.
// ---------------------------------------------------------------------------
router.post('/2fa/enable', validate({ body: twoFactorEnableSchema }), async (req, res, next) => {
  try {
    const { code } = req.body;

    const isSetupToken = !!req.body?.mfaToken;
    const result = isSetupToken
      ? await loadUserFromMfaToken(req.body.mfaToken, 'setup')
      : await loadUserFromBearer(req);

    if (result.error) return res.status(result.error.status).json(result.error.body);
    await finishEnable(result.user, code, req, res, next, isSetupToken);
  } catch (err) {
    next(err);
  }
});

async function finishEnable(user, code, req, res, next, fromSetupToken) {
  try {
    if (!user.twoFactor?.pendingSecret) {
      return res.status(400).json({ error: 'No pending 2FA setup found — call /2fa/setup first' });
    }

    const verified = twoFactorService.verifyToken(code, user.twoFactor.pendingSecret);
    if (!verified) {
      return res.status(401).json({ error: 'Invalid code — check your authenticator app and try again' });
    }

    user.twoFactor.secret = user.twoFactor.pendingSecret;
    user.twoFactor.pendingSecret = undefined;
    user.twoFactor.enabled = true;
    user.twoFactor.enabledAt = new Date();

    const { plainCodes, hashes } = await twoFactorService.generateBackupCodes();
    user.twoFactor.backupCodeHashes = hashes;
    user.twoFactor.backupCodesGeneratedAt = new Date();

    await user.save();

    await auditService.record({
      actorId: user._id,
      actorRole: user.role,
      facilityId: user.facilityId,
      action: '2fa_enabled',
      targetType: 'User',
      targetId: user._id,
      ...clientMeta(req),
    });

    // If this enrollment happened via a setup-scoped mfaToken (mandatory
    // first-login flow), the user still needs real session tokens to
    // proceed — they never got any from /login in that path.
    const sessionTokens = fromSetupToken
      ? { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) }
      : {};

    res.json({
      message: '2FA enabled',
      backupCodes: plainCodes, // shown once — the frontend must prompt the user to save these
      ...sessionTokens,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        facilityId: user.facilityId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/disable — requires current password AND a valid code,
// so neither a stolen password nor a stolen/unlocked phone alone is enough
// to turn off 2FA protection.
// ---------------------------------------------------------------------------
router.post('/2fa/disable', authenticate, validate({ body: twoFactorDisableSchema }), async (req, res, next) => {
  try {
    const { password, code } = req.body;

    const user = await User.findById(req.user.id).select('+twoFactor.secret +twoFactor.backupCodeHashes');
    if (!user.twoFactor?.enabled) return res.status(400).json({ error: '2FA is not enabled on this account' });

    const validPassword = await user.comparePassword(password);
    if (!validPassword) return res.status(401).json({ error: 'Incorrect password' });

    let verified = twoFactorService.verifyToken(code, user.twoFactor.secret);
    if (!verified && user.twoFactor.backupCodeHashes?.length) {
      const idx = await twoFactorService.findMatchingBackupCodeIndex(code, user.twoFactor.backupCodeHashes);
      verified = idx !== -1;
    }
    if (!verified) return res.status(401).json({ error: 'Invalid verification code' });

    user.twoFactor = { enabled: false };
    user.tokenVersion += 1; // invalidate outstanding sessions — disabling 2FA is a material security downgrade
    await user.save();

    await auditService.record({
      actorId: user._id,
      actorRole: user.role,
      facilityId: user.facilityId,
      action: '2fa_disabled',
      targetType: 'User',
      targetId: user._id,
      ...clientMeta(req),
    });

    res.json({ message: '2FA disabled. You will need to log in again.' });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/2fa/backup-codes/regenerate — invalidates all existing
// backup codes and issues a fresh set. Requires password + a valid code,
// same reasoning as /disable.
// ---------------------------------------------------------------------------
router.post('/2fa/backup-codes/regenerate', authenticate, validate({ body: twoFactorDisableSchema }), async (req, res, next) => {
  try {
    const { password, code } = req.body;

    const user = await User.findById(req.user.id).select('+twoFactor.secret +twoFactor.backupCodeHashes');
    if (!user.twoFactor?.enabled) return res.status(400).json({ error: '2FA is not enabled on this account' });

    const validPassword = await user.comparePassword(password);
    if (!validPassword) return res.status(401).json({ error: 'Incorrect password' });

    let verified = twoFactorService.verifyToken(code, user.twoFactor.secret);
    if (!verified && user.twoFactor.backupCodeHashes?.length) {
      const idx = await twoFactorService.findMatchingBackupCodeIndex(code, user.twoFactor.backupCodeHashes);
      verified = idx !== -1;
    }
    if (!verified) return res.status(401).json({ error: 'Invalid verification code' });

    const { plainCodes, hashes } = await twoFactorService.generateBackupCodes();
    user.twoFactor.backupCodeHashes = hashes;
    user.twoFactor.backupCodesGeneratedAt = new Date();
    await user.save();

    await auditService.record({
      actorId: user._id,
      actorRole: user.role,
      facilityId: user.facilityId,
      action: '2fa_backup_codes_regenerated',
      targetType: 'User',
      targetId: user._id,
      ...clientMeta(req),
    });

    res.json({ backupCodes: plainCodes });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/2fa/status — lets the frontend show current 2FA state
// (enabled/disabled, backup codes remaining) in a settings screen.
// ---------------------------------------------------------------------------
router.get('/2fa/status', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+twoFactor.backupCodeHashes');
    res.json({
      enabled: !!user.twoFactor?.enabled,
      required: user.requires2FA(),
      enabledAt: user.twoFactor?.enabledAt || null,
      backupCodesRemaining: user.twoFactor?.backupCodeHashes?.length || 0,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/refresh
// ---------------------------------------------------------------------------
router.post('/refresh', validate({ body: refreshSchema }), async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'User no longer active' });
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: 'Refresh token has been invalidated' });
    }

    const accessToken = signAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password  (self-service, only for own account)
// ---------------------------------------------------------------------------
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    const validCurrent = await user.comparePassword(currentPassword);
    if (!validCurrent) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await user.setPassword(newPassword);
    user.mustChangePassword = false;
    user.tokenVersion += 1; // invalidate any other outstanding tokens
    await user.save();

    await auditService.record({
      actorId: user._id,
      actorRole: user.role,
      facilityId: user.facilityId,
      action: 'password_changed_self',
      targetType: 'User',
      targetId: user._id,
      ...clientMeta(req),
    });

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    res.json({ message: 'Password changed', accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/facilities/directory — minimal facility list for cross-facility
// workflows (e.g. picking a source facility for a transfer request). Exposes
// only non-sensitive fields — no sync keys, no admin details.
// ---------------------------------------------------------------------------
router.get(
  '/facilities/directory',
  authenticate,
  requireRole('facility_admin', 'moh_super_admin'),
  async (req, res, next) => {
    try {
      const facilities = await Facility.find({ status: 'active' }).select('name code district type');
      res.json(facilities);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/facilities  (MoH super admin onboards a new hospital + its admin)
// ---------------------------------------------------------------------------
router.post('/facilities', authenticate, requireRole('moh_super_admin'), validate({ body: createFacilitySchema }), async (req, res, next) => {
  try {
    const { name, code, province, district, chiefdom, type, location, adminFullName, adminEmail } = req.body;

    const existing = await Facility.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(409).json({ error: 'A facility with this code already exists' });
    }

    const syncApiKey = generateSyncApiKey();
    const syncApiKeyHash = await bcrypt.hash(syncApiKey, 12);

    const facility = await Facility.create({
      name,
      code: code.toUpperCase(),
      province,
      district,
      chiefdom,
      type,
      location,
      createdBy: req.user.id,
      syncApiKeyHash,
    });

    const tempPassword = generateTempPassword();
    const username = slugifyUsername(adminFullName, facility.code);

    const admin = new User({
      facilityId: facility._id,
      role: 'facility_admin',
      fullName: adminFullName,
      email: adminEmail,
      username,
      mustChangePassword: true,
      createdBy: req.user.id,
    });
    await admin.setPassword(tempPassword);
    await admin.save();

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: facility._id,
      action: 'facility_onboarded',
      targetType: 'Facility',
      targetId: facility._id,
      after: { name: facility.name, code: facility.code, district: facility.district },
      ...clientMeta(req),
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: facility._id,
      action: 'user_created',
      targetType: 'User',
      targetId: admin._id,
      after: { role: admin.role, username: admin.username },
      ...clientMeta(req),
    });

    res.status(201).json({
      facility,
      facilityAdmin: {
        id: admin._id,
        username: admin.username,
        temporaryPassword: tempPassword, // returned once only — admin must relay it securely
        mustChangePassword: true,
      },
      // Returned once only — this is the only time the plaintext key is
      // available. Whoever configures this facility's local sync worker
      // needs it in the worker's env config; it cannot be retrieved again
      // (only rotated, via a future reset-sync-key endpoint).
      syncApiKey,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/facility/:facilityId/staff — list staff for the admin roster view
// ---------------------------------------------------------------------------
router.get(
  '/facility/:facilityId/staff',
  authenticate,
  requireRole('facility_admin'),
  validate({ params: facilityIdParamSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const staff = await User.find({ facilityId: req.params.facilityId, role: { $ne: 'facility_admin' } })
        .select('fullName username role status mustChangePassword lastLogin createdAt')
        .sort({ createdAt: -1 });
      res.json(staff);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/facility/:facilityId/staff  (facility admin registers a doctor/staff member)
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/staff',
  authenticate,
  requireRole('facility_admin'),
  validate({ params: facilityIdParamSchema, body: createStaffSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { fullName, email, role } = req.body;

      const facility = await Facility.findById(req.params.facilityId);
      if (!facility) return res.status(404).json({ error: 'Facility not found' });

      const tempPassword = generateTempPassword();
      const username = slugifyUsername(fullName, facility.code);

      const staff = new User({
        facilityId: facility._id,
        role,
        fullName,
        email,
        username,
        mustChangePassword: true,
        createdBy: req.user.id,
      });
      await staff.setPassword(tempPassword);
      await staff.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: facility._id,
        action: 'user_created',
        targetType: 'User',
        targetId: staff._id,
        after: { role: staff.role, username: staff.username },
        ...clientMeta(req),
      });

      res.status(201).json({
        id: staff._id,
        username: staff.username,
        role: staff.role,
        temporaryPassword: tempPassword,
        mustChangePassword: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/facility/:facilityId/staff/bulk — bulk staff onboarding via CSV.
// Body: { csv: "fullName,role,email\nJohn Doe,doctor,john@example.com\n..." }
// (raw CSV text, not a multipart file upload — the frontend reads the
// chosen file client-side with FileReader and posts its text content, which
// avoids pulling in multipart-parsing middleware for something this small.)
// Expected headers: fullName, role, email (email optional).
//
// Each row is processed independently — one bad row (missing name, invalid
// role) does not block the rest of the batch — and the response lists a
// per-row result so the admin can see exactly what to fix and re-upload
// just the failed rows, rather than guessing why a whole batch failed.
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/staff/bulk',
  authenticate,
  requireRole('facility_admin'),
  validate({ params: facilityIdParamSchema, body: bulkStaffSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { csv } = req.body;

      const allowedStaffRoles = ['doctor', 'pharmacist', 'nurse', 'store_officer', 'chw'];
      const MAX_ROWS = 500; // sane cap for a single onboarding batch, not a hard system limit

      const facility = await Facility.findById(req.params.facilityId);
      if (!facility) return res.status(404).json({ error: 'Facility not found' });

      const rows = parseCsv(csv);
      if (rows.length === 0) {
        return res.status(400).json({ error: 'No data rows found in the CSV' });
      }
      if (rows.length > MAX_ROWS) {
        return res.status(400).json({ error: `CSV has ${rows.length} rows; the limit per upload is ${MAX_ROWS}.` });
      }

      const results = [];
      let createdCount = 0;

      for (let i = 0; i < rows.length; i++) {
        const rowNumber = i + 2; // +1 for the header row, +1 for 1-indexing in what the admin sees in their spreadsheet
        const row = rows[i];
        // Accept a couple of common header spellings rather than forcing an
        // exact casing/naming match — this is a form filled in by hand in a
        // spreadsheet, not an API contract.
        const fullName = (row.fullName || row.FullName || row.name || row.Name || '').trim();
        const role = (row.role || row.Role || '').trim().toLowerCase();
        const email = (row.email || row.Email || '').trim() || undefined;

        if (!fullName) {
          results.push({ row: rowNumber, status: 'error', error: 'fullName is required' });
          continue;
        }
        if (!allowedStaffRoles.includes(role)) {
          results.push({
            row: rowNumber,
            status: 'error',
            fullName,
            error: `role must be one of: ${allowedStaffRoles.join(', ')} (got "${row.role || row.Role || ''}")`,
          });
          continue;
        }

        try {
          const tempPassword = generateTempPassword();
          const username = slugifyUsername(fullName, facility.code);

          const staff = new User({
            facilityId: facility._id,
            role,
            fullName,
            email,
            username,
            mustChangePassword: true,
            createdBy: req.user.id,
          });
          await staff.setPassword(tempPassword);
          await staff.save();

          await auditService.record({
            actorId: req.user.id,
            actorRole: req.user.role,
            facilityId: facility._id,
            action: 'user_created',
            targetType: 'User',
            targetId: staff._id,
            after: { role: staff.role, username: staff.username, source: 'bulk_csv' },
            ...clientMeta(req),
          });

          results.push({
            row: rowNumber,
            status: 'created',
            fullName: staff.fullName,
            username: staff.username,
            role: staff.role,
            temporaryPassword: tempPassword,
          });
          createdCount++;
        } catch (rowErr) {
          // A per-row failure (e.g. a DB validation error) must not abort
          // the rest of the batch — record it and keep going.
          results.push({ row: rowNumber, status: 'error', fullName, error: rowErr.message });
        }
      }

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: facility._id,
        action: 'bulk_staff_onboarded',
        targetType: 'Facility',
        targetId: facility._id,
        after: { attempted: rows.length, created: createdCount, failed: rows.length - createdCount },
        ...clientMeta(req),
      });

      // 207 Multi-Status: this is neither a clean success nor a clean
      // failure when some rows succeed and others don't. fetch() treats
      // 207 as res.ok, so the frontend gets the full per-row breakdown
      // rather than the request throwing on a partial failure.
      res.status(207).json({
        attempted: rows.length,
        created: createdCount,
        failed: rows.length - createdCount,
        results,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/facility/:facilityId/staff/:userId/reset-credentials
// Facility admin resets a staff member's password. Staff have NO self-service reset.
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/staff/:userId/reset-credentials',
  authenticate,
  requireRole('facility_admin'),
  validate({ params: facilityAndUserIdParamSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const target = await User.findOne({ _id: req.params.userId, facilityId: req.params.facilityId });
      if (!target) return res.status(404).json({ error: 'Staff member not found in this facility' });

      if (target.role === 'facility_admin') {
        return res.status(403).json({
          error: 'Facility admins cannot reset other facility admin accounts; escalate to MoH super admin',
        });
      }

      const tempPassword = generateTempPassword();
      await target.setPassword(tempPassword);
      target.mustChangePassword = true;
      target.tokenVersion += 1; // invalidates all existing sessions immediately
      target.credentialsResetBy = req.user.id;
      target.credentialsResetAt = new Date();
      target.failedLoginAttempts = 0;
      target.lockedUntil = undefined;
      await target.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: target.facilityId,
        action: 'credentials_reset',
        targetType: 'User',
        targetId: target._id,
        ...clientMeta(req),
      });

      res.json({
        id: target._id,
        username: target.username,
        temporaryPassword: tempPassword,
        mustChangePassword: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/facility-admins/:userId/reset-credentials
// ONLY MoH super admin can reset a facility admin's own credentials — closes
// the single-point-of-failure gap flagged during design.
// ---------------------------------------------------------------------------
router.post(
  '/facility-admins/:userId/reset-credentials',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: userIdParamSchema }),
  async (req, res, next) => {
    try {
      const target = await User.findOne({ _id: req.params.userId, role: 'facility_admin' });
      if (!target) return res.status(404).json({ error: 'Facility admin not found' });

      const tempPassword = generateTempPassword();
      await target.setPassword(tempPassword);
      target.mustChangePassword = true;
      target.tokenVersion += 1;
      target.credentialsResetBy = req.user.id;
      target.credentialsResetAt = new Date();
      target.failedLoginAttempts = 0;
      target.lockedUntil = undefined;
      await target.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: target.facilityId,
        action: 'credentials_reset',
        targetType: 'User',
        targetId: target._id,
        ...clientMeta(req),
      });

      res.json({
        id: target._id,
        username: target.username,
        temporaryPassword: tempPassword,
        mustChangePassword: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/staff/:userId/suspend  (facility admin suspends/reactivates own staff)
// ---------------------------------------------------------------------------
router.post(
  '/facility/:facilityId/staff/:userId/status',
  authenticate,
  requireRole('facility_admin'),
  validate({ params: facilityAndUserIdParamSchema, body: staffStatusSchema }),
  requireSameFacility,
  async (req, res, next) => {
    try {
      const { status } = req.body;

      const target = await User.findOne({ _id: req.params.userId, facilityId: req.params.facilityId });
      if (!target) return res.status(404).json({ error: 'Staff member not found in this facility' });
      if (target.role === 'facility_admin') {
        return res.status(403).json({ error: 'Cannot change status of another facility admin' });
      }

      const before = { status: target.status };
      target.status = status;
      target.tokenVersion += 1; // kill active sessions immediately on suspend
      await target.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: target.facilityId,
        action: 'user_status_changed',
        targetType: 'User',
        targetId: target._id,
        before,
        after: { status: target.status },
        ...clientMeta(req),
      });

      res.json({ id: target._id, status: target.status });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/auth/facilities/:facilityId — edit hospital details
// ---------------------------------------------------------------------------
router.patch(
  '/facilities/:facilityId',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: facilityIdParamSchema, body: updateFacilitySchema }),
  async (req, res, next) => {
    try {
      const facility = await Facility.findById(req.params.facilityId);
      if (!facility) return res.status(404).json({ error: 'Facility not found' });

      const editableFields = ['name', 'province', 'district', 'chiefdom', 'type', 'location'];
      const before = {};
      const after = {};
      for (const field of editableFields) {
        if (req.body[field] !== undefined) {
          before[field] = facility[field];
          facility[field] = req.body[field];
          after[field] = req.body[field];
        }
      }
      await facility.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: facility._id,
        action: 'facility_updated',
        targetType: 'Facility',
        targetId: facility._id,
        before,
        after,
        ...clientMeta(req),
      });

      res.json(facility);
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/facilities/:facilityId/status — suspend/reactivate a hospital.
// Suspending a facility does NOT touch its staff's individual accounts —
// see the frontend/authorization layer for how a suspended facility's
// staff are blocked at login instead; this endpoint only flips the
// facility's own status flag and leaves an audit trail.
// ---------------------------------------------------------------------------
router.post(
  '/facilities/:facilityId/status',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: facilityIdParamSchema, body: facilityStatusSchema }),
  async (req, res, next) => {
    try {
      const { status } = req.body;
      const facility = await Facility.findById(req.params.facilityId);
      if (!facility) return res.status(404).json({ error: 'Facility not found' });

      const before = { status: facility.status };
      facility.status = status;
      await facility.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: facility._id,
        action: 'facility_status_changed',
        targetType: 'Facility',
        targetId: facility._id,
        before,
        after: { status: facility.status },
        ...clientMeta(req),
      });

      res.json({ id: facility._id, status: facility.status });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/facilities/:facilityId/sync-key/rotate — rotates a
// facility's sync API key. The old key stops working the instant this
// runs (only the new hash is stored) — whoever configures that facility's
// local sync worker needs the new plaintext key, returned once here and
// never retrievable again afterward.
// ---------------------------------------------------------------------------
router.post(
  '/facilities/:facilityId/sync-key/rotate',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: facilityIdParamSchema }),
  async (req, res, next) => {
    try {
      const facility = await Facility.findById(req.params.facilityId);
      if (!facility) return res.status(404).json({ error: 'Facility not found' });

      const syncApiKey = generateSyncApiKey();
      facility.syncApiKeyHash = await bcrypt.hash(syncApiKey, 12);
      await facility.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: facility._id,
        action: 'facility_sync_key_rotated',
        targetType: 'Facility',
        targetId: facility._id,
        ...clientMeta(req),
      });

      res.json({ id: facility._id, syncApiKey });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/facilities/:facilityId/admin — create a facility_admin for
// an EXISTING hospital. Distinct from the auto-created admin in POST
// /facilities (onboarding a brand-new hospital) — this covers adding a
// second admin, replacing one, or setting one up on a facility that was
// bulk-imported without one.
// ---------------------------------------------------------------------------
router.post(
  '/facilities/:facilityId/admin',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: facilityIdParamSchema, body: createFacilityAdminSchema }),
  async (req, res, next) => {
    try {
      const { fullName, email } = req.body;

      const facility = await Facility.findById(req.params.facilityId);
      if (!facility) return res.status(404).json({ error: 'Facility not found' });

      const tempPassword = generateTempPassword();
      const username = slugifyUsername(fullName, facility.code);

      const admin = new User({
        facilityId: facility._id,
        role: 'facility_admin',
        fullName,
        email,
        username,
        mustChangePassword: true,
        createdBy: req.user.id,
      });
      await admin.setPassword(tempPassword);
      await admin.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: facility._id,
        action: 'user_created',
        targetType: 'User',
        targetId: admin._id,
        after: { role: admin.role, username: admin.username },
        ...clientMeta(req),
      });

      res.status(201).json({
        id: admin._id,
        username: admin.username,
        temporaryPassword: tempPassword,
        mustChangePassword: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/super-admins — create an additional MoH super admin.
// ---------------------------------------------------------------------------
router.post(
  '/super-admins',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ body: createSuperAdminSchema }),
  async (req, res, next) => {
    try {
      const { fullName, email } = req.body;

      const tempPassword = generateTempPassword();
      const username = slugifyUsername(fullName, 'moh');

      const admin = new User({
        role: 'moh_super_admin',
        fullName,
        email,
        username,
        mustChangePassword: true,
        createdBy: req.user.id,
      });
      await admin.setPassword(tempPassword);
      await admin.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'user_created',
        targetType: 'User',
        targetId: admin._id,
        after: { role: admin.role, username: admin.username },
        ...clientMeta(req),
      });

      res.status(201).json({
        id: admin._id,
        username: admin.username,
        temporaryPassword: tempPassword,
        mustChangePassword: true,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/super-admins/:userId/status — suspend/reactivate/revoke a
// MoH super admin. Two safeguards enforced here, since this is the one
// role with no one above it to fix a mistake:
//   1. Can't act on your own account (locking yourself out has no recovery
//      path except another super admin — but you might be the only one
//      still in the tool at the moment you'd make this mistake).
//   2. Can't leave zero ACTIVE super admins in the system.
//
// NOTE on #2's actual reach: because `authenticate` middleware already
// requires the ACTOR to have status 'active' to get this far, and #1
// blocks the actor from targeting themselves, the actor is always a
// distinct, currently-active admin — which means "active admins excluding
// the target" can never be 0 through this endpoint as it exists today; the
// actor themselves is always in that count. #2 is genuine defense-in-depth
// (it protects against a future change — e.g. a bulk-suspend endpoint, or
// removing #1 — reopening this path) rather than a currently-reachable
// safeguard on its own. Left in deliberately rather than removed as
// "dead code", since the cost of keeping a correct-but-currently-redundant
// check is a few lines, and the cost of a real future lockout is not.
// ---------------------------------------------------------------------------
router.post(
  '/super-admins/:userId/status',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: userIdParamSchema, body: adminStatusSchema }),
  async (req, res, next) => {
    try {
      const { status } = req.body;

      // req.user.id is a Mongoose ObjectId (set in middleware/auth.js),
      // not a string — comparing it directly against req.params.userId
      // (always a string from the URL) with === would silently NEVER
      // match, since the types differ, which would make this guard a
      // no-op that appears to protect against self-action but doesn't.
      if (req.params.userId === req.user.id.toString()) {
        return res.status(403).json({ error: 'Cannot change the status of your own account' });
      }

      const target = await User.findOne({ _id: req.params.userId, role: 'moh_super_admin' });
      if (!target) return res.status(404).json({ error: 'MoH super admin not found' });

      if (status !== 'active' && target.status === 'active') {
        const otherActiveCount = await User.countDocuments({
          role: 'moh_super_admin',
          status: 'active',
          _id: { $ne: target._id },
        });
        if (otherActiveCount === 0) {
          return res.status(409).json({ error: 'Cannot leave zero active MoH super admins — create another first' });
        }
      }

      const before = { status: target.status };
      target.status = status;
      target.tokenVersion += 1; // kill active sessions immediately
      await target.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        action: 'user_status_changed',
        targetType: 'User',
        targetId: target._id,
        before,
        after: { status: target.status },
        ...clientMeta(req),
      });

      res.json({ id: target._id, status: target.status });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/auth/facility-admins/:userId/status — suspend/reactivate/revoke
// a facility admin. MoH-level counterpart to the facility-scoped
// /facility/:facilityId/staff/:userId/status route above, which explicitly
// refuses to touch another facility_admin — this is that escalation path.
// ---------------------------------------------------------------------------
router.post(
  '/facility-admins/:userId/status',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: userIdParamSchema, body: adminStatusSchema }),
  async (req, res, next) => {
    try {
      const { status } = req.body;

      const target = await User.findOne({ _id: req.params.userId, role: 'facility_admin' });
      if (!target) return res.status(404).json({ error: 'Facility admin not found' });

      const before = { status: target.status };
      target.status = status;
      target.tokenVersion += 1;
      await target.save();

      await auditService.record({
        actorId: req.user.id,
        actorRole: req.user.role,
        facilityId: target.facilityId,
        action: 'user_status_changed',
        targetType: 'User',
        targetId: target._id,
        before,
        after: { status: target.status },
        ...clientMeta(req),
      });

      res.json({ id: target._id, status: target.status });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/auth/staff/directory — searchable, filterable staff directory
// across ALL facilities. MoH super admin only — this is exactly the kind
// of cross-facility roster a facility admin has no legitimate need (or
// authorization) to see.
// ---------------------------------------------------------------------------
router.get(
  '/staff/directory',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ query: staffDirectoryQuerySchema }),
  async (req, res, next) => {
    try {
      const { role, facilityId, district, province, status, search, limit = 50, skip = 0 } = req.query;

      const filter = {};
      if (role) filter.role = role;
      if (facilityId) filter.facilityId = facilityId;
      if (status) filter.status = status;
      if (search) {
        filter.$or = [
          { fullName: new RegExp(search, 'i') },
          { username: new RegExp(search, 'i') },
          { email: new RegExp(search, 'i') },
        ];
      }

      // district/province filter through Facility, not User (User has no
      // district of its own — it's implied by which facility someone
      // belongs to) — resolve matching facility IDs first, then narrow.
      if (district || province) {
        const facilityFilter = {};
        if (district) facilityFilter.district = district;
        if (province) facilityFilter.province = province;
        const matchingFacilities = await Facility.find(facilityFilter).select('_id').lean();
        const matchingIds = matchingFacilities.map((f) => f._id.toString());

        if (filter.facilityId) {
          // A specific facilityId was also requested — only keep it if it's
          // actually within the district/province filter, otherwise use an
          // always-empty $in (NOT `null`, which Mongo would treat as
          // matching users with no facilityId at all, like moh_super_admin
          // accounts — the opposite of "no results" here).
          filter.facilityId = matchingIds.includes(filter.facilityId) ? filter.facilityId : { $in: [] };
        } else {
          filter.facilityId = { $in: matchingIds };
        }
      }

      const [entries, total] = await Promise.all([
        User.find(filter)
          .select('fullName username email role status facilityId lastLogin createdAt')
          .populate('facilityId', 'name code district province type')
          .sort({ fullName: 1 })
          .skip(skip)
          .limit(limit),
        User.countDocuments(filter),
      ]);

      res.json({ entries, total, limit, skip });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/auth/users/:userId — per-staff detail view: status, last login,
// who created the account, credential-reset history, lock state. MoH
// super admin only — facility admins already get an equivalent view
// scoped to their own facility via GET /facility/:facilityId/staff.
// ---------------------------------------------------------------------------
router.get(
  '/users/:userId',
  authenticate,
  requireRole('moh_super_admin'),
  validate({ params: userIdParamSchema }),
  async (req, res, next) => {
    try {
      const target = await User.findById(req.params.userId)
        .populate('facilityId', 'name code district province type status')
        .populate('createdBy', 'fullName username role')
        .populate('credentialsResetBy', 'fullName username role');

      if (!target) return res.status(404).json({ error: 'User not found' });

      res.json({
        id: target._id,
        fullName: target.fullName,
        username: target.username,
        email: target.email,
        role: target.role,
        status: target.status,
        facility: target.facilityId,
        mustChangePassword: target.mustChangePassword,
        lastLogin: target.lastLogin,
        failedLoginAttempts: target.failedLoginAttempts,
        isLocked: target.isLocked(),
        lockedUntil: target.lockedUntil,
        twoFactorEnabled: !!target.twoFactor?.enabled,
        createdBy: target.createdBy,
        createdAt: target.createdAt,
        credentialsResetBy: target.credentialsResetBy,
        credentialsResetAt: target.credentialsResetAt,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
