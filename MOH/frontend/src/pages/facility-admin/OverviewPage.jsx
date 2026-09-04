import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, KpiStat, BedIcon, BoxIcon, ClockIcon, Skeleton, SkeletonList, SkeletonKpiRow } from '../../components/ui';

function age(dob) {
  if (!dob) return '—';
  return Math.floor((Date.now() - new Date(dob)) / (365.25 * 24 * 60 * 60 * 1000)) + 'y';
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [stock, setStock] = useState(null);
  const [expiring, setExpiring] = useState(null);
  const [sync, setSync] = useState(null);
  const [admitted, setAdmitted] = useState(null);
  const [staffCount, setStaffCount] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.facilityId) return;
    let cancelled = false;

    async function load() {
      try {
        const [stockData, expiringData, syncData, activeData, staffData] = await Promise.all([
          api.get(`/api/inventory/facility/${user.facilityId}/stock`),
          api.get(`/api/inventory/facility/${user.facilityId}/expiring?days=30`),
          api.get(`/api/sync/facility/${user.facilityId}/status`),
          api.get(`/api/encounters/facility/${user.facilityId}/active`),
          api.get(`/api/auth/facility/${user.facilityId}/staff`),
        ]);
        if (cancelled) return;
        setStock(stockData);
        setExpiring(expiringData);
        setSync(syncData);
        setAdmitted(activeData);
        setStaffCount(staffData.length);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load facility overview.');
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.facilityId]);

  if (error) return <ErrorState message={error} />;

  const belowThreshold = stock?.filter((s) => s.belowThreshold) || [];
  const openEncounters = admitted?.length || 0;
  const inpatients = admitted?.filter((e) => e.type === 'inpatient_admission') || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Overview</h1>
        <p className="text-sm text-ink-soft mt-1">Facility snapshot as of right now.</p>
      </div>

      {/* Stats row */}
      {staffCount === null && admitted === null && stock === null ? (
        <SkeletonKpiRow />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Active staff', value: staffCount ?? '…' },
            { label: 'Open encounters', value: openEncounters || (admitted === null ? '…' : 0) },
            { label: 'Admitted patients', value: inpatients.length || (admitted === null ? '…' : 0) },
            {
              label: 'Stock alerts',
              value: belowThreshold.length || (stock === null ? '…' : 0),
              tone: belowThreshold.length > 0 ? 'signal' : 'ink',
            },
          ].map(({ label, value, tone }) => (
            <KpiStat key={label} label={label} value={value} tone={tone} />
          ))}
        </div>
      )}

      {/* Admitted / inpatients */}
      <Card title="Currently admitted patients"
        action={
          <Link to="/patients" className="text-xs font-medium text-teal hover:text-teal-strong">
            All patients →
          </Link>
        }>
        {admitted === null ? (
          <SkeletonList rows={3} columns={5} />
        ) : inpatients.length === 0 ? (
          <EmptyState
            icon={<BedIcon />}
            title="No admitted inpatients"
            description="This ward is currently empty. New admissions will appear here in real time."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-ink-soft uppercase tracking-wide">
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">MRN</th>
                <th className="px-4 py-2 font-medium">Age / Sex</th>
                <th className="px-4 py-2 font-medium">Chief complaint</th>
                <th className="px-4 py-2 font-medium">Admitted</th>
                <th className="px-4 py-2 font-medium">Provider</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inpatients.map((enc) => (
                <tr key={enc._id} className="hover:bg-canvas/50">
                  <td className="px-4 py-2.5 font-medium text-ink">{enc.patientId?.fullName || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{enc.patientId?.mrn}</td>
                  <td className="px-4 py-2.5 text-ink-soft">
                    {age(enc.patientId?.dateOfBirth)} / {enc.patientId?.sex?.[0]?.toUpperCase()}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft truncate max-w-[200px]">{enc.chiefComplaint || '—'}</td>
                  <td className="px-4 py-2.5 text-ink-soft text-xs font-mono">
                    {new Date(enc.admittedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2.5 text-ink-soft text-xs">{enc.attendingProviderId?.fullName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Open (non-inpatient) encounters */}
      {admitted !== null && admitted.filter(e => e.type !== 'inpatient_admission').length > 0 && (
        <Card title="Active outpatient / emergency encounters">
          <ul className="divide-y divide-border">
            {admitted.filter(e => e.type !== 'inpatient_admission').slice(0, 8).map((enc) => (
              <li key={enc._id} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-ink">{enc.patientId?.fullName}</span>
                  <span className="ml-2 text-xs font-mono text-ink-soft">{enc.patientId?.mrn}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone="teal">{enc.type.replace(/_/g, ' ')}</Pill>
                  <span className="text-xs text-ink-soft">{enc.attendingProviderId?.fullName}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Stock below threshold">
          {stock === null ? (
            <SkeletonList rows={3} columns={2} />
          ) : belowThreshold.length === 0 ? (
            <EmptyState
              icon={<BoxIcon />}
              title="Stock levels healthy"
              description="Everything is stocked above its reorder threshold."
            />
          ) : (
            <ul className="divide-y divide-border">
              {belowThreshold.slice(0, 5).map((item) => (
                <li key={item.inventoryItemId} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-ink">{item.name}</span>
                  <Pill tone="clay">{item.totalQuantity} {item.unit}</Pill>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-2.5 border-t border-border">
            <Link to="/inventory" className="text-sm font-medium text-teal hover:text-teal-strong">
              View all inventory →
            </Link>
          </div>
        </Card>

        <Card title="Expiring within 30 days">
          {expiring === null ? (
            <SkeletonList rows={3} columns={2} />
          ) : expiring.length === 0 ? (
            <EmptyState
              icon={<ClockIcon />}
              title="Nothing expiring soon"
              description="No batches expiring in the next 30 days."
            />
          ) : (
            <ul className="divide-y divide-border">
              {expiring.slice(0, 5).map((batch) => (
                <li key={batch._id} className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-ink">{batch.inventoryItemId?.name || 'Unknown item'}</span>
                  <Pill tone="signal">{new Date(batch.expiryDate).toLocaleDateString()}</Pill>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-2.5 border-t border-border">
            <Link to="/expiring" className="text-sm font-medium text-teal hover:text-teal-strong">
              View expiry calendar →
            </Link>
          </div>
        </Card>

        <Card title="Sync to Ministry">
          {sync === null ? (
            <div className="px-4 py-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : (
            <dl className="px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Pending</dt>
                <dd className="font-mono text-ink">{sync.pendingCount}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Failed</dt>
                <dd className={`font-mono ${sync.failedCount > 0 ? 'text-signal' : 'text-ink'}`}>
                  {sync.failedCount}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Last synced</dt>
                <dd className="font-mono text-ink text-xs">
                  {sync.lastSyncedAt ? new Date(sync.lastSyncedAt).toLocaleString() : 'Never'}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}


