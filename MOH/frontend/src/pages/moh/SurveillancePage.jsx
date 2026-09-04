import { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell } from 'recharts';
import { api, ApiError } from '../../lib/api';
import { Card, EmptyState, ErrorState, ShieldIcon, SkeletonList } from '../../components/ui';

const WINDOWS = [7, 30, 90];

// Matches --color-signal / --color-clay from index.css — Recharts renders
// to an SVG canvas that doesn't resolve CSS custom properties the way
// Tailwind classes do, so the hex values are duplicated here deliberately.
const SIGNAL = '#dc2626';
const SIGNAL_SOFT = '#fef2f2';

export default function SurveillancePage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    api
      .get(`/api/moh/surveillance/notifiable-diseases?days=${days}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load surveillance data.'));
  }, [days]);

  const chartData = useMemo(() => {
    if (!data?.results) return [];
    // icd10Code, not `disease` — the free-text diagnosis description is
    // encrypted at rest (see models/Encounter.js) and can no longer be
    // aggregated over in Mongo, so the API now groups by the coded,
    // non-identifying ICD-10 value instead. "UNCODED" surfaces diagnoses
    // flagged notifiable that weren't given a code at entry, so they stay
    // visible in the count rather than silently vanishing.
    return data.results.map((r) => ({
      label: r.icd10Code === 'UNCODED' ? 'Uncoded' : r.icd10Code,
      district: r.district,
      count: r.count,
      facilities: r.facilities,
      mostRecent: r.mostRecent,
    }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Disease surveillance</h1>
          <p className="text-sm text-ink-soft mt-1">Notifiable diagnoses by district, most affected first.</p>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                days === w ? 'bg-teal text-white' : 'bg-canvas-raised border border-border text-ink-soft hover:text-ink'
              }`}
            >
              {w}d
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorState message={error} />}

      {!error && data === null && <SkeletonList rows={4} columns={4} />}

      {!error && data && chartData.length === 0 && (
        <Card>
          <EmptyState
            icon={<ShieldIcon />}
            title="No notifiable diagnoses"
            description={`Nothing flagged as a notifiable disease in the last ${days} days. This is expected — it only shows activity, not the absence of risk.`}
          />
        </Card>
      )}

      {!error && data && chartData.length > 0 && (
        <>
          <Card title="Notifiable diagnoses by ICD-10 code">
            <div className="px-4 py-4" style={{ height: Math.max(220, chartData.length * 44) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={110}
                    tick={{ fontSize: 12, fill: '#0f172a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value, _name, props) => [`${value} case${value === 1 ? '' : 's'}`, props.payload.district]}
                    contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="count" fill={SIGNAL} radius={[0, 4, 4, 0]} background={{ fill: SIGNAL_SOFT }}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={SIGNAL} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card title="Detail">
            <ul className="divide-y divide-border">
              {chartData.map((r, i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-ink">{r.label}</span>
                      <span className="text-xs text-ink-soft ml-2">{r.district}</span>
                    </div>
                    <span className="font-mono text-sm text-signal">{r.count}</span>
                  </div>
                  <p className="text-xs text-ink-soft mt-1">
                    {r.facilities.length} facilit{r.facilities.length === 1 ? 'y' : 'ies'} · most recent{' '}
                    {new Date(r.mostRecent).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
