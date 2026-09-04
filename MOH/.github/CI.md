# CI/CD

`.github/workflows/ci.yml` runs on every push and PR to `main`:

| Job | What it checks | Needs network? |
|---|---|---|
| `secret-scan` | scans full commit history for credential-shaped strings (gitleaks) — this is exactly the check that would have caught the live MongoDB connection string this repo previously had committed to `.env.example` | Yes — pulls the gitleaks action |
| `backend` | lint (`oxlint`), unit tests (`tests/unit/`), `npm audit` | No |
| `backend-integration` | integration tests (`tests/integration/`) against a real in-memory MongoDB | Yes — downloads a MongoDB binary on first run (cached after) |
| `frontend` | lint (`oxlint`), production build, `npm audit` | No |
| `docker-build` | both Dockerfiles actually build successfully — catches a broken `.dockerignore`, missing build ARG, or an alpine-incompatible dependency before it merges | Yes — pulls base images |

## This is a gate, not a notification

A workflow file alone does **not** block a bad merge — GitHub still lets a
PR merge with a red CI run unless you turn on branch protection. To
actually enforce this:

1. Repo **Settings → Branches → Add branch protection rule** for `main`.
2. Enable **"Require status checks to pass before merging"**.
3. Select the three job names above (`backend`, `backend-integration`,
   `frontend`) as required checks.
4. Optionally also require a PR review before merge.

Until that's configured, this workflow only gives you visibility (a red
X on the PR), not enforcement.

## `npm audit` is currently informational, not blocking

Both jobs run `npm audit --audit-level=high` with `continue-on-error: true`
— it reports high/critical vulnerabilities in the PR's checks tab but
won't fail the build yet. This is deliberate: flip it to blocking (drop
`continue-on-error`) once you've confirmed today's dependency tree has a
clean baseline (it does, as of this writing — `0 vulnerabilities` on both
sides), so a newly-introduced vulnerability fails the build rather than an
existing one blocking every future PR unrelated to it.

## What this pipeline does NOT do yet

- No automated deployment step (build artifacts aren't pushed anywhere) —
  add a `deploy` job once there's a real hosting target to deploy to.
- No E2E/browser tests — only unit + integration + a production build
  check.
