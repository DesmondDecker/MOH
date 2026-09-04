const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const encounterRoutes = require('./routes/encounters');
const medicalHistoryRoutes = require('./routes/medicalHistory');
const labResultRoutes = require('./routes/labResults');
const inventoryRoutes = require('./routes/inventory');
const transferRoutes = require('./routes/transfers');
const syncRoutes = require('./routes/sync');
const mohRoutes = require('./routes/moh');
const auditRoutes = require('./routes/audit');
const referenceRoutes = require('./routes/reference');
const bloodBankRoutes = require('./routes/bloodBank');
const mchRoutes = require('./routes/mch');
const fhirRoutes = require('./routes/fhir');
const coldChainRoutes = require('./routes/coldChain');
const reportRoutes = require('./routes/reports');
const chwRoutes = require('./routes/chw');

/**
 * Deliberately separated from server.js: this module builds the Express
 * app and nothing else — no DB connection, no http.createServer, no
 * socket.io init, no .listen(). Those are all real network/process side
 * effects that must NOT happen just because something `require`s the app
 * (which is exactly what an integration test does via supertest). Import
 * this file directly in tests; import server.js only to actually run the
 * process.
 */
function createApp() {
  const app = express();
  const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

  app.use(helmet());
  app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/encounters', encounterRoutes);
  app.use('/api/medical-history', medicalHistoryRoutes);
  app.use('/api/lab-results', labResultRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/transfers', transferRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/moh', mohRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/reference', referenceRoutes);
  app.use('/api/blood-bank', bloodBankRoutes);
  app.use('/api/mch', mchRoutes);
  app.use('/api/fhir', fhirRoutes);
  app.use('/api/cold-chain', coldChainRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/chw', chwRoutes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralized error handler — never leak stack traces in production
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    const status = err.status || 500;
    res.status(status).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  });

  return app;
}

module.exports = createApp;
