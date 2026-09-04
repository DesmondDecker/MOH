import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Card, Pill, EmptyState, ErrorState } from '../../components/ui';

export default function SearchPatientPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [searching, setSearching] = useState(false);

  async function handleSearch(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setSearching(true);
    setError(null);
    try {
      const data = await api.get(`/api/patients/search?query=${encodeURIComponent(query.trim())}`);
      setResults(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Find patient</h1>
        <p className="text-sm text-ink-soft mt-1">Search by name, MRN, national ID, or phone.</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search…"
          autoFocus
          className="flex-1 rounded border border-border bg-white px-3 py-2 text-sm text-ink focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-teal text-white text-sm font-medium rounded px-4 py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
        >
          {searching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <ErrorState message={error} />}

      {results !== null && !error && (
        <Card>
          {results.length === 0 ? (
            <EmptyState message="No matching patients found." />
          ) : (
            <ul className="divide-y divide-border">
              {results.map((p) => {
                const otherFacility =
                  p.registeredAtFacility && p.registeredAtFacility._id !== user?.facilityId
                    ? p.registeredAtFacility
                    : null;
                return (
                  <li key={p._id}>
                    <button
                      onClick={() => navigate(`/clinical/patients/${p._id}`)}
                      className="w-full text-left px-4 py-3 flex items-center justify-between gap-4 hover:bg-canvas transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{p.fullName}</p>
                        <p className="text-xs text-ink-soft font-mono">
                          {p.mrn} · {p.sex} ·{' '}
                          {p.dateOfBirth ? new Date(p.dateOfBirth).toLocaleDateString() : 'DOB unknown'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {otherFacility && (
                          <Pill tone="clay">Registered at {otherFacility.name}</Pill>
                        )}
                        <Pill tone={p.identityTier === 'verified' ? 'moss' : 'clay'}>{p.identityTier}</Pill>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
