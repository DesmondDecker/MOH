import { useEffect, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState } from '../../components/ui';

const RISK_TONE = { critical: 'signal', warning: 'clay', ok: 'moss', unknown: 'ink' };
const RISK_LABEL = { critical: 'Critical', warning: 'Watch', ok: 'Healthy', unknown: 'No recent usage' };

export default function NationalInventoryPage() {
  const [items, setItems] = useState([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [stock, setStock] = useState(null);
  const [forecasts, setForecasts] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/inventory/items')
      .then((data) => {
        setItems(data);
        if (data.length > 0) setSelectedItemId(data[0]._id);
      })
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (!selectedItemId) return;
    Promise.all([
      api.get(`/api/moh/inventory/national?inventoryItemId=${selectedItemId}`),
      api.get(`/api/moh/inventory/forecast?inventoryItemId=${selectedItemId}`),
    ])
      .then(([stockData, forecastData]) => {
        setStock(stockData);
        setForecasts(forecastData);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load national stock data.'));
  }, [selectedItemId]);

  // Merge forecast fields onto the stock rows keyed by facility, so the
  // table shows one row per facility rather than juggling two datasets.
  const forecastByFacility = new Map((forecasts || []).map((f) => [f.facilityId, f]));
  const criticalCount = (forecasts || []).filter((f) => f.riskLevel === 'critical').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">National inventory</h1>
        <p className="text-sm text-ink-soft mt-1">
          Stock for a single item across every facility — lowest first, to spot where a transfer would help.
        </p>
      </div>

      <select
        value={selectedItemId}
        onChange={(e) => setSelectedItemId(e.target.value)}
        className="rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
      >
        {items.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name}
          </option>
        ))}
      </select>

      {error && <ErrorState message={error} />}

      {!error && criticalCount > 0 && (
        <div className="bg-signal-soft border border-signal/30 rounded-md px-4 py-3">
          <p className="text-sm font-medium text-signal">
            {criticalCount} {criticalCount === 1 ? 'facility is' : 'facilities are'} projected to run out within 7
            days at current dispense rate.
          </p>
        </div>
      )}

      {!error && stock && (
        <Card>
          {stock.length === 0 ? (
            <EmptyState message="No stock recorded for this item at any facility." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Facility</th>
                  <th className="px-4 py-2 font-medium">District</th>
                  <th className="px-4 py-2 font-medium">On hand</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Projected runway</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {stock.map((row) => {
                  const forecast = forecastByFacility.get(row.facilityId);
                  return (
                    <tr key={row.facilityId}>
                      <td className="px-4 py-2.5 text-ink font-medium">{row.facilityName}</td>
                      <td className="px-4 py-2.5 text-ink-soft">{row.district}</td>
                      <td className="px-4 py-2.5 font-mono text-ink">
                        {row.totalQuantity} {row.unit}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.belowThreshold ? <Pill tone="clay">Low</Pill> : <Pill tone="moss">OK</Pill>}
                      </td>
                      <td className="px-4 py-2.5">
                        {forecast ? (
                          <div className="flex items-center gap-2">
                            <Pill tone={RISK_TONE[forecast.riskLevel]}>{RISK_LABEL[forecast.riskLevel]}</Pill>
                            {forecast.daysRemaining !== null && (
                              <span className="text-xs text-ink-soft font-mono">
                                ~{forecast.daysRemaining}d at {forecast.avgDailyConsumption}/day
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-soft">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
