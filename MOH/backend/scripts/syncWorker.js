/**
 * Run this as its own long-lived process at each facility deployment
 * (pm2/systemd/docker), separate from the API server:
 *
 *   node scripts/syncWorker.js
 *
 * Requires these env vars (in addition to MONGO_URI):
 *   MOH_CENTRAL_SYNC_URL     - base URL of the central MoH API
 *   SYNC_FACILITY_ID         - this facility's _id in the Facility collection
 *   SYNC_FACILITY_API_KEY    - the plaintext key issued once at onboarding
 *   SYNC_INTERVAL_MS         - optional, defaults to 30000 (30s)
 */
require('dotenv').config();
const connectDB = require('../config/db');
const { processQueue } = require('../services/syncService');

const INTERVAL_MS = parseInt(process.env.SYNC_INTERVAL_MS, 10) || 30000;
let running = false;

async function tick() {
  if (running) return; // don't overlap passes if one is still in flight (e.g. slow network)
  running = true;
  try {
    const result = await processQueue({ batchSize: 50 });
    if (result.claimed > 0) {
      console.log(
        `[sync] claimed=${result.claimed} synced=${result.synced} failed=${result.failed}${
          result.error ? ` error="${result.error}"` : ''
        }`
      );
    }
  } catch (err) {
    console.error('[sync] Worker pass failed:', err.message);
  } finally {
    running = false;
  }
}

connectDB()
  .then(() => {
    console.log(`[sync] Worker started, polling every ${INTERVAL_MS}ms`);
    tick(); // run immediately on start, then on interval
    setInterval(tick, INTERVAL_MS);
  })
  .catch((err) => {
    console.error('[sync] Failed to connect to database:', err.message);
    process.exit(1);
  });
