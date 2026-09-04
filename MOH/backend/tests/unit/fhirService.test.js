const mongoose = require('mongoose');
const fhir = require('../../services/fhirService');

function fakeId() {
  return new mongoose.Types.ObjectId();
}

describe('fhirService — toFhirPatient', () => {
  test('produces a structurally valid FHIR Patient resource', () => {
    const patient = {
      _id: fakeId(),
      mrn: 'SL-2026-000123',
      fullName: 'Fatmata Kamara',
      sex: 'female',
      dateOfBirth: new Date('1990-05-15'),
      status: 'active',
      district: 'Bo',
      phone: '076123456',
    };
    const resource = fhir.toFhirPatient(patient);

    expect(resource.resourceType).toBe('Patient');
    expect(resource.id).toBe(patient._id.toString());
    expect(resource.identifier[0]).toEqual({ system: expect.stringContaining('/mrn'), value: 'SL-2026-000123' });
    expect(resource.name[0].family).toBe('Kamara');
    expect(resource.name[0].given).toEqual(['Fatmata']);
    expect(resource.gender).toBe('female');
    expect(resource.birthDate).toBe('1990-05-15');
    expect(resource.active).toBe(true);
  });

  test('maps a deceased patient status to deceasedBoolean', () => {
    const patient = { _id: fakeId(), mrn: 'X', fullName: 'Test Patient', sex: 'male', status: 'deceased' };
    expect(fhir.toFhirPatient(patient).deceasedBoolean).toBe(true);
  });

  test('handles a single-word name without throwing', () => {
    const patient = { _id: fakeId(), mrn: 'X', fullName: 'Madonna', sex: 'female', status: 'active' };
    const resource = fhir.toFhirPatient(patient);
    expect(resource.name[0].family).toBe('Madonna');
  });

  test('includes national ID as a second identifier when present', () => {
    const patient = { _id: fakeId(), mrn: 'X', fullName: 'Test', sex: 'male', status: 'active', nationalId: '19900101-000-1' };
    const resource = fhir.toFhirPatient(patient);
    expect(resource.identifier).toHaveLength(2);
    expect(resource.identifier[1].value).toBe('19900101-000-1');
  });
});

describe('fhirService — toFhirEncounter', () => {
  test('maps encounter status and type to valid FHIR Encounter fields', () => {
    const patientId = fakeId();
    const encounter = {
      _id: fakeId(),
      patientId,
      status: 'closed',
      type: 'inpatient_admission',
      admittedAt: new Date('2026-01-01'),
      dischargedAt: new Date('2026-01-05'),
    };
    const resource = fhir.toFhirEncounter(encounter);

    expect(resource.resourceType).toBe('Encounter');
    expect(resource.status).toBe('finished');
    expect(resource.class.code).toBe('IMP');
    expect(resource.subject.reference).toBe(`Patient/${patientId}`);
    expect(resource.period.start).toBeDefined();
    expect(resource.period.end).toBeDefined();
  });

  test('maps emergency encounter type to EMER class code', () => {
    const encounter = { _id: fakeId(), patientId: fakeId(), status: 'open', type: 'emergency' };
    expect(fhir.toFhirEncounter(encounter).class.code).toBe('EMER');
  });

  test('maps outpatient/default encounter type to AMB (ambulatory) class code', () => {
    const encounter = { _id: fakeId(), patientId: fakeId(), status: 'open', type: 'outpatient' };
    expect(fhir.toFhirEncounter(encounter).class.code).toBe('AMB');
  });
});

describe('fhirService — toFhirConditions', () => {
  test('maps each diagnosis to a separate Condition resource with ICD-10 coding', () => {
    const encounter = {
      _id: fakeId(),
      patientId: fakeId(),
      diagnosis: [
        { description: 'Malaria', icd10Code: 'B54' },
        { description: 'Anemia', icd10Code: 'D64.9' },
      ],
    };
    const conditions = fhir.toFhirConditions(encounter);
    expect(conditions).toHaveLength(2);
    expect(conditions[0].code.coding[0].code).toBe('B54');
    expect(conditions[0].code.coding[0].system).toContain('icd-10');
    expect(conditions[1].code.text).toBe('Anemia');
  });

  test('returns an empty array when there is no diagnosis', () => {
    expect(fhir.toFhirConditions({ _id: fakeId(), patientId: fakeId() })).toEqual([]);
  });
});

describe('fhirService — toFhirMedicationRequest', () => {
  test('maps a dispensed prescription to a completed MedicationRequest', () => {
    const entry = {
      _id: fakeId(),
      patientId: fakeId(),
      encounterId: fakeId(),
      prescribedBy: fakeId(),
      prescription: { drugName: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', dispenseStatus: 'dispensed' },
    };
    const resource = fhir.toFhirMedicationRequest(entry);
    expect(resource.resourceType).toBe('MedicationRequest');
    expect(resource.status).toBe('completed');
    expect(resource.intent).toBe('order');
    expect(resource.medicationCodeableConcept.text).toBe('Amoxicillin');
    expect(resource.dosageInstruction[0].text).toContain('500mg');
  });
});

describe('fhirService — toFhirObservationsFromVitals', () => {
  test('maps each recorded vital to a separate Observation with a LOINC code', () => {
    const encounter = {
      _id: fakeId(),
      patientId: fakeId(),
      vitals: { temperatureC: 38.5, heartRateBpm: 90, recordedAt: new Date() },
    };
    const observations = fhir.toFhirObservationsFromVitals(encounter);
    expect(observations).toHaveLength(2);
    const temp = observations.find((o) => o.code.coding[0].code === '8310-5');
    expect(temp).toBeDefined();
    expect(temp.valueQuantity.value).toBe(38.5);
  });

  test('returns an empty array when there are no vitals', () => {
    expect(fhir.toFhirObservationsFromVitals({ _id: fakeId(), patientId: fakeId() })).toEqual([]);
  });

  test('skips undefined vital fields rather than emitting a null-value Observation', () => {
    const encounter = { _id: fakeId(), patientId: fakeId(), vitals: { temperatureC: 38.5 } };
    const observations = fhir.toFhirObservationsFromVitals(encounter);
    expect(observations).toHaveLength(1);
  });
});

describe('fhirService — toFhirImmunization', () => {
  test('maps a dose to a completed Immunization resource', () => {
    const record = { _id: fakeId(), patientId: fakeId(), vaccine: 'Pentavalent', dose: 2, administeredDate: new Date() };
    const resource = fhir.toFhirImmunization(record);
    expect(resource.resourceType).toBe('Immunization');
    expect(resource.status).toBe('completed');
    expect(resource.vaccineCode.text).toBe('Pentavalent');
    expect(resource.protocolApplied[0].doseNumberPositiveInt).toBe(2);
  });
});

describe('fhirService — bundle', () => {
  test('wraps resources in a valid Bundle with the requested type', () => {
    const resources = [{ resourceType: 'Patient', id: '1' }, { resourceType: 'Encounter', id: '2' }];
    const result = fhir.bundle('collection', resources);
    expect(result.resourceType).toBe('Bundle');
    expect(result.type).toBe('collection');
    expect(result.total).toBe(2);
    expect(result.entry).toHaveLength(2);
    expect(result.entry[0].resource).toBe(resources[0]);
  });

  test('supports a searchset bundle type', () => {
    expect(fhir.bundle('searchset', []).type).toBe('searchset');
  });
});
