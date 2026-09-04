import { NavLink } from 'react-router-dom';
import PageTransition from './PageTransition';
import { useAuth } from '../context/AuthContext';
import { useHighContrast } from '../hooks/useHighContrast';
import VitalsStrip from './VitalsStrip';
import { LiveIndicator, OfflineBadge, ContrastToggleButton } from './ui';

const NAV_ITEMS = [
  { to: '/pharmacy', label: 'Dispense queue', end: true },
  { to: '/pharmacy/inventory', label: 'Inventory' },
  { to: '/pharmacy/cold-chain', label: 'Cold chain' },
];

function navLinkClass({ isActive }) {
  return [
    'block px-3 py-2 rounded text-sm font-medium transition-colors',
    isActive ? 'bg-teal-soft text-teal-strong' : 'text-ink-soft hover:bg-canvas-raised hover:text-ink',
  ].join(' ');
}

export default function PharmacyShell() {
  const { user, logout } = useAuth();
  const [highContrast, toggleHighContrast] = useHighContrast();

  return (
    <div className="min-h-screen flex bg-canvas">
      <aside className="w-56 shrink-0 border-r border-border bg-canvas-raised flex flex-col">
        <div className="px-4 py-5 border-b border-border">
          <p className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">MoH Registry</p>
          <p className="font-display text-lg text-ink leading-tight mt-0.5">Pharmacy</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border">
          <p className="text-sm font-medium text-ink truncate">{user?.fullName}</p>
          <p className="text-xs text-ink-soft capitalize">{user?.role}</p>
          <button onClick={logout} className="mt-2 text-xs font-medium text-teal hover:text-teal-strong">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border bg-canvas-raised flex items-center justify-between px-6">
          <VitalsStrip facilityId={user?.facilityId} showSync={false} />
          <div className="flex items-center gap-3">
            <OfflineBadge />
            <ContrastToggleButton enabled={highContrast} onToggle={toggleHighContrast} />
            <LiveIndicator />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <PageTransition />
        </main>
      </div>
    </div>
  );
}
