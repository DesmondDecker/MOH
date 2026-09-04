const { verifyAccessToken } = require('../services/tokenService');
const User = require('../models/User');

/**
 * Verifies the JWT, loads the user, and checks tokenVersion so that a
 * password reset / suspension immediately invalidates any tokens issued
 * before it, even if they haven't expired yet.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired access token' });
    }

    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Wrong token type' });
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User no longer exists' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: `Account is ${user.status}` });
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      return res.status(401).json({ error: 'Token has been invalidated, please log in again' });
    }

    // req.user is the authoritative, server-side identity for the rest of the request.
    req.user = {
      id: user._id,
      role: user.role,
      facilityId: user.facilityId ? user.facilityId.toString() : null,
      mustChangePassword: user.mustChangePassword,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Blocks any authenticated action other than changing your own password
 * until a forced password change has been completed.
 */
function blockUntilPasswordChanged(req, res, next) {
  if (req.user.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required before continuing' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

/**
 * Ensures the acting user belongs to the facility referenced in the route
 * (req.params.facilityId). MoH super admins bypass this since they operate
 * across facilities. Never trusts a facilityId from the request body.
 */
function requireSameFacility(req, res, next) {
  if (req.user.role === 'moh_super_admin') return next();

  const routeFacilityId = req.params.facilityId;
  if (!routeFacilityId) {
    return res.status(400).json({ error: 'facilityId missing from route' });
  }

  if (!req.user.facilityId || req.user.facilityId !== routeFacilityId) {
    return res.status(403).json({ error: 'Forbidden: cross-facility access denied' });
  }

  next();
}

module.exports = { authenticate, blockUntilPasswordChanged, requireRole, requireSameFacility };
