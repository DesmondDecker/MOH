import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList, AsyncButton, NumberRoll } from '../../components/ui';

function DispenseRow({ entry, facilityId, onDispensed }) {
  const [dispensing, setDispensing] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState(null);

  const { quantityPrescribed, quantityDispensed = 0 } = entry.prescription || {};
  const tracked = quantityPrescribed !== undefined && quantityPrescribed !== null;
  const remaining = tracked ? quantityPrescribed - quantityDispensed : null;

  async function submitDispense() {
    setError(null);
    const parsedQuantity = Number(quantity);
    if (!quantity || !Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      const err = new Error('Enter a whole number greater than 0');
      setError(err.message);
      throw err;
    }
    try {
      await api.post(`/api/inventory/facility/${facilityId}/dispense/prescription/${entry._id}`, {
        quantity: parsedQuantity,
      });
      onDispensed();
      setDispensing(false);
      setQuantity('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not dispense.');
      throw err;
    }
  }

  const needsLinking = !entry.prescription?.inventoryItemId;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">
            {entry.prescription?.drugName} — {entry.prescription?.dosage}
          </p>
          <p className="text-xs text-ink-soft font-mono">
            {entry.patientId?.mrn} · {entry.patientId?.fullName} · prescribed by {entry.prescribedBy?.fullName}
          </p>
          {tracked ? (
            <p className="text-xs text-ink-soft mt-0.5">
              <NumberRoll value={quantityDispensed} /> of {quantityPrescribed} dispensed
              {remaining > 0 && (
                <>
                  {' '}
                  · <NumberRoll value={remaining} /> remaining
                </>
              )}
            </p>
          ) : (
            <p className="text-xs text-clay mt-0.5 italic">
              No quantity recorded — any dispense marks this fully filled.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {entry.prescription?.allergyConflictOverridden && <Pill tone="signal">Allergy override</Pill>}
          <Pill tone={entry.prescription?.dispenseStatus === 'partially_dispensed' ? 'clay' : 'ink'}>
            {entry.prescription?.dispenseStatus}
          </Pill>
          {!needsLinking && (
            <button
              onClick={() => setDispensing((v) => !v)}
              className="text-xs font-medium text-teal hover:text-teal-strong"
            >
              Dispense
            </button>
          )}
        </div>
      </div>

      {needsLinking && (
        <p className="text-xs text-signal mt-1">
          Not linked to a catalog item — this prescription was recorded without an inventory link and can't be
          dispensed from stock until it is.
        </p>
      )}

      {dispensing && (
        <form
          onSubmit={(e) => e.preventDefault()} // real submission now happens via onKeyDown/AsyncButton below, not native form submit
          className="mt-2 flex items-center gap-2"
        >
          <input
            type="number"
            min="1"
            max={tracked ? remaining : undefined}
            required
            placeholder={tracked ? `Up to ${remaining}` : 'Quantity'}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onKeyDown={(e) => {
              // AsyncButton is type="button" (so a click doesn't ALSO fire a
              // native form submit and double-call the API), which means
              // Enter-to-submit needs handling here explicitly instead of
              // relying on the browser's implicit-submit-button behavior.
              if (e.key === 'Enter') {
                e.preventDefault();
                submitDispense().catch(() => {}); // error already surfaced via `error` state below
              }
            }}
            className="w-32 rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
          <AsyncButton onClick={submitDispense} variant="primary" loadingLabel="Dispensing…" successLabel="Dispensed">
            Confirm
          </AsyncButton>
        </form>
      )}
      {error && <p className="text-sm text-signal mt-1">{error}</p>}
    </li>
  );
}

export default function DispenseQueuePage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user?.facilityId) return;
    try {
      const data = await api.get(`/api/medical-history/facility/${user.facilityId}/pending-prescriptions`);
      setEntries(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the dispense queue.');
    }
  }, [user?.facilityId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Dispense queue</h1>
        <p className="text-sm text-ink-soft mt-1">Prescriptions awaiting dispense, oldest first.</p>
      </div>

      <Card>
        {error && <ErrorState message={error} />}
        {!error && entries === null && <SkeletonList rows={4} columns={4} />}
        {!error && entries?.length === 0 && <EmptyState message="Nothing waiting to be dispensed." />}
        {!error && entries?.length > 0 && (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <DispenseRow key={entry._id} entry={entry} facilityId={user.facilityId} onDispensed={load} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
