import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card } from '../../components/ui';

function defaultFrom() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

export default function ReportBuilderPage() {
  const { user } = useAuth();
  const isNational = user.role === 'moh_super_admin';

  const [metrics, setMetrics] = useState(null);
  const [provinces, setProvinces] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [scopeLevel, setScopeLevel] = useState(isNational ? 'national' : 'facility');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [title, setTitle] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    api.get('/api/reports/metrics').then(setMetrics).catch(() => setMetrics([]));
    if (isNational) api.get('/api/reference/sierra-leone-admin').then(setProvinces).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMetric(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategory(categoryMetrics) {
    const ids = categoryMetrics.map((m) => m.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  }

  async function handleGenerate(format) {
    setError(null);
    if (selected.size === 0) {
      setError('Select at least one metric.');
      return;
    }

    const scope = { level: scopeLevel };
    if (scopeLevel === 'facility') scope.facilityId = user.facilityId;
    if (scopeLevel === 'district') scope.district = district;
    if (scopeLevel === 'province') scope.province = province;

    setGenerating(true);
    try {
      const filename = `${(title || 'MoH_Report').replace(/[^a-z0-9]/gi, '_')}.${format}`;
      await api.downloadPost(
        '/api/reports/generate',
        { title: title || undefined, metricIds: [...selected], scope, dateFrom, dateTo, format },
        filename
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate report.');
    } finally {
      setGenerating(false);
    }
  }

  const byCategory = {};
  for (const m of metrics || []) {
    byCategory[m.category] = byCategory[m.category] || [];
    byCategory[m.category].push(m);
  }

  const districtOptions = province ? provinces[province] || [] : [];
  const inputClass = 'w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none';

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl text-ink">Report builder</h1>
        <p className="text-sm text-ink-soft mt-1">
          Select the metrics, scope, and date range for a donor-ready report -- export as PDF or CSV.
        </p>
      </div>

      <Card title="Scope and period">
        <div className="p-4 space-y-3">
          {isNational && (
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Scope</label>
              <div className="flex gap-2 flex-wrap">
                {['national', 'province', 'district', 'facility'].map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setScopeLevel(level)}
                    className={`text-xs font-medium rounded-md px-2.5 py-1 border capitalize transition-colors ${
                      scopeLevel === level ? 'bg-teal text-white border-teal' : 'border-border text-ink-soft hover:text-ink'
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          )}

          {scopeLevel === 'province' && (
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Province</label>
              <select value={province} onChange={(e) => setProvince(e.target.value)} className={inputClass}>
                <option value="">Select province</option>
                {Object.keys(provinces).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {scopeLevel === 'district' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">Province</label>
                <select
                  value={province}
                  onChange={(e) => {
                    setProvince(e.target.value);
                    setDistrict('');
                  }}
                  className={inputClass}
                >
                  <option value="">Select province</option>
                  {Object.keys(provinces).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1">District</label>
                <select value={district} onChange={(e) => setDistrict(e.target.value)} className={inputClass} disabled={!province}>
                  <option value="">Select district</option>
                  {districtOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">Report title (optional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="MoH Program Report" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-soft mb-1">To</label>
              <input type="date" value={dateTo} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Metrics">
        {metrics === null ? (
          <p className="text-sm text-ink-soft p-4">Loading...</p>
        ) : (
          <div className="p-4 space-y-4">
            {Object.entries(byCategory).map(([category, categoryMetrics]) => (
              <div key={category}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-ink-soft uppercase tracking-wide">{category}</p>
                  <button type="button" onClick={() => toggleCategory(categoryMetrics)} className="text-xs font-medium text-teal hover:text-teal-strong">
                    {categoryMetrics.every((m) => selected.has(m.id)) ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {categoryMetrics.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleMetric(m.id)} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-signal">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => handleGenerate('pdf')}
          disabled={generating}
          className="bg-teal text-white text-sm font-medium rounded px-4 py-2 hover:bg-teal-strong transition-colors disabled:opacity-60"
        >
          {generating ? 'Generating...' : 'Generate PDF'}
        </button>
        <button
          onClick={() => handleGenerate('csv')}
          disabled={generating}
          className="border border-border text-ink-soft text-sm font-medium rounded px-4 py-2 hover:text-ink transition-colors disabled:opacity-60"
        >
          {generating ? 'Generating...' : 'Generate CSV'}
        </button>
      </div>
    </div>
  );
}
