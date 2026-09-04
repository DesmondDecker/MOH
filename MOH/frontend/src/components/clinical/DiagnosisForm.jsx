import { useState } from 'react';
import { api, ApiError } from '../../lib/api';

export default function DiagnosisForm({ encounterId, onAdded }) {
  const [description, setDescription] = useState('');
  const [icd10Code, setIcd10Code] = useState('');
  const [isPrimary, setIsPrimary] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const encounter = await api.patch(`/api/encounters/${encounterId}/diagnosis`, {
        description,
        icd10Code: icd10Code || undefined,
        isPrimary,
      });
      onAdded(encounter);
      setDescription('');
      setIcd10Code('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add diagnosis.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="diagDesc" className="block text-xs font-medium text-ink-soft mb-1">
          Diagnosis
        </label>
        <input
          id="diagDesc"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
        />
      </div>
      <div className="w-28">
        <label htmlFor="icd10" className="block text-xs font-medium text-ink-soft mb-1">
          ICD-10
        </label>
        <input
          id="icd10"
          value={icd10Code}
          onChange={(e) => setIcd10Code(e.target.value)}
          className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-soft pb-2">
        <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} />
        Primary
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
      >
        Add
      </button>
      {error && <p className="text-sm text-signal">{error}</p>}
    </form>
  );
}
