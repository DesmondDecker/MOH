import { useState } from 'react';
import { api, ApiError } from '../../lib/api';
import { Pill } from '../ui';

const CATEGORIES = ['hematology', 'microbiology', 'chemistry', 'serology', 'radiology', 'other'];

function OrderForm({ patientId, encounterId, onOrdered }) {
  const [testName, setTestName] = useState('');
  const [testCategory, setTestCategory] = useState('hematology');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post('/api/lab-results', { patientId, encounterId, testName, testCategory });
      onOrdered(result);
      setTestName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not order test.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor="testName" className="block text-xs font-medium text-ink-soft mb-1">
          Test
        </label>
        <input
          id="testName"
          required
          placeholder="Malaria RDT"
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
        />
      </div>
      <div className="w-40">
        <label htmlFor="testCategory" className="block text-xs font-medium text-ink-soft mb-1">
          Category
        </label>
        <select
          id="testCategory"
          value={testCategory}
          onChange={(e) => setTestCategory(e.target.value)}
          className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
      >
        Order
      </button>
      {error && <p className="text-sm text-signal">{error}</p>}
    </form>
  );
}

function ResultRow({ labResult, onUpdated }) {
  const [entering, setEntering] = useState(false);
  const [value, setValue] = useState('');
  const [isAbnormal, setIsAbnormal] = useState(false);
  const [isCritical, setIsCritical] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const updated = await api.patch(`/api/lab-results/${labResult._id}/result`, { value, isAbnormal, isCritical });
      onUpdated(updated);
      setEntering(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record result.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">{labResult.testName}</p>
          <p className="text-xs text-ink-soft">{labResult.testCategory}</p>
        </div>
        <div className="flex items-center gap-2">
          {labResult.status === 'completed' ? (
            <>
              <span className="font-mono text-sm text-ink">{labResult.result?.value}</span>
              {labResult.result?.isCritical && <Pill tone="signal">Critical</Pill>}
              {labResult.result?.isAbnormal && !labResult.result?.isCritical && <Pill tone="clay">Abnormal</Pill>}
            </>
          ) : (
            <>
              <Pill tone="ink">Pending</Pill>
              <button onClick={() => setEntering((v) => !v)} className="text-xs font-medium text-teal hover:text-teal-strong">
                Enter result
              </button>
            </>
          )}
        </div>
      </div>

      {entering && (
        <form onSubmit={handleSubmit} className="mt-2 flex items-end gap-2">
          <input
            required
            placeholder="Result value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
          />
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            <input type="checkbox" checked={isAbnormal} onChange={(e) => setIsAbnormal(e.target.checked)} />
            Abnormal
          </label>
          <label className="flex items-center gap-1 text-xs text-ink-soft">
            <input type="checkbox" checked={isCritical} onChange={(e) => setIsCritical(e.target.checked)} />
            Critical
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="bg-teal text-white text-xs font-medium rounded px-3 py-1.5 hover:bg-teal-strong transition-colors disabled:opacity-60"
          >
            Save
          </button>
        </form>
      )}
      {error && <p className="text-sm text-signal mt-1">{error}</p>}
    </li>
  );
}

export default function LabPanel({ patientId, encounterId, labResults, onChanged }) {
  return (
    <div className="space-y-4">
      {encounterId && <OrderForm patientId={patientId} encounterId={encounterId} onOrdered={onChanged} />}
      {labResults.length === 0 ? (
        <p className="text-sm text-ink-soft">No lab tests ordered yet.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded">
          {labResults.map((lr) => (
            <ResultRow key={lr._id} labResult={lr} onUpdated={onChanged} />
          ))}
        </ul>
      )}
    </div>
  );
}
