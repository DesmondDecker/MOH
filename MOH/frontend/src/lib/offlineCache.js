const CACHE_PREFIX = 'moh_offline_patient_';

/**
 * Minimal offline cache for the clinical view: the full patient bundle
 * (patient + encounters + medical history + labs) is written to
 * localStorage every time it loads successfully, keyed by patient ID, with
 * a timestamp. When a fetch fails due to connectivity (not an auth or
 * validation error — see PatientRecordPage), the UI falls back to this
 * cached copy and shows "last synced at X" rather than a dead error page.
 *
 * Deliberately not a general offline queue or service worker — this is
 * read-only continuity for the one screen a clinician actually needs
 * mid-visit when the facility drops connectivity, not full offline editing.
 * Writes (new encounters, prescriptions, etc.) still require connectivity
 * and will fail normally if attempted while offline.
 */
function cachePatientBundle(patientId, bundle) {
  try {
    const record = { bundle, cachedAt: new Date().toISOString() };
    localStorage.setItem(CACHE_PREFIX + patientId, JSON.stringify(record));
  } catch {
    // Storage full or unavailable (e.g. private browsing) — offline fallback
    // simply won't be available for this patient. Never let this break the
    // normal online path.
  }
}

function getCachedPatientBundle(patientId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + patientId);
    if (!raw) return null;
    const record = JSON.parse(raw);
    return { bundle: record.bundle, cachedAt: new Date(record.cachedAt) };
  } catch {
    return null;
  }
}

export { cachePatientBundle, getCachedPatientBundle };
