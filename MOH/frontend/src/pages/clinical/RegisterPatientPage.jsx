import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card, Pill } from '../../components/ui';

export default function RegisterPatientPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '',
    sex: 'female',
    dateOfBirth: '',
    dateOfBirthEstimated: false,
    nationalId: '',
    phone: '',
    district: '',
    chiefdom: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const patient = await api.post('/api/patients', form);
      setSaved(patient);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register patient.');
    } finally {
      setSubmitting(false);
    }
  }

  if (saved) {
    return (
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="font-display text-2xl text-ink">Patient registered</h1>
          <p className="text-sm text-ink-soft mt-1 font-mono">{saved.mrn}</p>
        </div>

        {saved.possibleDuplicates?.length > 0 && (
          <Card title="Possible duplicate records found">
            <div className="px-4 py-3 space-y-2">
              <p className="text-sm text-ink-soft">
                This registration matched {saved.possibleDuplicates.length} existing record
                {saved.possibleDuplicates.length > 1 ? 's' : ''}. A facility admin should review before
                treating these as separate patients.
              </p>
              {saved.possibleDuplicates.map((d) => (
                <div key={d.patientId} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-ink-soft">Match on: {d.matchedOn.join(', ')}</span>
                  <Pill tone="clay">{Math.round(d.matchScore * 100)}% match</Pill>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/clinical/patients/${saved._id}`)}
            className="bg-teal text-white text-sm font-medium rounded px-4 py-2 hover:bg-teal-strong transition-colors"
          >
            Open patient record
          </button>
          <button
            onClick={() => {
              setSaved(null);
              setForm({
                fullName: '',
                sex: 'female',
                dateOfBirth: '',
                dateOfBirthEstimated: false,
                nationalId: '',
                phone: '',
                district: '',
                chiefdom: '',
              });
            }}
            className="text-sm font-medium text-teal hover:text-teal-strong"
          >
            Register another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Register patient</h1>
        <p className="text-sm text-ink-soft mt-1">
          National ID upgrades the record to verified. Without one, the patient is registered as provisional.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-canvas-raised border border-border rounded-md p-5 space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-ink mb-1">
            Full name
          </label>
          <input
            id="fullName"
            required
            value={form.fullName}
            onChange={(e) => update('fullName', e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="sex" className="block text-sm font-medium text-ink mb-1">
              Sex
            </label>
            <select
              id="sex"
              value={form.sex}
              onChange={(e) => update('sex', e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
            >
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
          </div>
          <div>
            <label htmlFor="dateOfBirth" className="block text-sm font-medium text-ink mb-1">
              Date of birth
            </label>
            <input
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => update('dateOfBirth', e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={form.dateOfBirthEstimated}
            onChange={(e) => update('dateOfBirthEstimated', e.target.checked)}
          />
          Date of birth is estimated
        </label>

        <div>
          <label htmlFor="nationalId" className="block text-sm font-medium text-ink mb-1">
            National ID <span className="text-ink-soft font-normal">(optional)</span>
          </label>
          <input
            id="nationalId"
            value={form.nationalId}
            onChange={(e) => update('nationalId', e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-ink mb-1">
            Phone
          </label>
          <input
            id="phone"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="district" className="block text-sm font-medium text-ink mb-1">
              District
            </label>
            <input
              id="district"
              value={form.district}
              onChange={(e) => update('district', e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label htmlFor="chiefdom" className="block text-sm font-medium text-ink mb-1">
              Chiefdom
            </label>
            <input
              id="chiefdom"
              value={form.chiefdom}
              onChange={(e) => update('chiefdom', e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-signal bg-signal-soft rounded px-3 py-2">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-teal text-white font-medium rounded py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
        >
          {submitting ? 'Registering…' : 'Register patient'}
        </button>
      </form>
    </div>
  );
}
