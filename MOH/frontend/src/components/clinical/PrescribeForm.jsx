import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';

const ROUTES = ['oral', 'iv', 'im', 'topical', 'other'];

export default function PrescribeForm({ patientId, encounterId, onPrescribed }) {
  const [items, setItems] = useState([]);
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [quantityPrescribed, setQuantityPrescribed] = useState('');
  const [route, setRoute] = useState('oral');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Allergy conflict + interaction state — set when the backend returns
  // 409 (blocking) or when a successful prescription still came back with
  // non-blocking interactions flagged for awareness.
  const [conflict, setConflict] = useState(null); // { allergyConflict, interactions }
  const [overrideJustification, setOverrideJustification] = useState('');
  const [nonBlockingInteractions, setNonBlockingInteractions] = useState(null);

  useEffect(() => {
    api
      .get('/api/inventory/items')
      .then((data) => setItems(data.filter((i) => i.category === 'drug')))
      .catch(() => setItems([]));
  }, []);

  const selectedItem = items.find((i) => i._id === inventoryItemId);

  async function submitPrescription(withOverride) {
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post('/api/medical-history/prescriptions', {
        patientId,
        encounterId,
        inventoryItemId,
        drugName: selectedItem?.name,
        dosage,
        frequency,
        durationDays: durationDays ? Number(durationDays) : undefined,
        quantityPrescribed: quantityPrescribed ? Number(quantityPrescribed) : undefined,
        route,
        overrideJustification: withOverride ? overrideJustification : undefined,
      });
      onPrescribed(result);
      setConflict(null);
      setOverrideJustification('');
      setDosage('');
      setFrequency('');
      setDurationDays('');
      setQuantityPrescribed('');
      // Moderate/minor interactions don't block, but the prescriber should
      // still see them — surface after a successful submission rather than
      // silently dropping them once the 409 path wasn't hit.
      setNonBlockingInteractions(result.interactionsFlagged?.length ? result.interactionsFlagged : null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && (err.body?.allergyConflict || err.body?.interactions)) {
        setConflict({ allergyConflict: err.body.allergyConflict, interactions: err.body.interactions || [] });
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not create prescription.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!inventoryItemId || !dosage) return;
    setNonBlockingInteractions(null);
    submitPrescription(false);
  }

  function handleOverrideSubmit(e) {
    e.preventDefault();
    if (!overrideJustification.trim()) return;
    submitPrescription(true);
  }

  if (conflict) {
    return (
      <div className="space-y-3">
        {conflict.allergyConflict && (
          <div className="bg-signal-soft border border-signal/30 rounded p-3">
            <p className="text-sm font-medium text-signal">Allergy conflict detected</p>
            <p className="text-sm text-ink mt-1">
              Patient has a recorded allergy to <strong>{conflict.allergyConflict.substance}</strong>
              {conflict.allergyConflict.severity && ` (${conflict.allergyConflict.severity})`}
              {conflict.allergyConflict.reaction && ` — reaction: ${conflict.allergyConflict.reaction}`}.
              {conflict.allergyConflict.matchType === 'cross_reactivity' && (
                <span className="text-ink-soft">
                  {' '}
                  (flagged via drug-class cross-reactivity, not an exact name match — clinical judgment on relevance
                  is still yours.)
                </span>
              )}
            </p>
          </div>
        )}

        {conflict.interactions?.length > 0 && (
          <div className="bg-clay-soft border border-clay/30 rounded p-3 space-y-2">
            <p className="text-sm font-medium text-clay">Drug interaction{conflict.interactions.length > 1 ? 's' : ''} detected</p>
            {conflict.interactions.map((i, idx) => (
              <p key={idx} className="text-sm text-ink">
                <strong className="capitalize">{i.severity}</strong> — with current medication <strong>{i.withDrug}</strong>:{' '}
                {i.description}
              </p>
            ))}
          </div>
        )}

        <form onSubmit={handleOverrideSubmit} className="space-y-2">
          <label htmlFor="override" className="block text-xs font-medium text-ink-soft">
            To prescribe anyway, document why this is clinically necessary:
          </label>
          <textarea
            id="override"
            required
            rows={2}
            value={overrideJustification}
            onChange={(e) => setOverrideJustification(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-signal text-white text-sm font-medium rounded px-4 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {submitting ? 'Prescribing…' : 'Prescribe with override'}
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="text-sm font-medium text-ink-soft hover:text-ink"
            >
              Cancel, choose a different drug
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label htmlFor="drug" className="block text-xs font-medium text-ink-soft mb-1">
            Drug
          </label>
          <select
            id="drug"
            required
            value={inventoryItemId}
            onChange={(e) => setInventoryItemId(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          >
            <option value="">Select…</option>
            {items.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dosage" className="block text-xs font-medium text-ink-soft mb-1">
            Dosage
          </label>
          <input
            id="dosage"
            required
            placeholder="500mg"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="route" className="block text-xs font-medium text-ink-soft mb-1">
            Route
          </label>
          <select
            id="route"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          >
            {ROUTES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="frequency" className="block text-xs font-medium text-ink-soft mb-1">
            Frequency
          </label>
          <input
            id="frequency"
            placeholder="3x daily"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="duration" className="block text-xs font-medium text-ink-soft mb-1">
            Duration (days)
          </label>
          <input
            id="duration"
            type="number"
            min="1"
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="quantityPrescribed" className="block text-xs font-medium text-ink-soft mb-1">
            Quantity (units)
          </label>
          <input
            id="quantityPrescribed"
            type="number"
            min="1"
            placeholder="e.g. 21 tablets"
            value={quantityPrescribed}
            onChange={(e) => setQuantityPrescribed(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
      </div>

      <p className="text-xs text-ink-soft">
        Quantity is optional but recommended — without it, the pharmacy can't tell a partial fill from the full
        course and this prescription is marked fully dispensed after a single dispense of any size.
      </p>

      {nonBlockingInteractions && (
        <div className="bg-clay-soft border border-clay/30 rounded p-3 space-y-1">
          <p className="text-xs font-medium text-clay">
            Prescribed — but note the following interaction{nonBlockingInteractions.length > 1 ? 's' : ''} with the
            patient's current medications:
          </p>
          {nonBlockingInteractions.map((i, idx) => (
            <p key={idx} className="text-xs text-ink">
              <strong className="capitalize">{i.severity}</strong> with <strong>{i.withDrug}</strong>: {i.description}
            </p>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-signal">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
      >
        {submitting ? 'Checking…' : 'Prescribe'}
      </button>
    </form>
  );
}
