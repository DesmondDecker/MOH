# MOH digital health and inventory platform — Frontend

React + Vite + Tailwind v4. Two of three planned dashboards built so far.

## Setup

```bash
cp .env.example .env
# edit VITE_API_BASE_URL to point at your running moh-backend instance
npm install
npm run dev
```

Requires the backend (`moh-backend`) running and reachable at
`VITE_API_BASE_URL`.

## Design system

Tokens live in `src/index.css` as a Tailwind v4 `@theme` block — no
`tailwind.config.js`, this is the CSS-first config Tailwind v4 uses.

- **Color**: `teal` (primary), `canvas`/`canvas-raised` (warm parchment
  background, not stark white), `clay` (warning/threshold), `signal`
  (critical), `moss` (success/active) — each name is what it *means* in
  this system, not a generic scale position.
- **Type**: Fraunces (display, used only for page/section titles), Inter
  (body/UI), IBM Plex Mono (structured data — quantities, usernames,
  timestamps, MRNs).
- **Signature element**: `VitalsStrip` in the topbar — sync health and
  stock-alert counts rendered like a patient monitor readout (mono
  numerals, a pulsing status dot when something needs attention).

## What's built

**Facility Admin Dashboard** (`/`, `/staff`, `/inventory`, `/expiring`)
- Overview — stock-below-threshold, expiring-soon, and sync status at a glance
- Staff — roster, register new staff (shows the one-time temp password),
  reset credentials, suspend/reactivate
- Inventory — stock levels table with threshold highlighting, a stock
  receipt form
- Expiring stock — filterable (30/60/90 day) expiry list

**Clinical Dashboard** (`/clinical`, doctors/nurses)
- Today's queue — open encounters at the facility, oldest-waiting first,
  flags patients with recorded allergies before you even open the chart
- Find / register patient — fuzzy search by name/MRN/national ID/phone;
  registration surfaces duplicate candidates immediately after save
- Patient record — demographics, allergy and chronic-condition pills,
  weight/BP sparklines (dependency-free inline SVG, not a charting
  library) built from encounter vitals history, tabbed: Encounter /
  Medications / Labs / History
- Open-encounter workflow: start with vitals, add diagnosis (auto-flags
  notifiable-disease keywords), discharge
- Prescribing: the allergy-conflict flow is real, not decorative — the
  backend returns 409 with conflict detail, the form shows it and
  requires a typed justification before resubmitting with an explicit
  override. There is no way to silently bypass a flagged allergy here.
- Labs: order a test, enter results inline, abnormal/critical flagged

## Backend gaps found and fixed while building this

Building against the real API surfaced real backend gaps, fixed in
`moh-backend` directly rather than routed around in the frontend:
- No endpoint existed to list a facility's staff roster — added
  `GET /api/auth/facility/:facilityId/staff`
- No endpoint existed for "open encounters at my facility" (the queue) —
  added `GET /api/encounters/facility/:facilityId/active`
- The prescription-creation endpoint accepted `drugName` but never stored
  `inventoryItemId` — meaning the dispense endpoint built in the inventory
  layer could never actually be reached from a real prescription. Fixed so
  prescribing now records the catalog item link.

## Not yet built

- Bulk staff CSV onboarding
- Real-time updates (WebSocket-driven vitals refresh) — `VitalsStrip`
  currently polls every 60s
- Offline-capable clinical view with a "last synced" indicator — flagged
  as high-value earlier, not implemented; the app currently assumes a live
  connection to the backend
- Break-glass emergency access UI — backend supports it
  (`?emergencyJustification=`) but there's no UI affordance for it yet
- Discharge summary / referral letter PDF export
- Geographic map view for facilities — `FacilitiesPage` groups by district
  in a table instead; a real map (react-leaflet, using `Facility.location`)
  is the natural upgrade once every facility has coordinates recorded
- Predictive stockout forecasting — the national inventory view shows
  current levels, not a trend-based projection
- Partial dispense — the dispense UI sends a quantity, but the backend
  (unchanged, see its own comment) marks a prescription fully `dispensed`
  on any dispense call rather than tracking partial fulfillment

