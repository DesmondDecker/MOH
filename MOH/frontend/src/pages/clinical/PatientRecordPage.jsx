import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { cachePatientBundle, getCachedPatientBundle } from '../../lib/offlineCache';
import { Card, Pill, ErrorState, AsyncButton } from '../../components/ui';
import Sparkline from '../../components/clinical/Sparkline';
import NewEncounterForm from '../../components/clinical/NewEncounterForm';
import PrescribeForm from '../../components/clinical/PrescribeForm';
import DiagnosisForm from '../../components/clinical/DiagnosisForm';
import LabPanel from '../../components/clinical/LabPanel';
import BreakGlassBanner from '../../components/clinical/BreakGlassBanner';
import PatientIdCard from '../../components/clinical/PatientIdCard';
import GrowthImmunizationPanel from '../../components/clinical/GrowthImmunizationPanel';
import AntenatalPanel from '../../components/clinical/AntenatalPanel';
import Modal from '../../components/Modal';

const BASE_TABS = ['Medications', 'Labs', 'Encounters', 'Growth & Immunization'];

function calculateAge(dob) {
  if (!dob) return null;
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export default function PatientRecordPage() {
  const { patientId } = useParams();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const [patient, setPatient] = useState(null);
  const [encounters, setEncounters] = useState([]);
  const [medicalHistory, setMedicalHistory] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('Medications');
  const [showingCached, setShowingCached] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const wasOffline = useRef(false);

  const loadAll = useCallback(async () => {
    try {
      const [p, enc, mh, labs] = await Promise.all([
        api.get(`/api/patients/${patientId}`),
        api.get(`/api/encounters/patient/${patientId}`),
        api.get(`/api/medical-history/patient/${patientId}`),
        api.get(`/api/lab-results/patient/${patientId}`),
      ]);
      setPatient(p);
      setEncounters(enc);
      setMedicalHistory(mh);
      setLabResults(labs);
      setError(null);
      setShowingCached(false);
      setLastSyncedAt(new Date());
      cachePatientBundle(patientId, { patient: p, encounters: enc, medicalHistory: mh, labResults: labs });
    } catch (err) {
      // A real backend response (404, 403, etc.) is authoritative — showing
      // stale cached data instead would be actively misleading (e.g. a
      // merged/deleted patient). Only fall back to cache when the request
      // never reached the server at all — a plain fetch failure, which
      // surfaces as something other than ApiError.
      if (!(err instanceof ApiError)) {
        const cached = getCachedPatientBundle(patientId);
        if (cached) {
          setPatient(cached.bundle.patient);
          setEncounters(cached.bundle.encounters);
          setMedicalHistory(cached.bundle.medicalHistory);
          setLabResults(cached.bundle.labResults);
          setShowingCached(true);
          setLastSyncedAt(cached.cachedAt);
          setError(null);
          return;
        }
        setError('No connection, and no cached copy of this record on this device yet.');
        return;
      }
      setError(err.message);
    }
  }, [patientId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // When connectivity returns after having been offline, refetch
  // automatically so the clinician isn't left looking at a stale record
  // once the network is actually back.
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
    } else if (wasOffline.current) {
      wasOffline.current = false;
      loadAll();
    }
  }, [online, loadAll]);

  if (error) return <ErrorState message={error} />;
  if (!patient) return <p className="text-sm text-ink-soft">Loading…</p>;

  // Antenatal only makes sense for female patients — matches the backend's
  // own validation (routes/mch.js rejects an antenatal visit for a male
  // patient), so the tab simply isn't offered rather than being clickable
  // and then failing.
  const tabs = patient.sex === 'female' ? [...BASE_TABS, 'Antenatal'] : BASE_TABS;

  const openEncounter = encounters.find((e) => e.status === 'open');
  const weightSeries = encounters
    .filter((e) => e.vitals?.weightKg)
    .map((e) => ({ value: e.vitals.weightKg, date: e.admittedAt }));

  const crossFacility = patient.registeredAtFacility && patient.registeredAtFacility._id !== user?.facilityId;

  return (
    <div className="space-y-6">
      {showingCached && (
        <div className="bg-clay-soft border border-clay/30 rounded-md px-4 py-3" role="status">
          <p className="text-sm font-medium text-ink">
            Showing this record as last synced — no connection right now.
          </p>
          <p className="text-xs text-ink-soft mt-0.5">
            Last synced {lastSyncedAt?.toLocaleString()}. New encounters, prescriptions, or edits can't be saved
            until connectivity returns.
          </p>
        </div>
      )}

      {crossFacility && (
        <BreakGlassBanner
          patientId={patientId}
          facilityName={patient.registeredAtFacility.name}
          onLogged={loadAll}
        />
      )}

      {/* Header */}
      <div className="bg-canvas-raised border border-border rounded-md p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl text-ink">{patient.fullName}</h1>
            <p className="text-sm text-ink-soft font-mono mt-1">
              {patient.mrn} · {patient.sex} · {calculateAge(patient.dateOfBirth) ?? '—'} yrs
              {patient.dateOfBirthEstimated && ' (est.)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIdCardOpen(true)}
              className="text-xs font-medium text-teal hover:text-teal-strong border border-border rounded-md px-2.5 py-1.5"
            >
              ID card
            </button>
            <Pill tone={patient.identityTier === 'verified' ? 'moss' : 'clay'}>{patient.identityTier}</Pill>
          </div>
        </div>

        {patient.allergies?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {patient.allergies.map((a, i) => (
              <Pill key={i} tone="signal">
                Allergy: {a.substance}
                {a.severity && ` (${a.severity})`}
              </Pill>
            ))}
          </div>
        )}

        {patient.chronicConditions?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {patient.chronicConditions.map((c, i) => (
              <Pill key={i} tone="clay">
                {c.condition}
              </Pill>
            ))}
          </div>
        )}

        {weightSeries.length >= 2 && (
          <div className="mt-4 pt-4 border-t border-border max-w-xs">
            <p className="text-xs font-medium text-ink-soft mb-1">Weight trend (kg)</p>
            <Sparkline points={weightSeries} unit="kg" />
          </div>
        )}
      </div>

      {/* Open encounter panel */}
      <Card title={openEncounter ? 'Open encounter' : 'Start an encounter'}>
        <div className="px-4 py-4">
          {showingCached ? (
            <p className="text-sm text-ink-soft italic">
              Encounters, diagnoses, and prescriptions can't be recorded while offline — reconnect to continue this
              visit.
            </p>
          ) : !openEncounter ? (
            <NewEncounterForm patientId={patientId} crossFacility={crossFacility} onCreated={loadAll} />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Pill tone="teal">{openEncounter.type.replace('_', ' ')}</Pill>
                <span className="text-sm text-ink-soft">{openEncounter.chiefComplaint}</span>
              </div>

              {openEncounter.diagnosis?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {openEncounter.diagnosis.map((d, i) => (
                    <Pill key={i} tone={d.isNotifiableDisease ? 'signal' : 'ink'}>
                      {d.description}
                      {d.isNotifiableDisease && ' — notifiable'}
                    </Pill>
                  ))}
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-ink-soft mb-1">Add diagnosis</p>
                <DiagnosisForm
                  encounterId={openEncounter._id}
                  onAdded={(updated) =>
                    setEncounters((prev) => prev.map((e) => (e._id === updated._id ? updated : e)))
                  }
                />
              </div>

              <div>
                <p className="text-xs font-medium text-ink-soft mb-1">Prescribe</p>
                <PrescribeForm patientId={patientId} encounterId={openEncounter._id} onPrescribed={loadAll} />
              </div>

              {openEncounter.referral?.referredToFacilityId && !showingCached && (
                <DocumentExportButton encounterId={openEncounter._id} isReferral />
              )}

              <DischargeButton encounterId={openEncounter._id} onDischarged={loadAll} />
            </div>
          )}
        </div>
      </Card>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-border mb-4 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-teal text-teal-strong' : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Medications' && (
          <Card>
            {medicalHistory.filter((m) => m.entryType === 'prescription').length === 0 ? (
              <p className="text-sm text-ink-soft px-4 py-6">No prescriptions recorded.</p>
            ) : (
              <ul className="divide-y divide-border">
                {medicalHistory
                  .filter((m) => m.entryType === 'prescription')
                  .map((m) => (
                    <li key={m._id} className="px-4 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-ink">
                          {m.prescription.drugName} — {m.prescription.dosage} {m.prescription.frequency}
                        </p>
                        <div className="flex items-center gap-2">
                          {m.prescription.allergyConflictOverridden && <Pill tone="signal">Override</Pill>}
                          <Pill tone={m.prescription.dispenseStatus === 'dispensed' ? 'moss' : 'ink'}>
                            {m.prescription.dispenseStatus}
                          </Pill>
                        </div>
                      </div>
                      <p className="text-xs text-ink-soft font-mono mt-0.5">
                        {new Date(m.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'Labs' && (
          <Card>
            <div className="px-4 py-4">
              <LabPanel
                patientId={patientId}
                encounterId={openEncounter?._id}
                labResults={labResults}
                onChanged={loadAll}
              />
            </div>
          </Card>
        )}

        {tab === 'Encounters' && (
          <Card>
            {encounters.length === 0 ? (
              <p className="text-sm text-ink-soft px-4 py-6">No encounters yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {encounters.map((e) => {
                  const canExport = e.status !== 'open' || e.referral?.referredToFacilityId;
                  return (
                    <li key={e._id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-ink">{e.chiefComplaint || e.type}</p>
                        <p className="text-xs text-ink-soft font-mono">
                          {new Date(e.admittedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {canExport && !showingCached && (
                          <DocumentExportButton encounterId={e._id} isReferral={!!e.referral?.referredToFacilityId} />
                        )}
                        <Pill tone={e.status === 'open' ? 'teal' : 'ink'}>{e.status}</Pill>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === 'Growth & Immunization' && (
          <GrowthImmunizationPanel patientId={patientId} encounterId={openEncounter?._id} />
        )}

        {tab === 'Antenatal' && <AntenatalPanel patientId={patientId} encounterId={openEncounter?._id} />}
      </div>

      <Modal open={idCardOpen} onClose={() => setIdCardOpen(false)} title="Patient ID card">
        <PatientIdCard patient={patient} facilityName={patient.registeredAtFacility?.name} />
        <button
          onClick={() => window.print()}
          className="mt-4 w-full bg-teal text-white font-medium rounded-md py-2 hover:bg-teal-strong transition-colors"
        >
          Print
        </button>
      </Modal>
    </div>
  );
}

function DischargeButton({ encounterId, onDischarged }) {
  const [error, setError] = useState(null);

  async function handleDischarge() {
    setError(null);
    try {
      await api.post(`/api/encounters/${encounterId}/discharge`);
      onDischarged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not discharge.');
      throw err; // AsyncButton needs the rejection to know not to show the success morph
    }
  }

  return (
    <div className="pt-3 border-t border-border">
      <AsyncButton onClick={handleDischarge} loadingLabel="Discharging…" successLabel="Discharged">
        Discharge / close encounter
      </AsyncButton>
      {error && <p className="text-sm text-signal mt-1">{error}</p>}
    </div>
  );
}

function DocumentExportButton({ encounterId, isReferral }) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      await api.download(
        `/api/encounters/${encounterId}/discharge-summary.pdf`,
        `${isReferral ? 'referral-letter' : 'discharge-summary'}-${encounterId}.pdf`
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not generate document.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleDownload}
        disabled={downloading}
        className="text-xs font-medium text-teal hover:text-teal-strong border border-teal/30 rounded px-2.5 py-1 disabled:opacity-60 whitespace-nowrap"
      >
        {downloading ? 'Generating…' : isReferral ? 'Referral letter (PDF)' : 'Discharge summary (PDF)'}
      </button>
      {error && <p className="text-xs text-signal mt-1">{error}</p>}
    </div>
  );
}
