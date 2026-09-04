import { io } from 'socket.io-client';
import { getAccessToken } from './api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

let socket = null;
let connected = false;
const listeners = new Set();
const statusListeners = new Set();

function notifyStatus() {
  for (const fn of statusListeners) fn(connected);
}

/**
 * Opens (or reuses) a single authenticated Socket.io connection for the
 * whole app. The server assigns rooms (facility, role, moh) itself based on
 * the token — the client never requests a room, so there's no way for a
 * compromised client to subscribe to another facility's activity.
 */
function connectSocket() {
  const token = getAccessToken();
  if (!token || (socket && socket.connected)) return socket;

  if (socket) {
    socket.disconnect();
  }

  socket = io(API_BASE, {
    // Function form (not a plain object) so a reconnect after the access
    // token has since been rotated by lib/api.js's refresh flow re-reads
    // the current token instead of replaying the one captured at first
    // connect.
    auth: (cb) => cb({ token: getAccessToken() }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  socket.on('activity', (signal) => {
    for (const fn of listeners) fn(signal);
  });

  socket.on('connect', () => {
    connected = true;
    notifyStatus();
  });
  socket.on('disconnect', () => {
    connected = false;
    notifyStatus();
  });

  return socket;
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  connected = false;
  notifyStatus();
  listeners.clear();
}

function getSocket() {
  return socket;
}

/** Subscribe to raw activity signals. Returns an unsubscribe function. */
function onActivity(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Subscribe to connect/disconnect status, independent of whether the socket
 * has been created yet — avoids a mount-order race with AuthContext, which
 * is what actually calls connectSocket()/disconnectSocket().
 */
function onStatusChange(fn) {
  statusListeners.add(fn);
  fn(connected); // sync the new subscriber immediately
  return () => statusListeners.delete(fn);
}

export { connectSocket, disconnectSocket, getSocket, onActivity, onStatusChange };
