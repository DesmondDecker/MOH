const { Server } = require('socket.io');
const { verifyAccessToken } = require('./tokenService');
const User = require('../models/User');

let io = null;

/**
 * Initializes the Socket.io layer on top of the existing HTTP server.
 * Auth mirrors the REST middleware.authenticate logic (same JWT, same
 * tokenVersion/status checks) so a suspended user or a stale token can't
 * keep a live connection open after their access is revoked over REST.
 */
function init(httpServer, corsOrigin) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin || '*',
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').split(' ')[1];

      if (!token) return next(new Error('Missing auth token'));

      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch (err) {
        return next(new Error('Invalid or expired access token'));
      }

      if (payload.type !== 'access') return next(new Error('Wrong token type'));

      const user = await User.findById(payload.sub);
      if (!user) return next(new Error('User no longer exists'));
      if (user.status !== 'active') return next(new Error(`Account is ${user.status}`));
      if (user.tokenVersion !== payload.tokenVersion) {
        return next(new Error('Token has been invalidated, please log in again'));
      }

      socket.user = {
        id: user._id.toString(),
        role: user.role,
        facilityId: user.facilityId ? user.facilityId.toString() : null,
      };
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    const { role, facilityId } = socket.user;

    // Facility-scoped clients (clinical/admin/pharmacy dashboards) only ever
    // get signals for their own facility, plus their role room for
    // cross-facility broadcasts (e.g. a future "system maintenance" notice).
    if (facilityId) socket.join(`facility:${facilityId}`);
    socket.join(`role:${role}`);

    // MoH super admins additionally join the global oversight room so the
    // Command Center dashboard sees activity across every facility.
    if (role === 'moh_super_admin') socket.join('moh');
  });

  return io;
}

function getIO() {
  return io;
}

/**
 * Emits a lightweight activity SIGNAL, never the underlying record — clients
 * refetch over REST when they see one. Keeps this a "refresh hint" channel
 * rather than a second, weaker-auth'd path to clinical/inventory data.
 *
 * Facility-scoped events (facilityId set) go to that facility's room AND to
 * the MoH room, since MoH oversees every facility. Facility-less events
 * (MoH-originated actions, e.g. onboarding a new facility) go to MoH only.
 */
function emitActivity({ facilityId, action, targetType, actorRole, occurredAt }) {
  if (!io) return; // socket layer not initialized (scripts, tests) — no-op, never throws

  // facilityId is always included (null for MoH-originated actions) so
  // client-side filtering is the same regardless of which room delivered it.
  const signal = { action, targetType, actorRole, occurredAt, facilityId: facilityId || null };

  if (facilityId) {
    io.to(`facility:${facilityId}`).emit('activity', signal);
    io.to('moh').emit('activity', signal);
  } else {
    io.to('moh').emit('activity', signal);
  }
}

module.exports = { init, getIO, emitActivity };
