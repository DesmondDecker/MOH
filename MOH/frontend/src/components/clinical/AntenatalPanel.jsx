import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Card, Pill } from '../ui';

const DANGER_SIGN_LABELS = {
  vaginal_bleeding: 'Vaginal bleeding',
  severe_headache: 'Severe headache',
  blurred_vision: 'Blurred vision',
  convulsions: 'Convulsions',
  severe_abdominal_pain: 'Severe abdominal pain',
  high_fever: 'High fever',
  reduced_fetal_movement: 'Reduced fetal movement',
  swelling_face_hands: 'Swelling of face/hands',
  draining_liquor: 'Draining liquor',
};

export default function AntenatalPanel({ patientId, encounterId }) {
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  function load() {
    api
      .get(`/api/mch/antenatal-visits/patient/${patientId}`)
      .then(setVisits)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load antenatal history.'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const latest = visits?.length ? visits[visits.length - 1] : null;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-signal">{error}</p>}

      {latest?.dangerSigns?.length > 0 && (
        <div className="bg-signal-soft border border-signal/30 rounded-md p-3">
          <p className="text-sm font-medium text-signal">Danger signs flagged at most recent visit</p>
          <p className="text-xs text-ink mt-0.5">
            {latest.dangerSigns.map((d) => DANGER_SIGN_LABELS[d] || d).join(', ')} — visit {latest.visitNumber} on{' '}
            {new Date(latest.createdAt).toLocaleDateString()}.
          </p>
        </div>
      )}

      <Card
        title="Antenatal visits"
        action={
          <button onClick={() => setShowForm((v) => !v)} className="text-xs font-medium text-teal hover:text-teal-strong">
            {showForm ? 'Close' : '+ Record visit'}
          </button>
        }
      >
        {showForm && (
          <VisitForm
            patientId={patientId}
            encounterId={encounterId}
            nextVisitNumber={(visits?.length || 0) + 1}
            onRecorded={() => {
              setShowForm(false);
              load();
            }}
          />
        )}

        {visits?.length === 0 && <p className="text-sm text-ink-soft p-4">No antenatal visits recorded yet.</p>}

        {visits?.length > 0 && (
          <ul className="divide-y divide-border">
            {[...visits].reverse().map((v) => (
              <li key={v._id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">
                    Visit {v.visitNumber} · {v.gestationalAgeWeeks} weeks gestation
                  </p>
                  <span className="text-xs text-ink-soft">{new Date(v.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-ink-soft mt-1">
                  {v.weightKg && `Weight ${v.weightKg}kg`} {v.bloodPressureSystolic && `· BP ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`}{' '}
                  {v.fetalHeartRateBpm && `· FHR ${v.fetalHeartRateBpm}bpm`} {v.hemoglobinGdl && `· Hb ${v.hemoglobinGdl}g/dL`}
                </p>
                {v.dangerSigns?.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.dangerSigns.map((d) => (
                      <Pill key={d} tone="signal">
                        {DANGER_SIGN_LABELS[d] || d}
                      </Pill>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

const DANGER_SIGN_KEYS = Object.keys(DANGER_SIGN_LABELS);

function VisitForm({ patientId, encounterId, nextVisitNumber, onRecorded }) {
  const [form, setForm] = useState({
    visitNumber: nextVisitNumber,
    gestationalAgeWeeks: '',
    weightKg: '',
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    fetalHeartRateBpm: '',
    hemoglobinGdl: '',
    dangerSigns: [],
  });
  const [error, setError] = useState(null);

  function toggleDangerSign(sign) {
    setForm((f) => ({
      ...f,
      dangerSigns: f.dangerSigns.includes(sign) ? f.dangerSigns.filter((d) => d !== sign) : [...f.dangerSigns, sign],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('/api/mch/antenatal-visits', {
        patientId,
        encounterId,
        visitNumber: Number(form.visitNumber),
        gestationalAgeWeeks: Number(form.gestationalAgeWeeks),
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        bloodPressureSystolic: form.bloodPressureSystolic ? Number(form.bloodPressureSystolic) : undefined,
        bloodPressureDiastolic: form.bloodPressureDiastolic ? Number(form.bloodPressureDiastolic) : undefined,
        fetalHeartRateBpm: form.fetalHeartRateBpm ? Number(form.fetalHeartRateBpm) : undefined,
        hemoglobinGdl: form.hemoglobinGdl ? Number(form.hemoglobinGdl) : undefined,
        dangerSigns: form.dangerSigns,
      });
      onRecorded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record visit.');
    }
  }

  const inputClass = 'w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none';

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-3 border-b border-border bg-canvas">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Visit #</label>
          <input required type="number" min="1" value={form.visitNumber} onChange={(e) => setForm((f) => ({ ...f, visitNumber: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Gestational age (wks)</label>
          <input required type="number" step="0.1" value={form.gestationalAgeWeeks} onChange={(e) => setForm((f) => ({ ...f, gestationalAgeWeeks: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Weight (kg)</label>
          <input type="number" step="0.1" value={form.weightKg} onChange={(e) => setForm((f) => ({ ...f, weightKg: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Hb (g/dL)</label>
          <input type="number" step="0.1" value={form.hemoglobinGdl} onChange={(e) => setForm((f) => ({ ...f, hemoglobinGdl: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">BP systolic</label>
          <input type="number" value={form.bloodPressureSystolic} onChange={(e) => setForm((f) => ({ ...f, bloodPressureSystolic: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">BP diastolic</label>
          <input type="number" value={form.bloodPressureDiastolic} onChange={(e) => setForm((f) => ({ ...f, bloodPressureDiastolic: e.target.value }))} className={inputClass} />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Fetal heart rate</label>
          <input type="number" value={form.fetalHeartRateBpm} onChange={(e) => setForm((f) => ({ ...f, fetalHeartRateBpm: e.target.value }))} className={inputClass} />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-ink-soft mb-1">Danger signs</p>
        <div className="flex flex-wrap gap-2">
          {DANGER_SIGN_KEYS.map((sign) => (
            <label key={sign} className="flex items-center gap-1.5 text-xs text-ink">
              <input type="checkbox" checked={form.dangerSigns.includes(sign)} onChange={() => toggleDangerSign(sign)} />
              {DANGER_SIGN_LABELS[sign]}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-signal">{error}</p>}
      <button type="submit" className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors">
        Record visit
      </button>
    </form>
  );
}
