# MOH digital health and inventory platform — Backend Foundation

This is the first layer of the system: **auth, roles, facility scoping, and the
immutable hash-chained audit log**. Everything else (patients, inventory, sync)
builds on top of this.

## Setup

```bash
cp .env.example .env
# edit .env — set MONGO_URI, JWT secrets, and bootstrap super admin credentials
npm install
npm run seed:superadmin   # one-time: creates the first MoH super admin
npm run dev
```

## Hierarchy implemented

- **moh_super_admin** — onboards facilities (`POST /api/auth/facilities`, which
  creates the facility AND its first facility_admin in one call), and is the
  only role that can reset a facility_admin's credentials.
- **facility_admin** — registers doctors/staff, resets *their* credentials,
  suspends/reactivates them. Cannot touch another facility_admin's account.
- **doctor / pharmacist / nurse / store_officer** — scoped to their own
  facility, no self-service password reset by design (only their admin can
  reset them).

## Audit log

`services/auditService.js` is the **only** code path allowed to write to
`AuditLog`. Every entry is chained: `hash = sha256(prevHash + entryData)`.
The `AuditLog` schema also rejects any `update`/`delete` at the Mongoose
middleware level as a second line of defense.

**Critical step not yet done in code — do this in your MongoDB deployment:**
create a DB user for this app with `insert` + `find` only on the `auditlogs`
and `auditchainstates` collections (no `update`/`remove`). Mongoose-level
protection can be bypassed by a script talking to Mongo directly; DB-level
role restriction can't. This is a MongoDB role/connection-string concern, not
application code — set it up in your deployment (e.g., `db.createRole` /
`db.createUser` restricted to those collections) before this goes anywhere
near production data.

Run `auditService.verifyChain()` periodically (e.g. a nightly cron/job) to
detect tampering — it recomputes every hash and flags the exact sequence
number where the chain breaks, if any.

