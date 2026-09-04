import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useLiveActivity } from '../hooks/useLiveActivity';

function Reading({ label, value, tone = 'ink', pulse = false }) {
  const toneClass = {
    ink: 'text-ink',
    signal: 'text-signal',
    clay: 'text-clay',
    moss: 'text-moss',
  }[tone];

  return (
    <div className="flex items-baseline gap-2">
      <span
        className={`h-1.5 w-1.5 rounded-full ${pulse ? 'vitals-pulse' : ''}`}
        style={{ backgroundColor: 'currentColor' }}
        aria-hidden="true"
      />
      <span className="font-mono text-xs uppercase tracking-wide text-ink-soft">{label}</span>
      <span className={`font-mono text-sm font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}

export default function VitalsStrip({ facilityId, showSync = true, showStock = true }) {
  const [syncStatus, setSyncStatus] = useState(null);
  const [stockAlerts, setStockAlerts] = useState(null);
  const [error, setError] = useState(false);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    if (!facilityId) return;
    try {
      const calls = [];
      if (showSync) calls.push(api.get(`/api/sync/facility/${facilityId}/status`));
      else calls.push(Promise.resolve(null));
      if (showStock) calls.push(api.get(`/api/inventory/facility/${facilityId}/stock`));
      else calls.push(Promise.resolve(null));

      const [sync, stock] = await Promise.all(calls);
      if (cancelledRef.current) return;
      if (sync) setSyncStatus(sync);
      if (stock) setStockAlerts(stock.filter((s) => s.belowThreshold).length);
      setError(false);
    } catch {
      if (!cancelledRef.current) setError(true);
    }
  }, [facilityId, showSync, showStock]);

  useEffect(() => {
    if (!facilityId) return;
    cancelledRef.current = false;

    load();
    // 60s poll is a backstop for missed/queued socket events (e.g. a brief
    // disconnect); the live signal below is what makes this feel real-time.
    const interval = setInterval(load, 60000);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, [facilityId, load]);

  // Every audit-logged action at this facility enqueues a sync event, and
  // stock/transfer actions change what the stock-alert count should read —
  // so any signal scoped to this facility is worth an immediate refetch.
  useLiveActivity(
    useCallback((signal) => signal.facilityId === facilityId, [facilityId]),
    load
  );

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-soft">
        <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden="true" />
        Vitals unavailable
      </div>
    );
  }

  if ((showSync && !syncStatus) || (showStock && stockAlerts === null && !error)) {
    return <div className="text-xs text-ink-soft font-mono">Reading vitals…</div>;
  }

  const syncHealthy = syncStatus && syncStatus.pendingCount === 0 && syncStatus.failedCount === 0;
  const syncTone = syncStatus
    ? syncStatus.failedCount > 0
      ? 'signal'
      : syncStatus.pendingCount > 0
        ? 'clay'
        : 'moss'
    : 'ink';

  return (
    <div className="flex items-center gap-6" role="status" aria-label="Facility system vitals">
      {showSync && syncStatus && (
        <Reading
          label="Sync"
          value={
            syncStatus.failedCount > 0
              ? `${syncStatus.failedCount} failed`
              : syncStatus.pendingCount > 0
                ? `${syncStatus.pendingCount} pending`
                : 'current'
          }
          tone={syncTone}
          pulse={!syncHealthy}
        />
      )}
      {showStock && (
        <Reading
          label="Stock alerts"
          value={stockAlerts === null ? '—' : stockAlerts}
          tone={stockAlerts > 0 ? 'clay' : 'moss'}
          pulse={stockAlerts > 0}
        />
      )}
    </div>
  );
}
