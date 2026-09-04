import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Pill } from '../ui';

/**
 * Shown on a patient record when the patient is registered at a different
 * facility than the viewing clinician's own. Normal cross-facility viewing
 * (referrals, continuity of care) already works without this — the backend
 * allows it and logs it as a plain view. This banner is for the emergency
 * case: it lets a clinician explicitly declare "this is a break-glass
 * access" and record why, which re-fetches the record under a distinct,
 * separately-audited action (`patient_record_viewed_emergency_override`).
 *
 * `justification` should never be pre-filled or defaulted — an empty
 * required field is what makes the audit trail meaningful.
 */
export default function BreakGlassBanner({ patientId, facilityName, onLogged }) {
  const [expanded, setExpanded] = useState(false);
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [logged, setLogged] = useState(null); // { justification, at } once recorded

  async function handleSubmit(e) {
    e.preventDefault();
    if (!justification.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.get(
        `/api/patients/${patientId}?emergencyJustification=${encodeURIComponent(justification.trim())}`
      );
      setLogged({ justification: justification.trim(), at: new Date() });
      setExpanded(false);
      onLogged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record emergency access.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-clay-soft border border-clay/30 rounded-md px-4 py-3" role="status">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">
            This record belongs to <span className="font-semibold">{facilityName}</span>, not your facility.
          </p>
          <p className="text-xs text-ink-soft mt-0.5">
            Normal referral/continuity-of-care access needs no extra step. If you're viewing this outside a
            referral — an emergency — record why, so it's logged as break-glass access.
          </p>
        </div>
        {logged ? (
          <Pill tone="signal">Emergency access logged</Pill>
        ) : (
          !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="shrink-0 text-xs font-medium text-clay hover:underline whitespace-nowrap"
            >
              Log emergency access
            </button>
          )
        )}
      </div>

      {logged && (
        <p className="text-xs text-ink-soft mt-2 italic">
          "{logged.justification}" — recorded {logged.at.toLocaleTimeString()}
        </p>
      )}

      {expanded && !logged && (
        <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="breakGlassJustification" className="block text-xs font-medium text-ink-soft mb-1">
              Reason for emergency access (required, goes in the audit trail)
            </label>
            <input
              id="breakGlassJustification"
              required
              autoFocus
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. Patient presented unconscious, no time to arrange referral"
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !justification.trim()}
            className="bg-signal text-white text-sm font-medium rounded px-4 py-1.5 hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {submitting ? 'Logging…' : 'Confirm'}
          </button>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs font-medium text-ink-soft hover:text-ink px-2 py-1.5"
          >
            Cancel
          </button>
        </form>
      )}
      {error && <p className="text-xs text-signal mt-2">{error}</p>}
    </div>
  );
}
