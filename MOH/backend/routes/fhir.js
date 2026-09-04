const express = require('express');
const router = express.Router();

const Patient = require('../models/Patient');
const Encounter = require('../models/Encounter');
const MedicalHistory = require('../models/MedicalHistory');
const LabResult = require('../models/LabResult');
const ImmunizationRecord = require('../models/ImmunizationRecord');
const auditService = require('../services/auditService');
const { generateMrn } = require('../services/mrnService');
const fhir = require('../services/fhirService');
const { authenticate, blockUntilPasswordChanged, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { patientSearchQuerySchema, fhirPatientImportSchema, idParamSchema } = require('../validation/fhirSchemas');

/**
 * AUTHENTICATION NOTE: these routes reuse this app's existing session
 * Bearer-token auth (same as every other route), restricted to
 * moh_super_admin/facility_admin. That is NOT what a production FHIR
 * integration should use long-term — real system-to-system integration
 * (DHIS2, a WHO reporting pipeline, a donor program's data warehouse)
 * calls for a dedicated service-account/API-key or SMART-on-FHIR OAuth2
 * flow, not a human staff member's login session reused for a machine
 * client. Flagged honestly here rather than built as a fake OAuth2 layer
 * that couldn't be properly secured or tested in this pass — a real
 * client-credentials flow is a follow-up, not something to fake.
 */
const FHIR_ROLES = ['moh_super_admin', 'facility_admin'];

function clientMeta(req) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] || null };
}

// ---------------------------------------------------------------------------
// GET /api/fhir/metadata — CapabilityStatement. Per the FHIR spec, servers
// SHOULD return this even before authentication, so a client can discover
// what's supported before attempting to connect — no auth middleware on
// this one route specifically.
// ---------------------------------------------------------------------------
router.get('/metadata', (req, res) => {
  res.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: { name: 'MOH digital health and inventory platform', version: '1.0.0' },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [
      {
        mode: 'server',
        documentation:
          'Export-focused FHIR interface. See resource list for exact supported interactions per type — this is a partial implementation, not full FHIR conformance; consult the accompanying integration guide before assuming an operation not listed here is supported.',
        resource: [
          { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }], searchParam: [{ name: 'identifier', type: 'token' }] },
          { type: 'Encounter', interaction: [{ code: 'read' }] },
          { type: 'Condition', interaction: [{ code: 'read' }] },
          { type: 'MedicationRequest', interaction: [{ code: 'read' }] },
          { type: 'Observation', interaction: [{ code: 'read' }] },
          { type: 'Immunization', interaction: [{ code: 'read' }] },
        ],
      },
    ],
  });
});

router.use(authenticate, blockUntilPasswordChanged, requireRole(...FHIR_ROLES));

// ---------------------------------------------------------------------------
// GET /api/fhir/Patient/:id — a single patient as a FHIR Patient resource.
// ---------------------------------------------------------------------------
router.get('/Patient/:id', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found' }],
      });
    }
    res.json(fhir.toFhirPatient(patient));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/fhir/Patient?identifier=... — search by MRN or national ID,
// accepting either "system|value" (standard FHIR token search syntax) or a
// bare value. Returns a proper searchset Bundle.
// ---------------------------------------------------------------------------
router.get('/Patient', validate({ query: patientSearchQuerySchema }), async (req, res, next) => {
  try {
    const { identifier } = req.query;
    if (!identifier) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'required', diagnostics: 'identifier search parameter is required' }],
      });
    }

    const value = identifier.includes('|') ? identifier.split('|')[1] : identifier;
    const { blindIndex } = require('../services/encryptionService');
    const hash = blindIndex(value);

    const patients = await Patient.find({
      $or: [{ mrn: value }, { nationalIdBlindIndex: hash }],
    }).limit(20);

    res.json(fhir.bundle('searchset', patients.map(fhir.toFhirPatient)));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/fhir/Patient — import a patient from an external FHIR system
