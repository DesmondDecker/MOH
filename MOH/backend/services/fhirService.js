/**
 * FHIR R4 MAPPING SERVICE
 * -----------------------------------------------------------------------
 * Converts this system's internal models into standard FHIR R4 resources.
 * This is what makes the registry able to hand data to DHIS2, WHO
 * reporting pipelines, or donor program systems, instead of being an
 * island only this codebase can read.
 *
 * SCOPE — what's implemented and why:
 *  Patient, Encounter, Condition, MedicationRequest, Observation
 *  (vitals + lab results), Immunization. These cover the core clinical
 *  data this registry actually holds. NOT implemented: Practitioner,
 *  Organization, Location, AllergyIntolerance, Procedure as first-class
 *  FHIR resources — the underlying data exists (see models/) but hasn't
 *  been given a FHIR mapping yet. Declared honestly in the
 *  CapabilityStatement (routes/fhir.js) rather than silently omitted, so
 *  a real client can tell what to expect from this endpoint versus what
 *  it needs to get elsewhere.
 *
 * LOINC codes are used for Observation.code where a well-known LOINC code
 * exists for the measurement (vitals, common lab tests) — using LOINC
 * rather than a system-internal code is precisely the point of doing this
 * mapping at all. ICD-10 is used for Condition.code, matching what this
 * system already collects at diagnosis time (see models/Encounter.js
 * diagnosis.icd10Code).
 */

const BASE_SYSTEM_URL = process.env.FHIR_BASE_SYSTEM_URL || 'https://moh.gov.sl/fhir';

// Well-known LOINC codes for the vitals this system records. Not
// exhaustive of all possible observations — just the fixed vitals set
// Encounter.vitals actually has fields for.
const VITALS_LOINC = {
  temperatureC: { code: '8310-5', display: 'Body temperature', unit: 'Cel' },
  bloodPressureSystolic: { code: '8480-6', display: 'Systolic blood pressure', unit: 'mm[Hg]' },
  bloodPressureDiastolic: { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mm[Hg]' },
  heartRateBpm: { code: '8867-4', display: 'Heart rate', unit: '/min' },
  respiratoryRate: { code: '9279-1', display: 'Respiratory rate', unit: '/min' },
  oxygenSaturation: { code: '59408-5', display: 'Oxygen saturation', unit: '%' },
  weightKg: { code: '29463-7', display: 'Body weight', unit: 'kg' },
  heightCm: { code: '8302-2', display: 'Body height', unit: 'cm' },
};

function ref(resourceType, id) {
  return { reference: `${resourceType}/${id}` };
}

function toFhirPatient(patient) {
  const nameParts = (patient.fullName || '').trim().split(/\s+/);
  const given = nameParts.slice(0, -1);
  const family = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];

  return {
    resourceType: 'Patient',
    id: patient._id.toString(),
    identifier: [
      { system: `${BASE_SYSTEM_URL}/mrn`, value: patient.mrn },
      ...(patient.nationalId ? [{ system: `${BASE_SYSTEM_URL}/national-id`, value: patient.nationalId }] : []),
    ],
    active: patient.status === 'active',
    name: [{ use: 'official', family, given: given.length ? given : undefined, text: patient.fullName }],
    gender: patient.sex === 'male' ? 'male' : patient.sex === 'female' ? 'female' : 'unknown',
    birthDate: patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().slice(0, 10) : undefined,
    telecom: patient.phone ? [{ system: 'phone', value: patient.phone }] : undefined,
    address: patient.district
      ? [{ district: patient.district, line: patient.address ? [patient.address] : undefined, text: patient.chiefdom }]
      : undefined,
    deceasedBoolean: patient.status === 'deceased' ? true : undefined,
  };
}

function toFhirEncounter(encounter) {
  const statusMap = { open: 'in-progress', closed: 'finished', referred: 'finished' };
  return {
    resourceType: 'Encounter',
    id: encounter._id.toString(),
    status: statusMap[encounter.status] || 'unknown',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: encounter.type === 'inpatient_admission' ? 'IMP' : encounter.type === 'emergency' ? 'EMER' : 'AMB',
      display: encounter.type,
    },
    subject: ref('Patient', encounter.patientId),
    period: {
      start: encounter.admittedAt ? new Date(encounter.admittedAt).toISOString() : undefined,
      end: encounter.dischargedAt ? new Date(encounter.dischargedAt).toISOString() : undefined,
    },
    reasonCode: encounter.chiefComplaint ? [{ text: encounter.chiefComplaint }] : undefined,
  };
}

