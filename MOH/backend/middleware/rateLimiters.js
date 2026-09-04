const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP, please try again later' },
});

// Separate, tighter limiter for 2FA code submission — a 6-digit TOTP code
// has only 1,000,000 possibilities, so brute force here is a much more
// realistic threat per-attempt than a password guess. Keyed by IP; the
// mfaToken's own 5-minute expiry (services/tokenService.js) is the other
// half of this defense.
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts from this IP, please try again later' },
});

module.exports = { loginLimiter, mfaLimiter };
