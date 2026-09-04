import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';

// STAGE.LOADING  — fetching the QR/secret from /2fa/setup
// STAGE.SCAN     — showing the QR, waiting for a confirmation code
// STAGE.BACKUP   — 2FA is now enabled, showing one-time backup codes
const STAGE = { LOADING: 'loading', SCAN: 'scan', BACKUP: 'backup' };

/**
 * Props:
 *  - mfaToken (optional): setup-scoped token from the mandatory first-login
 *    flow (LoginPage). Omit for voluntary self-service setup from a
 *    logged-in session — the request then rides the normal Bearer token.
 *  - mandatory (bool): changes the copy to explain why this step can't be skipped.
 *  - onComplete(data): called once enrollment is fully done. `data` includes
 *    accessToken/refreshToken/user when mfaToken was used (the mandatory
 *    first-login path has no session yet); omit handling those fields when
 *    used from Settings, where a session already exists.
 */
export default function TwoFactorEnrollPanel({ mfaToken, mandatory = false, onComplete }) {
  const [stage, setStage] = useState(STAGE.LOADING);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState(null);
  const [manualEntryKey, setManualEntryKey] = useState(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [enableResponse, setEnableResponse] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function beginSetup() {
      try {
        const body = mfaToken ? { mfaToken } : {};
        const data = await api.post('/api/auth/2fa/setup', body, { skipAuth: !!mfaToken });
        if (cancelled) return;
        setQrCodeDataUrl(data.qrCodeDataUrl);
        setManualEntryKey(data.manualEntryKey);
        setStage(STAGE.SCAN);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Could not start 2FA setup. Check your connection.');
      }
    }

    beginSetup();
    return () => {
      cancelled = true;
    };
  }, [mfaToken]);

  async function handleConfirm(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = mfaToken ? { mfaToken, code: code.trim() } : { code: code.trim() };
      const data = await api.post('/api/auth/2fa/enable', body, { skipAuth: !!mfaToken });
      setBackupCodes(data.backupCodes);
      setEnableResponse(data);
      setStage(STAGE.BACKUP);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not verify code. Check your connection.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownloadBackupCodes() {
    const blob = new Blob(
      [
        'MOH digital health and inventory platform — Two-Factor Backup Codes\n',
        'Each code can be used once if you lose access to your authenticator app.\n',
        'Store this somewhere safe — treat it like a password.\n\n',
        backupCodes.join('\n'),
        '\n',
      ],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'moh-2fa-backup-codes.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleFinish() {
    onComplete?.(enableResponse);
  }

  if (stage === STAGE.LOADING) {
    return (
      <div className="bg-canvas-raised border border-border rounded-lg p-6 text-center text-ink-soft text-sm">
        Setting up two-factor authentication…
      </div>
    );
  }

  if (stage === STAGE.BACKUP) {
    return (
      <div className="bg-canvas-raised border border-border rounded-lg p-6 space-y-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-ink mb-1">Save your backup codes</h2>
          <p className="text-sm text-ink-soft">
            If you lose your phone, each of these codes can sign you in once, instead of a code from
            your authenticator app. Save them somewhere safe — this is the only time they're shown.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-canvas rounded-md border border-border p-4 font-mono text-sm text-ink">
          {backupCodes.map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleDownloadBackupCodes}
          className="w-full border border-border text-ink font-medium rounded-md py-2 hover:bg-canvas transition-colors"
        >
          Download codes
        </button>

        <button
          type="button"
          onClick={handleFinish}
          className="w-full bg-teal text-white font-medium rounded-md py-2 hover:bg-teal-strong transition-colors"
        >
          I've saved my codes — continue
        </button>
      </div>
    );
  }

  return (
    <div className="bg-canvas-raised border border-border rounded-lg p-6 space-y-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-ink mb-1">Set up two-factor authentication</h2>
        <p className="text-sm text-ink-soft">
          {mandatory
            ? 'Your role requires 2FA before you can continue. Scan this code with an authenticator app (Google Authenticator, Authy, etc.).'
            : 'Scan this code with an authenticator app (Google Authenticator, Authy, etc.).'}
        </p>
      </div>

      {qrCodeDataUrl && (
        <div className="flex justify-center bg-white border border-border rounded-md p-4">
          <img src={qrCodeDataUrl} alt="2FA QR code" width={200} height={200} />
        </div>
      )}

      {manualEntryKey && (
        <div className="text-center">
          <p className="text-xs text-ink-soft mb-1">Can't scan? Enter this key manually:</p>
          <code className="text-sm font-mono bg-canvas border border-border rounded px-2 py-1 text-ink break-all">
            {manualEntryKey}
          </code>
        </div>
      )}

      <form onSubmit={handleConfirm} className="space-y-3">
        <div>
          <label htmlFor="setup-code" className="block text-sm font-medium text-ink mb-1">
            Enter the 6-digit code to confirm
          </label>
          <input
            id="setup-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
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
          {submitting ? 'Confirming…' : 'Confirm and enable 2FA'}
        </button>
      </form>
    </div>
  );
}
