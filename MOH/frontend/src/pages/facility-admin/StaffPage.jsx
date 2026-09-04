import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList } from '../../components/ui';

const STAFF_ROLES = ['doctor', 'pharmacist', 'nurse', 'store_officer'];

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

function AuditTab({ facilityId }) {
  const [entries, setEntries] = useState(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [staff, setStaff] = useState([]);
  const [filterActor, setFilterActor] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [error, setError] = useState(null);
  const LIMIT = 30;

  const loadStaff = useCallback(async () => {
    try { const data = await api.get(`/api/audit/facility/${facilityId}/staff`); setStaff(data); }
    catch {}
  }, [facilityId]);

  const load = useCallback(async () => {
    try {
      setEntries(null);
      const params = new URLSearchParams({ limit: LIMIT, skip });
      if (filterActor) params.set('actorId', filterActor);
      if (filterAction) params.set('action', filterAction);
      const data = await api.get(`/api/audit/facility/${facilityId}?${params}`);
      setEntries(data.entries);
      setTotal(data.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load audit log.');
    }
  }, [facilityId, skip, filterActor, filterAction]);

  useEffect(() => { loadStaff(); }, [loadStaff]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="px-4 py-3 border-b border-border flex flex-wrap gap-3">
        <select value={filterActor} onChange={(e) => { setFilterActor(e.target.value); setSkip(0); }}
          className="rounded border border-border bg-white px-3 py-1.5 text-xs text-ink focus-visible:outline-none">
          <option value="">All staff</option>
          {staff.map((s) => <option key={s._id} value={s._id}>{s.fullName} ({s.role.replace('_',' ')})</option>)}
        </select>
        <select value={filterAction} onChange={(e) => { setFilterAction(e.target.value); setSkip(0); }}
          className="rounded border border-border bg-white px-3 py-1.5 text-xs text-ink focus-visible:outline-none">
          <option value="">All actions</option>
          {Object.keys(ACTION_TONE).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </select>
        <span className="text-xs text-ink-soft self-center">{total} total entries</span>
      </div>
      {error && <ErrorState message={error} />}
      {!error && entries === null && <SkeletonList rows={4} columns={4} />}
      {!error && entries?.length === 0 && <EmptyState message="No activity log entries for these filters." />}
      {!error && entries?.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Target</th>
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
                  <p className="text-xs text-ink-soft">{(e.actorId?.role || '').replace('_', ' ')}</p>
                </td>
                <td className="px-4 py-2.5">
                  <Pill tone={ACTION_TONE[e.action] || 'ink'}>{actionLabel(e.action)}</Pill>
                </td>
                <td className="px-4 py-2.5 text-xs text-ink-soft font-mono">
                  {e.targetType} {e.after ? `— ${JSON.stringify(e.after).slice(0, 60)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {total > LIMIT && (
        <div className="px-4 py-3 border-t border-border flex items-center gap-3">
          <button disabled={skip === 0} onClick={() => setSkip((s) => Math.max(0, s - LIMIT))}
            className="text-xs font-medium text-teal hover:text-teal-strong disabled:opacity-40">
            ← Previous
          </button>
          <span className="text-xs text-ink-soft">
            {skip + 1}–{Math.min(skip + LIMIT, total)} of {total}
          </span>
          <button disabled={skip + LIMIT >= total} onClick={() => setSkip((s) => s + LIMIT)}
            className="text-xs font-medium text-teal hover:text-teal-strong disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function RegisterStaffForm({ facilityId, onRegistered }) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('doctor');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault(); setError(null); setIssued(null); setSubmitting(true);
    try {
      const result = await api.post(`/api/auth/facility/${facilityId}/staff`, { fullName, role, email });
      setIssued(result); setFullName(''); setEmail(''); onRegistered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register staff member.');
    } finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3 border-b border-border">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-ink-soft mb-1">Full name</label>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
            {STAFF_ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Email (optional)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
      </div>
      {error && <p className="text-sm text-signal">{error}</p>}
      {issued && (
        <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
          <p className="text-xs font-medium text-teal-strong">Staff member registered — share these credentials securely:</p>
          <p className="font-mono text-sm text-ink">Username: <strong>{issued.username}</strong></p>
          <p className="font-mono text-sm text-ink">Temp password: <strong>{issued.temporaryPassword}</strong></p>
          <p className="text-xs text-ink-soft italic">This is shown once only.</p>
        </div>
      )}
      <button type="submit" disabled={submitting}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60">
        {submitting ? 'Registering…' : 'Register staff member'}
      </button>
    </form>
  );
}

function StaffRow({ member, facilityId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [resetResult, setResetResult] = useState(null); // { username, temporaryPassword }
  const [dismissed, setDismissed] = useState(false);

  async function handleReset() {
    if (!window.confirm(`Reset credentials for ${member.fullName}? They will need to log in with a new temporary password.`)) return;
    setBusy(true); setResetResult(null); setDismissed(false);
    try {
      const result = await api.post(`/api/auth/facility/${facilityId}/staff/${member._id}/reset-credentials`);
      setResetResult(result);
      // Note: intentionally NOT calling onChanged() here so the credential box stays visible
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not reset credentials.');
    } finally { setBusy(false); }
  }

  async function handleToggleStatus() {
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    setBusy(true);
    try {
      await api.post(`/api/auth/facility/${facilityId}/staff/${member._id}/status`, { status: nextStatus });
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally { setBusy(false); }
  }

  return (
    <li className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{member.fullName}</p>
          <p className="text-xs text-ink-soft font-mono">{member.username}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Pill tone="teal">{member.role.replace('_', ' ')}</Pill>
          <Pill tone={member.status === 'active' ? 'moss' : 'signal'}>{member.status}</Pill>
          <button onClick={handleReset} disabled={busy}
            className="text-xs font-medium text-teal hover:text-teal-strong disabled:opacity-50">
            Reset credentials
          </button>
          <button onClick={handleToggleStatus} disabled={busy}
            className="text-xs font-medium text-signal hover:opacity-70 disabled:opacity-50">
            {member.status === 'active' ? 'Suspend' : 'Reactivate'}
          </button>
        </div>
      </div>
      {resetResult && !dismissed && (
        <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
          <p className="text-xs font-medium text-teal-strong">New credentials for {member.fullName} — share securely:</p>
          <p className="font-mono text-sm text-ink">Username: <strong>{resetResult.username}</strong></p>
          <p className="font-mono text-sm text-ink">Temp password: <strong>{resetResult.temporaryPassword}</strong></p>
          <p className="text-xs text-ink-soft italic">This will disappear when you dismiss it or leave the page.</p>
          <button onClick={() => { setDismissed(true); onChanged(); }}
            className="text-xs font-medium text-teal hover:text-teal-strong mt-1">
            I have noted this — dismiss
          </button>
        </div>
      )}
    </li>
  );
}

export default function StaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('roster'); // 'roster' | 'audit'

  const loadStaff = useCallback(async () => {
    if (!user?.facilityId) return;
    try {
      const data = await api.get(`/api/auth/facility/${user.facilityId}/staff`);
      setStaff(data); setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load staff roster.');
    }
  }, [user?.facilityId]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Staff</h1>
        <p className="text-sm text-ink-soft mt-1">
          Register and manage staff credentials. Switch to Activity Log to see what each staff member has done.
        </p>
      </div>

      <Card title={tab === 'roster' ? 'Staff roster' : 'Activity log'}
        action={
          <div className="flex gap-1 bg-canvas rounded p-0.5">
            <button onClick={() => setTab('roster')}
              className={`text-xs px-3 py-1 rounded transition-colors ${tab === 'roster' ? 'bg-teal text-white' : 'text-ink-soft hover:text-ink'}`}>
              Roster
            </button>
            <button onClick={() => setTab('audit')}
              className={`text-xs px-3 py-1 rounded transition-colors ${tab === 'audit' ? 'bg-teal text-white' : 'text-ink-soft hover:text-ink'}`}>
              Activity log
            </button>
          </div>
        }>
        {tab === 'roster' ? (
          <>
            <RegisterStaffForm facilityId={user.facilityId} onRegistered={loadStaff} />
            {error && <ErrorState message={error} />}
            {!error && staff === null && <SkeletonList rows={4} columns={4} />}
            {!error && staff?.length === 0 && <EmptyState message="No staff registered yet." />}
            {!error && staff?.length > 0 && (
              <ul className="divide-y divide-border">
                {staff.map((member) => (
                  <StaffRow key={member._id} member={member} facilityId={user.facilityId} onChanged={loadStaff} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <AuditTab facilityId={user.facilityId} />
        )}
      </Card>
    </div>
  );
}
