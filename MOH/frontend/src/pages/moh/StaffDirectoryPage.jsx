import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList, SearchIcon } from '../../components/ui';

const ROLES = ['moh_super_admin', 'facility_admin', 'doctor', 'pharmacist', 'nurse', 'store_officer'];
const STATUSES = ['active', 'suspended', 'revoked'];

function CreateSuperAdminForm({ open, onClose, onCreated }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post('/api/auth/super-admins', { fullName, email });
      setIssued(result);
      setFullName('');
      setEmail('');
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create super admin.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <Card title="Create a new MoH super admin">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            required
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        {error && <p className="text-sm text-signal">{error}</p>}
        {issued && (
          <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
            <p className="text-xs font-medium text-teal-strong">New admin credentials — shown once only:</p>
            <p className="font-mono text-sm text-ink">
              Username: <strong>{issued.username}</strong>
            </p>
            <p className="font-mono text-sm text-ink">
              Temp password: <strong>{issued.temporaryPassword}</strong>
            </p>
          </div>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="border border-border text-ink-soft text-sm font-medium rounded px-4 py-1.5 hover:text-ink transition-colors"
          >
            Close
          </button>
        </div>
      </form>
    </Card>
  );
}

export default function StaffDirectoryPage() {
  const [provinces, setProvinces] = useState({});
  const [filters, setFilters] = useState({ role: '', province: '', district: '', status: '', search: '' });
  const [result, setResult] = useState(null);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState(null);
  const [creatingSuperAdmin, setCreatingSuperAdmin] = useState(false);
  const LIMIT = 30;

  useEffect(() => {
    api.get('/api/reference/sierra-leone-admin').then(setProvinces).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setResult(null);
    const params = new URLSearchParams({ limit: LIMIT, skip });
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    api
      .get(`/api/auth/staff/directory?${params}`)
      .then((data) => {
        setResult(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load staff directory.'));
  }, [filters, skip]);

  useEffect(() => {
    load();
  }, [load]);

  function updateFilter(field, value) {
    setSkip(0);
    setFilters((f) => ({ ...f, [field]: value, ...(field === 'province' ? { district: '' } : {}) }));
  }

  const districtOptions = filters.province ? provinces[filters.province] || [] : [];
  const selectClass =
    'rounded border border-border bg-white px-2 py-1.5 text-xs text-ink focus-visible:outline-none';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Staff directory</h1>
          <p className="text-sm text-ink-soft mt-1">
            Every staff account across every facility, in one searchable roster.
          </p>
        </div>
        <button
          onClick={() => setCreatingSuperAdmin((v) => !v)}
          className="text-xs font-medium text-teal hover:text-teal-strong border border-border rounded-md px-3 py-1.5 shrink-0"
        >
          {creatingSuperAdmin ? 'Close' : '+ Create MoH super admin'}
        </button>
      </div>

      <CreateSuperAdminForm open={creatingSuperAdmin} onClose={() => setCreatingSuperAdmin(false)} onCreated={load} />

      <Card>
        <div className="p-4 flex flex-wrap gap-2 border-b border-border">
          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-soft" width={14} height={14} />
            <input
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Search by name, username, or email"
              className="w-full rounded border border-border bg-white pl-7 pr-3 py-1.5 text-xs text-ink focus-visible:outline-none"
            />
          </div>
          <select value={filters.role} onChange={(e) => updateFilter('role', e.target.value)} className={selectClass}>
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <select value={filters.province} onChange={(e) => updateFilter('province', e.target.value)} className={selectClass}>
            <option value="">All provinces</option>
            {Object.keys(provinces).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={filters.district}
            onChange={(e) => updateFilter('district', e.target.value)}
            className={selectClass}
            disabled={districtOptions.length === 0}
          >
            <option value="">All districts</option>
            {districtOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className={selectClass}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {error && <ErrorState message={error} />}
        {!error && result === null && <SkeletonList rows={6} columns={5} />}
        {!error && result?.entries.length === 0 && (
          <EmptyState title="No staff match these filters" description="Try widening the search or clearing a filter." />
        )}
        {!error && result?.entries.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Facility</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.entries.map((s) => (
                <tr key={s._id} className="hover:bg-canvas/50">
                  <td className="px-4 py-2.5">
                    <Link to={`/moh/staff/${s._id}`} className="text-sm font-medium text-teal hover:text-teal-strong">
                      {s.fullName}
                    </Link>
                    <p className="text-xs text-ink-soft font-mono">{s.username}</p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft capitalize">{s.role.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {s.facilityId ? `${s.facilityId.name} (${s.facilityId.district})` : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Pill tone={s.status === 'active' ? 'moss' : s.status === 'suspended' ? 'clay' : 'signal'}>
                      {s.status}
                    </Pill>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-ink-soft font-mono">
                    {s.lastLogin ? new Date(s.lastLogin).toLocaleString() : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {result && result.total > LIMIT && (
          <div className="px-4 py-3 border-t border-border flex items-center gap-3">
            <button
              disabled={skip === 0}
              onClick={() => setSkip((s) => Math.max(0, s - LIMIT))}
              className="text-xs font-medium text-teal hover:text-teal-strong disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-xs text-ink-soft">
              {skip + 1}–{Math.min(skip + LIMIT, result.total)} of {result.total}
            </span>
            <button
              disabled={skip + LIMIT >= result.total}
              onClick={() => setSkip((s) => s + LIMIT)}
              className="text-xs font-medium text-teal hover:text-teal-strong disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
