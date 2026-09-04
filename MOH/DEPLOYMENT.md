# Deployment

## Quick start (single machine / pilot facility)

```bash
cp backend/.env.example backend/.env
# edit backend/.env — fill in every REPLACE_WITH_... value, see "Secrets" below

docker compose up --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:5000
- MongoDB: not exposed to the host — only reachable from `backend` on the compose network

This setup is intentionally simple: **one docker-compose file, one host**,
appropriate for a single facility pilot or a national instance that hasn't
yet outgrown one machine. It is NOT a national-scale production topology —
see "Beyond a single machine" below for what changes at that point.

## Secrets

`backend/.env` is where all real secrets live for this deployment shape. It
is gitignored (see `.gitignore`) and must never be committed — this repo
already had one real leak (a live MongoDB Atlas password committed to
`.env.example`, since fixed and rotated) and the CI pipeline's
`secret-scan` job now exists specifically to catch a repeat of that
automatically.

**This is NOT a secrets vault.** A flat `.env` file on a single host is an
acceptable starting point for a pilot, but every one of these has a real
weakness a proper vault (HashiCorp Vault, AWS Secrets Manager, Azure Key
Vault, GCP Secret Manager) solves:

| Weakness of `.env` | What a vault gives you instead |
|---|---|
| Plaintext on disk, readable by anyone with host access | Encrypted at rest, access-controlled per secret |
| No audit trail of who read which secret when | Every read is logged |
| Rotating a key means editing a file and restarting every service by hand | Centralized rotation, often with zero-downtime secret versioning |
| Same secret value across every environment unless someone's careful | Per-environment secrets are the default, not an afterthought |
| No automatic expiry — a leaked key is a leaked key forever | Short-lived, auto-expiring credentials for things like DB access |

**When to actually move to a vault**: once this system handles more than
one facility's worth of real patient data, or once more than a couple of
people need `backend/.env`'s contents to do their job (at which point a
flat file is already becoming a "who has this file" administration
problem). For a national MoH deployment, this should happen before go-live,
not after.

**Migration path** (once you provision one): most of these vaults offer an
"agent" or "CSI driver" pattern that renders secrets into environment
variables or a file just before the app starts — `backend/server.js`
already just reads from `process.env`, so the application code needs zero
changes; only how `backend/.env` gets populated changes (from a
hand-edited file to something the vault agent writes at container start).

## The encryption keys are secrets, not application config

`ENCRYPTION_KEYS`, `BLIND_INDEX_KEY`, and the three `JWT_*_SECRET` values in
`backend/.env.example` deserve special handling even within a "just use
.env for now" setup — they're not the same category of secret as, say, an
SMS provider API key:

- **Losing `ENCRYPTION_KEYS` is unrecoverable data loss.** Every encrypted
  PII/PHI field (see `backend/services/encryptionService.js`) becomes
  permanently unreadable if the key is lost — there is no "forgot
  password" flow for this. Back it up somewhere independent of the
  database itself (a lost key alongside an intact database is still total
  loss), and treat that backup with at least as much care as the database
  backup itself.
- **Rotating `ENCRYPTION_KEYS` requires a migration pass**, not just an env
  var edit — see the key-versioning design in `encryptionService.js`. Add
  the new version alongside the old ones, flip
  `ENCRYPTION_ACTIVE_KEY_VERSION`, then re-save existing records to
  re-encrypt them onto the new key (a rotation script is a natural next
  addition once this is running against a real database to test against).
- **`BLIND_INDEX_KEY` rotating is more disruptive than it looks**: every
  existing blind index (used for exact-match patient search/dedup) becomes
  unmatchable against newly-computed ones until every record is re-indexed
  — treat it as long-lived and rotate rarely, deliberately, with a planned
  re-index pass, not casually.

## Read replicas

Code-level support for read-replica routing is already live in the
codebase — `services/dbReadPreference.js` and its use in
`routes/moh.js` and `constants/reportMetrics.js` — so heavy MoH-level
dashboard rollups and report generation ask MongoDB's driver to prefer a
replica set secondary, leaving the primary free for clinicians' real-time
patient-record reads/writes. **This setting is inert until a real replica
set exists** — against the single-node MongoDB in `docker-compose.yml`
there's no secondary to route to, so it's a no-op today. What follows is
how to actually provision one; the moment you do, the routing already in
the code takes effect with no further changes needed.

### Provisioning a 3-node replica set

A production MongoDB deployment for this system should run as a replica
set (3 nodes minimum: 1 primary + 2 secondaries, or 1 primary + 1
secondary + 1 arbiter for a lower-cost setup), not the single standalone
container this repo's `docker-compose.yml` uses for pilot/single-machine
deployments. Two realistic paths:

**Managed (recommended for a real national deployment):** MongoDB Atlas
provisions a replica set (3 nodes minimum) automatically on every paid
tier — no manual `rs.initiate()` or node management. Point `MONGO_URI` at
the Atlas connection string, which already encodes multiple host
addresses for the driver to discover the full replica set topology from.
This is the lower-operational-burden option and what most teams should
default to.

**Self-hosted**, if Atlas isn't an option (e.g. strict data-residency
requirements): run 3 `mongod` instances (can be 3 containers on one host
for a modest deployment, or 3 separate hosts for real fault tolerance),
initialize the replica set once via `mongosh`:

```js
rs.initiate({
  _id: "moh-rs",
  members: [
    { _id: 0, host: "mongo1:27017" },
    { _id: 1, host: "mongo2:27017" },
    { _id: 2, host: "mongo3:27017" },
  ]
})
```

then point `MONGO_URI` at all three hosts with the replica set name:

```
MONGO_URI=mongodb://mongo1:27017,mongo2:27017,mongo3:27017/moh_registry?replicaSet=moh-rs
```

The Mongoose driver auto-discovers which node is currently primary from
this seed list — it doesn't need to be told explicitly, and it re-detects
automatically after a failover.

### What's deliberately NOT routed to a secondary

`.read(ANALYTICS_READ_PREFERENCE)` is applied narrowly — the MoH-level
dashboard rollups (`routes/moh.js`) and report generation
(`constants/reportMetrics.js`) — and deliberately NOT applied to anything
in a clinician's real-time patient-care path (patient lookup, encounter
creation, prescribing, lab results). Replica set secondaries can lag the
primary by anywhere from milliseconds to, under load or network issues,
several seconds; that's an acceptable trade-off for "how many notifiable
disease cases this month" but not for "does this patient have a recorded
allergy" at the moment of prescribing. If you add new heavy analytics
queries, apply `.read(ANALYTICS_READ_PREFERENCE)` to them too — see
`services/dbReadPreference.js` for the full reasoning; don't apply it
to anything a clinician's immediate care decision depends on.

## Beyond a single machine

Genuinely national-scale infrastructure needs more than this compose file
provides, and is a separate, larger effort:

- **Managed MongoDB** (Atlas, DocumentDB, or a self-hosted replica set) instead of the single `mongo` container here — see "Read replicas" above for exactly how to provision one and confirm the code-level routing that's already in place takes effect.
- **A real TLS termination point** (a load balancer or reverse proxy with a real certificate) — this compose file serves plain HTTP on purpose, since TLS termination and certificate management belong to whatever's in front of it at deployment (cloud LB, Caddy, nginx-with-certbot, etc.), not baked into the app containers themselves.
- **A container orchestrator** (ECS, Kubernetes, Nomad) once there's more than one facility's worth of load, for rolling deploys, auto-restart, and horizontal scaling of the backend behind a load balancer.
- **The vault described above**, provisioned before go-live.
