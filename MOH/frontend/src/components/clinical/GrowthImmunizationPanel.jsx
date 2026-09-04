import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Card, Pill } from '../ui';
import Sparkline from './Sparkline';

const MUAC_TONE = {
  severe_acute_malnutrition: 'signal',
  moderate_acute_malnutrition: 'clay',
  normal: 'moss',
  not_applicable: 'ink',
  not_measured: 'ink',
};

const MUAC_LABEL = {
  severe_acute_malnutrition: 'Severe acute malnutrition',
  moderate_acute_malnutrition: 'Moderate acute malnutrition',
  normal: 'Normal',
  not_applicable: 'MUAC screening N/A (age)',
  not_measured: 'Not measured',
};

const STATUS_TONE = { completed: 'moss', due: 'clay', overdue: 'signal', not_yet_due: 'ink' };

export default function GrowthImmunizationPanel({ patientId, encounterId }) {
  const [measurements, setMeasurements] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);
  const [showMeasurementForm, setShowMeasurementForm] = useState(false);
  const [showVaccineForm, setShowVaccineForm] = useState(false);

  function load() {
    api
      .get(`/api/mch/growth-measurements/patient/${patientId}`)
      .then(setMeasurements)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load growth history.'));

    api
      .get(`/api/mch/immunizations/patient/${patientId}/schedule`)
      .then((data) => setSchedule(data))
      .catch(() => setSchedule(null)); // patient may have no recorded DOB — not a hard error for this panel
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const latestMuac = measurements?.length ? measurements[measurements.length - 1] : null;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-signal">{error}</p>}

      {latestMuac?.muacClassification && ['severe_acute_malnutrition', 'moderate_acute_malnutrition'].includes(latestMuac.muacClassification) && (
        <div className="bg-signal-soft border border-signal/30 rounded-md p-3">
          <p className="text-sm font-medium text-signal">
            Malnutrition flagged: {MUAC_LABEL[latestMuac.muacClassification]}
          </p>
          <p className="text-xs text-ink-soft mt-0.5">
            From the most recent measurement ({new Date(latestMuac.measurementDate).toLocaleDateString()}) — refer per
            facility malnutrition management protocol.
          </p>
        </div>
      )}

      <Card
        title="Growth measurements"
        action={
          <button onClick={() => setShowMeasurementForm((v) => !v)} className="text-xs font-medium text-teal hover:text-teal-strong">
            {showMeasurementForm ? 'Close' : '+ Record measurement'}
          </button>
        }
      >
        {showMeasurementForm && (
          <MeasurementForm
            patientId={patientId}
            encounterId={encounterId}
            onRecorded={() => {
              setShowMeasurementForm(false);
              load();
            }}
          />
        )}

        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-ink-soft mb-1">Weight (kg)</p>
            <Sparkline
              points={(measurements || []).filter((m) => m.weightKg != null).map((m) => ({ value: m.weightKg }))}
              unit="kg"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft mb-1">Height/length (cm)</p>
            <Sparkline
              points={(measurements || []).filter((m) => m.heightCm != null).map((m) => ({ value: m.heightCm }))}
              unit="cm"
            />
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft mb-1">MUAC (cm)</p>
            <Sparkline
              points={(measurements || []).filter((m) => m.muacCm != null).map((m) => ({ value: m.muacCm }))}
              unit="cm"
            />
          </div>
        </div>

        {measurements?.length > 0 && (
          <ul className="divide-y divide-border border-t border-border">
            {[...measurements].reverse().map((m) => (
              <li key={m._id} className="px-4 py-2 flex items-center justify-between text-sm">
                <span className="text-ink-soft">{new Date(m.measurementDate).toLocaleDateString()}</span>
                <span className="text-ink">
                  {m.weightKg && `${m.weightKg}kg`} {m.heightCm && `· ${m.heightCm}cm`} {m.muacCm && `· MUAC ${m.muacCm}cm`}
                </span>
                <Pill tone={MUAC_TONE[m.muacClassification] || 'ink'}>{MUAC_LABEL[m.muacClassification] || m.muacClassification}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Immunization schedule"
        action={
          <button onClick={() => setShowVaccineForm((v) => !v)} className="text-xs font-medium text-teal hover:text-teal-strong">
            {showVaccineForm ? 'Close' : '+ Record dose given'}
          </button>
        }
      >
        {showVaccineForm && (
          <VaccineForm
            patientId={patientId}
            encounterId={encounterId}
            onRecorded={() => {
              setShowVaccineForm(false);
              load();
            }}
          />
        )}

        {!schedule ? (
          <p className="text-sm text-ink-soft p-4">No recorded date of birth — immunization scheduling needs a known age.</p>
        ) : (
          <ul className="divide-y divide-border">
            {schedule.schedule.map((entry) => (
              <li key={`${entry.vaccine}_${entry.dose}`} className="px-4 py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="text-ink font-medium">
                    {entry.vaccine} {entry.dose > 0 ? `dose ${entry.dose}` : ''}
                  </span>
                  <p className="text-xs text-ink-soft">{entry.protectsAgainst}</p>
                </div>
                <Pill tone={STATUS_TONE[entry.status] || 'ink'}>{entry.status.replace(/_/g, ' ')}</Pill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function MeasurementForm({ patientId, encounterId, onRecorded }) {
  const [form, setForm] = useState({ weightKg: '', heightCm: '', headCircumferenceCm: '', muacCm: '', oedemaPresent: false });
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/mch/growth-measurements', {
        patientId,
        encounterId,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        headCircumferenceCm: form.headCircumferenceCm ? Number(form.headCircumferenceCm) : undefined,
        muacCm: form.muacCm ? Number(form.muacCm) : undefined,
        oedemaPresent: form.oedemaPresent,
      });
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record measurement.');
    }
  }

  const inputClass = 'w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none';

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3 border-b border-border bg-canvas">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Weight (kg)</label>
          <input type="number" step="0.1" value={form.weightKg} onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Height/length (cm)</label>
          <input type="number" step="0.1" value={form.heightCm} onChange={(e) => setForm((f) => ({ ...f, heightCm: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Head circ. (cm)</label>
          <input type="number" step="0.1" value={form.headCircumferenceCm} onChange={(e) => setForm((f) => ({ ...f, headCircumferenceCm: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">MUAC (cm)</label>
          <input type="number" step="0.1" value={form.muacCm} onChange={(e) => setForm((f) => ({ ...f, muacCm: e.target.value }))} className={inputClass} />
        </div>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink">
        <input type="checkbox" checked={form.oedemaPresent} onChange={(e) => setForm((f) => ({ ...f, oedemaPresent: e.target.checked }))} />
        Bilateral pitting edema present
      </label>
      {error && <p className="text-xs text-signal">{error}</p>}
      <button type="submit" className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors">
        Record
      </button>
    </form>
  );
}

function VaccineForm({ patientId, encounterId, onRecorded }) {
  const [form, setForm] = useState({ vaccine: '', dose: '' });
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/mch/immunizations', {
        patientId,
        encounterId,
        vaccine: form.vaccine,
        dose: Number(form.dose),
      });
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record dose.');
    }
  }

  const inputClass = 'rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none';

  return (
    <form onSubmit={handleSubmit} className="p-4 flex flex-wrap items-end gap-3 border-b border-border bg-canvas">
      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Vaccine</label>
        <input required value={form.vaccine} onChange={(e) => setForm((f) => ({ ...f, vaccine: e.target.value }))} placeholder="e.g. Pentavalent" className={inputClass} />
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Dose #</label>
        <input required type="number" min="0" value={form.dose} onChange={(e) => setForm((f) => ({ ...f, dose: e.target.value }))} className={`${inputClass} w-20`} />
      </div>
      {error && <p className="text-xs text-signal">{error}</p>}
      <button type="submit" className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors">
        Record dose
      </button>
    </form>
  );
}
