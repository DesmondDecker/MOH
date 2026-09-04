import { useState } from 'react';
import { api, ApiError } from '../../lib/api';

const TYPES = [
  { value: 'outpatient', label: 'Outpatient' },
  { value: 'inpatient_admission', label: 'Admission' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'antenatal', label: 'Antenatal' },
  { value: 'immunization', label: 'Immunization' },
];

export default function NewEncounterForm({ patientId, crossFacility = false, onCreated }) {
  const [type, setType] = useState('outpatient');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [vitals, setVitals] = useState({
    temperatureC: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRateBpm: '',
    weightKg: '',
  });
  const [emergencyAccess, setEmergencyAccess] = useState(false);
  const [emergencyJustification, setEmergencyJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function updateVital(field, value) {
    setVitals((v) => ({ ...v, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (emergencyAccess && !emergencyJustification.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const cleanVitals = Object.fromEntries(
        Object.entries(vitals)
          .filter(([, v]) => v !== '')
          .map(([k, v]) => [k, Number(v)])
      );
      const encounter = await api.post('/api/encounters', {
        patientId,
        type,
        chiefComplaint,
        vitals: Object.keys(cleanVitals).length > 0 ? cleanVitals : undefined,
        emergencyOverride:
          crossFacility && emergencyAccess
            ? { used: true, justification: emergencyJustification.trim() }
            : undefined,
      });
      onCreated(encounter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open encounter.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="encType" className="block text-xs font-medium text-ink-soft mb-1">
            Type
          </label>
          <select
            id="encType"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="chiefComplaint" className="block text-xs font-medium text-ink-soft mb-1">
            Chief complaint
          </label>
          <input
            id="chiefComplaint"
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <div>
          <label htmlFor="temp" className="block text-xs font-medium text-ink-soft mb-1">
            Temp (°C)
          </label>
          <input
            id="temp"
            type="number"
            step="0.1"
            value={vitals.temperatureC}
            onChange={(e) => updateVital('temperatureC', e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="sys" className="block text-xs font-medium text-ink-soft mb-1">
            BP sys
          </label>
          <input
            id="sys"
            type="number"
            value={vitals.bloodPressureSystolic}
            onChange={(e) => updateVital('bloodPressureSystolic', e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="dia" className="block text-xs font-medium text-ink-soft mb-1">
            BP dia
          </label>
          <input
            id="dia"
            type="number"
            value={vitals.bloodPressureDiastolic}
            onChange={(e) => updateVital('bloodPressureDiastolic', e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="hr" className="block text-xs font-medium text-ink-soft mb-1">
            HR
          </label>
          <input
            id="hr"
            type="number"
            value={vitals.heartRateBpm}
            onChange={(e) => updateVital('heartRateBpm', e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="weight" className="block text-xs font-medium text-ink-soft mb-1">
            Weight (kg)
          </label>
          <input
            id="weight"
            type="number"
            step="0.1"
            value={vitals.weightKg}
            onChange={(e) => updateVital('weightKg', e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
      </div>

      {crossFacility && (
        <div className="bg-clay-soft border border-clay/30 rounded p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={emergencyAccess}
              onChange={(e) => setEmergencyAccess(e.target.checked)}
            />
            This is emergency/break-glass access (patient registered at another facility)
          </label>
          {emergencyAccess && (
            <div>
              <label htmlFor="emergencyJustification" className="block text-xs font-medium text-ink-soft mb-1">
                Reason (required, goes in the audit trail)
              </label>
              <input
                id="emergencyJustification"
                required
                value={emergencyJustification}
                onChange={(e) => setEmergencyJustification(e.target.value)}
                placeholder="e.g. Patient presented unconscious, no time to arrange referral"
                className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-signal">{error}</p>}

      <button
        type="submit"
        disabled={submitting || (crossFacility && emergencyAccess && !emergencyJustification.trim())}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
      >
        {submitting ? 'Opening…' : 'Open encounter'}
      </button>
    </form>
  );
}
