import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList } from '../../components/ui';

function timeSince(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

const TYPE_LABELS = {
  outpatient: 'Outpatient',
  inpatient_admission: 'Admission',
  emergency: 'Emergency',
  antenatal: 'Antenatal',
  immunization: 'Immunization',
  referral_in: 'Referral',
};

export default function QueuePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [encounters, setEncounters] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.facilityId) return;
    let cancelled = false;

    api
      .get(`/api/encounters/facility/${user.facilityId}/active`)
      .then((data) => {
        if (!cancelled) setEncounters(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the queue.');
      });

    return () => {
      cancelled = true;
    };
  }, [user?.facilityId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Today's queue</h1>
        <p className="text-sm text-ink-soft mt-1">Open encounters at your facility, oldest first.</p>
      </div>

      <Card>
        {error && <ErrorState message={error} />}
        {!error && encounters === null && <SkeletonList rows={4} columns={4} />}
        {!error && encounters?.length === 0 && <EmptyState message="No open encounters right now." />}
        {!error && encounters?.length > 0 && (
          <ul className="divide-y divide-border">
            {encounters.map((enc) => (
              <li key={enc._id}>
                <button
                  onClick={() => navigate(`/clinical/patients/${enc.patientId?._id}`)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-canvas transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {enc.patientId?.fullName || 'Unknown patient'}
                    </p>
                    <p className="text-xs text-ink-soft font-mono">
                      {enc.patientId?.mrn} · {enc.chiefComplaint || 'No chief complaint recorded'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {enc.patientId?.allergies?.length > 0 && <Pill tone="signal">Allergies</Pill>}
                    <Pill tone="teal">{TYPE_LABELS[enc.type] || enc.type}</Pill>
                    <span className="font-mono text-xs text-ink-soft">{timeSince(enc.admittedAt)} waiting</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
