import { useState } from 'react';
import { offlineQueue } from '../../lib/offlineQueue';
import { syncPendingVisits } from '../../lib/chwSync';

const VISIT_TYPES = [
  { value: 'immunization_outreach', label: 'Immunization outreach' },
  { value: 'antenatal_followup', label: 'Antenatal follow-up' },
  { value: 'postnatal_followup', label: 'Postnatal follow-up' },
  { value: 'growth_monitoring', label: 'Growth monitoring' },
  { value: 'disease_surveillance', label: 'Disease surveillance' },
  { value: 'health_education', label: 'Health education' },
  { value: 'other', label: 'Other' },
];

const DANGER_SIGNS = [
  { value: 'severe_illness', label: 'Severe illness' },
  { value: 'malnutrition_signs', label: 'Signs of malnutrition' },
  { value: 'fever', label: 'Fever' },
  { value: 'difficulty_breathing', label: 'Difficulty breathing' },
  { value: 'diarrhea_dehydration', label: 'Diarrhea / dehydration' },
  { value: 'pregnancy_danger_sign', label: 'Pregnancy danger sign' },
  { value: 'newborn_danger_sign', label: 'Newborn danger sign' },
];

const emptyForm = {
  fullName: '',
  approximateAge: '',
  sex: '',
  community: '',
  visitType: 'immunization_outreach',
  findings: '',
  dangerSignsObserved: [],
  referralNeeded: false,
  referralReason: '',
};

export default function NewVisitPage() {
  const [form, setForm] = useState(emptyForm);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [location, setLocation] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  function toggleDangerSign(sign) {
    setForm((f) => ({
      ...f,
      dangerSignsObserved: f.dangerSignsObserved.includes(sign)
        ? f.dangerSignsObserved.filter((s) => s !== sign)
        : [...f.dangerSignsObserved, sign],
    }));
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }
    setLocationStatus('fetching');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocationStatus('captured');
      },
      () => setLocationStatus('denied'),
      { timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.fullName.trim()) {
      setError('Name is required.');
      return;
    }

    try {
      await offlineQueue.queueVisit({
        provisionalSubject: {
          fullName: form.fullName.trim(),
          approximateAge: form.approximateAge.trim() || undefined,
          sex: form.sex || undefined,
          community: form.community.trim() || undefined,
        },
        visitType: form.visitType,
        visitDate: new Date().toISOString(),
        location: location || undefined,
        findings: form.findings.trim() || undefined,
        dangerSignsObserved: form.dangerSignsObserved,
        referralNeeded: form.referralNeeded,
        referralReason: form.referralNeeded ? form.referralReason.trim() || undefined : undefined,
      });

      setSaved(true);
      setForm(emptyForm);
      setLocation(null);
      setLocationStatus('idle');

      syncPendingVisits().catch(() => {});
    } catch {
      setError('Could not save the visit on this device. Please try again.');
    }
  }

  if (saved) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex h-12 w-12 rounded-full bg-moss-soft items-center justify-center mb-3">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#16a34a" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-sm font-medium text-ink">Visit saved on this device</p>
        <p className="text-xs text-ink-soft mt-1">It will sync automatically once you have a connection.</p>
        <button
          onClick={() => setSaved(false)}
          className="mt-4 bg-teal text-white text-sm font-medium rounded-md px-4 py-2 hover:bg-teal-strong transition-colors"
        >
          Record another visit
        </button>
      </div>
    );
  }

  const inputClass = 'w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Name</label>
        <input required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} className={inputClass} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Approximate age</label>
          <input
            placeholder="e.g. 6 months"
            value={form.approximateAge}
            onChange={(e) => setForm((f) => ({ ...f, approximateAge: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Sex</label>
          <select value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))} className={inputClass}>
            <option value="">Not recorded</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Community / village</label>
        <input value={form.community} onChange={(e) => setForm((f) => ({ ...f, community: e.target.value }))} className={inputClass} />
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Visit type</label>
        <select value={form.visitType} onChange={(e) => setForm((f) => ({ ...f, visitType: e.target.value }))} className={inputClass}>
          {VISIT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <button
          type="button"
          onClick={captureLocation}
          className="text-xs font-medium text-teal hover:text-teal-strong border border-border rounded-md px-3 py-1.5"
        >
          {locationStatus === 'captured' ? 'Location captured' : locationStatus === 'fetching' ? 'Getting location...' : '+ Capture GPS location'}
        </button>
        {locationStatus === 'denied' && <p className="text-xs text-ink-soft mt-1">Location unavailable -- visit will save without it.</p>}
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">Findings / notes</label>
        <textarea rows={3} value={form.findings} onChange={(e) => setForm((f) => ({ ...f, findings: e.target.value }))} className={inputClass} />
      </div>

      <div>
        <p className="text-xs font-medium text-ink-soft mb-1.5">Danger signs observed</p>
        <div className="grid grid-cols-2 gap-1.5">
          {DANGER_SIGNS.map((d) => (
            <label key={d.value} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.dangerSignsObserved.includes(d.value)} onChange={() => toggleDangerSign(d.value)} />
              {d.label}
            </label>
          ))}
        </div>
      </div>

      <div className="bg-canvas-raised border border-border rounded-md p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={form.referralNeeded} onChange={(e) => setForm((f) => ({ ...f, referralNeeded: e.target.checked }))} />
          This person needs referral to a facility
        </label>
        {form.referralNeeded && (
          <textarea
            rows={2}
            placeholder="Reason for referral"
            value={form.referralReason}
            onChange={(e) => setForm((f) => ({ ...f, referralReason: e.target.value }))}
            className={`${inputClass} mt-2`}
          />
        )}
      </div>

      {error && <p className="text-sm text-signal">{error}</p>}

      <button type="submit" className="w-full bg-teal text-white text-sm font-medium rounded-md py-3 hover:bg-teal-strong transition-colors">
        Save visit
      </button>
    </form>
  );
}
