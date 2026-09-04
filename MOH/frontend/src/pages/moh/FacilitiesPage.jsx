import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, ErrorState, LiveIndicator, SkeletonList } from '../../components/ui';
import { useLiveActivity } from '../../hooks/useLiveActivity';
import FacilityMap from '../../components/FacilityMap';

export default function FacilitiesPage() {
  const [facilities, setFacilities] = useState(null);
  const [error, setError] = useState(null);
  const [view, setView] = useState('map');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const debounceRef = useRef(null);

  const load = useCallback(() => {
    api
      .get('/api/moh/facilities/summary')
      .then((data) => {
        setFacilities(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load facility summary.'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Any facility's activity can move these national counters (a new
  // patient, a stock transaction, a sync catching up), so react to every
  // signal — but debounce, since a busy morning across ~dozens of
  // facilities would otherwise mean a refetch per keystroke of activity.
  useLiveActivity(
    undefined,
    useCallback(() => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(load, 1500);
    }, [load])
  );

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  if (error) return <ErrorState message={error} />;
  if (!facilities) return <SkeletonList rows={4} columns={4} />;

  const byDistrict = facilities.reduce((acc, f) => {
    (acc[f.district] = acc[f.district] || []).push(f);
    return acc;
  }, {});

  const totals = facilities.reduce(
    (acc, f) => ({
      patients: acc.patients + f.patientCount,
      activeEncounters: acc.activeEncounters + f.activeEncounters,
      stockAlerts: acc.stockAlerts + f.stockAlertCount,
      syncFailed: acc.syncFailed + f.syncFailed,
    }),
    { patients: 0, activeEncounters: 0, stockAlerts: 0, syncFailed: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Facilities</h1>
          <p className="text-sm text-ink-soft mt-1">
            {facilities.length} facilities across {Object.keys(byDistrict).length} districts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/moh/register-facility"
            className="text-sm font-medium text-white bg-teal hover:bg-teal-strong rounded-md px-3 py-1.5 transition-colors"
          >
            + Register facility
          </Link>
          <div className="flex rounded border border-border overflow-hidden text-sm">
            {['map', 'list'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 font-medium capitalize transition-colors ${
                  view === v ? 'bg-teal text-white' : 'bg-white text-ink-soft hover:bg-canvas'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <LiveIndicator />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total patients', value: totals.patients, className: 'text-ink' },
          { label: 'Open encounters', value: totals.activeEncounters, className: 'text-teal' },
          { label: 'Stock alerts', value: totals.stockAlerts, className: 'text-clay' },
          { label: 'Sync failures', value: totals.syncFailed, className: 'text-signal' },
        ].map(({ label, value, className }) => (
          <div key={label} className="bg-canvas-raised border border-border rounded-md p-4">
            <p className="text-xs text-ink-soft uppercase tracking-wide">{label}</p>
            <p className={`font-mono text-2xl mt-1 ${className}`}>{value}</p>
          </div>
        ))}
      </div>

      {view === 'map' && (
        <Card
          title="National map"
          action={
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="rounded border border-border bg-white px-2 py-1 text-xs text-ink focus-visible:outline-none"
            >
              <option value="">All districts</option>
              {Object.keys(byDistrict)
                .sort()
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>
          }
        >
          <div className="p-4">
            <FacilityMap facilities={facilities} selectedDistrict={selectedDistrict || null} />
          </div>
        </Card>
      )}

      {view === 'list' &&
        Object.entries(byDistrict).map(([district, list]) => (
          <Card key={district} title={district}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
                  <th className="px-4 py-2 font-medium">Facility</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Patients</th>
                  <th className="px-4 py-2 font-medium">Open encounters</th>
                  <th className="px-4 py-2 font-medium">Stock alerts</th>
                  <th className="px-4 py-2 font-medium">Sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((f) => (
                  <tr key={f.facilityId}>
                    <td className="px-4 py-2.5 text-ink font-medium">
                      <Link to={`/moh/facilities/${f.facilityId}`} className="text-teal hover:text-teal-strong">
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-ink-soft capitalize">{f.type.replace('_', ' ')}</td>
                    <td className="px-4 py-2.5 font-mono text-ink">{f.patientCount}</td>
                    <td className="px-4 py-2.5 font-mono text-ink">{f.activeEncounters}</td>
                    <td className="px-4 py-2.5">
                      {f.stockAlertCount > 0 ? (
                        <Pill tone="clay">{f.stockAlertCount}</Pill>
                      ) : (
                        <Pill tone="moss">0</Pill>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {f.syncFailed > 0 ? (
                        <Pill tone="signal">{f.syncFailed} failed</Pill>
                      ) : f.syncPending > 0 ? (
                        <Pill tone="clay">{f.syncPending} pending</Pill>
                      ) : (
                        <Pill tone="moss">current</Pill>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
    </div>
  );
}