## Pharmacy Dashboard

- **Dispense queue** — pending prescriptions across the facility, oldest
  first, with patient info and prescriber joined in; flags prescriptions
  with an allergy override so the pharmacist sees that context before
  dispensing
- **Inventory** — reuses the Facility Admin dashboard's `InventoryPage`
  directly rather than duplicating it; the component only depends on the
  logged-in user's facility, not their role, so sharing it was the honest
  choice over a copy-paste fork

### Backend gap found and fixed while building this

- No endpoint existed to list pending prescriptions *across* a facility —
  only per-patient. Added
  `GET /api/medical-history/facility/:facilityId/pending-prescriptions`,
  scoped with the same `requireSameFacility` guard used everywhere else
  (caught and fixed before shipping — it was missing on the first pass).

## Transfers (Facility Admin Dashboard)

- Request stock from another facility (facility picker, item, quantity, reason)
- **Outgoing** section — requests made *of* your facility as the source;
  approve (atomically fulfills via the backend's FEFO deduction) or reject
  with a reason
- **Incoming** section — your own outbound requests, view-only, status
  tracked through pending → fulfilled/rejected

### Backend gap found and fixed while building this

- No endpoint existed for a facility admin to browse *other* facilities —
  needed to pick a source facility for a transfer request. Added
  `GET /api/auth/facilities/directory` (facility_admin + moh_super_admin),
  deliberately scoped to non-sensitive fields only (name/code/district/type
  — no sync keys, no admin details).

## MoH Command Center

- **Facilities** — district-grouped summary (patient counts, open
  encounters, stock alerts, sync health) plus national totals
- **Surveillance** — notifiable-disease diagnoses by district and disease,
  with a proportional-bar "heat" indicator (built from plain divs, not a
  charting library — two dependencies for one visual felt like the wrong
  trade)
- **National inventory** — pick an item, see every facility's stock for it,
  sorted lowest-first so a transfer candidate is obvious at a glance
- **Anomalies** — high-volume record viewers (flat threshold, explicitly
  flagged as a first pass, not a calibrated per-user baseline) and every
  emergency-override access with its justification

### Backend gaps found and fixed while building this

- No MoH-level aggregation endpoints existed at all — added
  `routes/moh.js` (`/api/moh/facilities/summary`,
  `/api/moh/surveillance/notifiable-diseases`, `/api/moh/inventory/national`,
  `/api/moh/audit/anomalies`), all `moh_super_admin`-only.
- **Architectural assumption made explicit**: these endpoints query the
  shared clinical/inventory collections directly, on the assumption this
  runs as one shared MongoDB cluster with facility-scoped access — the
  realistic deployment for a national system at this scale — rather than
  fully separate databases per facility. If that assumption ever changes,
  these endpoints need rebuilding on top of `SyncEvent` instead, since a
  central node with a genuinely separate DB per facility would only have
  audit-derived events to work with. Said plainly rather than silently
  picked and left for someone to discover later.
- `ProtectedRoute`'s role-to-home map sent `moh_super_admin` to `/`, which
  is facility-admin-only — the same infinite-redirect bug from the
  Clinical Dashboard pass, this time for a different role. Fixed before it
  shipped.
- Caught a Tailwind pitfall in `FacilitiesPage`: building class names via
  string interpolation (`` `text-${tone}` ``) doesn't work because Tailwind
  scans for literal class strings at build time — dynamic construction
  silently produces unstyled output. Rewrote to use literal class names
  per branch and verified the compiled CSS actually contains them.

## Honest testing note

`npm run build` completes cleanly (all imports resolve, JSX/Tailwind
compile with no errors or warnings) — that's real verification, not a
claim. I do **not** have a way to render this in a browser and take a
screenshot in this sandbox (no headless browser available, and a
background dev server process didn't survive between tool calls here), so
the actual visual result — spacing, alignment, whether the design reads
the way it's described above — is unverified. Run `npm run dev` and look
at it yourself before assuming it's polished; tell me what's off and I'll
fix it directly.
