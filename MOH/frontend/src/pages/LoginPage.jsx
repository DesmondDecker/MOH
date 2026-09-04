import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError, api } from '../lib/api';
import TwoFactorEnrollPanel from '../components/TwoFactorEnrollPanel';

// Login is a small state machine, not just a form submit:
//   'credentials'  → username/password
//   'verify'       → 2FA already enabled elsewhere, needs a code
//   'setup'        → role requires 2FA and this account doesn't have it yet
const STEP = { CREDENTIALS: 'credentials', VERIFY: 'verify', SETUP: 'setup' };

export default function LoginPage() {
  const { login, completeSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState(STEP.CREDENTIALS);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function goToDestination() {
    const dest = location.state?.from?.pathname || '/';
    navigate(dest, { replace: true });
  }

  async function handleCredentialsSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await login(username.trim(), password);

      if (data.accessToken) {
        goToDestination();
        return;
      }
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setStep(STEP.VERIFY);
        return;
      }
      if (data.twoFactorSetupRequired) {
        setMfaToken(data.mfaToken);
        setStep(STEP.SETUP);
        return;
      }
      setError('Unexpected response from server. Please try again.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setError('Account temporarily locked due to failed login attempts. Try again later.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifySubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await api.post(
        '/api/auth/2fa/verify-login',
        { mfaToken, code: code.trim() },
        { skipAuth: true }
      );
      completeSession(data);
      goToDestination();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (step === STEP.SETUP) {
    return (
      <AuthShell>
        <TwoFactorEnrollPanel
          mfaToken={mfaToken}
          mandatory
          onComplete={(data) => {
            completeSession(data);
            goToDestination();
          }}
        />
      </AuthShell>
    );
  }

  if (step === STEP.VERIFY) {
    return (
      <AuthShell>
        <form
          onSubmit={handleVerifySubmit}
          className="bg-canvas-raised border border-border rounded-lg p-6 space-y-4 shadow-sm"
        >
          <div>
            <h2 className="text-lg font-semibold text-ink mb-1">Two-factor verification</h2>
            <p className="text-sm text-ink-soft">
              Enter the 6-digit code from your authenticator app, or one of your backup codes.
            </p>
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-ink mb-1">
              Verification code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-ink text-center tracking-[0.3em] font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-signal bg-signal-soft rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-teal text-white font-medium rounded-md py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
          >
            {submitting ? 'Verifying…' : 'Verify and sign in'}
          </button>

          <button
            type="button"
            onClick={() => {
              setStep(STEP.CREDENTIALS);
              setCode('');
              setError(null);
            }}
            className="w-full text-sm text-ink-soft hover:text-ink transition-colors"
          >
            Back to sign in
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form
        onSubmit={handleCredentialsSubmit}
        className="bg-canvas-raised border border-border rounded-lg p-6 space-y-4 shadow-sm"
      >
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-ink mb-1">
            Username
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border bg-white px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-signal bg-signal-soft rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-teal text-white font-medium rounded-md py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-soft">
        Lost your credentials? Only your facility admin can reset them.
      </p>
    </AuthShell>
  );
}

function AuthShell({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-mono text-xs tracking-widest text-ink-soft uppercase mb-2">
            Ministry of Health &amp; Sanitation
          </p>
          <h1 className="text-3xl font-semibold text-ink">MOH digital health and inventory platform</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
