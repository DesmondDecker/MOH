import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, ErrorState, AsyncButton, ShieldIcon } from '../../components/ui';

// A dedicated class (rather than a plain Error) so handleActionError can
// distinguish "the user clicked Cancel in the confirm() dialog" from a
// genuine API/network failure — both reject the promise AsyncButton is
// awaiting, but only the latter should alert the user.
class CancelledAction extends Error {}

export default function StaffDetailPage() {
  const { userId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [resetResult, setResetResult] = useState(null);

  const load = useCallback(() => {
    api
      .get(`/api/auth/users/${userId}`)
      .then((data) => {
        setDetail(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load staff detail.'));
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(nextStatus) {
    const verb = nextStatus === 'active' ? 'reactivate' : nextStatus;
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} ${detail.fullName}'s account?`)) {
      throw new CancelledAction();
    }
    const endpoint =
      detail.role === 'moh_super_admin'
        ? `/api/auth/super-admins/${userId}/status`
        : `/api/auth/facility-admins/${userId}/status`;
    await api.post(endpoint, { status: nextStatus });
    load();
  }

  async function handleReset() {
    if (!window.confirm(`Reset credentials for ${detail.fullName}?`)) {
      throw new CancelledAction();
    }
    const endpoint =
      detail.role === 'facility_admin'
        ? `/api/auth/facility-admins/${userId}/reset-credentials`
        : `/api/auth/facility/${detail.facility?._id}/staff/${userId}/reset-credentials`;
    const result = await api.post(endpoint);
    setResetResult(result);
  }

  function handleActionError(err) {
    if (err instanceof CancelledAction) return; // user backed out of the confirm() — not a real failure
    alert(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
  }

  if (error) return <ErrorState message={error} />;
  if (!detail) return <p className="text-sm text-ink-soft">Loading…</p>;

  const isAdminRole = detail.role === 'moh_super_admin' || detail.role === 'facility_admin';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link to="/moh/staff" className="text-xs font-medium text-teal hover:text-teal-strong">
          ← Staff directory
        </Link>
        <h1 className="font-display text-2xl text-ink mt-1">{detail.fullName}</h1>
        <p className="text-sm text-ink-soft font-mono">{detail.username}</p>
      </div>

      <Card title="Overview">
        <dl className="p-4 grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-ink-soft">Role</dt>
          <dd className="text-ink capitalize">{detail.role.replace(/_/g, ' ')}</dd>

          <dt className="text-ink-soft">Status</dt>
          <dd>
            <Pill tone={detail.status === 'active' ? 'moss' : detail.status === 'suspended' ? 'clay' : 'signal'}>
              {detail.status}
            </Pill>
          </dd>

          <dt className="text-ink-soft">Facility</dt>
          <dd className="text-ink">{detail.facility ? `${detail.facility.name} (${detail.facility.district})` : '—'}</dd>

          <dt className="text-ink-soft">Email</dt>
          <dd className="text-ink">{detail.email || '—'}</dd>

          <dt className="text-ink-soft">2FA enabled</dt>
          <dd className="text-ink">{detail.twoFactorEnabled ? 'Yes' : 'No'}</dd>

          <dt className="text-ink-soft">Must change password</dt>
          <dd className="text-ink">{detail.mustChangePassword ? 'Yes' : 'No'}</dd>

          <dt className="text-ink-soft">Last login</dt>
          <dd className="text-ink font-mono text-xs">
            {detail.lastLogin ? new Date(detail.lastLogin).toLocaleString() : 'never'}
          </dd>

          <dt className="text-ink-soft">Failed login attempts</dt>
          <dd className="text-ink">{detail.failedLoginAttempts}</dd>

          <dt className="text-ink-soft">Lock state</dt>
          <dd className="text-ink">
            {detail.isLocked ? (
              <Pill tone="signal">Locked until {new Date(detail.lockedUntil).toLocaleString()}</Pill>
            ) : (
              'Not locked'
            )}
          </dd>

          <dt className="text-ink-soft">Created</dt>
          <dd className="text-ink text-xs">
            {new Date(detail.createdAt).toLocaleString()}
            {detail.createdBy && ` by ${detail.createdBy.fullName}`}
          </dd>

          <dt className="text-ink-soft">Last credential reset</dt>
          <dd className="text-ink text-xs">
            {detail.credentialsResetAt
              ? `${new Date(detail.credentialsResetAt).toLocaleString()}${
                  detail.credentialsResetBy ? ` by ${detail.credentialsResetBy.fullName}` : ''
                }`
              : 'Never'}
          </dd>
        </dl>
      </Card>

      {isAdminRole && (
        <Card title="Admin actions">
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <AsyncButton
                onError={handleActionError}
                onClick={() => handleReset()}
                loadingLabel="Resetting…"
                successLabel="Reset"
              >
                Reset credentials
              </AsyncButton>
              {detail.status === 'active' ? (
                <AsyncButton
                onError={handleActionError}
                  onClick={() => handleStatusChange('suspended')}
                  loadingLabel="Suspending…"
                  successLabel="Suspended"
                >
                  Suspend
                </AsyncButton>
              ) : (
                <AsyncButton
                onError={handleActionError}
                  onClick={() => handleStatusChange('active')}
                  variant="primary"
                  loadingLabel="Reactivating…"
                  successLabel="Reactivated"
                >
                  Reactivate
                </AsyncButton>
              )}
              {detail.status !== 'revoked' && (
                <AsyncButton
                onError={handleActionError}
                  onClick={() => handleStatusChange('revoked')}
                  loadingLabel="Revoking…"
                  successLabel="Revoked"
                >
                  Revoke
                </AsyncButton>
              )}
            </div>

            {resetResult && (
              <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
                <p className="text-xs font-medium text-teal-strong flex items-center gap-1">
                  <ShieldIcon width={14} height={14} /> New credentials — share securely, shown once only:
                </p>
                <p className="font-mono text-sm text-ink">
                  Username: <strong>{resetResult.username}</strong>
                </p>
                <p className="font-mono text-sm text-ink">
                  Temp password: <strong>{resetResult.temporaryPassword}</strong>
                </p>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
