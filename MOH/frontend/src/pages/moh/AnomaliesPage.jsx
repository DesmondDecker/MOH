import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState } from '../../components/ui';

const WINDOWS = [24, 72, 168];

export default function AnomaliesPage() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get(`/api/moh/audit/anomalies?hours=${hours}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load anomaly data.'));
  }, [hours]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Anomalies</h1>
          <p className="text-sm text-ink-soft mt-1">
            High-volume record access and emergency overrides — a first pass, not calibrated per-user baselines.
          </p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-3 py-1.5 text-sm font-medium rounded ${
                hours === h ? 'bg-teal text-white' : 'bg-canvas-raised border border-border text-ink-soft'
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {!error && data && (
        <>
          <Card title={`High-volume record viewers (≥${data.highViewThreshold} views)`}>
            {data.highViewers.length === 0 ? (
              <EmptyState message="No unusually high view counts in this window." />
            ) : (
              <ul className="divide-y divide-border">
                {data.highViewers.map((v) => (
                  <li key={v.actorId} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-ink">{v.actorName}</p>
                      <p className="text-xs text-ink-soft capitalize">{v.actorRole}</p>
                    </div>
                    <Pill tone="clay">{v.viewCount} views</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Emergency overrides">
            {data.emergencyOverrides.length === 0 ? (
              <EmptyState message="No emergency-override access in this window." />
            ) : (
              <ul className="divide-y divide-border">
                {data.emergencyOverrides.map((o) => (
                  <li key={o._id} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-ink">{o.actorId?.fullName || 'Unknown actor'}</p>
                        <p className="text-xs text-ink-soft">{o.action.replace(/_/g, ' ')}</p>
                      </div>
                      <span className="font-mono text-xs text-ink-soft">
                        {new Date(o.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {o.after?.justification && (
                      <p className="text-xs text-ink-soft mt-1 italic">"{o.after.justification}"</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
