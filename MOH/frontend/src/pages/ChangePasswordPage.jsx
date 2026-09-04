import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api, setTokens, ApiError } from '../lib/api';

const ROLE_HOME = {
  facility_admin: '/',
  moh_super_admin: '/moh',
  doctor: '/clinical',
  nurse: '/clinical',
  pharmacist: '/pharmacy',
  store_officer: '/',
};

export default function ChangePasswordPage() {
  const { user, completePasswordChange } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.post('/api/auth/change-password', { currentPassword, newPassword });
      setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      completePasswordChange({ ...user, mustChangePassword: false });
      navigate(ROLE_HOME[user.role] || '/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="font-display text-2xl text-ink">Set a new password</h1>
          <p className="text-sm text-ink-soft mt-1">
            Your account was issued a temporary password. Choose a new one before continuing.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-canvas-raised border border-border rounded-md p-6 space-y-4"
        >
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-ink mb-1">
              Temporary password
            </label>
            <input
              id="currentPassword"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-ink focus-visible:outline-none"
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-ink mb-1">
              New password
            </label>
            <input
              id="newPassword"
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-ink focus-visible:outline-none"
            />
            <p className="text-xs text-ink-soft mt-1">At least 10 characters.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1">
              Confirm new password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded border border-border bg-white px-3 py-2 text-ink focus-visible:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-signal bg-signal-soft rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-teal text-white font-medium rounded py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
