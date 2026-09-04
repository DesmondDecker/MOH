import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList } from '../../components/ui';

// ---------------------------------------------------------------------------
// Receive Stock Form — supports both catalog dropdown AND free-text entry
// ---------------------------------------------------------------------------
function ReceiveStockForm({ facilityId, onReceived }) {
  const [items, setItems] = useState([]);
  const [mode, setMode] = useState('catalog'); // 'catalog' | 'manual'
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [newDrugName, setNewDrugName] = useState('');
  const [newDrugUnit, setNewDrugUnit] = useState('tablet');
  const [newDrugCategory, setNewDrugCategory] = useState('drug');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState('');
  const [supplier, setSupplier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    api.get('/api/inventory/items').then(setItems).catch(() => setItems([]));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      let itemId = inventoryItemId;
      if (mode === 'manual') {
        if (!newDrugName.trim()) { setError('Drug name is required.'); setSubmitting(false); return; }
        const created = await api.post('/api/inventory/items/manual', {
          name: newDrugName.trim(), category: newDrugCategory, unit: newDrugUnit.trim() || 'unit',
        });
        itemId = created._id;
        setItems((prev) => [...prev, created]);
      }
      await api.post(`/api/inventory/facility/${facilityId}/receive`, {
        inventoryItemId: itemId, batchNumber, expiryDate, quantity: Number(quantity), supplier,
      });
      setSuccess(mode === 'manual' ? `"${newDrugName}" added to catalog and stock recorded.` : 'Stock receipt recorded.');
      setBatchNumber(''); setExpiryDate(''); setQuantity(''); setSupplier(''); setNewDrugName(''); setInventoryItemId('');
      onReceived();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record stock receipt.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3 border-b border-border">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-ink-soft">Medicine:</span>
        <button type="button" onClick={() => setMode('catalog')}
          className={`text-xs px-3 py-1 rounded border transition-colors ${mode === 'catalog' ? 'bg-teal text-white border-teal' : 'bg-white text-ink border-border hover:bg-canvas'}`}>
          From catalog
        </button>
        <button type="button" onClick={() => setMode('manual')}
          className={`text-xs px-3 py-1 rounded border transition-colors ${mode === 'manual' ? 'bg-teal text-white border-teal' : 'bg-white text-ink border-border hover:bg-canvas'}`}>
          Type new drug
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {mode === 'catalog' ? (
          <div className="col-span-2">
            <label className="block text-xs font-medium text-ink-soft mb-1">Item</label>
            <select required value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
              <option value="">Select an item…</option>
              {items.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-ink-soft mb-1">Drug / item name</label>
              <input value={newDrugName} onChange={(e) => setNewDrugName(e.target.value)}
                placeholder="e.g. Amoxicillin 250mg" required={mode === 'manual'}
                className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Category</label>
              <select value={newDrugCategory} onChange={(e) => setNewDrugCategory(e.target.value)}
                className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
                <option value="drug">Drug</option>
                <option value="consumable">Consumable</option>
                <option value="equipment">Equipment</option>
                <option value="reagent">Reagent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Unit</label>
              <input value={newDrugUnit} onChange={(e) => setNewDrugUnit(e.target.value)}
                placeholder="tablet, vial, box…"
                className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Batch #</label>
          <input required value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Quantity</label>
          <input type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Expiry date</label>
          <input type="date" required value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Supplier (optional)</label>
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
      </div>

      {error && <p className="text-sm text-signal">{error}</p>}
      {success && <p className="text-sm text-moss">{success}</p>}

      <button type="submit" disabled={submitting}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60">
        {submitting ? 'Recording…' : 'Record receipt'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Stock Adjust Form — add or reduce stock with reason
// ---------------------------------------------------------------------------
function AdjustStockForm({ facilityId, stock, onAdjusted }) {
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [type, setType] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const ADD_REASONS = ['Physical count correction', 'Donation received', 'Return from ward', 'Other'];
  const REDUCE_REASONS = ['damaged', 'expired', 'contaminated', 'other'];

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null); setSuccess(null); setSubmitting(true);
    try {
      await api.post(`/api/inventory/facility/${facilityId}/adjust`, {
        inventoryItemId, quantity: Number(quantity), type, reason, notes,
      });
      const item = stock?.find((s) => s.inventoryItemId === inventoryItemId);
      setSuccess(`${type === 'add' ? 'Added' : 'Reduced'} ${quantity} units of ${item?.name || 'item'}.`);
      setQuantity(''); setNotes(''); setReason('');
      onAdjusted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Adjustment failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 space-y-3 border-b border-border">
      <p className="text-xs text-ink-soft">
        Use <strong>Add</strong> for physical count corrections or donations. Use <strong>Reduce</strong> for damaged, expired, or lost stock. All adjustments are logged in the audit trail.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-soft mb-1">Item</label>
          <select required value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
            <option value="">Select item…</option>
            {(stock || []).map((s) => (
              <option key={s.inventoryItemId} value={s.inventoryItemId}>
                {s.name} ({s.totalQuantity} {s.unit})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Action</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setReason(''); }}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
            <option value="add">Add stock ↑</option>
            <option value="reduce">Reduce stock ↓</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">Quantity</label>
          <input type="number" min="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-soft mb-1">Reason</label>
          <select required value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none">
            <option value="">Select reason…</option>
            {(type === 'add' ? ADD_REASONS : REDUCE_REASONS).map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-ink-soft mb-1">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional details…"
            className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none" />
        </div>
      </div>

      {error && <p className="text-sm text-signal">{error}</p>}
      {success && <p className="text-sm text-moss">{success}</p>}

      <button type="submit" disabled={submitting}
        className={`text-white text-sm font-medium rounded px-4 py-1.5 transition-colors disabled:opacity-60 ${type === 'add' ? 'bg-teal hover:bg-teal-strong' : 'bg-clay hover:opacity-80'}`}>
        {submitting ? 'Saving…' : type === 'add' ? 'Add stock' : 'Reduce stock'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
const RISK_TONE = { critical: 'signal', warning: 'clay', ok: 'moss', unknown: 'ink' };
const RISK_LABEL = { critical: 'Critical', warning: 'Watch', ok: 'Healthy', unknown: 'No recent usage' };

export default function InventoryPage() {
  const { user } = useAuth();
  const [stock, setStock] = useState(null);
  const [forecasts, setForecasts] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('receive');

  const loadStock = useCallback(async () => {
    if (!user?.facilityId) return;
    try {
      const [stockData, forecastData] = await Promise.all([
        api.get(`/api/inventory/facility/${user.facilityId}/stock`),
        api.get(`/api/inventory/facility/${user.facilityId}/forecast`),
      ]);
      setStock(stockData); setForecasts(forecastData); setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load stock levels.');
    }
  }, [user?.facilityId]);

  useEffect(() => { loadStock(); }, [loadStock]);

  const forecastByItem = new Map((forecasts || []).map((f) => [f.inventoryItemId, f]));
  const criticalCount = (forecasts || []).filter((f) => f.riskLevel === 'critical').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Inventory</h1>
        <p className="text-sm text-ink-soft mt-1">Current stock levels. Staff can type new drug names when receiving stock.</p>
      </div>

      {criticalCount > 0 && (
        <div className="bg-signal-soft border border-signal/30 rounded-md px-4 py-3">
          <p className="text-sm font-medium text-signal">
            {criticalCount} {criticalCount === 1 ? 'item is' : 'items are'} projected to run out within 7 days.
          </p>
        </div>
      )}

      <Card title="Manage stock"
        action={
          <div className="flex gap-1 bg-canvas rounded p-0.5">
            <button onClick={() => setActiveTab('receive')}
              className={`text-xs px-3 py-1 rounded transition-colors ${activeTab === 'receive' ? 'bg-teal text-white' : 'text-ink-soft hover:text-ink'}`}>
              Receive
            </button>
            <button onClick={() => setActiveTab('adjust')}
              className={`text-xs px-3 py-1 rounded transition-colors ${activeTab === 'adjust' ? 'bg-teal text-white' : 'text-ink-soft hover:text-ink'}`}>
              Adjust
            </button>
          </div>
        }>
        {activeTab === 'receive'
          ? <ReceiveStockForm facilityId={user.facilityId} onReceived={loadStock} />
          : <AdjustStockForm facilityId={user.facilityId} stock={stock} onAdjusted={loadStock} />}
      </Card>

      <Card title="Stock levels">
        {error && <ErrorState message={error} />}
        {!error && stock === null && <SkeletonList rows={4} columns={4} />}
        {!error && stock?.length === 0 && <EmptyState message="No stock recorded yet." />}
        {!error && stock?.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium">On hand</th>
                <th className="px-4 py-2 font-medium">Nearest expiry</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Projected runway</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stock.map((item) => {
                const forecast = forecastByItem.get(item.inventoryItemId);
                return (
                  <tr key={item.inventoryItemId} className="hover:bg-canvas/50">
                    <td className="px-4 py-2.5 text-ink font-medium">{item.name}</td>
                    <td className="px-4 py-2.5 text-ink-soft capitalize">{item.category}</td>
                    <td className="px-4 py-2.5 font-mono text-ink">{item.totalQuantity} {item.unit}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-soft text-xs">
                      {new Date(item.nearestExpiry).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {item.belowThreshold ? <Pill tone="clay">Below threshold</Pill> : <Pill tone="moss">OK</Pill>}
                    </td>
                    <td className="px-4 py-2.5">
                      {forecast ? (
                        <div className="flex items-center gap-2">
                          <Pill tone={RISK_TONE[forecast.riskLevel]}>{RISK_LABEL[forecast.riskLevel]}</Pill>
                          {forecast.daysRemaining !== null && (
                            <span className="text-xs text-ink-soft font-mono">~{forecast.daysRemaining}d</span>
                          )}
                        </div>
                      ) : <span className="text-xs text-ink-soft">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
