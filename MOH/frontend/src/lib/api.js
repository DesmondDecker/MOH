const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

let accessToken = null;
let refreshToken = null;
let onAuthExpired = null; // set by AuthContext so the client can force a logout

function setTokens({ accessToken: at, refreshToken: rt }) {
  accessToken = at ?? accessToken;
  refreshToken = rt ?? refreshToken;
  if (at) localStorage.setItem('moh_access_token', at);
  if (rt) localStorage.setItem('moh_refresh_token', rt);
}

function loadTokensFromStorage() {
  accessToken = localStorage.getItem('moh_access_token');
  refreshToken = localStorage.getItem('moh_refresh_token');
}

function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem('moh_access_token');
  localStorage.removeItem('moh_refresh_token');
}

function registerAuthExpiredHandler(fn) {
  onAuthExpired = fn;
}

// Exposed so the Socket.io client (lib/socket.js) can hand the current
// access token to the handshake without duplicating token storage.
function getAccessToken() {
  return accessToken;
}

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function refreshAccessToken() {
  if (!refreshToken) throw new ApiError('No refresh token available', 401);

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw new ApiError('Session expired', 401);
  }

  const data = await res.json();
  setTokens({ accessToken: data.accessToken });
  return data.accessToken;
}

/**
 * Core request function. Attaches the bearer token, retries once on a 401
 * after refreshing, and throws ApiError with the server's message on failure.
 */
async function request(path, { method = 'GET', body, skipAuth = false, _retried = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipAuth && !_retried && refreshToken) {
    try {
      await refreshAccessToken();
      return request(path, { method, body, skipAuth, _retried: true });
    } catch {
      clearTokens();
      if (onAuthExpired) onAuthExpired();
      throw new ApiError('Session expired, please log in again', 401);
    }
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !skipAuth) {
      clearTokens();
      if (onAuthExpired) onAuthExpired();
    }
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }

  return data;
}

/**
 * Downloads a binary response (PDF exports, etc.) and saves it via the
 * browser's normal download flow. Deliberately simpler than request(): no
 * 401-refresh retry, since a download is a one-off action a clinician can
 * just retry after any other screen has silently refreshed their token.
 */
async function downloadFile(path, filename) {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, { headers });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    let body = null;
    try {
      body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON (e.g. a plain server error page) — fall back to the generic message
    }
    throw new ApiError(message, res.status, body);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Same download-and-save-as-file behavior as downloadFile above, but for
 * an endpoint that computes the file from a request BODY (e.g. the report
 * builder's metric/scope/date-range selection) rather than just a GET
 * path — the report route is a POST for exactly that reason (it's
 * computing something server-side from a nontrivial payload, not just
 * fetching a static resource by URL).
 */
async function downloadFilePost(path, body, filename) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    let responseBody = null;
    try {
      responseBody = await res.json();
      if (responseBody?.error) message = responseBody.error;
    } catch {
      // response wasn't JSON — fall back to the generic message
    }
    throw new ApiError(message, res.status, responseBody);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const api = {
  get: (path) => request(path),
  post: (path, body, opts = {}) => request(path, { method: 'POST', body, ...opts }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  download: (path, filename) => downloadFile(path, filename),
  downloadPost: (path, body, filename) => downloadFilePost(path, body, filename),
};

export {
  api,
  ApiError,
  setTokens,
  loadTokensFromStorage,
  clearTokens,
  registerAuthExpiredHandler,
  getAccessToken,
};
