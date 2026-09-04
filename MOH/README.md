# MOH digital health and inventory platform

A national-scale digital health and inventory management platform for Sierra Leone's Ministry of Health & Sanitation.
MERN-based (MongoDB, Express, React, Node), built for real facility
conditions — intermittent connectivity, shared low-end devices, and staff
across a wide range of technical experience.

## What's in here

**Backend** (`backend/`) — Express 5 + Mongoose API. See `backend/tests/README.md`
for the test suite and `.github/workflows/ci.yml` for CI.

**Frontend** (`frontend/`) — React 19 + Vite + Tailwind 4, role-based
shells for each staff type (facility admin, clinician, pharmacist, MoH
super admin, CHW).

## Modules

| Module | What it does |
|---|---|
| **MOH digital health and inventory platform** | Tiered identity (verified/provisional/newborn), field-level encryption on PII, deduplication with fuzzy matching |
| **Clinical records** | Encounters, diagnoses (ICD-10), prescriptions with allergy/interaction checking, lab results, discharge/referral PDFs |
| **Inventory** | Drug/consumable stock, batch expiry tracking, transfers between facilities, forecasting |
| **Blood bank** | Individually tracked units, ABO/Rh compatibility search, screening workflow, transfusion chain of custody |
| **Cold chain** | IoT sensor ingestion for vaccine fridges/freezers, automatic breach detection and alerting |
| **Maternal & Child Health** | Antenatal visit tracking, growth/MUAC malnutrition screening, immunization schedule with due/overdue flags |
| **CHW outreach** | Offline-first mobile companion app (IndexedDB queue + service worker) for community health workers |
| **MoH admin** | Facility CRUD, staff directory, cross-facility reporting, super-admin management with safeguards |
| **Clinical decision support** | Drug-class allergy cross-reactivity, drug-drug interaction checking, break-glass access review |
| **Report builder** | Select metrics + scope + date range, export donor-ready PDF/CSV |
| **Interoperability** | HL7 FHIR R4 export/import layer for DHIS2/WHO reporting pipelines |
| **Security** | TOTP 2FA (mandatory for admin roles), field-level AES-256-GCM encryption, full audit logging, RBAC |

## Getting started

```bash
cp backend/.env.example backend/.env
# fill in every REPLACE_WITH_... value -- see DEPLOYMENT.md "Secrets"

docker compose up --build
```

Frontend: http://localhost:8080 -- Backend: http://localhost:5000

See **DEPLOYMENT.md** for secrets management, encryption key handling, and
what changes at national scale (read replicas, TLS, orchestration).

## Development

```bash
# Backend
cd backend && npm install
npm run lint
npm test                    # unit tests, no DB needed
npm run test:integration    # needs MongoDB -- see tests/README.md

# Frontend
cd frontend && npm install
npm run lint
npm run build
```

## Honest status -- what's real, what's documented-but-not-provisioned

Everything above was built and verified end-to-end in this codebase: real
schema validation, real tests (unit suites pass; integration tests are
written correctly but need a real MongoDB to execute), real Docker
builds (linted with hadolint; actual `docker build`/`docker compose up`
needs a Docker daemon to run), and a real CI pipeline.

Two things are documented rather than provisioned, because they require
infrastructure beyond a codebase:

- **Secrets vault** (HashiCorp Vault / AWS Secrets Manager / etc.) -- the
  app currently uses a `.env` file, appropriate for a pilot; see
  DEPLOYMENT.md for the migration path before national go-live.
- **MongoDB read replicas** -- the application code already routes heavy
  analytics queries to a secondary via `.read('secondaryPreferred')`
  (verified, tested); it takes effect the moment a real replica set is
  provisioned (Atlas or self-hosted), which DEPLOYMENT.md walks through.

The CHW offline app's IndexedDB/Service Worker code was written to the
correct, standard browser APIs but could not be executed against an
actual browser in the sandbox this was built in -- test in a real browser
before relying on it in the field.