## Endpoints

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/login` | anyone with credentials |
| POST | `/api/auth/refresh` | anyone with a valid refresh token |
| POST | `/api/auth/change-password` | authenticated self |
| POST | `/api/auth/facilities` | moh_super_admin |
| POST | `/api/auth/facility-admins/:userId/reset-credentials` | moh_super_admin |
| POST | `/api/auth/facility/:facilityId/staff` | facility_admin (own facility) |
| POST | `/api/auth/facility/:facilityId/staff/:userId/reset-credentials` | facility_admin (own facility) |
| POST | `/api/auth/facility/:facilityId/staff/:userId/status` | facility_admin (own facility) |

## Not yet built (next steps)

- Break-glass emergency access is modeled (`Encounter.emergencyOverride`,
  `patients/:id?emergencyJustification=`) but there's no post-hoc review
  workflow for someone at MoH/facility level to audit those overrides yet
- Rate limiting is in place on `/login` only — extend to other sensitive
  endpoints as they're added
- Allergy checking in `medicalHistory.js` does a plain substring match on
  drug name vs. recorded allergy substance — `InventoryItem.drugClass` now
  exists as groundwork for class-based checking (e.g. all penicillins) but
  the allergy-check function hasn't been wired to use it yet
- Patient dedup (`deduplicationService.js`) surfaces candidates only — no
  merge endpoint exists yet, by design (merging is flagged as needing to stay
  manual and high-privilege, not something to build casually)
- Low-stock and expiry *notifications* — the data exists and is queryable
  but nothing pushes a proactive alert yet
- **MoH-facing aggregation on top of `SyncEvent`** — the central ingestion
  endpoint durably and idempotently stores incoming events, but nothing yet
  rolls them up into the surveillance/dashboard views described earlier
  (disease heat maps, facility performance, stock network view). That's a
  read-side concern layered on `SyncEvent`, deliberately kept separate from
  the ingestion endpoint itself.
- Sync currently carries audit-derived events only (see the design note in
  `models/SyncQueue.js`) — not full clinical document replication. If a
  requirement emerges that genuinely needs full-record sync (e.g. a
  transferred patient's complete chart arriving at the receiving facility
  before they arrive), that's a separate, deliberate path to design, not an
  extension of this one.

## What's new in this layer (facility-to-MoH sync)

- **`SyncQueue`** (local, per facility) — an outbox of audit-derived events
  pending push to the central cluster. Populated automatically:
  `auditService.record()` enqueues a sync entry for every facility-scoped
  audit write, so no route code had to be touched to wire this in — the
  same call sites already logging to the audit trail now also queue for sync,
  for free.
- **`SyncEvent`** (central) — the idempotent landing zone. Unique index on
  `(facilityId, sourceAuditSequence)` means a retried push after a dropped
  connection can never double-apply.
- **`services/syncService.js`** — `processQueue()` claims a batch of pending
  events (atomic per-document claim, safe against overlapping worker runs),
  pushes them to `POST /api/sync/ingest`, and marks synced/failed based on
  the response. `getQueueStatus()` backs the "pending sync queue" admin
  dashboard widget described earlier.
- **`scripts/syncWorker.js`** — a standalone long-running process (not part
  of the API server) meant to run at each facility deployment, polling on an
  interval. Needs its own env config (`MOH_CENTRAL_SYNC_URL`,
  `SYNC_FACILITY_ID`, `SYNC_FACILITY_API_KEY`).
- **Facility sync API keys** — generated once at facility onboarding
  (`POST /api/auth/facilities` now also returns a one-time `syncApiKey`),
  stored only as a bcrypt hash on the `Facility` document, checked by
  `middleware/facilityApiKey.js` on the central ingestion endpoint. This is
  a separate auth path from user JWTs by design — it authenticates a
  facility's worker process, not a logged-in person.

### Deployment model this implies

This same codebase runs in two roles depending on where it's deployed:
- **At a facility**: normal API server + `npm run sync:worker` running
  alongside it, pointed at the central MoH URL.
- **At the central MoH cluster**: same API server, but only
  `/api/sync/ingest` and `/api/sync/facility/:id/status` are relevant to
  sync; the rest of the API (patients, encounters, etc.) would typically be
  disabled or unused there, since clinical work happens at facilities. This
  single-codebase-two-roles approach avoids maintaining two separate
  services for now — splitting them later if central and facility needs
  diverge further is a reasonable future refactor, not a problem to solve
  preemptively.


## What's new in this layer (inventory)

- `InventoryItem` — the catalog (drugs/supplies/equipment), with
  `drugClass` as groundwork for real allergy-class checking later
- `StockBatch` — the actual source of truth for stock, per facility/item/lot,
  with expiry. Deliberately NOT a separate cached "current stock" collection
  — see the design note at the top of `models/StockBatch.js` for why a cache
  here would be a correctness bug waiting to happen
- `StockTransaction` — an immutable, insert-only ledger (receipt / dispense /
  transfer_out / transfer_in / wastage / expiry_writeoff), same
  no-update-no-delete enforcement pattern as `AuditLog`
- `TransferRequest` — inter-facility transfer with a real approval flow: the
  *source* facility's admin approves, which atomically deducts their stock
  and creates a linked incoming batch at the destination
- `services/inventoryService.js` — FEFO (first-expiry-first-out) stock
  deduction with race-safe atomic per-batch decrements (same optimistic-lock
  pattern as the audit chain), used by both dispense and transfer approval
  so the concurrency logic isn't duplicated
- Prescription → dispense loop is closed:
  `POST /api/inventory/facility/:facilityId/dispense/prescription/:medicalHistoryId`
  deducts real stock and flips the prescription's `dispenseStatus`


## What's new in this layer

- `Patient` — tiered identity (`verified` / `provisional` / `newborn`),
  MRN as the real cross-system identifier (not nationalId), death
  registration, consent flags, and a `possibleDuplicates` array that
  dedup candidates land in for human review
- `Encounter` — visit/admission anchor, vitals, diagnosis (auto-flags
  notifiable diseases by keyword match — crude but functional), referral,
  discharge
- `MedicalHistory` — prescriptions (with allergy-conflict blocking unless
  explicitly overridden with justification), procedures, and an amendment
  chain (`amendsEntryId`/`supersededBy`) instead of silent edits
- `LabResult` — order → result flow, notifiable-disease and critical-result
  flagging, same amendment pattern as MedicalHistory
- `services/deduplicationService.js` — Levenshtein-based fuzzy name matching
  + DOB/phone signals, scores candidates, never auto-merges
- `services/mrnService.js` — atomic, collision-safe MRN generation
- Every patient record VIEW is individually audit-logged, not just edits —
  this is what the anomaly-detection feature discussed earlier would query
  against later


## Note on testing

This sandbox has no MongoDB instance reachable (network egress is restricted
to package registries), so this hasn't been run end-to-end against a real
database — only syntax-checked and the hash-chain math verified standalone.
Run it against a real MongoDB instance (local or Atlas) before trusting it;
flag anything that breaks and I'll fix it directly.
