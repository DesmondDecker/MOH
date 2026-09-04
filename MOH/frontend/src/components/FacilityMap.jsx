import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';

const SIERRA_LEONE_CENTER = [8.4606, -11.7799];
const DEFAULT_ZOOM = 7;

const RISK_COLOR = {
  critical: '#dc2626', // --color-signal
  warning: '#d97706', // --color-clay
  ok: '#16a34a', // --color-moss
};
const RISK_LABEL = { critical: 'Sync failing', warning: 'Needs attention', ok: 'Healthy' };

/**
 * A facility's map risk is about facility-level operational health (is data
 * even getting through, is stock running low) — deliberately narrower than
 * the item-level stockout forecast on the inventory pages, since plotting
 * per-item forecasts on a national map would be unreadable at this zoom
 * level. This is "is something wrong here at all", not "what exactly".
 */
function riskLevel(facility) {
  if (facility.syncFailed > 0) return 'critical';
  if (facility.stockAlertCount > 0 || facility.syncPending > 50) return 'warning';
  return 'ok';
}

// Marker radius scales with patient volume (sqrt, so a facility with 4x the
// patients isn't literally 4x the marker area — that would dominate the map)
function markerRadius(patientCount) {
  return Math.min(22, Math.max(6, Math.sqrt(patientCount || 0) * 1.4));
}

function FlyToBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.flyTo(positions[0], 11);
    } else {
      map.flyToBounds(positions, { padding: [40, 40], maxZoom: 12 });
    }
  }, [positions, map]);
  return null;
}

export default function FacilityMap({ facilities, selectedDistrict }) {
  const located = useMemo(() => facilities.filter((f) => f.location?.latitude && f.location?.longitude), [facilities]);
  const unlocated = facilities.length - located.length;

  const filtered = selectedDistrict ? located.filter((f) => f.district === selectedDistrict) : located;
  const positions = filtered.map((f) => [f.location.latitude, f.location.longitude]);

  return (
    <div>
      <div className="rounded-md overflow-hidden border border-border" style={{ height: 480 }}>
        <MapContainer center={SIERRA_LEONE_CENTER} zoom={DEFAULT_ZOOM} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {selectedDistrict && <FlyToBounds positions={positions} />}
          {located.map((f) => {
            const risk = riskLevel(f);
            const dimmed = selectedDistrict && f.district !== selectedDistrict;
            return (
              <CircleMarker
                key={f.facilityId}
                center={[f.location.latitude, f.location.longitude]}
                radius={markerRadius(f.patientCount)}
                pathOptions={{
                  color: RISK_COLOR[risk],
                  fillColor: RISK_COLOR[risk],
                  fillOpacity: dimmed ? 0.15 : 0.65,
                  opacity: dimmed ? 0.25 : 1,
                  weight: 1.5,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 180 }}>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>{f.name}</p>
                    <p style={{ fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      {f.code} · {f.district} · {f.type.replace(/_/g, ' ')}
                    </p>
                    <p style={{ fontSize: 12, marginBottom: 2 }}>
                      <strong>{RISK_LABEL[risk]}</strong>
                    </p>
                    <p style={{ fontSize: 12, margin: 0 }}>{f.patientCount} patients · {f.activeEncounters} active encounters</p>
                    <p style={{ fontSize: 12, margin: 0 }}>
                      {f.stockAlertCount} items low on stock · {f.syncFailed} sync failures, {f.syncPending} pending
                    </p>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-4 text-xs text-ink-soft">
          {Object.entries(RISK_LABEL).map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: RISK_COLOR[key] }}
              />
              {label}
            </span>
          ))}
          <span>Marker size ~ patient volume</span>
        </div>
        {unlocated > 0 && (
          <p className="text-xs text-ink-soft">
            {unlocated} {unlocated === 1 ? 'facility has' : 'facilities have'} no coordinates on file and can't be
            plotted.
          </p>
        )}
      </div>
    </div>
  );
}
