import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, ErrorState, AsyncButton } from '../../components/ui';

class CancelledAction extends Error {}

const FACILITY_TYPES = ['national_referral', 'regional', 'district', 'community_health_center', 'clinic'];

export default function FacilityDetailPage() {
  const { facilityId } = useParams();
  const [facility, setFacility] = useState(null);
  const [staff, setStaff] = useState(null);
  const [provinces, setProvinces] = useState({});
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [syncKeyResult, setSyncKeyResult] = useState(null);
  const [newAdmin, setNewAdmin] = useState({ fullName: '', email: '' });
  const [issuedAdmin, setIssuedAdmin] = useState(null);

  const load = useCallback(() => {
    Promise.all([api.get(`/api/moh/facilities/summary`), api.get('/api/reference/sierra-leone-admin')])
      .then(([facilities, provinceData]) => {
        const found = facilities.find((f) => f.facilityId === facilityId);
        setFacility(found || null);
        setProvinces(provinceData);
        setError(found ? null : 'Facility not found');
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load facility.'));

    api
      .get(`/api/auth/facility/${facilityId}/staff`)
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [facilityId]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit() {
    setForm({
      name: facility.name,
      province: facility.province || '',
      district: facility.district,
      chiefdom: facility.chiefdom || '',
      type: facility.type,
    });
    setEditing(true);
  }

  async function handleSaveEdit() {
    try {
      await api.patch(`/api/auth/facilities/${facilityId}`, form);
      setEditing(false);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not save changes.');
    }
  }

  async function handleToggleStatus() {
    const nextStatus = facility.status === 'active' ? 'suspended' : 'active';
    if (!window.confirm(`${nextStatus === 'active' ? 'Reactivate' : 'Suspend'} ${facility.name}?`)) {
      throw new CancelledAction();
    }
    await api.post(`/api/auth/facilities/${facilityId}/status`, { status: nextStatus });
    load();
  }

  async function handleRotateSyncKey() {
    if (!window.confirm('Rotate the sync API key? The old key will stop working immediately.')) {
      throw new CancelledAction();
    }
    const result = await api.post(`/api/auth/facilities/${facilityId}/sync-key/rotate`);
    setSyncKeyResult(result);
  }

  async function handleCreateAdmin(e) {
    e.preventDefault();
    try {
      const result = await api.post(`/api/auth/facilities/${facilityId}/admin`, newAdmin);
      setIssuedAdmin(result);
      setNewAdmin({ fullName: '', email: '' });
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not create facility admin.');
    }
  }

  function handleActionError(err) {
    if (err instanceof CancelledAction) return;
    alert(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
  }

  if (error) return <ErrorState message={error} />;
  if (!facility) return <p className="text-sm text-ink-soft">Loading…</p>;

  const inputClass = 'w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none';
  const districtOptions = form?.province ? provinces[form.province] || [] : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link to="/moh" className="text-xs font-medium text-teal hover:text-teal-strong">
          ← Facilities
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <h1 className="font-display text-2xl text-ink">{facility.name}</h1>
          <Pill tone={facility.status === 'active' ? 'moss' : 'signal'}>{facility.status}</Pill>
        </div>
        <p className="text-sm text-ink-soft font-mono">{facility.code}</p>
      </div>

      <Card
        title="Details"
        action={
          !editing && (
            <button onClick={startEdit} className="text-xs font-medium text-teal hover:text-teal-strong">
              Edit
            </button>
          )
        }
      >
        {editing ? (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className={inputClass}>
                  {FACILITY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Province</label>
                <select
                  value={form.province}
                  onChange={(e) => setForm((f) => ({ ...f, province: e.target.value, district: '' }))}
                  className={inputClass}
                >
                  <option value="">Select province</option>
                  {Object.keys(provinces).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">District</label>
                {districtOptions.length > 0 ? (
                  <select value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} className={inputClass}>
                    <option value="">Select district</option>
                    {districtOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input value={form.district} onChange={(e) => setForm((f) => ({ ...f, district: e.target.value }))} className={inputClass} />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Chiefdom</label>
                <input value={form.chiefdom} onChange={(e) => setForm((f) => ({ ...f, chiefdom: e.target.value }))} className={inputClass} />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="border border-border text-ink-soft text-sm font-medium rounded px-4 py-1.5 hover:text-ink transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="p-4 grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-ink-soft">Type</dt>
            <dd className="text-ink capitalize">{facility.type.replace(/_/g, ' ')}</dd>
            <dt className="text-ink-soft">Province</dt>
            <dd className="text-ink">{facility.province || '—'}</dd>
            <dt className="text-ink-soft">District</dt>
            <dd className="text-ink">{facility.district}</dd>
            <dt className="text-ink-soft">Chiefdom</dt>
            <dd className="text-ink">{facility.chiefdom || '—'}</dd>
            <dt className="text-ink-soft">Patients</dt>
            <dd className="text-ink">{facility.patientCount}</dd>
            <dt className="text-ink-soft">Open encounters</dt>
            <dd className="text-ink">{facility.activeEncounters}</dd>
          </dl>
        )}
      </Card>

      <Card title="Facility administration">
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <AsyncButton onClick={handleToggleStatus} onError={handleActionError} loadingLabel="Working…" successLabel="Done">
              {facility.status === 'active' ? 'Suspend facility' : 'Reactivate facility'}
            </AsyncButton>
            <AsyncButton onClick={handleRotateSyncKey} onError={handleActionError} loadingLabel="Rotating…" successLabel="Rotated">
              Rotate sync API key
            </AsyncButton>
          </div>
          {syncKeyResult && (
            <div className="bg-clay-soft border border-clay/30 rounded-md p-3">
              <p className="text-xs font-medium text-clay mb-1">
                New sync API key — shown once, update the facility's sync worker config now:
              </p>
              <p className="font-mono text-xs text-ink break-all">{syncKeyResult.syncApiKey}</p>
            </div>
          )}
        </div>
      </Card>

      <Card title="Add a facility admin">
        <form onSubmit={handleCreateAdmin} className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              required
              placeholder="Full name"
              value={newAdmin.fullName}
              onChange={(e) => setNewAdmin((a) => ({ ...a, fullName: e.target.value }))}
              className={inputClass}
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={newAdmin.email}
              onChange={(e) => setNewAdmin((a) => ({ ...a, email: e.target.value }))}
              className={inputClass}
            />
          </div>
          <button
            type="submit"
            className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors"
          >
            Create facility admin
          </button>
          {issuedAdmin && (
            <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
              <p className="text-xs font-medium text-teal-strong">New admin credentials — shown once only:</p>
              <p className="font-mono text-sm text-ink">
                Username: <strong>{issuedAdmin.username}</strong>
              </p>
              <p className="font-mono text-sm text-ink">
                Temp password: <strong>{issuedAdmin.temporaryPassword}</strong>
              </p>
            </div>
          )}
        </form>
      </Card>

      <Card title="Staff roster">
        {staff === null ? (
          <p className="text-sm text-ink-soft p-4">Loading…</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-ink-soft p-4">No staff registered yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((s) => (
              <li key={s._id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <Link to={`/moh/staff/${s._id}`} className="text-sm font-medium text-teal hover:text-teal-strong">
                    {s.fullName}
                  </Link>
                  <p className="text-xs text-ink-soft capitalize">{s.role.replace(/_/g, ' ')}</p>
                </div>
                <Pill tone={s.status === 'active' ? 'moss' : 'signal'}>{s.status}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
