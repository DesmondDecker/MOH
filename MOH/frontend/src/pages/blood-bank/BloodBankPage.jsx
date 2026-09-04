import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList, AsyncButton, DropletIcon, ClockIcon } from '../../components/ui';

class CancelledAction extends Error {}

export default function BloodBankPage() {
  const { user } = useAuth();
  const [reference, setReference] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [expiring, setExpiring] = useState(null);
  const [error, setError] = useState(null);
  const [showIntake, setShowIntake] = useState(false);
  const [compatQuery, setCompatQuery] = useState({ recipientType: '', component: '' });
  const [compatResult, setCompatResult] = useState(null);

  const load = useCallback(() => {
    if (!user?.facilityId) return;
    api
      .get(`/api/blood-bank/facility/${user.facilityId}/inventory`)
      .then((data) => {
        setInventory(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load blood bank inventory.'));

    api
      .get(`/api/blood-bank/facility/${user.facilityId}/expiring?days=7`)
      .then(setExpiring)
      .catch(() => setExpiring([]));
  }, [user?.facilityId]);

  useEffect(() => {
    api.get('/api/blood-bank/reference').then(setReference).catch(() => {});
    load();
  }, [load]);

  async function handleCompatSearch(e) {
    e.preventDefault();
    if (!compatQuery.recipientType || !compatQuery.component) return;
    try {
      const params = new URLSearchParams(compatQuery);
      const result = await api.get(`/api/blood-bank/facility/${user.facilityId}/compatible?${params}`);
      setCompatResult(result);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not search compatible units.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Blood bank</h1>
          <p className="text-sm text-ink-soft mt-1">
            Individually tracked units, from donation through transfusion or discard — every compatibility check here
            is an inventory-level filter, not a substitute for the laboratory crossmatch.
          </p>
        </div>
        <button
          onClick={() => setShowIntake((v) => !v)}
          className="text-xs font-medium text-white bg-teal hover:bg-teal-strong rounded-md px-3 py-1.5 transition-colors shrink-0"
        >
          {showIntake ? 'Close' : '+ Register unit'}
        </button>
      </div>

      {expiring?.length > 0 && (
        <div className="bg-signal-soft border border-signal/30 rounded-md p-3 flex items-start gap-2">
          <ClockIcon className="text-signal shrink-0 mt-0.5" width={16} height={16} />
          <p className="text-sm text-ink">
            <strong>{expiring.length}</strong> unit{expiring.length > 1 ? 's' : ''} expiring within 7 days —{' '}
            {expiring.map((u) => u.unitNumber).join(', ')}.
          </p>
        </div>
      )}

      {reference && (
        <IntakeForm open={showIntake} reference={reference} facilityId={user.facilityId} onCreated={load} />
      )}

      <Card title="Compatibility search">
        <form onSubmit={handleCompatSearch} className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Recipient blood type</label>
            <select
              required
              value={compatQuery.recipientType}
              onChange={(e) => setCompatQuery((q) => ({ ...q, recipientType: e.target.value }))}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            >
              <option value="">Select type</option>
              {reference?.bloodTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Component</label>
            <select
              required
              value={compatQuery.component}
              onChange={(e) => setCompatQuery((q) => ({ ...q, component: e.target.value }))}
              className="rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            >
              <option value="">Select component</option>
              {reference?.components.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors"
          >
            Search
          </button>
        </form>
        {compatResult && (
          <div className="px-4 pb-4">
            <p className="text-xs text-ink-soft mb-2">
              Compatible donor types: <strong>{compatResult.compatibleDonorTypes.join(', ')}</strong>
            </p>
            {compatResult.units.length === 0 ? (
              <EmptyState
                icon={<DropletIcon />}
                title="No compatible units available"
                description="Nothing in stock right now matches this recipient type and component."
              />
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md">
                {compatResult.units.map((u) => (
                  <li key={u._id} className="px-3 py-2 flex items-center justify-between text-sm">
                    <span className="font-mono text-ink">
                      {u.unitNumber} · {u.bloodType}
                    </span>
                    <span className="text-xs text-ink-soft">expires {new Date(u.expiryDate).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card title="Inventory">
        {error && <ErrorState message={error} />}
        {!error && inventory === null && <SkeletonList rows={5} columns={5} />}
        {!error && inventory?.units.length === 0 && (
          <EmptyState icon={<DropletIcon />} title="No units registered" description="Register the first unit above." />
        )}
        {!error && inventory?.units.length > 0 && (
          <ul className="divide-y divide-border">
            {inventory.units.map((unit) => (
              <UnitRow key={unit._id} unit={unit} onChanged={load} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function IntakeForm({ open, reference, facilityId, onCreated }) {
  const [form, setForm] = useState({
    bloodType: '',
    component: '',
    volumeMl: '',
    donorFullName: '',
    donorIdNumber: '',
    donorPhone: '',
    collectionDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api.post(`/api/blood-bank/facility/${facilityId}/units`, {
        ...form,
        volumeMl: form.volumeMl ? Number(form.volumeMl) : undefined,
      });
      setIssued(result);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register unit.');
    }
  }

  if (!open) return null;

  return (
    <Card title="Register a new unit">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Blood type</label>
            <select
              required
              value={form.bloodType}
              onChange={(e) => setForm((f) => ({ ...f, bloodType: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            >
              <option value="">Select type</option>
              {reference.bloodTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Component</label>
            <select
              required
              value={form.component}
              onChange={(e) => setForm((f) => ({ ...f, component: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            >
              <option value="">Select component</option>
              {reference.components.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Volume (mL, optional)</label>
            <input
              type="number"
              value={form.volumeMl}
              onChange={(e) => setForm((f) => ({ ...f, volumeMl: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Collection date</label>
            <input
              type="date"
              required
              value={form.collectionDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setForm((f) => ({ ...f, collectionDate: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Donor full name</label>
            <input
              required
              value={form.donorFullName}
              onChange={(e) => setForm((f) => ({ ...f, donorFullName: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Donor ID number (optional)</label>
            <input
              value={form.donorIdNumber}
              onChange={(e) => setForm((f) => ({ ...f, donorIdNumber: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            />
          </div>
        </div>
        {error && <p className="text-sm text-signal">{error}</p>}
        {issued && (
          <p className="text-sm text-teal-strong">
            Registered as <strong>{issued.unitNumber}</strong>, expires {new Date(issued.expiryDate).toLocaleDateString()}.
            Awaiting screening before it can be reserved or transfused.
          </p>
        )}
        <button
          type="submit"
          className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors"
        >
          Register unit
        </button>
      </form>
    </Card>
  );
}

const STATUS_TONE = {
  pending_screening: 'clay',
  available: 'moss',
  reserved: 'clay',
  transfused: 'ink',
  discarded: 'signal',
  expired: 'signal',
};

function UnitRow({ unit, onChanged }) {
  const [screeningOpen, setScreeningOpen] = useState(false);

  function handleError(err) {
    if (err instanceof CancelledAction) return;
    alert(err instanceof ApiError ? err.message : 'Something went wrong.');
  }

  async function handleDiscard() {
    const reason = window.prompt('Discard reason (expired/damaged/contaminated/other):', 'other');
    if (!reason) throw new CancelledAction();
    await api.post(`/api/blood-bank/units/${unit._id}/discard`, { reason });
    onChanged();
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink font-mono">{unit.unitNumber}</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {unit.bloodType} · {unit.component.replace(/_/g, ' ')} · expires{' '}
            {new Date(unit.expiryDate).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill tone={STATUS_TONE[unit.status] || 'ink'}>{unit.status.replace(/_/g, ' ')}</Pill>
          {unit.status === 'pending_screening' && (
            <button
              onClick={() => setScreeningOpen((v) => !v)}
              className="text-xs font-medium text-teal hover:text-teal-strong"
            >
              Screen
            </button>
          )}
          {unit.status === 'available' && (
            <AsyncButton onClick={handleDiscard} onError={handleError} loadingLabel="Discarding…" successLabel="Discarded">
              Discard
            </AsyncButton>
          )}
        </div>
      </div>

      {screeningOpen && <ScreeningForm unit={unit} onDone={() => { setScreeningOpen(false); onChanged(); }} />}
    </li>
  );
}

function ScreeningForm({ unit, onDone }) {
  const [screenedFor, setScreenedFor] = useState({ hiv: false, hepatitisB: false, hepatitisC: false, syphilis: false });
  const [error, setError] = useState(null);

  async function submit(result) {
    setError(null);
    if (result === 'cleared' && !Object.values(screenedFor).every(Boolean)) {
      setError('All four screening markers must be checked before clearing a unit.');
      return;
    }
    try {
      await api.post(`/api/blood-bank/units/${unit._id}/screening`, { result, screenedFor });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record screening result.');
    }
  }

  return (
    <div className="mt-3 bg-canvas border border-border rounded-md p-3 space-y-2">
      <p className="text-xs font-medium text-ink-soft">Infectious disease screening (WHO minimum panel)</p>
      <div className="flex flex-wrap gap-3">
        {Object.keys(screenedFor).map((key) => (
          <label key={key} className="flex items-center gap-1.5 text-xs text-ink capitalize">
            <input
              type="checkbox"
              checked={screenedFor[key]}
              onChange={(e) => setScreenedFor((s) => ({ ...s, [key]: e.target.checked }))}
            />
            {key.replace(/([A-Z])/g, ' $1')}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-signal">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => submit('cleared')}
          className="bg-moss text-white text-xs font-medium rounded px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          Clear unit
        </button>
        <button
          onClick={() => submit('reactive')}
          className="bg-signal text-white text-xs font-medium rounded px-3 py-1.5 hover:opacity-90 transition-opacity"
        >
          Reactive — discard
        </button>
      </div>
    </div>
  );
}
