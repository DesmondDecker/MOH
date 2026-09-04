import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList } from '../../components/ui';

const WINDOW_OPTIONS = [30, 60, 90];

function daysUntil(dateStr) {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

/**
 * Visual shelf-life bar: a continuous green→amber→red gradient track with a
 * marker at the batch's position within the selected window, rather than
 * just a colored pill. The pill alone tells you the bucket (signal/clay/
 * moss); this additionally tells you WHERE within that bucket a batch
 * sits — a batch with 2 days left and one with 13 days left both render
 * as the "signal" pill, but read very differently on this bar.
 */
function ExpiryTimelineBar({ remaining, windowDays }) {
  const clamped = Math.max(0, Math.min(remaining, windowDays));
  // 0% = expiring now (red end of the gradient), 100% = furthest out in the
  // selected window (green end) — the marker's horizontal position mirrors
  // where the batch sits directly on the same red→amber→green track.
  const positionPct = windowDays > 0 ? (clamped / windowDays) * 100 : 0;

  return (
    <div className="mt-2" aria-hidden="true">
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'linear-gradient(to right, #dc2626 0%, #d97706 35%, #16a34a 100%)' }}
      />
      <div
        className="relative -mt-2 h-3 w-3 rounded-full bg-canvas-raised border-2 border-ink shadow-sm"
        style={{ marginLeft: `calc(${Math.min(97, Math.max(0, positionPct))}% - 6px)` }}
      />
    </div>
  );
}

export default function ExpiringStockPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(90);
  const [batches, setBatches] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.facilityId) return;
    let cancelled = false;

    api
      .get(`/api/inventory/facility/${user.facilityId}/expiring?days=${days}`)
      .then((data) => {
        if (!cancelled) setBatches(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load expiry data.');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.facilityId, days]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl text-ink">Expiring stock</h1>
          <p className="text-sm text-ink-soft mt-1">Batches approaching expiry, soonest first.</p>
        </div>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => setDays(opt)}
              className={`px-3 py-1.5 text-sm font-medium rounded ${
                days === opt ? 'bg-teal text-white' : 'bg-canvas-raised border border-border text-ink-soft'
              }`}
            >
              {opt}d
            </button>
          ))}
        </div>
      </div>

      <Card>
        {error && <ErrorState message={error} />}
        {!error && batches === null && <SkeletonList rows={4} columns={4} />}
        {!error && batches?.length === 0 && (
          <EmptyState message={`Nothing expiring in the next ${days} days.`} />
        )}
        {!error && batches?.length > 0 && (
          <ul className="divide-y divide-border">
            {batches.map((batch) => {
              const remaining = daysUntil(batch.expiryDate);
              const tone = remaining <= 14 ? 'signal' : remaining <= 30 ? 'clay' : 'moss';
              return (
                <li key={batch._id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink truncate">
                        {batch.inventoryItemId?.name || 'Unknown item'}
                      </p>
                      <p className="text-xs text-ink-soft font-mono">
                        Batch {batch.batchNumber} · {batch.quantityRemaining} {batch.inventoryItemId?.unit}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-xs text-ink-soft">
                        {new Date(batch.expiryDate).toLocaleDateString()}
                      </span>
                      <Pill tone={tone}>{remaining <= 0 ? 'Expired' : `${remaining}d left`}</Pill>
                    </div>
                  </div>
                  <ExpiryTimelineBar remaining={remaining} windowDays={days} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
