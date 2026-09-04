import { offlineQueue } from './offlineQueue';
import { api, ApiError } from './api';

/**
 * Attempts to sync every pending/error visit in the local queue in a
 * single batch request. Never throws for individual record failures —
 * each visit's outcome is reconciled independently (synced ones deleted
 * from the local queue, errored ones kept with the server's error
 * message so the CHW can see and fix them) — only a total network/auth
 * failure (can't reach the server at all) throws, since that's the one
 * case where nothing about individual records can be determined yet.
 *
 * Safe to call opportunistically and often: on app load, on the
 * `online` event, on a periodic timer, or from a manual "Sync now"
 * button — an empty queue is a fast no-op, and a mid-sync network drop
 * just leaves whatever wasn't yet processed as still 'pending' for the
 * next attempt (the batch endpoint is idempotent per visit, see
 * backend/models/OutreachVisit.js, so a partially-retried batch is safe).
 */
export async function syncPendingVisits() {
  const pending = await offlineQueue.getPendingVisits();
  if (pending.length === 0) {
    return { synced: 0, errored: 0, total: 0 };
  }

  const payload = pending.map((v) => {
    // Strip the local-only bookkeeping fields before sending — the
    // server has no concept of them, they're purely for the on-device
    // queue view.
    // eslint-disable-next-line no-unused-vars
    const { status, errorMessage, ...visitFields } = v;
    return visitFields;
  });

  let response;
  try {
    response = await api.post('/api/chw/visits/sync', { visits: payload });
  } catch (err) {
    // Couldn't reach the server at all — every visit stays 'pending'
    // exactly as it was, nothing to reconcile. Re-throw so the caller
    // (e.g. a manual "Sync now" button) can show a clear message rather
    // than a silently-swallowed failure.
    throw err instanceof ApiError ? err : new ApiError('Could not reach the server to sync.', 0, null);
  }

  let synced = 0;
  let errored = 0;

  for (const result of response.results) {
    if (result.status === 'synced' || result.status === 'already_synced') {
      await offlineQueue.deleteVisit(result.clientVisitId);
      synced++;
    } else {
      await offlineQueue.markError(result.clientVisitId, result.error || 'Sync failed for an unknown reason');
      errored++;
    }
  }

  return { synced, errored, total: pending.length };
}

/**
 * Wires up automatic sync attempts: once right away (in case the app
 * loaded already online with a backlog), then again every time the
 * browser fires the `online` event (network just came back). Returns an
 * unsubscribe function for cleanup on unmount.
 */
export function watchForConnectivityAndSync(onSyncComplete) {
  let cancelled = false;

  async function attempt() {
    if (cancelled || !navigator.onLine) return;
    try {
      const result = await syncPendingVisits();
      if (!cancelled) onSyncComplete?.(result, null);
    } catch (err) {
      if (!cancelled) onSyncComplete?.(null, err);
    }
  }

  attempt();
  window.addEventListener('online', attempt);

  return () => {
    cancelled = true;
    window.removeEventListener('online', attempt);
  };
}
