import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card } from '../../components/ui';

const FACILITY_TYPES = ['national_referral', 'regional', 'district', 'community_health_center', 'clinic'];

export default function RegisterFacilityPage() {
  const navigate = useNavigate();
  const [provinces, setProvinces] = useState({});
  const [form, setForm] = useState({
    name: '',
    code: '',
    province: '',
    district: '',
    chiefdom: '',
    type: 'clinic',
    adminFullName: '',
    adminEmail: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null); // { facility, facilityAdmin, syncApiKey }

  useEffect(() => {
    api
      .get('/api/reference/sierra-leone-admin')
      .then(setProvinces)
      .catch(() => {}); // non-fatal — district stays a free-text field if this fails
  }, []);

  const districtOptions = form.province ? provinces[form.province] || [] : [];

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value, ...(field === 'province' ? { district: '' } : {}) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post('/api/auth/facilities', form);
      setIssued(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register facility.');
    } finally {
      setSubmitting(false);
    }
  }

  if (issued) {
    return (
      <div className="space-y-6 max-w-xl">
        <h1 className="font-display text-2xl text-ink">Facility registered</h1>
        <Card title={issued.facility.name}>
          <div className="p-4 space-y-4">
            <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
              <p className="text-xs font-medium text-teal-strong">
                Facility admin credentials — share these securely, shown once only:
              </p>
              <p className="font-mono text-sm text-ink">
                Username: <strong>{issued.facilityAdmin.username}</strong>
              </p>
              <p className="font-mono text-sm text-ink">
                Temp password: <strong>{issued.facilityAdmin.temporaryPassword}</strong>
              </p>
            </div>
            <div className="bg-clay-soft border border-clay/30 rounded-md p-3 space-y-1">
              <p className="text-xs font-medium text-clay">
                Sync API key — needed to configure this facility's local sync worker, shown once only:
              </p>
              <p className="font-mono text-xs text-ink break-all">{issued.syncApiKey}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate('/moh')}
                className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors"
              >
                Back to facilities
              </button>
              <button
                onClick={() => {
                  setIssued(null);
                  setForm({
                    name: '',
                    code: '',
                    province: '',
                    district: '',
                    chiefdom: '',
                    type: 'clinic',
                    adminFullName: '',
                    adminEmail: '',
                  });
                }}
                className="border border-border text-ink-soft text-sm font-medium rounded px-4 py-1.5 hover:text-ink transition-colors"
              >
                Register another
              </button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="font-display text-2xl text-ink">Register a new facility</h1>
        <p className="text-sm text-ink-soft mt-1">
          Creates the facility and its first facility admin account in one step.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Facility name">
              <input required value={form.name} onChange={(e) => update('name', e.target.value)} className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
            </Field>
            <Field label="Facility code" hint="e.g. SL-WA-CONNAUGHT">
              <input required value={form.code} onChange={(e) => update('code', e.target.value)} className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
            </Field>
            <Field label="Province">
              <select value={form.province} onChange={(e) => update('province', e.target.value)} className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
                <option value="">Select province</option>
                {Object.keys(provinces).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="District">
              {districtOptions.length > 0 ? (
                <select required value={form.district} onChange={(e) => update('district', e.target.value)} className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
                  <option value="">Select district</option>
                  {districtOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  required
                  value={form.district}
                  onChange={(e) => update('district', e.target.value)}
                  placeholder="Select a province first, or type a district"
                  className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
                />
              )}
            </Field>
            <Field label="Chiefdom (optional)">
              <input value={form.chiefdom} onChange={(e) => update('chiefdom', e.target.value)} className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
            </Field>
            <Field label="Facility type">
              <select value={form.type} onChange={(e) => update('type', e.target.value)} className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
                {FACILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-3">First facility admin</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name">
                <input
                  required
                  value={form.adminFullName}
                  onChange={(e) => update('adminFullName', e.target.value)}
                  className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
                />
              </Field>
              <Field label="Email (optional)">
                <input
                  type="email"
                  value={form.adminEmail}
                  onChange={(e) => update('adminEmail', e.target.value)}
                  className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
                />
              </Field>
            </div>
          </div>

          {error && <p className="text-sm text-signal">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="bg-teal text-white text-sm font-medium rounded px-4 py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
          >
            {submitting ? 'Registering…' : 'Register facility'}
          </button>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-soft mb-1">
        {label} {hint && <span className="text-ink-soft/60">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}
