import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList } from '../../components/ui';

function RequestTransferForm({ facilityId, onRequested }) {
  const [facilities, setFacilities] = useState([]);
  const [items, setItems] = useState([]);
  const [fromFacilityId, setFromFacilityId] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [quantityRequested, setQuantityRequested] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api
      .get('/api/auth/facilities/directory')
      .then((data) => setFacilities(data.filter((f) => f._id !== facilityId)))
      .catch(() => setFacilities([]));
    api
      .get('/api/inventory/items')
      .then(setItems)
      .catch(() => setItems([]));
  }, [facilityId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setSubmitting(true);
    try {
      await api.post('/api/transfers', {
        fromFacilityId,
        inventoryItemId,
        quantityRequested: Number(quantityRequested),
        reason,
      });
      setSuccess(true);
      setQuantityRequested('');
      setReason('');
      onRequested();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not request transfer.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3 border-b border-border">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label htmlFor="fromFacility" className="block text-xs font-medium text-ink-soft mb-1">
            Request from
          </label>
          <select
            id="fromFacility"
            required
            value={fromFacilityId}
            onChange={(e) => setFromFacilityId(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          >
            <option value="">Select facility…</option>
            {facilities.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name} ({f.district})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="transferItem" className="block text-xs font-medium text-ink-soft mb-1">
            Item
          </label>
          <select
            id="transferItem"
            required
            value={inventoryItemId}
            onChange={(e) => setInventoryItemId(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          >
            <option value="">Select item…</option>
            {items.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quantityRequested" className="block text-xs font-medium text-ink-soft mb-1">
            Quantity
          </label>
          <input
            id="quantityRequested"
            type="number"
            min="1"
            required
            value={quantityRequested}
            onChange={(e) => setQuantityRequested(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
        <div>
          <label htmlFor="reason" className="block text-xs font-medium text-ink-soft mb-1">
            Reason
          </label>
          <input
            id="reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
        </div>
      </div>

      {error && <p className="text-sm text-signal">{error}</p>}
      {success && <p className="text-sm text-moss">Transfer requested.</p>}

      <button
        type="submit"
        disabled={submitting}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
      >
        {submitting ? 'Requesting…' : 'Request transfer'}
      </button>
    </form>
  );
}

function TransferRow({ transfer, facilityId, direction, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  async function handleApprove() {
    setBusy(true);
    try {
      await api.post(`/api/transfers/${transfer._id}/approve`);
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not approve transfer.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/api/transfers/${transfer._id}/reject`, { reason: rejectReason });
      onChanged();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not reject transfer.');
    } finally {
      setBusy(false);
    }
  }

  const statusTone = { pending: 'clay', approved: 'teal', fulfilled: 'moss', rejected: 'signal', cancelled: 'ink' }[
    transfer.status
  ];

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink truncate">{transfer.inventoryItemId?.name}</p>
          <p className="text-xs text-ink-soft">
            {transfer.quantityRequested} {transfer.inventoryItemId?.unit} · {transfer.reason}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Pill tone={statusTone}>{transfer.status}</Pill>
          {direction === 'outgoing' && transfer.status === 'pending' && (
            <>
              <button
                onClick={handleApprove}
                disabled={busy}
                className="text-xs font-medium text-teal hover:text-teal-strong disabled:opacity-50"
              >
                Approve &amp; fulfill
              </button>
              <button
                onClick={() => setRejecting((v) => !v)}
                disabled={busy}
                className="text-xs font-medium text-signal hover:opacity-80 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      {rejecting && (
        <form onSubmit={handleReject} className="mt-2 flex items-center gap-2">
          <input
            required
            placeholder="Reason for rejecting"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="flex-1 rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-signal text-white text-xs font-medium rounded px-3 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            Confirm reject
          </button>
        </form>
      )}
    </li>
  );
}

export default function TransfersPage() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState(null);
  const [outgoing, setOutgoing] = useState(null);
  const [error, setError] = useState(null);

  const loadTransfers = useCallback(async () => {
    if (!user?.facilityId) return;
    try {
      const [inc, out] = await Promise.all([
        api.get(`/api/transfers/facility/${user.facilityId}?direction=incoming`),
        api.get(`/api/transfers/facility/${user.facilityId}?direction=outgoing`),
      ]);
      setIncoming(inc);
      setOutgoing(out);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load transfers.');
    }
  }, [user?.facilityId]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Transfers</h1>
        <p className="text-sm text-ink-soft mt-1">
          Request stock from another facility, or approve/reject requests made of yours.
        </p>
      </div>

      <Card title="Request a transfer">
        <RequestTransferForm facilityId={user.facilityId} onRequested={loadTransfers} />
      </Card>

      {error && <ErrorState message={error} />}

      {!error && (
        <>
          <Card title="Requests awaiting your approval (outgoing from you)">
            {outgoing === null ? (
              <SkeletonList rows={4} columns={4} />
            ) : outgoing.length === 0 ? (
              <EmptyState message="No facilities have requested stock from you." />
            ) : (
              <ul className="divide-y divide-border">
                {outgoing.map((t) => (
                  <TransferRow key={t._id} transfer={t} facilityId={user.facilityId} direction="outgoing" onChanged={loadTransfers} />
                ))}
              </ul>
            )}
          </Card>

          <Card title="Your requests (incoming to you)">
            {incoming === null ? (
              <SkeletonList rows={4} columns={4} />
            ) : incoming.length === 0 ? (
              <EmptyState message="You haven't requested any transfers." />
            ) : (
              <ul className="divide-y divide-border">
                {incoming.map((t) => (
                  <TransferRow key={t._id} transfer={t} facilityId={user.facilityId} direction="incoming" onChanged={loadTransfers} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
