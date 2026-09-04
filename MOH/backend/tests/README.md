# Tests

Two tiers, run separately on purpose:

## `npm test` — unit tests (`tests/unit/`)

Pure logic only: encryption round-trips and tamper detection, TOTP
generation/verification, backup codes, name-similarity matching. No
database, no network. These always run, everywhere, including in a locked-
down CI sandbox with no outbound internet access.

## `npm run test:integration` — integration tests (`tests/integration/`)

Exercise real routes against a real (in-memory) MongoDB via
[`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server)
and `supertest`, hitting `app.js` directly (no `.listen()`, no real port).

**These need outbound network access to `https://fastdl.mongodb.org`** the
first time they run, to download a MongoDB binary (cached afterward under
`~/.cache/mongodb-binaries`, so subsequent runs are offline). If your CI
runner or sandbox blocks that domain, you have three options:

1. Allow the domain in your network policy — simplest, works everywhere.
2. Pre-seed the binary cache as a build step on a machine that does have
   access, then bake that cache directory into your CI image.
3. Point `MONGOMS_DOWNLOAD_URL` at an internal mirror — see
   `mongodb-memory-server`'s own docs for the full list of `MONGOMS_*` env
   vars.

`npm run test:all` runs both tiers.

## Writing new tests

- Pure functions (no DB, no HTTP) → `tests/unit/`.
- Anything that touches a Mongoose model or an Express route → `tests/integration/`, using the `startTestDb`/`stopTestDb`/`clearTestDb` helpers in `tests/testDb.js` and importing `require('../../app')` (never `server.js` — that one has real side effects: connects to `MONGO_URI` and calls `.listen()`).

## Input validation

Every write route across the backend now validates its request body/query/
params with Zod before touching a model — see `middleware/validate.js` and
the schema files under `validation/`. This replaced ad-hoc
`if (!field) return res.status(400)...` checks that only ever caught
"missing", never "wrong shape" (a bad date, a malformed ObjectId, an
out-of-range vital sign). If you add a new write route, add its schema
alongside the existing ones in `validation/` and wire it in with
`validate({ body, query, params })` — don't hand-roll checks in the route
itself.