function toFhirConditions(encounter) {
  return (encounter.diagnosis || []).map((dx, i) => ({
    resourceType: 'Condition',
    id: `${encounter._id}-dx-${i}`,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    code: {
      coding: dx.icd10Code ? [{ system: 'http://hl7.org/fhir/sid/icd-10', code: dx.icd10Code }] : undefined,
      text: dx.description,
    },
    subject: ref('Patient', encounter.patientId),
    encounter: ref('Encounter', encounter._id),
    recordedDate: encounter.createdAt ? new Date(encounter.createdAt).toISOString() : undefined,
  }));
}

function toFhirMedicationRequest(prescriptionEntry) {
  const statusMap = { pending: 'active', partially_dispensed: 'active', dispensed: 'completed', cancelled: 'cancelled' };
  const p = prescriptionEntry.prescription;
  return {
    resourceType: 'MedicationRequest',
    id: prescriptionEntry._id.toString(),
    status: statusMap[p.dispenseStatus] || 'unknown',
    intent: 'order',
    medicationCodeableConcept: { text: p.drugName },
    subject: ref('Patient', prescriptionEntry.patientId),
    encounter: prescriptionEntry.encounterId ? ref('Encounter', prescriptionEntry.encounterId) : undefined,
    authoredOn: prescriptionEntry.createdAt ? new Date(prescriptionEntry.createdAt).toISOString() : undefined,
    requester: prescriptionEntry.prescribedBy ? ref('Practitioner', prescriptionEntry.prescribedBy) : undefined,
    dosageInstruction: [
      {
        text: [p.dosage, p.frequency, p.route].filter(Boolean).join(', '),
        timing: p.durationDays
          ? { repeat: { boundsDuration: { value: p.durationDays, unit: 'd', system: 'http://unitsofmeasure.org', code: 'd' } } }
          : undefined,
      },
    ],
  };
}

function toFhirObservationsFromVitals(encounter) {
  if (!encounter.vitals) return [];
  const raw = encounter.vitals.toObject ? encounter.vitals.toObject() : encounter.vitals;
  const observations = [];
  for (const [field, value] of Object.entries(raw)) {
    if (value === undefined || value === null || !VITALS_LOINC[field]) continue;
    const loinc = VITALS_LOINC[field];
    observations.push({
      resourceType: 'Observation',
      id: `${encounter._id}-vital-${field}`,
      status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { coding: [{ system: 'http://loinc.org', code: loinc.code, display: loinc.display }] },
      subject: ref('Patient', encounter.patientId),
      encounter: ref('Encounter', encounter._id),
      effectiveDateTime: raw.recordedAt ? new Date(raw.recordedAt).toISOString() : undefined,
      valueQuantity: { value, unit: loinc.unit, system: 'http://unitsofmeasure.org', code: loinc.unit },
    });
  }
  return observations;
}

function toFhirObservationFromLabResult(labResult) {
  const statusMap = { ordered: 'registered', in_progress: 'preliminary', completed: 'final', cancelled: 'cancelled' };
  return {
    resourceType: 'Observation',
    id: labResult._id.toString(),
    status: statusMap[labResult.status] || 'unknown',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
    code: { text: labResult.testName }, // no fixed LOINC map — testName is free text at order time, not a coded catalog value in this system
    subject: ref('Patient', labResult.patientId),
    encounter: labResult.encounterId ? ref('Encounter', labResult.encounterId) : undefined,
    effectiveDateTime: labResult.createdAt ? new Date(labResult.createdAt).toISOString() : undefined,
    valueString: labResult.result?.value !== undefined ? String(labResult.result.value) : undefined,
    interpretation: labResult.result?.isAbnormal
      ? [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation', code: labResult.result.isCritical ? 'HH' : 'A' }] }]
      : undefined,
  };
}

function toFhirImmunization(record) {
  return {
    resourceType: 'Immunization',
    id: record._id.toString(),
    status: 'completed', // this system doesn't track not-done/entered-in-error states — every stored record represents a dose actually given
    vaccineCode: { text: record.vaccine },
    patient: ref('Patient', record.patientId),
    encounter: record.encounterId ? ref('Encounter', record.encounterId) : undefined,
    occurrenceDateTime: record.administeredDate ? new Date(record.administeredDate).toISOString() : undefined,
    lotNumber: record.batchNumber,
    protocolApplied: record.dose > 0 ? [{ doseNumberPositiveInt: record.dose }] : undefined,
  };
}

function bundle(type, resources) {
  return {
    resourceType: 'Bundle',
    type,
    total: resources.length,
    entry: resources.map((r) => ({ fullUrl: `${BASE_SYSTEM_URL}/${r.resourceType}/${r.id}`, resource: r })),
  };
}

module.exports = {
  toFhirPatient,
  toFhirEncounter,
  toFhirConditions,
  toFhirMedicationRequest,
  toFhirObservationsFromVitals,
  toFhirObservationFromLabResult,
  toFhirImmunization,
  bundle,
  BASE_SYSTEM_URL,
};
