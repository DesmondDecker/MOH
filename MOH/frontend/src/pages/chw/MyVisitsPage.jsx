import { useCallback, useEffect, useState } from 'react';
import { offlineQueue } from '../../lib/offlineQueue';
import { api } from '../../lib/api';
import { Pill, EmptyState, SkeletonList } from '../../components/ui';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

const VISIT_TYPE_LABELS = {
  immunization_outreach: 'Immunization outreach',
  antenatal_followup: 'Antenatal follow-up',
  postnatal_followup: 'Postnatal follow-up',
  growth_monitoring: 'Growth monitoring',
  disease_surveillance: 'Disease surveillance',
  health_education: 'Health education',
  other: 'Other',
};

export default function MyVisitsPage() {
  const online = useOnlineStatus();
  const [localVisits, setLocalVisits] = useState(null);
  const [syncedVisits, setSyncedVisits] = useState(null);

  const loadLocal = useCallback(() => {
    offlineQueue.getAllVisits().then(setLocalVisits);
  }, []);

  useEffect(() => {
    loadLocal();
    if (online) {
      api
        .get('/api/chw/visits/mine')
        .then(setSyncedVisits)
        .catch(() => setSyncedVisits([]));
    } else {
      setSyncedVisits([]);
    }
  }, [loadLocal, online]);

  const pending = (localVisits || []).filter((v) => v.status !== 'synced');

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <section>
          <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-2">On this device (not yet synced)</p>
          <ul className="space-y-2">
            {pending.map((v) => (
              <li key={v.clientVisitId} className="bg-canvas-raised border border-border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{v.provisionalSubject?.fullName || v.patientId}</p>
                  <Pill tone={v.status === 'error' ? 'signal' : 'clay'}>{v.status === 'error' ? 'Sync failed' : 'Pending sync'}</Pill>
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  {VISIT_TYPE_LABELS[v.visitType] || v.visitType} - {new Date(v.recordedOfflineAt).toLocaleString()}
                </p>
                {v.status === 'error' && v.errorMessage && <p className="text-xs text-signal mt-1">{v.errorMessage}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <p className="text-xs font-medium text-ink-soft uppercase tracking-wide mb-2">Synced history</p>
        {!online && (
          <p className="text-sm text-ink-soft">You're offline -- synced history isn't available right now, but new visits still save normally.</p>
        )}
        {online && syncedVisits === null && <SkeletonList rows={4} columns={2} />}
        {online && syncedVisits?.length === 0 && (
          <EmptyState title="No synced visits yet" description="Visits appear here once they've synced to the server." />
        )}
        {online && syncedVisits?.length > 0 && (
          <ul className="space-y-2">
            {syncedVisits.map((v) => (
              <li key={v._id} className="bg-canvas-raised border border-border rounded-md p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink">{v.provisionalSubject?.fullName || 'Linked patient'}</p>
                  {v.referralNeeded && <Pill tone="clay">Referred</Pill>}
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  {VISIT_TYPE_LABELS[v.visitType] || v.visitType} - {new Date(v.visitDate).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
