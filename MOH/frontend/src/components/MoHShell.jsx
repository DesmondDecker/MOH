import { NavLink } from 'react-router-dom';
import PageTransition from './PageTransition';
import { useAuth } from '../context/AuthContext';
import { useHighContrast } from '../hooks/useHighContrast';
import { LiveIndicator, ContrastToggleButton } from './ui';

const NAV_ITEMS = [
  { to: '/moh', label: 'Facilities', end: true },
  { to: '/moh/staff', label: 'Staff directory' },
  { to: '/moh/surveillance', label: 'Surveillance' },
  { to: '/moh/inventory', label: 'National inventory' },
  { to: '/moh/anomalies', label: 'Anomalies' },
  { to: '/moh/reports', label: 'Reports' },
];

export default function MoHShell() {
  const { user, logout } = useAuth();
  const [highContrast, toggleHighContrast] = useHighContrast();

  return (
    <div className="min-h-screen flex bg-canvas">
      <aside className="w-56 shrink-0 border-r border-border bg-canvas-raised flex flex-col">
        <div className="px-4 py-5 border-b border-border">
          <p className="font-mono text-[11px] tracking-widest text-ink-soft uppercase">MoH Registry</p>
          <p className="font-display font-semibold text-lg text-ink leading-tight mt-0.5">Command Center</p>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'block px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  isActive ? 'bg-teal-soft text-teal-strong' : 'text-ink-soft hover:bg-canvas hover:text-ink',
                ].join(' ')
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-border">
          <p className="text-sm font-medium text-ink truncate">{user?.fullName}</p>
          <p className="text-xs text-ink-soft">MoH Super Admin</p>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <ContrastToggleButton enabled={highContrast} onToggle={toggleHighContrast} />
            <LiveIndicator />
          </div>
          <button onClick={logout} className="mt-2 text-xs font-medium text-ink-soft hover:text-ink">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 bg-canvas">
        <main className="flex-1 overflow-auto p-6">
          <PageTransition />
        </main>
      </div>
    </div>
  );
}
