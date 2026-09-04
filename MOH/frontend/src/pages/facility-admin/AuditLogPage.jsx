import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList } from '../../components/ui';

const ACTION_TONE = {
  login_success: 'moss', login_failed: 'signal', credentials_reset: 'clay',
  stock_received: 'teal', stock_adjusted_add: 'teal', stock_adjusted_reduce: 'clay',
  stock_wastage_recorded: 'clay', prescription_dispensed: 'teal',
  patient_registered: 'moss', encounter_opened: 'moss', encounter_closed: 'ink',
  patient_record_viewed: 'ink', bulk_staff_onboarded: 'teal',
  inventory_item_created: 'teal', password_changed_self: 'ink',
};

function actionLabel(action) {
  return (action || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const LIMIT = 50;

export default function AuditLogPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [staff, setStaff] = useState([]);
  const [filterActor, setFilterActor] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.facilityId) return;
    api.get(`/api/audit/facility/${user.facilityId}/staff`).then(setStaff).catch(() => {});
  }, [user?.facilityId]);

  const load = useCallback(async () => {
    if (!user?.facilityId) return;
    setEntries(null);
    try {
      const params = new URLSearchParams({ limit: LIMIT, skip });
      if (filterActor) params.set('actorId', filterActor);
      if (filterAction) params.set('action', filterAction);
      if (filterFrom) params.set('from', filterFrom);
      if (filterTo) params.set('to', filterTo + 'T23:59:59');
      const data = await api.get(`/api/audit/facility/${user.facilityId}?${params}`);
      setEntries(data.entries);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load audit log.');
    }
  }, [user?.facilityId, skip, filterActor, filterAction, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  function resetFilters() {
    setFilterActor(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); setSkip(0);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Audit log</h1>
        <p className="text-sm text-ink-soft mt-1">
          Every action taken by staff at this facility — logins, stock movements, patient access, credential resets.
        </p>
      </div>

      <Card title="Filters">
        <div className="px-4 py-3 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Staff member</label>
            <select value={filterActor} onChange={(e) => { setFilterActor(e.target.value); setSkip(0); }}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
              <option value="">All staff</option>
              {staff.map((s) => (
                <option key={s._id} value={s._id}>{s.fullName} ({s.role.replace('_', ' ')})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Action</label>
            <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setSkip(0); }}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
              <option value="">All actions</option>
              {Object.keys(ACTION_TONE).map((a) => (
                <option key={a} value={a}>{actionLabel(a)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">From date</label>
            <input type="date" value={filterFrom} onChange={(e) => { setFilterFrom(e.target.value); setSkip(0); }}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">To date</label>
            <input type="date" value={filterTo} onChange={(e) => { setFilterTo(e.target.value); setSkip(0); }}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
          </div>
          <button onClick={resetFilters}
            className="text-xs font-medium text-ink-soft hover:text-ink px-2 py-1.5">
            Clear filters
          </button>
          <span className="text-xs text-ink-soft self-center ml-auto">{total} entries</span>
        </div>
      </Card>

      <Card>
        {error && <ErrorState message={error} />}
        {!error && entries === null && <SkeletonList rows={4} columns={4} />}
        {!error && entries?.length === 0 && <EmptyState message="No log entries for the selected filters." />}
        {!error && entries?.length > 0 && (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Date / Time</th>
                  <th className="px-4 py-2 font-medium">Staff member</th>
                  <th className="px-4 py-2 font-medium">Action</th>
                  <th className="px-4 py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e._id} className="hover:bg-canvas/50">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-soft whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium text-ink">{e.actorId?.fullName || 'System'}</p>
                      <p className="text-xs text-ink-soft capitalize">{(e.actorId?.role || '').replace(/_/g, ' ')}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Pill tone={ACTION_TONE[e.action] || 'ink'}>{actionLabel(e.action)}</Pill>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-soft max-w-xs">
                      {e.after ? (
                        <span className="font-mono">{JSON.stringify(e.after).slice(0, 80)}{JSON.stringify(e.after).length > 80 ? '…' : ''}</span>
                      ) : (
                        <span className="text-ink-soft/50">{e.targetType || '—'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-border flex items-center gap-4">
              <button disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - LIMIT))}
                className="text-sm font-medium text-teal hover:text-teal-strong disabled:opacity-40">
                ← Previous
              </button>
              <span className="text-sm text-ink-soft">
                {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}
              </span>
              <button disabled={skip + LIMIT >= total} onClick={() => setSkip((s) => s + LIMIT)}
                className="text-sm font-medium text-teal hover:text-teal-strong disabled:opacity-40">
                Next →
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