// (e.g. DHIS2 or another facility's registry). Creates a new PROVISIONAL
// patient record — this deliberately does NOT attempt to auto-merge with
// an existing record; it goes through the same deduplication-candidate
// flagging as any other new registration (see services/deduplicationService.js)
// rather than silently overwriting or merging based on external data alone.
// ---------------------------------------------------------------------------
router.post('/Patient', validate({ body: fhirPatientImportSchema }), async (req, res, next) => {
  try {
    const body = req.body;
    const nameEntry = body.name[0];
    const fullName = nameEntry.text || [...(nameEntry.given || []), nameEntry.family].filter(Boolean).join(' ');
    if (!fullName) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'name[0] must have either text or family/given' }],
      });
    }
    if (!req.user.facilityId) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'invalid', diagnostics: 'Importing user must belong to a facility' }],
      });
    }

    const nationalIdEntry = (body.identifier || []).find((i) => i.system?.includes('national-id'));
    const phoneEntry = (body.telecom || []).find((t) => t.system === 'phone');

    const mrn = await generateMrn();
    const patient = await Patient.create({
      mrn,
      fullName,
      sex: body.gender === 'male' || body.gender === 'female' ? body.gender : 'female', // FHIR 'other'/'unknown' has no equivalent in this system's binary sex field — see Patient model comment on why that field stays binary; defaults conservatively rather than guessing, flagged for staff review via provisional status
      dateOfBirth: body.birthDate ? new Date(body.birthDate) : undefined,
      nationalId: nationalIdEntry?.value,
      phone: phoneEntry?.value,
      district: body.address?.[0]?.district,
      identityTier: nationalIdEntry ? 'verified' : 'provisional',
      registeredAtFacility: req.user.facilityId,
      registeredBy: req.user.id,
    });

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'patient_imported_via_fhir',
      targetType: 'Patient',
      targetId: patient._id,
      after: { mrn: patient.mrn },
      ...clientMeta(req),
    });

    res.status(201).json(fhir.toFhirPatient(patient));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/fhir/Patient/:id/$everything — full patient record as a single
// FHIR Bundle: Patient + all Encounters + Conditions + MedicationRequests +
// Observations (vitals + labs) + Immunizations. This is the actual
// interoperability payload — a receiving system (DHIS2, a referral
// hospital's own FHIR-capable EHR) gets the whole clinical picture in one
// standard-shaped response instead of needing N separate proprietary API
// calls against this system's own REST endpoints.
// ---------------------------------------------------------------------------
router.get('/Patient/:id/$everything', validate({ params: idParamSchema }), async (req, res, next) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'not-found', diagnostics: 'Patient not found' }],
      });
    }

    const [encounters, prescriptions, labResults, immunizations] = await Promise.all([
      Encounter.find({ patientId: patient._id }),
      MedicalHistory.find({ patientId: patient._id, entryType: 'prescription', supersededBy: null }),
      LabResult.find({ patientId: patient._id, supersededBy: null }),
      ImmunizationRecord.find({ patientId: patient._id }),
    ]);

    const resources = [fhir.toFhirPatient(patient)];
    for (const enc of encounters) {
      resources.push(fhir.toFhirEncounter(enc));
      resources.push(...fhir.toFhirConditions(enc));
      resources.push(...fhir.toFhirObservationsFromVitals(enc));
    }
    for (const rx of prescriptions) resources.push(fhir.toFhirMedicationRequest(rx));
    for (const lab of labResults) resources.push(fhir.toFhirObservationFromLabResult(lab));
    for (const imm of immunizations) resources.push(fhir.toFhirImmunization(imm));

    await auditService.record({
      actorId: req.user.id,
      actorRole: req.user.role,
      facilityId: req.user.facilityId,
      action: 'patient_fhir_export',
      targetType: 'Patient',
      targetId: patient._id,
      after: { resourceCount: resources.length },
      ...clientMeta(req),
    });

    res.json(fhir.bundle('collection', resources));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
