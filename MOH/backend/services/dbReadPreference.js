/**
 * READ-REPLICA ROUTING
 * -----------------------------------------------------------------------
 * 'secondaryPreferred' tells the MongoDB driver to route a query to a
 * replica set secondary when one is available, falling back to the
 * primary otherwise — exactly what a heavy, slightly-stale-tolerant
 * analytics query (a national dashboard rollup, a donor report) needs, so
 * it never contends with a clinician's real-time patient-record read/write
 * on the primary.
 *
 * IMPORTANT — what this does and doesn't do on its own: this setting is a
 * no-op against a standalone (non-replica-set) MongoDB — there's no
 * secondary to route to, so the query just runs against the only node
 * that exists, identically to before. It only takes effect once deployed
 * against a real replica set (see DEPLOYMENT.md's "Read replicas"
 * section for how to provision one). Applying `.read()` here now, rather
 * than waiting until a replica set exists, means the moment one IS
 * provisioned this separation is already live — no code changes needed
 * at that point, only infrastructure.
 *
 * Applied selectively to genuinely heavy, read-only, staleness-tolerant
 * queries (report generation, MoH-level dashboard rollups) — NOT to
 * anything in a clinician's real-time patient-care path, where reading
 * from a secondary that's lagged by even a few seconds could mean acting
 * on stale data (e.g. missing a just-recorded allergy).
 */
const ANALYTICS_READ_PREFERENCE = 'secondaryPreferred';

module.exports = { ANALYTICS_READ_PREFERENCE };
