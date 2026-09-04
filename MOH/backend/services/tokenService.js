const jwt = require('jsonwebtoken');

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      facilityId: user.facilityId ? user.facilityId.toString() : null,
      tokenVersion: user.tokenVersion,
      type: 'access',
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tokenVersion: user.tokenVersion,
      type: 'refresh',
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

/**
 * Issued after password verification succeeds but before 2FA code
 * verification completes. Deliberately signed with a SEPARATE secret from
 * access/refresh tokens and carries no role/facility claims an
 * authorization check could mistake for a real session — it is only ever
 * accepted by POST /api/auth/2fa/verify-login and POST /api/auth/2fa/setup-verify.
 */
function signMfaToken(user, purpose) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      tokenVersion: user.tokenVersion,
      purpose, // 'login' | 'setup' — which flow this token is valid for
      type: 'mfa',
    },
    process.env.JWT_MFA_SECRET,
    { expiresIn: process.env.JWT_MFA_EXPIRES_IN || '5m' }
  );
}

function verifyMfaToken(token) {
  return jwt.verify(token, process.env.JWT_MFA_SECRET);
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  signMfaToken,
  verifyAccessToken,
  verifyRefreshToken,
  verifyMfaToken,
};
