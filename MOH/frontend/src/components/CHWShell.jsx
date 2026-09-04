import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PageTransition from './PageTransition';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { offlineQueue } from '../lib/offlineQueue';
import { syncPendingVisits, watchForConnectivityAndSync } from '../lib/chwSync';
import { OfflineBadge } from './ui';

const NAV_ITEMS = [
  { to: '/chw', label: 'New visit', end: true },
  { to: '/chw/visits', label: 'My visits' },
];

/**
 * Deliberately NOT the same desktop-sidebar layout as the other shells —
 * this one is built mobile-first (bottom tab bar, single-column, large
 * tap targets) because its actual user is a CHW on a low-end Android
 * phone in the field, not staff at a facility workstation.
 */
export default function CHWShell() {
  const { user, logout } = useAuth();
  const online = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  async function refreshPendingCount() {
    setPendingCount(await offlineQueue.countPending());
  }

  useEffect(() => {
    refreshPendingCount();

    const unsubscribe = watchForConnectivityAndSync((result) => {
      if (result) {
        setSyncMessage(result.synced > 0 ? `Synced ${result.synced} visit${result.synced === 1 ? '' : 's'}` : null);
      }
      refreshPendingCount();
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleManualSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await syncPendingVisits();
      setSyncMessage(
        result.total === 0
          ? 'Nothing to sync'
          : `Synced ${result.synced} of ${result.total}${result.errored > 0 ? ` — ${result.errored} need attention` : ''}`
      );
    } catch (err) {
      setSyncMessage(err.message || 'Could not sync — will retry automatically');
    } finally {
      setSyncing(false);
      refreshPendingCount();
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="bg-canvas-raised border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-ink-soft uppercase">MoH Registry</p>
            <p className="font-display font-semibold text-ink leading-tight">CHW Outreach</p>
          </div>
          <OfflineBadge />
        </div>

        <button
          onClick={handleManualSync}
          disabled={syncing || pendingCount === 0}
          className="mt-2 w-full flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60"
        >
          <span className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${pendingCount > 0 ? 'bg-clay' : 'bg-moss'}`} aria-hidden="true" />
            {pendingCount > 0 ? `${pendingCount} visit${pendingCount === 1 ? '' : 's'} waiting to sync` : 'All visits synced'}
          </span>
          <span className="text-teal font-medium">{syncing ? 'Syncing...' : 'Sync now'}</span>
        </button>
        {syncMessage && <p className="mt-1 text-xs text-ink-soft">{syncMessage}</p>}
        {!online && pendingCount > 0 && (
          <p className="mt-1 text-xs text-clay">No connection -- visits will sync automatically once you're back online.</p>
        )}
      </header>

      <main className="flex-1 overflow-auto p-4 pb-20">
        <PageTransition />
      </main>

      <nav className="fixed bottom-0 inset-x-0 bg-canvas-raised border-t border-border flex">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 py-3 text-center text-sm font-medium transition-colors ${
                isActive ? 'text-teal-strong border-t-2 border-teal -mt-px' : 'text-ink-soft'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="fixed bottom-16 right-4">
        <button onClick={logout} className="text-xs font-medium text-ink-soft bg-canvas-raised border border-border rounded-full px-3 py-1.5 shadow-sm">
          {user?.fullName?.split(' ')[0]} - Sign out
        </button>
      </div>
    </div>
  );
}
