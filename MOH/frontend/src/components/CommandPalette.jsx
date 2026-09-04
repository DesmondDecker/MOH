import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import { SearchIcon } from './ui';

// Static "go to" commands per role. Kept in sync manually with App.jsx's
// route table — there's no route registry to introspect here without a
// bigger refactor, so each role's command list should be updated
// alongside its <Route> entries.
const NAV_COMMANDS = {
  facility_admin: [
    { label: 'Overview', to: '/' },
    { label: 'Staff', to: '/staff' },
    { label: 'Inventory', to: '/inventory' },
    { label: 'Expiring stock', to: '/expiring' },
    { label: 'Transfers', to: '/transfers' },
    { label: 'Audit log', to: '/audit' },
    { label: 'Emergency access review', to: '/emergency-access' },
    { label: 'Blood bank', to: '/blood-bank' },
    { label: 'Cold chain', to: '/cold-chain' },
    { label: 'Reports', to: '/reports' },
  ],
  doctor: [
    { label: 'Patient queue', to: '/clinical' },
    { label: 'Search patients', to: '/clinical/search' },
    { label: 'Register patient', to: '/clinical/register' },
    { label: 'Blood bank', to: '/clinical/blood-bank' },
  ],
  nurse: [
    { label: 'Patient queue', to: '/clinical' },
    { label: 'Search patients', to: '/clinical/search' },
    { label: 'Register patient', to: '/clinical/register' },
    { label: 'Blood bank', to: '/clinical/blood-bank' },
  ],
  moh_super_admin: [
    { label: 'Facilities', to: '/moh' },
    { label: 'Register facility', to: '/moh/register-facility' },
    { label: 'Staff directory', to: '/moh/staff' },
    { label: 'Surveillance', to: '/moh/surveillance' },
    { label: 'National inventory', to: '/moh/inventory' },
    { label: 'Anomalies', to: '/moh/anomalies' },
    { label: 'Reports', to: '/moh/reports' },
  ],
  pharmacist: [
    { label: 'Dispense queue', to: '/pharmacy' },
    { label: 'Inventory', to: '/pharmacy/inventory' },
    { label: 'Cold chain', to: '/pharmacy/cold-chain' },
  ],
};

const CLINICAL_ROLES = ['doctor', 'nurse'];

export default function CommandPalette() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  const navCommands = useMemo(() => (user ? NAV_COMMANDS[user.role] || [] : []), [user]);

  const filteredNavCommands = useMemo(() => {
    if (!query.trim()) return navCommands;
    const q = query.trim().toLowerCase();
    return navCommands.filter((c) => c.label.toLowerCase().includes(q));
  }, [navCommands, query]);

  const canSearchPatients = user && CLINICAL_ROLES.includes(user.role);

  // Global open shortcut — Cmd+K on Mac, Ctrl+K elsewhere. Doesn't fire
  // while typing in a real input/textarea UNLESS it's this palette's own
  // input, so it never hijacks form fields elsewhere in the app.
  useEffect(() => {
    function handleKeyDown(e) {
      const isK = e.key === 'k' || e.key === 'K';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setPatientResults([]);
      setActiveIndex(0);
      // Focus after the modal has actually mounted/painted.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open || !canSearchPatients) return;
    clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setPatientResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await api.get(`/api/patients/search?query=${encodeURIComponent(query.trim())}`);
        setPatientResults(results);
      } catch {
        // A failed live search shouldn't break the palette — nav commands
        // still work, and the user can retry the query.
        setPatientResults([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query, open, canSearchPatients]);

  const items = useMemo(() => {
    const navItems = filteredNavCommands.map((c) => ({ type: 'nav', ...c }));
    const patientItems = patientResults.map((p) => ({
      type: 'patient',
      label: p.fullName,
      sublabel: `${p.mrn} · ${p.sex}`,
      to: `/clinical/patients/${p._id}`,
    }));
    return [...navItems, ...patientItems];
  }, [filteredNavCommands, patientResults]);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  function selectItem(item) {
    if (!item) return;
    navigate(item.to);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(items[activeIndex]);
    }
  }

  if (!open || !user) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
        className="relative bg-canvas-raised border border-border rounded-lg shadow-lg w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <SearchIcon className="text-ink-soft shrink-0" width={18} height={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={canSearchPatients ? 'Search patients or jump to a page…' : 'Jump to a page…'}
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-ink-soft focus:outline-none"
          />
          <kbd className="text-[10px] font-mono text-ink-soft border border-border rounded px-1.5 py-0.5">esc</kbd>
        </div>

        <div className="max-h-80 overflow-auto py-1">
          {items.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-soft text-center">No matches.</p>
          )}
          {items.map((item, i) => (
            <button
              key={`${item.type}-${item.to}-${item.label}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => selectItem(item)}
              className={`w-full text-left px-4 py-2 flex items-center justify-between gap-3 ${
                i === activeIndex ? 'bg-teal-soft' : ''
              }`}
            >
              <span className="text-sm text-ink truncate">{item.label}</span>
              {item.sublabel && (
                <span className="text-xs font-mono text-ink-soft shrink-0">{item.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
