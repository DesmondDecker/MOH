import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceArea } from 'recharts';
import { useAuth } from '../../context/AuthContext';
import { api, ApiError } from '../../lib/api';
import { Card, Pill, EmptyState, ErrorState, SkeletonList, AsyncButton, ClockIcon } from '../../components/ui';

class CancelledAction extends Error {}

const DEVICE_TYPES = ['refrigerator', 'freezer'];

export default function ColdChainPage() {
  const { user } = useAuth();
  const [devices, setDevices] = useState(null);
  const [breaches, setBreaches] = useState(null);
  const [error, setError] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const load = useCallback(() => {
    if (!user?.facilityId) return;
    api
      .get(`/api/cold-chain/facility/${user.facilityId}/devices`)
      .then((data) => {
        setDevices(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load cold-chain devices.'));

    api
      .get(`/api/cold-chain/facility/${user.facilityId}/breaches?limit=20`)
      .then(setBreaches)
      .catch(() => setBreaches([]));
  }, [user?.facilityId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-ink">Cold-chain monitoring</h1>
          <p className="text-sm text-ink-soft mt-1">
            Vaccine refrigeration integrity, checked automatically against each device's configured safe range (WHO
            standard: 2-8C refrigerated, -25 to -15C freezer-stored).
          </p>
        </div>
        <button
          onClick={() => setShowRegister((v) => !v)}
          className="text-xs font-medium text-white bg-teal hover:bg-teal-strong rounded-md px-3 py-1.5 transition-colors shrink-0"
        >
          {showRegister ? 'Close' : '+ Register device'}
        </button>
      </div>

      {breaches?.length > 0 && (
        <div className="bg-signal-soft border border-signal/30 rounded-md p-3 flex items-start gap-2">
          <ClockIcon className="text-signal shrink-0 mt-0.5" width={16} height={16} />
          <p className="text-sm text-ink">
            <strong>{breaches.length}</strong> temperature breach{breaches.length > 1 ? 'es' : ''} recorded recently.
          </p>
        </div>
      )}

      {showRegister && <RegisterDeviceForm facilityId={user.facilityId} onRegistered={load} />}

      <Card title="Devices">
        {error && <ErrorState message={error} />}
        {!error && devices === null && <SkeletonList rows={3} columns={3} />}
        {!error && devices?.length === 0 && (
          <EmptyState title="No devices registered" description="Register the facility's first fridge or freezer above." />
        )}
        {!error && devices?.length > 0 && (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <DeviceRow
                key={d._id}
                device={d}
                selected={selectedDevice === d._id}
                onSelect={() => setSelectedDevice(selectedDevice === d._id ? null : d._id)}
                onChanged={load}
              />
            ))}
          </ul>
        )}
      </Card>

      {selectedDevice && <DeviceChart deviceId={selectedDevice} devices={devices} />}

      {breaches?.length > 0 && (
        <Card title="Recent breaches">
          <ul className="divide-y divide-border">
            {breaches.map((b) => (
              <li key={b._id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-ink">{b.deviceId?.deviceLabel || 'Unknown device'}</span>
                  <span className="text-ink-soft ml-2">{new Date(b.recordedAt).toLocaleString()}</span>
                </div>
                <Pill tone="signal">{b.temperatureC}C</Pill>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RegisterDeviceForm({ facilityId, onRegistered }) {
  const [form, setForm] = useState({ deviceLabel: '', deviceType: 'refrigerator' });
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const result = await api.post(`/api/cold-chain/facility/${facilityId}/devices`, form);
      setIssued(result);
      onRegistered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not register device.');
    }
  }

  return (
    <Card title="Register a new device">
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Device label</label>
            <input
              required
              placeholder="e.g. Vaccine fridge 1, immunization room"
              value={form.deviceLabel}
              onChange={(e) => setForm((f) => ({ ...f, deviceLabel: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-soft mb-1">Type</label>
            <select
              value={form.deviceType}
              onChange={(e) => setForm((f) => ({ ...f, deviceType: e.target.value }))}
              className="w-full rounded border border-border bg-white px-3 py-1.5 text-sm text-ink focus-visible:outline-none"
            >
              {DEVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="text-sm text-signal">{error}</p>}
        {issued && (
          <div className="bg-teal-soft border border-teal/30 rounded-md p-3 space-y-1">
            <p className="text-xs font-medium text-teal-strong">
              Device API key -- configure the sensor with this now, shown once only:
            </p>
            <p className="font-mono text-xs text-ink break-all">
              Device ID: {issued._id}
              <br />
              API key: {issued.apiKey}
            </p>
          </div>
        )}
        <button type="submit" className="bg-teal text-white text-sm font-medium rounded px-4 py-1.5 hover:bg-teal-strong transition-colors">
          Register device
        </button>
      </form>
    </Card>
  );
}

function DeviceRow({ device, onSelect, onChanged }) {
  const [keyResult, setKeyResult] = useState(null);

  function handleError(err) {
    if (err instanceof CancelledAction) return;
    alert(err instanceof ApiError ? err.message : 'Could not rotate key.');
  }

  async function handleRotate() {
    const confirmed = window.confirm('Rotate this device API key? The old key will stop working immediately.');
    if (!confirmed) throw new CancelledAction();
    const result = await api.post(`/api/cold-chain/devices/${device._id}/rotate-key`);
    setKeyResult(result);
    onChanged();
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <button onClick={onSelect} className="text-left min-w-0">
          <p className="text-sm font-medium text-ink truncate">{device.deviceLabel}</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {device.deviceType} - safe range {device.minSafeC}C to {device.maxSafeC}C
          </p>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <Pill tone={device.status === 'active' ? 'moss' : 'ink'}>{device.status}</Pill>
          <AsyncButton onClick={handleRotate} onError={handleError} loadingLabel="Rotating..." successLabel="Rotated">
            Rotate key
          </AsyncButton>
        </div>
      </div>
      {keyResult && (
        <div className="mt-2 bg-clay-soft border border-clay/30 rounded-md p-2">
          <p className="text-xs font-mono text-ink break-all">New key: {keyResult.apiKey}</p>
        </div>
      )}
    </li>
  );
}

function DeviceChart({ deviceId, devices }) {
  const [readings, setReadings] = useState(null);
  const device = devices?.find((d) => d._id === deviceId);

  useEffect(() => {
    setReadings(null);
    api
      .get(`/api/cold-chain/devices/${deviceId}/readings?limit=100`)
      .then((data) => setReadings([...data].reverse()))
      .catch(() => setReadings([]));
  }, [deviceId]);

  if (!device) return null;

  const chartData = (readings || []).map((r) => ({
    time: new Date(r.recordedAt).toLocaleString(),
    temperatureC: r.temperatureC,
  }));

  return (
    <Card title={`${device.deviceLabel} - temperature history`}>
      <div className="px-4 py-4" style={{ height: 260 }}>
        {readings === null ? (
          <p className="text-sm text-ink-soft">Loading...</p>
        ) : chartData.length === 0 ? (
          <EmptyState title="No readings yet" description="Once the sensor starts reporting, its history appears here." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={() => ''} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={['auto', 'auto']} />
              <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 13 }} />
              <ReferenceArea y1={device.minSafeC} y2={device.maxSafeC} fill="#16a34a" fillOpacity={0.08} />
              <Line type="monotone" dataKey="temperatureC" stroke="#0d9488" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
