import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList, AsyncButton, ShieldIcon } from '../../components/ui';

const OUTCOMES = [
  { value: 'appropriate', label: 'Appropriate', tone: 'moss' },
  { value: 'needs_followup', label: 'Needs follow-up', tone: 'clay' },
  { value: 'inappropriate', label: 'Inappropriate', tone: 'signal' },
];

class CancelledAction extends Error {}

export default function EmergencyAccessReviewPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pending'); // 'pending' | 'reviewed'
  const [encounters, setEncounters] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!user?.facilityId) return;
    setEncounters(null);
    api
      .get(`/api/encounters/facility/${user.facilityId}/emergency-access?reviewed=${tab === 'reviewed'}`)
      .then((data) => {
        setEncounters(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load emergency access log.'));
  }, [user?.facilityId, tab]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Emergency access review</h1>
        <p className="text-sm text-ink-soft mt-1">
          Every time a clinician used break-glass access to bypass normal permission checks, self-attesting it was a
          true emergency. Each one is expected to be reviewed here after the fact — that follow-through is what makes
          the self-attestation model trustworthy rather than an unaudited loophole.
        </p>
      </div>

      <div className="flex gap-1">
        {['pending', 'reviewed'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
              tab === t ? 'bg-teal text-white' : 'bg-canvas-raised border border-border text-ink-soft hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} />}

      {!error && encounters === null && <SkeletonList rows={4} columns={4} />}

      {!error && encounters?.length === 0 && (
        <Card>
          <EmptyState
            icon={<ShieldIcon />}
            title={tab === 'pending' ? 'Nothing pending review' : 'No reviewed history yet'}
            description={
              tab === 'pending'
                ? 'Every break-glass access at this facility has been reviewed.'
                : 'Reviewed emergency-access encounters will appear here.'
            }
          />
        </Card>
      )}

      {!error && encounters?.length > 0 && (
        <div className="space-y-3">
          {encounters.map((enc) => (
            <EmergencyAccessCard key={enc._id} encounter={enc} onReviewed={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmergencyAccessCard({ encounter, onReviewed }) {
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState('appropriate');
  const eo = encounter.emergencyOverride;

  async function submitReview() {
    if (!window.confirm(`Mark this review as "${OUTCOMES.find((o) => o.value === outcome).label}"?`)) {
      throw new CancelledAction();
    }
    await api.post(`/api/encounters/${encounter._id}/emergency-access/review`, { outcome, notes });
    onReviewed();
  }

  function handleError(err) {
    if (err instanceof CancelledAction) return;
    alert(err instanceof ApiError ? err.message : 'Could not submit review.');
  }

  return (
    <Card>
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">
              {encounter.patientId?.fullName} <span className="font-mono text-xs text-ink-soft">({encounter.patientId?.mrn})</span>
            </p>
            <p className="text-xs text-ink-soft mt-0.5">
              Accessed by <strong>{encounter.attendingProviderId?.fullName}</strong> ({encounter.attendingProviderId?.role}) ·{' '}
              {new Date(encounter.admittedAt).toLocaleString()}
            </p>
          </div>
          {eo.reviewed && (
            <Pill tone={OUTCOMES.find((o) => o.value === eo.reviewOutcome)?.tone || 'ink'}>
              {OUTCOMES.find((o) => o.value === eo.reviewOutcome)?.label}
            </Pill>
          )}
        </div>

        <div className="bg-clay-soft border border-clay/30 rounded-md p-3">
          <p className="text-xs font-medium text-clay mb-1">Self-attested justification</p>
          <p className="text-sm text-ink">{eo.justification || '(none provided)'}</p>
        </div>

        {eo.reviewed ? (
          <div className="text-xs text-ink-soft">
            Reviewed by <strong>{eo.reviewedBy?.fullName}</strong> on {new Date(eo.reviewedAt).toLocaleString()}
            {eo.reviewNotes && <p className="mt-1 text-ink">{eo.reviewNotes}</p>}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setOutcome(o.value)}
                  className={`text-xs font-medium rounded-md px-2.5 py-1 border transition-colors ${
                    outcome === o.value ? 'bg-teal text-white border-teal' : 'border-border text-ink-soft hover:text-ink'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <textarea
              rows={2}
              placeholder="Review notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
            />
            <AsyncButton onClick={submitReview} onError={handleError} variant="primary" loadingLabel="Submitting…" successLabel="Reviewed">
              Submit review
            </AsyncButton>
          </div>
        )}
      </div>
    </Card>
  );
}
